import { get, post } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let leadsMeta = null;

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

function leadRow(lead) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(lead.name)}</strong>
        <small>${escapeHtml(lead.city || 'город не указан')}</small>
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

function renderLeadsTable(leads, meta) {
  if (!leads.length) {
    return emptyState('Заявок пока нет', 'Новые заявки появятся здесь после создания или подключения источников.');
  }

  return `
    <div class="table-panel">
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
      <div class="table-footer">
        <span>Показано ${leads.length} из ${meta.total}</span>
        <span>Страница ${meta.page} / ${meta.pages}</span>
      </div>
    </div>
  `;
}

function renderLeadModal() {
  return `
    <div class="modal-backdrop" data-lead-modal>
      <div class="modal-panel">
        <div class="modal-header">
          <h2>Создать лид</h2>
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
            <button class="primary-button" type="submit" data-save-lead>Создать лид</button>
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
      subtitle: 'Сырые входящие обращения. Лид становится сделкой только после диагностики.',
      primaryAction: '<button class="primary-button" type="button" data-open-lead-modal>Создать лид</button>',
    })}
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
  if (!root || !filters || !modal || !form) return;

  const statusSelect = filters.querySelector('[data-filter-status]');
  const directionFilter = filters.querySelector('[data-filter-direction]');
  const nicheFilter = filters.querySelector('[data-filter-niche]');
  const leadDirection = form.querySelector('[data-lead-direction]');
  const leadNiche = form.querySelector('[data-lead-niche]');
  const errorBox = form.querySelector('[data-lead-error]');

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

  const loadLeads = async () => {
    root.innerHTML = emptyState('Загружаем заявки', 'Обновляем список по выбранным фильтрам.');
    const data = new FormData(filters);
    const params = new URLSearchParams();
    ['q', 'status', 'direction', 'niche'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    params.set('sort', '-createdAt');
    params.set('limit', '25');

    const result = await get(`/api/leads?${params.toString()}`);
    root.innerHTML = renderLeadsTable(result.data, result.meta);
    root.querySelectorAll('[data-open-lead]').forEach((button) => {
      button.addEventListener('click', () => {
        navigate(`lead-detail/${button.dataset.openLead}`);
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
    await loadLeads().catch((error) => toast(error.message || 'Ошибка фильтрации заявок', 'error'));
  });

  filters.querySelector('[data-reset-lead-filters]').addEventListener('click', async () => {
    filters.reset();
    syncFilterNiches();
    await loadLeads().catch((error) => toast(error.message || 'Ошибка загрузки заявок', 'error'));
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
      toast('Лид создан', 'success');
      await loadLeads();
    } catch (error) {
      errorBox.textContent = error.message || 'Не удалось создать лид';
      errorBox.classList.remove('hidden');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Создать лид';
    }
  });
}
