const { COMMUNICATION_RESULTS } = require('../../domain/constants');
const { parseGreenApiWebhook, isAudioMessage, normalizePhone } = require('./messageParser');
const { findDirection } = require('./knowledgeBase');
const { createProjectAdapter } = require('./projectAdapter');
const { extractClientProfile, profileSummary, humanProfileValue } = require('./profileExtractor');
const { AiConsultantCrmTools } = require('./crmTools');
const { humanDelayMs } = require('./responseFormatter');
const { paymentCheckMessage } = require('./reminderTemplates');
const { INTENTS, classifyIntent } = require('./intentRouter');
const { createReminderTask } = require('./reminderPlanner');
const { KnowledgeLoader } = require('./knowledgeLoader');
const { TrialSlotProvider } = require('./slotProvider');
const { findLastOfferedSlot, createTrialBookingRequest } = require('./bookingManager');
const { hasOptedOut, markOptOut } = require('./consentManager');
const { AudioProcessor } = require('./audioProcessor');
const { logAiAction } = require('./actionLogger');
const { isHumanHandoffActive, activateHumanHandoff, releaseHumanHandoff } = require('./handoffManager');
const { aiConsultantAnalytics } = require('./analytics');
const { dispatchDueReminders } = require('./reminderDispatcher');
const { isDuplicateMessage, markMessageSeen } = require('./dedupeManager');
const { workingHoursState, nightReply } = require('./workingHours');
const { withRetry } = require('./retry');
const { auditAiConsultantContent } = require('./contentAudit');
const { buildConversationMemory, mergeProfiles } = require('./conversationMemory');
const { ensureTrialNextAction } = require('./qualification');
const { AI_LEAD_STATUSES, updateAiLeadStatus, profileAiStatus } = require('./leadStatus');
const { syncAiLeadProfile } = require('./leadProfile');
const { loadRuntimeMode } = require('./runtimeMode');
const { PromptPack } = require('./promptPack');
const { OpenAiCompatibleLlmAdapter } = require('./llmAdapter');
const { AiCore } = require('./aiCore');
const { executeAiActions } = require('./actionExecutor');
const { llmFallbackDecision } = require('./fallbackPolicy');
const { syncConversationState } = require('./conversationState');
const { loadChannelPolicy, prepareOutboundMessages } = require('./channelPolicy');

class AiConsultantService {
  constructor({ crm, greenApiClient, env = process.env, llmAdapter = null, promptPack = null, projectAdapter = null }) {
    this.crm = crm;
    this.projectAdapter = projectAdapter || createProjectAdapter(env);
    this.projectConfig = this.projectAdapter.config;
    this.crmTools = new AiConsultantCrmTools(crm, { projectConfig: this.projectConfig });
    this.greenApiClient = greenApiClient;
    this.env = env;
    this.knowledge = new KnowledgeLoader({ dir: this.projectAdapter.paths.knowledgeDir });
    this.slots = new TrialSlotProvider({ file: this.projectAdapter.paths.trialSlotsFile });
    this.audio = new AudioProcessor({ env });
    this.enabled = String(env.AI_CONSULTANT_ENABLED || 'true') !== 'false';
    this.runtime = loadRuntimeMode(env);
    this.channelPolicy = loadChannelPolicy(env);
    this.promptPack = promptPack || new PromptPack({
      projectDir: this.projectAdapter.paths.projectPromptDir,
    });
    this.llmAdapter = llmAdapter || new OpenAiCompatibleLlmAdapter(env);
    this.aiCore = new AiCore({
      promptPack: this.promptPack,
      llmAdapter: this.llmAdapter,
      projectConfig: this.projectConfig,
    });
  }

  async health() {
    return {
      enabled: this.enabled,
      greenApiConfigured: Boolean(this.greenApiClient?.enabled),
      school: this.projectConfig.schoolName,
      project: this.projectConfig.id,
      projectAdapter: this.projectAdapter.summary(),
      mode: this.runtime.mode,
      llmEnabled: this.runtime.llmEnabled,
      rulesOnly: this.runtime.rulesOnly,
      paidAiRequired: this.runtime.paidAiRequired,
      channelPolicy: this.channelPolicy,
      llmConfigured: this.aiCore.available(),
      promptDocuments: this.promptPack.listPrompts().length,
      corePromptDocuments: this.promptPack.listCorePrompts().length,
      projectPromptDocuments: this.promptPack.listProjectPrompts().length,
      knowledgeDocuments: this.knowledge.listDocuments().length,
      trialSlots: this.slots.listAvailable(null, 10).length,
    };
  }

  async processGreenApiWebhook(payload) {
    const message = parseGreenApiWebhook(payload);
    if (!this.enabled) return { accepted: false, reason: 'AI consultant is disabled', message };
    if (message.isOutgoing) return { accepted: true, ignored: true, reason: 'outgoing message', message };
    if (!message.chatId || !message.phone) return { accepted: false, reason: 'No chatId or phone in webhook', message };
    if (await isDuplicateMessage(this.crm, message)) {
      return { accepted: true, ignored: true, reason: 'duplicate message', message };
    }
    await markMessageSeen(this.crm, message);

    const lead = await this.crmTools.findOrCreateWhatsAppLead(message);
    const audioResult = isAudioMessage(message) ? await this.audio.transcribe(message) : null;
    const incomingText = audioResult?.transcript || this.messageText(message);
    if (audioResult?.transcript) message.transcript = audioResult.transcript;
    const currentProfile = await this.saveClientProfile(lead, incomingText);
    await this.crmTools.addWhatsAppCommunication(lead, incomingText, this.communicationResult(incomingText), message.receivedAt);
    const memory = await buildConversationMemory({
      crmTools: this.crmTools,
      lead,
      projectConfig: this.projectConfig,
    });
    const profile = mergeProfiles(memory.profile, currentProfile);
    if (Object.keys(profile || {}).length) {
      await syncAiLeadProfile(this.crmTools, lead, profile);
    }

    const action = await this.decideAction(message, lead, profile, audioResult);
    await this.applyWorkingHours(action, lead, message);
    const conversationState = await syncConversationState({
      crmTools: this.crmTools,
      lead,
      profile,
      action,
    });
    await this.crmTools.addLeadNote(lead, action.noteType || 'ai_consultant', action.note);

    const delivery = await this.deliver(message.chatId, action.reply, action.shouldSend && !action.suppressDelivery);
    await logAiAction(this.crm, {
      leadId: lead.id,
      messageId: message.id,
      intent: action.intent || action.noteType,
      noteType: action.noteType,
      shouldSend: action.shouldSend,
      suppressed: action.suppressDelivery,
      delivery,
      profile,
      conversationState: conversationState.state,
      audio: audioResult,
    });
    return { accepted: true, message, leadId: lead.id, profile, conversationState: conversationState.state, audio: audioResult, action, delivery };
  }

  async processTestMessage(payload = {}) {
    const phone = normalizePhone(payload.phone || payload.chatId || '+77000000000');
    const chatId = payload.chatId || `${phone.replace(/\D/g, '')}@c.us`;
    return await this.processGreenApiWebhook({
      typeWebhook: 'incomingMessageReceived',
      senderData: { chatId, senderName: payload.name || 'Тестовый клиент' },
      messageData: {
        typeMessage: payload.type || 'textMessage',
        textMessageData: { textMessage: payload.text || 'Здравствуйте, хочу узнать про вокал' },
        fileMessageData: payload.fileUrl ? { downloadUrl: payload.fileUrl, mimeType: payload.mimeType || 'audio/ogg', caption: payload.transcript || null } : undefined,
      },
      transcript: payload.transcript || null,
    });
  }

  async planReminder(payload = {}) {
    const phone = normalizePhone(payload.phone || payload.chatId || '+77000000000');
    const lead = await this.crmTools.findLeadByPhone(phone);
    if (!lead) {
      const error = new Error('Lead not found for reminder planning');
      error.status = 404;
      throw error;
    }
    return await createReminderTask(this.crmTools, lead, payload);
  }

  async releaseHandoff(payload = {}) {
    const phone = normalizePhone(payload.phone || payload.chatId || '+77000000000');
    const lead = await this.crmTools.findLeadByPhone(phone);
    if (!lead) {
      const error = new Error('Lead not found for handoff release');
      error.status = 404;
      throw error;
    }
    return await releaseHumanHandoff(this.crmTools, lead, payload.reason || 'manual release');
  }

  async analytics() {
    return await aiConsultantAnalytics(this.crm);
  }

  async dispatchDueReminders(payload = {}) {
    return await dispatchDueReminders({
      crm: this.crm,
      greenApiClient: this.greenApiClient,
      now: payload.now ? new Date(payload.now) : new Date(),
      limit: payload.limit || 20,
      env: this.env,
    });
  }

  searchKnowledge(query) {
    return this.knowledge.search(query);
  }

  availableTrialSlots(direction = null, limit = 3) {
    return this.slots.listAvailable(direction, limit);
  }

  slotById(id) {
    return this.slots.findById(id);
  }

  contentAudit(payload = {}) {
    return auditAiConsultantContent({
      knowledge: this.knowledge,
      slots: this.slots,
      projectConfig: this.projectConfig,
      now: payload.now ? new Date(payload.now) : new Date(),
    });
  }

  async decideAction(message, lead, profile = null, audioResult = null) {
    const text = audioResult?.transcript || this.messageText(message);
    const classification = classifyIntent(text, { isAudio: isAudioMessage(message) && !audioResult?.transcript });

    if (hasOptedOut(lead) && classification.intent !== INTENTS.OPT_OUT && classification.intent !== INTENTS.HUMAN_HANDOFF) {
      await this.crmTools.createHumanTask(lead, 'Клиент с opt-out написал в WhatsApp: проверить вручную', 'medium');
      return {
        shouldSend: true,
        intent: classification.intent,
        suppressDelivery: true,
        reply: '',
        note: `Автоответ не отправлен из-за opt-out. Входящее сообщение: "${text}"`,
        noteType: 'opt_out_suppressed',
      };
    }

    if (isHumanHandoffActive(lead) && ![INTENTS.OPT_OUT, INTENTS.HUMAN_HANDOFF].includes(classification.intent)) {
      await this.crmTools.createHumanTask(lead, 'Новое сообщение в диалоге, который ведет человек', 'medium');
      return {
        shouldSend: true,
        intent: classification.intent,
        suppressDelivery: true,
        reply: '',
        note: `Автоответ не отправлен: активен human handoff. Входящее сообщение: "${text}"`,
        noteType: 'human_handoff_suppressed',
      };
    }

    if (classification.intent === INTENTS.VOICE) {
      await this.crmTools.createHumanTask(lead, 'Расшифровать голосовое WhatsApp и ответить клиенту', 'high');
      await this.crmTools.addLeadNote(
        lead,
        'voice_message',
        `Голосовое требует расшифровки. Статус: ${audioResult?.status || 'unknown'}. Файл: ${message.fileUrl || 'нет ссылки'}`,
      );
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: 'Спасибо, получила голосовое. Сейчас передам администратору, чтобы точно не ошибиться. Если удобно, напишите еще коротко текстом, что хотите уточнить.',
        note: `Голосовое сообщение требует speech-to-text или ручной проверки. Файл: ${message.fileUrl || 'нет ссылки'}`,
        noteType: 'voice_message',
      };
    }

    if (audioResult?.transcript) {
      await this.crmTools.addLeadNote(
        lead,
        'voice_transcript',
        `Расшифровка голосового (${audioResult.source}, confidence ${audioResult.confidence}): ${audioResult.transcript}`,
      );
    }

    if (classification.intent === INTENTS.OPT_OUT) {
      await markOptOut(this.crmTools, lead, text);
      await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.OPT_OUT, {
        nextAction: 'Не отправлять автоответы и проверить отписку вручную',
      });
      await this.crmTools.createHumanTask(lead, 'Проверить opt-out клиента и остановить рассылки', 'high');
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: 'Хорошо, больше не буду писать. Передам администратору, чтобы это зафиксировали.',
        note: `Клиент попросил не писать: "${text}"`,
        noteType: 'opt_out',
      };
    }

    if (classification.intent === INTENTS.HUMAN_HANDOFF || classification.intent === INTENTS.PAYMENT_DISPUTE) {
      await activateHumanHandoff(this.crmTools, lead, text);
      await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.HUMAN_NEEDED, {
        nextAction: 'Администратору взять диалог на себя',
      });
      await this.crmTools.createHumanTask(lead, 'Взять диалог WhatsApp на себя', 'high');
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: classification.intent === INTENTS.PAYMENT_DISPUTE
          ? 'Понимаю, вопрос важный. Передаю администратору, чтобы он проверил детали и ответил точно.'
          : 'Конечно, передаю администратору. Он подключится и поможет по вашему вопросу.',
        note: `Нужна передача человеку. Сообщение: "${text}"`,
        noteType: 'human_handoff',
      };
    }

    if (classification.intent === INTENTS.PAYMENT_CHECK) {
      await this.crmTools.createHumanTask(lead, 'Проверить оплату клиента из WhatsApp', 'high');
      const sources = this.knowledge.search('оплата проверка платеж');
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: paymentCheckMessage(),
        note: `Клиент сообщил об оплате: "${text}"${sourceSuffix(sources)}`,
        noteType: 'payment_check',
      };
    }

    if (classification.intent === INTENTS.LESSON_RESCHEDULE) {
      await this.crmTools.createHumanTask(lead, 'Обработать перенос или отмену урока из WhatsApp', 'high');
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: 'Поняла. Передам администратору, чтобы он проверил расписание и предложил вариант переноса.',
        note: `Запрос на перенос/отмену: "${text}"`,
        noteType: 'lesson_reschedule',
      };
    }

    if (classification.intent === INTENTS.SLOT_CONFIRMATION) {
      const notes = await this.crmTools.leadNotes(lead);
      const slotId = findLastOfferedSlot(notes);
      const slot = slotId ? this.slotById(slotId) : null;
      if (!slot) {
        await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.HUMAN_NEEDED, {
          nextAction: 'Уточнить желаемое время пробного урока',
        });
        await this.crmTools.createHumanTask(lead, 'Уточнить желаемый слот пробного урока из WhatsApp', 'high');
        return {
          shouldSend: true,
          intent: classification.intent,
          reply: 'Поняла. Передам администратору, чтобы он уточнил удобное время и подтвердил запись.',
          note: `Клиент подтвердил слот, но последний предложенный слот не найден. Сообщение: "${text}"`,
          noteType: 'trial_booking_missing_slot',
        };
      }
      await createTrialBookingRequest({ crmTools: this.crmTools, lead, slot });
      await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.TRIAL_BOOKED, {
        nextAction: `Подтвердить запись на ${slot.label}`,
      });
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: `Отлично, передаю администратору запись на ${slot.label}. Он проверит расписание и финально подтвердит детали.`,
        note: `Клиент подтвердил пробный слот ${slot.id}. Сообщение: "${text}"`,
        noteType: 'trial_booking_confirmed',
      };
    }

    const direction = findDirection(text, this.projectConfig);
    const aiCoreAction = await this.tryAiCoreAction({
      text,
      lead,
      profile,
      classification,
      direction,
    });
    if (aiCoreAction) {
      return aiCoreAction;
    }

    if (classification.intent === INTENTS.PRICE_QUESTION) {
      const sources = this.knowledge.search('цена стоимость условия направления');
      await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.NEW, {
        nextAction: 'Уточнить возраст, цель и формат перед ценой',
      });
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: direction
          ? `По ${direction} лучше сначала уточню возраст и цель, чтобы администратор дал актуальные условия. Для ребенка или для взрослого подбираете?`
          : `Подскажите, какое направление интересно: ${this.projectConfig.directions.join(', ')}?`,
        note: `Клиент спросил стоимость. Важно не выдумывать цену без актуальной базы. Сообщение: "${text}"${sourceSuffix(sources)}`,
        noteType: 'price_question',
      };
    }

    if (classification.intent === INTENTS.TRIAL_LESSON) {
      const sources = this.knowledge.search('пробный урок расписание слот');
      const slots = this.availableTrialSlots(direction);
      await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.WARM, {
        nextAction: slots.length ? 'Получить подтверждение предложенного слота' : 'Проверить доступные слоты вручную',
      });
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: direction && slots.length
          ? `Отлично, по направлению "${direction}" можно начать с пробного урока. Есть ближайший вариант: ${slots[0].label}. Подойдет или подобрать другое время?`
          : direction
            ? `Отлично, по направлению "${direction}" можно начать с пробного урока. Сейчас передам администратору, чтобы он проверил актуальные слоты.`
          : 'С радостью помогу с пробным уроком. Подскажите направление и возраст ученика?',
        note: `Интерес к пробному уроку/занятию. Сообщение: "${text}"${slots.length ? `\nПредложенные слоты: ${slots.map((slot) => slot.id).join(', ')}` : ''}${sourceSuffix(sources)}`,
        noteType: 'trial_lesson',
      };
    }

    if (profile?.direction || profile?.studentAge || profile?.customerType) {
      const nextAction = await ensureTrialNextAction({
        crmTools: this.crmTools,
        lead,
        profile,
        slots: this.availableTrialSlots(profile.direction, 3),
        lastMessage: text,
      });
      await updateAiLeadStatus(this.crmTools, lead, profileAiStatus(profile, nextAction), {
        nextAction: nextAction.ready ? 'Подобрать и подтвердить пробный урок' : 'Дособрать портрет клиента',
      });
      return {
        shouldSend: true,
        intent: classification.intent,
        reply: this.profileAwareReply(profile),
        note: nextAction.created
          ? `AI собрал полный портрет клиента и создал задачу на подбор пробного урока. Сообщение клиента: "${text}"`
          : `AI сохранил портрет клиента и продолжил квалификацию. Сообщение клиента: "${text}"`,
        noteType: nextAction.created ? 'trial_next_action_created' : 'sales_qualification',
      };
    }

    await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.NEW, {
      nextAction: 'Уточнить, занятие для ребенка или взрослого',
    });
    return {
      shouldSend: true,
      intent: classification.intent,
      reply: `Здравствуйте! Я онлайн-консультант ${this.projectConfig.schoolName}. Помогу подобрать направление и пробный урок. Подскажите, занятие ищете для себя или для ребенка?`,
      note: `AI дал стартовый ответ и уточнил первый квалифицирующий вопрос. Сообщение клиента: "${text}"`,
      noteType: 'sales_qualification',
    };
  }

  async tryAiCoreAction({ text, lead, profile, classification, direction }) {
    if (!this.runtime.llmEnabled || !this.aiCore.available()) return null;
    const knowledge = this.knowledge.search(text, 4);
    const slots = this.availableTrialSlots(direction || profile?.direction || null, 3);
    const result = await this.aiCore.consult({
      text,
      lead,
      profile,
      classification,
      knowledge,
      slots,
    });
    if (!result.ok) {
      return await this.handleLlmFallback({ lead, text, classification, result });
    }
    if (result.nextAction) {
      await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.WARM, {
        nextAction: result.nextAction,
      });
    }
    const executedActions = await executeAiActions({
      crmTools: this.crmTools,
      lead,
      profile,
      crmActions: result.crmActions || [],
      reminderPlan: result.reminderPlan || null,
      handoffRequired: result.handoffRequired,
      sourceText: text,
    });
    return {
      shouldSend: true,
      intent: classification.intent,
      reply: result.reply,
      note: [
        result.note || `AI-core ответил на сообщение: "${text}"`,
        result.crmActions?.length ? `AI proposed crmActions: ${JSON.stringify(result.crmActions)}` : null,
        result.reminderPlan ? `AI proposed reminderPlan: ${JSON.stringify(result.reminderPlan)}` : null,
        result.handoffRequired ? 'AI requested human handoff.' : null,
        executedActions.length ? `AI executed actions: ${JSON.stringify(executedActions)}` : null,
      ].filter(Boolean).join('\n'),
      noteType: result.noteType || 'llm_consultation',
      crmActions: result.crmActions || [],
      reminderPlan: result.reminderPlan || null,
      handoffRequired: Boolean(result.handoffRequired),
      executedActions,
    };
  }

  async handleLlmFallback({ lead, text, classification, result }) {
    const fallback = llmFallbackDecision({
      runtime: this.runtime,
      classification,
      result,
    });
    await this.crmTools.addLeadNote(
      lead,
      fallback.noteType,
      `AI-core fallback: ${fallback.reason}. Сообщение клиента: "${text}"`,
    );
    if (fallback.shouldHandoff) {
      await activateHumanHandoff(this.crmTools, lead, `LLM fallback: ${fallback.reason}`);
      await this.crmTools.createHumanTask(
        lead,
        fallback.taskTitle,
        fallback.taskPriority,
        `Причина: ${fallback.reason}\nСообщение клиента: ${text}`,
      );
      await updateAiLeadStatus(this.crmTools, lead, AI_LEAD_STATUSES.HUMAN_NEEDED, {
        nextAction: 'Ответить вручную из-за AI fallback',
      });
    }
    if (!fallback.reply) return null;
    return {
      shouldSend: true,
      intent: classification.intent,
      reply: fallback.reply,
      note: `AI API fallback отработал безопасной передачей человеку. Причина: ${fallback.reason}`,
      noteType: fallback.noteType,
      suppressDelivery: false,
    };
  }

  profileAwareReply(profile = {}) {
    const parts = [];
    if (profile.direction) parts.push(`направление "${profile.direction}"`);
    if (profile.studentAge) parts.push(`возраст ${profile.studentAge} лет`);
    if (profile.preferredTime) parts.push(`удобное время: ${humanProfileValue('preferredTime', profile.preferredTime)}`);

    const intro = parts.length
      ? `Спасибо, зафиксировала: ${parts.join(', ')}.`
      : 'Спасибо, зафиксировала информацию.';

    if (!profile.goal) {
      return `${intro} Подскажите, какая главная цель занятий: уверенность, развитие навыка, подготовка или просто для души?`;
    }
    if (!profile.preferredTime) {
      return `${intro} Подскажите, какое время удобнее для пробного урока: будни или выходные?`;
    }
    return `${intro} Следующий шаг — подобрать пробный урок. Передам данные администратору, чтобы он проверил актуальные слоты.`;
  }

  async saveClientProfile(lead, text) {
    const profile = extractClientProfile(text, this.projectConfig);
    if (!Object.keys(profile).length) return null;

    const summary = profileSummary(profile);
    await this.crmTools.addLeadNote(lead, 'client_profile', `AI-портрет из WhatsApp: ${summary}`);

    await this.crmTools.appendLeadPain(lead, `AI-портрет: ${summary}`);

    return profile;
  }

  async deliver(chatId, reply, shouldSend = true) {
    if (!shouldSend) return { skipped: true };
    const outbound = prepareOutboundMessages(reply, {
      env: this.env,
      policy: this.channelPolicy,
      context: 'reply',
    });
    if (!outbound.allowed) {
      return { skipped: true, reason: outbound.reason, policy: outbound.policy };
    }
    if (outbound.policy.queueOnly) {
      return {
        queued: true,
        transport: outbound.policy.transport,
        policy: outbound.policy,
        chatId,
        messages: outbound.messages,
      };
    }
    const messages = outbound.messages;
    const results = [];
    for (const message of messages) {
      const typing = await withRetry(() => this.greenApiClient.sendTyping(chatId), {
        attempts: this.env.AI_CONSULTANT_SEND_RETRIES || 2,
        delayMs: this.env.AI_CONSULTANT_RETRY_DELAY_MS || 100,
      });
      await sleep(humanDelayMs(message, this.env));
      const sent = await withRetry(() => this.greenApiClient.sendMessage(chatId, message), {
        attempts: this.env.AI_CONSULTANT_SEND_RETRIES || 2,
        delayMs: this.env.AI_CONSULTANT_RETRY_DELAY_MS || 100,
      });
      results.push({ typing, sent });
    }
    return { policy: outbound.policy, messages, results };
  }

  async applyWorkingHours(action, lead, message) {
    if (!action.shouldSend || action.suppressDelivery) return action;
    const state = workingHoursState(message.receivedAt ? new Date(message.receivedAt) : new Date(), this.env);
    if (state.within) return action;
    const originalReply = action.reply;
    action.reply = `${nightReply()}\n\n${originalReply}`;
    action.note = `${action.note}\nНочной режим: ${state.range} ${state.timezone}`;
    await this.crmTools.createHumanTask(lead, 'Проверить ночное WhatsApp-сообщение клиента', 'medium');
    return action;
  }

  messageText(message) {
    if (message.transcript) return message.transcript;
    if (isAudioMessage(message)) return `[voice] ${message.fileUrl || ''}`.trim();
    return message.text || '[empty]';
  }

  communicationResult(text) {
    const lower = String(text || '').toLowerCase();
    if (matches(lower, ['дорого'])) return COMMUNICATION_RESULTS.EXPENSIVE;
    if (matches(lower, ['запис', 'пробн', 'урок'])) return COMMUNICATION_RESULTS.MEETING_SET;
    if (matches(lower, ['подума', 'позже'])) return COMMUNICATION_RESULTS.RETURN_LATER;
    return COMMUNICATION_RESULTS.INTERESTED;
  }
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matches(text, words) {
  return words.some((word) => text.includes(word));
}

function sourceSuffix(sources = []) {
  if (!sources.length) return '';
  return `\nИсточники базы знаний: ${sources.map((source) => source.id).join(', ')}`;
}

module.exports = { AiConsultantService };
