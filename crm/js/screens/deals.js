import { get } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let dealsMeta = null;

function humanize(value) {
  return labelValue(value);
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Number(value || 0))} ₸`;
}

function formatDate(value) {
  if (!value) return 'Нет шага';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function isActiveDeal(deal) {
  return !['won', 'lost'].includes(deal.stage);
}

function isOverdueStep(deal) {
  return isActiveDeal(deal) && deal.nextActionAt && new Date(deal.nextActionAt) < new Date();
}

function needsNextStep(deal) {
  return isActiveDeal(deal) && !deal.nextActionAt;
}

function riskDeals(deals) {
  return deals
    .filter((deal) => isOverdueStep(deal) || needsNextStep(deal))
    .sort((a, b) => {
      const aScore = isOverdueStep(a) ? 0 : 1;
      const bScore = isOverdueStep(b) ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return Number(b.amount || 0) - Number(a.amount || 0);
    })
    .slice(0, 8);
}

function renderOptions(items, selected = '', placeholder = 'Все') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(items || []).map((item) => `
      <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
    `).join('')}
  `;
}

function directionLabel(value) {
  return {
    autotech: 'AutoTech',
    edutech: 'EduTech',
  }[value] || humanize(value);
}

function dealTitle(deal) {
  return humanize(deal.niche || 'Сделка');
}

function dealRow(deal) {
  return `
    <tr class="${isOverdueStep(deal) ? 'row-danger' : needsNextStep(deal) ? 'row-warning' : ''}">
      <td>
        <strong>${escapeHtml(dealTitle(deal))}</strong>
        <small>${escapeHtml(directionLabel(deal.direction))} · ${escapeHtml(humanize(deal.packageId || 'пакет не указан'))}</small>
      </td>
      <td><span class="status-badge" data-status="${escapeHtml(deal.stage)}">${escapeHtml(humanize(deal.stage))}</span></td>
      <td>
        <strong>${escapeHtml(formatMoney(deal.amount))}</strong>
        <small>Вероятность ${escapeHtml(deal.probability || 0)}%</small>
      </td>
      <td>
        <span>${escapeHtml(formatDate(deal.nextActionAt))}</span>
      </td>
      <td>
        <span>${escapeHtml((deal.selectedSections || []).map(humanize).join(', ') || 'не выбраны')}</span>
      </td>
      <td>
        <button class="secondary-button compact-button" type="button" data-open-deal="${escapeHtml(deal.id)}">Открыть</button>
      </td>
    </tr>
  `;
}

function renderDealCard(deal) {
  return `
    <button class="deal-card ${isOverdueStep(deal) ? 'danger' : needsNextStep(deal) ? 'warning' : ''}" type="button" data-open-deal="${escapeHtml(deal.id)}">
      <span>
        <strong>${escapeHtml(dealTitle(deal))}</strong>
        <small>${escapeHtml(directionLabel(deal.direction))} · ${escapeHtml(humanize(deal.packageId || 'пакет не указан'))}</small>
      </span>
      <b>${escapeHtml(formatMoney(deal.amount))}</b>
      <small>${escapeHtml(isOverdueStep(deal) ? `Просрочено: ${formatDate(deal.nextActionAt)}` : needsNextStep(deal) ? 'Нет следующего шага' : `Следующий шаг: ${formatDate(deal.nextActionAt)}`)}</small>
    </button>
  `;
}

function renderRiskQueue(deals) {
  const items = riskDeals(deals);
  return `
    <section class="dashboard-panel deal-risk-panel">
      <div class="dashboard-panel-head">
        <div>
          <h2>Что может потеряться</h2>
          <p>Сделки без следующего действия или с просроченным шагом. Их надо открывать первыми.</p>
        </div>
        <span>${items.length}</span>
      </div>
      <div class="work-list">
        ${items.length ? items.map((deal) => `
          <button class="work-item" type="button" data-open-deal="${escapeHtml(deal.id)}">
            <span>
              <strong>${escapeHtml(dealTitle(deal))}</strong>
              <small>${escapeHtml(humanize(deal.stage))} · ${escapeHtml(isOverdueStep(deal) ? `просрочено ${formatDate(deal.nextActionAt)}` : 'нет следующего шага')}</small>
            </span>
            <b>${escapeHtml(formatMoney(deal.amount))}</b>
          </button>
        `).join('') : emptyState('Потерь нет', 'У активных сделок есть следующий шаг и нет просрочки.')}
      </div>
    </section>
  `;
}

function renderPipeline(deals) {
  const activeDeals = deals.filter(isActiveDeal);
  const stages = Object.values(dealsMeta?.dealStages || {}).filter((stage) => !['won', 'lost'].includes(stage));
  const fallbackStages = [...new Set(activeDeals.map((deal) => deal.stage))];
  const columns = (stages.length ? stages : fallbackStages).map((stage) => {
    const stageDeals = activeDeals.filter((deal) => deal.stage === stage);
    const amount = stageDeals.reduce((sum, deal) => sum + Number(deal.amount || 0), 0);
    return `
      <section class="pipeline-column">
        <div class="pipeline-column-head">
          <strong>${escapeHtml(humanize(stage))}</strong>
          <span>${stageDeals.length} · ${escapeHtml(formatMoney(amount))}</span>
        </div>
        <div class="pipeline-column-list">
          ${stageDeals.length ? stageDeals.slice(0, 8).map(renderDealCard).join('') : '<p class="muted pipeline-empty">Пусто</p>'}
          ${stageDeals.length > 8 ? `<p class="muted pipeline-more">Еще ${stageDeals.length - 8}</p>` : ''}
        </div>
      </section>
    `;
  }).join('');

  return `
    <section class="pipeline-board" aria-label="Воронка сделок">
      ${columns || emptyState('Активных сделок нет', 'После диагностики новые сделки появятся в воронке.')}
    </section>
  `;
}

function renderStageSummary(deals) {
  const activeDeals = deals.filter((deal) => !['won', 'lost'].includes(deal.stage));
  const pipelineAmount = activeDeals.reduce((sum, deal) => sum + Number(deal.amount || 0), 0);
  const stageCounts = activeDeals.reduce((acc, deal) => {
    acc[deal.stage] = (acc[deal.stage] || 0) + 1;
    return acc;
  }, {});

  return `
    <div class="dashboard-counters deal-counters">
      <article class="dashboard-counter">
        <span>Активная воронка</span>
        <strong>${escapeHtml(formatMoney(pipelineAmount))}</strong>
      </article>
      <article class="dashboard-counter">
        <span>Активных сделок</span>
        <strong>${activeDeals.length}</strong>
      </article>
      <article class="dashboard-counter ${deals.filter(isOverdueStep).length ? 'danger' : ''}">
        <span>Просрочен шаг</span>
        <strong>${deals.filter(isOverdueStep).length}</strong>
      </article>
      <article class="dashboard-counter ${deals.filter(needsNextStep).length ? 'warning' : ''}">
        <span>Нет шага</span>
        <strong>${deals.filter(needsNextStep).length}</strong>
      </article>
      <article class="dashboard-counter">
        <span>Предоплата</span>
        <strong>${stageCounts.prepayment || 0}</strong>
      </article>
    </div>
  `;
}

function renderDealsTable(deals, meta) {
  if (!deals.length) {
    return emptyState('Сделок пока нет', 'Сделка создаётся после диагностики лида. На этом экране нет отдельной кнопки создания.');
  }

  return `
    ${renderStageSummary(deals)}
    <div class="deal-operations-grid">
      ${renderRiskQueue(deals)}
    </div>
    ${renderPipeline(deals)}
    <div class="table-panel">
      <table class="data-table deals-table">
        <thead>
          <tr>
            <th>Сделка</th>
            <th>Этап</th>
            <th>Сумма</th>
            <th>Следующий шаг</th>
            <th>Разделы</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          ${deals.map(dealRow).join('')}
        </tbody>
      </table>
      <div class="table-footer">
        <span>Показано ${deals.length} из ${meta.total}</span>
        <span>Страница ${meta.page} / ${meta.pages}</span>
      </div>
    </div>
  `;
}

export function renderDealsScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Сделки',
      subtitle: 'Воронка после диагностики. Новые сделки создаются только из диагностики лида, чтобы не было дублей.',
    })}
    <form class="filter-bar deal-filter-bar" data-deals-filters>
      <div class="field">
        <label for="dealSearch">Поиск</label>
        <input id="dealSearch" name="q" placeholder="Ниша, пакет, этап" />
      </div>
      <div class="field">
        <label for="dealFilterStage">Этап</label>
        <select id="dealFilterStage" name="stage" data-filter-stage></select>
      </div>
      <div class="field">
        <label for="dealFilterDirection">Профиль</label>
        <select id="dealFilterDirection" name="direction" data-filter-direction>
          <option value="">Все</option>
          <option value="autotech">AutoTech</option>
          <option value="edutech">EduTech</option>
        </select>
      </div>
      <div class="field">
        <label for="dealAmountFrom">Сумма от</label>
        <input id="dealAmountFrom" name="amountFrom" type="number" min="0" step="10000" />
      </div>
      <div class="field">
        <label for="dealFilterProblem">Контроль</label>
        <select id="dealFilterProblem" name="problem" data-filter-problem>
          <option value="">Все сделки</option>
          <option value="overdue">Просрочен шаг</option>
          <option value="no_next_action">Нет следующего шага</option>
          <option value="active">Только активные</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="secondary-button" type="submit">Показать</button>
        <button class="secondary-button" type="button" data-reset-deal-filters>Сбросить</button>
      </div>
    </form>
    <div data-deals-root>
      ${emptyState('Загружаем сделки', 'Получаем воронку продаж.')}
    </div>
  `;
}

export async function mountDealsScreen() {
  const root = document.querySelector('[data-deals-root]');
  const filters = document.querySelector('[data-deals-filters]');
  if (!root || !filters) return;

  const stageSelect = filters.querySelector('[data-filter-stage]');

  const loadDeals = async () => {
    root.innerHTML = emptyState('Загружаем сделки', 'Обновляем список по выбранным фильтрам.');
    const data = new FormData(filters);
    const params = new URLSearchParams();
    ['q', 'stage', 'direction', 'amountFrom'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    params.set('sort', '-updatedAt,-createdAt');
    params.set('limit', '200');

    const result = await get(`/api/deals?${params.toString()}`);
    const problem = String(data.get('problem') || '');
    const filteredDeals = result.data.filter((deal) => {
      if (problem === 'overdue') return isOverdueStep(deal);
      if (problem === 'no_next_action') return needsNextStep(deal);
      if (problem === 'active') return isActiveDeal(deal);
      return true;
    });
    root.innerHTML = renderDealsTable(filteredDeals, { ...result.meta, total: filteredDeals.length });
    root.querySelectorAll('[data-open-deal]').forEach((button) => {
      button.addEventListener('click', () => {
        navigate(`deal-detail/${button.dataset.openDeal}`);
      });
    });
  };

  try {
    const metaResult = await get('/api/meta');
    dealsMeta = metaResult.meta;
    stageSelect.innerHTML = renderOptions(Object.values(dealsMeta.dealStages || {}));
    await loadDeals();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить сделки', error.message || 'Проверьте подключение и сессию.');
    toast(error.message || 'Ошибка загрузки сделок', 'error');
  }

  filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadDeals().catch((error) => toast(error.message || 'Ошибка фильтрации сделок', 'error'));
  });

  filters.querySelector('[data-reset-deal-filters]').addEventListener('click', async () => {
    filters.reset();
    await loadDeals().catch((error) => toast(error.message || 'Ошибка загрузки сделок', 'error'));
  });
}
