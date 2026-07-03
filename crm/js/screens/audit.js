import { get } from '../api.js';
import { labelValue } from '../labels.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let activeAudit = null;

function humanize(value) {
  return labelValue(value);
}

function formatDate(value) {
  if (!value) return 'Нет даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function jsonPreview(value) {
  return JSON.stringify(value || {}, null, 2);
}

function renderOptions(items, selected = '', placeholder = 'Все') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(items || []).map((item) => `
      <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
    `).join('')}
  `;
}

function auditRow(item) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(humanize(item.action))}</strong>
        <small>${escapeHtml(item.id)}</small>
      </td>
      <td>
        <span class="status-badge">${escapeHtml(humanize(item.entityType))}</span>
        <small>${escapeHtml(item.entityId)}</small>
      </td>
      <td>${escapeHtml(item.actorId || 'Система')}</td>
      <td>${escapeHtml(formatDate(item.createdAt))}</td>
      <td>
        <button class="secondary-button compact-button" type="button" data-open-audit="${escapeHtml(item.id)}">Детали</button>
      </td>
    </tr>
  `;
}

function renderAuditTable(items, meta) {
  if (!items.length) return emptyState('Журнал пуст', 'Критические действия появятся после изменений в CRM.');
  return `
    <div class="table-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Действие</th>
            <th>Сущность</th>
            <th>Кто</th>
            <th>Когда</th>
            <th>Детали</th>
          </tr>
        </thead>
        <tbody>${items.map(auditRow).join('')}</tbody>
      </table>
      <div class="table-footer">
        <span>Показано ${items.length} из ${meta.total}</span>
        <span>Страница ${meta.page} / ${meta.pages}</span>
      </div>
    </div>
  `;
}

function modalMarkup() {
  return `
    <div class="modal-backdrop" data-audit-modal>
      <div class="modal-panel wide-modal">
        <div class="modal-header"><h2>Детали действия</h2></div>
        <div class="modal-body">
          <div data-audit-modal-body>${emptyState('Нет действия', 'Выберите запись журнала.')}</div>
        </div>
        <div class="modal-footer">
          <button class="secondary-button" type="button" data-close-audit-modal>Закрыть</button>
        </div>
      </div>
    </div>
  `;
}

function renderAuditDetails(item) {
  if (!item) return emptyState('Запись не найдена', 'Обновите журнал и попробуйте снова.');
  return `
    <div class="audit-detail-grid">
      <div class="info-item"><span>Действие</span><strong>${escapeHtml(humanize(item.action))}</strong></div>
      <div class="info-item"><span>Сущность</span><strong>${escapeHtml(humanize(item.entityType))}</strong></div>
      <div class="info-item"><span>ID сущности</span><strong>${escapeHtml(item.entityId)}</strong></div>
      <div class="info-item"><span>Автор</span><strong>${escapeHtml(item.actorId || 'Система')}</strong></div>
      <div class="info-item"><span>Дата</span><strong>${escapeHtml(formatDate(item.createdAt))}</strong></div>
    </div>
    <pre class="audit-json">${escapeHtml(jsonPreview(item.details))}</pre>
  `;
}

export function renderAuditScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Журнал действий',
      subtitle: 'Критические изменения в CRM: сделки, платежи, внедрение, задачи, поддержка, команда и настройки.',
    })}
    <form class="filter-bar" data-audit-filters>
      <div class="field">
        <label for="auditSearch">Поиск</label>
        <input id="auditSearch" name="q" placeholder="Действие, сущность, ID" />
      </div>
      <div class="field">
        <label for="auditAction">Действие</label>
        <select id="auditAction" name="action" data-audit-actions></select>
      </div>
      <div class="field">
        <label for="auditEntity">Сущность</label>
        <select id="auditEntity" name="entityType" data-audit-entities></select>
      </div>
      <div class="field">
        <label for="auditCreatedFrom">Дата от</label>
        <input id="auditCreatedFrom" name="createdAtFrom" type="date" />
      </div>
      <div class="filter-actions">
        <button class="secondary-button" type="submit">Показать</button>
        <button class="secondary-button" type="button" data-reset-audit-filters>Сбросить</button>
      </div>
    </form>
    <div data-audit-root>${emptyState('Загружаем журнал', 'Получаем журнал действий.')}</div>
    ${modalMarkup()}
  `;
}

export async function mountAuditScreen() {
  const root = document.querySelector('[data-audit-root]');
  const filters = document.querySelector('[data-audit-filters]');
  if (!root || !filters) return;

  const loadAudit = async () => {
    root.innerHTML = emptyState('Загружаем журнал', 'Обновляем записи по фильтрам.');
    const data = new FormData(filters);
    const params = new URLSearchParams();
    ['q', 'action', 'entityType', 'createdAtFrom'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    params.set('sort', '-createdAt');
    params.set('limit', '50');
    const result = await get(`/api/audit-logs?${params.toString()}`);
    root.innerHTML = renderAuditTable(result.data, result.meta);
    bindAuditRows(root, result.data);
  };

  try {
    const initial = await get('/api/audit-logs?limit=200&sort=-createdAt');
    const actions = [...new Set((initial.data || []).map((item) => item.action).filter(Boolean))].sort();
    const entities = [...new Set((initial.data || []).map((item) => item.entityType).filter(Boolean))].sort();
    filters.querySelector('[data-audit-actions]').innerHTML = renderOptions(actions);
    filters.querySelector('[data-audit-entities]').innerHTML = renderOptions(entities);
    await loadAudit();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить журнал', error.message || 'Проверьте подключение и права доступа.');
    toast(error.message || 'Ошибка загрузки журнала', 'error');
  }

  filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadAudit().catch((error) => toast(error.message || 'Ошибка фильтрации журнала', 'error'));
  });

  filters.querySelector('[data-reset-audit-filters]').addEventListener('click', async () => {
    filters.reset();
    await loadAudit().catch((error) => toast(error.message || 'Ошибка загрузки журнала', 'error'));
  });

  document.querySelector('[data-close-audit-modal]')?.addEventListener('click', closeModal);
  document.querySelector('[data-audit-modal]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
}

function bindAuditRows(root, items) {
  root.querySelectorAll('[data-open-audit]').forEach((button) => {
    button.addEventListener('click', () => {
      activeAudit = items.find((item) => item.id === button.dataset.openAudit);
      document.querySelector('[data-audit-modal-body]').innerHTML = renderAuditDetails(activeAudit);
      document.querySelector('[data-audit-modal]')?.classList.add('open');
    });
  });
}

function closeModal() {
  document.querySelector('[data-audit-modal]')?.classList.remove('open');
  activeAudit = null;
}
