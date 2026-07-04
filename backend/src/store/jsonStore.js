const fs = require('fs');
const path = require('path');

const EMPTY_DB = Object.freeze({
  users: [],
  leads: [],
  clients: [],
  deals: [],
  tasks: [],
  notes: [],
  communications: [],
  diagnostics: [],
  materials: [],
  proposals: [],
  payments: [],
  subscriptions: [],
  debts: [],
  implementationProjects: [],
  dataCollectionRequests: [],
  supportTickets: [],
  notifications: [],
  referenceItems: [],
  authSessions: [],
  auditLogs: [],
});

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
  }

  ensureLoaded() {
    if (this.db) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.db = structuredClone(EMPTY_DB);
      this.save();
      return;
    }
    const raw = fs.readFileSync(this.filePath, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    this.db = { ...structuredClone(EMPTY_DB), ...parsed };
  }

  all(collection) {
    this.ensureLoaded();
    return this.db[collection] || [];
  }

  async health() {
    this.ensureLoaded();
    return { ok: true, mode: 'json' };
  }

  get(collection, id) {
    return this.all(collection).find((item) => item.id === id) || null;
  }

  insert(collection, data) {
    this.ensureLoaded();
    const record = {
      id: createId(collection),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    this.db[collection].push(record);
    this.save();
    return record;
  }

  update(collection, id, patch) {
    this.ensureLoaded();
    const list = this.db[collection];
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return null;
    list[index] = {
      ...list[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return list[index];
  }

  replaceAll(nextDb) {
    this.db = { ...structuredClone(EMPTY_DB), ...nextDb };
    this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.db, null, 2)}\n`);
  }
}

function createId(collection) {
  const prefix = collection.replace(/([a-z])([A-Z])/g, '$1_$2').slice(0, 4).toLowerCase();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultStore() {
  return new JsonStore(path.join(__dirname, '../../data/db.json'));
}

module.exports = { JsonStore, createDefaultStore, EMPTY_DB };
