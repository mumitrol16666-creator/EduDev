import { get, post } from '../api.js';
import { labelValue } from '../labels.js';
import { navigate, routeParam } from '../router.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

const problemSets = {
  autotech: [
    'склад не сходится',
    'клиенты не возвращаются',
    'нет отчета по прибыли',
    'заказы ведутся в тетради',
    'скидки и касса без контроля',
  ],
  edutech: [
    'расписание преподавателей',
    'оплаты и долги родителей',
    'пробные уроки теряются',
    'посещаемость ведется вручную',
    'нет отчета по преподавателям',
  ],
};

const packages = [
  ['start', 'Start'],
  ['business', 'Business'],
  ['pro', 'Pro'],
  ['network', 'Network'],
];

function humanize(value) {
  return labelValue(value);
}

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function previewSections(direction, niche, problems) {
  const text = problems.join(' ').toLowerCase();
  const sections = [direction === 'edutech' ? 'students_parents_programs' : 'clients_cars_orders'];

  if (direction === 'edutech') {
    if (text.includes('распис') || text.includes('преподав')) sections.push('schedule_teachers_rooms');
    if (text.includes('оплат') || text.includes('долг') || text.includes('абонем')) sections.push('payments_subscriptions_debts');
    if (text.includes('посещ') || text.includes('пропуск')) sections.push('attendance_progress');
    if (text.includes('заяв') || text.includes('пробн')) sections.push('trial_lessons_pipeline');
  } else {
    if (text.includes('склад')) sections.push('warehouse');
    if (text.includes('клиент') || text.includes('возврат')) sections.push('reminders');
  }

  if (text.includes('деньги') || text.includes('прибыль') || text.includes('отчет')) sections.push('analytics');
  sections.push(`niche_${niche}`);
  return [...new Set(sections)];
}

function renderProblemChecklist(direction) {
  return (problemSets[direction] || problemSets.autotech).map((problem, index) => `
    <label class="check-row">
      <input type="checkbox" name="problems" value="${escapeHtml(problem)}" ${index < 2 ? 'checked' : ''} />
      <span>${escapeHtml(problem)}</span>
    </label>
  `).join('');
}

function renderSectionPreview(sections) {
  return sections.map((section) => `<span class="status-badge">${escapeHtml(humanize(section))}</span>`).join('');
}

function renderDiagnosticsRow(item) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(humanize(item.niche))}</strong>
        <small>${escapeHtml(item.leadId)}</small>
      </td>
      <td>${escapeHtml((item.problems || []).join(', ') || 'не указано')}</td>
      <td>${renderSectionPreview(item.recommendedSections || [])}</td>
      <td>${escapeHtml(new Date(item.createdAt).toLocaleString('ru-RU'))}</td>
    </tr>
  `;
}

function renderDiagnosticsList(items, meta) {
  if (!items.length) {
    return emptyState('Диагностик пока нет', 'Диагностика создаётся из карточки лида, чтобы сразу связать её со сделкой.');
  }

  return `
    <div class="table-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Ниша</th>
            <th>Проблемы</th>
            <th>Рекомендованные разделы</th>
            <th>Создано</th>
          </tr>
        </thead>
        <tbody>${items.map(renderDiagnosticsRow).join('')}</tbody>
      </table>
      <div class="table-footer">
        <span>Показано ${items.length} из ${meta.total}</span>
        <span>Страница ${meta.page} / ${meta.pages}</span>
      </div>
    </div>
  `;
}

function renderDiagnosticsForm(detail) {
  const { lead, diagnostics, deals } = detail;
  const hasDiagnostics = diagnostics.length > 0 || deals.length > 0;
  const defaultProblems = problemSets[lead.direction] || problemSets.autotech;
  const initialSections = previewSections(lead.direction, lead.niche, defaultProblems.slice(0, 2));

  return `
    ${pageHeader({
      title: `Диагностика: ${lead.name}`,
      subtitle: 'Фиксируем проблемы, сумму и стартовый пакет. После сохранения система создаст сделку и задачу на презентацию.',
      primaryAction: hasDiagnostics
        ? '<button class="secondary-button" type="button" data-open-deals>Открыть сделку</button>'
        : '<button class="primary-button" type="submit" form="diagnosticsForm">Создать сделку</button>',
    })}
    <div class="diagnostics-layout">
      <form class="panel diagnostics-form" id="diagnosticsForm" data-diagnostics-form>
        <div class="detail-card-head">
          <div>
            <p class="eyebrow">${escapeHtml(lead.direction === 'edutech' ? 'EduTech' : 'AutoTech')}</p>
            <h2>${escapeHtml(humanize(lead.niche))}</h2>
          </div>
          <span class="status-badge">${escapeHtml(humanize(lead.status))}</span>
        </div>
        ${hasDiagnostics ? `
          <div class="form-error">Диагностика по этому лиду уже создана. Новую сделку с этой формы не создаём, чтобы не было дублей.</div>
        ` : ''}
        <div class="diagnostics-section">
          <h3>Что болит</h3>
          <div class="check-grid" data-problem-list>
            ${renderProblemChecklist(lead.direction)}
          </div>
        </div>
        <div class="field-grid">
          <div class="field">
            <label for="estimatedAmount">Оценка сделки, ₸</label>
            <input id="estimatedAmount" name="estimatedAmount" type="number" min="0" step="10000" value="${lead.direction === 'edutech' ? '250000' : '300000'}" ${hasDiagnostics ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label for="packageId">Пакет</label>
            <select id="packageId" name="packageId" ${hasDiagnostics ? 'disabled' : ''}>
              ${packages.map(([value, label]) => `<option value="${value}" ${value === 'business' ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="currentTools">Как ведут учет сейчас</label>
          <input id="currentTools" name="currentTools" value="${escapeHtml(lead.currentAccounting || '')}" ${hasDiagnostics ? 'disabled' : ''} />
        </div>
        <div class="field">
          <label for="summary">Краткий вывод диагностики</label>
          <textarea id="summary" name="summary" rows="4" ${hasDiagnostics ? 'disabled' : ''} placeholder="Например: сначала закрываем заявки, расписание, оплаты и долги">${escapeHtml(lead.pain || '')}</textarea>
        </div>
      </form>
      <aside class="detail-side">
        <button class="secondary-button full-width" type="button" data-back-lead>Назад к лиду</button>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Клиент</h2>
          </div>
          <div class="info-grid single">
            <div class="info-item"><span>Город</span><strong>${escapeHtml(lead.city)}</strong></div>
            <div class="info-item"><span>Телефон</span><strong>${escapeHtml(lead.phone)}</strong></div>
            <div class="info-item"><span>Боль</span><strong>${escapeHtml(lead.pain || 'не указано')}</strong></div>
          </div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Рекомендуемые разделы</h2>
          </div>
          <div class="section-preview" data-section-preview>
            ${renderSectionPreview(initialSections)}
          </div>
        </section>
        <section class="panel detail-section">
          <div class="detail-section-head">
            <h2>Сумма</h2>
          </div>
          <div class="money-preview" data-money-preview>${formatMoney(lead.direction === 'edutech' ? 250000 : 300000)} ₸</div>
        </section>
      </aside>
    </div>
  `;
}

export function renderDiagnosticsScreen() {
  return `
    <div data-diagnostics-root>
      ${emptyState('Загружаем диагностику', 'Получаем данные по заявке.')}
    </div>
  `;
}

export async function mountDiagnosticsScreen() {
  const root = document.querySelector('[data-diagnostics-root]');
  if (!root) return;

  const leadId = routeParam(1);
  try {
    if (leadId) {
      const result = await get(`/api/leads/${leadId}`);
      root.innerHTML = renderDiagnosticsForm(result.detail);
      bindDiagnosticsForm(root, result.detail);
      return;
    }

    const result = await get('/api/diagnostics?sort=-createdAt&limit=25');
    root.innerHTML = `
      ${pageHeader({
        title: 'Диагностика',
        subtitle: 'История проведённых диагностик. Новая диагностика создаётся только из карточки лида.',
      })}
      ${renderDiagnosticsList(result.data, result.meta)}
    `;
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить диагностику', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка диагностики', 'error');
  }
}

function bindDiagnosticsForm(root, detail) {
  const { lead, diagnostics, deals } = detail;
  const hasDiagnostics = diagnostics.length > 0 || deals.length > 0;
  const form = root.querySelector('[data-diagnostics-form]');
  const preview = root.querySelector('[data-section-preview]');
  const moneyPreview = root.querySelector('[data-money-preview]');
  if (!form) return;

  root.querySelector('[data-back-lead]')?.addEventListener('click', () => navigate(`lead-detail/${lead.id}`));
  root.querySelector('[data-open-deals]')?.addEventListener('click', () => navigate('deals'));

  const selectedProblems = () => [...form.querySelectorAll('input[name="problems"]:checked')].map((item) => item.value);
  const updatePreview = () => {
    preview.innerHTML = renderSectionPreview(previewSections(lead.direction, lead.niche, selectedProblems()));
    const amount = Number(form.elements.estimatedAmount?.value || 0);
    moneyPreview.textContent = `${formatMoney(amount)} ₸`;
  };

  form.querySelectorAll('input[name="problems"]').forEach((input) => {
    input.disabled = hasDiagnostics;
    input.addEventListener('change', updatePreview);
  });
  form.elements.estimatedAmount?.addEventListener('input', updatePreview);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (hasDiagnostics) return;
    const submit = document.querySelector('button[form="diagnosticsForm"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Создаём...';
    }

    const data = new FormData(form);
    const payload = {
      problems: selectedProblems(),
      estimatedAmount: Number(data.get('estimatedAmount') || 0),
      packageId: String(data.get('packageId') || 'business'),
      summary: String(data.get('summary') || '').trim(),
      answers: {
        currentTools: String(data.get('currentTools') || '').trim(),
      },
    };

    try {
      const result = await post(`/api/leads/${lead.id}/diagnostics`, payload);
      toast('Диагностика создана, сделка открыта', 'success');
      navigate(`lead-detail/${lead.id}`);
      window.setTimeout(() => toast(`Сделка: ${result.deal.stage}`, 'success'), 120);
    } catch (error) {
      toast(error.message || 'Не удалось создать диагностику', 'error');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Создать сделку';
      }
    }
  });
}
