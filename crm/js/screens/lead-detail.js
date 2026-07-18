import { del, get, post } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate, routeParam } from '../router.js';
import { emptyState, escapeHtml, journeyBar, pageHeader, toast } from '../ui.js';

function humanize(value) {
  return labelValue(value);
}

function formatDate(value) {
  if (!value) return 'Без даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function renderInfoItem(label, value) {
  return `
    <div class="info-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || 'не указано')}</strong>
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

function renderDeal(deal) {
  return `
    <div class="detail-list-row">
      <span>
        <strong>${escapeHtml(humanize(deal.stage))}</strong>
        <small>${escapeHtml(humanize(deal.packageId || ''))} · ${new Intl.NumberFormat('ru-RU').format(Number(deal.amount || 0))} ₸</small>
      </span>
      <button class="secondary-button compact-button" type="button" data-open-deals>К сделкам</button>
    </div>
  `;
}

function renderCommunication(item) {
  return `
    <div class="timeline-row">
      <div class="timeline-row-head">
        <strong>${escapeHtml(humanize(item.result))}</strong>
        <button class="text-button danger-text" type="button" data-delete-communication="${escapeHtml(item.id)}">Удалить</button>
      </div>
      <p>${escapeHtml(item.text || 'Без описания')}</p>
      <small>${escapeHtml(humanize(item.channel))} · ${escapeHtml(formatDate(item.happenedAt || item.createdAt))}</small>
    </div>
  `;
}

function renderNote(item) {
  return `
    <div class="timeline-row">
      <strong>${escapeHtml(humanize(item.type || 'note'))}</strong>
      <p>${escapeHtml(item.text)}</p>
      <small>${escapeHtml(formatDate(item.createdAt))}</small>
    </div>
  `;
}

function renderLeadDetail(detail) {
  const { lead, diagnostics, deals, tasks, communications, notes } = detail;
  const hasDiagnostics = diagnostics.length > 0;

  return `
    ${pageHeader({
      title: lead.name,
      subtitle: 'Карточка входящей заявки: контекст, контакт, задачи, коммуникации и подготовка к диагностике.',
      primaryAction: hasDiagnostics
        ? `<button class="secondary-button" type="button" data-open-deal="${escapeHtml(deals[0]?.id || '')}">Открыть сделку</button>`
        : '<button class="primary-button" type="button" data-start-diagnostics>Начать диагностику</button>',
    })}
    ${journeyBar(hasDiagnostics ? 1 : 0)}
    <div class="detail-layout">
      <section class="detail-main">
        <div class="panel detail-card">
          <div class="detail-card-head">
            <div>
              <p class="eyebrow">${escapeHtml(lead.direction === 'edutech' ? 'EduTech' : 'AutoTech')}</p>
              <h2>${escapeHtml(humanize(lead.niche))}</h2>
            </div>
            <span class="status-badge" data-status="${escapeHtml(lead.status)}">${escapeHtml(humanize(lead.status))}</span>
          </div>
          <div class="info-grid">
            ${renderInfoItem('Город', lead.city)}
            ${renderInfoItem('Телефон', lead.phone)}
            ${renderInfoItem('WhatsApp', lead.whatsapp)}
            ${renderInfoItem('ЛПР', lead.decisionMaker)}
            ${renderInfoItem('Источник', lead.source)}
            ${renderInfoItem('Текущий учет', lead.currentAccounting)}
          </div>
          <div class="pain-box">
            <span>Что болит</span>
            <p>${escapeHtml(lead.pain || 'Пока не описано. Уточните на первом касании или диагностике.')}</p>
          </div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Коммуникации</h2>
          </div>
          <form class="inline-form" data-communication-form>
            <select name="channel" required>
              <option value="call">Звонок</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="meeting">Встреча</option>
            </select>
            <select name="result" required>
              <option value="interested">Заинтересован</option>
              <option value="no_answer">Не ответил</option>
              <option value="meeting_set">Назначена встреча</option>
              <option value="proposal_sent">Отправлено предложение</option>
              <option value="return_later">Вернуться позже</option>
              <option value="rejected">Отказ</option>
            </select>
            <input name="text" placeholder="Краткий итог разговора" />
            <button class="secondary-button" type="submit">Добавить</button>
          </form>
          <div class="timeline-list">
            ${communications.length ? communications.map(renderCommunication).join('') : emptyState('Коммуникаций нет', 'Первое касание появится здесь после добавления.')}
          </div>
        </div>

        <div class="panel detail-section">
          <div class="detail-section-head">
            <h2>Заметки</h2>
          </div>
          <form class="inline-form two-columns" data-note-form>
            <select name="type">
              <option value="context">Контекст</option>
              <option value="pain">Боль</option>
              <option value="internal">Внутреннее</option>
            </select>
            <input name="text" placeholder="Например: владелец хочет запуск до понедельника" required />
            <button class="secondary-button" type="submit">Добавить</button>
          </form>
          <div class="timeline-list">
            ${notes.length ? notes.map(renderNote).join('') : emptyState('Заметок нет', 'Добавляйте только рабочий контекст по клиенту.')}
          </div>
        </div>
      </section>

      <aside class="detail-side">
        <button class="secondary-button full-width" type="button" data-back-leads>Назад к заявкам</button>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Задачи</h2>
            <span>${tasks.length}</span>
          </div>
          <div class="detail-list">
            ${tasks.length ? tasks.map(renderTask).join('') : emptyState('Задач нет', 'Задачи создаются автоматически и вручную.')}
          </div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Сделки</h2>
            <span>${deals.length}</span>
          </div>
          <div class="detail-list">
            ${deals.length ? deals.map(renderDeal).join('') : `
              ${emptyState('Сделки нет', 'Сначала проведите диагностику: после нее CRM сама создаст сделку и предложит следующий шаг.')}
              <button class="primary-button full-width" type="button" data-start-diagnostics>Провести диагностику и создать сделку</button>
            `}
          </div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Диагностика</h2>
            <span>${diagnostics.length}</span>
          </div>
          ${diagnostics.length
            ? `<div class="detail-list">${diagnostics.map((item) => `
              <div class="detail-list-row">
                <span>
                  <strong>${escapeHtml(item.summary || 'Диагностика создана')}</strong>
                  <small>${escapeHtml((item.recommendedSections || []).map(humanize).join(', '))}</small>
                </span>
              </div>
            `).join('')}</div>`
            : emptyState('Не проведена', 'Следующий экран будет отвечать за создание диагностики.')}
        </section>
      </aside>
    </div>
  `;
}

export function renderLeadDetailScreen() {
  return `
    <div data-lead-detail-root>
      ${emptyState('Загружаем лид', 'Получаем карточку заявки и связанные данные.')}
    </div>
  `;
}

export async function mountLeadDetailScreen() {
  const root = document.querySelector('[data-lead-detail-root]');
  const leadId = routeParam(1);
  if (!root || !leadId) return;

  const loadDetail = async () => {
    root.innerHTML = emptyState('Загружаем лид', 'Обновляем карточку заявки.');
    const result = await get(`/api/leads/${leadId}`);
    root.innerHTML = renderLeadDetail(result.detail);
    bindLeadDetail(root, leadId, result.detail, loadDetail);
  };

  try {
    await loadDetail();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить заявку', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки лида', 'error');
  }
}

function bindLeadDetail(root, leadId, detail, reload) {
  root.querySelector('[data-back-leads]')?.addEventListener('click', () => navigate('leads'));
  root.querySelectorAll('[data-open-deals]').forEach((button) => {
    button.addEventListener('click', () => navigate('deals'));
  });
  root.querySelector('[data-open-deal]')?.addEventListener('click', (event) => {
    const dealId = event.currentTarget.dataset.openDeal || detail.deals[0]?.id;
    navigate(dealId ? `deal-detail/${dealId}` : 'deals');
  });
  root.querySelectorAll('[data-start-diagnostics]').forEach((button) => {
    button.addEventListener('click', () => navigate(`diagnostics/${leadId}`));
  });

  root.querySelectorAll('[data-delete-communication]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Удалить эту коммуникацию из карточки заявки?')) return;
      try {
        await del(`/api/communications/${button.dataset.deleteCommunication}`);
        toast('Коммуникация удалена', 'success');
        await reload();
      } catch (error) {
        toast(error.message || 'Не удалось удалить коммуникацию', 'error');
      }
    });
  });

  root.querySelector('[data-communication-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.leadId = leadId;
    try {
      await post('/api/communications', payload);
      toast('Коммуникация добавлена', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось добавить коммуникацию', 'error');
    }
  });

  root.querySelector('[data-note-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.entityType = 'lead';
    payload.entityId = leadId;
    try {
      await post('/api/notes', payload);
      toast('Заметка добавлена', 'success');
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось добавить заметку', 'error');
    }
  });
}
