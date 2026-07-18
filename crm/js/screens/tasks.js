import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { getState } from '../state.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let taskMeta = null;
let usersCache = [];
let activeTaskId = null;
const canCreateRoles = new Set(['owner', 'supervisor', 'sales_lead']);

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

function inputDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function isOverdue(task) {
  return task.status !== 'done' && task.dueAt && new Date(task.dueAt) < new Date();
}

function renderOptions(items, selected = '', placeholder = 'Все') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(items || []).map((item) => `
      <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
    `).join('')}
  `;
}

function userName(userId) {
  return usersCache.find((user) => user.id === userId)?.name || userId || 'не назначен';
}

function userOptions(selected = '') {
  return `
    <option value="">Выберите сотрудника</option>
    ${usersCache.map((user) => `
      <option value="${escapeHtml(user.id)}" ${user.id === selected ? 'selected' : ''}>${escapeHtml(user.name)} · ${escapeHtml(user.role)}</option>
    `).join('')}
  `;
}

function linkedEntity(task) {
  if (task.relatedType && task.relatedLabel) return `${task.relatedType}: ${task.relatedLabel}`;
  if (task.leadId) return 'Заявка';
  if (task.dealId) return 'Сделка';
  if (task.clientId) return 'Клиент';
  if (task.projectId) return 'Внедрение';
  if (task.ticketId) return 'Обращение';
  return 'Без связи';
}

function taskRow(task) {
  const overdue = isOverdue(task);
  return `
    <tr class="${overdue ? 'row-danger' : ''}">
      <td>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(humanize(task.type))} · ${escapeHtml(linkedEntity(task))}</small>
      </td>
      <td><span class="status-badge" data-status="${escapeHtml(task.status || 'open')}">${escapeHtml(humanize(task.status || 'open'))}</span></td>
      <td>
        <strong class="${overdue ? 'danger-text' : ''}">${escapeHtml(formatDate(task.dueAt))}</strong>
        <small>${overdue ? 'просрочено' : escapeHtml(humanize(task.priority || 'medium'))}</small>
      </td>
      <td>${escapeHtml(userName(task.responsibleId))}</td>
      <td>
        <div class="row-actions">
          ${task.status !== 'done' ? `<button class="secondary-button compact-button" type="button" data-complete-task="${escapeHtml(task.id)}">Завершить</button>` : ''}
          <button class="secondary-button compact-button" type="button" data-reschedule-task="${escapeHtml(task.id)}">Перенести</button>
        </div>
      </td>
    </tr>
  `;
}

function renderTaskSummary(tasks) {
  const open = tasks.filter((task) => task.status !== 'done');
  const overdue = open.filter(isOverdue);
  const done = tasks.filter((task) => task.status === 'done');
  const high = open.filter((task) => task.priority === 'high');
  return `
    <div class="dashboard-counters deal-counters">
      <article class="dashboard-counter"><span>Открыто</span><strong>${open.length}</strong></article>
      <article class="dashboard-counter ${overdue.length ? 'danger' : ''}"><span>Просрочено</span><strong>${overdue.length}</strong></article>
      <article class="dashboard-counter"><span>Высокий приоритет</span><strong>${high.length}</strong></article>
      <article class="dashboard-counter success"><span>Завершено в выборке</span><strong>${done.length}</strong></article>
    </div>
  `;
}

function renderTasksTable(tasks, meta) {
  if (!tasks.length) {
    return emptyState('Задач нет', 'Задачи появятся после заявок, диагностик, сделок, внедрения или ручного назначения.');
  }

  return `
    ${renderTaskSummary(tasks)}
    <div class="table-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Задача</th>
            <th>Статус</th>
            <th>Срок</th>
            <th>Ответственный</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>${tasks.map(taskRow).join('')}</tbody>
      </table>
      <div class="table-footer">
        <span>Показано ${tasks.length} из ${meta.total}</span>
        <span>Страница ${meta.page} / ${meta.pages}</span>
      </div>
    </div>
  `;
}

function modalMarkup() {
  return `
    <div class="modal-backdrop" data-task-complete-modal>
      <div class="modal-panel">
        <div class="modal-header"><h2>Завершить задачу</h2></div>
        <form data-complete-form>
          <div class="modal-body">
            <div class="field">
              <label for="taskResult">Результат</label>
              <textarea id="taskResult" name="result" rows="4" required placeholder="Что сделано и чем закончилось"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-task-modal>Отмена</button>
            <button class="primary-button" type="submit">Завершить</button>
          </div>
        </form>
      </div>
    </div>
    <div class="modal-backdrop" data-task-reschedule-modal>
      <div class="modal-panel">
        <div class="modal-header"><h2>Перенести задачу</h2></div>
        <form data-reschedule-form>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="taskDueAt">Новый срок</label>
              <input id="taskDueAt" name="dueAt" type="datetime-local" required />
            </div>
            <div class="field">
              <label for="taskComment">Комментарий</label>
              <textarea id="taskComment" name="comment" rows="3" required placeholder="Почему переносим"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-task-modal>Отмена</button>
            <button class="primary-button" type="submit">Перенести</button>
          </div>
        </form>
      </div>
    </div>
    <div class="modal-backdrop" data-task-create-modal>
      <div class="modal-panel">
        <div class="modal-header"><h2>Создать задачу</h2></div>
        <form data-create-task-form>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="newTaskTitle">Название</label>
              <input id="newTaskTitle" name="title" required placeholder="Например: проверить импорт клиентов" />
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="newTaskResponsible">Ответственный</label>
                <select id="newTaskResponsible" name="responsibleId" required data-task-users></select>
              </div>
              <div class="field">
                <label for="newTaskType">Тип</label>
                <select id="newTaskType" name="type" data-task-types></select>
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="newTaskPriority">Приоритет</label>
                <select id="newTaskPriority" name="priority">
                  <option value="medium">Средний</option>
                  <option value="high">Высокий</option>
                  <option value="low">Низкий</option>
                </select>
              </div>
              <div class="field">
                <label for="newTaskDueAt">Срок</label>
                <input id="newTaskDueAt" name="dueAt" type="datetime-local" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-task-modal>Отмена</button>
            <button class="primary-button" type="submit">Создать задачу</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderTasksScreen(screen) {
  const canCreate = canCreateRoles.has(getState().user?.role);
  return `
    ${pageHeader({
      title: screen.label || 'Задачи',
      subtitle: 'Ежедневный контроль. Завершение требует результата, перенос требует дату и комментарий.',
      primaryAction: canCreate ? '<button class="primary-button" type="button" data-open-create-task>Создать задачу</button>' : '',
    })}
    <form class="filter-bar" data-tasks-filters>
      <div class="field">
        <label for="taskSearch">Поиск</label>
        <input id="taskSearch" name="q" placeholder="Название, тип, связанная сущность" />
      </div>
      <div class="field">
        <label for="taskStatus">Статус</label>
        <select id="taskStatus" name="status">
          <option value="">Все</option>
          <option value="open">Открытые</option>
          <option value="done">Завершенные</option>
        </select>
      </div>
      <div class="field">
        <label for="taskPriority">Приоритет</label>
        <select id="taskPriority" name="priority">
          <option value="">Все</option>
          <option value="high">Высокий</option>
          <option value="medium">Средний</option>
          <option value="low">Низкий</option>
        </select>
      </div>
      <div class="field">
        <label for="taskResponsible">Ответственный</label>
        <select id="taskResponsible" name="responsibleId" data-filter-users></select>
      </div>
      <div class="filter-actions">
        <button class="secondary-button" type="submit">Показать</button>
        <button class="secondary-button" type="button" data-reset-task-filters>Сбросить</button>
      </div>
    </form>
    <div data-tasks-root>${emptyState('Загружаем задачи', 'Получаем список задач.')}</div>
    ${modalMarkup()}
  `;
}

export async function mountTasksScreen() {
  const root = document.querySelector('[data-tasks-root]');
  const filters = document.querySelector('[data-tasks-filters]');
  if (!root || !filters) return;

  const filterUsers = filters.querySelector('[data-filter-users]');
  const createModal = document.querySelector('[data-task-create-modal]');
  const completeModal = document.querySelector('[data-task-complete-modal]');
  const rescheduleModal = document.querySelector('[data-task-reschedule-modal]');

  const closeModals = () => {
    document.querySelectorAll('[data-task-create-modal], [data-task-complete-modal], [data-task-reschedule-modal]').forEach((modal) => {
      modal.classList.remove('open');
    });
    activeTaskId = null;
  };

  const loadTasks = async () => {
    root.innerHTML = emptyState('Загружаем задачи', 'Обновляем список по выбранным фильтрам.');
    const data = new FormData(filters);
    const params = new URLSearchParams();
    ['q', 'status', 'priority', 'responsibleId'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    params.set('sort', 'status,dueAt');
    params.set('limit', '50');
    const result = await get(`/api/tasks?${params.toString()}`);
    root.innerHTML = renderTasksTable(result.data, result.meta);
    bindTaskRows(root, result.data, completeModal, rescheduleModal);
  };

  try {
    const [metaResult, usersResult] = await Promise.all([
      get('/api/meta'),
      get('/api/users').catch(() => ({ data: [] })),
    ]);
    taskMeta = metaResult.meta;
    usersCache = usersResult.data || [];
    filterUsers.innerHTML = `<option value="">Все</option>${userOptions().replace('<option value="">Выберите сотрудника</option>', '')}`;
    document.querySelector('[data-task-users]').innerHTML = userOptions();
    document.querySelector('[data-task-types]').innerHTML = renderOptions(Object.values(taskMeta.taskTypes || {}), 'support', 'Тип');
    await loadTasks();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить задачи', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки задач', 'error');
  }

  filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadTasks().catch((error) => toast(error.message || 'Ошибка фильтрации задач', 'error'));
  });

  filters.querySelector('[data-reset-task-filters]').addEventListener('click', async () => {
    filters.reset();
    await loadTasks().catch((error) => toast(error.message || 'Ошибка загрузки задач', 'error'));
  });

  document.querySelector('[data-open-create-task]')?.addEventListener('click', () => {
    document.querySelector('[data-create-task-form]').reset();
    createModal.classList.add('open');
  });

  document.querySelectorAll('[data-close-task-modal]').forEach((button) => {
    button.addEventListener('click', closeModals);
  });

  document.querySelector('[data-complete-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/tasks/${activeTaskId}/complete`, { result: String(data.get('result') || '').trim() });
      toast('Задача завершена', 'success');
      closeModals();
      await loadTasks();
    } catch (error) {
      toast(error.message || 'Не удалось завершить задачу', 'error');
    }
  });

  document.querySelector('[data-reschedule-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/tasks/${activeTaskId}/reschedule`, {
        dueAt: new Date(String(data.get('dueAt'))).toISOString(),
        comment: String(data.get('comment') || '').trim(),
      });
      toast('Задача перенесена', 'success');
      closeModals();
      await loadTasks();
    } catch (error) {
      toast(error.message || 'Не удалось перенести задачу', 'error');
    }
  });

  document.querySelector('[data-create-task-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dueAt = String(data.get('dueAt') || '');
    try {
      await post('/api/tasks', {
        title: String(data.get('title') || '').trim(),
        responsibleId: String(data.get('responsibleId') || ''),
        type: String(data.get('type') || 'support'),
        priority: String(data.get('priority') || 'medium'),
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      toast('Задача создана', 'success');
      closeModals();
      await loadTasks();
    } catch (error) {
      toast(error.message || 'Не удалось создать задачу', 'error');
    }
  });
}

function bindTaskRows(root, tasks, completeModal, rescheduleModal) {
  root.querySelectorAll('[data-complete-task]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTaskId = button.dataset.completeTask;
      document.querySelector('[data-complete-form]').reset();
      completeModal.classList.add('open');
    });
  });

  root.querySelectorAll('[data-reschedule-task]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTaskId = button.dataset.rescheduleTask;
      const task = tasks.find((item) => item.id === activeTaskId);
      const form = document.querySelector('[data-reschedule-form]');
      form.reset();
      form.elements.dueAt.value = inputDateTime(task?.dueAt || new Date().toISOString());
      rescheduleModal.classList.add('open');
    });
  });
}
