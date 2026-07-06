const { withRetry } = require('./retry');
const { loadChannelPolicy, prepareOutboundMessages } = require('./channelPolicy');

async function dispatchDueReminders({ crm, greenApiClient, now = new Date(), limit = 20, env = process.env }) {
  const policy = loadChannelPolicy(env);
  const notes = await crm.store.all('notes');
  const auditLogs = await crm.store.all('auditLogs');
  const sentKeys = new Set(
    auditLogs
      .filter((item) => item.action === 'ai_consultant_reminder_sent')
      .map((item) => item.details?.dedupeKey)
      .filter(Boolean),
  );
  const duePlans = notes
    .filter((note) => note.type === 'reminder_plan')
    .map((note) => ({ note, plan: parseReminderPlan(note.text) }))
    .filter((item) => item.plan)
    .filter((item) => new Date(item.plan.scheduledAt).getTime() <= now.getTime())
    .filter((item) => !sentKeys.has(item.plan.dedupeKey))
    .slice(0, limit);

  const results = [];
  for (const item of duePlans) {
    const chatId = item.plan.chatId || phoneToChatId(item.plan.phone);
    const outbound = prepareOutboundMessages(item.plan.message, { env, policy, context: 'reminder' });
    let sent = null;
    if (!outbound.allowed) {
      sent = { skipped: true, reason: outbound.reason, policy: outbound.policy };
    } else if (outbound.policy.queueOnly) {
      sent = { queued: true, transport: outbound.policy.transport, messages: outbound.messages, policy: outbound.policy };
    } else {
      sent = await withRetry(async () => {
        const sentMessages = [];
        for (const message of outbound.messages) {
          sentMessages.push(await greenApiClient.sendMessage(chatId, message));
        }
        return sentMessages;
      }, {
        attempts: env.AI_CONSULTANT_SEND_RETRIES || 2,
        delayMs: env.AI_CONSULTANT_RETRY_DELAY_MS || 100,
      });
    }
    await crm.audit('ai_consultant_reminder_sent', 'lead', item.plan.leadId || item.note.entityId, {
      ...item.plan,
      chatId,
      sent,
      noteId: item.note.id,
    });
    results.push({ plan: item.plan, chatId, sent });
  }
  return { dispatched: results.length, results };
}

function parseReminderPlan(text = '') {
  const match = String(text).match(/```json\s*([\s\S]+?)\s*```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function phoneToChatId(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  return digits ? `${digits}@c.us` : '';
}

module.exports = { dispatchDueReminders, parseReminderPlan, phoneToChatId };
