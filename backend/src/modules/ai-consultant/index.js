const { sendJson, readJson } = require('../../lib/http');
const { GreenApiClient } = require('./greenApiClient');
const { AiConsultantService } = require('./service');
const { lessonReminderMessage, paymentReminderMessage } = require('./reminderTemplates');
const { classifyIntent } = require('./intentRouter');
const { aiConsultantReadiness } = require('./readiness');
const { listLocalOutbox, markLocalOutboxSent, markLocalOutboxFailed } = require('./localOutbox');

function createAiConsultantModule({ crm, env = process.env, greenApiClient = new GreenApiClient(env) }) {
  const service = new AiConsultantService({ crm, greenApiClient, env });
  const webhookToken = env.AI_CONSULTANT_WEBHOOK_TOKEN || '';
  const cronToken = env.AI_CONSULTANT_CRON_TOKEN || '';
  const adminToken = env.AI_CONSULTANT_ADMIN_TOKEN || cronToken || '';
  const localAgentToken = env.AI_CONSULTANT_LOCAL_AGENT_TOKEN || adminToken || cronToken || '';
  const testEndpointsEnabled = String(env.AI_CONSULTANT_TEST_ENDPOINTS || (env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true';

  return {
    service,
    async handlePublicRoute({ req, res, method, url }) {
      if (method === 'GET' && url.pathname === '/api/ai-consultant/health') {
        return sendJson(res, 200, { success: true, aiConsultant: await service.health() });
      }

      if (method === 'GET' && url.pathname === '/api/ai-consultant/readiness') {
        if (!isAuthorizedAdmin(req, url, adminToken, env)) {
          return sendJson(res, 401, { success: false, error: 'Invalid AI consultant admin token' });
        }
        return sendJson(res, 200, {
          success: true,
          readiness: await aiConsultantReadiness({ crm, service, greenApiClient, env }),
        });
      }

      if (method === 'GET' && url.pathname === '/api/ai-consultant/content-audit') {
        if (!isAuthorizedAdmin(req, url, adminToken, env)) {
          return sendJson(res, 401, { success: false, error: 'Invalid AI consultant admin token' });
        }
        return sendJson(res, 200, { success: true, audit: service.contentAudit() });
      }

      if (method === 'POST' && url.pathname === '/webhooks/green-api') {
        if (!isAuthorizedWebhook(req, url, webhookToken)) {
          return sendJson(res, 401, { success: false, error: 'Invalid AI consultant webhook token' });
        }
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, result: await service.processGreenApiWebhook(body) });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/reminders/dispatch') {
        if (!isAuthorizedCron(req, url, cronToken)) {
          return sendJson(res, 401, { success: false, error: 'Invalid AI consultant cron token' });
        }
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, result: await service.dispatchDueReminders(body) });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/local-agent/message') {
        if (!isAuthorizedLocalAgent(req, url, localAgentToken, env)) {
          return sendJson(res, 401, { success: false, error: 'Invalid AI consultant local agent token' });
        }
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, result: await service.processTestMessage(body) });
      }

      if (method === 'GET' && url.pathname === '/api/ai-consultant/local-agent/outbox') {
        if (!isAuthorizedLocalAgent(req, url, localAgentToken, env)) {
          return sendJson(res, 401, { success: false, error: 'Invalid AI consultant local agent token' });
        }
        return sendJson(res, 200, {
          success: true,
          outbox: await listLocalOutbox(crm, { limit: url.searchParams.get('limit') || 20 }),
        });
      }

      if (method === 'POST' && url.pathname.startsWith('/api/ai-consultant/local-agent/outbox/')) {
        if (!isAuthorizedLocalAgent(req, url, localAgentToken, env)) {
          return sendJson(res, 401, { success: false, error: 'Invalid AI consultant local agent token' });
        }
        const parts = url.pathname.split('/').filter(Boolean);
        const id = parts[4];
        const action = parts[5];
        const body = await readJson(req);
        if (action === 'sent') {
          return sendJson(res, 200, { success: true, item: await markLocalOutboxSent(crm, id, body) });
        }
        if (action === 'failed') {
          return sendJson(res, 200, { success: true, item: await markLocalOutboxFailed(crm, id, body) });
        }
      }

      if (url.pathname.startsWith('/api/ai-consultant/test-') && !testEndpointsEnabled) {
        return sendJson(res, 404, { success: false, error: 'AI consultant test endpoints are disabled' });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/test-message') {
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, result: await service.processTestMessage(body) });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/test-reminder') {
        const body = await readJson(req);
        const message = body.type === 'payment'
          ? paymentReminderMessage(body)
          : lessonReminderMessage(body);
        return sendJson(res, 200, { success: true, message });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/test-intent') {
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, classification: classifyIntent(body.text || '', { isAudio: Boolean(body.isAudio) }) });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/test-plan-reminder') {
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, result: await service.planReminder(body) });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/test-dispatch-reminders') {
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, result: await service.dispatchDueReminders(body) });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/test-release-handoff') {
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, result: await service.releaseHandoff(body) });
      }

      if (method === 'GET' && url.pathname === '/api/ai-consultant/analytics') {
        if (!isAuthorizedAdmin(req, url, adminToken, env)) {
          return sendJson(res, 401, { success: false, error: 'Invalid AI consultant admin token' });
        }
        return sendJson(res, 200, { success: true, analytics: await service.analytics() });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/test-knowledge') {
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, documents: service.searchKnowledge(body.query || '') });
      }

      if (method === 'POST' && url.pathname === '/api/ai-consultant/test-slots') {
        const body = await readJson(req);
        return sendJson(res, 200, { success: true, slots: service.availableTrialSlots(body.direction || null) });
      }

      if (method === 'GET' && url.pathname.startsWith('/api/ai-consultant/test-slots/')) {
        const slotId = decodeURIComponent(url.pathname.split('/').pop());
        return sendJson(res, 200, { success: true, slot: service.slotById(slotId) });
      }

      return false;
    },
  };
}

function isAuthorizedWebhook(req, url, expectedToken) {
  if (!expectedToken) return true;
  const headerToken = req.headers['x-ai-consultant-token'];
  const queryToken = url.searchParams.get('token');
  return headerToken === expectedToken || queryToken === expectedToken;
}

function isAuthorizedCron(req, url, expectedToken) {
  if (!expectedToken) return false;
  const headerToken = req.headers['x-ai-consultant-cron-token'];
  const queryToken = url.searchParams.get('token');
  return headerToken === expectedToken || queryToken === expectedToken;
}

function isAuthorizedAdmin(req, url, expectedToken, env = process.env) {
  if (env.NODE_ENV !== 'production' && !expectedToken) return true;
  if (!expectedToken) return false;
  const headerToken = req.headers['x-ai-consultant-admin-token'];
  const queryToken = url.searchParams.get('token');
  return headerToken === expectedToken || queryToken === expectedToken;
}

function isAuthorizedLocalAgent(req, url, expectedToken, env = process.env) {
  if (env.NODE_ENV !== 'production' && !expectedToken) return true;
  if (!expectedToken) return false;
  const headerToken = req.headers['x-ai-consultant-local-agent-token'];
  const queryToken = url.searchParams.get('token');
  return headerToken === expectedToken || queryToken === expectedToken;
}

module.exports = { createAiConsultantModule };
