import { hydrateSession, logout } from './auth.js';
import { patch } from './api.js';
import { labelValue } from './labels.js';
import { getState, setNotifications, setToken } from './state.js';
import { firstAllowedRoute, navigate, registerScreen, renderRoute, routeBase } from './router.js';
import { mountAuditScreen, renderAuditScreen } from './screens/audit.js';
import { mountAnalyticsScreen, renderAnalyticsScreen } from './screens/analytics.js';
import { mountClientDetailScreen, renderClientDetailScreen } from './screens/client-detail.js';
import { mountClientsScreen, renderClientsScreen } from './screens/clients.js';
import { mountDashboardScreen, renderDashboardScreen } from './screens/dashboard.js';
import { mountDealDetailScreen, renderDealDetailScreen } from './screens/deal-detail.js';
import { mountDeveloperWorkbenchScreen, renderDeveloperWorkbenchScreen } from './screens/developer-workbench.js';
import { mountDiagnosticsScreen, renderDiagnosticsScreen } from './screens/diagnostics.js';
import { mountDealsScreen, renderDealsScreen } from './screens/deals.js';
import { mountFinanceScreen, renderFinanceScreen } from './screens/finance.js';
import { mountImplementationDetailScreen, renderImplementationDetailScreen } from './screens/implementation-detail.js';
import { mountImplementationScreen, renderImplementationScreen } from './screens/implementation.js';
import { mountLeadDetailScreen, renderLeadDetailScreen } from './screens/lead-detail.js';
import { mountLeadsScreen, renderLeadsScreen } from './screens/leads.js';
import { renderLogin } from './screens/login.js';
import { mountMaterialsScreen, renderMaterialsScreen } from './screens/materials.js';
import { mountSettingsScreen, renderSettingsScreen } from './screens/settings.js';
import { mountSupportScreen, renderSupportScreen } from './screens/support.js';
import { mountTasksScreen, renderTasksScreen } from './screens/tasks.js';
import { mountTeamScreen, renderTeamScreen } from './screens/team.js';
import { escapeHtml, menuLabel, toast } from './ui.js';

const app = document.getElementById('app');

registerScreen('audit', renderAuditScreen);
registerScreen('analytics', renderAnalyticsScreen);
registerScreen('clients', renderClientsScreen);
registerScreen('client-detail', renderClientDetailScreen);
registerScreen('dashboard', renderDashboardScreen);
registerScreen('deal-detail', renderDealDetailScreen);
registerScreen('developer', renderDeveloperWorkbenchScreen);
registerScreen('deals', renderDealsScreen);
registerScreen('diagnostics', renderDiagnosticsScreen);
registerScreen('finance', renderFinanceScreen);
registerScreen('implementation', renderImplementationScreen);
registerScreen('implementation-detail', renderImplementationDetailScreen);
registerScreen('leads', renderLeadsScreen);
registerScreen('lead-detail', renderLeadDetailScreen);
registerScreen('materials', renderMaterialsScreen);
registerScreen('settings', renderSettingsScreen);
registerScreen('support', renderSupportScreen);
registerScreen('tasks', renderTasksScreen);
registerScreen('team', renderTeamScreen);

async function boot() {
  if (!getState().token) {
    renderLogin(app, renderShellAfterLogin);
    return;
  }

  try {
    await hydrateSession();
    renderShell();
  } catch (error) {
    setToken('');
    toast(error.message || 'Сессия недействительна', 'error');
    renderLogin(app, renderShellAfterLogin);
  }
}

async function renderShellAfterLogin() {
  renderShell();
  if (!window.location.hash) navigate(firstAllowedRoute());
}

function renderShell() {
  const state = getState();
  const nav = state.navigation;
  const activeRoute = window.location.hash.replace(/^#\/?/, '') || firstAllowedRoute();

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="./assets/edudev-logo.svg" alt="EduDev" />
        </div>
        <nav class="sidebar-nav">
          ${nav.map((item) => `
            <button class="sidebar-link ${item.id === activeRoute ? 'active' : ''}" type="button" data-nav-id="${escapeHtml(item.id)}">
              ${escapeHtml(menuLabel(item))}
            </button>
          `).join('')}
        </nav>
        <label class="mobile-nav">
          <span>Раздел CRM</span>
          <select data-mobile-nav>
            ${nav.map((item) => `
              <option value="${escapeHtml(item.id)}" ${item.id === routeBase(activeRoute) ? 'selected' : ''}>${escapeHtml(menuLabel(item))}</option>
            `).join('')}
          </select>
        </label>
        <div class="sidebar-footer">
          <div class="user-chip">
            <strong>${escapeHtml(state.user?.name || 'Пользователь')}</strong>
            <span>${escapeHtml(labelValue(state.user?.role || ''))}</span>
          </div>
          <button class="secondary-button" type="button" data-logout>Выйти</button>
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar">
          <div class="topbar-title">
            <strong data-topbar-title>CRM</strong>
            <span>Меню и доступы настроены по вашей роли</span>
          </div>
          <div class="topbar-actions">
            <button class="notification-button" type="button" aria-label="Уведомления" aria-expanded="false" data-notifications-toggle>
              <span aria-hidden="true">Уведомления</span>
              ${state.notifications.unreadCount ? `<span class="notification-count">${state.notifications.unreadCount}</span>` : ''}
            </button>
          </div>
        </header>
        <section class="screen-host" data-screen-host></section>
      </main>
      <div class="notification-backdrop" data-notifications-backdrop></div>
      <aside class="notification-drawer" aria-label="Уведомления" aria-hidden="true" data-notifications-drawer>
        <div class="notification-drawer-head">
          <div>
            <strong>Уведомления</strong>
            <span>${state.notifications.unreadCount ? `Новых: ${state.notifications.unreadCount}` : 'Всё прочитано'}</span>
          </div>
          <button class="secondary-button compact-button" type="button" data-notifications-close>Закрыть</button>
        </div>
        <div class="notification-list">
          ${renderNotifications(state.notifications.notifications)}
        </div>
        ${state.notifications.unreadCount ? '<button class="secondary-button notification-read-all" type="button" data-notifications-read-all>Прочитать все</button>' : ''}
      </aside>
    </div>
  `;

  app.querySelectorAll('[data-nav-id]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.navId));
  });
  app.querySelector('[data-mobile-nav]')?.addEventListener('change', (event) => navigate(event.currentTarget.value));

  app.querySelector('[data-logout]').addEventListener('click', async () => {
    await logout();
    window.location.hash = '';
    renderLogin(app, renderShellAfterLogin);
  });

  mountNotifications();

  const host = app.querySelector('[data-screen-host]');
  if (host) {
    const observer = new MutationObserver(() => enhanceMobileTables(host));
    observer.observe(host, { childList: true, subtree: true });
  }

  renderCurrentRoute();
}

function renderNotifications(notifications) {
  if (!notifications.length) {
    return '<div class="notification-empty"><strong>Пока тихо</strong><span>Новые назначения и важные события появятся здесь.</span></div>';
  }
  return notifications.map((item) => `
    <button class="notification-item ${item.status === 'unread' ? 'unread' : ''}" type="button"
      data-notification-id="${escapeHtml(item.id)}"
      data-entity-type="${escapeHtml(item.entityType || '')}"
      data-entity-id="${escapeHtml(item.entityId || '')}">
      <strong>${escapeHtml(item.title || 'Уведомление')}</strong>
      ${item.body ? `<span>${escapeHtml(item.body)}</span>` : ''}
      <small>${escapeHtml(formatNotificationDate(item.createdAt))}</small>
    </button>
  `).join('');
}

function formatNotificationDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function notificationRoute(entityType, entityId) {
  if (!entityId) return '';
  return {
    lead: `lead-detail/${entityId}`,
    deal: `deal-detail/${entityId}`,
    client: `client-detail/${entityId}`,
    implementation_project: `implementation-detail/${entityId}`,
    support_ticket: 'support',
    task: 'tasks',
  }[entityType] || '';
}

function mountNotifications() {
  const drawer = app.querySelector('[data-notifications-drawer]');
  const backdrop = app.querySelector('[data-notifications-backdrop]');
  const toggle = app.querySelector('[data-notifications-toggle]');
  const setOpen = (open) => {
    drawer?.classList.toggle('open', open);
    backdrop?.classList.toggle('open', open);
    drawer?.setAttribute('aria-hidden', String(!open));
    toggle?.setAttribute('aria-expanded', String(open));
  };

  toggle?.addEventListener('click', () => setOpen(!drawer?.classList.contains('open')));
  backdrop?.addEventListener('click', () => setOpen(false));
  app.querySelector('[data-notifications-close]')?.addEventListener('click', () => setOpen(false));

  app.querySelectorAll('[data-notification-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const state = getState();
      const item = state.notifications.notifications.find((notification) => notification.id === button.dataset.notificationId);
      if (item?.status === 'unread') {
        try {
          await patch(`/api/notifications/${item.id}/read`);
          item.status = 'read';
          setNotifications({
            notifications: state.notifications.notifications,
            unreadCount: Math.max(0, state.notifications.unreadCount - 1),
          });
        } catch (error) {
          toast(error.message || 'Не удалось прочитать уведомление', 'error');
        }
      }
      const route = notificationRoute(button.dataset.entityType, button.dataset.entityId);
      if (route) navigate(route);
      renderShell();
    });
  });

  app.querySelector('[data-notifications-read-all]')?.addEventListener('click', async () => {
    try {
      await patch('/api/notifications/read-all');
      const state = getState();
      setNotifications({
        notifications: state.notifications.notifications.map((item) => ({ ...item, status: 'read' })),
        unreadCount: 0,
      });
      renderShell();
    } catch (error) {
      toast(error.message || 'Не удалось прочитать уведомления', 'error');
    }
  });
}

function renderCurrentRoute() {
  const host = app.querySelector('[data-screen-host]');
  if (!host) return;
  renderRoute(host);
  enhanceMobileTables(host);
  if (getState().route === 'dashboard') {
    mountDashboardScreen();
  }
  if (getState().route === 'leads') {
    mountLeadsScreen();
  }
  if (getState().route.startsWith('lead-detail/')) {
    mountLeadDetailScreen();
  }
  if (getState().route === 'diagnostics' || getState().route.startsWith('diagnostics/')) {
    mountDiagnosticsScreen();
  }
  if (getState().route === 'deals') {
    mountDealsScreen();
  }
  if (getState().route.startsWith('deal-detail/')) {
    mountDealDetailScreen();
  }
  if (getState().route === 'developer') {
    mountDeveloperWorkbenchScreen();
  }
  if (getState().route === 'tasks') {
    mountTasksScreen();
  }
  if (getState().route === 'clients') {
    mountClientsScreen();
  }
  if (getState().route.startsWith('client-detail/')) {
    mountClientDetailScreen();
  }
  if (getState().route === 'implementation') {
    mountImplementationScreen();
  }
  if (getState().route.startsWith('implementation-detail/')) {
    mountImplementationDetailScreen();
  }
  if (getState().route === 'support') {
    mountSupportScreen();
  }
  if (getState().route === 'finance') {
    mountFinanceScreen();
  }
  if (getState().route === 'analytics') {
    mountAnalyticsScreen();
  }
  if (getState().route === 'materials') {
    mountMaterialsScreen();
  }
  if (getState().route === 'team') {
    mountTeamScreen();
  }
  if (getState().route === 'audit') {
    mountAuditScreen();
  }
  if (getState().route === 'settings') {
    mountSettingsScreen();
  }
  const route = getState().route || firstAllowedRoute();
  const base = routeBase(route);
  const screen = getState().navigation.find((item) => item.id === route || item.id === base || (base === 'lead-detail' && item.id === 'leads'));
  const title = app.querySelector('[data-topbar-title]');
  if (title) title.textContent = base === 'lead-detail' ? 'Заявка' : base === 'deal-detail' ? 'Сделка' : base === 'client-detail' ? 'Клиент' : base === 'implementation-detail' ? 'Внедрение' : (screen ? menuLabel(screen) : 'CRM');
}

function enhanceMobileTables(root) {
  root.querySelectorAll('.data-table').forEach((table) => {
    const headers = [...table.querySelectorAll('thead th')].map((header) => header.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (headers[index] && !cell.dataset.label) {
          cell.dataset.label = headers[index];
        }
      });
    });
  });
}

window.addEventListener('hashchange', renderCurrentRoute);

boot();
