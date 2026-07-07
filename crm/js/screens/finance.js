import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let financeMeta = null;
let financeTab = 'payments';
let clientsCache = [];
let activeSubscriptionId = null;
let activeDebtId = null;

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
  }).format(new Date(value));
}

function dateInputValue(daysAhead = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function clientName(clientId) {
  return clientsCache.find((client) => client.id === clientId)?.name || clientId || 'клиент не указан';
}

function clientOptions() {
  return `
    <option value="">Выберите клиента</option>
    ${clientsCache.map((client) => `
      <option value="${escapeHtml(client.id)}">${escapeHtml(client.name)} · ${escapeHtml(client.city || 'город')}</option>
    `).join('')}
  `;
}

function packageOptions(selected = '') {
  const packages = Object.values(financeMeta?.packages || {});
  return packages.map((item) => `
    <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
  `).join('');
}

function sum(items, key = 'amount') {
  return items.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}

function renderCounters({ payments, subscriptions, debts }) {
  const activeSubscriptions = subscriptions.filter((item) => item.status === 'active');
  const openDebts = debts.filter((item) => item.status === 'open');
  return `
    <div class="dashboard-counters deal-counters">
      <article class="dashboard-counter"><span>Платежи</span><strong>${escapeHtml(formatMoney(sum(payments)))}</strong></article>
      <article class="dashboard-counter success"><span>Активные подписки</span><strong>${activeSubscriptions.length}</strong></article>
      <article class="dashboard-counter"><span>Ежемесячно</span><strong>${escapeHtml(formatMoney(sum(activeSubscriptions)))}</strong></article>
      <article class="dashboard-counter ${openDebts.length ? 'danger' : ''}"><span>Открытые долги</span><strong>${escapeHtml(formatMoney(sum(openDebts)))}</strong></article>
    </div>
  `;
}

function paymentRow(payment) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(formatMoney(payment.amount))}</strong>
        <small>${escapeHtml(humanize(payment.method || 'способ не указан'))} · ${escapeHtml(humanize(payment.status || 'paid'))}</small>
      </td>
      <td>
        <strong>${escapeHtml(clientName(payment.clientId))}</strong>
        <small>${escapeHtml(payment.dealId ? 'привязано к сделке' : 'без сделки')}</small>
      </td>
      <td>${escapeHtml(formatDate(payment.paidAt || payment.createdAt))}</td>
      <td>${escapeHtml(payment.note || '—')}</td>
      <td>
        <div class="row-actions">
          ${payment.clientId ? `<button class="secondary-button compact-button" type="button" data-open-client="${escapeHtml(payment.clientId)}">Клиент</button>` : ''}
          ${payment.dealId ? `<button class="secondary-button compact-button" type="button" data-open-deal="${escapeHtml(payment.dealId)}">Сделка</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function subscriptionRow(subscription) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(clientName(subscription.clientId))}</strong>
        <small>${escapeHtml(humanize(subscription.packageId))}</small>
      </td>
      <td>
        <strong>${escapeHtml(formatMoney(subscription.amount))}</strong>
        <small>${escapeHtml(subscription.renewalPeriodMonths || 1)} мес.</small>
      </td>
      <td><span class="status-badge">${escapeHtml(humanize(subscription.status))}</span></td>
      <td>
        <strong>${escapeHtml(formatDate(subscription.endsAt))}</strong>
        <small>старт ${escapeHtml(formatDate(subscription.startsAt))}</small>
      </td>
      <td>
        <div class="row-actions">
          <button class="secondary-button compact-button" type="button" data-renew-subscription="${escapeHtml(subscription.id)}" data-amount="${escapeHtml(subscription.amount)}" data-period="${escapeHtml(subscription.renewalPeriodMonths || 1)}">Продлить</button>
          <button class="secondary-button compact-button" type="button" data-open-client="${escapeHtml(subscription.clientId)}">Клиент</button>
        </div>
      </td>
    </tr>
  `;
}

function debtRow(debt) {
  const overdue = debt.status === 'open' && debt.dueAt && new Date(debt.dueAt) < new Date();
  return `
    <tr class="${overdue ? 'row-danger' : ''}">
      <td>
        <strong>${escapeHtml(clientName(debt.clientId))}</strong>
        <small>${escapeHtml(debt.reason)}</small>
      </td>
      <td><strong>${escapeHtml(formatMoney(debt.amount))}</strong></td>
      <td><span class="status-badge">${escapeHtml(humanize(debt.status))}</span></td>
      <td>
        <strong class="${overdue ? 'danger-text' : ''}">${escapeHtml(formatDate(debt.dueAt))}</strong>
        <small>${debt.paidAt ? `оплачено ${escapeHtml(formatDate(debt.paidAt))}` : 'ожидает оплаты'}</small>
      </td>
      <td>
        <div class="row-actions">
          ${debt.status === 'open' ? `<button class="secondary-button compact-button" type="button" data-pay-debt="${escapeHtml(debt.id)}">Закрыть</button>` : ''}
          <button class="secondary-button compact-button" type="button" data-open-client="${escapeHtml(debt.clientId)}">Клиент</button>
        </div>
      </td>
    </tr>
  `;
}

function renderPayments(payments) {
  if (!payments.length) return emptyState('Платежей пока нет', 'Фактические платежи появляются после оплаты сделки.');
  return `
    <div class="table-panel">
      <table class="data-table">
        <thead><tr><th>Платеж</th><th>Клиент</th><th>Дата</th><th>Комментарий</th><th>Действия</th></tr></thead>
        <tbody>${payments.map(paymentRow).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderSubscriptions(subscriptions) {
  if (!subscriptions.length) return emptyState('Подписок пока нет', 'Создайте подписку после бесплатной поддержки или продления.');
  return `
    <div class="table-panel">
      <table class="data-table">
        <thead><tr><th>Клиент</th><th>Сумма</th><th>Статус</th><th>Период</th><th>Действия</th></tr></thead>
        <tbody>${subscriptions.map(subscriptionRow).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderDebts(debts) {
  if (!debts.length) return emptyState('Долгов нет', 'Здесь будут просрочки и ручные задолженности по подпискам.');
  return `
    <div class="table-panel">
      <table class="data-table">
        <thead><tr><th>Клиент</th><th>Сумма</th><th>Статус</th><th>Срок</th><th>Действия</th></tr></thead>
        <tbody>${debts.map(debtRow).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderTabs() {
  const labels = {
    payments: 'Платежи',
    subscriptions: 'Подписки',
    debts: 'Долги',
  };
  return `
    <div class="tab-bar" data-finance-tabs>
      ${Object.entries(labels).map(([key, label]) => `
        <button class="tab-button ${financeTab === key ? 'active' : ''}" type="button" data-finance-tab="${key}">${escapeHtml(label)}</button>
      `).join('')}
    </div>
  `;
}

function renderTabAction() {
  if (financeTab === 'subscriptions') {
    return '<button class="primary-button" type="button" data-open-subscription-modal>Создать подписку</button>';
  }
  if (financeTab === 'debts') {
    return '<button class="primary-button" type="button" data-open-debt-modal>Создать долг</button>';
  }
  return '<span class="muted">Платежи записываются из сделки</span>';
}

function renderFinance(data) {
  const content = {
    payments: renderPayments(data.payments),
    subscriptions: renderSubscriptions(data.subscriptions),
    debts: renderDebts(data.debts),
  }[financeTab];

  return `
    ${renderCounters(data)}
    <div class="panel finance-toolbar">
      ${renderTabs()}
      <div>${renderTabAction()}</div>
    </div>
    ${content}
  `;
}

function modalMarkup() {
  return `
    <div class="modal-backdrop" data-subscription-modal>
      <div class="modal-panel">
        <form data-subscription-form>
          <div class="modal-header"><h2>Создать подписку</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="financeSubscriptionClient">Клиент</label>
              <select id="financeSubscriptionClient" name="clientId" required>${clientOptions()}</select>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="financeSubscriptionAmount">Сумма, ₸</label>
                <input id="financeSubscriptionAmount" name="amount" type="number" min="0" step="10000" required />
              </div>
              <div class="field">
                <label for="financeSubscriptionPackage">Пакет</label>
                <select id="financeSubscriptionPackage" name="packageId">${packageOptions('business')}</select>
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="financeSubscriptionMonths">Период, мес.</label>
                <input id="financeSubscriptionMonths" name="periodMonths" type="number" min="1" value="1" required />
              </div>
              <div class="field">
                <label for="financeSubscriptionStart">Старт</label>
                <input id="financeSubscriptionStart" name="startsAt" type="date" value="${escapeHtml(dateInputValue())}" />
              </div>
            </div>
            <div class="field">
              <label for="financeSubscriptionNote">Комментарий</label>
              <input id="financeSubscriptionNote" name="note" placeholder="Например: продление после 4 месяцев поддержки" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-finance-modal>Отмена</button>
            <button class="primary-button" type="submit">Создать подписку</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-renew-modal>
      <div class="modal-panel">
        <form data-renew-form>
          <div class="modal-header"><h2>Продлить подписку</h2></div>
          <div class="modal-body form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="financeRenewAmount">Сумма, ₸</label>
                <input id="financeRenewAmount" name="amount" type="number" min="0" step="10000" required />
              </div>
              <div class="field">
                <label for="financeRenewMonths">Период, мес.</label>
                <input id="financeRenewMonths" name="periodMonths" type="number" min="1" value="1" required />
              </div>
            </div>
            <div class="field">
              <label for="financeRenewComment">Комментарий</label>
              <textarea id="financeRenewComment" name="comment" rows="3" required placeholder="Например: оплачено за следующий месяц"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-finance-modal>Отмена</button>
            <button class="primary-button" type="submit">Продлить</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-debt-modal>
      <div class="modal-panel">
        <form data-debt-form>
          <div class="modal-header"><h2>Создать долг</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="financeDebtClient">Клиент</label>
              <select id="financeDebtClient" name="clientId" required>${clientOptions()}</select>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="financeDebtAmount">Сумма, ₸</label>
                <input id="financeDebtAmount" name="amount" type="number" min="0" step="1000" required />
              </div>
              <div class="field">
                <label for="financeDebtDue">Срок оплаты</label>
                <input id="financeDebtDue" name="dueAt" type="date" value="${escapeHtml(dateInputValue(3))}" required />
              </div>
            </div>
            <div class="field">
              <label for="financeDebtReason">Причина</label>
              <input id="financeDebtReason" name="reason" required placeholder="Например: не оплачено продление" />
            </div>
            <div class="field">
              <label for="financeDebtComment">Комментарий</label>
              <textarea id="financeDebtComment" name="comment" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-finance-modal>Отмена</button>
            <button class="primary-button" type="submit">Создать долг</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-pay-debt-modal>
      <div class="modal-panel">
        <form data-pay-debt-form>
          <div class="modal-header"><h2>Закрыть долг</h2></div>
          <div class="modal-body">
            <div class="field">
              <label for="financePayDebtComment">Комментарий</label>
              <textarea id="financePayDebtComment" name="comment" rows="4" required placeholder="Например: оплачено Kaspi"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-finance-modal>Отмена</button>
            <button class="primary-button" type="submit">Закрыть долг</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderFinanceScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Финансы',
      subtitle: 'Контроль фактических платежей, подписок и долгов после запуска клиента.',
    })}
    <div data-finance-root>${emptyState('Загружаем финансы', 'Получаем платежи, подписки, долги и клиентов.')}</div>
    <div data-finance-modals></div>
  `;
}

export async function mountFinanceScreen() {
  const root = document.querySelector('[data-finance-root]');
  const modals = document.querySelector('[data-finance-modals]');
  if (!root || !modals) return;

  const loadFinance = async () => {
    root.innerHTML = emptyState('Загружаем финансы', 'Обновляем платежи, подписки и долги.');
    const [metaResult, clientsResult, paymentsResult, subscriptionsResult, debtsResult] = await Promise.all([
      financeMeta ? Promise.resolve({ meta: financeMeta }) : get('/api/meta'),
      get('/api/clients?limit=200'),
      get('/api/payments?limit=200&sort=-paidAt,-createdAt'),
      get('/api/subscriptions?limit=200&sort=-updatedAt,-createdAt'),
      get('/api/debts?limit=200&sort=-updatedAt,-createdAt'),
    ]);
    financeMeta = metaResult.meta;
    clientsCache = clientsResult.data || [];
    const data = {
      payments: paymentsResult.data || [],
      subscriptions: subscriptionsResult.data || [],
      debts: debtsResult.data || [],
    };
    root.innerHTML = renderFinance(data);
    modals.innerHTML = modalMarkup();
    bindFinance(root, loadFinance);
  };

  try {
    await loadFinance();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить финансы', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки финансов', 'error');
  }
}

function closeModals() {
  document.querySelectorAll('[data-subscription-modal], [data-renew-modal], [data-debt-modal], [data-pay-debt-modal]').forEach((modal) => {
    modal.classList.remove('open');
  });
}

function openModal(selector) {
  document.querySelector(selector)?.classList.add('open');
}

function bindFinance(root, reload) {
  root.querySelectorAll('[data-finance-tab]').forEach((button) => {
    button.addEventListener('click', async () => {
      financeTab = button.dataset.financeTab;
      await reload();
    });
  });

  root.querySelector('[data-open-subscription-modal]')?.addEventListener('click', () => openModal('[data-subscription-modal]'));
  root.querySelector('[data-open-debt-modal]')?.addEventListener('click', () => openModal('[data-debt-modal]'));

  root.querySelectorAll('[data-open-client]').forEach((button) => {
    button.addEventListener('click', () => navigate(`client-detail/${button.dataset.openClient}`));
  });
  root.querySelectorAll('[data-open-deal]').forEach((button) => {
    button.addEventListener('click', () => navigate(`deal-detail/${button.dataset.openDeal}`));
  });
  root.querySelectorAll('[data-renew-subscription]').forEach((button) => {
    button.addEventListener('click', () => {
      activeSubscriptionId = button.dataset.renewSubscription;
      document.querySelector('#financeRenewAmount').value = button.dataset.amount || '';
      document.querySelector('#financeRenewMonths').value = button.dataset.period || '1';
      openModal('[data-renew-modal]');
    });
  });
  root.querySelectorAll('[data-pay-debt]').forEach((button) => {
    button.addEventListener('click', () => {
      activeDebtId = button.dataset.payDebt;
      openModal('[data-pay-debt-modal]');
    });
  });

  document.querySelectorAll('[data-close-finance-modal]').forEach((button) => {
    button.addEventListener('click', closeModals);
  });
  document.querySelectorAll('[data-subscription-modal], [data-renew-modal], [data-debt-modal], [data-pay-debt-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModals();
    });
  });

  document.querySelector('[data-subscription-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/clients/${data.get('clientId')}/subscriptions`, {
        amount: Number(data.get('amount')),
        packageId: data.get('packageId'),
        periodMonths: Number(data.get('periodMonths') || 1),
        startsAt: data.get('startsAt') ? new Date(data.get('startsAt')).toISOString() : undefined,
        note: data.get('note'),
      });
      toast('Подписка создана', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось создать подписку', 'error');
    }
  });

  document.querySelector('[data-renew-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/subscriptions/${activeSubscriptionId}/renew`, {
        amount: Number(data.get('amount')),
        periodMonths: Number(data.get('periodMonths') || 1),
        comment: String(data.get('comment') || '').trim(),
      });
      toast('Подписка продлена', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось продлить подписку', 'error');
    }
  });

  document.querySelector('[data-debt-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/clients/${data.get('clientId')}/debts`, {
        amount: Number(data.get('amount')),
        reason: data.get('reason'),
        dueAt: new Date(data.get('dueAt')).toISOString(),
        comment: data.get('comment'),
      });
      toast('Долг создан', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось создать долг', 'error');
    }
  });

  document.querySelector('[data-pay-debt-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/debts/${activeDebtId}/paid`, {
        comment: String(data.get('comment') || '').trim(),
      });
      toast('Долг закрыт', 'success');
      closeModals();
      event.currentTarget.reset();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось закрыть долг', 'error');
    }
  });
}
