const OUTBOX_ENTITY_TYPE = 'ai_local_outbox';
const OUTBOX_PENDING = 'local_outbox_pending';
const OUTBOX_SENT = 'local_outbox_sent';
const OUTBOX_FAILED = 'local_outbox_failed';

async function enqueueLocalOutbound(crm, payload = {}) {
  const messages = (payload.messages || []).map((message) => String(message || '').trim()).filter(Boolean);
  if (!messages.length) return null;
  return await crm.addNote({
    entityType: OUTBOX_ENTITY_TYPE,
    entityId: payload.leadId || payload.chatId || 'local-agent',
    type: OUTBOX_PENDING,
    text: fencedJson({
      chatId: payload.chatId || null,
      phone: payload.phone || phoneFromChatId(payload.chatId),
      messages,
      context: payload.context || 'reply',
      leadId: payload.leadId || null,
      source: payload.source || 'ai_consultant',
      createdAt: new Date().toISOString(),
    }),
    authorId: 'system',
  });
}

async function listLocalOutbox(crm, options = {}) {
  const limit = Math.min(Number(options.limit || 20), 100);
  const notes = await crm.store.all('notes');
  return notes
    .filter((note) => note.entityType === OUTBOX_ENTITY_TYPE && note.type === OUTBOX_PENDING)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, limit)
    .map((note) => ({
      id: note.id,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      ...parseFencedJson(note.text),
    }));
}

async function markLocalOutboxSent(crm, id, payload = {}) {
  return await markLocalOutbox(crm, id, OUTBOX_SENT, payload);
}

async function markLocalOutboxFailed(crm, id, payload = {}) {
  return await markLocalOutbox(crm, id, OUTBOX_FAILED, payload);
}

async function markLocalOutbox(crm, id, type, payload = {}) {
  const note = await crm.store.get('notes', id);
  if (!note || note.entityType !== OUTBOX_ENTITY_TYPE) {
    const error = new Error('Local outbox item not found');
    error.status = 404;
    throw error;
  }
  const previous = parseFencedJson(note.text);
  return await crm.store.update('notes', id, {
    type,
    text: fencedJson({
      ...previous,
      result: payload,
      completedAt: new Date().toISOString(),
    }),
  });
}

function fencedJson(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function parseFencedJson(text = '') {
  const match = String(text).match(/```json\s*([\s\S]+?)\s*```/);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return {};
  }
}

function phoneFromChatId(chatId = '') {
  const digits = String(chatId).replace(/@c\.us$/i, '').replace(/\D/g, '');
  return digits ? `+${digits}` : null;
}

module.exports = {
  OUTBOX_PENDING,
  OUTBOX_SENT,
  OUTBOX_FAILED,
  enqueueLocalOutbound,
  listLocalOutbox,
  markLocalOutboxSent,
  markLocalOutboxFailed,
};
