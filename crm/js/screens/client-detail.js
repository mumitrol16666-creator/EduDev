import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { getState } from '../state.js';
import { navigate, routeParam } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let clientMeta = null;

const supportRoles = new Set(['owner', 'supervisor', 'developer', 'implementation', 'support']);
const financeRoles = new Set(['owner', 'supervisor', 'sales_lead']);

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

function dateInputValue(daysAhead = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function directionLabel(value) {
  return {
    autotech: 'AutoTech',
    edutech: 'EduTech',
  }[value] || humanize(value);
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

function renderDeal(deal) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(humanize(deal.niche))}</strong>
        <small>${escapeHtml(humanize(deal.stage))} · ${escapeHtml(formatMoney(deal.amount))}</small>
      </span>
      <button class="secondary-button compact-button" type="button" data-open-deal="${escapeHtml(deal.id)}">Открыть</button>
    </div>
  `;
}

function renderPayment(payment) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(formatMoney(payment.amount))}</strong>
        <small>${escapeHtml(humanize(payment.method))} · ${escapeHtml(formatDate(payment.paidAt || payment.createdAt))}</small>
      </span>
      <b>${escapeHtml(humanize(payment.status || 'paid'))}</b>
    </div>
  `;
}

function renderProject(project) {
  const doneItems = (project.checklist || []).filter((item) => item.done).length;
  const allItems = (project.checklist || []).length;
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(project.title || 'Внедрение')}</strong>
        <small>${escapeHtml(humanize(project.status))} · чек-лист ${doneItems}/${allItems}</small>
      </span>
      <b>${escapeHtml(formatDate(project.deadlineAt || project.updatedAt))}</b>
    </div>
  `;
}

function renderTicket(ticket) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(ticket.title)}</strong>
        <small>${escapeHtml(humanize(ticket.type))} · ${escapeHtml(humanize(ticket.priority))} · ${escapeHtml(formatDate(ticket.dueAt))}</small>
      </span>
      <b>${escapeHtml(humanize(ticket.status))}</b>
    </div>
  `;
}

function renderSubscription(subscription) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(formatMoney(subscription.amount))}</strong>
        <small>${escapeHtml(humanize(subscription.packageId))} · до ${escapeHtml(formatDate(subscription.endsAt))}</small>
      </span>
      <b>${escapeHtml(humanize(subscription.status))}</b>
    </div>
  `;
}

function renderDebt(debt, canFinance) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(formatMoney(debt.amount))}</strong>
        <small>${escapeHtml(debt.reason)} · срок ${escapeHtml(formatDate(debt.dueAt))}</small>
      </span>
      ${canFinance && debt.status === 'open'
        ? `<button class="secondary-button compact-button" type="button" data-pay-debt="${escapeHtml(debt.id)}">Закрыть</button>`
        : `<b>${escapeHtml(humanize(debt.status))}</b>`}
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

function renderNote(note) {
  return `
    <div class="timeline-row">
      <strong>${escapeHtml(humanize(note.type || 'note'))}</strong>
      <p>${escapeHtml(note.text)}</p>
      <small>${escapeHtml(formatDate(note.createdAt))}</small>
    </div>
  `;
}

function renderTimeline(timeline = []) {
  return listOrEmpty(timeline, (event) => `
    <div class="timeline-row">
      <strong>${escapeHtml(event.title || humanize(event.type))}</strong>
      ${event.body ? `<p>${escapeHtml(event.body)}</p>` : ''}
      <small>${escapeHtml(humanize(event.entityType || event.type))} · ${escapeHtml(formatDate(event.createdAt || event.date))}</small>
    </div>
  `, 'История пока пустая', 'Движение появится после задач, заметок, оплат и обращений.');
}

function supportModal(projects = []) {
  const types = Object.values(clientMeta?.supportTicketTypes || {});
  return `
    <div class="modal-backdrop" data-support-modal>
      <div class="modal-panel">
        <form data-support-form>
          <div class="modal-header"><h2>Создать обращение</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="supportType">Тип</label>
              <select id="supportType" name="type" required>${renderOptions(types, types[0])}</select>
            </div>
            <div class="field">
              <label for="supportProject">Внедрение</label>
              <select id="supportProject" name="projectId">
                <option value="">Без привязки</option>
                ${projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title || 'Внедрение')}</option>`).join('')}
              </select>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="supportPriority">Приоритет</label>
                <select id="supportPriority" name="priority">
                  <option value="medium">Средний</option>
                  <option value="high">Высокий</option>
                  <option value="low">Низкий</option>
                </select>
              </div>
              <div class="field">
                <label for="supportPaid">Сумма доработки</label>
                <input id="supportPaid" name="paidAmount" type="number" min="0" step="1000" value="0" />
              </div>
            </div>
            <div class="field">
              <label for="supportTitle">Заголовок</label>
              <input id="supportTitle" name="title" placeholder="Например: настроить новый отчет" required />
            </div>
            <div class="field">
              <label for="supportDescription">Описание</label>
              <textarea id="supportDescription" name="description" rows="4" placeholder="Что нужно сделать или проверить"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-client-modal>Отмена</button>
            <button class="primary-button" type="submit">Создать обращение</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function subscriptionModal() {
  const packages = Object.values(clientMeta?.packages || {});
  return `
    <div class="modal-backdrop" data-subscription-modal>
      <div class="modal-panel">
        <form data-subscription-form>
          <div class="modal-header"><h2>Добавить подписку</h2></div>
          <div class="modal-body form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="subscriptionAmount">Сумма, ₸</label>
                <input id="subscriptionAmount" name="amount" type="number" min="0" step="10000" required />
              </div>
              <div class="field">
                <label for="subscriptionPackage">Пакет</label>
                <select id="subscriptionPackage" name="packageId">${renderOptions(packages, packages[0])}</select>
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="subscriptionMonths">Период, мес.</label>
                <input id="subscriptionMonths" name="periodMonths" type="number" min="1" value="1" required />
              </div>
              <div class="field">
                <label for="subscriptionStarts">Старт</label>
                <input id="subscriptionStarts" name="startsAt" type="date" value="${escapeHtml(dateInputValue())}" />
              </div>
            </div>
            <div class="field">
              <label for="subscriptionNote">Комментарий</label>
              <input id="subscriptionNote" name="note" placeholder="Например: первый платный месяц после поддержки" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-client-modal>Отмена</button>
            <button class="primary-button" type="submit">Добавить подписку</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function debtModal() {
  return `
    <div class="modal-backdrop" data-debt-modal>
      <div class="modal-panel">
        <form data-debt-form>
          <div class="modal-header"><h2>Зафиксировать долг</h2></div>
          <div class="modal-body form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="debtAmount">Сумма, ₸</label>
                <input id="debtAmount" name="amount" type="number" min="0" step="1000" required />
              </div>
              <div class="field">
                <label for="debtDue">Срок оплаты</label>
                <input id="debtDue" name="dueAt" type="date" value="${escapeHtml(dateInputValue(3))}" required />
              </div>
            </div>
            <div class="field">
              <label for="debtReason">Причина</label>
              <input id="debtReason" name="reason" placeholder="Например: не оплачено продление" required />
            </div>
            <div class="field">
              <label for="debtComment">Комментарий</label>
              <textarea id="debtComment" name="comment" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-client-modal>Отмена</button>
            <button class="primary-button" type="submit">Зафиксировать долг</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderClientDetail(detail, timeline) {
  const userRole = getState().user?.role;
  const canSupport = supportRoles.has(userRole);
  const canFinance = financeRoles.has(userRole);
  const { client, lead, deals, payments, implementationProjects, supportTickets, subscriptions, debts, tasks, communications, notes } = detail;

  return `
    ${pageHeader({
      title: client.name,
      subtitle: 'Карточка клиента: история, внедрение, обращения, подписки, долги и задачи в одном месте.',
      primaryAction: canSupport ? '<button class="primary-button" type="button" data-open-support-modal>Создать обращение</button>' : '',
    })}
    <div class="detail-layout">
      <section class="detail-main">
        <div class="panel detail-card">
          <div class="detail-card-head">
            <div>
              <p class="eyebrow">${escapeHtml(directionLabel(client.direction))}</p>
              <h2>${escapeHtml(humanize(client.niche))}</h2>
            </div>
            <span class="status-badge">${escapeHtml(humanize(client.subscriptionStatus))}</span>
          </div>
          <div class="info-grid">
            <div class="info-item"><span>Город</span><strong>${escapeHtml(client.city || lead?.city || 'не указан')}</strong></div>
            <div class="info-item"><span>Телефон</span><strong>${escapeHtml(client.phone || lead?.phone || 'не указан')}</strong></div>
            <div class="info-item"><span>Статус</span><strong>${escapeHtml(humanize(client.status))}</strong></div>
            <div class="info-item"><span>WhatsApp</span><strong>${escapeHtml(client.contacts?.whatsapp || 'не указан')}</strong></div>
            <div class="info-item"><span>Instagram</span><strong>${escapeHtml(client.contacts?.instagram || 'не указан')}</strong></div>
            <div class="info-item"><span>ЛПР</span><strong>${escapeHtml(client.contacts?.decisionMaker || 'не указан')}</strong></div>
          </div>
          <div class="pain-box">
            <span>Активные разделы</span>
            <div class="section-preview">${renderSections(client.activeSections)}</div>
          </div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>История клиента</h2>
            <span>${timeline.length}</span>
          </div>
          <div class="timeline-list">${renderTimeline(timeline)}</div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Сделки</h2>
            <span>${deals.length}</span>
          </div>
          <div class="detail-list">${listOrEmpty(deals, renderDeal, 'Сделок нет', 'Клиент должен появиться из оплаченной сделки.')}</div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Обращения</h2>
            <span>${supportTickets.length}</span>
          </div>
          <div class="detail-list">${listOrEmpty(supportTickets, renderTicket, 'Обращений нет', 'Новые вопросы клиента фиксируем через поддержку.')}</div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Заметки</h2>
            <span>${notes.length}</span>
          </div>
          <form class="inline-form two-columns" data-note-form>
            <select name="type">
              <option value="general">Общее</option>
              <option value="support">Поддержка</option>
              <option value="finance">Финансы</option>
              <option value="implementation">Внедрение</option>
            </select>
            <input name="text" placeholder="Короткая заметка по клиенту" required />
            <button class="secondary-button" type="submit">Добавить</button>
          </form>
          <div class="timeline-list">${listOrEmpty(notes, renderNote, 'Заметок нет', 'Добавьте важный контекст, чтобы команда не теряла детали.')}</div>
        </div>
      </section>

      <aside class="detail-side">
        <button class="secondary-button full-width" type="button" data-back-clients>Назад к клиентам</button>
        ${lead ? `<button class="secondary-button full-width" type="button" data-open-lead="${escapeHtml(lead.id)}">Открыть исходную заявку</button>` : ''}
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Внедрение</h2>
            <span>${implementationProjects.length}</span>
          </div>
          <div class="detail-list">${listOrEmpty(implementationProjects, renderProject, 'Внедрения нет', 'Проект создается после записи оплаты.')}</div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Финансы</h2>
            ${canFinance ? `
              <div class="section-actions">
                <button class="secondary-button compact-button" type="button" data-open-subscription-modal>Подписка</button>
                <button class="secondary-button compact-button" type="button" data-open-debt-modal>Долг</button>
              </div>
            ` : `<span>${payments.length}</span>`}
          </div>
          <div class="finance-stack">
            <div>
              <h3>Платежи</h3>
              <div class="detail-list">${listOrEmpty(payments, renderPayment, 'Платежей нет', 'Оплаты будут отображаться из сделок.')}</div>
            </div>
            <div>
              <h3>Подписки</h3>
              <div class="detail-list">${listOrEmpty(subscriptions, renderSubscription, 'Подписок нет', 'После бесплатной поддержки добавляем платный период.')}</div>
            </div>
            <div>
              <h3>Долги</h3>
              <div class="detail-list">${listOrEmpty(debts, (debt) => renderDebt(debt, canFinance), 'Долгов нет', 'Просрочки и недоплаты появятся здесь.')}</div>
            </div>
          </div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Задачи</h2>
            <span>${tasks.length}</span>
          </div>
          <div class="detail-list">${listOrEmpty(tasks, renderTask, 'Задач нет', 'Задачи создаются из внедрения, поддержки и финансов.')}</div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Коммуникации</h2>
            <span>${communications.length}</span>
          </div>
          <div class="timeline-list">${listOrEmpty(communications, (item) => `
            <div class="timeline-row">
              <strong>${escapeHtml(humanize(item.channel))}</strong>
              <p>${escapeHtml(item.summary || item.result || 'Контакт')}</p>
              <small>${escapeHtml(formatDate(item.createdAt))}</small>
            </div>
          `, 'Коммуникаций нет', 'Звонки и сообщения будут отображаться в истории клиента.')}</div>
        </section>
      </aside>
    </div>
    ${canSupport ? supportModal(implementationProjects) : ''}
    ${canFinance ? `${subscriptionModal()}${debtModal()}` : ''}
  `;
}

export function renderClientDetailScreen() {
  return `
    <div data-client-detail-root>
      ${emptyState('Загружаем клиента', 'Получаем карточку, историю, финансы и внедрение.')}
    </div>
  `;
}

export async function mountClientDetailScreen() {
  const root = document.querySelector('[data-client-detail-root]');
  const clientId = routeParam(1);
  if (!root || !clientId) return;

  const loadDetail = async () => {
    root.innerHTML = emptyState('Загружаем клиента', 'Обновляем карточку клиента.');
    const [metaResult, detailResult, timelineResult] = await Promise.all([
      clientMeta ? Promise.resolve({ meta: clientMeta }) : get('/api/meta'),
      get(`/api/clients/${clientId}`),
      get(`/api/clients/${clientId}/timeline`),
    ]);
    clientMeta = metaResult.meta;
    root.innerHTML = renderClientDetail(detailResult.detail, timelineResult.timeline || []);
    bindClientDetail(root, clientId, detailResult.detail, loadDetail);
  };

  try {
    await loadDetail();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить клиента', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки клиента', 'error');
  }
}

function setModalOpen(modal, open) {
  modal?.classList.toggle('open', open);
}

function closeAllClientModals(root) {
  root.querySelectorAll('[data-support-modal], [data-subscription-modal], [data-debt-modal]').forEach((modal) => {
    modal.classList.remove('open');
  });
}

function bindClientDetail(root, clientId, detail, reload) {
  root.querySelector('[data-back-clients]')?.addEventListener('click', () => navigate('clients'));
  root.querySelector('[data-open-lead]')?.addEventListener('click', (event) => navigate(`lead-detail/${event.currentTarget.dataset.openLead}`));
  root.querySelectorAll('[data-open-deal]').forEach((button) => {
    button.addEventListener('click', () => navigate(`deal-detail/${button.dataset.openDeal}`));
  });

  const supportModalNode = root.querySelector('[data-support-modal]');
  const subscriptionModalNode = root.querySelector('[data-subscription-modal]');
  const debtModalNode = root.querySelector('[data-debt-modal]');

  root.querySelector('[data-open-support-modal]')?.addEventListener('click', () => setModalOpen(supportModalNode, true));
  root.querySelector('[data-open-subscription-modal]')?.addEventListener('click', () => setModalOpen(subscriptionModalNode, true));
  root.querySelector('[data-open-debt-modal]')?.addEventListener('click', () => setModalOpen(debtModalNode, true));

  root.querySelectorAll('[data-close-client-modal]').forEach((button) => {
    button.addEventListener('click', () => closeAllClientModals(root));
  });

  root.querySelectorAll('[data-support-modal], [data-subscription-modal], [data-debt-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeAllClientModals(root);
    });
  });

  root.querySelector('[data-support-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post('/api/support-tickets', {
        clientId,
        projectId: data.get('projectId') || undefined,
        type: data.get('type'),
        priority: data.get('priority'),
        title: data.get('title'),
        description: data.get('description'),
        paidAmount: Number(data.get('paidAmount') || 0),
      });
      toast('Обращение создано', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось создать обращение', 'error');
    }
  });

  root.querySelector('[data-subscription-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/clients/${clientId}/subscriptions`, {
        amount: Number(data.get('amount')),
        packageId: data.get('packageId'),
        periodMonths: Number(data.get('periodMonths') || 1),
        startsAt: data.get('startsAt') ? new Date(data.get('startsAt')).toISOString() : undefined,
        note: data.get('note'),
      });
      toast('Подписка добавлена', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось добавить подписку', 'error');
    }
  });

  root.querySelector('[data-debt-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/clients/${clientId}/debts`, {
        amount: Number(data.get('amount')),
        reason: data.get('reason'),
        dueAt: new Date(data.get('dueAt')).toISOString(),
        comment: data.get('comment'),
      });
      toast('Долг зафиксирован', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось зафиксировать долг', 'error');
    }
  });

  root.querySelector('[data-note-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post('/api/notes', {
        entityType: 'client',
        entityId: clientId,
        type: data.get('type'),
        text: data.get('text'),
      });
      toast('Заметка добавлена', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось добавить заметку', 'error');
    }
  });

  root.querySelectorAll('[data-pay-debt]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await patch(`/api/debts/${button.dataset.payDebt}/paid`, { comment: `Закрыто из карточки клиента ${detail.client.name}` });
        toast('Долг закрыт', 'success');
        await reload();
      } catch (error) {
        toast(error.message || 'Не удалось закрыть долг', 'error');
      }
    });
  });
}
