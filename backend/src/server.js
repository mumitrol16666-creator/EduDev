const http = require('http');
const { loadEnv } = require('./config/env');
const { disconnectPrisma } = require('./config/prisma');
const { createStore } = require('./store/storeFactory');
const { CrmService } = require('./services/crmService');
const { AuthService } = require('./services/authService');
const { PERMISSIONS, ROLES } = require('./domain/constants');
const { navigationForRole } = require('./domain/navigation');
const { sendJson, sendError, readJson, parsePath } = require('./lib/http');

loadEnv();

const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || '127.0.0.1';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const CORS_ORIGINS = CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const store = createStore();
const crm = new CrmService(store);
const auth = new AuthService(store);

const server = http.createServer(async (req, res) => {
  try {
    const requestOrigin = req.headers.origin || '';
    if (!CORS_ORIGIN) {
      res.setHeader('access-control-allow-origin', requestOrigin || '*');
    } else if (CORS_ORIGINS.includes(requestOrigin)) {
      res.setHeader('access-control-allow-origin', requestOrigin);
    }
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,authorization');
    if (req.method === 'OPTIONS') return sendJson(res, 200, { success: true });

    const { url, parts } = parsePath(req.url);
    const method = req.method;

    if (method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { success: true, service: 'edudev-crm-backend' });
    }

    if (method === 'GET' && url.pathname === '/ready') {
      const health = await store.health();
      return sendJson(res, 200, { success: true, service: 'edudev-crm-backend', store: health });
    }

    if (method === 'GET' && url.pathname === '/api/meta') {
      return sendJson(res, 200, { success: true, meta: crm.meta() });
    }

    if (method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, session: await auth.login({
        ...body,
        userAgent: req.headers['user-agent'] || null,
      }) });
    }

    if (method === 'POST' && url.pathname === '/api/public/leads') {
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, lead: await crm.createLead(publicLeadPayload(body)) });
    }

    const user = await auth.authenticate(req);

    if (method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = bearerToken(req);
      return sendJson(res, 200, { success: true, result: await auth.logout(token) });
    }

    if (method === 'PATCH' && url.pathname === '/api/auth/password') {
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, user: await auth.changePassword(user, body) });
    }

    if (method === 'GET' && url.pathname === '/api/workbench/today') {
      auth.require(user, PERMISSIONS.CRM_READ);
      const requestedResponsibleId = url.searchParams.get('responsibleId') || undefined;
      const responsibleId = user.role === ROLES.MANAGER ? user.id : requestedResponsibleId;
      return sendJson(res, 200, {
        success: true,
        workbench: await crm.managerToday(responsibleId),
      });
    }

    if (method === 'GET' && url.pathname === '/api/developer/workbench') {
      auth.require(user, PERMISSIONS.CRM_READ);
      return sendJson(res, 200, {
        success: true,
        workbench: await crm.developerWorkbench(user.id),
      });
    }

    if (method === 'GET' && url.pathname === '/api/analytics/summary') {
      auth.require(user, PERMISSIONS.ANALYTICS_READ);
      return sendJson(res, 200, { success: true, analytics: await crm.analyticsSummary() });
    }

    if (method === 'GET' && url.pathname === '/api/demo/snapshot') {
      auth.require(user, PERMISSIONS.CRM_READ);
      return sendJson(res, 200, { success: true, demo: await crm.demoSnapshot() });
    }

    if (method === 'GET' && url.pathname === '/api/me') {
      return sendJson(res, 200, { success: true, user: auth.safeUser(user) });
    }

    if (method === 'GET' && url.pathname === '/api/navigation') {
      return sendJson(res, 200, { success: true, navigation: navigationForRole(user.role) });
    }

    if (method === 'GET' && url.pathname === '/api/notifications') {
      auth.require(user, PERMISSIONS.CRM_READ);
      const filters = Object.fromEntries(url.searchParams.entries());
      return sendJson(res, 200, { success: true, ...(await crm.notificationsForUser(user.id, filters)) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'notifications' && parts[3] === 'read') {
      auth.require(user, PERMISSIONS.CRM_READ);
      return sendJson(res, 200, { success: true, notification: await crm.markNotificationRead(parts[2], user.id) });
    }

    if (method === 'PATCH' && url.pathname === '/api/notifications/read-all') {
      auth.require(user, PERMISSIONS.CRM_READ);
      return sendJson(res, 200, { success: true, result: await crm.markAllNotificationsRead(user.id) });
    }

    if (method === 'GET' && url.pathname === '/api/team/workload') {
      auth.require(user, PERMISSIONS.ADMIN_READ);
      return sendJson(res, 200, { success: true, workload: await crm.teamWorkload() });
    }

    if (method === 'GET' && url.pathname === '/api/team/assignment-options') {
      auth.require(user, PERMISSIONS.CRM_READ);
      return sendJson(res, 200, { success: true, users: await crm.assignmentUsers() });
    }

    if (method === 'GET' && url.pathname === '/api/settings/dictionaries') {
      auth.require(user, PERMISSIONS.ADMIN_READ);
      return sendJson(res, 200, { success: true, dictionaries: await crm.settingsDictionaries() });
    }

    if (method === 'POST' && url.pathname === '/api/settings/reference-items') {
      auth.require(user, PERMISSIONS.ADMIN_READ);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, item: await crm.createReferenceItem(body, user.id) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'settings' && parts[2] === 'reference-items' && parts[3]) {
      auth.require(user, PERMISSIONS.ADMIN_READ);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, item: await crm.updateReferenceItem(parts[3], body, user.id) });
    }

    if (method === 'GET' && parts[0] === 'api' && parts.length === 2) {
      auth.require(user, parts[1] === 'audit-logs' || parts[1] === 'users' ? PERMISSIONS.ADMIN_READ : PERMISSIONS.CRM_READ);
      const collection = collectionFromPath(parts[1]);
      if (!collection) return sendError(res, 404, 'Unknown collection');
      const filters = Object.fromEntries(url.searchParams.entries());
      const result = parts[1] === 'audit-logs' || parts[1] === 'users'
        ? await crm.list(collection, filters)
        : await crm.listForUser(collection, filters, user);
      return sendJson(res, 200, { success: true, data: result.data, meta: result.meta });
    }

    if (method === 'GET' && parts[0] === 'api' && parts.length === 3) {
      auth.require(user, parts[1] === 'audit-logs' || parts[1] === 'users' ? PERMISSIONS.ADMIN_READ : PERMISSIONS.CRM_READ);
      const collection = collectionFromPath(parts[1]);
      if (!collection) return sendError(res, 404, 'Unknown collection');
      const detail = parts[1] === 'audit-logs' || parts[1] === 'users'
        ? await crm.detail(collection, parts[2])
        : await crm.detailForUser(collection, parts[2], user);
      return sendJson(res, 200, { success: true, detail });
    }

    if (method === 'GET' && parts[0] === 'api' && parts[1] === 'clients' && parts[3] === 'timeline') {
      auth.require(user, PERMISSIONS.CRM_READ);
      return sendJson(res, 200, { success: true, timeline: await crm.clientTimeline(parts[2]) });
    }

    if (method === 'POST' && url.pathname === '/api/users') {
      auth.require(user, PERMISSIONS.ADMIN_READ);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, user: await crm.createUser(body, user.id) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'users' && parts[2]) {
      auth.require(user, PERMISSIONS.ADMIN_READ);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, user: await crm.updateUser(parts[2], body, user.id) });
    }

    if (method === 'POST' && url.pathname === '/api/leads') {
      auth.require(user, PERMISSIONS.LEAD_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, lead: await crm.createLead(body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'leads' && parts[2]) {
      auth.require(user, PERMISSIONS.LEAD_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, lead: await crm.updateLead(parts[2], body) });
    }

    if (method === 'POST' && parts[0] === 'api' && parts[1] === 'leads' && parts[3] === 'diagnostics') {
      auth.require(user, PERMISSIONS.DEAL_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, ...(await crm.addDiagnostics(parts[2], body)) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'deals' && parts[3] === 'stage') {
      auth.require(user, PERMISSIONS.DEAL_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, deal: await crm.advanceDeal(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'deals' && parts[3] === 'amount') {
      auth.require(user, PERMISSIONS.DEAL_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, deal: await crm.updateDealAmount(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'deals' && parts[3] === 'responsibles') {
      auth.require(user, PERMISSIONS.DEAL_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, ...(await crm.updateDealResponsibles(parts[2], body)) });
    }

    if (method === 'POST' && parts[0] === 'api' && parts[1] === 'deals' && parts[3] === 'proposals') {
      auth.require(user, PERMISSIONS.DEAL_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, proposal: await crm.createProposal(parts[2], body) });
    }

    if (method === 'POST' && parts[0] === 'api' && parts[1] === 'deals' && parts[3] === 'payments') {
      auth.require(user, PERMISSIONS.PAYMENT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, ...(await crm.recordPayment(parts[2], body)) });
    }

    if (method === 'POST' && parts[0] === 'api' && parts[1] === 'deals' && parts[3] === 'prepayments') {
      auth.require(user, PERMISSIONS.PAYMENT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, payment: await crm.recordPrepayment(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'tasks' && parts[3] === 'complete') {
      auth.require(user, PERMISSIONS.CRM_READ);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, task: await crm.completeTask(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'tasks' && parts[3] === 'reschedule') {
      auth.require(user, PERMISSIONS.CRM_READ);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, task: await crm.rescheduleTask(parts[2], body) });
    }

    if (method === 'POST' && url.pathname === '/api/tasks') {
      auth.require(user, PERMISSIONS.TASK_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, task: await crm.createManagementTask(body, user.id) });
    }

    if (method === 'POST' && url.pathname === '/api/notes') {
      auth.require(user, PERMISSIONS.CRM_READ);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, note: await crm.addNote(body) });
    }

    if (method === 'POST' && url.pathname === '/api/communications') {
      auth.require(user, PERMISSIONS.CRM_READ);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, communication: await crm.addCommunication(body) });
    }

    if (method === 'DELETE' && parts[0] === 'api' && parts[1] === 'communications' && parts[2]) {
      auth.require(user, PERMISSIONS.CRM_READ);
      return sendJson(res, 200, { success: true, communication: await crm.deleteCommunication(parts[2], user.id) });
    }

    if (method === 'POST' && url.pathname === '/api/support-tickets') {
      auth.require(user, PERMISSIONS.SUPPORT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, ticket: await crm.createSupportTicket(body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'support-tickets' && parts[3] === 'assign') {
      auth.require(user, PERMISSIONS.SUPPORT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, ticket: await crm.updateSupportTicket(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'support-tickets' && parts[3] === 'status') {
      auth.require(user, PERMISSIONS.SUPPORT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, ticket: await crm.updateSupportTicket(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'support-tickets' && parts[3] === 'close') {
      auth.require(user, PERMISSIONS.SUPPORT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, ticket: await crm.closeSupportTicket(parts[2], body) });
    }

    if (method === 'POST' && parts[0] === 'api' && parts[1] === 'clients' && parts[3] === 'subscriptions') {
      auth.require(user, PERMISSIONS.PAYMENT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, subscription: await crm.createSubscription(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'subscriptions' && parts[3] === 'renew') {
      auth.require(user, PERMISSIONS.PAYMENT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, subscription: await crm.renewSubscription(parts[2], body) });
    }

    if (method === 'POST' && parts[0] === 'api' && parts[1] === 'clients' && parts[3] === 'debts') {
      auth.require(user, PERMISSIONS.PAYMENT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, debt: await crm.createDebt(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'debts' && parts[3] === 'paid') {
      auth.require(user, PERMISSIONS.PAYMENT_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, debt: await crm.markDebtPaid(parts[2], body) });
    }

    if (method === 'POST' && parts[0] === 'api' && parts[1] === 'implementation-projects' && parts[3] === 'data-collection') {
      auth.require(user, PERMISSIONS.IMPLEMENTATION_WRITE);
      const body = await readJson(req);
      return sendJson(res, 201, { success: true, request: await crm.createDataCollectionRequest(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'implementation-projects' && parts[3] === 'status') {
      auth.require(user, PERMISSIONS.IMPLEMENTATION_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, project: await crm.updateImplementationStatus(parts[2], body) });
    }

    if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'implementation-projects' && parts[3] === 'checklist' && parts[4]) {
      auth.require(user, PERMISSIONS.IMPLEMENTATION_WRITE);
      const body = await readJson(req);
      return sendJson(res, 200, { success: true, project: await crm.updateChecklistItem(parts[2], parts[4], body) });
    }

    return sendError(res, 404, 'Route not found');
  } catch (error) {
    return sendError(res, error.status || 500, error.message || 'Internal server error');
  }
});

function collectionFromPath(pathPart) {
  return {
    users: 'users',
    materials: 'materials',
    leads: 'leads',
    clients: 'clients',
    deals: 'deals',
    tasks: 'tasks',
    diagnostics: 'diagnostics',
    proposals: 'proposals',
    payments: 'payments',
    subscriptions: 'subscriptions',
    debts: 'debts',
    'implementation-projects': 'implementationProjects',
    'data-collection-requests': 'dataCollectionRequests',
    'support-tickets': 'supportTickets',
    notifications: 'notifications',
    'reference-items': 'referenceItems',
    'audit-logs': 'auditLogs',
  }[pathPart] || null;
}

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`EduDev CRM backend listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { server, crm };

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down EduDev CRM backend`);
  server.close(async () => {
    await disconnectPrisma().catch((error) => {
      console.error('Failed to disconnect Prisma cleanly', error);
    });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function publicLeadPayload(body = {}) {
  const business = String(body.business || '').trim();
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const city = String(body.city || '').trim() || 'Не указан';
  const message = String(body.message || '').trim();
  const selectedModules = String(body.selectedModules || body.selected_modules || '').trim();
  const preferredTime = String(body.preferredTime || body.time || '').trim();

  return {
    name: name ? `${name}${business ? ` - ${business}` : ''}` : business || 'Заявка с сайта',
    direction: 'autotech',
    niche: nicheFromBusiness(business),
    city,
    phone,
    whatsapp: phone,
    source: body.source || 'website',
    decisionMaker: name || null,
    currentAccounting: 'Заявка с сайта EduDev',
    pain: [
      message,
      selectedModules ? `Выбранные разделы: ${selectedModules}` : '',
      preferredTime ? `Удобное время: ${preferredTime}` : '',
      business ? `Тип бизнеса: ${business}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function nicheFromBusiness(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('шин')) return 'tire_service';
  if (normalized.includes('сто') || normalized.includes('ремонт')) return 'repair_shop';
  if (normalized.includes('мой')) return 'car_wash';
  if (normalized.includes('смеш')) return 'mixed_service';
  return 'oil_change';
}
