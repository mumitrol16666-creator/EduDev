async function logAiAction(crm, payload = {}) {
  if (!crm?.audit) return null;
  await crm.audit('ai_consultant_action', payload.entityType || 'lead', payload.entityId || payload.leadId || 'unknown', {
    leadId: payload.leadId || null,
    messageId: payload.messageId || null,
    intent: payload.intent || null,
    noteType: payload.noteType || null,
    shouldSend: Boolean(payload.shouldSend),
    suppressed: Boolean(payload.suppressed),
    delivery: payload.delivery || null,
    profile: payload.profile || null,
    audio: payload.audio || null,
  });
  return { logged: true };
}

module.exports = { logAiAction };
