import { get } from '../api.js';
import { labelValue } from '../labels.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

function humanize(value) {
  return labelValue(value);
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

function totalFromMap(map = {}) {
  return Object.values(map).reduce((sum, value) => sum + Number(value || 0), 0);
}

function renderDistribution(title, subtitle, map = {}) {
  const entries = Object.entries(map);
  const total = totalFromMap(map);
  return `
    <section class="dashboard-panel analytics-card">
      <div class="dashboard-panel-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <span>${total}</span>
      </div>
      <div class="metric-list">
        ${entries.length ? entries.map(([key, value]) => {
          const percent = total ? Math.round((Number(value) / total) * 100) : 0;
          return `
            <div class="metric-row">
              <div class="metric-row-head">
                <strong>${escapeHtml(humanize(key))}</strong>
                <span>${escapeHtml(`${value} · ${percent}%`)}</span>
              </div>
              <div class="metric-bar"><span style="width: ${escapeHtml(percent)}%"></span></div>
            </div>
          `;
        }).join('') : emptyState('Данных нет', 'Пока нечего распределять по этой группе.')}
      </div>
    </section>
  `;
}

function renderAnalytics(analytics) {
  return `
    <div class="dashboard-counters analytics-counters">
      ${renderCounter('Лиды', analytics.leads.total)}
      ${renderCounter('Сделки', analytics.deals.total)}
      ${renderCounter('Воронка', formatMoney(analytics.deals.pipelineAmount))}
      ${renderCounter('Оплачено', formatMoney(analytics.payments.paidAmount), 'success')}
      ${renderCounter('Ежемесячно', formatMoney(analytics.subscriptions.monthlyRecurringAmount))}
      ${renderCounter('Открытые долги', formatMoney(analytics.debts.openAmount), analytics.debts.open ? 'danger' : '')}
      ${renderCounter('Внедрения', analytics.implementation.active)}
      ${renderCounter('Поддержка', analytics.support.open, analytics.support.open ? 'warning' : '')}
    </div>

    <div class="analytics-focus-grid">
      <section class="panel analytics-focus-card">
        <span>Задачи</span>
        <strong>${escapeHtml(analytics.tasks.open)}</strong>
        <p class="${analytics.tasks.overdue ? 'danger-text' : ''}">Просрочено: ${escapeHtml(analytics.tasks.overdue)}</p>
      </section>
      <section class="panel analytics-focus-card">
        <span>Подписки</span>
        <strong>${escapeHtml(analytics.subscriptions.active)}</strong>
        <p>Всего подписок: ${escapeHtml(analytics.subscriptions.total)}</p>
      </section>
      <section class="panel analytics-focus-card">
        <span>Платежи</span>
        <strong>${escapeHtml(analytics.payments.total)}</strong>
        <p>Сумма оплат: ${escapeHtml(formatMoney(analytics.payments.paidAmount))}</p>
      </section>
      <section class="panel analytics-focus-card">
        <span>Долги</span>
        <strong>${escapeHtml(analytics.debts.open)}</strong>
        <p class="${analytics.debts.open ? 'danger-text' : ''}">${escapeHtml(formatMoney(analytics.debts.openAmount))}</p>
      </section>
    </div>

    <div class="dashboard-grid">
      ${renderDistribution('Лиды по статусам', 'Где сейчас находится входящий поток.', analytics.leads.byStatus)}
      ${renderDistribution('Лиды по нишам', 'Какие направления дают больше заявок.', analytics.leads.byNiche)}
      ${renderDistribution('Сделки по этапам', 'Состояние активной и закрытой воронки.', analytics.deals.byStage)}
      ${renderDistribution('Внедрение по статусам', 'Что происходит после оплаты.', analytics.implementation.byStatus)}
      ${renderDistribution('Поддержка по типам', 'Вопросы, баги, консультации и доработки.', analytics.support.byType)}
    </div>
  `;
}

export function renderAnalyticsScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Аналитика',
      subtitle: 'Операционная сводка для руководителя. Экран только читает данные и не меняет CRM.',
    })}
    <div data-analytics-root>${emptyState('Загружаем аналитику', 'Получаем сводку по работе.')}</div>
  `;
}

export async function mountAnalyticsScreen() {
  const root = document.querySelector('[data-analytics-root]');
  if (!root) return;

  try {
    const result = await get('/api/analytics/summary');
    root.innerHTML = renderAnalytics(result.analytics);
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить аналитику', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки аналитики', 'error');
  }
}
