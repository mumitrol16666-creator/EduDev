class GreenApiClient {
  constructor(env = process.env) {
    this.instanceId = env.GREEN_API_INSTANCE_ID || '';
    this.token = env.GREEN_API_TOKEN || '';
    this.apiUrl = (env.GREEN_API_URL || 'https://api.green-api.com').replace(/\/$/, '');
    this.enabled = Boolean(this.instanceId && this.token);
  }

  async sendTyping(chatId) {
    if (!this.enabled) return { skipped: true, reason: 'GREEN_API_INSTANCE_ID or GREEN_API_TOKEN is not configured', chatId };
    return await this.request('sendTyping', { chatId });
  }

  async sendMessage(chatId, message) {
    if (!this.enabled) return { skipped: true, reason: 'GREEN_API_INSTANCE_ID or GREEN_API_TOKEN is not configured', chatId, message };
    return await this.request('sendMessage', { chatId, message });
  }

  async request(method, payload) {
    const response = await fetch(`${this.apiUrl}/waInstance${this.instanceId}/${method}/${this.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    const data = text ? safeJson(text) : {};
    if (!response.ok) {
      const error = new Error(`Green API ${method} failed with ${response.status}`);
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return data;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
}

module.exports = { GreenApiClient };
