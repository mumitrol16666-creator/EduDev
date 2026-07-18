import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { getState } from '../state.js';
import { navigate } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let supportMeta = null;
let clientsCache = [];
let projectsCache = [];
let usersCache = [];
let activeTicketId = null;

const adminRoles = new Set(['owner', 'supervisor']);

function humanize(value) {
  return labelValue(value);
}

function formatDate(value) {
  if (!value) return 'Без срока';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function dateInputValue(daysAhead = 1) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function isOverdue(ticket) {
  return ticket.status !== 'closed' && ticket.dueAt && new Date(ticket.dueAt) < new Date();
}

function renderOptions(items, selected = '', placeholder = 'Все') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(items || []).map((item) => `
      <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
    `).join('')}
  `;
}

function clientName(clientId) {
  return clientsCache.find((client) => client.id === clientId)?.name || 'клиент не найден';
}

function userName(userId) {
  return usersCache.find((user) => user.id === userId)?.name || userId || 'не назначен';
}

function clientOptions(selected = '') {
  return `
    <option value="">Выберите клиента</option>
    ${clientsCache.map((client) => `
      <option value="${escapeHtml(client.id)}" ${client.id === selected ? 'selected' : ''}>${escapeHtml(client.name)} · ${escapeHtml(client.city || 'город')}</option>
    `).join('')}
  `;
}

function projectOptions(selected = '') {
  return `
    <option value="">Без внедрения</option>
    ${projectsCache.map((project) => `
      <option value="${escapeHtml(project.id)}" ${project.id === selected ? 'selected' : ''}>${escapeHtml(clientName(project.clientId))} · ${escapeHtml(humanize(project.niche))}</option>
    `).join('')}
  `;
}

function userOptions(selected = '') {
  if (!usersCache.length) return '<option value="">Введите ID ниже</option>';
  return `
    <option value="">Выберите сотрудника</option>
    ${usersCache.map((user) => `
      <option value="${escapeHtml(user.id)}" ${user.id === selected ? 'selected' : ''}>${escapeHtml(user.name)} · ${escapeHtml(user.role)}</option>
    `).join('')}
  `;
}

function renderSummary(tickets) {
  const open = tickets.filter((ticket) => !['closed', 'done'].includes(ticket.status));
  const high = open.filter((ticket) => ticket.priority === 'high');
  const paid = tickets.filter((ticket) => ticket.type === 'paid_change');
  const overdue = tickets.filter(isOverdue);
  return `
    <div class="dashboard-counters deal-counters">
      <article class="dashboard-counter"><span>Открыто</span><strong>${open.length}</strong></article>
      <article class="dashboard-counter ${overdue.length ? 'danger' : ''}"><span>Просрочено</span><strong>${overdue.length}</strong></article>
      <article class="dashboard-counter ${high.length ? 'warning' : ''}"><span>Высокий приоритет</span><strong>${high.length}</strong></article>
      <article class="dashboard-counter"><span>Платные доработки</span><strong>${paid.length}</strong></article>
    </div>
  `;
}

function ticketRow(ticket) {
  return `
    <tr class="${isOverdue(ticket) ? 'row-danger' : ''}">
      <td>
        <strong>${escapeHtml(ticket.title)}</strong>
        <small>${escapeHtml(ticket.description || 'без описания')}</small>
      </td>
      <td>
        <span class="status-badge">${escapeHtml(humanize(ticket.type))}</span>
        <small>${ticket.paidAmount ? escapeHtml(`${ticket.paidAmount} ₸ · ${ticket.paymentStatus || 'pending'}`) : escapeHtml(ticket.priority || 'medium')}</small>
      </td>
      <td>
        <strong>${escapeHtml(clientName(ticket.clientId))}</strong>
        <small>${escapeHtml(ticket.projectId ? 'привязано к внедрению' : 'без внедрения')}</small>
      </td>
      <td>
        <span class="status-badge" data-status="${escapeHtml(ticket.status)}">${escapeHtml(humanize(ticket.status))}</span>
        <small>${escapeHtml(formatDate(ticket.dueAt))}</small>
      </td>
      <td>${escapeHtml(userName(ticket.responsibleId))}</td>
      <td>
        <div class="row-actions">
          <button class="secondary-button compact-button" type="button" data-status-ticket="${escapeHtml(ticket.id)}" data-current-status="${escapeHtml(ticket.status)}">Статус</button>
          <button class="secondary-button compact-button" type="button" data-assign-ticket="${escapeHtml(ticket.id)}" data-current-responsible="${escapeHtml(ticket.responsibleId || '')}">Назначить</button>
          ${ticket.status !== 'closed' ? `<button class="secondary-button compact-button" type="button" data-close-ticket="${escapeHtml(ticket.id)}">Закрыть</button>` : ''}
          <button class="secondary-button compact-button" type="button" data-note-ticket="${escapeHtml(ticket.id)}">Заметка</button>
          <button class="secondary-button compact-button" type="button" data-open-client="${escapeHtml(ticket.clientId)}">Клиент</button>
          ${ticket.projectId ? `<button class="secondary-button compact-button" type="button" data-open-project="${escapeHtml(ticket.projectId)}">Внедрение</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderTable(tickets, meta) {
  if (!tickets.length) {
    return emptyState('Обращений пока нет', 'Создайте обращение из поддержки, карточки клиента или внедрения.');
  }

  return `
    ${renderSummary(tickets)}
    <div class="table-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Обращение</th>
            <th>Тип</th>
            <th>Клиент</th>
            <th>Статус</th>
            <th>Ответственный</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>${tickets.map(ticketRow).join('')}</tbody>
      </table>
      <div class="table-footer">
        <span>Показано ${tickets.length} из ${meta.total}</span>
        <span>Страница ${meta.page} / ${meta.pages}</span>
      </div>
    </div>
  `;
}

function modalMarkup() {
  const types = Object.values(supportMeta?.supportTicketTypes || {});
  const statuses = Object.values(supportMeta?.supportTicketStatuses || {});
  return `
    <div class="modal-backdrop" data-support-create-modal>
      <div class="modal-panel">
        <form data-create-ticket-form>
          <div class="modal-header"><h2>Создать обращение</h2></div>
          <div class="modal-body form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="ticketClient">Клиент</label>
                <select id="ticketClient" name="clientId" required>${clientOptions()}</select>
              </div>
              <div class="field">
                <label for="ticketProject">Внедрение</label>
                <select id="ticketProject" name="projectId">${projectOptions()}</select>
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="ticketType">Тип</label>
                <select id="ticketType" name="type" required>${renderOptions(types, types[0], 'Выберите тип')}</select>
              </div>
              <div class="field">
                <label for="ticketPriority">Приоритет</label>
                <select id="ticketPriority" name="priority">
                  <option value="medium">Средний</option>
                  <option value="high">Высокий</option>
                  <option value="low">Низкий</option>
                </select>
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="ticketDueAt">Срок</label>
                <input id="ticketDueAt" name="dueAt" type="date" value="${escapeHtml(dateInputValue(1))}" />
              </div>
              <div class="field">
                <label for="ticketPaidAmount">Сумма доработки</label>
                <input id="ticketPaidAmount" name="paidAmount" type="number" min="0" step="1000" value="0" />
              </div>
            </div>
            <div class="field">
              <label for="ticketTitle">Заголовок</label>
              <input id="ticketTitle" name="title" required placeholder="Например: не отображается расписание" />
            </div>
            <div class="field">
              <label for="ticketDescription">Описание</label>
              <textarea id="ticketDescription" name="description" rows="4"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-support-modal>Отмена</button>
            <button class="primary-button" type="submit">Создать обращение</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-ticket-status-modal>
      <div class="modal-panel">
        <form data-status-ticket-form>
          <div class="modal-header"><h2>Сменить статус</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="ticketStatus">Статус</label>
              <select id="ticketStatus" name="status" required>${renderOptions(statuses, '', 'Выберите статус')}</select>
            </div>
            <div class="field">
              <label for="ticketStatusComment">Комментарий</label>
              <textarea id="ticketStatusComment" name="comment" rows="3" placeholder="Что изменилось"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-support-modal>Отмена</button>
            <button class="primary-button" type="submit">Сменить статус</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-ticket-assign-modal>
      <div class="modal-panel">
        <form data-assign-ticket-form>
          <div class="modal-header"><h2>Назначить ответственного</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="ticketResponsibleSelect">Сотрудник</label>
              <select id="ticketResponsibleSelect" name="responsibleSelect">${userOptions()}</select>
            </div>
            <div class="field">
              <label for="ticketResponsibleId">Или внутренний номер сотрудника</label>
              <input id="ticketResponsibleId" name="responsibleId" placeholder="Если сотрудника нет в списке" />
            </div>
            <div class="field">
              <label for="ticketAssignComment">Комментарий</label>
              <textarea id="ticketAssignComment" name="comment" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-support-modal>Отмена</button>
            <button class="primary-button" type="submit">Назначить</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-ticket-close-modal>
      <div class="modal-panel">
        <form data-close-ticket-form>
          <div class="modal-header"><h2>Закрыть обращение</h2></div>
          <div class="modal-body">
            <div class="field">
              <label for="ticketResult">Результат</label>
              <textarea id="ticketResult" name="result" rows="4" required placeholder="Что сделали, где проверили, что сказали клиенту"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-support-modal>Отмена</button>
            <button class="primary-button" type="submit">Закрыть</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-ticket-note-modal>
      <div class="modal-panel">
        <form data-note-ticket-form>
          <div class="modal-header"><h2>Добавить заметку</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="ticketNoteType">Тип</label>
              <select id="ticketNoteType" name="type">
                <option value="support">Поддержка</option>
                <option value="developer">Программист</option>
                <option value="finance">Финансы</option>
                <option value="general">Общее</option>
              </select>
            </div>
            <div class="field">
              <label for="ticketNote">Заметка</label>
              <textarea id="ticketNote" name="text" rows="4" required></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-support-modal>Отмена</button>
            <button class="primary-button" type="submit">Добавить заметку</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderSupportScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Поддержка',
      subtitle: 'Обращения клиентов после запуска: вопросы, баги, консультации и платные доработки.',
      primaryAction: '<button class="primary-button" type="button" data-open-ticket-create>Создать обращение</button>',
    })}
    <form class="filter-bar" data-support-filters>
      <div class="field">
        <label for="supportSearch">Поиск</label>
        <input id="supportSearch" name="q" placeholder="Заголовок, описание, тип" />
      </div>
      <div class="field">
        <label for="supportStatus">Статус</label>
        <select id="supportStatus" name="status" data-support-status></select>
      </div>
      <div class="field">
        <label for="supportType">Тип</label>
        <select id="supportType" name="type" data-support-type></select>
      </div>
      <div class="field">
        <label for="supportClient">Клиент</label>
        <select id="supportClient" name="clientId" data-support-client></select>
      </div>
      <div class="filter-actions">
        <button class="secondary-button" type="submit">Показать</button>
        <button class="secondary-button" type="button" data-reset-support-filters>Сбросить</button>
      </div>
    </form>
    <div data-support-root>${emptyState('Загружаем обращения', 'Получаем обращения, клиентов и проекты.')}</div>
    <div data-support-modals></div>
  `;
}

export async function mountSupportScreen() {
  const root = document.querySelector('[data-support-root]');
  const filters = document.querySelector('[data-support-filters]');
  const modals = document.querySelector('[data-support-modals]');
  if (!root || !filters || !modals) return;

  const loadReferenceData = async () => {
    const requests = [
      supportMeta ? Promise.resolve({ meta: supportMeta }) : get('/api/meta'),
      get('/api/clients?limit=200'),
      get('/api/implementation-projects?limit=200'),
    ];
    if (adminRoles.has(getState().user?.role)) requests.push(get('/api/users?limit=200'));
    const [metaResult, clientsResult, projectsResult, usersResult] = await Promise.all(requests);
    supportMeta = metaResult.meta;
    clientsCache = clientsResult.data || [];
    projectsCache = projectsResult.data || [];
    usersCache = usersResult?.data || [];

    filters.querySelector('[data-support-status]').innerHTML = renderOptions(Object.values(supportMeta.supportTicketStatuses || {}));
    filters.querySelector('[data-support-type]').innerHTML = renderOptions(Object.values(supportMeta.supportTicketTypes || {}));
    filters.querySelector('[data-support-client]').innerHTML = `
      <option value="">Все</option>
      ${clientsCache.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join('')}
    `;
    modals.innerHTML = modalMarkup();
  };

  const loadTickets = async () => {
    root.innerHTML = emptyState('Загружаем обращения', 'Обновляем список по выбранным фильтрам.');
    const data = new FormData(filters);
    const params = new URLSearchParams();
    ['q', 'status', 'type', 'clientId'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    params.set('sort', '-updatedAt,-createdAt');
    params.set('limit', '50');
    const result = await get(`/api/support-tickets?${params.toString()}`);
    root.innerHTML = renderTable(result.data, result.meta);
    bindTicketRows(root, loadTickets);
  };

  try {
    await loadReferenceData();
    bindSupportModals(loadTickets);
    document.querySelector('[data-open-ticket-create]')?.addEventListener('click', () => setModalOpen('[data-support-create-modal]', true));
    await loadTickets();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить поддержку', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки поддержки', 'error');
  }

  filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadTickets().catch((error) => toast(error.message || 'Ошибка фильтрации обращений', 'error'));
  });

  filters.querySelector('[data-reset-support-filters]').addEventListener('click', async () => {
    filters.reset();
    await loadTickets().catch((error) => toast(error.message || 'Ошибка загрузки обращений', 'error'));
  });
}

function setModalOpen(selector, open) {
  document.querySelector(selector)?.classList.toggle('open', open);
}

function closeModals() {
  document.querySelectorAll('[data-support-create-modal], [data-ticket-status-modal], [data-ticket-assign-modal], [data-ticket-close-modal], [data-ticket-note-modal]').forEach((modal) => {
    modal.classList.remove('open');
  });
}

function bindTicketRows(root) {
  root.querySelectorAll('[data-open-client]').forEach((button) => {
    button.addEventListener('click', () => navigate(`client-detail/${button.dataset.openClient}`));
  });
  root.querySelectorAll('[data-open-project]').forEach((button) => {
    button.addEventListener('click', () => navigate(`implementation-detail/${button.dataset.openProject}`));
  });
  root.querySelectorAll('[data-status-ticket]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTicketId = button.dataset.statusTicket;
      const select = document.querySelector('#ticketStatus');
      if (select) select.value = button.dataset.currentStatus || '';
      setModalOpen('[data-ticket-status-modal]', true);
    });
  });
  root.querySelectorAll('[data-assign-ticket]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTicketId = button.dataset.assignTicket;
      const select = document.querySelector('#ticketResponsibleSelect');
      const input = document.querySelector('#ticketResponsibleId');
      if (select) select.value = button.dataset.currentResponsible || '';
      if (input) input.value = button.dataset.currentResponsible || '';
      setModalOpen('[data-ticket-assign-modal]', true);
    });
  });
  root.querySelectorAll('[data-close-ticket]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTicketId = button.dataset.closeTicket;
      setModalOpen('[data-ticket-close-modal]', true);
    });
  });
  root.querySelectorAll('[data-note-ticket]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTicketId = button.dataset.noteTicket;
      setModalOpen('[data-ticket-note-modal]', true);
    });
  });
}

function bindSupportModals(reload) {
  document.querySelectorAll('[data-close-support-modal]').forEach((button) => {
    button.addEventListener('click', closeModals);
  });
  document.querySelectorAll('[data-support-create-modal], [data-ticket-status-modal], [data-ticket-assign-modal], [data-ticket-close-modal], [data-ticket-note-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModals();
    });
  });

  document.querySelector('[data-create-ticket-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post('/api/support-tickets', {
        clientId: data.get('clientId'),
        projectId: data.get('projectId') || undefined,
        type: data.get('type'),
        title: data.get('title'),
        description: data.get('description'),
        priority: data.get('priority'),
        dueAt: data.get('dueAt') ? new Date(data.get('dueAt')).toISOString() : undefined,
        paidAmount: Number(data.get('paidAmount') || 0),
      });
      toast('Обращение создано', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось создать обращение', 'error');
    }
  });

  document.querySelector('[data-status-ticket-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/support-tickets/${activeTicketId}/status`, {
        status: data.get('status'),
        comment: String(data.get('comment') || '').trim() || undefined,
      });
      toast('Статус обновлен', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось обновить статус', 'error');
    }
  });

  document.querySelector('[data-assign-ticket-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const responsibleId = data.get('responsibleSelect') || data.get('responsibleId');
    if (!responsibleId) {
      toast('Укажите ответственного', 'error');
      return;
    }
    try {
      await patch(`/api/support-tickets/${activeTicketId}/assign`, {
        responsibleId,
        comment: String(data.get('comment') || '').trim() || undefined,
      });
      toast('Ответственный назначен', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось назначить ответственного', 'error');
    }
  });

  document.querySelector('[data-close-ticket-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/support-tickets/${activeTicketId}/close`, {
        result: String(data.get('result') || '').trim(),
      });
      toast('Обращение закрыто', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось закрыть обращение', 'error');
    }
  });

  document.querySelector('[data-note-ticket-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post('/api/notes', {
        entityType: 'support_ticket',
        entityId: activeTicketId,
        type: data.get('type'),
        text: data.get('text'),
      });
      toast('Заметка добавлена', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось добавить заметку', 'error');
    }
  });
}
