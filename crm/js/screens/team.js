import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let teamMeta = null;
let activeUserId = null;

function humanize(value) {
  return labelValue(value);
}

function formatDate(value) {
  if (!value) return 'Нет задач';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function inputDateTime(daysAhead = 1) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function renderOptions(items, selected = '', placeholder = 'Выберите') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(items || []).map((item) => `
      <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
    `).join('')}
  `;
}

function renderWorkload(workload) {
  if (!workload.length) return emptyState('Нагрузка не найдена', 'Добавьте сотрудников или проверьте доступ к team/workload.');
  return `
    <div class="team-workload-grid">
      ${workload.map((item) => `
        <article class="panel team-workload-card ${item.counters.overdueTasks ? 'danger' : ''}">
          <div>
            <strong>${escapeHtml(item.user.name)}</strong>
            <span>${escapeHtml(humanize(item.user.role))} · ${escapeHtml(item.user.status)}</span>
          </div>
          <div class="team-workload-metrics">
            <b>${escapeHtml(item.counters.openTasks)}</b><span>задач</span>
            <b>${escapeHtml(item.counters.overdueTasks)}</b><span>проср.</span>
            <b>${escapeHtml(item.counters.activeProjects)}</b><span>внедр.</span>
            <b>${escapeHtml(item.counters.openTickets)}</b><span>тикетов</span>
          </div>
          <small>Ближайшая задача: ${escapeHtml(formatDate(item.nextTaskAt))}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function userRow(user, workloadByUserId) {
  const workload = workloadByUserId.get(user.id);
  return `
    <tr>
      <td>
        <strong>${escapeHtml(user.name)}</strong>
        <small>${escapeHtml(user.email || 'email не указан')} · ${escapeHtml(user.phone || 'телефон не указан')}</small>
      </td>
      <td><span class="status-badge">${escapeHtml(humanize(user.role))}</span></td>
      <td><span class="status-badge">${escapeHtml(humanize(user.status))}</span></td>
      <td>
        <strong>${escapeHtml(workload?.counters.openTasks || 0)}</strong>
        <small>просрочено ${escapeHtml(workload?.counters.overdueTasks || 0)}</small>
      </td>
      <td>
        <strong>${escapeHtml(workload?.counters.activeProjects || 0)}</strong>
        <small>тикеты ${escapeHtml(workload?.counters.openTickets || 0)}</small>
      </td>
      <td>
        <div class="row-actions">
          <button class="secondary-button compact-button" type="button" data-edit-user="${escapeHtml(user.id)}">Изменить</button>
          <button class="secondary-button compact-button" type="button" data-task-user="${escapeHtml(user.id)}">Задача</button>
        </div>
      </td>
    </tr>
  `;
}

function renderUsers(users, workload) {
  if (!users.length) return emptyState('Сотрудников нет', 'Добавьте первого сотрудника команды.');
  const workloadByUserId = new Map(workload.map((item) => [item.user.id, item]));
  return `
    <div class="table-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Роль</th>
            <th>Статус</th>
            <th>Задачи</th>
            <th>Проекты</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>${users.map((user) => userRow(user, workloadByUserId)).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderTeam(users, workload) {
  return `
    ${renderWorkload(workload)}
    ${renderUsers(users, workload)}
  `;
}

function modalMarkup() {
  const roles = Object.values(teamMeta?.roles || {});
  const taskTypes = Object.values(teamMeta?.taskTypes || {});
  return `
    <div class="modal-backdrop" data-user-create-modal>
      <div class="modal-panel">
        <form data-create-user-form>
          <div class="modal-header"><h2>Добавить сотрудника</h2></div>
          <div class="modal-body form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="teamUserName">Имя</label>
                <input id="teamUserName" name="name" required />
              </div>
              <div class="field">
                <label for="teamUserRole">Роль</label>
                <select id="teamUserRole" name="role" required>${renderOptions(roles, 'manager')}</select>
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="teamUserEmail">Email</label>
                <input id="teamUserEmail" name="email" type="email" />
              </div>
              <div class="field">
                <label for="teamUserPhone">Телефон</label>
                <input id="teamUserPhone" name="phone" />
              </div>
            </div>
            <div class="field">
              <label for="teamUserPassword">Пароль</label>
              <input id="teamUserPassword" name="password" type="password" placeholder="Можно оставить пустым, если вход настроим позже" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-team-modal>Отмена</button>
            <button class="primary-button" type="submit">Добавить сотрудника</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-user-edit-modal>
      <div class="modal-panel">
        <form data-edit-user-form>
          <div class="modal-header"><h2>Изменить сотрудника</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="teamEditName">Имя</label>
              <input id="teamEditName" name="name" required />
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="teamEditRole">Роль</label>
                <select id="teamEditRole" name="role" required>${renderOptions(roles)}</select>
              </div>
              <div class="field">
                <label for="teamEditStatus">Статус</label>
                <select id="teamEditStatus" name="status" required>
                  <option value="active">Активно</option>
                  <option value="inactive">Отключено</option>
                </select>
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="teamEditEmail">Email</label>
                <input id="teamEditEmail" name="email" type="email" />
              </div>
              <div class="field">
                <label for="teamEditPhone">Телефон</label>
                <input id="teamEditPhone" name="phone" />
              </div>
            </div>
            <label class="check-row">
              <input name="regenerateApiToken" type="checkbox" />
              <span>Обновить ключ доступа</span>
            </label>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-team-modal>Отмена</button>
            <button class="primary-button" type="submit">Сохранить</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-user-task-modal>
      <div class="modal-panel">
        <form data-user-task-form>
          <div class="modal-header"><h2>Поставить задачу</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="teamTaskTitle">Название</label>
              <input id="teamTaskTitle" name="title" required placeholder="Например: проверить импорт расписания" />
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="teamTaskType">Тип</label>
                <select id="teamTaskType" name="type">${renderOptions(taskTypes, 'support')}</select>
              </div>
              <div class="field">
                <label for="teamTaskPriority">Приоритет</label>
                <select id="teamTaskPriority" name="priority">
                  <option value="medium">Средний</option>
                  <option value="high">Высокий</option>
                  <option value="low">Низкий</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="teamTaskDueAt">Срок</label>
              <input id="teamTaskDueAt" name="dueAt" type="datetime-local" value="${escapeHtml(inputDateTime(1))}" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-team-modal>Отмена</button>
            <button class="primary-button" type="submit">Поставить задачу</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderTeamScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Команда',
      subtitle: 'Сотрудники, роли и нагрузка. Управленческие задачи ставятся из строки конкретного сотрудника.',
      primaryAction: '<button class="primary-button" type="button" data-open-user-create>Добавить сотрудника</button>',
    })}
    <div data-team-root>${emptyState('Загружаем команду', 'Получаем сотрудников и нагрузку.')}</div>
    <div data-team-modals></div>
  `;
}

export async function mountTeamScreen() {
  const root = document.querySelector('[data-team-root]');
  const modals = document.querySelector('[data-team-modals]');
  if (!root || !modals) return;

  const loadTeam = async () => {
    root.innerHTML = emptyState('Загружаем команду', 'Обновляем сотрудников и нагрузку.');
    const [metaResult, usersResult, workloadResult] = await Promise.all([
      teamMeta ? Promise.resolve({ meta: teamMeta }) : get('/api/meta'),
      get('/api/users?limit=200&sort=role,name'),
      get('/api/team/workload'),
    ]);
    teamMeta = metaResult.meta;
    root.innerHTML = renderTeam(usersResult.data || [], workloadResult.workload || []);
    modals.innerHTML = modalMarkup();
    bindTeam(root, usersResult.data || [], loadTeam);
  };

  try {
    await loadTeam();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить команду', error.message || 'Проверьте подключение и права доступа.');
    toast(error.message || 'Ошибка загрузки команды', 'error');
  }
}

function closeModals() {
  document.querySelectorAll('[data-user-create-modal], [data-user-edit-modal], [data-user-task-modal]').forEach((modal) => {
    modal.classList.remove('open');
  });
  activeUserId = null;
}

function openModal(selector) {
  document.querySelector(selector)?.classList.add('open');
}

function bindTeam(root, users, reload) {
  document.querySelector('[data-open-user-create]')?.addEventListener('click', () => openModal('[data-user-create-modal]'));

  root.querySelectorAll('[data-edit-user]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = users.find((item) => item.id === button.dataset.editUser);
      if (!user) return;
      activeUserId = user.id;
      document.querySelector('#teamEditName').value = user.name || '';
      document.querySelector('#teamEditRole').value = user.role || '';
      document.querySelector('#teamEditStatus').value = user.status || 'active';
      document.querySelector('#teamEditEmail').value = user.email || '';
      document.querySelector('#teamEditPhone').value = user.phone || '';
      openModal('[data-user-edit-modal]');
    });
  });

  root.querySelectorAll('[data-task-user]').forEach((button) => {
    button.addEventListener('click', () => {
      activeUserId = button.dataset.taskUser;
      document.querySelector('[data-user-task-form]').reset();
      document.querySelector('#teamTaskDueAt').value = inputDateTime(1);
      openModal('[data-user-task-modal]');
    });
  });

  document.querySelectorAll('[data-close-team-modal]').forEach((button) => {
    button.addEventListener('click', closeModals);
  });
  document.querySelectorAll('[data-user-create-modal], [data-user-edit-modal], [data-user-task-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModals();
    });
  });

  document.querySelector('[data-create-user-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post('/api/users', {
        name: String(data.get('name') || '').trim(),
        role: data.get('role'),
        email: String(data.get('email') || '').trim() || undefined,
        phone: String(data.get('phone') || '').trim() || undefined,
        password: String(data.get('password') || '').trim() || undefined,
      });
      toast('Сотрудник добавлен', 'success');
      closeModals();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось добавить сотрудника', 'error');
    }
  });

  document.querySelector('[data-edit-user-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/users/${activeUserId}`, {
        name: String(data.get('name') || '').trim(),
        role: data.get('role'),
        status: data.get('status'),
        email: String(data.get('email') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        regenerateApiToken: data.get('regenerateApiToken') === 'on',
      });
      toast('Сотрудник обновлен', 'success');
      closeModals();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось обновить сотрудника', 'error');
    }
  });

  document.querySelector('[data-user-task-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dueAt = String(data.get('dueAt') || '');
    try {
      await post('/api/tasks', {
        title: String(data.get('title') || '').trim(),
        responsibleId: activeUserId,
        type: data.get('type') || 'support',
        priority: data.get('priority') || 'medium',
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      toast('Задача поставлена', 'success');
      closeModals();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось поставить задачу', 'error');
    }
  });
}
