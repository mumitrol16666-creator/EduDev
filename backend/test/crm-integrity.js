const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStore, EMPTY_DB } = require('../src/store/jsonStore');
const { CrmService } = require('../src/services/crmService');

async function main() {
  const dbPath = path.join(os.tmpdir(), `edudev-crm-integrity-${process.pid}.json`);
  const store = new JsonStore(dbPath);
  const now = new Date().toISOString();
  store.replaceAll({
    ...structuredClone(EMPTY_DB),
    users: [
      { id: 'manager-a', name: 'Manager A', role: 'manager', status: 'active', createdAt: now, updatedAt: now },
      { id: 'manager-b', name: 'Manager B', role: 'manager', status: 'active', createdAt: now, updatedAt: now },
      { id: 'owner', name: 'Owner', role: 'owner', status: 'active', createdAt: now, updatedAt: now },
    ],
  });

  const crm = new CrmService(store);
  try {
    const lead = await crm.createLead({
      name: 'Integrity Test',
      direction: 'autotech',
      niche: 'oil_change',
      city: 'Актобе',
      phone: '77000000000',
      responsibleId: 'manager-a',
    }, 'manager-a');

    await crm.assertRecordAccess('leads', lead.id, { id: 'manager-a', role: 'manager' });
    await assert.rejects(
      () => crm.assertRecordAccess('leads', lead.id, { id: 'manager-b', role: 'manager' }),
      (error) => error.status === 404,
    );

    const result = await crm.addDiagnostics(lead.id, {
      problems: ['Нет единого учёта'],
      estimatedAmount: 450000,
    }, 'manager-a');
    assert.equal(result.diagnostics.dealId, result.deal.id);
    await assert.rejects(
      () => crm.addDiagnostics(lead.id, {}, 'manager-a'),
      (error) => error.status === 409,
    );

    await crm.advanceDeal(result.deal.id, { stage: 'proposal' }, 'manager-a');
    assert.equal((await store.get('leads', lead.id)).status, 'proposal');

    const audit = await store.all('auditLogs');
    assert.ok(audit.some((item) => item.action === 'lead_created' && item.actorId === 'manager-a'));
    assert.ok(audit.some((item) => item.action === 'deal_stage_changed' && item.actorId === 'manager-a'));

    console.log('CRM integrity test passed');
  } finally {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
