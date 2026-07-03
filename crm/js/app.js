import { hydrateSession, logout } from './auth.js';
import { labelValue } from './labels.js';
import { getState, setToken } from './state.js';
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
          <span class="brand-mark">E</span>
          <div>
            <strong>EduDev CRM</strong>
            <span>операционная система</span>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${nav.map((item) => `
            <button class="sidebar-link ${item.id === activeRoute ? 'active' : ''}" type="button" data-nav-id="${escapeHtml(item.id)}">
              ${escapeHtml(menuLabel(item))}
            </button>
          `).join('')}
        </nav>
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
            <button class="notification-button" type="button" aria-label="Уведомления">
              !
              ${state.notifications.unreadCount ? `<span class="notification-count">${state.notifications.unreadCount}</span>` : ''}
            </button>
          </div>
        </header>
        <section class="screen-host" data-screen-host></section>
      </main>
    </div>
  `;

  app.querySelectorAll('[data-nav-id]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.navId));
  });

  app.querySelector('[data-logout]').addEventListener('click', async () => {
    await logout();
    window.location.hash = '';
    renderLogin(app, renderShellAfterLogin);
  });

  renderCurrentRoute();
}

function renderCurrentRoute() {
  const host = app.querySelector('[data-screen-host]');
  if (!host) return;
  renderRoute(host);
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

window.addEventListener('hashchange', renderCurrentRoute);

boot();
