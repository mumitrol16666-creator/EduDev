import { get } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let implementationMeta = null;

function humanize(value) {
  return labelValue(value);
}

function formatDate(value) {
  if (!value) return 'Нет даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
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

function progress(project) {
  const checklist = project.checklist || [];
  if (!checklist.length) return { done: 0, total: 0, percent: 0 };
  const done = checklist.filter((item) => item.done).length;
  return { done, total: checklist.length, percent: Math.round((done / checklist.length) * 100) };
}

function projectRow(project, client) {
  const itemProgress = progress(project);
  return `
    <tr>
      <td>
        <strong>${escapeHtml(client?.name || 'Клиент не найден')}</strong>
        <small>${escapeHtml(client?.city || 'город не указан')} · ${escapeHtml(directionLabel(client?.direction))}</small>
      </td>
      <td>
        <strong>${escapeHtml(humanize(project.niche))}</strong>
        <small>${escapeHtml(humanize(project.packageId))}</small>
      </td>
      <td><span class="status-badge">${escapeHtml(humanize(project.status))}</span></td>
      <td>
        <strong>${itemProgress.percent}%</strong>
        <small>${itemProgress.done}/${itemProgress.total} пунктов</small>
      </td>
      <td>${escapeHtml(formatDate(project.supportFreeUntil))}</td>
      <td>
        <button class="secondary-button compact-button" type="button" data-open-project="${escapeHtml(project.id)}">Открыть</button>
      </td>
    </tr>
  `;
}

function renderSummary(projects) {
  const active = projects.filter((project) => !['support', 'done', 'paused'].includes(project.status));
  const support = projects.filter((project) => project.status === 'support');
  const paused = projects.filter((project) => project.status === 'paused');
  const done = projects.filter((project) => project.status === 'done');
  return `
    <div class="dashboard-counters deal-counters">
      <article class="dashboard-counter"><span>Всего проектов</span><strong>${projects.length}</strong></article>
      <article class="dashboard-counter"><span>В работе</span><strong>${active.length}</strong></article>
      <article class="dashboard-counter success"><span>В поддержке</span><strong>${support.length}</strong></article>
      <article class="dashboard-counter ${paused.length ? 'warning' : ''}"><span>Пауза</span><strong>${paused.length}</strong></article>
      <article class="dashboard-counter"><span>Готово</span><strong>${done.length}</strong></article>
    </div>
  `;
}

function renderTable(projects, meta, clientsById) {
  if (!projects.length) {
    return emptyState('Проектов внедрения пока нет', 'Проект появится автоматически после записи оплаты в сделке.');
  }

  return `
    ${renderSummary(projects)}
    <div class="table-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Проект</th>
            <th>Статус</th>
            <th>Чек-лист</th>
            <th>Поддержка до</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>${projects.map((project) => projectRow(project, clientsById.get(project.clientId))).join('')}</tbody>
      </table>
      <div class="table-footer">
        <span>Показано ${projects.length} из ${meta.total}</span>
        <span>Страница ${meta.page} / ${meta.pages}</span>
      </div>
    </div>
  `;
}

export function renderImplementationScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Внедрение',
      subtitle: 'Проекты запуска создаются после оплаты. Здесь контролируем сбор данных, настройку, обучение и переход в поддержку.',
    })}
    <form class="filter-bar" data-implementation-filters>
      <div class="field">
        <label for="implementationSearch">Поиск</label>
        <input id="implementationSearch" name="q" placeholder="Клиент, ниша, статус" />
      </div>
      <div class="field">
        <label for="implementationStatus">Статус</label>
        <select id="implementationStatus" name="status" data-implementation-status></select>
      </div>
      <div class="field">
        <label for="implementationDirection">Профиль</label>
        <select id="implementationDirection" name="direction">
          <option value="">Все</option>
          <option value="autotech">AutoTech</option>
          <option value="edutech">EduTech</option>
        </select>
      </div>
      <div class="field">
        <label for="implementationNiche">Ниша</label>
        <select id="implementationNiche" name="niche" data-implementation-niche></select>
      </div>
      <div class="field">
        <label for="implementationResponsible">Ответственный ID</label>
        <input id="implementationResponsible" name="responsibleId" placeholder="если нужен точный фильтр" />
      </div>
      <div class="filter-actions">
        <button class="secondary-button" type="submit">Показать</button>
        <button class="secondary-button" type="button" data-reset-implementation-filters>Сбросить</button>
      </div>
    </form>
    <div data-implementation-root>${emptyState('Загружаем внедрения', 'Получаем проекты и клиентов.')}</div>
  `;
}

export async function mountImplementationScreen() {
  const root = document.querySelector('[data-implementation-root]');
  const filters = document.querySelector('[data-implementation-filters]');
  if (!root || !filters) return;

  const statusSelect = filters.querySelector('[data-implementation-status]');
  const nicheSelect = filters.querySelector('[data-implementation-niche]');

  const loadProjects = async () => {
    root.innerHTML = emptyState('Загружаем внедрения', 'Обновляем список по выбранным фильтрам.');
    const data = new FormData(filters);
    const params = new URLSearchParams();
    ['q', 'status', 'niche', 'responsibleId'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    params.set('sort', '-updatedAt,-createdAt');
    params.set('limit', '50');

    const [projectsResult, clientsResult] = await Promise.all([
      get(`/api/implementation-projects?${params.toString()}`),
      get('/api/clients?limit=200'),
    ]);
    const clientsById = new Map(clientsResult.data.map((client) => [client.id, client]));
    const direction = String(data.get('direction') || '').trim();
    const projects = direction
      ? projectsResult.data.filter((project) => clientsById.get(project.clientId)?.direction === direction)
      : projectsResult.data;

    root.innerHTML = renderTable(projects, projectsResult.meta, clientsById);
    root.querySelectorAll('[data-open-project]').forEach((button) => {
      button.addEventListener('click', () => navigate(`implementation-detail/${button.dataset.openProject}`));
    });
  };

  try {
    const metaResult = await get('/api/meta');
    implementationMeta = metaResult.meta;
    statusSelect.innerHTML = renderOptions(Object.values(implementationMeta.implementationStatuses || {}));
    nicheSelect.innerHTML = renderOptions([...(implementationMeta.autotechNiches || []), ...(implementationMeta.edutechNiches || [])]);
    await loadProjects();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить внедрение', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки внедрения', 'error');
  }

  filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadProjects().catch((error) => toast(error.message || 'Ошибка фильтрации внедрения', 'error'));
  });

  filters.querySelector('[data-reset-implementation-filters]').addEventListener('click', async () => {
    filters.reset();
    await loadProjects().catch((error) => toast(error.message || 'Ошибка загрузки внедрения', 'error'));
  });
}
