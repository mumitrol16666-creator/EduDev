function parseGreenApiWebhook(payload = {}) {
  const body = payload.body || payload.messageData || {};
  const senderData = payload.senderData || {};
  const messageData = payload.messageData || {};
  const typeMessage = messageData.typeMessage || payload.typeMessage || body.typeMessage || 'textMessage';
  const chatId = senderData.chatId || payload.chatId || payload.sender || '';
  const senderName = senderData.senderName || senderData.chatName || payload.senderName || null;
  const isOutgoing = Boolean(payload.instanceData?.wid && senderData.sender === payload.instanceData.wid)
    || payload.typeWebhook === 'outgoingMessageReceived'
    || payload.typeWebhook === 'outgoingAPIMessageReceived';

  const textMessageData = messageData.textMessageData || body.textMessageData || {};
  const extendedTextMessageData = messageData.extendedTextMessageData || body.extendedTextMessageData || {};
  const quotedMessage = messageData.quotedMessage || {};
  const fileMessageData = messageData.fileMessageData || body.fileMessageData || {};

  const text = [
    textMessageData.textMessage,
    extendedTextMessageData.text,
    quotedMessage.textMessage,
    payload.text,
  ].find((value) => typeof value === 'string' && value.trim()) || '';

  return {
    id: payload.idMessage || payload.messageId || null,
    type: typeMessage,
    chatId,
    phone: normalizePhone(chatId || senderData.sender || payload.sender),
    senderName,
    text: text.trim(),
    transcript: payload.transcript || fileMessageData.caption || null,
    fileUrl: fileMessageData.downloadUrl || fileMessageData.fileUrl || null,
    mimeType: fileMessageData.mimeType || null,
    raw: payload,
    isOutgoing,
    receivedAt: payload.timestamp ? new Date(Number(payload.timestamp) * 1000).toISOString() : new Date().toISOString(),
  };
}

function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+${digits}`;
}

function isAudioMessage(message) {
  return message.type === 'audioMessage' || String(message.mimeType || '').startsWith('audio/');
}

module.exports = { parseGreenApiWebhook, normalizePhone, isAudioMessage };
