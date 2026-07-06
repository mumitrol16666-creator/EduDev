const { normalizeAiActionContract } = require('./actionContract');

class OpenAiCompatibleLlmAdapter {
  constructor(env = process.env) {
    this.enabled = String(env.AI_CONSULTANT_LLM_ENABLED || 'false') === 'true';
    this.baseUrl = (env.AI_CONSULTANT_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.apiKey = env.AI_CONSULTANT_LLM_API_KEY || env.OPENAI_API_KEY || '';
    this.model = env.AI_CONSULTANT_LLM_MODEL || 'gpt-4.1-mini';
    this.timeoutMs = Number(env.AI_CONSULTANT_LLM_TIMEOUT_MS || 15000);
  }

  configured() {
    return this.enabled && Boolean(this.apiKey && this.model);
  }

  async complete({ messages, temperature = 0.2 }) {
    if (!this.configured()) {
      return { ok: false, skipped: true, reason: 'LLM adapter is disabled or not configured' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, status: response.status, error: data.error?.message || 'LLM request failed' };
      }
      return {
        ok: true,
        content: data.choices?.[0]?.message?.content || '',
        raw: data,
      };
    } catch (error) {
      return { ok: false, error: error.message };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseLlmJson(content = '') {
  try {
    const parsed = JSON.parse(content);
    return normalizeAiActionContract(parsed);
  } catch {
    return normalizeAiActionContract({
      reply: String(content || '').trim(),
      note: String(content || '').trim(),
      noteType: 'llm_consultation',
      confidence: 0,
    });
  }
}

module.exports = { OpenAiCompatibleLlmAdapter, parseLlmJson };
