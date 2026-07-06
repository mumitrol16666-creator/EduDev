const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JsonStore, EMPTY_DB } = require('../src/store/jsonStore');
const { CrmService } = require('../src/services/crmService');
const { AuthService } = require('../src/services/authService');
const { AiConsultantService } = require('../src/modules/ai-consultant/service');
const { findDirection } = require('../src/modules/ai-consultant/knowledgeBase');
const { extractClientProfile, profileSummary, parseProfileSummary } = require('../src/modules/ai-consultant/profileExtractor');
const { splitWhatsAppReply } = require('../src/modules/ai-consultant/responseFormatter');
const { lessonReminderMessage, paymentReminderMessage } = require('../src/modules/ai-consultant/reminderTemplates');
const { classifyIntent } = require('../src/modules/ai-consultant/intentRouter');
const { buildReminderPlan } = require('../src/modules/ai-consultant/reminderPlanner');
const { KnowledgeLoader } = require('../src/modules/ai-consultant/knowledgeLoader');
const { TrialSlotProvider } = require('../src/modules/ai-consultant/slotProvider');
const { findLastOfferedSlot } = require('../src/modules/ai-consultant/bookingManager');
const { hasOptedOut } = require('../src/modules/ai-consultant/consentManager');
const { AudioProcessor } = require('../src/modules/ai-consultant/audioProcessor');
const { isHumanHandoffActive } = require('../src/modules/ai-consultant/handoffManager');
const { workingHoursState } = require('../src/modules/ai-consultant/workingHours');
const { withRetry } = require('../src/modules/ai-consultant/retry');
const { aiConsultantReadiness } = require('../src/modules/ai-consultant/readiness');
const { createAiConsultantModule } = require('../src/modules/ai-consultant');
const { parseReminderPlan } = require('../src/modules/ai-consultant/reminderDispatcher');
const { auditAiConsultantContent } = require('../src/modules/ai-consultant/contentAudit');
const { buildConversationMemory } = require('../src/modules/ai-consultant/conversationMemory');
const { loadProjectConfig } = require('../src/modules/ai-consultant/projectConfig');
const { createProjectAdapter } = require('../src/modules/ai-consultant/projectAdapter');
const { isProfileReadyForTrial, trialNextActionMarker, trialNextActionDescription } = require('../src/modules/ai-consultant/qualification');
const { AI_LEAD_STATUSES } = require('../src/modules/ai-consultant/leadStatus');
const { toAiProfile, aiProfileFieldValue } = require('../src/modules/ai-consultant/leadProfile');
const { loadRuntimeMode } = require('../src/modules/ai-consultant/runtimeMode');
const { PromptPack, REQUIRED_PROJECT_PROMPTS } = require('../src/modules/ai-consultant/promptPack');
const { parseLlmJson } = require('../src/modules/ai-consultant/llmAdapter');
const { normalizeAiActionContract } = require('../src/modules/ai-consultant/actionContract');
const { llmFallbackDecision } = require('../src/modules/ai-consultant/fallbackPolicy');
const { CONVERSATION_STATES, deriveConversationState } = require('../src/modules/ai-consultant/conversationState');
const { scaffoldAiConsultantProject } = require('../src/modules/ai-consultant/projectScaffolder');
const { CHANNEL_MODES, prepareOutboundMessages } = require('../src/modules/ai-consultant/channelPolicy');
const { listLocalOutbox, markLocalOutboxSent } = require('../src/modules/ai-consultant/localOutbox');
const { DIRECTIONS, PERMISSIONS } = require('../src/domain/constants');
const { navigationForRole } = require('../src/domain/navigation');

async function main() {
  const tmpDb = path.join(__dirname, '../data/test-db.json');
  if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);

  const now = new Date().toISOString();
  const store = new JsonStore(tmpDb);
  store.replaceAll({
    ...structuredClone(EMPTY_DB),
    users: [
      { id: 'usr_owner', name: 'Owner', role: 'owner', status: 'active', apiToken: 'owner-token', createdAt: now, updatedAt: now },
      { id: 'usr_supervisor', name: 'Supervisor', role: 'supervisor', email: 'supervisor@edudev.local', status: 'active', apiToken: 'supervisor-token', passwordHash: require('../src/lib/password').hashPassword('edudev123', 'test-salt'), createdAt: now, updatedAt: now },
      { id: 'usr_manager', name: 'Manager', role: 'manager', status: 'active', apiToken: 'manager-token', createdAt: now, updatedAt: now },
      { id: 'usr_developer', name: 'Developer', role: 'developer', status: 'active', apiToken: 'developer-token', createdAt: now, updatedAt: now },
      { id: 'usr_impl', name: 'Implementation', role: 'implementation', status: 'active', apiToken: 'implementation-token', createdAt: now, updatedAt: now },
      { id: 'usr_support', name: 'Support', role: 'support', status: 'active', apiToken: 'support-token', createdAt: now, updatedAt: now },
    ],
  });

  const crm = new CrmService(store);
  const auth = new AuthService(store);

  const session = await auth.login({ email: 'supervisor-token', password: 'wrong' }).catch((error) => error);
  assert.match(session.message, /Invalid email or password/);
  const loggedIn = await auth.login({ email: 'Supervisor@edudev.local', password: 'edudev123' });
  assert.ok(loggedIn.token);
  assert.equal(loggedIn.user.apiToken, undefined);
  const sessionUser = await auth.authenticate({ headers: { authorization: `Bearer ${loggedIn.token}` } });
  assert.equal(sessionUser.id, 'usr_supervisor');
  const logoutResult = await auth.logout(loggedIn.token);
  assert.equal(logoutResult.revoked, true);
  await assert.rejects(() => auth.authenticate({ headers: { authorization: `Bearer ${loggedIn.token}` } }), /Invalid bearer token/);
  const secondLogin = await auth.login({ email: 'supervisor@edudev.local', password: 'edudev123' });
  const changedUser = await auth.changePassword(sessionUser, {
    currentPassword: 'edudev123',
    newPassword: 'newpass123',
  });
  assert.equal(changedUser.apiToken, undefined);
  await assert.rejects(() => auth.authenticate({ headers: { authorization: `Bearer ${secondLogin.token}` } }), /Invalid bearer token/);
  const loginWithNewPassword = await auth.login({ email: 'supervisor@edudev.local', password: 'newpass123' });
  assert.ok(loginWithNewPassword.token);

  const manager = await auth.authenticate({ headers: { authorization: 'Bearer manager-token' } });
  assert.equal(manager.id, 'usr_manager');
  await assert.rejects(() => auth.authenticate({ headers: {} }), /Missing bearer token/);
  assert.throws(() => auth.require(manager, PERMISSIONS.ANALYTICS_READ), /Permission denied/);
  auth.require(await auth.authenticate({ headers: { authorization: 'Bearer owner-token' } }), PERMISSIONS.ANALYTICS_READ);
  const supervisor = await auth.authenticate({ headers: { authorization: 'Bearer supervisor-token' } });
  auth.require(supervisor, PERMISSIONS.TASK_WRITE);
  const developer = await auth.authenticate({ headers: { authorization: 'Bearer developer-token' } });
  assert.throws(() => auth.require(developer, PERMISSIONS.LEAD_WRITE), /Permission denied/);
  assert.deepEqual(navigationForRole('manager').map((item) => item.id), [
    'dashboard',
    'leads',
    'diagnostics',
    'deals',
    'tasks',
    'clients',
    'materials',
  ]);
  assert.ok(!navigationForRole('manager').some((item) => item.id === 'finance'));
  assert.ok(navigationForRole('developer').some((item) => item.id === 'developer'));
  assert.ok(!navigationForRole('developer').some((item) => item.id === 'leads'));
  assert.ok(navigationForRole('supervisor').some((item) => item.id === 'audit'));
  assert.equal(navigationForRole('manager').find((item) => item.id === 'materials').api[0], '/api/materials');
  const newDeveloper = await crm.createUser({
    name: 'Junior Developer',
    role: 'developer',
    email: 'junior@edudev.local',
  }, 'usr_supervisor');
  assert.equal(newDeveloper.role, 'developer');
  assert.equal(newDeveloper.apiToken, undefined);
  const updatedDeveloper = await crm.updateUser(newDeveloper.id, {
    status: 'inactive',
    role: 'support',
  }, 'usr_supervisor');
  assert.equal(updatedDeveloper.status, 'inactive');
  assert.equal(updatedDeveloper.role, 'support');
  const usersList = await crm.list('users');
  assert.ok(usersList.data.every((user) => user.apiToken === undefined));
  const dictionaries = await crm.settingsDictionaries();
  assert.ok(dictionaries.autotech_niches.some((item) => item.key === 'oil_change'));
  assert.ok(dictionaries.edutech_niches.some((item) => item.key === 'music_school'));
  const detailingNiche = await crm.createReferenceItem({
    group: 'autotech_niches',
    key: 'detailing',
    label: 'Детейлинг',
    value: { description: 'Детейлинг-студия' },
    sortOrder: 20,
  }, 'usr_supervisor');
  assert.equal(detailingNiche.status, 'active');
  await assert.rejects(() => crm.createReferenceItem({
    group: 'autotech_niches',
    key: 'detailing',
    label: 'Дубль',
  }), /already exists/);
  const updatedReferenceItem = await crm.updateReferenceItem(detailingNiche.id, {
    label: 'Детейлинг и детейлинг-центр',
  }, 'usr_supervisor');
  assert.equal(updatedReferenceItem.label, 'Детейлинг и детейлинг-центр');

  const lead = await crm.createLead({
    name: 'Oil Service Aktobe',
    niche: 'oil_change',
    city: 'Актобе',
    phone: '+77000000000',
    currentAccounting: 'Excel',
    pain: 'склад и повторные клиенты',
  });

  assert.equal((await store.all('leads')).length, 1);
  assert.equal((await store.all('tasks')).length, 1);
  const firstLeadTask = (await store.all('tasks'))[0];
  const firstLeadTaskKazakhstanTime = new Date(new Date(firstLeadTask.dueAt).getTime() + 5 * 60 * 60000);
  assert.equal(firstLeadTaskKazakhstanTime.getUTCHours(), 18);
  assert.equal(firstLeadTaskKazakhstanTime.getUTCMinutes(), 0);
  const secondLead = await crm.createLead({
    name: 'Tire Service Astana',
    niche: 'tire_service',
    city: 'Астана',
    phone: '+77000000001',
  });
  await crm.updateLead(secondLead.id, { status: 'lost' });
  const filteredLeads = await crm.list('leads', { status: 'contact_check', sort: 'name', limit: '1' });
  assert.equal(filteredLeads.data.length, 1);
  assert.equal(filteredLeads.data[0].name, 'Oil Service Aktobe');
  assert.equal(filteredLeads.meta.total, 1);
  const searchedLeads = await crm.list('leads', { q: 'astana' });
  assert.equal(searchedLeads.data.length, 1);
  assert.equal(searchedLeads.data[0].id, secondLead.id);
  const multiStatusLeads = await crm.list('leads', { status: 'contact_check,lost', sort: '-createdAt', page: '1', limit: '1' });
  assert.equal(multiStatusLeads.meta.total, 2);
  assert.equal(multiStatusLeads.meta.pages, 2);
  const detailingLead = await crm.createLead({
    name: 'Detailing Studio',
    niche: 'detailing',
    city: 'Алматы',
    phone: '+77000000002',
  });
  assert.equal(detailingLead.niche, 'detailing');

  const sentMessages = [];
  const aiConsultant = new AiConsultantService({
    crm,
    greenApiClient: {
      enabled: false,
      async sendTyping(chatId) {
        sentMessages.push({ type: 'typing', chatId });
        return { skipped: true };
      },
      async sendMessage(chatId, message) {
        sentMessages.push({ type: 'message', chatId, message });
        return { skipped: true, chatId, message };
      },
    },
    env: { AI_CONSULTANT_ENABLED: 'true', AI_CONSULTANT_SEND_DELAY_MS: '0' },
  });
  const aiResult = await aiConsultant.processTestMessage({
    phone: '+77000000003',
    name: 'Родитель Маэстро',
    text: 'Здравствуйте, сколько стоит вокал для ребенка?',
  });
  assert.equal(aiResult.accepted, true);
  assert.ok(aiResult.action.reply.includes('возраст'));
  assert.ok(sentMessages.some((item) => item.type === 'message' && item.message.includes('вокал')));
  assert.equal(aiConsultant.channelPolicy.mode, CHANNEL_MODES.GREEN_API_SAFE);
  const blockedColdOutbound = prepareOutboundMessages('Холодное сообщение', {
    env: { AI_CONSULTANT_OUTBOUND_POLICY: 'inbound_only' },
    context: 'cold_outbound',
  });
  assert.equal(blockedColdOutbound.allowed, false);
  const allowedReminderOutbound = prepareOutboundMessages('Напоминание об уроке', {
    env: { AI_CONSULTANT_OUTBOUND_POLICY: 'allow_reminders' },
    context: 'reminder',
  });
  assert.equal(allowedReminderOutbound.allowed, true);
  const browserAgent = new AiConsultantService({
    crm,
    greenApiClient: {
      enabled: true,
      async sendTyping() { throw new Error('browser_local must not send typing directly'); },
      async sendMessage() { throw new Error('browser_local must not send messages directly'); },
    },
    env: { AI_CONSULTANT_ENABLED: 'true', AI_CONSULTANT_CHANNEL_MODE: 'browser_local' },
  });
  const queuedDelivery = await browserAgent.deliver('77000000000@c.us', 'Ответ через локальный браузер', true);
  assert.equal(queuedDelivery.queued, true);
  assert.equal(queuedDelivery.transport, 'local_browser_agent');
  const localOutbox = await listLocalOutbox(crm);
  assert.ok(localOutbox.some((item) => item.id === queuedDelivery.outboxId && item.messages[0].includes('локальный браузер')));
  await markLocalOutboxSent(crm, queuedDelivery.outboxId, { test: true });
  assert.ok(!(await listLocalOutbox(crm)).some((item) => item.id === queuedDelivery.outboxId));
  const dryRunAgent = new AiConsultantService({
    crm,
    greenApiClient: {
      enabled: true,
      async sendTyping() { throw new Error('dry_run must not send typing'); },
      async sendMessage() { throw new Error('dry_run must not send messages'); },
    },
    env: { AI_CONSULTANT_ENABLED: 'true', AI_CONSULTANT_CHANNEL_MODE: 'dry_run' },
  });
  const dryDelivery = await dryRunAgent.deliver('77000000000@c.us', 'Не отправлять', true);
  assert.equal(dryDelivery.skipped, true);
  const dedupePayload = {
    idMessage: 'msg_duplicate_1',
    typeWebhook: 'incomingMessageReceived',
    senderData: { chatId: '77000000999@c.us', senderName: 'Дубль' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Здравствуйте' } },
  };
  const firstDedupe = await aiConsultant.processGreenApiWebhook(dedupePayload);
  const secondDedupe = await aiConsultant.processGreenApiWebhook(dedupePayload);
  assert.equal(firstDedupe.accepted, true);
  assert.equal(secondDedupe.ignored, true);
  assert.equal(secondDedupe.reason, 'duplicate message');
  assert.equal(workingHoursState(new Date('2026-07-05T00:00:00.000Z'), { AI_CONSULTANT_TIMEZONE: 'Asia/Aqtobe', AI_CONSULTANT_WORKING_HOURS: '09:00-21:00' }).within, false);
  let retryAttempts = 0;
  const retryResult = await withRetry(async () => {
    retryAttempts += 1;
    if (retryAttempts === 1) throw new Error('temporary');
    return 'ok';
  }, { attempts: 2, delayMs: 0 });
  assert.equal(retryResult.ok, true);
  assert.equal(retryResult.attempts, 2);
  assert.deepEqual(loadRuntimeMode({}), {
    mode: 'rules',
    llmEnabled: false,
    rulesOnly: true,
    externalAiRequired: false,
    paidAiRequired: false,
  });
  assert.deepEqual(loadRuntimeMode({ AI_CONSULTANT_MODE: 'hybrid', AI_CONSULTANT_LLM_ENABLED: 'false' }), {
    mode: 'hybrid',
    llmEnabled: false,
    rulesOnly: true,
    externalAiRequired: false,
    paidAiRequired: false,
  });
  assert.equal(loadRuntimeMode({ AI_CONSULTANT_MODE: 'llm', AI_CONSULTANT_LLM_ENABLED: 'true' }).paidAiRequired, true);
  const projectPromptDir = path.join(__dirname, '../data/test-project-prompts');
  if (fs.existsSync(projectPromptDir)) fs.rmSync(projectPromptDir, { recursive: true, force: true });
  fs.mkdirSync(projectPromptDir, { recursive: true });
  fs.writeFileSync(path.join(projectPromptDir, 'sales_playbook.md'), '# Sales Playbook\nПроектный playbook для теста.');
  const promptPack = new PromptPack({ projectDir: projectPromptDir });
  assert.equal(promptPack.listCorePrompts().length >= 2, true);
  assert.equal(promptPack.listProjectPrompts().length, 1);
  assert.equal(promptPack.audit().projectPrompts, 1);
  assert.equal(promptPack.audit().projectReady, false);
  assert.ok(promptPack.audit().missingProjectPrompts.includes('business_profile'));
  for (const promptId of REQUIRED_PROJECT_PROMPTS) {
    const file = path.join(projectPromptDir, `${promptId}.md`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, `# ${promptId}\nТестовый обязательный промпт.`);
  }
  assert.equal(promptPack.audit().projectReady, true);
  assert.deepEqual(promptPack.audit().missingProjectPrompts, []);
  assert.ok(promptPack.systemPrompt({ brandName: 'Тест' }).includes('Project Prompt Pack'));
  const maestroExamplePromptDir = path.join(__dirname, '../examples/ai-consultant/maestro/prompts');
  const maestroExamplePromptPack = new PromptPack({ projectDir: maestroExamplePromptDir });
  assert.equal(maestroExamplePromptPack.audit().projectReady, true);
  assert.equal(maestroExamplePromptPack.audit().projectPrompts, REQUIRED_PROJECT_PROMPTS.length);
  assert.ok(maestroExamplePromptPack.systemPrompt({ brandName: 'Маэстро' }).includes('школа Маэстро'));
  const scaffoldBaseDir = path.join(__dirname, '../data/test-scaffold-projects');
  if (fs.existsSync(scaffoldBaseDir)) fs.rmSync(scaffoldBaseDir, { recursive: true, force: true });
  const scaffoldResult = scaffoldAiConsultantProject({
    id: 'Auto Service!',
    name: 'Auto Service',
    baseDir: scaffoldBaseDir,
  });
  assert.equal(scaffoldResult.id, 'auto-service');
  assert.equal(scaffoldResult.created.length, REQUIRED_PROJECT_PROMPTS.length + 1);
  assert.equal(new PromptPack({ projectDir: scaffoldResult.promptsDir }).audit().projectReady, true);
  const scaffoldSecondRun = scaffoldAiConsultantProject({
    id: 'auto-service',
    name: 'Auto Service',
    baseDir: scaffoldBaseDir,
  });
  assert.equal(scaffoldSecondRun.created.length, 0);
  assert.equal(scaffoldSecondRun.skipped.length, REQUIRED_PROJECT_PROMPTS.length + 1);
  const customConfig = loadProjectConfig({
    AI_CONSULTANT_PROJECT_ID: 'test_center',
    AI_CONSULTANT_SCHOOL_NAME: 'центра Тест',
    AI_CONSULTANT_BRAND_NAME: 'Тест',
    AI_CONSULTANT_CITY: 'Алматы',
    AI_CONSULTANT_CRM_DIRECTION: 'edutech',
    AI_CONSULTANT_CRM_NICHE: 'kids_center',
    AI_CONSULTANT_DIRECTIONS: 'робототехника,шахматы',
  });
  assert.equal(customConfig.id, 'test_center');
  assert.equal(customConfig.city, 'Алматы');
  assert.deepEqual(customConfig.directions, ['робототехника', 'шахматы']);
  const customAdapter = createProjectAdapter({
    AI_CONSULTANT_PROJECT_ID: 'robotics',
    AI_CONSULTANT_BRAND_NAME: 'Робо',
    AI_CONSULTANT_KNOWLEDGE_DIR: '/tmp/knowledge',
    AI_CONSULTANT_PROJECT_PROMPT_DIR: '/tmp/prompts',
    AI_CONSULTANT_TRIAL_SLOTS_FILE: '/tmp/slots.json',
    AI_CONSULTANT_CRM_DIRECTION: 'edutech',
    AI_CONSULTANT_CRM_NICHE: 'kids_center',
    AI_CONSULTANT_LEAD_SOURCE: 'whatsapp_robotics',
  });
  assert.equal(customAdapter.id, 'robotics');
  assert.equal(customAdapter.paths.knowledgeDir, '/tmp/knowledge');
  assert.equal(customAdapter.paths.projectPromptDir, '/tmp/prompts');
  assert.equal(customAdapter.paths.trialSlotsFile, '/tmp/slots.json');
  assert.equal(customAdapter.crmMapping.leadSource, 'whatsapp_robotics');
  const maestroLead = (await store.all('leads')).find((item) => item.phone === '+77000000003');
  assert.equal(maestroLead.direction, DIRECTIONS.EDUTECH);
  assert.equal(maestroLead.niche, 'music_school');
  assert.equal(maestroLead.aiStatus, AI_LEAD_STATUSES.NEW);
  assert.ok(maestroLead.aiNextAction.includes('ценой'));
  assert.ok((await store.all('communications')).some((item) => item.leadId === maestroLead.id && item.channel === 'whatsapp'));
  assert.ok((await store.all('notes')).some((item) => item.entityId === maestroLead.id && item.type === 'price_question'));

  const paymentCheckResult = await aiConsultant.processTestMessage({
    phone: '+77000000003',
    text: 'Мы оплатили, чек отправила',
  });
  assert.ok(paymentCheckResult.action.reply.includes('не подтверждаю'));
  assert.ok((await store.all('tasks')).some((item) => item.leadId === maestroLead.id && item.title.includes('Проверить оплату')));
  assert.equal(new PromptPack().listPrompts().length >= 2, true);
  assert.equal(parseLlmJson('{"reply":"ок","confidence":0.8}').reply, 'ок');
  const normalizedAiContract = normalizeAiActionContract({
    reply: 'ок',
    confidence: 2,
    handoffRequired: true,
    crmActions: [
      { type: 'create_task', priority: 'urgent', reason: 'нужна проверка', payload: { title: 'Проверить' } },
      { type: 'delete_lead', reason: 'нельзя' },
    ],
    reminderPlan: { type: 'follow_up', scheduledAt: '2026-07-07T10:00:00.000Z', payload: { channel: 'whatsapp' } },
  });
  assert.equal(normalizedAiContract.confidence, 1);
  assert.equal(normalizedAiContract.handoffRequired, true);
  assert.equal(normalizedAiContract.crmActions.length, 1);
  assert.equal(normalizedAiContract.crmActions[0].priority, 'medium');
  assert.equal(normalizedAiContract.reminderPlan.type, 'follow_up');
  assert.equal(llmFallbackDecision({
    runtime: { mode: 'llm' },
    classification: { escalate: false },
    result: { error: 'timeout' },
  }).shouldHandoff, true);
  assert.equal(deriveConversationState({ action: { noteType: 'trial_booking_confirmed' } }), CONVERSATION_STATES.TRIAL_BOOKED);
  assert.equal(deriveConversationState({
    action: { noteType: 'trial_lesson', note: 'Предложенные слоты: slot_1' },
  }), CONVERSATION_STATES.AWAITING_SLOT_CONFIRMATION);
  const fakeLlmCalls = [];
  const aiConsultantWithLlm = new AiConsultantService({
    crm,
    greenApiClient: {
      enabled: false,
      async sendTyping() { return { skipped: true }; },
      async sendMessage(chatId, message) { return { skipped: true, chatId, message }; },
    },
    env: {
      AI_CONSULTANT_ENABLED: 'true',
      AI_CONSULTANT_MODE: 'hybrid',
      AI_CONSULTANT_LLM_ENABLED: 'true',
      AI_CONSULTANT_SEND_DELAY_MS: '0',
    },
    llmAdapter: {
      configured() { return true; },
      async complete(payload) {
        fakeLlmCalls.push(payload);
        return {
          ok: true,
          content: JSON.stringify({
            reply: 'AI-core ответ из проектного prompt pack.',
            note: 'AI-core обработал свободный запрос.',
            noteType: 'llm_consultation',
            nextAction: 'Продолжить консультацию по проектному playbook',
            handoffRequired: true,
            crmActions: [
              {
                type: 'create_task',
                reason: 'AI предлагает человеку проверить нестандартный вопрос',
                priority: 'high',
                payload: { title: 'Проверить нестандартный вопрос' },
              },
              {
                type: 'add_note',
                reason: 'AI хочет сохранить краткий вывод',
                payload: { noteType: 'ai_safe_note', text: 'Нестандартный вопрос обработан AI-core.' },
              },
              {
                type: 'update_profile',
                reason: 'AI уточнил цель',
                payload: { profile: { goal: 'consultation_needed', preferred_time: 'weekday' } },
              },
            ],
            reminderPlan: {
              type: 'follow_up',
              scheduledAt: '2026-07-07T10:00:00.000Z',
              payload: { reason: 'вернуться к нестандартному вопросу' },
            },
            confidence: 0.91,
          }),
        };
      },
    },
  });
  const llmResult = await aiConsultantWithLlm.processTestMessage({
    phone: '+77000000009',
    text: 'Есть сложный вопрос по формату обучения',
  });
  assert.equal(llmResult.action.noteType, 'llm_consultation');
  assert.ok(llmResult.action.reply.includes('AI-core'));
  assert.equal(llmResult.action.handoffRequired, true);
  assert.equal(llmResult.action.crmActions.length, 3);
  assert.equal(llmResult.action.crmActions[0].type, 'create_task');
  assert.ok(llmResult.action.executedActions.some((item) => item.type === 'create_task' && item.ok));
  assert.ok(llmResult.action.executedActions.some((item) => item.type === 'add_note' && item.ok));
  assert.ok(llmResult.action.executedActions.some((item) => item.type === 'update_profile' && item.ok));
  assert.ok(llmResult.action.executedActions.some((item) => item.type === 'plan_reminder' && item.ok));
  assert.ok(llmResult.action.executedActions.some((item) => item.type === 'set_handoff' && item.ok));
  assert.equal(fakeLlmCalls.length, 1);
  assert.ok(fakeLlmCalls[0].messages[0].content.includes('универсальное ядро'));
  const llmLead = (await store.all('leads')).find((item) => item.phone === '+77000000009');
  assert.equal(llmLead.aiStatus, AI_LEAD_STATUSES.WARM);
  assert.equal(llmLead.aiConversationState, CONVERSATION_STATES.HANDOFF);
  assert.ok(llmLead.aiNextAction.includes('playbook'));
  const updatedLlmLead = await store.get('leads', llmLead.id);
  assert.equal(updatedLlmLead.aiProfile.goal, 'consultation_needed');
  assert.equal(updatedLlmLead.aiProfile.preferred_time, 'weekday');
  assert.ok((await store.all('notes')).some((item) => item.entityId === llmLead.id && item.type === 'ai_safe_note'));
  assert.ok((await store.all('notes')).some((item) => item.entityId === llmLead.id && item.type === 'reminder_plan'));
  assert.ok((await store.all('tasks')).some((item) => item.leadId === llmLead.id && item.title.includes('Проверить нестандартный вопрос')));
  const aiConsultantWithFailingHybridLlm = new AiConsultantService({
    crm,
    greenApiClient: {
      enabled: false,
      async sendTyping() { return { skipped: true }; },
      async sendMessage(chatId, message) { return { skipped: true, chatId, message }; },
    },
    env: {
      AI_CONSULTANT_ENABLED: 'true',
      AI_CONSULTANT_MODE: 'hybrid',
      AI_CONSULTANT_LLM_ENABLED: 'true',
      AI_CONSULTANT_SEND_DELAY_MS: '0',
    },
    llmAdapter: {
      configured() { return true; },
      async complete() { return { ok: false, error: 'timeout' }; },
    },
  });
  const hybridFallbackResult = await aiConsultantWithFailingHybridLlm.processTestMessage({
    phone: '+77000000010',
    text: 'Есть сложный вопрос по формату обучения',
  });
  assert.equal(hybridFallbackResult.action.noteType, 'sales_qualification');
  const hybridFallbackLead = (await store.all('leads')).find((item) => item.phone === '+77000000010');
  assert.ok((await store.all('notes')).some((item) => item.entityId === hybridFallbackLead.id && item.type === 'llm_fallback'));
  const aiConsultantWithFailingStrictLlm = new AiConsultantService({
    crm,
    greenApiClient: {
      enabled: false,
      async sendTyping() { return { skipped: true }; },
      async sendMessage(chatId, message) { return { skipped: true, chatId, message }; },
    },
    env: {
      AI_CONSULTANT_ENABLED: 'true',
      AI_CONSULTANT_MODE: 'llm',
      AI_CONSULTANT_LLM_ENABLED: 'true',
      AI_CONSULTANT_SEND_DELAY_MS: '0',
    },
    llmAdapter: {
      configured() { return true; },
      async complete() { return { ok: false, error: 'timeout' }; },
    },
  });
  const strictFallbackResult = await aiConsultantWithFailingStrictLlm.processTestMessage({
    phone: '+77000000011',
    text: 'Есть сложный вопрос по формату обучения',
  });
  assert.equal(strictFallbackResult.action.noteType, 'llm_fallback_handoff');
  assert.ok(strictFallbackResult.action.reply.includes('администратору'));
  const strictFallbackLead = (await store.all('leads')).find((item) => item.phone === '+77000000011');
  assert.equal(strictFallbackLead.aiStatus, AI_LEAD_STATUSES.HUMAN_NEEDED);
  assert.equal(strictFallbackLead.aiConversationState, CONVERSATION_STATES.HANDOFF);
  assert.ok((await store.all('tasks')).some((item) => item.leadId === strictFallbackLead.id && item.title.includes('AI API недоступен')));
  const profiledResult = await aiConsultant.processTestMessage({
    phone: '+77000000004',
    text: 'Вокал для дочки 8 лет, удобно вечером',
  });
  assert.ok(profiledResult.action.reply.includes('зафиксировала'));
  assert.ok(!profiledResult.action.reply.includes('для себя или для ребенка'));
  const profiledLead = await store.get('leads', profiledResult.leadId);
  assert.equal(profiledLead.aiConversationState, CONVERSATION_STATES.COLLECTING_PROFILE);
  assert.deepEqual(profiledLead.aiProfile, {
    student_age: 8,
    interest: 'вокал',
    customer_type: 'child',
    preferred_time: 'evening',
  });
  const goalFollowup = await aiConsultant.processTestMessage({
    phone: '+77000000004',
    text: 'Для уверенности',
  });
  assert.ok(goalFollowup.action.reply.includes('Следующий шаг'));
  assert.equal(goalFollowup.profile.direction, 'вокал');
  assert.equal(goalFollowup.profile.studentAge, 8);
  assert.equal(goalFollowup.profile.goal, 'confidence');
  assert.deepEqual(toAiProfile(goalFollowup.profile), {
    student_age: 8,
    interest: 'вокал',
    customer_type: 'child',
    goal: 'confidence',
    preferred_time: 'evening',
  });
  assert.equal(aiProfileFieldValue('goal', 'confidence'), 'уверенность');
  assert.equal(isProfileReadyForTrial(goalFollowup.profile), true);
  const nextActionTask = (await store.all('tasks')).find((item) => {
    return item.leadId === goalFollowup.leadId && item.title.includes('Подобрать пробный урок');
  });
  assert.ok(nextActionTask);
  assert.ok(nextActionTask.description.includes('Профиль: направление: вокал'));
  assert.ok(nextActionTask.description.includes('Ближайшие слоты: пн, 06.07, 18:00'));
  assert.ok((await store.all('notes')).some((item) => {
    return item.entityId === goalFollowup.leadId
      && item.type === 'trial_next_action'
      && item.text.includes(trialNextActionMarker(goalFollowup.profile));
  }));
  const qualifiedMemoryLead = await store.get('leads', goalFollowup.leadId);
  assert.equal(qualifiedMemoryLead.aiStatus, AI_LEAD_STATUSES.QUALIFIED);
  assert.equal(qualifiedMemoryLead.aiConversationState, CONVERSATION_STATES.OFFERING_TRIAL);
  assert.equal(qualifiedMemoryLead.aiNextAction, 'Подобрать и подтвердить пробный урок');
  assert.equal(qualifiedMemoryLead.aiProfile.goal, 'confidence');
  assert.ok(qualifiedMemoryLead.aiSummary.includes('цель: уверенность'));
  const nextActionTasksBefore = (await store.all('tasks')).filter((item) => {
    return item.leadId === goalFollowup.leadId && item.title.includes('Подобрать пробный урок');
  }).length;
  await aiConsultant.processTestMessage({
    phone: '+77000000004',
    text: 'Да, вечер подходит',
  });
  const nextActionTasksAfter = (await store.all('tasks')).filter((item) => {
    return item.leadId === goalFollowup.leadId && item.title.includes('Подобрать пробный урок');
  }).length;
  assert.equal(nextActionTasksAfter, nextActionTasksBefore);
  const memoryLead = (await store.all('leads')).find((item) => item.phone === '+77000000004');
  const memory = await buildConversationMemory({
    crmTools: aiConsultant.crmTools,
    lead: memoryLead,
    projectConfig: aiConsultant.projectConfig,
  });
  assert.equal(memory.profile.preferredTime, 'evening');
  assert.equal((await store.get('leads', memoryLead.id)).aiStatus, AI_LEAD_STATUSES.HUMAN_NEEDED);
  const trialResult = await aiConsultant.processTestMessage({
    phone: '+77000000005',
    text: 'Хочу записаться на пробный урок по вокалу',
  });
  assert.ok(trialResult.action.reply.includes('пн, 06.07, 18:00'));
  const trialLead = (await store.all('leads')).find((item) => item.phone === '+77000000005');
  assert.equal(findLastOfferedSlot(await aiConsultant.crmTools.leadNotes(trialLead)), 'slot_vocal_mon_1800');
  assert.equal((await store.get('leads', trialLead.id)).aiConversationState, CONVERSATION_STATES.AWAITING_SLOT_CONFIRMATION);
  const bookingResult = await aiConsultant.processTestMessage({
    phone: '+77000000005',
    text: 'Да, подходит, запишите',
  });
  assert.equal(bookingResult.action.noteType, 'trial_booking_confirmed');
  assert.equal((await store.get('leads', trialLead.id)).aiStatus, AI_LEAD_STATUSES.TRIAL_BOOKED);
  assert.equal((await store.get('leads', trialLead.id)).aiConversationState, CONVERSATION_STATES.TRIAL_BOOKED);
  assert.ok((await store.all('tasks')).some((item) => item.leadId === trialLead.id && item.title.includes('Подтвердить запись')));
  const optOutResult = await aiConsultant.processTestMessage({
    phone: '+77000000005',
    text: 'Не пишите больше',
  });
  assert.equal(optOutResult.action.noteType, 'opt_out');
  const optedOutLead = await store.get('leads', trialLead.id);
  assert.equal(hasOptedOut(optedOutLead), true);
  assert.equal(optedOutLead.aiStatus, AI_LEAD_STATUSES.OPT_OUT);
  assert.equal(optedOutLead.aiConversationState, CONVERSATION_STATES.CLOSED);
  const suppressedResult = await aiConsultant.processTestMessage({
    phone: '+77000000005',
    text: 'Сколько стоит вокал?',
  });
  assert.equal(suppressedResult.action.noteType, 'opt_out_suppressed');
  assert.equal(suppressedResult.delivery.skipped, true);
  assert.equal((await new AudioProcessor({ env: { AI_CONSULTANT_AUDIO_DRY_RUN: 'true' } }).transcribe({ fileUrl: 'https://example.com/a.ogg' })).status, 'needs_transcription');
  const voiceManualResult = await aiConsultant.processTestMessage({
    phone: '+77000000006',
    type: 'audioMessage',
    fileUrl: 'https://example.com/audio.ogg',
  });
  assert.equal(voiceManualResult.action.noteType, 'voice_message');
  assert.equal(voiceManualResult.audio.status, 'needs_transcription');
  const voiceTranscriptResult = await aiConsultant.processTestMessage({
    phone: '+77000000007',
    type: 'audioMessage',
    fileUrl: 'https://example.com/audio.ogg',
    transcript: 'Хочу записаться на пробный урок по вокалу',
  });
  assert.equal(voiceTranscriptResult.audio.status, 'ready');
  assert.equal(voiceTranscriptResult.action.noteType, 'trial_lesson');
  assert.ok((await store.all('notes')).some((item) => item.type === 'voice_transcript' && item.text.includes('пробный урок')));
  assert.ok((await store.all('auditLogs')).some((item) => item.action === 'ai_consultant_action' && item.details?.noteType === 'trial_lesson'));
  const handoffResult = await aiConsultant.processTestMessage({
    phone: '+77000000008',
    text: 'Позовите человека, пожалуйста',
  });
  assert.equal(handoffResult.action.noteType, 'human_handoff');
  const handoffLead = (await store.all('leads')).find((item) => item.phone === '+77000000008');
  assert.equal(isHumanHandoffActive(handoffLead), true);
  assert.equal(handoffLead.aiStatus, AI_LEAD_STATUSES.HUMAN_NEEDED);
  assert.equal(handoffLead.aiConversationState, CONVERSATION_STATES.HANDOFF);
  const handoffSuppressed = await aiConsultant.processTestMessage({
    phone: '+77000000008',
    text: 'Сколько стоит вокал?',
  });
  assert.equal(handoffSuppressed.action.noteType, 'human_handoff_suppressed');
  const releasedHandoff = await aiConsultant.releaseHandoff({ phone: '+77000000008', reason: 'test done' });
  assert.equal(releasedHandoff.handoff, 'released');
  const afterReleaseLead = await store.get('leads', handoffLead.id);
  assert.equal(isHumanHandoffActive(afterReleaseLead), false);
  const aiAnalytics = await aiConsultant.analytics();
  assert.ok(aiAnalytics.actions >= 1);
  assert.ok(aiAnalytics.humanHandoffs >= 1);
  const aiHealth = await aiConsultant.health();
  assert.equal(aiHealth.mode, 'rules');
  assert.equal(aiHealth.projectAdapter.id, 'maestro');
  assert.equal(aiHealth.llmEnabled, false);
  assert.equal(aiHealth.rulesOnly, true);
  assert.equal(aiHealth.paidAiRequired, false);
  assert.equal(aiHealth.corePromptDocuments >= 2, true);
  assert.equal(aiHealth.projectPromptDocuments, 0);
  const readiness = await aiConsultantReadiness({
    crm,
    service: aiConsultant,
    greenApiClient: { enabled: false },
    env: { NODE_ENV: 'test', AI_CONSULTANT_TEST_ENDPOINTS: 'true' },
  });
  assert.equal(readiness.ready, true);
  assert.ok(readiness.checks.some((item) => item.name === 'green_api_credentials'));
  const runtimeCheck = readiness.checks.find((item) => item.name === 'runtime_mode');
  assert.equal(runtimeCheck.ok, true);
  assert.equal(runtimeCheck.mode, 'rules');
  assert.equal(runtimeCheck.paidAiRequired, false);
  assert.ok(runtimeCheck.message.includes('no external paid AI API'));
  const promptPackCheck = readiness.checks.find((item) => item.name === 'prompt_pack');
  assert.equal(promptPackCheck.ok, true);
  assert.equal(promptPackCheck.corePrompts >= 2, true);
  const projectPromptCheck = readiness.checks.find((item) => item.name === 'project_prompt_pack');
  assert.equal(projectPromptCheck.projectPrompts, 0);
  assert.equal(projectPromptCheck.projectReady, false);
  assert.ok(projectPromptCheck.missingProjectPrompts.includes('business_profile'));
  const disabledModule = createAiConsultantModule({
    crm,
    greenApiClient: { enabled: false },
    env: { NODE_ENV: 'production', AI_CONSULTANT_TEST_ENDPOINTS: 'false' },
  });
  let disabledStatus = null;
  const fakeRes = {
    writeHead(status) { disabledStatus = status; },
    end() {},
  };
  await disabledModule.handlePublicRoute({
    req: { headers: {}, [Symbol.asyncIterator]: async function* empty() {} },
    res: fakeRes,
    method: 'POST',
    url: new URL('http://localhost/api/ai-consultant/test-message'),
  });
  assert.equal(disabledStatus, 404);
  const cronModule = createAiConsultantModule({
    crm,
    greenApiClient: {
      enabled: false,
      async sendMessage() { return { skipped: true }; },
      async sendTyping() { return { skipped: true }; },
    },
    env: { NODE_ENV: 'production', AI_CONSULTANT_CRON_TOKEN: 'cron-secret', AI_CONSULTANT_TEST_ENDPOINTS: 'false' },
  });
  let cronStatus = null;
  let cronBody = '';
  const cronRes = {
    writeHead(status) { cronStatus = status; },
    end(body) { cronBody = body || ''; },
  };
  await cronModule.handlePublicRoute({
    req: { headers: {}, [Symbol.asyncIterator]: async function* body() { yield Buffer.from('{}'); } },
    res: cronRes,
    method: 'POST',
    url: new URL('http://localhost/api/ai-consultant/reminders/dispatch'),
  });
  assert.equal(cronStatus, 401);
  await cronModule.handlePublicRoute({
    req: { headers: { 'x-ai-consultant-cron-token': 'cron-secret' }, [Symbol.asyncIterator]: async function* body() { yield Buffer.from('{}'); } },
    res: cronRes,
    method: 'POST',
    url: new URL('http://localhost/api/ai-consultant/reminders/dispatch'),
  });
  assert.equal(cronStatus, 200);
  assert.equal(JSON.parse(cronBody).success, true);
  assert.equal(findDirection('Хочу на пробный урок по гитаре'), 'гитара');
  assert.deepEqual(extractClientProfile('Вокал для дочки 8 лет, удобно вечером'), {
    direction: 'вокал',
    studentAge: 8,
    customerType: 'child',
    preferredTime: 'evening',
  });
  assert.ok(profileSummary({ preferredTime: 'evening', customerType: 'child' }).includes('вечер'));
  assert.equal(parseProfileSummary('AI-портрет из WhatsApp: направление: вокал; возраст: 8; клиент: ребенок').studentAge, 8);
  assert.ok(trialNextActionDescription({
    lead: { name: 'Тест', whatsapp: '+7700' },
    profile: goalFollowup.profile,
    slots: aiConsultant.availableTrialSlots('вокал', 1),
    lastMessage: 'Для уверенности',
  }).includes('Действие: связаться с клиентом'));
  assert.equal(splitWhatsAppReply('Первое предложение. Второе предложение.'.repeat(40)).length <= 3, true);
  assert.ok(lessonReminderMessage({ studentName: 'Алия', startsAt: '2026-07-06T15:00:00.000Z' }).includes('Алия'));
  assert.ok(paymentReminderMessage({ studentName: 'Алия', dueAt: '2026-07-10T00:00:00.000Z' }).includes('администратор проверит платеж'));
  assert.ok(paymentReminderMessage({ scheduledAt: '2026-07-10T00:00:00.000Z' }).includes('10.07.2026'));
  assert.ok(new KnowledgeLoader().search('оплата платеж').some((item) => item.id === 'payment_rules'));
  assert.ok(new TrialSlotProvider().listAvailable('вокал').some((slot) => slot.id === 'slot_vocal_mon_1800'));
  const contentAudit = aiConsultant.contentAudit({ now: '2026-07-01T00:00:00.000Z' });
  assert.equal(contentAudit.ok, true);
  assert.equal(auditAiConsultantContent({
    knowledge: aiConsultant.knowledge,
    slots: aiConsultant.slots,
    projectConfig: aiConsultant.projectConfig,
    now: new Date('2026-07-01T00:00:00.000Z'),
  }).summary.trialSlots, 3);
  assert.equal(classifyIntent('Верните деньги, сумма неверная').intent, 'payment_dispute');
  assert.equal(classifyIntent('Верните деньги, сумма неверная').escalate, true);
  assert.ok(buildReminderPlan({ type: 'lesson', phone: '+7700', scheduledAt: '2026-07-06T10:00:00.000Z' }).dedupeKey.includes('lesson'));
  const reminderPlan = await aiConsultant.planReminder({
    phone: '+77000000003',
    type: 'payment',
    scheduledAt: '2026-07-01T10:00:00.000Z',
    amount: '25000 тг',
  });
  assert.equal(reminderPlan.plan.type, 'payment');
  const reminderNote = (await store.all('notes')).find((item) => item.entityId === maestroLead.id && item.type === 'reminder_plan');
  assert.equal(parseReminderPlan(reminderNote.text).type, 'payment');
  const dispatchedReminders = await aiConsultant.dispatchDueReminders({ now: '2026-07-06T10:00:00.000Z' });
  assert.equal(dispatchedReminders.dispatched, 1);
  const dispatchedAgain = await aiConsultant.dispatchDueReminders({ now: '2026-07-06T10:00:00.000Z' });
  assert.equal(dispatchedAgain.dispatched, 0);
  assert.ok((await store.all('notes')).some((item) => item.entityId === maestroLead.id && item.type === 'reminder_plan'));
  assert.ok((await store.all('notes')).some((item) => item.entityId === maestroLead.id && item.type === 'client_profile'));
  const materials = await crm.listForUser('materials', { limit: '100' }, manager);
  assert.ok(Array.isArray(materials.data));

  const { diagnostics, deal } = await crm.addDiagnostics(lead.id, {
    problems: ['склад не сходится', 'клиенты не возвращаются'],
    answers: { warehouse: true, reminders: true },
    estimatedAmount: 300000,
  });

  assert.ok(diagnostics.recommendedSections.includes('warehouse'));
  assert.ok(diagnostics.recommendedSections.includes('reminders'));
  assert.equal((await store.all('deals')).length, 1);

  const proposal = await crm.createProposal(deal.id, {
    amount: 350000,
    sections: diagnostics.recommendedSections,
  });
  assert.equal(proposal.status, 'sent');

  await assert.rejects(() => crm.updateDealAmount(deal.id, { amount: 320000 }), /reason/);
  const repricedDeal = await crm.updateDealAmount(deal.id, {
    amount: 320000,
    reason: 'Согласовали стартовый набор без склада',
  });
  assert.equal(repricedDeal.amount, 320000);
  const assignedDeal = await crm.updateDealResponsibles(deal.id, {
    managerId: 'usr_manager',
    implementationId: 'usr_developer',
  });
  assert.equal(assignedDeal.deal.responsibleId, 'usr_manager');
  assert.equal(assignedDeal.deal.implementationResponsibleId, 'usr_developer');

  const prepayment = await crm.recordPrepayment(deal.id, {
    amount: 100000,
    method: 'kaspi',
  });
  assert.equal(prepayment.amount, 100000);
  assert.equal((await store.all('implementationProjects')).length, 0);

  const result = await crm.recordPayment(deal.id, {
    amount: 220000,
    method: 'kaspi',
  });

  assert.equal(result.client.status, 'implementation');
  assert.equal((await store.all('implementationProjects')).length, 1);
  assert.equal((await store.all('payments')).length, 2);
  assert.ok((await store.all('tasks')).some((task) => task.type === 'handoff_implementation'));
  const project = (await store.all('implementationProjects'))[0];
  const dataRequest = await crm.createDataCollectionRequest(project.id);
  assert.equal(dataRequest.status, 'open');
  assert.ok(dataRequest.items.length >= 4);
  const updatedProject = await crm.updateChecklistItem(project.id, 0, {
    done: true,
    comment: 'Данные получены',
  });
  assert.equal(updatedProject.checklist[0].done, true);
  const implementationInConfiguration = await crm.updateImplementationStatus(project.id, {
    status: 'configuration',
  });
  assert.equal(implementationInConfiguration.status, 'configuration');
  await assert.rejects(() => crm.updateImplementationStatus(project.id, { status: 'paused' }), /Comment/);
  const implementationInSupport = await crm.updateImplementationStatus(project.id, {
    status: 'support',
    comment: 'Запуск проведен',
  });
  assert.equal(implementationInSupport.status, 'support');
  assert.equal(project.responsibleId, 'usr_developer');
  const managementTask = await crm.createManagementTask({
    title: 'Проверить интеграцию кассы после внедрения',
    responsibleId: 'usr_developer',
    projectId: project.id,
    clientId: result.client.id,
    priority: 'high',
  }, 'usr_supervisor');
  assert.equal(managementTask.createdById, 'usr_supervisor');
  const developerWorkbench = await crm.developerWorkbench('usr_developer');
  assert.equal(developerWorkbench.counters.processedRequests, 1);
  assert.ok(developerWorkbench.tasks.some((item) => item.id === managementTask.id));

  const leadDetail = await crm.detail('leads', lead.id);
  assert.equal(leadDetail.deals.length, 1);
  assert.ok(leadDetail.tasks.length >= 1);
  const dealDetail = await crm.detail('deals', deal.id);
  assert.equal(dealDetail.lead.id, lead.id);
  assert.equal(dealDetail.implementationProject.id, project.id);
  const clientDetail = await crm.detail('clients', result.client.id);
  assert.equal(clientDetail.implementationProjects.length, 1);
  assert.equal(clientDetail.payments.length, 2);
  const projectDetail = await crm.detail('implementationProjects', project.id);
  assert.equal(projectDetail.client.id, result.client.id);
  assert.equal(projectDetail.dataCollectionRequests.length, 1);

  const supportTicket = await crm.createSupportTicket({
    clientId: result.client.id,
    projectId: project.id,
    type: 'bug',
    title: 'Проверить ошибку в кассе',
    description: 'После запуска клиент сообщил о проблеме',
  });
  assert.equal(supportTicket.status, 'open');
  const assignedTicket = await crm.updateSupportTicket(supportTicket.id, {
    responsibleId: 'usr_developer',
    status: 'in_progress',
    comment: 'Передано программисту',
  });
  assert.equal(assignedTicket.responsibleId, 'usr_developer');
  assert.equal(assignedTicket.status, 'in_progress');
  const developerWorkbenchWithTicket = await crm.developerWorkbench('usr_developer');
  assert.ok(developerWorkbenchWithTicket.supportTickets.some((item) => item.id === supportTicket.id));
  const developerNotifications = await crm.notificationsForUser('usr_developer');
  assert.ok(developerNotifications.unreadCount >= 1);
  assert.ok(developerNotifications.notifications.some((item) => item.type === 'support_ticket_assigned'));
  const readNotification = await crm.markNotificationRead(developerNotifications.notifications[0].id, 'usr_developer');
  assert.equal(readNotification.status, 'read');
  await assert.rejects(() => crm.closeSupportTicket(supportTicket.id), /result/);
  const closedTicket = await crm.closeSupportTicket(supportTicket.id, {
    result: 'Исправлено и проверено на тестовом заказе',
  });
  assert.equal(closedTicket.status, 'closed');
  const ticketDetail = await crm.detail('supportTickets', supportTicket.id);
  assert.equal(ticketDetail.client.id, result.client.id);
  const managerScopedLeads = await crm.listForUser('leads', {}, manager);
  assert.equal(managerScopedLeads.meta.total, 13);
  const developerScopedLeads = await crm.listForUser('leads', {}, developer);
  assert.equal(developerScopedLeads.meta.total, 0);
  const developerScopedClients = await crm.listForUser('clients', {}, developer);
  assert.equal(developerScopedClients.meta.total, 1);
  assert.equal(developerScopedClients.data[0].id, result.client.id);
  const developerScopedProjects = await crm.listForUser('implementationProjects', {}, developer);
  assert.equal(developerScopedProjects.meta.total, 1);
  const developerScopedTickets = await crm.listForUser('supportTickets', {}, developer);
  assert.equal(developerScopedTickets.meta.total, 1);
  const developerClientDetail = await crm.detailForUser('clients', result.client.id, developer);
  assert.equal(developerClientDetail.client.id, result.client.id);
  await assert.rejects(() => crm.detailForUser('leads', lead.id, developer), /Record not found/);

  const subscription = await crm.createSubscription(result.client.id, {
    amount: 20000,
    packageId: 'business',
  });
  assert.equal(subscription.status, 'active');
  const renewed = await crm.renewSubscription(subscription.id, { comment: 'Оплата за следующий месяц' });
  assert.equal(renewed.status, 'active');
  const debt = await crm.createDebt(result.client.id, {
    amount: 20000,
    reason: 'Не оплачено продление',
    dueAt: new Date().toISOString(),
  });
  assert.equal(debt.status, 'open');
  const paidDebt = await crm.markDebtPaid(debt.id, { comment: 'Оплачено Kaspi' });
  assert.equal(paidDebt.status, 'paid');
  const supportNotifications = await crm.notificationsForUser('usr_support');
  assert.ok(supportNotifications.notifications.some((item) => item.type === 'debt_created'));
  const readAll = await crm.markAllNotificationsRead('usr_support');
  assert.ok(readAll.updated >= 1);
  const timeline = await crm.clientTimeline(result.client.id);
  assert.ok(timeline.some((item) => item.type === 'payment'));
  assert.ok(timeline.some((item) => item.type === 'support_ticket'));
  assert.ok(timeline.some((item) => item.type === 'debt'));

  const communication = await crm.addCommunication({
    leadId: lead.id,
    dealId: deal.id,
    channel: 'call',
    result: 'interested',
    responsibleId: 'usr_manager',
  });
  assert.equal(communication.result, 'interested');
  const deletedCommunication = await crm.deleteCommunication(communication.id, 'usr_manager');
  assert.equal(deletedCommunication.id, communication.id);
  assert.ok(!(await store.all('communications')).some((item) => item.id === communication.id));
  assert.ok((await store.all('tasks')).some((task) => task.type === 'diagnostics'));

  const tasks = await store.all('tasks');
  await assert.rejects(() => crm.completeTask(tasks[0].id), /Task result is required/);
  const task = await crm.completeTask(tasks[0].id, { result: 'contact checked' });
  assert.equal(task.status, 'done');

  await assert.rejects(
    () => crm.rescheduleTask(tasks[1].id, { dueAt: new Date().toISOString() }),
    /comment/,
  );

  const analytics = await crm.analyticsSummary();
  assert.equal(analytics.leads.total, 13);
  assert.equal(analytics.payments.paidAmount, 320000);
  assert.equal(analytics.subscriptions.active, 1);
  assert.equal(analytics.debts.open, 0);

  const workbench = await crm.managerToday('usr_manager');
  assert.ok(workbench.counters);
  const workload = await crm.teamWorkload();
  const developerLoad = workload.find((item) => item.user.id === 'usr_developer');
  assert.ok(developerLoad);
  assert.ok(developerLoad.counters.openTasks >= 1);
  assert.equal(developerLoad.user.apiToken, undefined);

  const demo = await crm.demoSnapshot();
  assert.ok(demo.note.includes('hides real names'));

  const edutechLead = await crm.createLead({
    name: 'Maestro Music School',
    direction: DIRECTIONS.EDUTECH,
    niche: 'music_school',
    city: 'Актобе',
    phone: '+77000000003',
    currentAccounting: 'таблицы и WhatsApp',
    pain: 'расписание, оплаты и долги родителей',
  });
  assert.equal(edutechLead.direction, DIRECTIONS.EDUTECH);
  const edutechFlow = await crm.addDiagnostics(edutechLead.id, {
    problems: ['расписание преподавателей', 'оплаты и долги родителей', 'пробные уроки'],
    estimatedAmount: 250000,
  });
  assert.equal(edutechFlow.deal.direction, DIRECTIONS.EDUTECH);
  assert.ok(edutechFlow.diagnostics.recommendedSections.includes('students_parents_programs'));
  assert.ok(edutechFlow.diagnostics.recommendedSections.includes('schedule_teachers_rooms'));
  assert.ok(edutechFlow.diagnostics.recommendedSections.includes('payments_subscriptions_debts'));
  const edutechPaymentResult = await crm.recordPayment(edutechFlow.deal.id, {
    amount: 125000,
    method: 'kaspi',
  });
  const edutechProject = (await store.all('implementationProjects')).find((item) => item.dealId === edutechFlow.deal.id);
  assert.ok(edutechProject);
  assert.equal(edutechPaymentResult.client.direction, DIRECTIONS.EDUTECH);
  assert.ok(edutechProject.checklist.some((item) => item.title.includes('преподавателей')));
  const edutechDataRequest = await crm.createDataCollectionRequest(edutechProject.id);
  assert.ok(edutechDataRequest.items.some((item) => item.key === 'programs_tariffs'));
  await assert.rejects(() => crm.createLead({
    name: 'Wrong School',
    direction: DIRECTIONS.EDUTECH,
    niche: 'oil_change',
    city: 'Актобе',
    phone: '+77000000004',
  }), /Unknown edutech niche/);

  fs.unlinkSync(tmpDb);
  fs.rmSync(projectPromptDir, { recursive: true, force: true });
  fs.rmSync(scaffoldBaseDir, { recursive: true, force: true });
  console.log('Smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
