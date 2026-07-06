const DEFAULT_MAX_MESSAGE_LENGTH = 450;
const DEFAULT_MAX_PARTS = 3;

function splitWhatsAppReply(reply, options = {}) {
  const maxLength = Number(options.maxLength || DEFAULT_MAX_MESSAGE_LENGTH);
  const maxParts = Number(options.maxParts || DEFAULT_MAX_PARTS);
  const text = String(reply || '').trim();
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = [];
  let current = '';

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (`${current} ${sentence}`.length <= maxLength) {
      current = `${current} ${sentence}`;
    } else {
      parts.push(current);
      current = sentence;
    }
    if (parts.length === maxParts - 1) break;
  }

  if (current && parts.length < maxParts) parts.push(current);
  if (parts.length === maxParts && sentences.join(' ').length > parts.join(' ').length) {
    parts[maxParts - 1] = trimToLength(parts[maxParts - 1], maxLength);
  }

  return parts.length ? parts : [trimToLength(text, maxLength)];
}

function trimToLength(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function humanDelayMs(message, env = process.env) {
  if (env.AI_CONSULTANT_SEND_DELAY_MS !== undefined) {
    const configured = Number(env.AI_CONSULTANT_SEND_DELAY_MS);
    if (Number.isFinite(configured) && configured >= 0) return configured;
  }
  const length = String(message || '').length;
  return Math.min(1200, Math.max(250, length * 8));
}

module.exports = { splitWhatsAppReply, humanDelayMs };
