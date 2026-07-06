const { splitWhatsAppReply } = require('./responseFormatter');

const CHANNEL_MODES = Object.freeze({
  OFFICIAL_API: 'official_api',
  GREEN_API_SAFE: 'green_api_safe',
  BROWSER_LOCAL: 'browser_local',
  DRY_RUN: 'dry_run',
});

const OUTBOUND_POLICIES = Object.freeze({
  INBOUND_ONLY: 'inbound_only',
  ALLOW_REMINDERS: 'allow_reminders',
  ALLOW_ALL: 'allow_all',
});

function loadChannelPolicy(env = process.env) {
  const mode = normalizeMode(env.AI_CONSULTANT_CHANNEL_MODE || CHANNEL_MODES.GREEN_API_SAFE);
  const outboundPolicy = normalizeOutboundPolicy(env.AI_CONSULTANT_OUTBOUND_POLICY || defaultOutboundPolicy(mode));
  const maxParts = positiveInt(env.AI_CONSULTANT_MAX_REPLY_PARTS, mode === CHANNEL_MODES.GREEN_API_SAFE ? 2 : 3);
  const maxLength = positiveInt(env.AI_CONSULTANT_MAX_REPLY_LENGTH, mode === CHANNEL_MODES.GREEN_API_SAFE ? 420 : 450);
  const appendOptOutFooter = parseBoolean(env.AI_CONSULTANT_APPEND_OPT_OUT_FOOTER, false);
  const optOutFooter = String(env.AI_CONSULTANT_OPT_OUT_FOOTER || 'Если не хотите получать сообщения, напишите «стоп».').trim();

  return {
    mode,
    outboundPolicy,
    transport: transportForMode(mode),
    riskLevel: riskLevelForMode(mode),
    maxParts,
    maxLength,
    appendOptOutFooter,
    optOutFooter,
    canSend: mode !== CHANNEL_MODES.DRY_RUN,
    queueOnly: mode === CHANNEL_MODES.BROWSER_LOCAL,
  };
}

function prepareOutboundMessages(reply, options = {}) {
  const env = options.env || process.env;
  const context = options.context || 'reply';
  const policy = options.policy || loadChannelPolicy(env);
  if (!policy.canSend) {
    return { allowed: false, skipped: true, reason: 'channel dry-run mode', policy, messages: [] };
  }
  if (!isContextAllowed(context, policy.outboundPolicy)) {
    return { allowed: false, skipped: true, reason: `outbound policy blocks ${context}`, policy, messages: [] };
  }

  let messages = splitWhatsAppReply(reply, {
    maxLength: policy.maxLength,
    maxParts: policy.maxParts,
  });
  if (policy.appendOptOutFooter && context === 'reply') {
    messages = appendFooter(messages, policy.optOutFooter, policy.maxLength);
  }
  return { allowed: true, policy, messages };
}

function isContextAllowed(context, outboundPolicy) {
  if (context === 'reply') return true;
  if (outboundPolicy === OUTBOUND_POLICIES.ALLOW_ALL) return true;
  if (outboundPolicy === OUTBOUND_POLICIES.ALLOW_REMINDERS && context === 'reminder') return true;
  return false;
}

function appendFooter(messages, footer, maxLength) {
  if (!footer || !messages.length) return messages;
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];
  if (last.toLowerCase().includes('стоп')) return messages;
  const withFooter = `${last}\n\n${footer}`;
  if (withFooter.length <= maxLength) {
    return messages.map((message, index) => (index === lastIndex ? withFooter : message));
  }
  return messages;
}

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return Object.values(CHANNEL_MODES).includes(mode) ? mode : CHANNEL_MODES.GREEN_API_SAFE;
}

function normalizeOutboundPolicy(value) {
  const policy = String(value || '').trim().toLowerCase();
  return Object.values(OUTBOUND_POLICIES).includes(policy) ? policy : OUTBOUND_POLICIES.ALLOW_REMINDERS;
}

function defaultOutboundPolicy(mode) {
  if (mode === CHANNEL_MODES.OFFICIAL_API) return OUTBOUND_POLICIES.ALLOW_ALL;
  return OUTBOUND_POLICIES.ALLOW_REMINDERS;
}

function transportForMode(mode) {
  if (mode === CHANNEL_MODES.BROWSER_LOCAL) return 'local_browser_agent';
  if (mode === CHANNEL_MODES.DRY_RUN) return 'none';
  if (mode === CHANNEL_MODES.OFFICIAL_API) return 'official_whatsapp_business_platform';
  return 'green_api';
}

function riskLevelForMode(mode) {
  if (mode === CHANNEL_MODES.OFFICIAL_API) return 'low';
  if (mode === CHANNEL_MODES.GREEN_API_SAFE) return 'medium';
  if (mode === CHANNEL_MODES.BROWSER_LOCAL) return 'medium_high';
  return 'none';
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

module.exports = {
  CHANNEL_MODES,
  OUTBOUND_POLICIES,
  loadChannelPolicy,
  prepareOutboundMessages,
};
