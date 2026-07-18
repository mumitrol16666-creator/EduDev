import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { getState } from '../state.js';
import { navigate, routeParam } from '../router.js';
import { emptyState, escapeHtml, journeyBar, pageHeader, toast } from '../ui.js';

let implementationDetailMeta = null;

const implementationRoles = new Set(['owner', 'supervisor', 'implementation']);
const supportRoles = new Set(['owner', 'supervisor', 'implementation', 'support', 'developer']);

function humanize(value) {
  return labelValue(value);
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Number(value || 0))} ₸`;
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

function dateInputValue(daysAhead = 2) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function renderOptions(items, selected = '') {
  return (items || []).map((item) => `
    <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
  `).join('');
}

function renderSections(sections = []) {
  if (!sections.length) return '<span class="muted">Разделы не выбраны</span>';
  return sections.map((section) => `<span class="status-badge">${escapeHtml(humanize(section))}</span>`).join('');
}

function listOrEmpty(items, renderer, title, text) {
  if (!items?.length) return emptyState(title, text);
  return items.map(renderer).join('');
}

function checklistProgress(project) {
  const checklist = project.checklist || [];
  if (!checklist.length) return { done: 0, total: 0, percent: 0 };
  const done = checklist.filter((item) => item.done).length;
  return { done, total: checklist.length, percent: Math.round((done / checklist.length) * 100) };
}

function renderChecklist(project, canImplement) {
  if (!project.checklist?.length) return emptyState('Чек-лист пустой', 'Для этой ниши пока нет пунктов запуска.');
  return project.checklist.map((item, index) => `
    <form class="checklist-item ${item.done ? 'done' : ''}" data-checklist-form="${index}">
      <label>
        <input name="done" type="checkbox" ${item.done ? 'checked' : ''} ${canImplement ? '' : 'disabled'} />
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.completedAt ? `готово ${escapeHtml(formatDate(item.completedAt))}` : 'ожидает выполнения'}</small>
        </span>
      </label>
      <input name="comment" placeholder="Комментарий" value="${escapeHtml(item.comment || '')}" ${canImplement ? '' : 'disabled'} />
      ${canImplement ? '<button class="secondary-button compact-button" type="submit">Сохранить</button>' : ''}
    </form>
  `).join('');
}

function renderRequest(request) {
  const required = (request.items || []).filter((item) => item.required).length;
  const received = (request.items || []).filter((item) => item.received).length;
  return `
    <div class="timeline-row">
      <strong>${escapeHtml(humanize(request.status))} · ${received}/${request.items?.length || 0} получено</strong>
      <p>${escapeHtml(request.comment || `Обязательных пунктов: ${required}`)}</p>
      <small>${escapeHtml(request.sentTo || 'получатель не указан')} · срок ${escapeHtml(formatDate(request.dueAt))}</small>
    </div>
  `;
}

function renderTask(task) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(humanize(task.type))} · ${escapeHtml(formatDate(task.dueAt))}</small>
      </span>
      <b>${escapeHtml(humanize(task.status || 'open'))}</b>
    </div>
  `;
}

function renderTicket(ticket) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(ticket.title)}</strong>
        <small>${escapeHtml(humanize(ticket.type))} · ${escapeHtml(humanize(ticket.priority))}</small>
      </span>
      <b>${escapeHtml(humanize(ticket.status))}</b>
    </div>
  `;
}

function dataCollectionModal(client) {
  return `
    <div class="modal-backdrop" data-data-modal>
      <div class="modal-panel">
        <form data-data-form>
          <div class="modal-header"><h2>Запросить данные</h2></div>
          <div class="modal-body form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="dataSentTo">Куда отправили</label>
                <input id="dataSentTo" name="sentTo" value="${escapeHtml(client?.phone || '')}" />
              </div>
              <div class="field">
                <label for="dataDueAt">Срок</label>
                <input id="dataDueAt" name="dueAt" type="date" value="${escapeHtml(dateInputValue(2))}" />
              </div>
            </div>
            <div class="field">
              <label for="dataComment">Комментарий</label>
              <textarea id="dataComment" name="comment" rows="3" placeholder="Что именно отправили клиенту"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-implementation-modal>Отмена</button>
            <button class="primary-button" type="submit">Запросить данные</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function supportModal() {
  const types = Object.values(implementationDetailMeta?.supportTicketTypes || {});
  return `
    <div class="modal-backdrop" data-support-modal>
      <div class="modal-panel">
        <form data-support-form>
          <div class="modal-header"><h2>Создать обращение</h2></div>
          <div class="modal-body form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="ticketType">Тип</label>
                <select id="ticketType" name="type">${renderOptions(types, types[0])}</select>
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
            <div class="field">
              <label for="ticketTitle">Заголовок</label>
              <input id="ticketTitle" name="title" placeholder="Например: проверить сценарий оплаты" required />
            </div>
            <div class="field">
              <label for="ticketDescription">Описание</label>
              <textarea id="ticketDescription" name="description" rows="4"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-implementation-modal>Отмена</button>
            <button class="primary-button" type="submit">Создать обращение</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderImplementationDetail(detail) {
  const userRole = getState().user?.role;
  const canImplement = implementationRoles.has(userRole);
  const canSupport = supportRoles.has(userRole);
  const { project, client, deal, tasks, dataCollectionRequests, supportTickets } = detail;
  const progress = checklistProgress(project);
  const statuses = Object.values(implementationDetailMeta?.implementationStatuses || {});

  return `
    ${pageHeader({
      title: client?.name || 'Внедрение',
      subtitle: 'Рабочая карточка запуска: данные клиента, настройка, чек-лист, задачи и переход в поддержку.',
      primaryAction: canImplement ? '<button class="primary-button" type="button" data-open-data-modal>Запросить данные</button>' : '',
    })}
    ${journeyBar(project.status === 'support' || project.status === 'done' ? 5 : 4)}
    <div class="detail-layout">
      <section class="detail-main">
        <div class="panel detail-card">
          <div class="detail-card-head">
            <div>
              <p class="eyebrow">${escapeHtml(humanize(project.packageId))}</p>
              <h2>${escapeHtml(humanize(project.niche))}</h2>
            </div>
            <span class="status-badge" data-status="${escapeHtml(project.status)}">${escapeHtml(humanize(project.status))}</span>
          </div>
          <div class="info-grid">
            <div class="info-item"><span>Клиент</span><strong>${escapeHtml(client?.name || 'Клиент не найден')}</strong></div>
            <div class="info-item"><span>Город</span><strong>${escapeHtml(client?.city || 'не указан')}</strong></div>
            <div class="info-item"><span>Телефон</span><strong>${escapeHtml(client?.phone || 'не указан')}</strong></div>
            <div class="info-item"><span>Сумма сделки</span><strong>${escapeHtml(formatMoney(deal?.amount || 0))}</strong></div>
            <div class="info-item"><span>Чек-лист</span><strong>${progress.done}/${progress.total} · ${progress.percent}%</strong></div>
            <div class="info-item"><span>Поддержка до</span><strong>${escapeHtml(formatDate(project.supportFreeUntil))}</strong></div>
          </div>
          <div class="pain-box">
            <span>Разделы запуска</span>
            <div class="section-preview">${renderSections(project.sections)}</div>
          </div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Статус внедрения</h2>
          </div>
          <form class="inline-form two-columns" data-status-form>
            <select name="status" ${canImplement ? '' : 'disabled'}>${renderOptions(statuses, project.status)}</select>
            <input name="comment" placeholder="Комментарий к переходу" ${canImplement ? '' : 'disabled'} />
            ${canImplement ? '<button class="secondary-button" type="submit">Обновить</button>' : ''}
          </form>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Чек-лист запуска</h2>
            <span>${progress.percent}%</span>
          </div>
          <div class="checklist-stack">${renderChecklist(project, canImplement)}</div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Запросы данных</h2>
            <span>${dataCollectionRequests.length}</span>
          </div>
          <div class="timeline-list">${listOrEmpty(dataCollectionRequests, renderRequest, 'Запросов нет', 'Сначала запросите у клиента данные для запуска.')}</div>
        </div>
      </section>

      <aside class="detail-side">
        <button class="secondary-button full-width" type="button" data-back-implementation>Назад к внедрению</button>
        ${client ? `<button class="secondary-button full-width" type="button" data-open-client="${escapeHtml(client.id)}">Открыть клиента</button>` : ''}
        ${deal ? `<button class="secondary-button full-width" type="button" data-open-deal="${escapeHtml(deal.id)}">Открыть сделку</button>` : ''}
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Обращения</h2>
            ${canSupport ? '<button class="secondary-button compact-button" type="button" data-open-support-modal>Создать</button>' : `<span>${supportTickets.length}</span>`}
          </div>
          <div class="detail-list">${listOrEmpty(supportTickets, renderTicket, 'Обращений нет', 'Если нужна помощь программиста или поддержки, создайте обращение.')}</div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Задачи</h2>
            <span>${tasks.length}</span>
          </div>
          <div class="detail-list">${listOrEmpty(tasks, renderTask, 'Задач нет', 'Задачи появляются после оплаты, запроса данных и поддержки.')}</div>
        </section>
      </aside>
    </div>
    ${canImplement ? dataCollectionModal(client) : ''}
    ${canSupport ? supportModal() : ''}
  `;
}

export function renderImplementationDetailScreen() {
  return `
    <div data-implementation-detail-root>
      ${emptyState('Загружаем внедрение', 'Получаем проект, клиента, задачи, данные и обращения.')}
    </div>
  `;
}

export async function mountImplementationDetailScreen() {
  const root = document.querySelector('[data-implementation-detail-root]');
  const projectId = routeParam(1);
  if (!root || !projectId) return;

  const loadDetail = async () => {
    root.innerHTML = emptyState('Загружаем внедрение', 'Обновляем рабочую карточку.');
    const [metaResult, detailResult] = await Promise.all([
      implementationDetailMeta ? Promise.resolve({ meta: implementationDetailMeta }) : get('/api/meta'),
      get(`/api/implementation-projects/${projectId}`),
    ]);
    implementationDetailMeta = metaResult.meta;
    root.innerHTML = renderImplementationDetail(detailResult.detail);
    bindImplementationDetail(root, projectId, detailResult.detail, loadDetail);
  };

  try {
    await loadDetail();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить внедрение', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки внедрения', 'error');
  }
}

function closeModals(root) {
  root.querySelectorAll('[data-data-modal], [data-support-modal]').forEach((modal) => {
    modal.classList.remove('open');
  });
}

function bindImplementationDetail(root, projectId, detail, reload) {
  root.querySelector('[data-back-implementation]')?.addEventListener('click', () => navigate('implementation'));
  root.querySelector('[data-open-client]')?.addEventListener('click', (event) => navigate(`client-detail/${event.currentTarget.dataset.openClient}`));
  root.querySelector('[data-open-deal]')?.addEventListener('click', (event) => navigate(`deal-detail/${event.currentTarget.dataset.openDeal}`));

  const dataModal = root.querySelector('[data-data-modal]');
  const supportModalNode = root.querySelector('[data-support-modal]');
  root.querySelector('[data-open-data-modal]')?.addEventListener('click', () => dataModal?.classList.add('open'));
  root.querySelector('[data-open-support-modal]')?.addEventListener('click', () => supportModalNode?.classList.add('open'));

  root.querySelectorAll('[data-close-implementation-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModals(root));
  });
  root.querySelectorAll('[data-data-modal], [data-support-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModals(root);
    });
  });

  root.querySelector('[data-status-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/implementation-projects/${projectId}/status`, {
        status: data.get('status'),
        comment: String(data.get('comment') || '').trim() || undefined,
      });
      toast('Статус внедрения обновлен', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось обновить статус', 'error');
    }
  });

  root.querySelectorAll('[data-checklist-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const index = event.currentTarget.dataset.checklistForm;
      const data = new FormData(event.currentTarget);
      try {
        await patch(`/api/implementation-projects/${projectId}/checklist/${index}`, {
          done: data.get('done') === 'on',
          comment: String(data.get('comment') || '').trim() || undefined,
        });
        toast('Пункт чек-листа сохранен', 'success');
        await reload();
      } catch (error) {
        toast(error.message || 'Не удалось сохранить чек-лист', 'error');
      }
    });
  });

  root.querySelector('[data-data-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/implementation-projects/${projectId}/data-collection`, {
        sentTo: String(data.get('sentTo') || '').trim() || undefined,
        dueAt: data.get('dueAt') ? new Date(data.get('dueAt')).toISOString() : undefined,
        comment: String(data.get('comment') || '').trim() || undefined,
      });
      toast('Запрос данных создан', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось создать запрос данных', 'error');
    }
  });

  root.querySelector('[data-support-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post('/api/support-tickets', {
        clientId: detail.project.clientId,
        projectId,
        type: data.get('type'),
        priority: data.get('priority'),
        title: data.get('title'),
        description: data.get('description'),
      });
      toast('Обращение создано', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось создать обращение', 'error');
    }
  });
}
