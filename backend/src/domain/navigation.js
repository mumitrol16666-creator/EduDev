const { ROLES } = require('./constants');

const MENU_ITEMS = Object.freeze([
  {
    id: 'dashboard',
    label: 'Рабочий стол',
    path: '/dashboard',
    api: ['/api/workbench/today', '/api/analytics/summary'],
    entities: ['leads', 'deals', 'tasks', 'payments', 'implementationProjects', 'supportTickets', 'debts'],
  },
  {
    id: 'leads',
    label: 'Заявки',
    path: '/leads',
    api: ['/api/leads', '/api/leads/:id/diagnostics'],
    entities: ['leads', 'diagnostics', 'tasks', 'communications', 'notes'],
  },
  {
    id: 'diagnostics',
    label: 'Диагностика',
    path: '/diagnostics',
    api: ['/api/leads/:id/diagnostics', '/api/diagnostics'],
    entities: ['leads', 'diagnostics', 'deals', 'materials'],
  },
  {
    id: 'deals',
    label: 'Сделки',
    path: '/deals',
    api: ['/api/deals', '/api/deals/:id/stage', '/api/deals/:id/amount', '/api/deals/:id/proposals', '/api/deals/:id/payments'],
    entities: ['leads', 'deals', 'proposals', 'payments', 'clients', 'implementationProjects', 'auditLogs'],
  },
  {
    id: 'tasks',
    label: 'Задачи',
    path: '/tasks',
    api: ['/api/tasks', '/api/tasks/:id/complete', '/api/tasks/:id/reschedule'],
    entities: ['tasks', 'users', 'leads', 'deals', 'clients', 'implementationProjects', 'supportTickets'],
  },
  {
    id: 'clients',
    label: 'Клиенты',
    path: '/clients',
    api: ['/api/clients'],
    entities: ['clients', 'deals', 'payments', 'implementationProjects', 'supportTickets', 'subscriptions', 'debts'],
  },
  {
    id: 'implementation',
    label: 'Внедрение',
    path: '/implementation',
    api: ['/api/implementation-projects', '/api/implementation-projects/:id/data-collection', '/api/implementation-projects/:id/checklist/:itemIndex'],
    entities: ['implementationProjects', 'clients', 'tasks', 'dataCollectionRequests', 'supportTickets'],
  },
  {
    id: 'developer',
    label: 'Работа программиста',
    path: '/developer',
    api: ['/api/developer/workbench'],
    entities: ['tasks', 'implementationProjects', 'clients', 'supportTickets'],
  },
  {
    id: 'support',
    label: 'Поддержка',
    path: '/support',
    api: ['/api/support-tickets'],
    entities: ['supportTickets', 'clients', 'implementationProjects', 'tasks', 'notes'],
  },
  {
    id: 'finance',
    label: 'Финансы',
    path: '/finance',
    api: ['/api/payments', '/api/subscriptions', '/api/debts', '/api/clients/:clientId/subscriptions', '/api/clients/:clientId/debts'],
    entities: ['payments', 'subscriptions', 'debts', 'clients', 'deals'],
  },
  {
    id: 'analytics',
    label: 'Аналитика',
    path: '/analytics',
    api: ['/api/analytics/summary'],
    entities: ['leads', 'deals', 'tasks', 'payments', 'subscriptions', 'debts', 'implementationProjects', 'supportTickets'],
  },
  {
    id: 'materials',
    label: 'Материалы',
    path: '/materials',
    api: ['/api/materials'],
    entities: ['materials', 'leads', 'diagnostics', 'implementationProjects'],
  },
  {
    id: 'team',
    label: 'Команда',
    path: '/team',
    api: ['/api/users', '/api/tasks'],
    entities: ['users', 'tasks', 'implementationProjects', 'supportTickets'],
  },
  {
    id: 'audit',
    label: 'Журнал действий',
    path: '/audit',
    api: ['/api/audit-logs'],
    entities: ['auditLogs'],
  },
  {
    id: 'settings',
    label: 'Настройки',
    path: '/settings',
    api: ['/api/meta'],
    entities: ['roles', 'permissions', 'packages', 'statuses', 'niches'],
  },
]);

const ROLE_MENU_IDS = Object.freeze({
  [ROLES.MANAGER]: ['dashboard', 'leads', 'diagnostics', 'deals', 'tasks', 'clients', 'materials'],
  [ROLES.SUPERVISOR]: [
    'dashboard',
    'leads',
    'deals',
    'clients',
    'tasks',
    'implementation',
    'support',
    'finance',
    'analytics',
    'team',
    'audit',
    'settings',
  ],
  [ROLES.DEVELOPER]: ['tasks', 'developer', 'implementation', 'support', 'clients', 'materials'],
  [ROLES.OWNER]: MENU_ITEMS.map((item) => item.id),
  [ROLES.SALES_LEAD]: ['dashboard', 'leads', 'diagnostics', 'deals', 'tasks', 'clients', 'analytics', 'materials'],
  [ROLES.IMPLEMENTATION]: ['tasks', 'implementation', 'support', 'clients', 'materials'],
  [ROLES.SUPPORT]: ['tasks', 'support', 'clients', 'materials'],
});

function navigationForRole(role) {
  const allowedIds = new Set(ROLE_MENU_IDS[role] || []);
  return MENU_ITEMS.filter((item) => allowedIds.has(item.id));
}

module.exports = { MENU_ITEMS, ROLE_MENU_IDS, navigationForRole };
