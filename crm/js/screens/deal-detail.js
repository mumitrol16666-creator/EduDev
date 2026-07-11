import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate, routeParam } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let dealMeta = null;
let dealUsers = [];

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

function inputDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function renderOptions(items, selected = '') {
  return (items || []).map((item) => `
    <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
  `).join('');
}

function primaryAction(detail) {
  const { deal, client, proposals, payments } = detail;
  const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const balance = Math.max(Number(deal.amount || 0) - paidAmount, 0);
  if ((deal.stage === 'implementation' || deal.stage === 'won') && client) {
    return `<button class="secondary-button" type="button" data-open-client="${escapeHtml(client.id)}">Открыть клиента</button>`;
  }
  if (proposals.length) {
    return payments.length && balance > 0
      ? '<button class="primary-button" type="submit" form="paymentForm">Записать финальную оплату</button>'
      : balance > 0
        ? '<button class="primary-button" type="submit" form="prepaymentForm">Записать предоплату</button>'
      : '<button class="primary-button" type="submit" form="paymentForm">Записать финальную оплату</button>';
  }
  return '<button class="primary-button" type="submit" form="proposalForm">Создать предложение</button>';
}

function renderSections(sections = []) {
  if (!sections.length) return '<span class="muted">Разделы не выбраны</span>';
  return sections.map((section) => `<span class="status-badge">${escapeHtml(humanize(section))}</span>`).join('');
}

function renderTask(task) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(humanize(task.type))} · ${escapeHtml(formatDate(task.dueAt))}</small>
      </span>
      <b>${escapeHtml(task.status || 'open')}</b>
    </div>
  `;
}

function renderProposal(proposal) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(formatMoney(proposal.amount))}</strong>
        <small>${escapeHtml(humanize(proposal.packageId))} · действует до ${escapeHtml(formatDate(proposal.validUntil))}</small>
      </span>
      <b>${escapeHtml(humanize(proposal.status))}</b>
    </div>
  `;
}

function renderPayment(payment) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(formatMoney(payment.amount))}</strong>
        <small>${escapeHtml(humanize(payment.method))} · ${escapeHtml(formatDate(payment.paidAt))}</small>
      </span>
      <b>${escapeHtml(humanize(payment.status))}</b>
    </div>
  `;
}

function paymentEditForm(payment, formId, title = 'Изменить оплату') {
  return `
    <form class="form-stack compact-edit-form" data-payment-update-form data-payment-id="${escapeHtml(payment.id)}" id="${escapeHtml(formId)}">
      <h3>${escapeHtml(title)}</h3>
      <div class="field-grid">
        <div class="field">
          <label for="${escapeHtml(formId)}Amount">Сумма, ₸</label>
          <input id="${escapeHtml(formId)}Amount" name="amount" type="number" min="0" step="10000" value="${escapeHtml(payment.amount || 0)}" required />
        </div>
        <div class="field">
          <label for="${escapeHtml(formId)}Method">Метод</label>
          <select id="${escapeHtml(formId)}Method" name="method">
            <option value="kaspi" ${payment.method === 'kaspi' ? 'selected' : ''}>Kaspi</option>
            <option value="bank_transfer" ${payment.method === 'bank_transfer' ? 'selected' : ''}>Банк</option>
            <option value="cash" ${payment.method === 'cash' ? 'selected' : ''}>Наличные</option>
          </select>
        </div>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="${escapeHtml(formId)}PaidAt">Дата оплаты</label>
          <input id="${escapeHtml(formId)}PaidAt" name="paidAt" type="datetime-local" value="${escapeHtml(inputDateTime(payment.paidAt))}" />
        </div>
        <div class="field">
          <label for="${escapeHtml(formId)}Note">Комментарий</label>
          <input id="${escapeHtml(formId)}Note" name="note" value="${escapeHtml(payment.note || '')}" />
        </div>
      </div>
      <button class="secondary-button" type="submit">Сохранить изменение</button>
    </form>
  `;
}

function userName(userId) {
  return dealUsers.find((user) => user.id === userId)?.name || 'Не назначен';
}

function renderUserOptions(users, selected = '', placeholder = 'Не назначен') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(users || []).map((user) => `
      <option value="${escapeHtml(user.id)}" ${user.id === selected ? 'selected' : ''}>
        ${escapeHtml(user.name)} · ${escapeHtml(humanize(user.role))}
      </option>
    `).join('')}
  `;
}

function roleUsers(roles) {
  return dealUsers.filter((user) => roles.includes(user.role) && user.status !== 'inactive');
}

function renderDealDetail(detail) {
  const { deal, lead, client, diagnostics, proposals, payments, implementationProject, tasks } = detail;
  const canCreateProposal = !proposals.length && !payments.length && !deal.clientId;
  const latestProposal = proposals[0];
  const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const balance = Math.max(Number(deal.amount || latestProposal?.amount || 0) - paidAmount, 0);
  const prepayment = payments.find((payment) => /предоплат/i.test(payment.note || ''))
    || (!implementationProject && payments[0] ? payments[0] : null);
  const finalPayments = prepayment ? payments.filter((payment) => payment.id !== prepayment.id) : payments;
  const hasPrepayment = Boolean(prepayment);
  const canRecordPrepayment = proposals.length && !hasPrepayment && !implementationProject;
  const canRecordPayment = proposals.length && !implementationProject;
  const managerUsers = roleUsers(['manager', 'sales_lead', 'supervisor', 'owner']);
  const implementationUsers = roleUsers(['developer', 'implementation', 'supervisor', 'owner']);
  const currentImplementationId = implementationProject?.responsibleId || deal.implementationResponsibleId || '';
  const stages = Object.values(dealMeta?.dealStages || {});
  const packages = Object.values(dealMeta?.packages || {});

  return `
    ${pageHeader({
      title: lead?.name || humanize(deal.niche),
      subtitle: 'Сделка после диагностики: этап, сумма, предложение, оплата и передача во внедрение.',
      primaryAction: primaryAction(detail),
    })}
    <div class="detail-layout">
      <section class="detail-main">
        <div class="panel detail-card">
          <div class="detail-card-head">
            <div>
              <p class="eyebrow">${escapeHtml(deal.direction === 'edutech' ? 'EduTech' : 'AutoTech')}</p>
              <h2>${escapeHtml(humanize(deal.niche))}</h2>
            </div>
            <span class="status-badge">${escapeHtml(humanize(deal.stage))}</span>
          </div>
          <div class="info-grid">
            <div class="info-item"><span>Сумма</span><strong>${escapeHtml(formatMoney(deal.amount))}</strong></div>
            <div class="info-item"><span>Пакет</span><strong>${escapeHtml(humanize(deal.packageId))}</strong></div>
            <div class="info-item"><span>Вероятность</span><strong>${escapeHtml(`${deal.probability || 0}%`)}</strong></div>
            <div class="info-item"><span>Следующий шаг</span><strong>${escapeHtml(formatDate(deal.nextActionAt))}</strong></div>
            <div class="info-item"><span>Город</span><strong>${escapeHtml(lead?.city || 'не указан')}</strong></div>
            <div class="info-item"><span>Контакт</span><strong>${escapeHtml(lead?.phone || 'не указан')}</strong></div>
          </div>
          <div class="pain-box">
            <span>Выбранные разделы</span>
            <div class="section-preview">${renderSections(deal.selectedSections)}</div>
          </div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Ответственные</h2>
          </div>
          <form class="form-stack" data-responsibles-form>
            <div class="field-grid">
              <div class="field">
                <label for="dealManager">Менеджер по сделке</label>
                <select id="dealManager" name="managerId">${renderUserOptions(managerUsers, deal.responsibleId)}</select>
              </div>
              <div class="field">
                <label for="dealImplementation">Программист / внедрение</label>
                <select id="dealImplementation" name="implementationId">${renderUserOptions(implementationUsers, currentImplementationId)}</select>
              </div>
            </div>
            <button class="secondary-button" type="submit">Сохранить ответственных</button>
            <p class="muted">Менеджер ведет продажу. Программист или специалист внедрения будет назначен на запуск после оплаты.</p>
          </form>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Этап сделки</h2>
          </div>
          <form class="inline-form deal-stage-form" data-stage-form>
            <select name="stage" required>
              ${renderOptions(stages, deal.stage)}
            </select>
            <input name="lostReason" placeholder="Причина отказа, если Lost" />
            <input name="nextActionAt" type="datetime-local" />
            <button class="secondary-button" type="submit">Обновить этап</button>
          </form>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Сумма сделки</h2>
          </div>
          <form class="inline-form two-columns" data-amount-form>
            <input name="amount" type="number" min="0" step="10000" value="${escapeHtml(deal.amount || 0)}" required />
            <input name="reason" placeholder="Причина изменения" required />
            <button class="secondary-button" type="submit">Сохранить сумму</button>
          </form>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Предложение</h2>
            <span>${proposals.length}</span>
          </div>
          ${canCreateProposal ? `
            <form class="form-stack" id="proposalForm" data-proposal-form>
              <div class="field-grid">
                <div class="field">
                  <label for="proposalAmount">Сумма КП, ₸</label>
                  <input id="proposalAmount" name="amount" type="number" min="0" step="10000" value="${escapeHtml(deal.amount || 0)}" required />
                </div>
                <div class="field">
                  <label for="proposalPackage">Пакет</label>
                  <select id="proposalPackage" name="packageId">${renderOptions(packages, deal.packageId)}</select>
                </div>
              </div>
              <div class="field">
                <label for="proposalSections">Разделы через запятую</label>
                <input id="proposalSections" name="sections" value="${escapeHtml((deal.selectedSections || []).join(', '))}" />
              </div>
            </form>
          ` : `
            <div class="detail-list">${proposals.length ? proposals.map(renderProposal).join('') : emptyState('Предложений нет', 'Предложение уже не создаётся после оплаты.')}</div>
            ${latestProposal ? `
              <form class="form-stack compact-edit-form" data-proposal-update-form data-proposal-id="${escapeHtml(latestProposal.id)}">
                <h3>Изменить предложение</h3>
                <div class="field-grid">
                  <div class="field">
                    <label for="proposalEditAmount">Сумма КП, ₸</label>
                    <input id="proposalEditAmount" name="amount" type="number" min="0" step="10000" value="${escapeHtml(latestProposal.amount || deal.amount || 0)}" required />
                  </div>
                  <div class="field">
                    <label for="proposalEditPackage">Пакет</label>
                    <select id="proposalEditPackage" name="packageId">${renderOptions(packages, latestProposal.packageId || deal.packageId)}</select>
                  </div>
                </div>
                <div class="field-grid">
                  <div class="field">
                    <label for="proposalEditValidUntil">Действует до</label>
                    <input id="proposalEditValidUntil" name="validUntil" type="datetime-local" value="${escapeHtml(inputDateTime(latestProposal.validUntil))}" />
                  </div>
                  <div class="field">
                    <label for="proposalEditStatus">Статус</label>
                    <select id="proposalEditStatus" name="status">
                      <option value="sent" ${latestProposal.status === 'sent' ? 'selected' : ''}>Отправлено</option>
                      <option value="accepted" ${latestProposal.status === 'accepted' ? 'selected' : ''}>Принято</option>
                      <option value="rejected" ${latestProposal.status === 'rejected' ? 'selected' : ''}>Отклонено</option>
                    </select>
                  </div>
                </div>
                <div class="field">
                  <label for="proposalEditSections">Разделы через запятую</label>
                  <input id="proposalEditSections" name="sections" value="${escapeHtml((latestProposal.sections || deal.selectedSections || []).join(', '))}" />
                </div>
                <button class="secondary-button" type="submit">Сохранить предложение</button>
              </form>
            ` : ''}
          `}
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Предоплата</h2>
            <span>${hasPrepayment ? 'получена' : 'нет'}</span>
          </div>
          ${canRecordPrepayment ? `
            <form class="form-stack" id="prepaymentForm" data-prepayment-form>
              <div class="field-grid">
                <div class="field">
                  <label for="prepaymentAmount">Сумма предоплаты, ₸</label>
                  <input id="prepaymentAmount" name="amount" type="number" min="0" step="10000" value="${escapeHtml(Math.ceil(Number(latestProposal?.amount || deal.amount || 0) * 0.5))}" required />
                </div>
                <div class="field">
                  <label for="prepaymentMethod">Метод</label>
                  <select id="prepaymentMethod" name="method">
                    <option value="kaspi">Kaspi</option>
                    <option value="bank_transfer">Банк</option>
                    <option value="cash">Наличные</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label for="prepaymentNote">Комментарий</label>
                <input id="prepaymentNote" name="note" value="Предоплата за внедрение" />
              </div>
            </form>
          ` : `
            <div class="detail-list">${hasPrepayment ? renderPayment(prepayment) : emptyState('Предоплаты нет', 'Предоплату записываем после согласования предложения.')}</div>
            ${hasPrepayment ? paymentEditForm(prepayment, 'prepaymentEditForm', 'Изменить предоплату') : ''}
          `}
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Финальная оплата</h2>
            <span>${finalPayments.length}</span>
          </div>
          ${canRecordPayment ? `
            <form class="form-stack" id="paymentForm" data-payment-form>
              <div class="field-grid">
                <div class="field">
                  <label for="paymentAmount">Остаток к оплате, ₸</label>
                  <input id="paymentAmount" name="amount" type="number" min="0" step="10000" value="${escapeHtml(balance || latestProposal?.amount || deal.amount || 0)}" required />
                </div>
                <div class="field">
                  <label for="paymentMethod">Метод</label>
                  <select id="paymentMethod" name="method">
                    <option value="kaspi">Kaspi</option>
                    <option value="bank_transfer">Банк</option>
                    <option value="cash">Наличные</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label for="paymentNote">Комментарий</label>
                <input id="paymentNote" name="note" placeholder="Например: остаток за запуск" />
              </div>
              <input type="hidden" name="implementationId" value="${escapeHtml(currentImplementationId)}" />
            </form>
          ` : `
            <div class="detail-list">${finalPayments.length ? finalPayments.map(renderPayment).join('') : emptyState('Финальной оплаты нет', 'Финальную оплату записываем после предоплаты или согласования.')}</div>
            ${finalPayments.length ? finalPayments.map((payment, index) => paymentEditForm(payment, `paymentEditForm${index}`, index === 0 ? 'Изменить финальную оплату' : `Изменить финальную оплату ${index + 1}`)).join('') : ''}
          `}
        </div>
      </section>

      <aside class="detail-side">
        <button class="secondary-button full-width" type="button" data-back-deals>Назад к сделкам</button>
        <button class="secondary-button full-width" type="button" data-open-lead>Открыть заявку</button>
        ${client ? `<button class="secondary-button full-width" type="button" data-open-client="${escapeHtml(client.id)}">Открыть клиента</button>` : ''}
        ${implementationProject ? '<button class="secondary-button full-width" type="button" data-open-implementation>Открыть внедрение</button>' : ''}
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Диагностика</h2>
            <span>${diagnostics.length}</span>
          </div>
          <div class="detail-list">
            ${diagnostics.length ? diagnostics.map((item) => `
              <div class="detail-list-row">
                <span>
                  <strong>${escapeHtml(item.summary || 'Диагностика')}</strong>
                  <small>${escapeHtml((item.problems || []).join(', ') || 'без проблем')}</small>
                </span>
              </div>
            `).join('') : emptyState('Нет диагностики', 'Сделка должна появляться после диагностики.')}
          </div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Задачи</h2>
            <span>${tasks.length}</span>
          </div>
          <div class="detail-list">
            ${tasks.length ? tasks.map(renderTask).join('') : emptyState('Задач нет', 'Задачи появятся после смены этапов и оплаты.')}
          </div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Ответственные</h2>
          </div>
          <div class="info-grid single-column">
            <div class="info-item"><span>Менеджер</span><strong>${escapeHtml(userName(deal.responsibleId))}</strong></div>
            <div class="info-item"><span>Программист / внедрение</span><strong>${escapeHtml(userName(currentImplementationId))}</strong></div>
          </div>
        </section>
      </aside>
    </div>
  `;
}

export function renderDealDetailScreen() {
  return `
    <div data-deal-detail-root>
      ${emptyState('Загружаем сделку', 'Получаем сделку, предложение, оплату и связанные задачи.')}
    </div>
  `;
}

export async function mountDealDetailScreen() {
  const root = document.querySelector('[data-deal-detail-root]');
  const dealId = routeParam(1);
  if (!root || !dealId) return;

  const loadDetail = async () => {
    root.innerHTML = emptyState('Загружаем сделку', 'Обновляем данные сделки.');
    const [metaResult, detailResult, usersResult] = await Promise.all([
      dealMeta ? Promise.resolve({ meta: dealMeta }) : get('/api/meta'),
      get(`/api/deals/${dealId}`),
      dealUsers.length ? Promise.resolve({ users: dealUsers }) : get('/api/team/assignment-options').catch(() => ({ users: [] })),
    ]);
    dealMeta = metaResult.meta;
    dealUsers = usersResult.users || [];
    root.innerHTML = renderDealDetail(detailResult.detail);
    bindDealDetail(root, dealId, detailResult.detail, loadDetail);
  };

  try {
    await loadDetail();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить сделку', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки сделки', 'error');
  }
}

function bindDealDetail(root, dealId, detail, reload) {
  root.querySelector('[data-back-deals]')?.addEventListener('click', () => navigate('deals'));
  root.querySelector('[data-open-lead]')?.addEventListener('click', () => navigate(`lead-detail/${detail.deal.leadId}`));
  root.querySelectorAll('[data-open-client]').forEach((button) => {
    button.addEventListener('click', () => navigate(`client-detail/${button.dataset.openClient}`));
  });
  root.querySelector('[data-open-implementation]')?.addEventListener('click', () => navigate(`implementation-detail/${detail.implementationProject.id}`));

  root.querySelector('[data-responsibles-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/deals/${dealId}/responsibles`, {
        managerId: String(data.get('managerId') || ''),
        implementationId: String(data.get('implementationId') || ''),
      });
      toast('Ответственные сохранены', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось сохранить ответственных', 'error');
    }
  });

  root.querySelector('[data-stage-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      stage: String(data.get('stage') || ''),
      nextActionAt: String(data.get('nextActionAt') || '') || undefined,
      lostReason: String(data.get('lostReason') || '').trim() || undefined,
    };
    try {
      await patch(`/api/deals/${dealId}/stage`, payload);
      toast('Этап обновлён', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось обновить этап', 'error');
    }
  });

  root.querySelector('[data-amount-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/deals/${dealId}/amount`, {
        amount: Number(data.get('amount') || 0),
        reason: String(data.get('reason') || '').trim(),
      });
      toast('Сумма обновлена', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось обновить сумму', 'error');
    }
  });

  root.querySelector('[data-proposal-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sections = String(data.get('sections') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      await post(`/api/deals/${dealId}/proposals`, {
        amount: Number(data.get('amount') || 0),
        packageId: String(data.get('packageId') || ''),
        sections,
      });
      toast('Предложение создано', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось создать предложение', 'error');
    }
  });

  root.querySelector('[data-proposal-update-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const sections = String(data.get('sections') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      await patch(`/api/deals/${dealId}/proposals/${form.dataset.proposalId}`, {
        amount: Number(data.get('amount') || 0),
        packageId: String(data.get('packageId') || ''),
        validUntil: String(data.get('validUntil') || '') || undefined,
        status: String(data.get('status') || 'sent'),
        sections,
      });
      toast('Предложение изменено', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось изменить предложение', 'error');
    }
  });

  root.querySelector('[data-prepayment-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/deals/${dealId}/prepayments`, {
        amount: Number(data.get('amount') || 0),
        method: String(data.get('method') || 'bank_transfer'),
        note: String(data.get('note') || '').trim() || 'Предоплата',
      });
      toast('Предоплата записана', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось записать предоплату', 'error');
    }
  });

  root.querySelectorAll('[data-payment-update-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        await patch(`/api/deals/${dealId}/payments/${form.dataset.paymentId}`, {
          amount: Number(data.get('amount') || 0),
          method: String(data.get('method') || 'bank_transfer'),
          paidAt: String(data.get('paidAt') || '') || undefined,
          note: String(data.get('note') || '').trim(),
        });
        toast('Оплата изменена', 'success');
        await reload();
      } catch (error) {
        toast(error.message || 'Не удалось изменить оплату', 'error');
      }
    });
  });

  root.querySelector('[data-payment-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/deals/${dealId}/payments`, {
        amount: Number(data.get('amount') || 0),
        method: String(data.get('method') || 'bank_transfer'),
        note: String(data.get('note') || '').trim() || undefined,
        implementationId: String(data.get('implementationId') || '') || undefined,
      });
      toast('Оплата записана, клиент передан во внедрение', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось записать оплату', 'error');
    }
  });
}
