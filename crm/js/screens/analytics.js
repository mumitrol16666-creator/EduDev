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

function renderCounterGroup(title, subtitle, counters) {
  return `
    <section class="analytics-section">
      <div class="analytics-section-head">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="dashboard-counters analytics-counters">
        ${counters.map((item) => renderCounter(item.label, item.value, item.tone || '')).join('')}
      </div>
    </section>
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
    ${renderCounterGroup('Продажи', 'От входящего потока до денег в воронке.', [
      { label: 'Лиды', value: analytics.leads.total },
      { label: 'Сделки', value: analytics.deals.total },
      { label: 'Воронка', value: formatMoney(analytics.deals.pipelineAmount) },
      { label: 'Задач открыто', value: analytics.tasks.open },
      { label: 'Просрочено задач', value: analytics.tasks.overdue, tone: analytics.tasks.overdue ? 'danger' : '' },
    ])}

    ${renderCounterGroup('Финансы', 'Оплаты, регулярные платежи и долги отдельно от продаж.', [
      { label: 'Платежей', value: analytics.payments.total },
      { label: 'Оплачено', value: formatMoney(analytics.payments.paidAmount), tone: 'success' },
      { label: 'Активные подписки', value: analytics.subscriptions.active },
      { label: 'Ежемесячно', value: formatMoney(analytics.subscriptions.monthlyRecurringAmount) },
      { label: 'Открытые долги', value: formatMoney(analytics.debts.openAmount), tone: analytics.debts.open ? 'danger' : '' },
    ])}

    ${renderCounterGroup('Операции', 'Что происходит после продажи: внедрение и поддержка.', [
      { label: 'Активные внедрения', value: analytics.implementation.active },
      { label: 'Обращения поддержки', value: analytics.support.open, tone: analytics.support.open ? 'warning' : '' },
      { label: 'Всего подписок', value: analytics.subscriptions.total },
      { label: 'Открытых долгов', value: analytics.debts.open, tone: analytics.debts.open ? 'danger' : '' },
    ])}

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
