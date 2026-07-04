import { get, patch } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let activeTaskId = null;

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

function taskRelation(task) {
  if (task.relatedType && task.relatedLabel) return `${task.relatedType}: ${task.relatedLabel}`;
  return 'Без связанной карточки';
}

function renderCounters(workbench) {
  return `
    <div class="dashboard-counters deal-counters">
      <article class="dashboard-counter"><span>Открытые задачи</span><strong>${workbench.counters.openTasks}</strong></article>
      <article class="dashboard-counter"><span>Проекты</span><strong>${workbench.counters.processedRequests}</strong></article>
      <article class="dashboard-counter ${workbench.counters.supportTickets ? 'warning' : ''}"><span>Обращения</span><strong>${workbench.counters.supportTickets}</strong></article>
      <article class="dashboard-counter ${workbench.tasks.filter(isOverdue).length ? 'danger' : 'success'}"><span>Просрочено</span><strong>${workbench.tasks.filter(isOverdue).length}</strong></article>
    </div>
  `;
}

function renderTask(task) {
  const overdue = isOverdue(task);
  return `
    <div class="work-item ${overdue ? 'work-item-danger' : ''}">
      <span>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(humanize(task.type))} · ${escapeHtml(taskRelation(task))} · ${escapeHtml(formatDate(task.dueAt))} · ${escapeHtml(humanize(task.priority || 'medium'))}</small>
      </span>
      <div class="row-actions">
        ${task.projectId ? `<button class="secondary-button compact-button" type="button" data-open-project="${escapeHtml(task.projectId)}">Внедрение</button>` : ''}
        ${task.clientId ? `<button class="secondary-button compact-button" type="button" data-open-client="${escapeHtml(task.clientId)}">Клиент</button>` : ''}
        <button class="secondary-button compact-button" type="button" data-reschedule-task="${escapeHtml(task.id)}" data-due-at="${escapeHtml(task.dueAt || '')}">Перенести</button>
        <button class="secondary-button compact-button" type="button" data-complete-task="${escapeHtml(task.id)}">Готово</button>
      </div>
    </div>
  `;
}

function renderProject(project) {
  const percent = project.checklistTotal ? Math.round((project.checklistDone / project.checklistTotal) * 100) : 0;
  return `
    <div class="work-item">
      <span>
        <strong>${escapeHtml(project.clientName)}</strong>
        <small>${escapeHtml(humanize(project.niche))} · ${escapeHtml(humanize(project.packageId))} · ${percent}% чек-листа</small>
      </span>
      <div class="row-actions">
        <span class="status-badge">${escapeHtml(humanize(project.status))}</span>
        <button class="secondary-button compact-button" type="button" data-open-project="${escapeHtml(project.id)}">Открыть</button>
      </div>
    </div>
  `;
}

function renderTicket(ticket) {
  return `
    <div class="work-item">
      <span>
        <strong>${escapeHtml(ticket.title)}</strong>
        <small>${escapeHtml(humanize(ticket.type))} · ${escapeHtml(humanize(ticket.priority))} · ${escapeHtml(formatDate(ticket.dueAt))}</small>
      </span>
      <div class="row-actions">
        <span class="status-badge">${escapeHtml(humanize(ticket.status))}</span>
        ${ticket.projectId ? `<button class="secondary-button compact-button" type="button" data-open-project="${escapeHtml(ticket.projectId)}">Внедрение</button>` : ''}
        ${ticket.clientId ? `<button class="secondary-button compact-button" type="button" data-open-client="${escapeHtml(ticket.clientId)}">Клиент</button>` : ''}
      </div>
    </div>
  `;
}

function listOrEmpty(items, renderer, title, text) {
  if (!items?.length) return emptyState(title, text);
  return items.map(renderer).join('');
}

function modalMarkup() {
  return `
    <div class="modal-backdrop" data-dev-complete-modal>
      <div class="modal-panel">
        <form data-dev-complete-form>
          <div class="modal-header"><h2>Завершить задачу</h2></div>
          <div class="modal-body">
            <div class="field">
              <label for="devTaskResult">Результат</label>
              <textarea id="devTaskResult" name="result" rows="4" required placeholder="Что сделано, где проверено, что передать дальше"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-dev-modal>Отмена</button>
            <button class="primary-button" type="submit">Завершить</button>
          </div>
        </form>
      </div>
    </div>
    <div class="modal-backdrop" data-dev-reschedule-modal>
      <div class="modal-panel">
        <form data-dev-reschedule-form>
          <div class="modal-header"><h2>Перенести задачу</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="devTaskDueAt">Новый срок</label>
              <input id="devTaskDueAt" name="dueAt" type="datetime-local" required />
            </div>
            <div class="field">
              <label for="devTaskComment">Комментарий</label>
              <textarea id="devTaskComment" name="comment" rows="3" required placeholder="Почему переносим и когда вернемся"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-dev-modal>Отмена</button>
            <button class="primary-button" type="submit">Перенести</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderWorkbench(workbench) {
  return `
    ${renderCounters(workbench)}
    <div class="dashboard-grid">
      <section class="dashboard-panel priority">
        <div class="dashboard-panel-head">
          <div>
            <h2>Задачи от руководства</h2>
            <p>Только назначенная работа. Завершение требует результата.</p>
          </div>
          <span>${workbench.tasks.length}</span>
        </div>
        <div class="work-list">${listOrEmpty(workbench.tasks, renderTask, 'Задач нет', 'Назначенные задачи появятся здесь.')}</div>
      </section>
      <section class="dashboard-panel">
        <div class="dashboard-panel-head">
          <div>
            <h2>Обработанные проекты</h2>
            <p>Клиенты, которые уже прошли продажу и переданы в работу.</p>
          </div>
          <span>${workbench.processedRequests.length}</span>
        </div>
        <div class="work-list">${listOrEmpty(workbench.processedRequests, renderProject, 'Проектов нет', 'Проекты появятся после оплаты и назначения.')}</div>
      </section>
      <section class="dashboard-panel dashboard-analytics">
        <div class="dashboard-panel-head">
          <div>
            <h2>Обращения поддержки</h2>
            <p>Ошибки, консультации и доработки, связанные с клиентами или внедрением.</p>
          </div>
          <span>${workbench.supportTickets.length}</span>
        </div>
        <div class="work-list">${listOrEmpty(workbench.supportTickets, renderTicket, 'Обращений нет', 'Назначенные обращения появятся здесь.')}</div>
      </section>
    </div>
    ${modalMarkup()}
  `;
}

export function renderDeveloperWorkbenchScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Работа программиста',
      subtitle: 'Без сырых лидов и продаж. Здесь только обработанные проекты, назначенные задачи и обращения.',
    })}
    <div data-developer-root>${emptyState('Загружаем работу', 'Получаем рабочую область программиста.')}</div>
  `;
}

export async function mountDeveloperWorkbenchScreen() {
  const root = document.querySelector('[data-developer-root]');
  if (!root) return;

  const loadWorkbench = async () => {
    root.innerHTML = emptyState('Загружаем работу', 'Обновляем задачи, проекты и обращения.');
    const result = await get('/api/developer/workbench');
    root.innerHTML = renderWorkbench(result.workbench);
    bindWorkbench(root, loadWorkbench);
  };

  try {
    await loadWorkbench();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить работу программиста', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки workbench', 'error');
  }
}

function closeModals() {
  document.querySelectorAll('[data-dev-complete-modal], [data-dev-reschedule-modal]').forEach((modal) => {
    modal.classList.remove('open');
  });
}

function bindWorkbench(root, reload) {
  root.querySelectorAll('[data-open-project]').forEach((button) => {
    button.addEventListener('click', () => navigate(`implementation-detail/${button.dataset.openProject}`));
  });
  root.querySelectorAll('[data-open-client]').forEach((button) => {
    button.addEventListener('click', () => navigate(`client-detail/${button.dataset.openClient}`));
  });

  const completeModal = document.querySelector('[data-dev-complete-modal]');
  const rescheduleModal = document.querySelector('[data-dev-reschedule-modal]');

  root.querySelectorAll('[data-complete-task]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTaskId = button.dataset.completeTask;
      completeModal?.classList.add('open');
    });
  });

  root.querySelectorAll('[data-reschedule-task]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTaskId = button.dataset.rescheduleTask;
      const dueInput = document.querySelector('#devTaskDueAt');
      if (dueInput) dueInput.value = inputDateTime(button.dataset.dueAt);
      rescheduleModal?.classList.add('open');
    });
  });

  document.querySelectorAll('[data-close-dev-modal]').forEach((button) => {
    button.addEventListener('click', closeModals);
  });
  document.querySelectorAll('[data-dev-complete-modal], [data-dev-reschedule-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModals();
    });
  });

  document.querySelector('[data-dev-complete-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/tasks/${activeTaskId}/complete`, { result: String(data.get('result') || '').trim() });
      toast('Задача завершена', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось завершить задачу', 'error');
    }
  });

  document.querySelector('[data-dev-reschedule-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/tasks/${activeTaskId}/reschedule`, {
        dueAt: new Date(data.get('dueAt')).toISOString(),
        comment: String(data.get('comment') || '').trim(),
      });
      toast('Задача перенесена', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось перенести задачу', 'error');
    }
  });
}
