export class CrmApi {
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async sendIncomingMessage(payload) {
    return await this.request('/api/ai-consultant/local-agent/message', {
      method: 'POST',
      body: payload,
    });
  }

  async fetchOutbox(limit = 10) {
    const result = await this.request(`/api/ai-consultant/local-agent/outbox?limit=${encodeURIComponent(limit)}`);
    return result.outbox || [];
  }

  async markSent(id, payload = {}) {
    return await this.request(`/api/ai-consultant/local-agent/outbox/${encodeURIComponent(id)}/sent`, {
      method: 'POST',
      body: payload,
    });
  }

  async markFailed(id, payload = {}) {
    return await this.request(`/api/ai-consultant/local-agent/outbox/${encodeURIComponent(id)}/failed`, {
      method: 'POST',
      body: payload,
    });
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-ai-consultant-local-agent-token': this.token,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || data.success === false) {
      throw new Error(data.error || `CRM API error ${response.status}`);
    }
    return data;
  }
}
