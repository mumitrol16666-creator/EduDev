import { get } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate } from '../router.js';
import { getState } from '../state.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

const analyticsRoles = new Set(['owner', 'supervisor', 'sales_lead']);
let selectedResponsibleId = 'all';

function formatDate(value) {
  if (!value) return 'Без срока';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Number(value || 0))} ₸`;
}

function renderCounter(label, value, tone = '') {
  return `
    <article class="dashboard-counter ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function taskRelation(task) {
  if (task.relatedType && task.relatedLabel) return `${task.relatedType}: ${task.relatedLabel}`;
  return 'Без связанной карточки';
}

function renderTaskItem(task, isOverdue = false) {
  return `
    <button class="work-item" type="button" data-route="tasks" data-entity-id="${escapeHtml(task.id)}">
      <span>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(labelValue(task.type || 'task'))} · ${escapeHtml(taskRelation(task))} · ${escapeHtml(formatDate(task.dueAt))}</small>
      </span>
      <b class="${isOverdue ? 'danger-text' : ''}">${escapeHtml(labelValue(task.priority || 'medium'))}</b>
    </button>
  `;
}

function renderLeadItem(lead) {
  return `
    <button class="work-item" type="button" data-route="lead-detail/${escapeHtml(lead.id)}">
      <span>
        <strong>${escapeHtml(lead.name)}</strong>
        <small>${escapeHtml(lead.city || 'город не указан')} · ${escapeHtml(labelValue(lead.niche || 'профиль не указан'))}</small>
      </span>
      <b>${escapeHtml(labelValue(lead.status || ''))}</b>
    </button>
  `;
}

function renderDealItem(deal) {
  return `
    <button class="work-item" type="button" data-route="deal-detail/${escapeHtml(deal.id)}">
      <span>
        <strong>${escapeHtml(labelValue(deal.niche || 'Сделка'))}</strong>
        <small>${escapeHtml(labelValue(deal.stage || ''))} · ${escapeHtml(labelValue(deal.packageId || ''))}</small>
      </span>
      <b>${escapeHtml(formatMoney(deal.amount))}</b>
    </button>
  `;
}

function renderWorkPanel(title, text, items, itemRenderer, emptyTitle, emptyText, tone = '') {
  return `
    <section class="dashboard-panel ${tone}">
      <div class="dashboard-panel-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(text)}</p>
        </div>
        <span>${items.length}</span>
      </div>
      <div class="work-list">
        ${items.length ? items.map(itemRenderer).join('') : emptyState(emptyTitle, emptyText)}
      </div>
    </section>
  `;
}

function renderAnalytics(analytics) {
  if (!analytics) return '';

  return `
    <section class="dashboard-panel dashboard-analytics">
      <div class="dashboard-panel-head">
        <div>
          <h2>Сводка компании</h2>
          <p>Финансы, внедрения и поддержка для управляющего.</p>
        </div>
      </div>
      <div class="analytics-grid">
        ${renderCounter('Лиды всего', analytics.leads.total)}
        ${renderCounter('Сумма в воронке', formatMoney(analytics.deals.pipelineAmount))}
        ${renderCounter('Оплачено', formatMoney(analytics.payments.paidAmount), 'success')}
        ${renderCounter('Ежемесячно', formatMoney(analytics.subscriptions.monthlyRecurringAmount))}
        ${renderCounter('Долги', formatMoney(analytics.debts.openAmount), analytics.debts.open ? 'danger' : '')}
        ${renderCounter('Активные внедрения', analytics.implementation.active)}
        ${renderCounter('Открытая поддержка', analytics.support.open)}
        ${renderCounter('Просроченные задачи', analytics.tasks.overdue, analytics.tasks.overdue ? 'danger' : '')}
      </div>
    </section>
  `;
}

export function renderDashboardScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Рабочий стол',
      subtitle: 'Операционный пульт: что горит сегодня, где нет следующего действия и что нужно открыть первым.',
    })}
    <div class="dashboard-loading" data-dashboard-root>
      ${emptyState('Загружаем рабочий стол', 'Получаем задачи, заявки, сделки и счетчики.')}
    </div>
  `;
}

export async function mountDashboardScreen() {
  const root = document.querySelector('[data-dashboard-root]');
  if (!root) return;

  try {
    const user = getState().user;
    const canSelectResponsible = analyticsRoles.has(user?.role);
    const [workbenchResult, analyticsResult, usersResult] = await Promise.all([
      get(`/api/workbench/today${selectedResponsibleId ? `?responsibleId=${encodeURIComponent(selectedResponsibleId)}` : ''}`),
      analyticsRoles.has(user?.role)
        ? get('/api/analytics/summary').catch(() => null)
        : Promise.resolve(null),
      canSelectResponsible
        ? get('/api/team/assignment-options').catch(() => ({ users: [] }))
        : Promise.resolve({ users: [] }),
    ]);

    const workbench = workbenchResult.workbench;
    const analytics = analyticsResult?.analytics || null;

    root.innerHTML = `
      ${canSelectResponsible ? `
        <div class="dashboard-toolbar">
          <label>
            <span>Рабочий стол сотрудника</span>
            <select data-dashboard-responsible>
              <option value="all" ${selectedResponsibleId === 'all' ? 'selected' : ''}>Команда целиком</option>
              ${(usersResult.users || []).filter((item) => ['manager', 'sales_lead'].includes(item.role)).map((item) => `
                <option value="${escapeHtml(item.id)}" ${item.id === selectedResponsibleId ? 'selected' : ''}>${escapeHtml(item.name)}</option>
              `).join('')}
            </select>
          </label>
        </div>
      ` : ''}
      <div class="dashboard-counters">
        ${renderCounter('Сегодня', workbench.counters.todayTasks)}
        ${renderCounter('Просрочено', workbench.counters.overdueTasks, workbench.counters.overdueTasks ? 'danger' : '')}
        ${renderCounter('Новые заявки', workbench.counters.newLeads)}
        ${renderCounter('Без следующего шага', workbench.counters.dealsWithoutNextAction, workbench.counters.dealsWithoutNextAction ? 'warning' : '')}
        ${renderCounter('Зависшие сделки', workbench.counters.stalledDeals, workbench.counters.stalledDeals ? 'danger' : '')}
      </div>
      <div class="dashboard-grid">
        ${renderWorkPanel(
          'Просроченные задачи',
          'Открыть первыми. Закрытие требует результата.',
          workbench.overdueTasks,
          (task) => renderTaskItem(task, true),
          'Просрочек нет',
          'На сейчас нет задач с прошедшим сроком.',
          'priority',
        )}
        ${renderWorkPanel(
          'Задачи на сегодня',
          'Текущая работа менеджера.',
          workbench.todayTasks,
          renderTaskItem,
          'На сегодня пусто',
          'Новые задачи появятся после заявок, диагностик и действий по сделкам.',
        )}
        ${renderWorkPanel(
          'Новые заявки',
          'Лиды, которые ждут первого действия.',
          workbench.newLeads,
          renderLeadItem,
          'Новых заявок нет',
          'Когда появится новая заявка, она будет здесь.',
        )}
        ${renderWorkPanel(
          'Сделки без следующего шага',
          'Нужно назначить действие или перевести этап.',
          workbench.dealsWithoutNextAction,
          renderDealItem,
          'Все сделки с планом',
          'У активных сделок есть следующий шаг.',
        )}
        ${renderWorkPanel(
          'Зависшие сделки',
          'Не обновлялись 7 дней и больше.',
          workbench.stalledDeals,
          renderDealItem,
          'Зависших сделок нет',
          'Сделки двигаются без длинной паузы.',
          'priority',
        )}
        ${renderAnalytics(analytics)}
      </div>
    `;

    root.querySelectorAll('[data-route]').forEach((button) => {
      button.addEventListener('click', () => navigate(button.dataset.route));
    });
    root.querySelector('[data-dashboard-responsible]')?.addEventListener('change', async (event) => {
      selectedResponsibleId = event.currentTarget.value;
      await mountDashboardScreen();
    });
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить рабочий стол', error.message || 'Проверьте подключение и сессию.');
    toast(error.message || 'Ошибка загрузки Dashboard', 'error');
  }
}
