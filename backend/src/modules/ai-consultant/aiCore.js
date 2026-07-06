const { parseLlmJson } = require('./llmAdapter');

class AiCore {
  constructor({ promptPack, llmAdapter, projectConfig }) {
    this.promptPack = promptPack;
    this.llmAdapter = llmAdapter;
    this.projectConfig = projectConfig;
  }

  available() {
    return Boolean(this.llmAdapter?.configured?.());
  }

  async consult({ text, lead, profile = {}, classification, knowledge = [], slots = [] }) {
    if (!this.available()) return { ok: false, skipped: true, reason: 'LLM is not configured' };

    const messages = [
      { role: 'system', content: this.promptPack.systemPrompt(this.projectConfig) },
      {
        role: 'user',
        content: JSON.stringify({
          incomingMessage: text,
          lead: safeLead(lead),
          profile,
          classification,
          knowledge: knowledge.map((item) => ({ id: item.id, title: item.title, body: item.body })),
          trialSlots: slots.map((slot) => ({ id: slot.id, label: slot.label, direction: slot.direction })),
        }, null, 2),
      },
    ];

    const completion = await this.llmAdapter.complete({ messages });
    if (!completion.ok) return completion;
    const parsed = parseLlmJson(completion.content);
    if (!parsed.reply) return { ok: false, reason: 'LLM returned empty reply', raw: completion.raw };
    return { ok: true, ...parsed, raw: completion.raw };
  }
}

function safeLead(lead = {}) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    whatsapp: lead.whatsapp,
    aiStatus: lead.aiStatus,
    aiProfile: lead.aiProfile,
    aiSummary: lead.aiSummary,
  };
}

module.exports = { AiCore };
