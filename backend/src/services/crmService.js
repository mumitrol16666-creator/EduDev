const {
  ROLES,
  DIRECTIONS,
  AUTOTECH_NICHES,
  EDUTECH_NICHES,
  LEAD_STATUSES,
  DEAL_STAGES,
  TASK_TYPES,
  PACKAGES,
  IMPLEMENTATION_STATUSES,
  SUPPORT_TICKET_TYPES,
  SUPPORT_TICKET_STATUSES,
  SUBSCRIPTION_STATUSES,
  DEBT_STATUSES,
  COMMUNICATION_RESULTS,
} = require('../domain/constants');
const { hashPassword } = require('../lib/password');

class CrmService {
  constructor(store) {
    this.store = store;
  }

  meta() {
    return {
      roles: ROLES,
      directions: DIRECTIONS,
      autotechNiches: AUTOTECH_NICHES,
      edutechNiches: EDUTECH_NICHES,
      leadStatuses: LEAD_STATUSES,
      dealStages: DEAL_STAGES,
      taskTypes: TASK_TYPES,
      packages: PACKAGES,
      implementationStatuses: IMPLEMENTATION_STATUSES,
      supportTicketTypes: SUPPORT_TICKET_TYPES,
      supportTicketStatuses: SUPPORT_TICKET_STATUSES,
      subscriptionStatuses: SUBSCRIPTION_STATUSES,
      debtStatuses: DEBT_STATUSES,
      communicationResults: COMMUNICATION_RESULTS,
    };
  }

  async list(collection, filters = {}) {
    const items = await this.store.all(collection);
    return await this.prepareListResult(collection, items, filters);
  }

  async listForUser(collection, filters = {}, user) {
    const items = await this.store.all(collection);
    const scopedItems = await this.scopeItemsForUser(collection, items, user);
    return await this.prepareListResult(collection, scopedItems, filters);
  }

  async prepareListResult(collection, items, filters = {}) {
    const scopedFilters = { ...filters };
    let scopedItems = items;
    if (collection === 'leads' && scopedFilters.queue) {
      scopedItems = filterLeadsByQueue(scopedItems, scopedFilters.queue);
      delete scopedFilters.queue;
    }
    const result = listItems(collection, scopedItems, scopedFilters);
    if (collection === 'tasks') {
      result.data = await this.enrichTasks(result.data);
    }
    return result;
  }

  async leadWorkQueues(filters = {}, user) {
    const allLeads = await this.store.all('leads');
    const scopedLeads = await this.scopeItemsForUser('leads', allLeads, user);
    const baseFilters = { ...filters };
    delete baseFilters.queue;
    delete baseFilters.page;
    delete baseFilters.limit;
    delete baseFilters.sort;
    const query = normalizeListQuery({
      ...baseFilters,
      limit: 200,
      sort: '-updatedAt,-createdAt',
    });
    const visibleLeads = scopedLeads.filter((lead) => matchesListQuery(lead, query));

    const queue = (key, title) => {
      const items = filterLeadsByQueue(visibleLeads, key);
      return {
        key,
        title,
        count: items.length,
        sample: sortItems(items, '-updatedAt,-createdAt').slice(0, 5),
      };
    };

    return {
      new: queue('new', 'Новые'),
      stale: queue('stale', 'Зависли'),
      noResponsible: queue('no_responsible', 'Без ответственного'),
      diagnostics: queue('diagnostics', 'Диагностика'),
      active: queue('active', 'Активные'),
    };
  }

  async searchByPhone(phone, user) {
    const variants = phoneLookupVariants(phone);
    if (!variants.length) return { leads: [], clients: [] };

    const found = typeof this.store.findPeopleByPhone === 'function'
      ? await this.store.findPeopleByPhone(variants)
      : {
        leads: (await this.store.all('leads')).filter((lead) => phoneMatches(lead.phone, variants) || phoneMatches(lead.whatsapp, variants)),
        clients: (await this.store.all('clients')).filter((client) => phoneMatches(client.phone, variants)),
      };

    const [leads, clients] = await Promise.all([
      this.scopeItemsForUser('leads', found.leads || [], user),
      this.scopeItemsForUser('clients', found.clients || [], user),
    ]);

    return {
      query: phone,
      leads: leads.slice(0, 20),
      clients: clients.slice(0, 20),
    };
  }

  async enrichTasks(tasks = []) {
    if (!tasks.length) return [];
    const [leads, clients, deals, projects, tickets] = await Promise.all([
      this.store.all('leads'),
      this.store.all('clients'),
      this.store.all('deals'),
      this.store.all('implementationProjects'),
      this.store.all('supportTickets'),
    ]);
    const leadById = mapById(leads);
    const clientById = mapById(clients);
    const dealById = mapById(deals);
    const projectById = mapById(projects);
    const ticketById = mapById(tickets);

    return tasks.map((task) => ({
      ...task,
      ...taskRelationLabel(task, { leadById, clientById, dealById, projectById, ticketById }),
    }));
  }

  async detail(collection, id) {
    const item = await this.store.get(collection, id);
    if (!item) throw notFound('Record not found');

    if (collection === 'users') return { user: safeUserRecord(item) };
    if (collection === 'leads') return await this.leadDetail(item);
    if (collection === 'deals') return await this.dealDetail(item);
    if (collection === 'clients') return await this.clientDetail(item);
    if (collection === 'implementationProjects') return await this.implementationProjectDetail(item);
    if (collection === 'supportTickets') return await this.supportTicketDetail(item);
    return { item };
  }

  async detailForUser(collection, id, user) {
    const item = await this.store.get(collection, id);
    if (!item) throw notFound('Record not found');
    const allowed = await this.scopeItemsForUser(collection, [item], user);
    if (!allowed.length) throw notFound('Record not found');
    return await this.detail(collection, id);
  }

  async scopeItemsForUser(collection, items, user) {
    if (!user) return [];
    if ([ROLES.OWNER, ROLES.SUPERVISOR, ROLES.SALES_LEAD].includes(user.role)) return items;
    if (user.role === ROLES.MANAGER) return await this.scopeManagerItems(collection, items, user.id);
    if ([ROLES.DEVELOPER, ROLES.IMPLEMENTATION, ROLES.SUPPORT].includes(user.role)) {
      return await this.scopeDeliveryItems(collection, items, user.id);
    }
    return [];
  }

  async scopeManagerItems(collection, items, userId) {
    const leadIds = new Set((await this.store.all('leads')).filter((lead) => lead.responsibleId === userId).map((lead) => lead.id));
    const deals = (await this.store.all('deals')).filter((deal) => deal.responsibleId === userId || leadIds.has(deal.leadId));
    const dealIds = new Set(deals.map((deal) => deal.id));
    const clientIds = new Set(deals.map((deal) => deal.clientId).filter(Boolean));
    if (collection === 'leads') return items.filter((item) => item.responsibleId === userId);
    if (collection === 'deals') return items.filter((item) => item.responsibleId === userId || leadIds.has(item.leadId));
    if (collection === 'tasks') return items.filter((item) => item.responsibleId === userId || leadIds.has(item.leadId) || dealIds.has(item.dealId));
    if (collection === 'clients') return items.filter((item) => clientIds.has(item.id) || leadIds.has(item.leadId));
    if (collection === 'communications') return items.filter((item) => item.responsibleId === userId || leadIds.has(item.leadId) || dealIds.has(item.dealId));
    if (collection === 'notes') return items.filter((item) => item.authorId === userId || leadIds.has(item.entityId) || dealIds.has(item.entityId));
    if (collection === 'materials') return items;
    return [];
  }

  async scopeDeliveryItems(collection, items, userId) {
    const tasks = (await this.store.all('tasks')).filter((task) => task.responsibleId === userId);
    const taskProjectIds = tasks.map((task) => task.projectId).filter(Boolean);
    const taskTicketIds = tasks.map((task) => task.ticketId).filter(Boolean);
    const projects = (await this.store.all('implementationProjects')).filter((project) => {
      return project.responsibleId === userId || taskProjectIds.includes(project.id);
    });
    const projectIds = new Set(projects.map((project) => project.id));
    const tickets = (await this.store.all('supportTickets')).filter((ticket) => {
      return ticket.responsibleId === userId || taskTicketIds.includes(ticket.id) || projectIds.has(ticket.projectId);
    });
    const ticketIds = new Set(tickets.map((ticket) => ticket.id));
    const clientIds = new Set([
      ...projects.map((project) => project.clientId),
      ...tickets.map((ticket) => ticket.clientId),
      ...tasks.map((task) => task.clientId).filter(Boolean),
    ]);

    if (collection === 'tasks') return items.filter((item) => item.responsibleId === userId);
    if (collection === 'implementationProjects') return items.filter((item) => projectIds.has(item.id));
    if (collection === 'supportTickets') return items.filter((item) => ticketIds.has(item.id));
    if (collection === 'clients') return items.filter((item) => clientIds.has(item.id));
    if (collection === 'dataCollectionRequests') return items.filter((item) => projectIds.has(item.projectId));
    if (collection === 'materials') return items;
    return [];
  }

  async createUser(payload, actorId = 'system') {
    requireFields(payload, ['name', 'role']);
    if (!Object.values(ROLES).includes(payload.role)) throw badRequest(`Unknown role: ${payload.role}`);
    const users = await this.store.all('users');
    if (payload.email && users.some((user) => user.email === payload.email)) {
      throw badRequest('User email already exists');
    }
    if (payload.apiToken && users.some((user) => user.apiToken === payload.apiToken)) {
      throw badRequest('User token already exists');
    }

    const user = await this.store.insert('users', {
      name: payload.name,
      role: payload.role,
      phone: payload.phone || null,
      email: payload.email || null,
      status: payload.status || 'active',
      apiToken: payload.apiToken || createApiToken(payload.role),
      passwordHash: payload.password ? hashPassword(payload.password) : null,
    });
    await this.audit('user_created', 'user', user.id, { role: user.role, actorId });
    return safeUserRecord(user);
  }

  async updateUser(id, payload, actorId = 'system') {
    const user = await this.store.get('users', id);
    if (!user) throw notFound('User not found');
    const patch = {};
    if (payload.name) patch.name = payload.name;
    if (payload.phone !== undefined) patch.phone = payload.phone || null;
    if (payload.email !== undefined) patch.email = payload.email || null;
    if (payload.role) {
      if (!Object.values(ROLES).includes(payload.role)) throw badRequest(`Unknown role: ${payload.role}`);
      patch.role = payload.role;
    }
    if (payload.status) {
      if (!['active', 'inactive'].includes(payload.status)) throw badRequest(`Unknown user status: ${payload.status}`);
      patch.status = payload.status;
    }
    if (payload.regenerateApiToken) patch.apiToken = createApiToken(payload.role || user.role);
    if (!Object.keys(patch).length) throw badRequest('Nothing to update');

    const updated = await this.store.update('users', id, patch);
    await this.audit('user_updated', 'user', id, {
      actorId,
      changedFields: Object.keys(patch).filter((field) => field !== 'apiToken'),
      tokenRegenerated: Boolean(payload.regenerateApiToken),
    });
    return safeUserRecord(updated);
  }

  async teamWorkload() {
    const users = await this.store.all('users');
    const tasks = await this.store.all('tasks');
    const projects = await this.store.all('implementationProjects');
    const tickets = await this.store.all('supportTickets');
    const now = new Date();
    return users.map((user) => {
      const userTasks = tasks.filter((task) => task.responsibleId === user.id);
      const openTasks = userTasks.filter((task) => task.status !== 'done');
      const overdueTasks = openTasks.filter((task) => task.dueAt && new Date(task.dueAt) < now);
      const activeProjects = projects.filter((project) => {
        return project.responsibleId === user.id && ![IMPLEMENTATION_STATUSES.DONE, IMPLEMENTATION_STATUSES.PAUSED].includes(project.status);
      });
      const openTickets = tickets.filter((ticket) => ticket.responsibleId === user.id && ticket.status !== SUPPORT_TICKET_STATUSES.CLOSED);
      return {
        user: safeUserRecord(user),
        counters: {
          openTasks: openTasks.length,
          overdueTasks: overdueTasks.length,
          activeProjects: activeProjects.length,
          openTickets: openTickets.length,
        },
        nextTaskAt: openTasks
          .map((task) => task.dueAt)
          .filter(Boolean)
          .sort()[0] || null,
      };
    });
  }

  async assignmentUsers() {
    const users = await this.store.all('users');
    return users
      .filter((user) => user.status !== 'inactive')
      .map(safeUserRecord)
      .sort((a, b) => String(a.role).localeCompare(String(b.role), 'ru') || String(a.name).localeCompare(String(b.name), 'ru'));
  }

  async settingsDictionaries() {
    const customItems = await this.store.all('referenceItems');
    const grouped = {};
    for (const item of [...systemReferenceItems(), ...customItems]) {
      if (!grouped[item.group]) grouped[item.group] = [];
      grouped[item.group].push(item);
    }
    Object.values(grouped).forEach((items) => {
      items.sort((a, b) => Number(a.sortOrder || 100) - Number(b.sortOrder || 100) || String(a.label).localeCompare(String(b.label), 'ru'));
    });
    return grouped;
  }

  async createReferenceItem(payload, actorId = 'system') {
    requireFields(payload, ['group', 'key', 'label']);
    const existing = (await this.store.all('referenceItems')).find((item) => item.group === payload.group && item.key === payload.key);
    if (existing) throw badRequest('Reference item already exists');
    const item = await this.store.insert('referenceItems', {
      group: payload.group,
      key: payload.key,
      label: payload.label,
      value: payload.value || {},
      status: payload.status || 'active',
      sortOrder: Number(payload.sortOrder || 100),
    });
    await this.audit('reference_item_created', 'reference_item', item.id, { group: item.group, key: item.key, actorId });
    return item;
  }

  async updateReferenceItem(id, payload, actorId = 'system') {
    const item = await this.store.get('referenceItems', id);
    if (!item) throw notFound('Reference item not found');
    const patch = {};
    if (payload.label) patch.label = payload.label;
    if (payload.value !== undefined) patch.value = payload.value || {};
    if (payload.status) {
      if (!['active', 'inactive'].includes(payload.status)) throw badRequest(`Unknown reference item status: ${payload.status}`);
      patch.status = payload.status;
    }
    if (payload.sortOrder !== undefined) patch.sortOrder = Number(payload.sortOrder);
    if (!Object.keys(patch).length) throw badRequest('Nothing to update');
    const updated = await this.store.update('referenceItems', id, patch);
    await this.audit('reference_item_updated', 'reference_item', id, { group: item.group, key: item.key, actorId, changedFields: Object.keys(patch) });
    return updated;
  }

  async allowedAutotechNiches() {
    const custom = (await this.store.all('referenceItems'))
      .filter((item) => item.group === 'autotech_niches' && item.status === 'active')
      .map((item) => item.key);
    return [...new Set([...AUTOTECH_NICHES, ...custom])];
  }

  async allowedEdutechNiches() {
    const custom = (await this.store.all('referenceItems'))
      .filter((item) => item.group === 'edutech_niches' && item.status === 'active')
      .map((item) => item.key);
    return [...new Set([...EDUTECH_NICHES, ...custom])];
  }

  async allowedNiches(direction) {
    if (direction === DIRECTIONS.AUTOTECH) return await this.allowedAutotechNiches();
    if (direction === DIRECTIONS.EDUTECH) return await this.allowedEdutechNiches();
    throw badRequest(`Unknown direction: ${direction}`);
  }

  async notificationsForUser(userId, filters = {}) {
    const result = await this.list('notifications', {
      ...filters,
      recipientId: userId,
      sort: filters.sort || '-createdAt',
    });
    return {
      notifications: result.data,
      meta: result.meta,
      unreadCount: (await this.store.all('notifications')).filter((item) => {
        return item.recipientId === userId && item.status === 'unread';
      }).length,
    };
  }

  async markNotificationRead(id, userId) {
    const notification = await this.store.get('notifications', id);
    if (!notification) throw notFound('Notification not found');
    if (notification.recipientId !== userId) throw notFound('Notification not found');
    if (notification.status === 'read') return notification;
    return await this.store.update('notifications', id, {
      status: 'read',
      readAt: new Date().toISOString(),
    });
  }

  async markAllNotificationsRead(userId) {
    const notifications = await this.store.all('notifications');
    const unread = notifications.filter((item) => item.recipientId === userId && item.status === 'unread');
    for (const notification of unread) {
      await this.store.update('notifications', notification.id, {
        status: 'read',
        readAt: new Date().toISOString(),
      });
    }
    return { updated: unread.length };
  }

  async createNotification(payload) {
    if (!payload.recipientId) return null;
    const recipient = await this.store.get('users', payload.recipientId);
    if (!recipient || recipient.status !== 'active') return null;
    return await this.store.insert('notifications', {
      recipientId: payload.recipientId,
      type: payload.type,
      title: payload.title,
      body: payload.body || null,
      entityType: payload.entityType || null,
      entityId: payload.entityId || null,
      status: 'unread',
      readAt: null,
    });
  }

  async leadDetail(lead) {
    return {
      lead,
      diagnostics: (await this.store.all('diagnostics')).filter((item) => item.leadId === lead.id),
      deals: (await this.store.all('deals')).filter((item) => item.leadId === lead.id),
      tasks: (await this.store.all('tasks')).filter((item) => item.leadId === lead.id),
      communications: (await this.store.all('communications')).filter((item) => item.leadId === lead.id),
      notes: (await this.store.all('notes')).filter((item) => item.entityType === 'lead' && item.entityId === lead.id),
    };
  }

  async dealDetail(deal) {
    return {
      deal,
      lead: deal.leadId ? await this.store.get('leads', deal.leadId) : null,
      client: deal.clientId ? await this.store.get('clients', deal.clientId) : null,
      diagnostics: (await this.store.all('diagnostics')).filter((item) => item.dealId === deal.id || item.leadId === deal.leadId),
      proposals: (await this.store.all('proposals')).filter((item) => item.dealId === deal.id),
      payments: (await this.store.all('payments')).filter((item) => item.dealId === deal.id),
      implementationProject: (await this.store.all('implementationProjects')).find((item) => item.dealId === deal.id) || null,
      tasks: (await this.store.all('tasks')).filter((item) => item.dealId === deal.id),
      communications: (await this.store.all('communications')).filter((item) => item.dealId === deal.id),
      notes: (await this.store.all('notes')).filter((item) => item.entityType === 'deal' && item.entityId === deal.id),
      auditLogs: (await this.store.all('auditLogs')).filter((item) => item.entityType === 'deal' && item.entityId === deal.id),
    };
  }

  async clientDetail(client) {
    return {
      client,
      lead: client.leadId ? await this.store.get('leads', client.leadId) : null,
      deals: (await this.store.all('deals')).filter((item) => item.clientId === client.id || item.leadId === client.leadId),
      payments: (await this.store.all('payments')).filter((item) => item.clientId === client.id),
      implementationProjects: (await this.store.all('implementationProjects')).filter((item) => item.clientId === client.id),
      supportTickets: (await this.store.all('supportTickets')).filter((item) => item.clientId === client.id),
      subscriptions: (await this.store.all('subscriptions')).filter((item) => item.clientId === client.id),
      debts: (await this.store.all('debts')).filter((item) => item.clientId === client.id),
      tasks: (await this.store.all('tasks')).filter((item) => item.clientId === client.id),
      communications: (await this.store.all('communications')).filter((item) => item.clientId === client.id),
      notes: (await this.store.all('notes')).filter((item) => item.entityType === 'client' && item.entityId === client.id),
    };
  }

  async clientTimeline(clientId) {
    const client = await this.store.get('clients', clientId);
    if (!client) throw notFound('Client not found');
    const deals = (await this.store.all('deals')).filter((item) => item.clientId === client.id || item.leadId === client.leadId);
    const dealIds = new Set(deals.map((deal) => deal.id));
    const leadId = client.leadId;
    const projectIds = new Set((await this.store.all('implementationProjects')).filter((item) => item.clientId === client.id).map((item) => item.id));
    const ticketIds = new Set((await this.store.all('supportTickets')).filter((item) => item.clientId === client.id).map((item) => item.id));
    const events = [
      ...timelineFrom('client_created', [client], (item) => ({
        title: 'Клиент создан',
        entityType: 'client',
        entityId: item.id,
      })),
      ...timelineFrom('deal', deals, (item) => ({
        title: `Сделка: ${item.stage}`,
        entityType: 'deal',
        entityId: item.id,
        amount: item.amount,
      })),
      ...timelineFrom('payment', (await this.store.all('payments')).filter((item) => item.clientId === client.id), (item) => ({
        title: `Оплата ${item.amount}`,
        entityType: 'payment',
        entityId: item.id,
        amount: item.amount,
      }), 'paidAt'),
      ...timelineFrom('task', (await this.store.all('tasks')).filter((item) => {
        return item.clientId === client.id || dealIds.has(item.dealId) || projectIds.has(item.projectId) || ticketIds.has(item.ticketId);
      }), (item) => ({
        title: item.title,
        entityType: 'task',
        entityId: item.id,
        status: item.status,
      }), 'createdAt'),
      ...timelineFrom('communication', (await this.store.all('communications')).filter((item) => {
        return item.clientId === client.id || item.leadId === leadId || dealIds.has(item.dealId);
      }), (item) => ({
        title: `Коммуникация: ${item.result}`,
        entityType: 'communication',
        entityId: item.id,
        channel: item.channel,
      }), 'happenedAt'),
      ...timelineFrom('implementation', (await this.store.all('implementationProjects')).filter((item) => item.clientId === client.id), (item) => ({
        title: `Внедрение: ${item.status}`,
        entityType: 'implementation_project',
        entityId: item.id,
        status: item.status,
      })),
      ...timelineFrom('support_ticket', (await this.store.all('supportTickets')).filter((item) => item.clientId === client.id), (item) => ({
        title: item.title,
        entityType: 'support_ticket',
        entityId: item.id,
        status: item.status,
      })),
      ...timelineFrom('subscription', (await this.store.all('subscriptions')).filter((item) => item.clientId === client.id), (item) => ({
        title: `Подписка: ${item.status}`,
        entityType: 'subscription',
        entityId: item.id,
        amount: item.amount,
      })),
      ...timelineFrom('debt', (await this.store.all('debts')).filter((item) => item.clientId === client.id), (item) => ({
        title: `Долг: ${item.reason}`,
        entityType: 'debt',
        entityId: item.id,
        amount: item.amount,
        status: item.status,
      }), 'createdAt'),
      ...timelineFrom('note', (await this.store.all('notes')).filter((item) => {
        return (item.entityType === 'client' && item.entityId === client.id)
          || (item.entityType === 'lead' && item.entityId === leadId)
          || (item.entityType === 'deal' && dealIds.has(item.entityId))
          || (item.entityType === 'support_ticket' && ticketIds.has(item.entityId));
      }), (item) => ({
        title: item.text,
        entityType: 'note',
        entityId: item.id,
        noteType: item.type,
      })),
      ...timelineFrom('audit', (await this.store.all('auditLogs')).filter((item) => {
        return (item.entityType === 'client' && item.entityId === client.id)
          || (item.entityType === 'deal' && dealIds.has(item.entityId))
          || (item.entityType === 'implementation_project' && projectIds.has(item.entityId))
          || (item.entityType === 'support_ticket' && ticketIds.has(item.entityId));
      }), (item) => ({
        title: item.action,
        entityType: 'audit_log',
        entityId: item.id,
      })),
    ];

    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  async implementationProjectDetail(project) {
    return {
      project,
      client: await this.store.get('clients', project.clientId),
      deal: await this.store.get('deals', project.dealId),
      tasks: (await this.store.all('tasks')).filter((item) => item.projectId === project.id),
      dataCollectionRequests: (await this.store.all('dataCollectionRequests')).filter((item) => item.projectId === project.id),
      supportTickets: (await this.store.all('supportTickets')).filter((item) => item.projectId === project.id),
    };
  }

  async supportTicketDetail(ticket) {
    return {
      ticket,
      client: await this.store.get('clients', ticket.clientId),
      project: ticket.projectId ? await this.store.get('implementationProjects', ticket.projectId) : null,
      tasks: (await this.store.all('tasks')).filter((item) => item.ticketId === ticket.id),
      notes: (await this.store.all('notes')).filter((item) => item.entityType === 'support_ticket' && item.entityId === ticket.id),
    };
  }

  async createLead(payload) {
    requireFields(payload, ['name', 'niche', 'city', 'phone']);
    const direction = payload.direction || DIRECTIONS.AUTOTECH;
    if (!(await this.allowedNiches(direction)).includes(payload.niche)) {
      throw badRequest(`Unknown ${direction} niche: ${payload.niche}`);
    }

    const lead = await this.store.insert('leads', {
      name: payload.name,
      direction,
      niche: payload.niche,
      city: payload.city,
      phone: payload.phone,
      whatsapp: payload.whatsapp || payload.phone,
      instagram: payload.instagram || null,
      source: payload.source || 'manual',
      decisionMaker: payload.decisionMaker || null,
      currentAccounting: payload.currentAccounting || null,
      pain: payload.pain || null,
      status: LEAD_STATUSES.CONTACT_CHECK,
      responsibleId: payload.responsibleId || (await this.defaultManagerId()),
    });

    await this.createTask({
      type: TASK_TYPES.CHECK_CONTACT,
      title: `Проверить контакт: ${lead.name}`,
      dueAt: addBusinessDaysAtHour(1, 18),
      responsibleId: lead.responsibleId,
      leadId: lead.id,
      priority: 'high',
    });

    await this.audit('lead_created', 'lead', lead.id, { name: lead.name, niche: lead.niche });
    return lead;
  }

  async updateLead(id, payload) {
    const lead = await this.store.update('leads', id, payload);
    if (!lead) throw notFound('Lead not found');
    await this.audit('lead_updated', 'lead', id, payload);
    return lead;
  }

  async addDiagnostics(leadId, payload) {
    const lead = await this.store.get('leads', leadId);
    if (!lead) throw notFound('Lead not found');

    const diagnostics = await this.store.insert('diagnostics', {
      leadId,
      niche: lead.niche,
      answers: payload.answers || {},
      problems: payload.problems || [],
      recommendedSections: payload.recommendedSections || recommendSections(lead.niche, payload.problems || []),
      summary: payload.summary || null,
      authorId: payload.authorId || lead.responsibleId,
    });

    await this.store.update('leads', leadId, {
      status: LEAD_STATUSES.MEETING,
      pain: diagnostics.problems.join(', ') || lead.pain,
    });

    const deal = await this.store.insert('deals', {
      leadId,
      clientId: null,
      direction: lead.direction || DIRECTIONS.AUTOTECH,
      niche: lead.niche,
      stage: DEAL_STAGES.PRESENTATION,
      amount: payload.estimatedAmount || 0,
      packageId: payload.packageId || PACKAGES.BUSINESS,
      selectedSections: diagnostics.recommendedSections,
      probability: 35,
      nextActionAt: addDays(1),
      responsibleId: lead.responsibleId,
      objections: [],
      lostReason: null,
    });

    await this.createTask({
      type: TASK_TYPES.MEETING,
      title: `Показать сценарий системы: ${lead.name}`,
      dueAt: addDays(1),
      responsibleId: lead.responsibleId,
      leadId,
      dealId: deal.id,
      priority: 'high',
    });

    await this.audit('diagnostics_created', 'lead', leadId, { diagnosticsId: diagnostics.id, dealId: deal.id });
    return { diagnostics, deal };
  }

  async advanceDeal(id, payload) {
    const deal = await this.store.get('deals', id);
    if (!deal) throw notFound('Deal not found');
    const stage = payload.stage;
    if (!Object.values(DEAL_STAGES).includes(stage)) throw badRequest(`Unknown deal stage: ${stage}`);
    if (stage === DEAL_STAGES.LOST && !payload.lostReason) {
      throw badRequest('Lost reason is required when closing deal as lost');
    }

    const patch = {
      stage,
      probability: payload.probability ?? probabilityForStage(stage),
      nextActionAt: payload.nextActionAt || nextActionForStage(stage),
      objections: payload.objections || deal.objections,
      lostReason: stage === DEAL_STAGES.LOST ? payload.lostReason || 'not_specified' : deal.lostReason,
    };
    const updated = await this.store.update('deals', id, patch);
    await this.createStageTask(updated);
    await this.audit('deal_stage_changed', 'deal', id, { stage });
    return updated;
  }

  async updateDealAmount(id, payload) {
    const deal = await this.store.get('deals', id);
    if (!deal) throw notFound('Deal not found');
    requireFields(payload, ['amount', 'reason']);
    const previousAmount = Number(deal.amount || 0);
    const nextAmount = Number(payload.amount);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      throw badRequest('Deal amount must be a positive number or zero');
    }

    const updated = await this.store.update('deals', id, {
      amount: nextAmount,
      amountChangeReason: payload.reason,
    });
    await this.audit('deal_amount_changed', 'deal', id, {
      previousAmount,
      nextAmount,
      reason: payload.reason,
    });
    return updated;
  }

  async updateDealResponsibles(id, payload) {
    const deal = await this.store.get('deals', id);
    if (!deal) throw notFound('Deal not found');
    const patch = {};

    if (payload.managerId !== undefined) {
      if (payload.managerId) await this.assertUserRole(payload.managerId, [ROLES.MANAGER, ROLES.SALES_LEAD, ROLES.SUPERVISOR, ROLES.OWNER]);
      patch.responsibleId = payload.managerId || null;
    }

    if (payload.implementationId !== undefined) {
      if (payload.implementationId) await this.assertUserRole(payload.implementationId, [ROLES.DEVELOPER, ROLES.IMPLEMENTATION, ROLES.SUPERVISOR, ROLES.OWNER]);
      patch.implementationResponsibleId = payload.implementationId || null;
    }

    const updatedDeal = Object.keys(patch).length ? await this.store.update('deals', id, patch) : deal;
    let project = null;
    if (payload.implementationId !== undefined) {
      const projects = await this.store.all('implementationProjects');
      project = projects.find((item) => item.dealId === id) || null;
      if (project) {
        project = await this.store.update('implementationProjects', project.id, {
          responsibleId: payload.implementationId || null,
        });
      }
    }

    await this.audit('deal_responsibles_updated', 'deal', id, {
      managerId: updatedDeal.responsibleId || null,
      implementationId: updatedDeal.implementationResponsibleId || project?.responsibleId || null,
    });
    return { deal: updatedDeal, implementationProject: project };
  }

  async createProposal(dealId, payload) {
    const deal = await this.store.get('deals', dealId);
    if (!deal) throw notFound('Deal not found');
    requireFields(payload, ['amount']);

    const proposal = await this.store.insert('proposals', {
      dealId,
      packageId: payload.packageId || deal.packageId,
      amount: Number(payload.amount),
      sections: payload.sections || deal.selectedSections || [],
      status: 'sent',
      fileUrl: payload.fileUrl || null,
      validUntil: payload.validUntil || addDays(7),
    });

    await this.store.update('deals', dealId, {
      stage: DEAL_STAGES.FOLLOW_UP,
      amount: proposal.amount,
      packageId: proposal.packageId,
      selectedSections: proposal.sections,
      nextActionAt: addDays(1),
      probability: 55,
    });

    await this.createTask({
      type: TASK_TYPES.FOLLOW_UP,
      title: 'Follow-up после КП',
      dueAt: addDays(1),
      responsibleId: deal.responsibleId,
      leadId: deal.leadId,
      dealId,
      priority: 'medium',
    });

    await this.audit('proposal_created', 'deal', dealId, { proposalId: proposal.id, amount: proposal.amount });
    return proposal;
  }

  async updateProposal(dealId, proposalId, payload) {
    const deal = await this.store.get('deals', dealId);
    if (!deal) throw notFound('Deal not found');
    const proposal = await this.store.get('proposals', proposalId);
    if (!proposal || proposal.dealId !== dealId) throw notFound('Proposal not found');

    const patch = {};
    if (payload.amount !== undefined) {
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount < 0) throw badRequest('Proposal amount must be a positive number or zero');
      patch.amount = amount;
    }
    if (payload.packageId !== undefined) patch.packageId = payload.packageId || deal.packageId;
    if (payload.sections !== undefined) patch.sections = Array.isArray(payload.sections) ? payload.sections : proposal.sections;
    if (payload.status !== undefined) patch.status = payload.status || proposal.status;
    if (payload.fileUrl !== undefined) patch.fileUrl = payload.fileUrl || null;
    if (payload.validUntil !== undefined) patch.validUntil = payload.validUntil || null;
    if (!Object.keys(patch).length) throw badRequest('Nothing to update');

    const updated = await this.store.update('proposals', proposalId, patch);
    const dealPatch = {};
    if (patch.amount !== undefined) dealPatch.amount = patch.amount;
    if (patch.packageId !== undefined) dealPatch.packageId = patch.packageId;
    if (patch.sections !== undefined) dealPatch.selectedSections = patch.sections;
    if (Object.keys(dealPatch).length) await this.store.update('deals', dealId, dealPatch);

    await this.audit('proposal_updated', 'deal', dealId, {
      proposalId,
      previousAmount: proposal.amount,
      nextAmount: updated.amount,
    });
    return updated;
  }

  async recordPayment(dealId, payload) {
    const deal = await this.store.get('deals', dealId);
    if (!deal) throw notFound('Deal not found');
    requireFields(payload, ['amount']);

    const lead = await this.store.get('leads', deal.leadId);
    const client = await this.ensureClientFromDeal(deal, lead);
    const payment = await this.store.insert('payments', {
      dealId,
      clientId: client.id,
      amount: Number(payload.amount),
      method: payload.method || 'bank_transfer',
      paidAt: payload.paidAt || new Date().toISOString(),
      status: 'paid',
      note: payload.note || null,
    });

    const updatedDeal = await this.store.update('deals', dealId, {
      clientId: client.id,
      stage: DEAL_STAGES.IMPLEMENTATION,
      probability: 90,
      nextActionAt: addDays(0),
    });

    const project = await this.createImplementationProject(updatedDeal, client, payload.implementationId || deal.implementationResponsibleId || null);
    await this.createTask({
      type: TASK_TYPES.HANDOFF_IMPLEMENTATION,
      title: `Передать во внедрение: ${client.name}`,
      dueAt: addDays(0),
      responsibleId: await this.defaultImplementationId(),
      clientId: client.id,
      dealId,
      projectId: project.id,
      priority: 'high',
    });

    await this.audit('payment_recorded', 'deal', dealId, { paymentId: payment.id, projectId: project.id });
    return { payment, client, deal: updatedDeal, project };
  }

  async recordPrepayment(dealId, payload) {
    const deal = await this.store.get('deals', dealId);
    if (!deal) throw notFound('Deal not found');
    requireFields(payload, ['amount']);

    const lead = await this.store.get('leads', deal.leadId);
    const client = await this.ensureClientFromDeal(deal, lead);
    const payment = await this.store.insert('payments', {
      dealId,
      clientId: client.id,
      amount: Number(payload.amount),
      method: payload.method || 'bank_transfer',
      paidAt: payload.paidAt || new Date().toISOString(),
      status: 'paid',
      note: payload.note || 'Предоплата',
    });

    await this.store.update('deals', dealId, {
      clientId: client.id,
      stage: DEAL_STAGES.PAYMENT,
      probability: 80,
      nextActionAt: addDays(0),
    });

    await this.createTask({
      type: TASK_TYPES.PAYMENT,
      title: `Получить остаток оплаты: ${client.name}`,
      dueAt: addDays(0),
      responsibleId: deal.responsibleId,
      clientId: client.id,
      leadId: deal.leadId,
      dealId,
      priority: 'high',
    });

    await this.audit('prepayment_recorded', 'deal', dealId, { paymentId: payment.id, amount: payment.amount });
    return payment;
  }

  async updatePayment(dealId, paymentId, payload) {
    const deal = await this.store.get('deals', dealId);
    if (!deal) throw notFound('Deal not found');
    const payment = await this.store.get('payments', paymentId);
    if (!payment || payment.dealId !== dealId) throw notFound('Payment not found');

    const patch = {};
    if (payload.amount !== undefined) {
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount < 0) throw badRequest('Payment amount must be a positive number or zero');
      patch.amount = amount;
    }
    if (payload.method !== undefined) patch.method = payload.method || payment.method;
    if (payload.paidAt !== undefined) patch.paidAt = payload.paidAt || payment.paidAt;
    if (payload.status !== undefined) patch.status = payload.status || payment.status;
    if (payload.note !== undefined) patch.note = payload.note || null;
    if (!Object.keys(patch).length) throw badRequest('Nothing to update');

    const updated = await this.store.update('payments', paymentId, patch);
    await this.audit('payment_updated', 'deal', dealId, {
      paymentId,
      previousAmount: payment.amount,
      nextAmount: updated.amount,
    });
    return updated;
  }

  async createSupportTicket(payload) {
    requireFields(payload, ['clientId', 'title', 'type']);
    if (!Object.values(SUPPORT_TICKET_TYPES).includes(payload.type)) {
      throw badRequest(`Unknown support ticket type: ${payload.type}`);
    }
    const ticket = await this.store.insert('supportTickets', {
      clientId: payload.clientId,
      projectId: payload.projectId || null,
      type: payload.type,
      title: payload.title,
      description: payload.description || '',
      status: SUPPORT_TICKET_STATUSES.OPEN,
      priority: payload.priority || 'medium',
      responsibleId: payload.responsibleId || (await this.defaultSupportId()),
      dueAt: payload.dueAt || addDays(1),
      paidAmount: payload.type === SUPPORT_TICKET_TYPES.PAID_CHANGE ? Number(payload.paidAmount || 0) : 0,
      paymentStatus: payload.type === SUPPORT_TICKET_TYPES.PAID_CHANGE ? 'pending' : null,
    });
    await this.audit('support_ticket_created', 'support_ticket', ticket.id, { clientId: ticket.clientId });
    return ticket;
  }

  async updateSupportTicket(id, payload = {}) {
    const ticket = await this.store.get('supportTickets', id);
    if (!ticket) throw notFound('Support ticket not found');
    const patch = {};

    if (payload.responsibleId) {
      const responsible = await this.store.get('users', payload.responsibleId);
      if (!responsible) throw notFound('Responsible user not found');
      patch.responsibleId = payload.responsibleId;
    }

    if (payload.status) {
      if (!Object.values(SUPPORT_TICKET_STATUSES).includes(payload.status)) {
        throw badRequest(`Unknown support ticket status: ${payload.status}`);
      }
      patch.status = payload.status;
      if (payload.status === SUPPORT_TICKET_STATUSES.IN_PROGRESS && !patch.startedAt) {
        patch.startedAt = new Date().toISOString();
      }
    }

    if (payload.priority) patch.priority = payload.priority;
    if (payload.dueAt) patch.dueAt = payload.dueAt;
    if (payload.paymentStatus) patch.paymentStatus = payload.paymentStatus;
    if (payload.comment) patch.lastComment = payload.comment;

    if (!Object.keys(patch).length) throw badRequest('Nothing to update');
    const updated = await this.store.update('supportTickets', id, patch);
    if (payload.responsibleId && payload.responsibleId !== ticket.responsibleId) {
      await this.createNotification({
        recipientId: payload.responsibleId,
        type: 'support_ticket_assigned',
        title: `Назначен тикет: ${updated.title}`,
        body: updated.description,
        entityType: 'support_ticket',
        entityId: updated.id,
      });
    }
    await this.audit('support_ticket_updated', 'support_ticket', id, {
      previousStatus: ticket.status,
      status: updated.status,
      responsibleId: updated.responsibleId,
      comment: payload.comment || null,
    });
    return updated;
  }

  async closeSupportTicket(id, payload = {}) {
    const ticket = await this.store.get('supportTickets', id);
    if (!ticket) throw notFound('Support ticket not found');
    requireFields(payload, ['result']);
    const updated = await this.store.update('supportTickets', id, {
      status: SUPPORT_TICKET_STATUSES.CLOSED,
      result: payload.result,
      closedAt: new Date().toISOString(),
      paymentStatus: ticket.type === SUPPORT_TICKET_TYPES.PAID_CHANGE && ticket.paymentStatus !== 'paid' ? 'pending' : ticket.paymentStatus,
    });
    if (ticket.responsibleId) {
      await this.createNotification({
        recipientId: ticket.responsibleId,
        type: 'support_ticket_closed',
        title: `Тикет закрыт: ${ticket.title}`,
        body: payload.result,
        entityType: 'support_ticket',
        entityId: ticket.id,
      });
    }
    await this.audit('support_ticket_closed', 'support_ticket', id, {
      result: payload.result,
      paidAmount: ticket.paidAmount,
      paymentStatus: updated.paymentStatus,
    });
    return updated;
  }

  async createSubscription(clientId, payload) {
    const client = await this.store.get('clients', clientId);
    if (!client) throw notFound('Client not found');
    requireFields(payload, ['amount']);
    const startsAt = payload.startsAt || new Date().toISOString();
    const periodMonths = Number(payload.periodMonths || 1);
    const subscription = await this.store.insert('subscriptions', {
      clientId,
      packageId: payload.packageId || PACKAGES.BUSINESS,
      amount: Number(payload.amount),
      status: payload.status || SUBSCRIPTION_STATUSES.ACTIVE,
      startsAt,
      endsAt: payload.endsAt || addMonthsFrom(startsAt, periodMonths),
      renewalPeriodMonths: periodMonths,
      note: payload.note || null,
    });

    await this.store.update('clients', clientId, {
      subscriptionStatus: subscription.status,
    });
    await this.createTask({
      type: TASK_TYPES.PAYMENT,
      title: `Проконтролировать продление: ${client.name}`,
      dueAt: addDaysFrom(subscription.endsAt, -3),
      responsibleId: await this.defaultSupportId(),
      clientId,
      priority: 'medium',
    });
    await this.audit('subscription_created', 'client', clientId, { subscriptionId: subscription.id, amount: subscription.amount });
    return subscription;
  }

  async renewSubscription(id, payload = {}) {
    const subscription = await this.store.get('subscriptions', id);
    if (!subscription) throw notFound('Subscription not found');
    const client = await this.store.get('clients', subscription.clientId);
    const startsAt = payload.startsAt || subscription.endsAt || new Date().toISOString();
    const periodMonths = Number(payload.periodMonths || subscription.renewalPeriodMonths || 1);
    const amount = Number(payload.amount || subscription.amount);
    const updated = await this.store.update('subscriptions', id, {
      amount,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      startsAt,
      endsAt: payload.endsAt || addMonthsFrom(startsAt, periodMonths),
      renewalPeriodMonths: periodMonths,
      lastRenewedAt: new Date().toISOString(),
      renewalComment: payload.comment || null,
    });

    await this.store.update('clients', subscription.clientId, {
      subscriptionStatus: SUBSCRIPTION_STATUSES.ACTIVE,
    });
    await this.createTask({
      type: TASK_TYPES.PAYMENT,
      title: `Следующее продление: ${client?.name || subscription.clientId}`,
      dueAt: addDaysFrom(updated.endsAt, -3),
      responsibleId: await this.defaultSupportId(),
      clientId: subscription.clientId,
      priority: 'medium',
    });
    await this.audit('subscription_renewed', 'subscription', id, { amount, endsAt: updated.endsAt, comment: payload.comment || null });
    return updated;
  }

  async createDebt(clientId, payload) {
    const client = await this.store.get('clients', clientId);
    if (!client) throw notFound('Client not found');
    requireFields(payload, ['amount', 'reason', 'dueAt']);
    const debt = await this.store.insert('debts', {
      clientId,
      subscriptionId: payload.subscriptionId || null,
      amount: Number(payload.amount),
      reason: payload.reason,
      status: DEBT_STATUSES.OPEN,
      dueAt: payload.dueAt,
      paidAt: null,
      comment: payload.comment || null,
    });

    await this.store.update('clients', clientId, {
      subscriptionStatus: SUBSCRIPTION_STATUSES.OVERDUE,
    });
    await this.createTask({
      type: TASK_TYPES.PAYMENT,
      title: `Закрыть долг: ${client.name}`,
      dueAt: payload.dueAt,
      responsibleId: await this.defaultSupportId(),
      clientId,
      priority: 'high',
    });
    await this.createNotification({
      recipientId: await this.defaultSupportId(),
      type: 'debt_created',
      title: `Новый долг: ${client.name}`,
      body: `${debt.amount}: ${debt.reason}`,
      entityType: 'debt',
      entityId: debt.id,
    });
    await this.audit('debt_created', 'client', clientId, { debtId: debt.id, amount: debt.amount, reason: debt.reason });
    return debt;
  }

  async markDebtPaid(id, payload = {}) {
    const debt = await this.store.get('debts', id);
    if (!debt) throw notFound('Debt not found');
    if (debt.status === DEBT_STATUSES.PAID) return debt;
    const updated = await this.store.update('debts', id, {
      status: DEBT_STATUSES.PAID,
      paidAt: payload.paidAt || new Date().toISOString(),
      paidComment: payload.comment || null,
    });
    const debts = await this.store.all('debts');
    const hasOpenDebt = debts.some((item) => item.clientId === debt.clientId && item.id !== id && item.status === DEBT_STATUSES.OPEN);
    if (!hasOpenDebt) {
      await this.store.update('clients', debt.clientId, {
        subscriptionStatus: SUBSCRIPTION_STATUSES.ACTIVE,
      });
    }
    await this.audit('debt_paid', 'debt', id, { amount: debt.amount, comment: payload.comment || null });
    return updated;
  }

  async addNote(payload) {
    requireFields(payload, ['entityType', 'entityId', 'text']);
    const note = await this.store.insert('notes', {
      entityType: payload.entityType,
      entityId: payload.entityId,
      type: payload.type || 'general',
      text: payload.text,
      authorId: payload.authorId || (await this.defaultManagerId()),
    });
    await this.audit('note_created', payload.entityType, payload.entityId, { noteId: note.id, type: note.type });
    return note;
  }

  async addCommunication(payload) {
    requireFields(payload, ['channel', 'result']);
    if (!Object.values(COMMUNICATION_RESULTS).includes(payload.result)) {
      throw badRequest(`Unknown communication result: ${payload.result}`);
    }

    const communication = await this.store.insert('communications', {
      leadId: payload.leadId || null,
      clientId: payload.clientId || null,
      dealId: payload.dealId || null,
      taskId: payload.taskId || null,
      channel: payload.channel,
      result: payload.result,
      text: payload.text || '',
      responsibleId: payload.responsibleId || (await this.defaultManagerId()),
      happenedAt: payload.happenedAt || new Date().toISOString(),
    });

    await this.applyCommunicationRule(communication);
    await this.audit('communication_created', payload.dealId ? 'deal' : 'lead', payload.dealId || payload.leadId || communication.id, {
      communicationId: communication.id,
      result: communication.result,
    });
    return communication;
  }

  async deleteCommunication(id, actorId = 'system') {
    const communication = await this.store.get('communications', id);
    if (!communication) throw notFound('Communication not found');
    const deleted = await this.store.delete('communications', id);
    await this.audit('communication_deleted', communication.dealId ? 'deal' : 'lead', communication.dealId || communication.leadId || id, {
      communicationId: id,
      actorId,
      result: communication.result,
    });
    return deleted;
  }

  async applyCommunicationRule(communication) {
    const base = {
      responsibleId: communication.responsibleId,
      leadId: communication.leadId,
      clientId: communication.clientId,
      dealId: communication.dealId,
      taskId: null,
    };

    if (communication.result === COMMUNICATION_RESULTS.NO_ANSWER) {
      await this.createTask({
        ...base,
        type: TASK_TYPES.CALL,
        title: 'Повторный звонок после недозвона',
        dueAt: addDays(1),
      });
    }

    if (communication.result === COMMUNICATION_RESULTS.INTERESTED) {
      await this.createTask({
        ...base,
        type: TASK_TYPES.DIAGNOSTICS,
        title: 'Провести диагностику клиента',
        dueAt: addDays(0),
        priority: 'high',
      });
    }

    if (communication.result === COMMUNICATION_RESULTS.EXPENSIVE) {
      await this.addNote({
        entityType: communication.dealId ? 'deal' : 'lead',
        entityId: communication.dealId || communication.leadId,
        type: 'objection',
        text: 'Возражение: дорого. Нужен расчет потерь и более простой стартовый пакет.',
        authorId: communication.responsibleId,
      });
    }
  }

  async completeTask(id, payload = {}) {
    const task = await this.store.get('tasks', id);
    if (!task) throw notFound('Task not found');
    if (!payload.result) throw badRequest('Task result is required');
    const updated = await this.store.update('tasks', id, {
      status: 'done',
      result: payload.result || 'done',
      completedAt: new Date().toISOString(),
    });
    await this.audit('task_completed', 'task', id, { result: updated.result });
    return updated;
  }

  async rescheduleTask(id, payload = {}) {
    const task = await this.store.get('tasks', id);
    if (!task) throw notFound('Task not found');
    if (!payload.dueAt || !payload.comment) {
      throw badRequest('New dueAt and comment are required to reschedule task');
    }
    const updated = await this.store.update('tasks', id, {
      dueAt: payload.dueAt,
      rescheduleComment: payload.comment,
      status: task.status === 'done' ? 'open' : task.status,
    });
    await this.audit('task_rescheduled', 'task', id, { dueAt: payload.dueAt, comment: payload.comment });
    return updated;
  }

  async managerToday(responsibleId = null) {
    if (!responsibleId) responsibleId = await this.defaultManagerId();
    const now = new Date();
    const allTasks = await this.store.all('tasks');
    const tasks = allTasks.filter((task) => task.responsibleId === responsibleId && task.status !== 'done');
    const overdueTasks = tasks.filter((task) => new Date(task.dueAt) < now);
    const todayTasks = tasks.filter((task) => sameDay(task.dueAt, now));
    const allLeads = await this.store.all('leads');
    const newLeads = allLeads.filter((lead) => {
      return lead.responsibleId === responsibleId && [LEAD_STATUSES.NEW, LEAD_STATUSES.CONTACT_CHECK].includes(lead.status);
    });
    const allDeals = await this.store.all('deals');
    const deals = allDeals.filter((deal) => deal.responsibleId === responsibleId);
    const dealsWithoutNextAction = deals.filter((deal) => !deal.nextActionAt && ![DEAL_STAGES.WON, DEAL_STAGES.LOST].includes(deal.stage));
    const stalledDeals = deals.filter((deal) => {
      if ([DEAL_STAGES.WON, DEAL_STAGES.LOST].includes(deal.stage)) return false;
      const updated = new Date(deal.updatedAt || deal.createdAt);
      return daysBetween(updated, now) >= 7;
    });

    return {
      responsibleId,
      todayTasks: await this.enrichTasks(todayTasks),
      overdueTasks: await this.enrichTasks(overdueTasks),
      newLeads,
      dealsWithoutNextAction,
      stalledDeals,
      counters: {
        todayTasks: todayTasks.length,
        overdueTasks: overdueTasks.length,
        newLeads: newLeads.length,
        dealsWithoutNextAction: dealsWithoutNextAction.length,
        stalledDeals: stalledDeals.length,
      },
    };
  }

  async developerWorkbench(developerId) {
    const tasks = (await this.store.all('tasks')).filter((task) => {
      return task.responsibleId === developerId && task.status !== 'done';
    });
    const projectIds = new Set(tasks.map((task) => task.projectId).filter(Boolean));
    const ticketIds = new Set(tasks.map((task) => task.ticketId).filter(Boolean));
    const projects = (await this.store.all('implementationProjects')).filter((project) => {
      return project.responsibleId === developerId || projectIds.has(project.id);
    });
    const tickets = (await this.store.all('supportTickets')).filter((ticket) => {
      return ticket.responsibleId === developerId || ticketIds.has(ticket.id);
    });
    const clientIds = new Set([
      ...projects.map((project) => project.clientId),
      ...tickets.map((ticket) => ticket.clientId),
      ...tasks.map((task) => task.clientId).filter(Boolean),
    ]);
    const clients = (await this.store.all('clients')).filter((client) => clientIds.has(client.id));
    const clientById = Object.fromEntries(clients.map((client) => [client.id, client]));

    return {
      developerId,
      tasks: await this.enrichTasks(tasks),
      processedRequests: projects.map((project) => ({
        id: project.id,
        clientId: project.clientId,
        clientName: clientById[project.clientId]?.name || 'Клиент',
        niche: project.niche,
        packageId: project.packageId,
        status: project.status,
        sections: project.sections,
        checklistDone: project.checklist.filter((item) => item.done).length,
        checklistTotal: project.checklist.length,
      })),
      supportTickets: tickets,
      counters: {
        openTasks: tasks.length,
        processedRequests: projects.length,
        supportTickets: tickets.filter((ticket) => ticket.status !== 'closed').length,
      },
    };
  }

  async analyticsSummary() {
    const leads = await this.store.all('leads');
    const deals = await this.store.all('deals');
    const tasks = await this.store.all('tasks');
    const payments = await this.store.all('payments');
    const subscriptions = await this.store.all('subscriptions');
    const debts = await this.store.all('debts');
    const projects = await this.store.all('implementationProjects');
    const supportTickets = await this.store.all('supportTickets');

    const sum = (items, key) => items.reduce((acc, item) => acc + Number(item[key] || 0), 0);
    return {
      leads: {
        total: leads.length,
        byStatus: countBy(leads, 'status'),
        byNiche: countBy(leads, 'niche'),
      },
      deals: {
        total: deals.length,
        byStage: countBy(deals, 'stage'),
        pipelineAmount: sum(deals.filter((deal) => ![DEAL_STAGES.WON, DEAL_STAGES.LOST].includes(deal.stage)), 'amount'),
      },
      tasks: {
        open: tasks.filter((task) => task.status !== 'done').length,
        overdue: tasks.filter((task) => task.status !== 'done' && new Date(task.dueAt) < new Date()).length,
      },
      payments: {
        total: payments.length,
        paidAmount: sum(payments, 'amount'),
      },
      subscriptions: {
        total: subscriptions.length,
        active: subscriptions.filter((subscription) => subscription.status === SUBSCRIPTION_STATUSES.ACTIVE).length,
        monthlyRecurringAmount: sum(subscriptions.filter((subscription) => subscription.status === SUBSCRIPTION_STATUSES.ACTIVE), 'amount'),
      },
      debts: {
        open: debts.filter((debt) => debt.status === DEBT_STATUSES.OPEN).length,
        openAmount: sum(debts.filter((debt) => debt.status === DEBT_STATUSES.OPEN), 'amount'),
      },
      implementation: {
        active: projects.filter((project) => ![IMPLEMENTATION_STATUSES.DONE, IMPLEMENTATION_STATUSES.PAUSED].includes(project.status)).length,
        byStatus: countBy(projects, 'status'),
      },
      support: {
        open: supportTickets.filter((ticket) => ticket.status !== 'closed').length,
        byType: countBy(supportTickets, 'type'),
      },
    };
  }

  async demoSnapshot() {
    return {
      pipeline: (await this.store.all('deals')).slice(0, 5).map((deal) => ({
        id: deal.id,
        niche: deal.niche,
        stage: deal.stage,
        packageId: deal.packageId,
        selectedSections: deal.selectedSections,
      })),
      tasks: (await this.store.all('tasks')).slice(0, 5).map((task) => ({
        id: task.id,
        type: task.type,
        title: task.title,
        dueAt: task.dueAt,
        status: task.status,
      })),
      support: (await this.store.all('supportTickets')).slice(0, 5).map((ticket) => ({
        id: ticket.id,
        type: ticket.type,
        title: ticket.title,
        status: ticket.status,
      })),
      note: 'Demo snapshot hides real names, contacts, prices and internal notes.',
    };
  }

  async createTask(payload) {
    const task = await this.store.insert('tasks', {
      type: payload.type,
      title: payload.title,
      dueAt: payload.dueAt,
      status: 'open',
      priority: payload.priority || 'medium',
      responsibleId: payload.responsibleId || (await this.defaultManagerId()),
      leadId: payload.leadId || null,
      clientId: payload.clientId || null,
      dealId: payload.dealId || null,
      projectId: payload.projectId || null,
      ticketId: payload.ticketId || null,
      description: payload.description || '',
      createdById: payload.createdById || null,
      result: null,
      completedAt: null,
    });
    if (task.responsibleId) {
      await this.createNotification({
        recipientId: task.responsibleId,
        type: 'task_assigned',
        title: task.title,
        body: `Приоритет: ${task.priority}`,
        entityType: 'task',
        entityId: task.id,
      });
    }
    return task;
  }

  async createManagementTask(payload, createdById) {
    requireFields(payload, ['title', 'responsibleId']);
    const responsible = await this.store.get('users', payload.responsibleId);
    if (!responsible) throw notFound('Responsible user not found');
    const task = await this.createTask({
      type: payload.type || TASK_TYPES.SUPPORT,
      title: payload.title,
      dueAt: payload.dueAt || addDays(1),
      priority: payload.priority || 'medium',
      responsibleId: payload.responsibleId,
      leadId: payload.leadId || null,
      clientId: payload.clientId || null,
      dealId: payload.dealId || null,
      projectId: payload.projectId || null,
      ticketId: payload.ticketId || null,
      description: payload.description || '',
      createdById,
    });
    await this.audit('management_task_created', 'task', task.id, {
      responsibleId: payload.responsibleId,
      createdById,
      projectId: payload.projectId || null,
      ticketId: payload.ticketId || null,
    });
    return task;
  }

  async createStageTask(deal) {
    const lead = await this.store.get('leads', deal.leadId);
    const name = lead?.name || deal.id;
    if (deal.stage === DEAL_STAGES.PROPOSAL) {
      await this.createTask({
        type: TASK_TYPES.PREPARE_PROPOSAL,
        title: `Подготовить КП: ${name}`,
        dueAt: addDays(0),
        responsibleId: deal.responsibleId,
        leadId: deal.leadId,
        dealId: deal.id,
      });
    }
    if (deal.stage === DEAL_STAGES.FOLLOW_UP) {
      await this.createTask({
        type: TASK_TYPES.FOLLOW_UP,
        title: `Уточнить решение по КП: ${name}`,
        dueAt: addDays(1),
        responsibleId: deal.responsibleId,
        leadId: deal.leadId,
        dealId: deal.id,
      });
    }
    if (deal.stage === DEAL_STAGES.PREPAYMENT) {
      await this.createTask({
        type: TASK_TYPES.PAYMENT,
        title: `Получить предоплату: ${name}`,
        dueAt: addDays(0),
        responsibleId: deal.responsibleId,
        leadId: deal.leadId,
        dealId: deal.id,
        priority: 'high',
      });
    }
    if (deal.stage === DEAL_STAGES.PAYMENT) {
      await this.createTask({
        type: TASK_TYPES.PAYMENT,
        title: `Проконтролировать оплату: ${name}`,
        dueAt: addDays(0),
        responsibleId: deal.responsibleId,
        leadId: deal.leadId,
        dealId: deal.id,
        priority: 'high',
      });
    }
  }

  async ensureClientFromDeal(deal, lead) {
    if (deal.clientId) return await this.store.get('clients', deal.clientId);
    const clients = await this.store.all('clients');
    const existing = clients.find((client) => client.leadId === deal.leadId);
    if (existing) return existing;
    return await this.store.insert('clients', {
      leadId: deal.leadId,
      name: lead?.name || 'Новый клиент',
      direction: deal.direction,
      niche: deal.niche,
      city: lead?.city || null,
      phone: lead?.phone || null,
      contacts: {
        whatsapp: lead?.whatsapp || null,
        instagram: lead?.instagram || null,
        decisionMaker: lead?.decisionMaker || null,
      },
      status: 'implementation',
      subscriptionStatus: 'trial_support',
      activeSections: deal.selectedSections || [],
    });
  }

  async createImplementationProject(deal, client, responsibleId = null) {
    const projects = await this.store.all('implementationProjects');
    const existing = projects.find((project) => project.dealId === deal.id);
    if (existing) {
      if (responsibleId && responsibleId !== existing.responsibleId) {
        return await this.store.update('implementationProjects', existing.id, { responsibleId });
      }
      return existing;
    }
    return await this.store.insert('implementationProjects', {
      clientId: client.id,
      dealId: deal.id,
      niche: deal.niche,
      packageId: deal.packageId,
      sections: deal.selectedSections || [],
      status: IMPLEMENTATION_STATUSES.DATA_COLLECTION,
      checklist: implementationChecklist(deal.niche),
      supportFreeUntil: addMonths(4),
      responsibleId: responsibleId || deal.implementationResponsibleId || (await this.defaultImplementationId()),
    });
  }

  async assertUserRole(userId, allowedRoles) {
    const user = await this.store.get('users', userId);
    if (!user || user.status !== 'active') throw badRequest('Responsible user is not active');
    if (!allowedRoles.includes(user.role)) throw badRequest(`User role cannot be assigned here: ${user.role}`);
    return user;
  }

  async createDataCollectionRequest(projectId, payload = {}) {
    const project = await this.store.get('implementationProjects', projectId);
    if (!project) throw notFound('Implementation project not found');
    const client = await this.store.get('clients', project.clientId);
    const request = await this.store.insert('dataCollectionRequests', {
      projectId,
      clientId: project.clientId,
      niche: project.niche,
      status: 'open',
      items: payload.items || dataCollectionItems(project.niche),
      dueAt: payload.dueAt || addDays(2),
      sentTo: payload.sentTo || client?.phone || null,
      comment: payload.comment || null,
    });

    await this.createTask({
      type: TASK_TYPES.DATA_COLLECTION,
      title: `Собрать данные для запуска: ${client?.name || project.clientId}`,
      dueAt: request.dueAt,
      responsibleId: project.responsibleId || (await this.defaultImplementationId()),
      clientId: project.clientId,
      projectId,
      priority: 'high',
    });
    await this.audit('data_collection_requested', 'implementation_project', projectId, { requestId: request.id });
    return request;
  }

  async updateImplementationStatus(projectId, payload = {}) {
    const project = await this.store.get('implementationProjects', projectId);
    if (!project) throw notFound('Implementation project not found');
    const status = payload.status;
    if (!Object.values(IMPLEMENTATION_STATUSES).includes(status)) {
      throw badRequest(`Unknown implementation status: ${status}`);
    }
    if ([IMPLEMENTATION_STATUSES.PAUSED, IMPLEMENTATION_STATUSES.DONE].includes(status) && !payload.comment) {
      throw badRequest('Comment is required when pausing or completing implementation');
    }

    const previousStatus = project.status;
    const updated = await this.store.update('implementationProjects', projectId, {
      status,
      statusComment: payload.comment || null,
      launchedAt: status === IMPLEMENTATION_STATUSES.SUPPORT && !project.launchedAt ? new Date().toISOString() : project.launchedAt || null,
      completedAt: status === IMPLEMENTATION_STATUSES.DONE ? new Date().toISOString() : project.completedAt || null,
    });

    if (status === IMPLEMENTATION_STATUSES.SUPPORT) {
      await this.createTask({
        type: TASK_TYPES.SUPPORT,
        title: 'Проверить клиента после запуска',
        dueAt: addDays(1),
        responsibleId: await this.defaultSupportId(),
        clientId: project.clientId,
        projectId,
        priority: 'medium',
      });
      await this.createNotification({
        recipientId: await this.defaultSupportId(),
        type: 'implementation_launched',
        title: 'Клиент перешел в поддержку',
        body: `Проект ${projectId} запущен`,
        entityType: 'implementation_project',
        entityId: projectId,
      });
    }

    await this.audit('implementation_status_changed', 'implementation_project', projectId, {
      previousStatus,
      status,
      comment: payload.comment || null,
    });
    return updated;
  }

  async updateChecklistItem(projectId, itemIndex, payload = {}) {
    const project = await this.store.get('implementationProjects', projectId);
    if (!project) throw notFound('Implementation project not found');
    const index = Number(itemIndex);
    if (!Number.isInteger(index) || index < 0 || index >= project.checklist.length) {
      throw badRequest('Checklist item index is invalid');
    }

    const checklist = project.checklist.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      const done = Boolean(payload.done);
      return {
        ...item,
        done,
        completedAt: done ? new Date().toISOString() : null,
        comment: payload.comment || item.comment || null,
      };
    });
    const allDone = checklist.every((item) => item.done);
    const updated = await this.store.update('implementationProjects', projectId, {
      checklist,
      status: allDone ? IMPLEMENTATION_STATUSES.SUPPORT : project.status,
    });
    await this.audit('implementation_checklist_item_updated', 'implementation_project', projectId, {
      index,
      title: checklist[index].title,
      done: checklist[index].done,
      comment: checklist[index].comment,
    });
    return updated;
  }

  async defaultManagerId() {
    const users = await this.store.all('users');
    return users.find((user) => user.role === ROLES.MANAGER)?.id || null;
  }

  async defaultImplementationId() {
    const users = await this.store.all('users');
    return users.find((user) => user.role === ROLES.DEVELOPER)?.id
      || users.find((user) => user.role === ROLES.IMPLEMENTATION)?.id
      || (await this.defaultManagerId());
  }

  async defaultSupportId() {
    const users = await this.store.all('users');
    return users.find((user) => user.role === ROLES.SUPPORT)?.id
      || users.find((user) => user.role === ROLES.DEVELOPER)?.id
      || (await this.defaultImplementationId());
  }

  async audit(action, entityType, entityId, details) {
    await this.store.insert('auditLogs', {
      action,
      entityType,
      entityId,
      details,
      actorId: 'system',
    });
  }
}

function recommendSections(niche, problems) {
  const edutechNiches = new Set(EDUTECH_NICHES);
  const sections = [edutechNiches.has(niche) ? 'students_parents_programs' : 'clients_cars_orders'];
  const text = problems.join(' ').toLowerCase();
  if (edutechNiches.has(niche)) {
    if (text.includes('распис') || text.includes('преподав') || text.includes('кабинет') || ['music_school', 'kids_center', 'mixed_education'].includes(niche)) {
      sections.push('schedule_teachers_rooms');
    }
    if (text.includes('оплат') || text.includes('долг') || text.includes('абонем') || ['language_school', 'tutoring_center', 'mixed_education'].includes(niche)) {
      sections.push('payments_subscriptions_debts');
    }
    if (text.includes('посещ') || text.includes('пропуск') || text.includes('домаш')) sections.push('attendance_progress');
    if (text.includes('заяв') || text.includes('пробн') || text.includes('воронк')) sections.push('trial_lessons_pipeline');
  } else {
    if (text.includes('склад') || ['oil_change', 'repair_shop', 'tire_service'].includes(niche)) sections.push('warehouse');
    if (text.includes('клиент') || text.includes('возврат') || ['oil_change', 'tire_service', 'car_wash'].includes(niche)) sections.push('reminders');
  }
  if (text.includes('деньги') || text.includes('прибыль') || text.includes('отчет') || text.includes('аналит')) sections.push('analytics');
  sections.push(`niche_${niche}`);
  return [...new Set(sections)];
}

function implementationChecklist(niche) {
  const edutechNiches = new Set(EDUTECH_NICHES);
  const base = edutechNiches.has(niche) ? [
    'Получить название, город, логотип и цвета',
    'Получить список администраторов, преподавателей и роли',
    'Получить направления обучения, тарифы, длительность занятий и цены',
    'Настроить тестового ученика, родителя, тариф, расписание и оплату',
    'Провести обучение руководителя, администратора и преподавателя',
  ] : [
    'Получить название, город, логотип и цвета',
    'Получить список сотрудников и роли',
    'Получить список услуг, работ и цен',
    'Создать тестового клиента, авто, заказ и оплату',
    'Провести обучение владельца, администратора и мастера',
  ];
  const byNiche = {
    oil_change: ['Получить список масел, фильтров и остатков', 'Настроить напоминание о повторной замене'],
    tire_service: ['Настроить размеры шин, комплекты и хранение', 'Настроить сезонные напоминания'],
    repair_shop: ['Настроить заказ-наряды, статусы ремонта и запчасти'],
    car_wash: ['Настроить боксы, услуги, абонементы и смены'],
    mixed_service: ['Выбрать активные сценарии: ПЗМ, шины, СТО, мойка'],
    music_school: ['Настроить преподавателей, кабинеты, направления и регулярное расписание', 'Настроить пробные уроки и абонементы'],
    language_school: ['Настроить группы, уровни, расписание и переносы занятий', 'Настроить контроль оплат и долгов по абонементам'],
    tutoring_center: ['Настроить индивидуальные занятия, преподавателей и повторяющееся расписание', 'Настроить отчеты по преподавателям и оплатам'],
    kids_center: ['Настроить возрастные группы, занятия, посещаемость и связь с родителями', 'Настроить напоминания о продлении абонемента'],
    mixed_education: ['Выбрать активные сценарии: группы, индивидуальные занятия, пробные уроки, продления'],
  };
  return [...base, ...(byNiche[niche] || [])].map((title) => ({ title, done: false }));
}

function dataCollectionItems(niche) {
  const edutechNiches = new Set(EDUTECH_NICHES);
  const base = edutechNiches.has(niche) ? [
    { key: 'company_profile', title: 'Название, город, контакты, график работы', required: true, received: false },
    { key: 'team', title: 'Администраторы, преподаватели, роли и доступы', required: true, received: false },
    { key: 'programs_tariffs', title: 'Направления обучения, тарифы, длительность и цены', required: true, received: false },
    { key: 'schedule_rules', title: 'Кабинеты, регулярное расписание и правила переносов', required: true, received: false },
  ] : [
    { key: 'company_profile', title: 'Название, город, контакты, график работы', required: true, received: false },
    { key: 'team', title: 'Сотрудники, роли и доступы', required: true, received: false },
    { key: 'services_prices', title: 'Услуги, работы и цены', required: true, received: false },
    { key: 'test_cases', title: 'Тестовые клиенты, авто и сценарии заказов', required: true, received: false },
  ];
  const byNiche = {
    oil_change: [
      { key: 'oil_filters_stock', title: 'Масла, фильтры, закупочные цены и остатки', required: true, received: false },
      { key: 'replacement_reminders', title: 'Правила напоминаний по пробегу и сроку', required: false, received: false },
    ],
    tire_service: [
      { key: 'tire_sizes_storage', title: 'Размеры шин, комплекты и условия хранения', required: true, received: false },
      { key: 'season_calendar', title: 'Сезонный календарь переобувки', required: false, received: false },
    ],
    repair_shop: [
      { key: 'repair_statuses', title: 'Статусы ремонта и заказ-наряда', required: true, received: false },
      { key: 'parts_flow', title: 'Запчасти, поставщики и списания', required: false, received: false },
    ],
    car_wash: [
      { key: 'boxes_schedule', title: 'Боксы, смены и расписание', required: true, received: false },
      { key: 'passes', title: 'Абонементы и пакеты моек', required: false, received: false },
    ],
    mixed_service: [
      { key: 'active_scenarios', title: 'Активные сценарии: ПЗМ, шины, СТО, мойка', required: true, received: false },
    ],
    music_school: [
      { key: 'teachers_rooms', title: 'Преподаватели, кабинеты и доступное время', required: true, received: false },
      { key: 'trial_lessons', title: 'Правила пробных уроков и первой продажи', required: false, received: false },
    ],
    language_school: [
      { key: 'groups_levels', title: 'Группы, уровни и учебные форматы', required: true, received: false },
      { key: 'attendance_rules', title: 'Посещаемость, переносы и отработки', required: false, received: false },
    ],
    tutoring_center: [
      { key: 'individual_schedule', title: 'Индивидуальное расписание преподавателей', required: true, received: false },
      { key: 'teacher_payouts', title: 'Правила расчета преподавателей', required: false, received: false },
    ],
    kids_center: [
      { key: 'age_groups', title: 'Возрастные группы и расписание занятий', required: true, received: false },
      { key: 'parent_notifications', title: 'Шаблоны сообщений родителям', required: false, received: false },
    ],
    mixed_education: [
      { key: 'active_scenarios', title: 'Активные сценарии: группы, индивидуально, пробные, продления', required: true, received: false },
    ],
  };
  return [...base, ...(byNiche[niche] || [])];
}

function timelineFrom(type, items, build, dateKey = 'createdAt') {
  return items.map((item) => ({
    type,
    at: item[dateKey] || item.createdAt || item.updatedAt || new Date().toISOString(),
    ...build(item),
  }));
}

function listItems(collection, items, filters = {}) {
  const query = normalizeListQuery(filters);
  const filtered = items.filter((item) => matchesListQuery(item, query));
  const sorted = sortItems(filtered, query.sort);
  const page = paginateItems(sorted, query.page, query.limit);
  return {
    data: collection === 'users' ? page.data.map(safeUserRecord) : page.data,
    meta: {
      total: filtered.length,
      page: query.page,
      limit: query.limit,
      pages: Math.max(1, Math.ceil(filtered.length / query.limit)),
      sort: query.sort,
      filters: query.filters,
      search: query.search,
    },
  };
}

function isActiveLeadRecord(lead) {
  return ![LEAD_STATUSES.WON, LEAD_STATUSES.LOST].includes(lead.status);
}

function isNewLeadRecord(lead) {
  return [LEAD_STATUSES.NEW, LEAD_STATUSES.CONTACT_CHECK].includes(lead.status);
}

function isStaleLeadRecord(lead) {
  if (!isActiveLeadRecord(lead)) return false;
  const updated = new Date(lead.updatedAt || lead.createdAt);
  if (Number.isNaN(updated.getTime())) return false;
  return Date.now() - updated.getTime() >= 1000 * 60 * 60 * 24 * 2;
}

function filterLeadsByQueue(leads = [], queue = '') {
  if (queue === 'new') return leads.filter(isNewLeadRecord);
  if (queue === 'stale') return leads.filter(isStaleLeadRecord);
  if (queue === 'no_responsible') return leads.filter((lead) => !lead.responsibleId);
  if (queue === 'diagnostics') return leads.filter((lead) => [LEAD_STATUSES.DIAGNOSTICS, LEAD_STATUSES.MEETING].includes(lead.status));
  if (queue === 'active') return leads.filter(isActiveLeadRecord);
  return leads;
}

function phoneLookupVariants(phone = '') {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return [];
  const variants = new Set([raw, digits, `+${digits}`]);
  if (digits.length === 10) {
    variants.add(`7${digits}`);
    variants.add(`+7${digits}`);
    variants.add(`8${digits}`);
  }
  if (digits.length === 11 && digits.startsWith('8')) {
    variants.add(`7${digits.slice(1)}`);
    variants.add(`+7${digits.slice(1)}`);
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    variants.add(`+${digits}`);
    variants.add(`8${digits.slice(1)}`);
  }
  return [...variants];
}

function phoneMatches(value, variants) {
  const valueDigits = String(value || '').replace(/\D/g, '');
  return variants.some((variant) => {
    const variantDigits = String(variant || '').replace(/\D/g, '');
    return value === variant || (valueDigits && valueDigits === variantDigits);
  });
}

function mapById(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function taskRelationLabel(task, refs) {
  const lead = task.leadId ? refs.leadById.get(task.leadId) : null;
  if (lead) return { relatedType: 'Заявка', relatedLabel: lead.name || lead.company || 'Без названия' };

  const client = task.clientId ? refs.clientById.get(task.clientId) : null;
  if (client) return { relatedType: 'Клиент', relatedLabel: client.name || 'Без названия' };

  const deal = task.dealId ? refs.dealById.get(task.dealId) : null;
  if (deal) {
    const dealLead = deal.leadId ? refs.leadById.get(deal.leadId) : null;
    const dealClient = deal.clientId ? refs.clientById.get(deal.clientId) : null;
    return { relatedType: 'Сделка', relatedLabel: dealClient?.name || dealLead?.name || deal.packageId || 'Без названия' };
  }

  const project = task.projectId ? refs.projectById.get(task.projectId) : null;
  if (project) {
    const projectClient = project.clientId ? refs.clientById.get(project.clientId) : null;
    return { relatedType: 'Внедрение', relatedLabel: projectClient?.name || project.packageId || 'Без названия' };
  }

  const ticket = task.ticketId ? refs.ticketById.get(task.ticketId) : null;
  if (ticket) {
    const ticketClient = ticket.clientId ? refs.clientById.get(ticket.clientId) : null;
    return { relatedType: 'Обращение', relatedLabel: ticket.title || ticketClient?.name || 'Без названия' };
  }

  return { relatedType: null, relatedLabel: null };
}

function systemReferenceItems() {
  return [
    ...arrayReferenceItems('roles', Object.values(ROLES)),
    ...arrayReferenceItems('autotech_niches', AUTOTECH_NICHES),
    ...arrayReferenceItems('edutech_niches', EDUTECH_NICHES),
    ...objectReferenceItems('lead_statuses', LEAD_STATUSES),
    ...objectReferenceItems('deal_stages', DEAL_STAGES),
    ...objectReferenceItems('task_types', TASK_TYPES),
    ...objectReferenceItems('packages', PACKAGES),
    ...objectReferenceItems('implementation_statuses', IMPLEMENTATION_STATUSES),
    ...objectReferenceItems('support_ticket_types', SUPPORT_TICKET_TYPES),
    ...objectReferenceItems('support_ticket_statuses', SUPPORT_TICKET_STATUSES),
    ...objectReferenceItems('subscription_statuses', SUBSCRIPTION_STATUSES),
    ...objectReferenceItems('debt_statuses', DEBT_STATUSES),
    ...objectReferenceItems('communication_results', COMMUNICATION_RESULTS),
  ];
}

function objectReferenceItems(group, source) {
  return Object.entries(source).map(([name, key], index) => ({
    id: `system_${group}_${key}`,
    group,
    key,
    label: humanizeReferenceLabel(name),
    value: { system: true },
    status: 'system',
    sortOrder: index,
  }));
}

function arrayReferenceItems(group, source) {
  return source.map((key, index) => ({
    id: `system_${group}_${key}`,
    group,
    key,
    label: humanizeReferenceLabel(key),
    value: { system: true },
    status: 'system',
    sortOrder: index,
  }));
}

function humanizeReferenceLabel(value) {
  const key = String(value || '').toLowerCase();
  if (REFERENCE_LABELS[key]) return REFERENCE_LABELS[key];
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const REFERENCE_LABELS = Object.freeze({
  active: 'Активно',
  analytics: 'Аналитика',
  attendance_progress: 'Посещаемость и прогресс',
  autotech: 'Автобизнес',
  autotech_niches: 'Ниши автобизнеса',
  business: 'Бизнес',
  call: 'Звонок',
  cancelled: 'Отменено',
  car_wash: 'Автомойка',
  check_contact: 'Проверить контакт',
  clients_cars_orders: 'Клиенты, автомобили и заказы',
  configuration: 'Настройка',
  consultation: 'Консультация',
  communication_results: 'Результаты общения',
  contact_check: 'Проверка контакта',
  content: 'Контент',
  data_collection: 'Сбор данных',
  debt_statuses: 'Статусы долгов',
  deal_stages: 'Этапы сделок',
  developer: 'Программист',
  diagnostics: 'Диагностика',
  done: 'Готово',
  due_soon: 'Скоро оплата',
  edutech: 'Обучение',
  edutech_niches: 'Ниши обучения',
  expensive: 'Дорого',
  first_message: 'Первое сообщение',
  first_touch: 'Первое касание',
  follow_up: 'Повторный контакт',
  implementation: 'Внедрение',
  in_progress: 'В работе',
  interested: 'Интерес есть',
  kids_center: 'Детский центр',
  language_school: 'Языковая школа',
  launch: 'Запуск',
  lost: 'Проиграно',
  manager: 'Менеджер',
  meeting: 'Встреча',
  meeting_set: 'Встреча назначена',
  mixed_education: 'Смешанный учебный центр',
  mixed_service: 'Смешанный автосервис',
  music_school: 'Музыкальная школа',
  network: 'Сеть',
  new: 'Новая',
  no_answer: 'Нет ответа',
  oil_change: 'Пункт замены масла',
  open: 'Открыто',
  overdue: 'Просрочено',
  owner: 'Владелец',
  packages: 'Пакеты',
  paid: 'Оплачено',
  paid_change: 'Платная доработка',
  paused: 'Пауза',
  payment: 'Оплата',
  payments_subscriptions_debts: 'Оплаты, абонементы и долги',
  payment_recorded: 'Оплата записана',
  payment_updated: 'Оплата изменена',
  prepare_proposal: 'Подготовить предложение',
  prepayment: 'Предоплата',
  presentation: 'Презентация',
  prepayment_recorded: 'Предоплата записана',
  pro: 'Про',
  proposal: 'Предложение',
  proposal_created: 'Предложение создано',
  proposal_sent: 'Предложение отправлено',
  proposal_updated: 'Предложение изменено',
  question: 'Вопрос',
  rejected: 'Отказ',
  repair_shop: 'СТО',
  reminders: 'Напоминания клиентам',
  return_later: 'Вернуться позже',
  roles: 'Роли',
  sales_lead: 'Руководитель продаж',
  schedule_teachers_rooms: 'Расписание, преподаватели и кабинеты',
  start: 'Старт',
  subscription_statuses: 'Статусы подписок',
  students_parents_programs: 'Ученики, родители и программы',
  supervisor: 'Управляющий',
  support: 'Поддержка',
  support_ticket_statuses: 'Статусы обращений',
  support_ticket_types: 'Типы обращений',
  task_types: 'Типы задач',
  tire_service: 'Шиномонтаж',
  trial_support: 'Бесплатная поддержка',
  trial_lessons_pipeline: 'Пробные занятия и воронка',
  tutoring_center: 'Репетиторский центр',
  waiting_client: 'Ждем клиента',
  waiting_start: 'Ожидает старта',
  warehouse: 'Склад и остатки',
  won: 'Выиграно',
});

function normalizeListQuery(raw = {}) {
  const filters = {};
  const reserved = new Set(['q', 'search', 'sort', 'page', 'limit', 'offset']);
  Object.entries(raw).forEach(([key, value]) => {
    if (reserved.has(key) || value == null || value === '') return;
    filters[key] = value;
  });
  const limit = clampNumber(Number(raw.limit || 50), 1, 200);
  return {
    filters,
    search: raw.q || raw.search || '',
    sort: raw.sort || '-createdAt',
    page: Math.max(1, Number(raw.page || 1)),
    limit,
  };
}

function matchesListQuery(item, query) {
  if (query.search && !matchesSearch(item, query.search)) return false;
  return Object.entries(query.filters).every(([key, value]) => matchesFilter(item, key, value));
}

function matchesSearch(item, search) {
  const needle = String(search).toLowerCase();
  return Object.values(flattenSearchable(item)).some((value) => {
    return String(value || '').toLowerCase().includes(needle);
  });
}

function flattenSearchable(item) {
  return {
    id: item.id,
    name: item.name,
    title: item.title,
    phone: item.phone,
    city: item.city,
    niche: item.niche,
    status: item.status,
    stage: item.stage,
    type: item.type,
    description: item.description,
    text: item.text,
    result: item.result,
  };
}

function matchesFilter(item, key, value) {
  if (key.endsWith('From')) return compareRange(item[key.slice(0, -4)], value, 'from');
  if (key.endsWith('To')) return compareRange(item[key.slice(0, -2)], value, 'to');

  const actual = getPath(item, key);
  const expectedValues = String(value).split(',').map((part) => part.trim()).filter(Boolean);
  if (!expectedValues.length) return true;
  return expectedValues.some((expected) => {
    if (actual == null) return false;
    return String(actual).toLowerCase() === expected.toLowerCase();
  });
}

function compareRange(actual, expected, direction) {
  if (actual == null || expected == null || expected === '') return true;
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    return direction === 'from' ? actualNumber >= expectedNumber : actualNumber <= expectedNumber;
  }
  const actualDate = new Date(actual);
  const expectedDate = new Date(expected);
  if (!isNaN(actualDate.getTime()) && !isNaN(expectedDate.getTime())) {
    return direction === 'from' ? actualDate >= expectedDate : actualDate <= expectedDate;
  }
  return true;
}

function sortItems(items, sortExpression) {
  const fields = String(sortExpression || '-createdAt').split(',').map((field) => field.trim()).filter(Boolean);
  if (!fields.length) return items;
  return [...items].sort((a, b) => {
    for (const field of fields) {
      const direction = field.startsWith('-') ? -1 : 1;
      const key = field.replace(/^-/, '');
      const result = compareValues(getPath(a, key), getPath(b, key));
      if (result !== 0) return result * direction;
    }
    return 0;
  });
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
  const aDate = new Date(a);
  const bDate = new Date(b);
  if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) return aDate.getTime() - bDate.getTime();
  return String(a).localeCompare(String(b), 'ru');
}

function paginateItems(items, page, limit) {
  const start = (page - 1) * limit;
  return { data: items.slice(start, start + limit) };
}

function getPath(item, path) {
  return String(path).split('.').reduce((value, key) => {
    if (value == null) return null;
    return value[key];
  }, item);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeUserRecord(user) {
  if (!user) return null;
  const { apiToken, passwordHash, ...safe } = user;
  return safe;
}

function createApiToken(role) {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `crm_${role}_${Date.now().toString(36)}_${suffix}`;
}

function probabilityForStage(stage) {
  return {
    [DEAL_STAGES.DIAGNOSTICS]: 20,
    [DEAL_STAGES.PRESENTATION]: 35,
    [DEAL_STAGES.PROPOSAL]: 50,
    [DEAL_STAGES.FOLLOW_UP]: 60,
    [DEAL_STAGES.PREPAYMENT]: 70,
    [DEAL_STAGES.PAYMENT]: 80,
    [DEAL_STAGES.IMPLEMENTATION]: 90,
    [DEAL_STAGES.WON]: 100,
    [DEAL_STAGES.LOST]: 0,
  }[stage] ?? 10;
}

function nextActionForStage(stage) {
  if ([DEAL_STAGES.PROPOSAL, DEAL_STAGES.PREPAYMENT, DEAL_STAGES.PAYMENT].includes(stage)) return addDays(0);
  if (stage === DEAL_STAGES.FOLLOW_UP) return addDays(1);
  return addDays(2);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addBusinessDaysAtHour(days, hour, minute = 0) {
  const aqTobeOffsetMinutes = 5 * 60;
  const businessNow = new Date(Date.now() + aqTobeOffsetMinutes * 60000);
  const targetAsUtc = Date.UTC(
    businessNow.getUTCFullYear(),
    businessNow.getUTCMonth(),
    businessNow.getUTCDate() + days,
    hour,
    minute,
    0,
    0,
  );
  return new Date(targetAsUtc - aqTobeOffsetMinutes * 60000).toISOString();
}

function addDaysFrom(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addMonths(months) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

function addMonthsFrom(value, months) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function sameDay(value, date) {
  const source = new Date(value);
  if (isNaN(source.getTime())) return false;
  return source.getFullYear() === date.getFullYear()
    && source.getMonth() === date.getMonth()
    && source.getDate() === date.getDate();
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] == null || payload[field] === '');
  if (missing.length) throw badRequest(`Missing fields: ${missing.join(', ')}`);
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

module.exports = { CrmService };
