import { get } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let clientsMeta = null;

function humanize(value) {
  return labelValue(value);
}

function directionLabel(value) {
  return {
    autotech: 'AutoTech',
    edutech: 'EduTech',
  }[value] || humanize(value);
}

function renderOptions(items, selected = '', placeholder = 'Все') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(items || []).map((item) => `
      <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
    `).join('')}
  `;
}

function clientRow(client) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(client.name)}</strong>
        <small>${escapeHtml(client.city || 'город не указан')} · ${escapeHtml(client.phone || 'телефон не указан')}</small>
      </td>
      <td>
        <span class="status-badge">${escapeHtml(directionLabel(client.direction))}</span>
        <small>${escapeHtml(humanize(client.niche))}</small>
      </td>
      <td><span class="status-badge">${escapeHtml(humanize(client.status))}</span></td>
      <td><span class="status-badge">${escapeHtml(humanize(client.subscriptionStatus))}</span></td>
      <td>
        <span>${escapeHtml((client.activeSections || []).map(humanize).join(', ') || 'не выбраны')}</span>
      </td>
      <td>
        <button class="secondary-button compact-button" type="button" data-open-client="${escapeHtml(client.id)}">Открыть</button>
      </td>
    </tr>
  `;
}

function renderClientSummary(clients) {
  const implementation = clients.filter((client) => client.status === 'implementation');
  const active = clients.filter((client) => client.subscriptionStatus === 'active');
  const trial = clients.filter((client) => client.subscriptionStatus === 'trial_support');
  const overdue = clients.filter((client) => client.subscriptionStatus === 'overdue');
  return `
    <div class="dashboard-counters deal-counters">
      <article class="dashboard-counter"><span>Клиентов</span><strong>${clients.length}</strong></article>
      <article class="dashboard-counter"><span>Во внедрении</span><strong>${implementation.length}</strong></article>
      <article class="dashboard-counter success"><span>Активные</span><strong>${active.length}</strong></article>
      <article class="dashboard-counter"><span>Бесплатная поддержка</span><strong>${trial.length}</strong></article>
      <article class="dashboard-counter ${overdue.length ? 'danger' : ''}"><span>Просрочено</span><strong>${overdue.length}</strong></article>
    </div>
  `;
}

function renderClientsTable(clients, meta) {
  if (!clients.length) {
    return emptyState('Клиентов пока нет', 'Клиент появится автоматически после записи оплаты в сделке.');
  }

  return `
    ${renderClientSummary(clients)}
    <div class="table-panel">
      <table class="data-table leads-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Профиль</th>
            <th>Статус</th>
            <th>Подписка</th>
            <th>Разделы</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>${clients.map(clientRow).join('')}</tbody>
      </table>
      <div class="table-footer">
        <span>Показано ${clients.length} из ${meta.total}</span>
        <span>Страница ${meta.page} / ${meta.pages}</span>
      </div>
    </div>
  `;
}

export function renderClientsScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Клиенты',
      subtitle: 'Клиенты появляются после оплаты сделки. Здесь нет ручного создания, чтобы не ломать цепочку продаж.',
    })}
    <form class="filter-bar" data-clients-filters>
      <div class="field">
        <label for="clientSearch">Поиск</label>
        <input id="clientSearch" name="q" placeholder="Название, город, телефон" />
      </div>
      <div class="field">
        <label for="clientDirection">Профиль</label>
        <select id="clientDirection" name="direction">
          <option value="">Все</option>
          <option value="autotech">Автобизнес</option>
          <option value="edutech">Обучение</option>
        </select>
      </div>
      <div class="field">
        <label for="clientStatus">Статус</label>
        <select id="clientStatus" name="status">
          <option value="">Все</option>
          <option value="implementation">Внедрение</option>
          <option value="active">Активные</option>
        </select>
      </div>
      <div class="field">
        <label for="clientSubscription">Подписка</label>
        <select id="clientSubscription" name="subscriptionStatus" data-subscription-status></select>
      </div>
      <div class="filter-actions">
        <button class="secondary-button" type="submit">Показать</button>
        <button class="secondary-button" type="button" data-reset-client-filters>Сбросить</button>
      </div>
    </form>
    <div data-clients-root>${emptyState('Загружаем клиентов', 'Получаем клиентскую базу.')}</div>
  `;
}

export async function mountClientsScreen() {
  const root = document.querySelector('[data-clients-root]');
  const filters = document.querySelector('[data-clients-filters]');
  if (!root || !filters) return;

  const subscriptionSelect = filters.querySelector('[data-subscription-status]');

  const loadClients = async () => {
    root.innerHTML = emptyState('Загружаем клиентов', 'Обновляем список по выбранным фильтрам.');
    const data = new FormData(filters);
    const params = new URLSearchParams();
    ['q', 'direction', 'status', 'subscriptionStatus'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    params.set('sort', '-updatedAt,-createdAt');
    params.set('limit', '25');
    const result = await get(`/api/clients?${params.toString()}`);
    root.innerHTML = renderClientsTable(result.data, result.meta);
    root.querySelectorAll('[data-open-client]').forEach((button) => {
      button.addEventListener('click', () => navigate(`client-detail/${button.dataset.openClient}`));
    });
  };

  try {
    const metaResult = await get('/api/meta');
    clientsMeta = metaResult.meta;
    subscriptionSelect.innerHTML = renderOptions(Object.values(clientsMeta.subscriptionStatuses || {}));
    await loadClients();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить клиентов', error.message || 'Проверьте подключение и сессию.');
    toast(error.message || 'Ошибка загрузки клиентов', 'error');
  }

  filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadClients().catch((error) => toast(error.message || 'Ошибка фильтрации клиентов', 'error'));
  });

  filters.querySelector('[data-reset-client-filters]').addEventListener('click', async () => {
    filters.reset();
    await loadClients().catch((error) => toast(error.message || 'Ошибка загрузки клиентов', 'error'));
  });
}
