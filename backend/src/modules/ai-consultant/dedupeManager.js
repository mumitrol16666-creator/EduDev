async function isDuplicateMessage(crm, message) {
  if (!message.id) return false;
  const auditLogs = await crm.store.all('auditLogs');
  return auditLogs.some((item) => {
    return item.action === 'ai_consultant_message_seen' && item.details?.messageId === message.id;
  });
}

async function markMessageSeen(crm, message) {
  if (!message.id || !crm?.audit) return null;
  await crm.audit('ai_consultant_message_seen', 'whatsapp_message', message.id, {
    messageId: message.id,
    chatId: message.chatId,
    phone: message.phone,
    type: message.type,
  });
  return { seen: true };
}

module.exports = { isDuplicateMessage, markMessageSeen };
