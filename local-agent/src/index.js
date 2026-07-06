import { config } from './config.js';
import { CrmApi } from './api.js';
import { openWhatsApp, readUnreadMessages, sendMessage } from './whatsappWeb.js';

const api = new CrmApi({ baseUrl: config.crmApiUrl, token: config.token });

async function main() {
  if (!config.token) throw new Error('LOCAL_AGENT_TOKEN is required');
  const whatsapp = await openWhatsApp(config);
  console.log(`[local-agent] WhatsApp Web opened. send=${config.sendEnabled} incoming=${config.incomingEnabled}`);

  const seenIncoming = new Set();
  while (true) {
    try {
      if (config.incomingEnabled) {
        await processIncoming(whatsapp.page, seenIncoming);
      }
      if (config.sendEnabled) {
        await processOutbox(whatsapp.page);
      }
    } catch (error) {
      console.error(`[local-agent] ${error.stack || error.message}`);
    }
    await sleep(config.pollMs);
  }
}

async function processIncoming(page, seenIncoming) {
  const unread = await readUnreadMessages(page, { limit: 5 });
  for (const item of unread) {
    if (!item.phone) {
      console.log(`[local-agent] skipped incoming without phone: ${item.name}`);
      continue;
    }
    const key = `${item.name}:${item.text}`;
    if (seenIncoming.has(key)) continue;
    seenIncoming.add(key);
    console.log(`[local-agent] incoming from ${item.name}: ${item.text}`);
    await api.sendIncomingMessage({
      name: item.name,
      phone: item.phone,
      text: item.text,
    });
  }
}

async function processOutbox(page) {
  const items = await api.fetchOutbox(config.outboxLimit);
  for (const item of items) {
    try {
      for (const message of item.messages || []) {
        await sendMessage(page, item, message);
      }
      await api.markSent(item.id, { sentBy: 'local-agent', messages: item.messages?.length || 0 });
      console.log(`[local-agent] sent outbox ${item.id}`);
    } catch (error) {
      await api.markFailed(item.id, { error: error.message });
      console.error(`[local-agent] failed outbox ${item.id}: ${error.message}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`[local-agent] fatal: ${error.stack || error.message}`);
  process.exitCode = 1;
});
