async function aiConsultantAnalytics(crm) {
  const [auditLogs, notes, tasks, communications] = await Promise.all([
    crm.store.all('auditLogs'),
    crm.store.all('notes'),
    crm.store.all('tasks'),
    crm.store.all('communications'),
  ]);
  const aiActions = auditLogs.filter((item) => item.action === 'ai_consultant_action');
  const byNoteType = countBy(aiActions, (item) => item.details?.noteType || 'unknown');
  return {
    actions: aiActions.length,
    sent: aiActions.filter((item) => item.details?.shouldSend && !item.details?.suppressed).length,
    suppressed: aiActions.filter((item) => item.details?.suppressed).length,
    humanHandoffs: notes.filter((item) => item.type === 'human_handoff').length,
    optOuts: notes.filter((item) => item.type === 'opt_out').length,
    voiceMessages: notes.filter((item) => item.type === 'voice_message' || item.type === 'voice_transcript').length,
    reminderPlans: notes.filter((item) => item.type === 'reminder_plan').length,
    openAiTasks: tasks.filter((item) => item.status !== 'done' && String(item.title || '').match(/WhatsApp|AI|оплат|пробн|диалог/i)).length,
    whatsappCommunications: communications.filter((item) => item.channel === 'whatsapp').length,
    byNoteType,
  };
}

function countBy(items, fn) {
  return items.reduce((acc, item) => {
    const key = fn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

module.exports = { aiConsultantAnalytics };
