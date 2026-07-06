const ALLOWED_AI_ACTIONS = Object.freeze({
  ADD_NOTE: 'add_note',
  CREATE_TASK: 'create_task',
  UPDATE_PROFILE: 'update_profile',
  SET_HANDOFF: 'set_handoff',
  PLAN_REMINDER: 'plan_reminder',
});

function normalizeAiActionContract(value = {}) {
  const crmActions = Array.isArray(value.crmActions)
    ? value.crmActions.map(normalizeCrmAction).filter(Boolean).slice(0, 5)
    : [];

  return {
    reply: stringOrEmpty(value.reply),
    note: stringOrEmpty(value.note || value.reply),
    noteType: stringOrDefault(value.noteType, 'llm_consultation'),
    nextAction: value.nextAction ? String(value.nextAction).trim() : null,
    confidence: clampConfidence(value.confidence),
    handoffRequired: Boolean(value.handoffRequired),
    crmActions,
    reminderPlan: normalizeReminderPlan(value.reminderPlan),
  };
}

function normalizeCrmAction(action = {}) {
  const type = String(action.type || '').trim();
  if (!Object.values(ALLOWED_AI_ACTIONS).includes(type)) return null;

  return {
    type,
    reason: stringOrEmpty(action.reason),
    priority: normalizePriority(action.priority),
    payload: plainObject(action.payload),
  };
}

function normalizeReminderPlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = String(value.type || '').trim();
  const scheduledAt = value.scheduledAt ? String(value.scheduledAt).trim() : '';
  if (!type || !scheduledAt) return null;
  return {
    type,
    scheduledAt,
    payload: plainObject(value.payload),
  };
}

function normalizePriority(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function stringOrEmpty(value) {
  return String(value || '').trim();
}

function stringOrDefault(value, fallback) {
  const normalized = stringOrEmpty(value);
  return normalized || fallback;
}

function clampConfidence(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

module.exports = { ALLOWED_AI_ACTIONS, normalizeAiActionContract };
