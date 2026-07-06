const { withRetry } = require('./retry');

async function dispatchDueReminders({ crm, greenApiClient, now = new Date(), limit = 20 }) {
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
    const sent = await withRetry(() => greenApiClient.sendMessage(chatId, item.plan.message), {
      attempts: process.env.AI_CONSULTANT_SEND_RETRIES || 2,
      delayMs: process.env.AI_CONSULTANT_RETRY_DELAY_MS || 100,
    });
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
