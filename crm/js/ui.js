const labelMap = {
  dashboard: 'Рабочий стол',
  leads: 'Заявки',
  diagnostics: 'Диагностика',
  deals: 'Сделки',
  tasks: 'Задачи',
  clients: 'Клиенты',
  implementation: 'Внедрение',
  developer: 'Работа программиста',
  support: 'Поддержка',
  finance: 'Финансы',
  analytics: 'Аналитика',
  materials: 'Материалы',
  team: 'Команда',
  audit: 'Журнал действий',
  settings: 'Настройки',
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function menuLabel(item) {
  return item.label || labelMap[item.id] || item.id;
}

export function pageHeader({ title, subtitle, primaryAction = '' }) {
  return `
    <div class="page-header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${primaryAction ? `<div>${primaryAction}</div>` : ''}
    </div>
  `;
}

export function emptyState(title, text) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

export function toast(message, type = '') {
  let host = document.querySelector('[data-toast-host]');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.dataset.toastHost = 'true';
    document.body.appendChild(host);
  }
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  host.appendChild(node);
  window.setTimeout(() => node.remove(), 3600);
}

export function renderPlaceholderScreen(screen) {
  const title = menuLabel(screen);
  return `
    ${pageHeader({
      title,
      subtitle: 'Экран будет собираться отдельным файлом по утвержденному плану. Сейчас оболочка уже показывает доступ роли и связь с системой.',
    })}
    <div class="placeholder-grid">
      <article class="placeholder-card">
        <strong>Связанные действия</strong>
        <p>${escapeHtml((screen.api || []).join(', ') || 'Действия будут подключены на шаге экрана.')}</p>
      </article>
      <article class="placeholder-card">
        <strong>Сущности</strong>
        <p>${escapeHtml((screen.entities || []).join(', ') || 'Нет связанных сущностей.')}</p>
      </article>
      <article class="placeholder-card">
        <strong>Правило</strong>
        <p>Один экран, один файл, одно основное действие. Дубли кнопок не добавляем.</p>
      </article>
    </div>
  `;
}
