import { get, post } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let leadsMeta = null;
const PAGE_SIZE = 50;

function humanize(value) {
  return labelValue(value);
}

function directionLabel(value) {
  return {
    autotech: 'AutoTech',
    edutech: 'EduTech',
  }[value] || humanize(value);
}

function nicheOptions(direction) {
  if (!leadsMeta) return [];
  return direction === 'edutech' ? leadsMeta.edutechNiches : leadsMeta.autotechNiches;
}

function renderOptions(items, selected = '', placeholder = 'Все') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(items || []).map((item) => `
      <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
    `).join('')}
  `;
}

function isActiveLead(lead) {
  return !['won', 'lost'].includes(lead.status);
}

function isNewLead(lead) {
  return ['new', 'contact_check'].includes(lead.status);
}

function isNoResponsible(lead) {
  return !lead.responsibleId;
}

function isInDiagnostics(lead) {
  return ['diagnostics', 'meeting'].includes(lead.status);
}

function isStaleLead(lead) {
  if (!isActiveLead(lead)) return false;
  const updated = new Date(lead.updatedAt || lead.createdAt);
  if (Number.isNaN(updated.getTime())) return false;
  return Date.now() - updated.getTime() >= 1000 * 60 * 60 * 24 * 2;
}

function leadQueues(leads) {
  return {
    new: leads.filter(isNewLead),
    stale: leads.filter(isStaleLead),
    noResponsible: leads.filter(isNoResponsible),
    diagnostics: leads.filter(isInDiagnostics),
    active: leads.filter(isActiveLead),
  };
}

function leadRiskClass(lead) {
  if (isStaleLead(lead)) return 'row-danger';
  if (isNoResponsible(lead)) return 'row-warning';
  return '';
}

function formatShortDate(value) {
  if (!value) return 'нет даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function leadRow(lead) {
  return `
    <tr class="${leadRiskClass(lead)}">
      <td>
        <strong>${escapeHtml(lead.name)}</strong>
        <small>${escapeHtml(lead.city || 'город не указан')} · обновлено ${escapeHtml(formatShortDate(lead.updatedAt || lead.createdAt))}</small>
      </td>
      <td>
        <span class="status-badge">${escapeHtml(directionLabel(lead.direction))}</span>
        <small>${escapeHtml(humanize(lead.niche))}</small>
      </td>
      <td>
        <strong>${escapeHtml(lead.phone)}</strong>
        <small>${escapeHtml(lead.whatsapp || lead.phone || '')}</small>
      </td>
      <td>
        <span class="status-badge">${escapeHtml(humanize(lead.status))}</span>
      </td>
      <td>
        <span>${escapeHtml(lead.pain || 'не указано')}</span>
      </td>
      <td>
        <button class="secondary-button compact-button" type="button" data-open-lead="${escapeHtml(lead.id)}">Открыть</button>
      </td>
    </tr>
  `;
}

function renderLeadQueueCard(key, title, subtitle, queue, tone = '') {
  const leads = queue?.sample || [];
  const count = Number(queue?.count || 0);
  return `
    <section class="lead-queue-card ${tone}">
      <div class="lead-queue-head">
        <span>${escapeHtml(title)}</span>
        <strong>${count}</strong>
      </div>
      <p>${escapeHtml(subtitle)}</p>
      <div class="lead-queue-list">
        ${leads.slice(0, 5).map((lead) => `
          <button type="button" data-open-lead="${escapeHtml(lead.id)}">
            <span>
              <strong>${escapeHtml(lead.name)}</strong>
              <small>${escapeHtml(humanize(lead.status))} · ${escapeHtml(lead.city || 'город не указан')}</small>
            </span>
          </button>
        `).join('') || '<span class="muted">Пусто</span>'}
      </div>
      ${count > leads.length ? `<button class="text-button lead-queue-open" type="button" data-queue-filter="${escapeHtml(key)}">Показать все</button>` : ''}
    </section>
  `;
}

function renderLeadQueues(queuePayload, fallbackLeads = []) {
  const fallback = leadQueues(fallbackLeads);
  const queues = queuePayload || {
    new: { count: fallback.new.length, sample: fallback.new.slice(0, 5) },
    stale: { count: fallback.stale.length, sample: fallback.stale.slice(0, 5) },
    noResponsible: { count: fallback.noResponsible.length, sample: fallback.noResponsible.slice(0, 5) },
    diagnostics: { count: fallback.diagnostics.length, sample: fallback.diagnostics.slice(0, 5) },
    active: { count: fallback.active.length, sample: fallback.active.slice(0, 5) },
  };
  return `
    <section class="lead-queue-grid">
      ${renderLeadQueueCard('new', 'Новые', 'Ждут первого нормального контакта.', queues.new, queues.new.count ? 'success' : '')}
      ${renderLeadQueueCard('stale', 'Зависли', 'Не обновлялись 2 дня и больше.', queues.stale, queues.stale.count ? 'danger' : '')}
      ${renderLeadQueueCard('no_responsible', 'Без ответственного', 'Нужно назначить менеджера.', queues.noResponsible, queues.noResponsible.count ? 'warning' : '')}
      ${renderLeadQueueCard('diagnostics', 'Диагностика', 'Нужно довести до сделки.', queues.diagnostics)}
      ${renderLeadQueueCard('active', 'Активные', 'Все заявки в работе без выигранных и отказов.', queues.active)}
    </section>
  `;
}

function renderLeadsTable(leads, meta, queuePayload) {
  return `
    ${renderLeadQueues(queuePayload, leads)}
    <div class="table-panel">
      ${leads.length ? `
        <table class="data-table leads-table">
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Профиль</th>
              <th>Контакт</th>
              <th>Статус</th>
              <th>Боль</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            ${leads.map(leadRow).join('')}
          </tbody>
        </table>
      ` : emptyState('Заявок в этой выборке нет', 'Попробуйте другой фильтр или очередь.')}
      <div class="table-footer paged-footer">
        <span>Показано ${leads.length} из ${meta.total}</span>
        <div class="pager-actions">
          <button class="secondary-button compact-button" type="button" data-leads-page="prev" ${meta.page <= 1 ? 'disabled' : ''}>Назад</button>
          <span>Страница ${meta.page} / ${meta.pages}</span>
          <button class="secondary-button compact-button" type="button" data-leads-page="next" ${meta.page >= meta.pages ? 'disabled' : ''}>Вперед</button>
        </div>
      </div>
    </div>
  `;
}

function renderPhoneSearchResults(result) {
  const leads = result?.leads || [];
  const clients = result?.clients || [];
  const total = leads.length + clients.length;
  return `
    <section class="phone-search-results ${total ? 'open' : ''}" data-phone-search-results>
      ${total ? `
        <div class="phone-search-head">
          <strong>Найдено по номеру: ${total}</strong>
          <span>${escapeHtml(result.query || '')}</span>
        </div>
        <div class="phone-search-grid">
          ${leads.map((lead) => `
            <button type="button" data-open-lead="${escapeHtml(lead.id)}">
              <span>Заявка</span>
              <strong>${escapeHtml(lead.name)}</strong>
              <small>${escapeHtml(lead.phone || lead.whatsapp || '')} · ${escapeHtml(humanize(lead.status))}</small>
            </button>
          `).join('')}
          ${clients.map((client) => `
            <button type="button" data-open-client="${escapeHtml(client.id)}">
              <span>Клиент</span>
              <strong>${escapeHtml(client.name)}</strong>
              <small>${escapeHtml(client.phone || '')} · ${escapeHtml(humanize(client.status))}</small>
            </button>
          `).join('')}
        </div>
      ` : emptyState('По номеру ничего не найдено', 'Проверьте цифры или создайте новую заявку.')}
    </section>
  `;
}

function renderLeadModal() {
  return `
    <div class="modal-backdrop" data-lead-modal>
      <div class="modal-panel">
        <div class="modal-header">
          <h2>Создать заявку</h2>
        </div>
        <form data-lead-form>
          <div class="modal-body">
            <div class="form-stack">
              <div class="field">
                <label for="leadName">Название клиента</label>
                <input id="leadName" name="name" required placeholder="Например: Maestro Music School" />
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="leadDirection">Профиль</label>
                  <select id="leadDirection" name="direction" required data-lead-direction>
                    <option value="autotech">AutoTech</option>
                    <option value="edutech">EduTech</option>
                  </select>
                </div>
                <div class="field">
                  <label for="leadNiche">Ниша</label>
                  <select id="leadNiche" name="niche" required data-lead-niche></select>
                </div>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="leadCity">Город</label>
                  <input id="leadCity" name="city" required value="Актобе" />
                </div>
                <div class="field">
                  <label for="leadPhone">Телефон</label>
                  <input id="leadPhone" name="phone" required placeholder="+77000000000" />
                </div>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="leadWhatsapp">WhatsApp</label>
                  <input id="leadWhatsapp" name="whatsapp" placeholder="+77000000000" />
                </div>
                <div class="field">
                  <label for="leadSource">Источник</label>
                  <input id="leadSource" name="source" value="manual" />
                </div>
              </div>
              <div class="field">
                <label for="leadDecisionMaker">ЛПР</label>
                <input id="leadDecisionMaker" name="decisionMaker" placeholder="Имя владельца или управляющего" />
              </div>
              <div class="field">
                <label for="leadAccounting">Как ведут учет сейчас</label>
                <input id="leadAccounting" name="currentAccounting" placeholder="Excel, тетрадь, WhatsApp" />
              </div>
              <div class="field">
                <label for="leadPain">Что болит</label>
                <textarea id="leadPain" name="pain" rows="3" placeholder="Расписание, склад, оплаты, долги, повторные клиенты"></textarea>
              </div>
              <div class="form-error hidden" data-lead-error></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-lead-modal>Отмена</button>
            <button class="primary-button" type="submit" data-save-lead>Создать заявку</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderLeadsScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Заявки',
      subtitle: 'Рабочие очереди входящих обращений. Заявка становится сделкой только после диагностики.',
      primaryAction: '<button class="primary-button" type="button" data-open-lead-modal>Создать заявку</button>',
    })}
    <form class="phone-search-bar" data-phone-search-form>
      <div class="field">
        <label for="leadPhoneSearch">Быстрый поиск по номеру</label>
        <input id="leadPhoneSearch" name="phone" inputmode="tel" placeholder="+77000000000" />
      </div>
      <button class="secondary-button" type="submit">Найти</button>
      <button class="secondary-button" type="button" data-clear-phone-search>Очистить</button>
    </form>
    <div data-phone-search-host></div>
    <form class="filter-bar" data-leads-filters>
      <div class="field">
        <label for="leadSearch">Поиск</label>
        <input id="leadSearch" name="q" placeholder="Компания, город, телефон" />
      </div>
      <div class="field">
        <label for="leadFilterStatus">Статус</label>
        <select id="leadFilterStatus" name="status" data-filter-status></select>
      </div>
      <div class="field">
        <label for="leadFilterDirection">Профиль</label>
        <select id="leadFilterDirection" name="direction" data-filter-direction>
          <option value="">Все</option>
          <option value="autotech">AutoTech</option>
          <option value="edutech">EduTech</option>
        </select>
      </div>
      <div class="field">
        <label for="leadFilterNiche">Ниша</label>
        <select id="leadFilterNiche" name="niche" data-filter-niche>
          <option value="">Все</option>
        </select>
      </div>
      <div class="field">
        <label for="leadFilterQueue">Очередь</label>
        <select id="leadFilterQueue" name="queue" data-filter-queue>
          <option value="">Все заявки</option>
          <option value="new">Новые</option>
          <option value="stale">Зависли</option>
          <option value="no_responsible">Без ответственного</option>
          <option value="diagnostics">Диагностика</option>
          <option value="active">Активные</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="secondary-button" type="submit">Показать</button>
        <button class="secondary-button" type="button" data-reset-lead-filters>Сбросить</button>
      </div>
    </form>
    <div data-leads-root>
      ${emptyState('Загружаем заявки', 'Получаем список заявок.')}
    </div>
    ${renderLeadModal()}
  `;
}

export async function mountLeadsScreen() {
  const root = document.querySelector('[data-leads-root]');
  const filters = document.querySelector('[data-leads-filters]');
  const modal = document.querySelector('[data-lead-modal]');
  const form = document.querySelector('[data-lead-form]');
  const phoneSearchForm = document.querySelector('[data-phone-search-form]');
  const phoneSearchHost = document.querySelector('[data-phone-search-host]');
  if (!root || !filters || !modal || !form) return;

  const statusSelect = filters.querySelector('[data-filter-status]');
  const directionFilter = filters.querySelector('[data-filter-direction]');
  const nicheFilter = filters.querySelector('[data-filter-niche]');
  const leadDirection = form.querySelector('[data-lead-direction]');
  const leadNiche = form.querySelector('[data-lead-niche]');
  const errorBox = form.querySelector('[data-lead-error]');
  let currentPage = 1;

  const setModalOpen = (open) => {
    modal.classList.toggle('open', open);
    if (open) {
      errorBox.classList.add('hidden');
      form.reset();
      leadDirection.value = 'autotech';
      syncCreateNiches();
    }
  };

  const syncCreateNiches = () => {
    leadNiche.innerHTML = renderOptions(nicheOptions(leadDirection.value), '', 'Выберите нишу');
  };

  const syncFilterNiches = () => {
    const direction = directionFilter.value;
    const items = direction ? nicheOptions(direction) : [
      ...(leadsMeta?.autotechNiches || []),
      ...(leadsMeta?.edutechNiches || []),
    ];
    nicheFilter.innerHTML = renderOptions(items);
  };

  const buildBaseParams = (data) => {
    const params = new URLSearchParams();
    ['q', 'status', 'direction', 'niche', 'queue'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    return params;
  };

  const loadLeads = async (page = currentPage) => {
    currentPage = page;
    root.innerHTML = emptyState('Загружаем заявки', 'Обновляем список по выбранным фильтрам.');
    const data = new FormData(filters);
    const params = buildBaseParams(data);
    params.set('sort', '-createdAt');
    params.set('limit', String(PAGE_SIZE));
    params.set('page', String(currentPage));

    const queueParams = buildBaseParams(data);
    queueParams.delete('queue');
    const [result, queueResult] = await Promise.all([
      get(`/api/leads?${params.toString()}`),
      get(`/api/leads/work-queues?${queueParams.toString()}`).catch(() => ({ queues: null })),
    ]);
    root.innerHTML = renderLeadsTable(result.data, result.meta, queueResult.queues);
    root.querySelectorAll('[data-open-lead]').forEach((button) => {
      button.addEventListener('click', () => {
        navigate(`lead-detail/${button.dataset.openLead}`);
      });
    });
    root.querySelectorAll('[data-open-client]').forEach((button) => {
      button.addEventListener('click', () => {
        navigate(`client-detail/${button.dataset.openClient}`);
      });
    });
    root.querySelectorAll('[data-queue-filter]').forEach((button) => {
      button.addEventListener('click', async () => {
        filters.elements.queue.value = button.dataset.queueFilter;
        await loadLeads(1).catch((error) => toast(error.message || 'Ошибка загрузки очереди', 'error'));
      });
    });
    root.querySelectorAll('[data-leads-page]').forEach((button) => {
      button.addEventListener('click', async () => {
        const nextPage = button.dataset.leadsPage === 'next' ? currentPage + 1 : currentPage - 1;
        await loadLeads(nextPage).catch((error) => toast(error.message || 'Ошибка загрузки страницы', 'error'));
      });
    });
  };

  try {
    const metaResult = await get('/api/meta');
    leadsMeta = metaResult.meta;
    statusSelect.innerHTML = renderOptions(Object.values(leadsMeta.leadStatuses || {}));
    syncFilterNiches();
    syncCreateNiches();
    await loadLeads();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить заявки', error.message || 'Проверьте подключение и сессию.');
    toast(error.message || 'Ошибка загрузки заявок', 'error');
  }

  filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadLeads(1).catch((error) => toast(error.message || 'Ошибка фильтрации заявок', 'error'));
  });

  filters.querySelector('[data-reset-lead-filters]').addEventListener('click', async () => {
    filters.reset();
    syncFilterNiches();
    await loadLeads(1).catch((error) => toast(error.message || 'Ошибка загрузки заявок', 'error'));
  });

  phoneSearchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(phoneSearchForm);
    const phone = String(data.get('phone') || '').trim();
    if (!phone) {
      toast('Введите номер для поиска', 'error');
      return;
    }
    try {
      const result = await get(`/api/search/phone?phone=${encodeURIComponent(phone)}`);
      phoneSearchHost.innerHTML = renderPhoneSearchResults(result.result);
      phoneSearchHost.querySelectorAll('[data-open-lead]').forEach((button) => {
        button.addEventListener('click', () => navigate(`lead-detail/${button.dataset.openLead}`));
      });
      phoneSearchHost.querySelectorAll('[data-open-client]').forEach((button) => {
        button.addEventListener('click', () => navigate(`client-detail/${button.dataset.openClient}`));
      });
    } catch (error) {
      toast(error.message || 'Не удалось найти по номеру', 'error');
    }
  });

  document.querySelector('[data-clear-phone-search]')?.addEventListener('click', () => {
    phoneSearchForm.reset();
    phoneSearchHost.innerHTML = '';
  });

  directionFilter.addEventListener('change', () => {
    syncFilterNiches();
  });

  leadDirection.addEventListener('change', syncCreateNiches);

  document.querySelector('[data-open-lead-modal]').addEventListener('click', () => setModalOpen(true));
  modal.querySelector('[data-close-lead-modal]').addEventListener('click', () => setModalOpen(false));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) setModalOpen(false);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    const submit = form.querySelector('[data-save-lead]');
    submit.disabled = true;
    submit.textContent = 'Создаем...';

    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());
    Object.keys(payload).forEach((key) => {
      if (payload[key] === '') delete payload[key];
    });

    try {
      await post('/api/leads', payload);
      setModalOpen(false);
      toast('Заявка создана', 'success');
      await loadLeads();
    } catch (error) {
      errorBox.textContent = error.message || 'Не удалось создать заявку';
      errorBox.classList.remove('hidden');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Создать заявку';
    }
  });
}
