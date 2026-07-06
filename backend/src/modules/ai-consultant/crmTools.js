const { TASK_TYPES } = require('../../domain/constants');
const { findDirection } = require('./knowledgeBase');
const { loadProjectConfig } = require('./projectConfig');
const { normalizePhone } = require('./messageParser');

class AiConsultantCrmTools {
  constructor(crm, options = {}) {
    this.crm = crm;
    this.projectConfig = options.projectConfig || loadProjectConfig();
  }

  async findLeadByPhone(phone) {
    const normalizedPhone = normalizePhone(phone);
    const leads = await this.crm.store.all('leads');
    return leads.find((lead) => {
      return normalizePhone(lead.phone) === normalizedPhone || normalizePhone(lead.whatsapp) === normalizedPhone;
    }) || null;
  }

  async findOrCreateWhatsAppLead(message) {
    const existing = await this.findLeadByPhone(message.phone);
    if (existing) return existing;

    const direction = findDirection(message.text, this.projectConfig);
    return await this.crm.createLead({
      name: message.senderName || `WhatsApp ${message.phone}`,
      direction: this.projectConfig.crm.direction,
      niche: this.projectConfig.crm.niche,
      city: this.projectConfig.city,
      phone: message.phone,
      whatsapp: message.phone,
      source: this.projectConfig.crm?.leadSource || 'whatsapp_green_api',
      decisionMaker: message.senderName || null,
      currentAccounting: 'WhatsApp-заявка',
      pain: [
        `AI-консультант ${this.projectConfig.brandName}: новая заявка из WhatsApp.`,
        direction ? `Интерес: ${direction}.` : null,
        message.text ? `Первое сообщение: ${message.text}` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  async addWhatsAppCommunication(lead, text, result, happenedAt) {
    return await this.crm.addCommunication({
      leadId: lead.id,
      channel: 'whatsapp',
      result,
      text,
      responsibleId: lead.responsibleId,
      happenedAt,
    });
  }

  async addLeadNote(lead, type, text) {
    return await this.crm.addNote({
      entityType: 'lead',
      entityId: lead.id,
      type,
      text,
      authorId: lead.responsibleId,
    });
  }

  async leadNotes(lead) {
    const notes = await this.crm.store.all('notes');
    return notes.filter((note) => note.entityType === 'lead' && note.entityId === lead.id);
  }

  async leadCommunications(lead) {
    const communications = await this.crm.store.all('communications');
    return communications.filter((communication) => communication.leadId === lead.id);
  }

  async appendLeadPain(lead, line) {
    const previousPain = String(lead.pain || '');
    if (previousPain.includes(line)) return lead;
    return await this.crm.updateLead(lead.id, {
      pain: [previousPain, line].filter(Boolean).join('\n'),
    });
  }

  async updateLead(lead, patch) {
    return await this.crm.updateLead(lead.id, patch);
  }

  async createHumanTask(lead, title, priority = 'medium', description = '') {
    if (!lead.responsibleId) return null;
    return await this.crm.createManagementTask({
      title,
      responsibleId: lead.responsibleId,
      leadId: lead.id,
      priority,
      description,
      type: TASK_TYPES.SUPPORT,
      dueAt: new Date().toISOString(),
    }, 'system');
  }
}

module.exports = { AiConsultantCrmTools };
