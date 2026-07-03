import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate, routeParam } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let dealMeta = null;

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

function renderOptions(items, selected = '') {
  return (items || []).map((item) => `
    <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
  `).join('');
}

function primaryAction(detail) {
  const { deal, client, proposals, payments } = detail;
  if ((payments.length || deal.clientId) && client) {
    return `<button class="secondary-button" type="button" data-open-client="${escapeHtml(client.id)}">Открыть клиента</button>`;
  }
  if (proposals.length) {
    return '<button class="primary-button" type="submit" form="paymentForm">Записать оплату</button>';
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

function renderDealDetail(detail) {
  const { deal, lead, client, diagnostics, proposals, payments, implementationProject, tasks } = detail;
  const canCreateProposal = !proposals.length && !payments.length && !deal.clientId;
  const canRecordPayment = proposals.length && !payments.length && !deal.clientId;
  const stages = Object.values(dealMeta?.dealStages || {});
  const packages = Object.values(dealMeta?.packages || {});
  const latestProposal = proposals[0];

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
          `}
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Оплата</h2>
            <span>${payments.length}</span>
          </div>
          ${canRecordPayment ? `
            <form class="form-stack" id="paymentForm" data-payment-form>
              <div class="field-grid">
                <div class="field">
                  <label for="paymentAmount">Сумма оплаты, ₸</label>
                  <input id="paymentAmount" name="amount" type="number" min="0" step="10000" value="${escapeHtml(latestProposal?.amount || deal.amount || 0)}" required />
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
                <input id="paymentNote" name="note" placeholder="Например: предоплата за внедрение" />
              </div>
            </form>
          ` : `
            <div class="detail-list">${payments.length ? payments.map(renderPayment).join('') : emptyState('Оплаты нет', 'Оплату записываем после отправки предложения.')}</div>
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
    const [metaResult, detailResult] = await Promise.all([
      dealMeta ? Promise.resolve({ meta: dealMeta }) : get('/api/meta'),
      get(`/api/deals/${dealId}`),
    ]);
    dealMeta = metaResult.meta;
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

  root.querySelector('[data-payment-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post(`/api/deals/${dealId}/payments`, {
        amount: Number(data.get('amount') || 0),
        method: String(data.get('method') || 'bank_transfer'),
        note: String(data.get('note') || '').trim() || undefined,
      });
      toast('Оплата записана, клиент передан во внедрение', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось записать оплату', 'error');
    }
  });
}
