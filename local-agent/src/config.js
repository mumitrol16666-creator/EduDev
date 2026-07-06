import fs from 'node:fs';
import path from 'node:path';

loadDotEnv(path.resolve(process.cwd(), '.env'));

export const config = {
  crmApiUrl: trimSlash(env('CRM_API_URL', 'http://127.0.0.1:4100')),
  token: env('LOCAL_AGENT_TOKEN', ''),
  userDataDir: path.resolve(process.cwd(), env('WHATSAPP_USER_DATA_DIR', './.whatsapp-profile')),
  pollMs: positiveInt(env('LOCAL_AGENT_POLL_MS', '8000'), 8000),
  outboxLimit: positiveInt(env('LOCAL_AGENT_OUTBOX_LIMIT', '10'), 10),
  headless: bool(env('LOCAL_AGENT_HEADLESS', 'false')),
  incomingEnabled: bool(env('LOCAL_AGENT_INCOMING_ENABLED', 'false')),
  sendEnabled: bool(env('LOCAL_AGENT_SEND_ENABLED', 'true')),
  countryPrefix: env('LOCAL_AGENT_PHONE_COUNTRY_PREFIX', '7'),
};

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}

function env(key, fallback) {
  return process.env[key] ?? fallback;
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function bool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
