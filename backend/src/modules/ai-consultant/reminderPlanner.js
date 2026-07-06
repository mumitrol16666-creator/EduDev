const { lessonReminderMessage, paymentReminderMessage } = require('./reminderTemplates');

function buildReminderPlan(input = {}) {
  const type = input.type === 'payment' ? 'payment' : 'lesson';
  const scheduledAt = input.scheduledAt || input.startsAt || input.dueAt || new Date().toISOString();
  const message = type === 'payment' ? paymentReminderMessage(input) : lessonReminderMessage(input);
  return {
    type,
    scheduledAt,
    chatId: input.chatId || null,
    phone: input.phone || null,
    leadId: input.leadId || null,
    clientId: input.clientId || null,
    message,
    dedupeKey: [
      type,
      input.leadId || input.clientId || input.phone || input.chatId || 'unknown',
      scheduledAt.slice(0, 10),
    ].join(':'),
  };
}

async function createReminderTask(crmTools, lead, input = {}) {
  const plan = buildReminderPlan({
    ...input,
    leadId: input.leadId || lead.id,
    phone: input.phone || lead.phone,
  });
  const title = plan.type === 'payment'
    ? `AI reminder: оплата ${lead.name}`
    : `AI reminder: урок ${lead.name}`;
  const task = await crmTools.createHumanTask(lead, `${title} (${plan.scheduledAt})`, input.priority || 'medium');
  await crmTools.addLeadNote(lead, 'reminder_plan', [
    `План напоминания ${plan.dedupeKey}: ${plan.message}`,
    '```json',
    JSON.stringify(plan),
    '```',
  ].join('\n'));
  return { plan, task };
}

module.exports = { buildReminderPlan, createReminderTask };
