const { loadEnv } = require('../../config/env');
const { disconnectPrisma } = require('../../config/prisma');
const { createStore } = require('../../store/storeFactory');
const { CrmService } = require('../../services/crmService');
const { GreenApiClient } = require('./greenApiClient');
const { dispatchDueReminders } = require('./reminderDispatcher');

loadEnv();

async function main() {
  const store = createStore();
  const crm = new CrmService(store);
  const greenApiClient = new GreenApiClient(process.env);
  const now = process.env.AI_CONSULTANT_DISPATCH_NOW
    ? new Date(process.env.AI_CONSULTANT_DISPATCH_NOW)
    : new Date();
  const limit = Number(process.env.AI_CONSULTANT_DISPATCH_LIMIT || 20);

  const result = await dispatchDueReminders({ crm, greenApiClient, now, limit });
  process.stdout.write(`${JSON.stringify({ success: true, result }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({ success: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma().catch(() => {});
  });
