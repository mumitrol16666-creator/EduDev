const path = require('path');
const { JsonStore, createDefaultStore } = require('./jsonStore');
const { PrismaStore } = require('./prismaStore');

function createStore() {
  const mode = (process.env.CRM_STORE || 'json').toLowerCase();
  if (mode === 'prisma') return new PrismaStore();
  if (mode === 'json') return createDefaultStore();
  throw new Error(`Unknown CRM_STORE mode: ${mode}`);
}

function createTestJsonStore(fileName = 'test-db.json') {
  return new JsonStore(path.join(__dirname, '../../data', fileName));
}

module.exports = { createStore, createTestJsonStore };
