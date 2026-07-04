const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JsonStore, EMPTY_DB } = require('../src/store/jsonStore');
const { CrmService } = require('../src/services/crmService');
const { AuthService } = require('../src/services/authService');
const { DIRECTIONS, PERMISSIONS } = require('../src/domain/constants');
const { navigationForRole } = require('../src/domain/navigation');

async function main() {
  const tmpDb = path.join(__dirname, '../data/test-db.json');
  if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);

  const now = new Date().toISOString();
  const store = new JsonStore(tmpDb);
  store.replaceAll({
    ...structuredClone(EMPTY_DB),
    users: [
      { id: 'usr_owner', name: 'Owner', role: 'owner', status: 'active', apiToken: 'owner-token', createdAt: now, updatedAt: now },
      { id: 'usr_supervisor', name: 'Supervisor', role: 'supervisor', email: 'supervisor@edudev.local', status: 'active', apiToken: 'supervisor-token', passwordHash: require('../src/lib/password').hashPassword('edudev123', 'test-salt'), createdAt: now, updatedAt: now },
      { id: 'usr_manager', name: 'Manager', role: 'manager', status: 'active', apiToken: 'manager-token', createdAt: now, updatedAt: now },
      { id: 'usr_developer', name: 'Developer', role: 'developer', status: 'active', apiToken: 'developer-token', createdAt: now, updatedAt: now },
      { id: 'usr_impl', name: 'Implementation', role: 'implementation', status: 'active', apiToken: 'implementation-token', createdAt: now, updatedAt: now },
      { id: 'usr_support', name: 'Support', role: 'support', status: 'active', apiToken: 'support-token', createdAt: now, updatedAt: now },
    ],
  });

  const crm = new CrmService(store);
  const auth = new AuthService(store);

  const session = await auth.login({ email: 'supervisor-token', password: 'wrong' }).catch((error) => error);
  assert.match(session.message, /Invalid email or password/);
  const loggedIn = await auth.login({ email: 'Supervisor@edudev.local', password: 'edudev123' });
  assert.ok(loggedIn.token);
  assert.equal(loggedIn.user.apiToken, undefined);
  const sessionUser = await auth.authenticate({ headers: { authorization: `Bearer ${loggedIn.token}` } });
  assert.equal(sessionUser.id, 'usr_supervisor');
  const logoutResult = await auth.logout(loggedIn.token);
  assert.equal(logoutResult.revoked, true);
  await assert.rejects(() => auth.authenticate({ headers: { authorization: `Bearer ${loggedIn.token}` } }), /Invalid bearer token/);
  const secondLogin = await auth.login({ email: 'supervisor@edudev.local', password: 'edudev123' });
  const changedUser = await auth.changePassword(sessionUser, {
    currentPassword: 'edudev123',
    newPassword: 'newpass123',
  });
  assert.equal(changedUser.apiToken, undefined);
  await assert.rejects(() => auth.authenticate({ headers: { authorization: `Bearer ${secondLogin.token}` } }), /Invalid bearer token/);
  const loginWithNewPassword = await auth.login({ email: 'supervisor@edudev.local', password: 'newpass123' });
  assert.ok(loginWithNewPassword.token);

  const manager = await auth.authenticate({ headers: { authorization: 'Bearer manager-token' } });
  assert.equal(manager.id, 'usr_manager');
  await assert.rejects(() => auth.authenticate({ headers: {} }), /Missing bearer token/);
  assert.throws(() => auth.require(manager, PERMISSIONS.ANALYTICS_READ), /Permission denied/);
  auth.require(await auth.authenticate({ headers: { authorization: 'Bearer owner-token' } }), PERMISSIONS.ANALYTICS_READ);
  const supervisor = await auth.authenticate({ headers: { authorization: 'Bearer supervisor-token' } });
  auth.require(supervisor, PERMISSIONS.TASK_WRITE);
  const developer = await auth.authenticate({ headers: { authorization: 'Bearer developer-token' } });
  assert.throws(() => auth.require(developer, PERMISSIONS.LEAD_WRITE), /Permission denied/);
  assert.deepEqual(navigationForRole('manager').map((item) => item.id), [
    'dashboard',
    'leads',
    'diagnostics',
    'deals',
    'tasks',
    'clients',
    'materials',
  ]);
  assert.ok(!navigationForRole('manager').some((item) => item.id === 'finance'));
  assert.ok(navigationForRole('developer').some((item) => item.id === 'developer'));
  assert.ok(!navigationForRole('developer').some((item) => item.id === 'leads'));
  assert.ok(navigationForRole('supervisor').some((item) => item.id === 'audit'));
  assert.equal(navigationForRole('manager').find((item) => item.id === 'materials').api[0], '/api/materials');
  const newDeveloper = await crm.createUser({
    name: 'Junior Developer',
    role: 'developer',
    email: 'junior@edudev.local',
  }, 'usr_supervisor');
  assert.equal(newDeveloper.role, 'developer');
  assert.equal(newDeveloper.apiToken, undefined);
  const updatedDeveloper = await crm.updateUser(newDeveloper.id, {
    status: 'inactive',
    role: 'support',
  }, 'usr_supervisor');
  assert.equal(updatedDeveloper.status, 'inactive');
  assert.equal(updatedDeveloper.role, 'support');
  const usersList = await crm.list('users');
  assert.ok(usersList.data.every((user) => user.apiToken === undefined));
  const dictionaries = await crm.settingsDictionaries();
  assert.ok(dictionaries.autotech_niches.some((item) => item.key === 'oil_change'));
  assert.ok(dictionaries.edutech_niches.some((item) => item.key === 'music_school'));
  const detailingNiche = await crm.createReferenceItem({
    group: 'autotech_niches',
    key: 'detailing',
    label: 'Детейлинг',
    value: { description: 'Детейлинг-студия' },
    sortOrder: 20,
  }, 'usr_supervisor');
  assert.equal(detailingNiche.status, 'active');
  await assert.rejects(() => crm.createReferenceItem({
    group: 'autotech_niches',
    key: 'detailing',
    label: 'Дубль',
  }), /already exists/);
  const updatedReferenceItem = await crm.updateReferenceItem(detailingNiche.id, {
    label: 'Детейлинг и детейлинг-центр',
  }, 'usr_supervisor');
  assert.equal(updatedReferenceItem.label, 'Детейлинг и детейлинг-центр');

  const lead = await crm.createLead({
    name: 'Oil Service Aktobe',
    niche: 'oil_change',
    city: 'Актобе',
    phone: '+77000000000',
    currentAccounting: 'Excel',
    pain: 'склад и повторные клиенты',
  });

  assert.equal((await store.all('leads')).length, 1);
  assert.equal((await store.all('tasks')).length, 1);
  const secondLead = await crm.createLead({
    name: 'Tire Service Astana',
    niche: 'tire_service',
    city: 'Астана',
    phone: '+77000000001',
  });
  await crm.updateLead(secondLead.id, { status: 'lost' });
  const filteredLeads = await crm.list('leads', { status: 'contact_check', sort: 'name', limit: '1' });
  assert.equal(filteredLeads.data.length, 1);
  assert.equal(filteredLeads.data[0].name, 'Oil Service Aktobe');
  assert.equal(filteredLeads.meta.total, 1);
  const searchedLeads = await crm.list('leads', { q: 'astana' });
  assert.equal(searchedLeads.data.length, 1);
  assert.equal(searchedLeads.data[0].id, secondLead.id);
  const multiStatusLeads = await crm.list('leads', { status: 'contact_check,lost', sort: '-createdAt', page: '1', limit: '1' });
  assert.equal(multiStatusLeads.meta.total, 2);
  assert.equal(multiStatusLeads.meta.pages, 2);
  const detailingLead = await crm.createLead({
    name: 'Detailing Studio',
    niche: 'detailing',
    city: 'Алматы',
    phone: '+77000000002',
  });
  assert.equal(detailingLead.niche, 'detailing');
  const materials = await crm.listForUser('materials', { limit: '100' }, manager);
  assert.ok(Array.isArray(materials.data));

  const { diagnostics, deal } = await crm.addDiagnostics(lead.id, {
    problems: ['склад не сходится', 'клиенты не возвращаются'],
    answers: { warehouse: true, reminders: true },
    estimatedAmount: 300000,
  });

  assert.ok(diagnostics.recommendedSections.includes('warehouse'));
  assert.ok(diagnostics.recommendedSections.includes('reminders'));
  assert.equal((await store.all('deals')).length, 1);

  const proposal = await crm.createProposal(deal.id, {
    amount: 350000,
    sections: diagnostics.recommendedSections,
  });
  assert.equal(proposal.status, 'sent');

  await assert.rejects(() => crm.updateDealAmount(deal.id, { amount: 320000 }), /reason/);
  const repricedDeal = await crm.updateDealAmount(deal.id, {
    amount: 320000,
    reason: 'Согласовали стартовый набор без склада',
  });
  assert.equal(repricedDeal.amount, 320000);

  const result = await crm.recordPayment(deal.id, {
    amount: 180000,
    method: 'kaspi',
  });

  assert.equal(result.client.status, 'implementation');
  assert.equal((await store.all('implementationProjects')).length, 1);
  assert.equal((await store.all('payments')).length, 1);
  assert.ok((await store.all('tasks')).some((task) => task.type === 'handoff_implementation'));
  const project = (await store.all('implementationProjects'))[0];
  const dataRequest = await crm.createDataCollectionRequest(project.id);
  assert.equal(dataRequest.status, 'open');
  assert.ok(dataRequest.items.length >= 4);
  const updatedProject = await crm.updateChecklistItem(project.id, 0, {
    done: true,
    comment: 'Данные получены',
  });
  assert.equal(updatedProject.checklist[0].done, true);
  const implementationInConfiguration = await crm.updateImplementationStatus(project.id, {
    status: 'configuration',
  });
  assert.equal(implementationInConfiguration.status, 'configuration');
  await assert.rejects(() => crm.updateImplementationStatus(project.id, { status: 'paused' }), /Comment/);
  const implementationInSupport = await crm.updateImplementationStatus(project.id, {
    status: 'support',
    comment: 'Запуск проведен',
  });
  assert.equal(implementationInSupport.status, 'support');
  assert.equal(project.responsibleId, 'usr_developer');
  const managementTask = await crm.createManagementTask({
    title: 'Проверить интеграцию кассы после внедрения',
    responsibleId: 'usr_developer',
    projectId: project.id,
    clientId: result.client.id,
    priority: 'high',
  }, 'usr_supervisor');
  assert.equal(managementTask.createdById, 'usr_supervisor');
  const developerWorkbench = await crm.developerWorkbench('usr_developer');
  assert.equal(developerWorkbench.counters.processedRequests, 1);
  assert.ok(developerWorkbench.tasks.some((item) => item.id === managementTask.id));

  const leadDetail = await crm.detail('leads', lead.id);
  assert.equal(leadDetail.deals.length, 1);
  assert.ok(leadDetail.tasks.length >= 1);
  const dealDetail = await crm.detail('deals', deal.id);
  assert.equal(dealDetail.lead.id, lead.id);
  assert.equal(dealDetail.implementationProject.id, project.id);
  const clientDetail = await crm.detail('clients', result.client.id);
  assert.equal(clientDetail.implementationProjects.length, 1);
  assert.equal(clientDetail.payments.length, 1);
  const projectDetail = await crm.detail('implementationProjects', project.id);
  assert.equal(projectDetail.client.id, result.client.id);
  assert.equal(projectDetail.dataCollectionRequests.length, 1);

  const supportTicket = await crm.createSupportTicket({
    clientId: result.client.id,
    projectId: project.id,
    type: 'bug',
    title: 'Проверить ошибку в кассе',
    description: 'После запуска клиент сообщил о проблеме',
  });
  assert.equal(supportTicket.status, 'open');
  const assignedTicket = await crm.updateSupportTicket(supportTicket.id, {
    responsibleId: 'usr_developer',
    status: 'in_progress',
    comment: 'Передано программисту',
  });
  assert.equal(assignedTicket.responsibleId, 'usr_developer');
  assert.equal(assignedTicket.status, 'in_progress');
  const developerWorkbenchWithTicket = await crm.developerWorkbench('usr_developer');
  assert.ok(developerWorkbenchWithTicket.supportTickets.some((item) => item.id === supportTicket.id));
  const developerNotifications = await crm.notificationsForUser('usr_developer');
  assert.ok(developerNotifications.unreadCount >= 1);
  assert.ok(developerNotifications.notifications.some((item) => item.type === 'support_ticket_assigned'));
  const readNotification = await crm.markNotificationRead(developerNotifications.notifications[0].id, 'usr_developer');
  assert.equal(readNotification.status, 'read');
  await assert.rejects(() => crm.closeSupportTicket(supportTicket.id), /result/);
  const closedTicket = await crm.closeSupportTicket(supportTicket.id, {
    result: 'Исправлено и проверено на тестовом заказе',
  });
  assert.equal(closedTicket.status, 'closed');
  const ticketDetail = await crm.detail('supportTickets', supportTicket.id);
  assert.equal(ticketDetail.client.id, result.client.id);
  const managerScopedLeads = await crm.listForUser('leads', {}, manager);
  assert.equal(managerScopedLeads.meta.total, 3);
  const developerScopedLeads = await crm.listForUser('leads', {}, developer);
  assert.equal(developerScopedLeads.meta.total, 0);
  const developerScopedClients = await crm.listForUser('clients', {}, developer);
  assert.equal(developerScopedClients.meta.total, 1);
  assert.equal(developerScopedClients.data[0].id, result.client.id);
  const developerScopedProjects = await crm.listForUser('implementationProjects', {}, developer);
  assert.equal(developerScopedProjects.meta.total, 1);
  const developerScopedTickets = await crm.listForUser('supportTickets', {}, developer);
  assert.equal(developerScopedTickets.meta.total, 1);
  const developerClientDetail = await crm.detailForUser('clients', result.client.id, developer);
  assert.equal(developerClientDetail.client.id, result.client.id);
  await assert.rejects(() => crm.detailForUser('leads', lead.id, developer), /Record not found/);

  const subscription = await crm.createSubscription(result.client.id, {
    amount: 20000,
    packageId: 'business',
  });
  assert.equal(subscription.status, 'active');
  const renewed = await crm.renewSubscription(subscription.id, { comment: 'Оплата за следующий месяц' });
  assert.equal(renewed.status, 'active');
  const debt = await crm.createDebt(result.client.id, {
    amount: 20000,
    reason: 'Не оплачено продление',
    dueAt: new Date().toISOString(),
  });
  assert.equal(debt.status, 'open');
  const paidDebt = await crm.markDebtPaid(debt.id, { comment: 'Оплачено Kaspi' });
  assert.equal(paidDebt.status, 'paid');
  const supportNotifications = await crm.notificationsForUser('usr_support');
  assert.ok(supportNotifications.notifications.some((item) => item.type === 'debt_created'));
  const readAll = await crm.markAllNotificationsRead('usr_support');
  assert.ok(readAll.updated >= 1);
  const timeline = await crm.clientTimeline(result.client.id);
  assert.ok(timeline.some((item) => item.type === 'payment'));
  assert.ok(timeline.some((item) => item.type === 'support_ticket'));
  assert.ok(timeline.some((item) => item.type === 'debt'));

  const communication = await crm.addCommunication({
    leadId: lead.id,
    dealId: deal.id,
    channel: 'call',
    result: 'interested',
    responsibleId: 'usr_manager',
  });
  assert.equal(communication.result, 'interested');
  assert.ok((await store.all('tasks')).some((task) => task.type === 'diagnostics'));

  const tasks = await store.all('tasks');
  await assert.rejects(() => crm.completeTask(tasks[0].id), /Task result is required/);
  const task = await crm.completeTask(tasks[0].id, { result: 'contact checked' });
  assert.equal(task.status, 'done');

  await assert.rejects(
    () => crm.rescheduleTask(tasks[1].id, { dueAt: new Date().toISOString() }),
    /comment/,
  );

  const analytics = await crm.analyticsSummary();
  assert.equal(analytics.leads.total, 3);
  assert.equal(analytics.payments.paidAmount, 180000);
  assert.equal(analytics.subscriptions.active, 1);
  assert.equal(analytics.debts.open, 0);

  const workbench = await crm.managerToday('usr_manager');
  assert.ok(workbench.counters);
  const workload = await crm.teamWorkload();
  const developerLoad = workload.find((item) => item.user.id === 'usr_developer');
  assert.ok(developerLoad);
  assert.ok(developerLoad.counters.openTasks >= 1);
  assert.equal(developerLoad.user.apiToken, undefined);

  const demo = await crm.demoSnapshot();
  assert.ok(demo.note.includes('hides real names'));

  const edutechLead = await crm.createLead({
    name: 'Maestro Music School',
    direction: DIRECTIONS.EDUTECH,
    niche: 'music_school',
    city: 'Актобе',
    phone: '+77000000003',
    currentAccounting: 'таблицы и WhatsApp',
    pain: 'расписание, оплаты и долги родителей',
  });
  assert.equal(edutechLead.direction, DIRECTIONS.EDUTECH);
  const edutechFlow = await crm.addDiagnostics(edutechLead.id, {
    problems: ['расписание преподавателей', 'оплаты и долги родителей', 'пробные уроки'],
    estimatedAmount: 250000,
  });
  assert.equal(edutechFlow.deal.direction, DIRECTIONS.EDUTECH);
  assert.ok(edutechFlow.diagnostics.recommendedSections.includes('students_parents_programs'));
  assert.ok(edutechFlow.diagnostics.recommendedSections.includes('schedule_teachers_rooms'));
  assert.ok(edutechFlow.diagnostics.recommendedSections.includes('payments_subscriptions_debts'));
  const edutechPaymentResult = await crm.recordPayment(edutechFlow.deal.id, {
    amount: 125000,
    method: 'kaspi',
  });
  const edutechProject = (await store.all('implementationProjects')).find((item) => item.dealId === edutechFlow.deal.id);
  assert.ok(edutechProject);
  assert.equal(edutechPaymentResult.client.direction, DIRECTIONS.EDUTECH);
  assert.ok(edutechProject.checklist.some((item) => item.title.includes('преподавателей')));
  const edutechDataRequest = await crm.createDataCollectionRequest(edutechProject.id);
  assert.ok(edutechDataRequest.items.some((item) => item.key === 'programs_tariffs'));
  await assert.rejects(() => crm.createLead({
    name: 'Wrong School',
    direction: DIRECTIONS.EDUTECH,
    niche: 'oil_change',
    city: 'Актобе',
    phone: '+77000000004',
  }), /Unknown edutech niche/);

  fs.unlinkSync(tmpDb);
  console.log('Smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
