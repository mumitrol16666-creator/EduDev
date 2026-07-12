const { getPrisma } = require('../config/prisma');

const MODEL_BY_COLLECTION = Object.freeze({
  users: 'user',
  leads: 'lead',
  clients: 'client',
  deals: 'deal',
  tasks: 'task',
  notes: 'note',
  communications: 'communication',
  diagnostics: 'diagnostic',
  materials: 'material',
  proposals: 'proposal',
  payments: 'payment',
  subscriptions: 'subscription',
  debts: 'debt',
  implementationProjects: 'implementationProject',
  dataCollectionRequests: 'dataCollectionRequest',
  supportTickets: 'supportTicket',
  notifications: 'notification',
  referenceItems: 'referenceItem',
  authSessions: 'authSession',
  auditLogs: 'auditLog',
});

class PrismaStore {
  constructor(prisma = getPrisma()) {
    this.prisma = prisma;
  }

  delegate(collection) {
    const model = MODEL_BY_COLLECTION[collection];
    if (!model || !this.prisma[model]) {
      throw new Error(`Unknown Prisma collection: ${collection}`);
    }
    return this.prisma[model];
  }

  async all(collection) {
    return this.delegate(collection).findMany();
  }

  async findPeopleByPhone(phoneVariants = []) {
    const variants = [...new Set(phoneVariants.map((item) => String(item || '').trim()).filter(Boolean))];
    if (!variants.length) return { leads: [], clients: [] };
    const [leads, clients] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          OR: [
            { phone: { in: variants } },
            { whatsapp: { in: variants } },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 20,
      }),
      this.prisma.client.findMany({
        where: {
          phone: { in: variants },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 20,
      }),
    ]);
    return { leads, clients };
  }

  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, mode: 'prisma' };
  }

  async get(collection, id) {
    return this.delegate(collection).findUnique({ where: { id } });
  }

  async insert(collection, data) {
    return this.delegate(collection).create({ data });
  }

  async update(collection, id, patch) {
    try {
      return await this.delegate(collection).update({ where: { id }, data: patch });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async delete(collection, id) {
    try {
      return await this.delegate(collection).delete({ where: { id } });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }
}

module.exports = { PrismaStore, MODEL_BY_COLLECTION };
