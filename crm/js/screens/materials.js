import { get } from '../api.js';
import { labelValue } from '../labels.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let materialsMeta = null;
let activeMaterialId = null;

function humanize(value) {
  return labelValue(value);
}

function directionLabel(value) {
  return {
    autotech: 'AutoTech',
    edutech: 'EduTech',
  }[value] || humanize(value);
}

function formatDate(value) {
  if (!value) return 'Нет даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function renderOptions(items, selected = '', placeholder = 'Все') {
  return `
    <option value="">${escapeHtml(placeholder)}</option>
    ${(items || []).map((item) => `
      <option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(humanize(item))}</option>
    `).join('')}
  `;
}

function materialButton(material, active) {
  return `
    <button class="material-list-item ${active ? 'active' : ''}" type="button" data-open-material="${escapeHtml(material.id)}">
      <span>
        <strong>${escapeHtml(material.title)}</strong>
        <small>${escapeHtml(directionLabel(material.direction))} · ${escapeHtml(humanize(material.niche))}</small>
      </span>
      <b>${escapeHtml(humanize(material.type))}</b>
    </button>
  `;
}

function renderMaterialDetail(material) {
  if (!material) {
    return emptyState('Выберите материал', 'Откройте скрипт или инструкцию из списка слева.');
  }

  return `
    <article class="panel material-detail">
      <div class="detail-card-head">
        <div>
          <p class="eyebrow">${escapeHtml(directionLabel(material.direction))} · ${escapeHtml(humanize(material.niche))}</p>
          <h2>${escapeHtml(material.title)}</h2>
        </div>
        <span class="status-badge">${escapeHtml(humanize(material.type))}</span>
      </div>
      <div class="material-body">${escapeHtml(material.body)}</div>
      <div class="material-footer">
        <span>Обновлено: ${escapeHtml(formatDate(material.updatedAt || material.createdAt))}</span>
        <button class="primary-button" type="button" data-copy-material="${escapeHtml(material.id)}">Копировать текст</button>
      </div>
    </article>
  `;
}

function renderMaterials(materials, meta) {
  if (!materials.length) {
    return emptyState('Материалов нет', 'Попробуйте сбросить фильтры или проверьте seed-данные.');
  }

  const active = materials.find((material) => material.id === activeMaterialId) || materials[0];
  activeMaterialId = active.id;

  return `
    <div class="materials-layout">
      <section class="panel materials-list-panel">
        <div class="detail-section-head">
          <h2>Материалы</h2>
          <span>${materials.length}/${meta.total}</span>
        </div>
        <div class="materials-list">
          ${materials.map((material) => materialButton(material, material.id === activeMaterialId)).join('')}
        </div>
      </section>
      <section data-material-detail>${renderMaterialDetail(active)}</section>
    </div>
  `;
}

export function renderMaterialsScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Материалы',
      subtitle: 'Скрипты, вопросы диагностики и инструкции по нишам. Экран пока читает и копирует материалы.',
    })}
    <form class="filter-bar" data-materials-filters>
      <div class="field">
        <label for="materialsSearch">Поиск</label>
        <input id="materialsSearch" name="q" placeholder="Название, текст, тип" />
      </div>
      <div class="field">
        <label for="materialsDirection">Профиль</label>
        <select id="materialsDirection" name="direction">
          <option value="">Все</option>
          <option value="autotech">AutoTech</option>
          <option value="edutech">EduTech</option>
        </select>
      </div>
      <div class="field">
        <label for="materialsNiche">Ниша</label>
        <select id="materialsNiche" name="niche" data-materials-niche></select>
      </div>
      <div class="field">
        <label for="materialsType">Тип</label>
        <select id="materialsType" name="type" data-materials-type></select>
      </div>
      <div class="filter-actions">
        <button class="secondary-button" type="submit">Показать</button>
        <button class="secondary-button" type="button" data-reset-materials-filters>Сбросить</button>
      </div>
    </form>
    <div data-materials-root>${emptyState('Загружаем материалы', 'Получаем скрипты и инструкции.')}</div>
  `;
}

export async function mountMaterialsScreen() {
  const root = document.querySelector('[data-materials-root]');
  const filters = document.querySelector('[data-materials-filters]');
  if (!root || !filters) return;

  const nicheSelect = filters.querySelector('[data-materials-niche]');
  const typeSelect = filters.querySelector('[data-materials-type]');

  const loadMaterials = async () => {
    root.innerHTML = emptyState('Загружаем материалы', 'Обновляем список по выбранным фильтрам.');
    const data = new FormData(filters);
    const params = new URLSearchParams();
    ['q', 'direction', 'niche', 'type'].forEach((key) => {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    });
    params.set('sort', 'direction,niche,type,title');
    params.set('limit', '100');
    const result = await get(`/api/materials?${params.toString()}`);
    root.innerHTML = renderMaterials(result.data, result.meta);
    bindMaterialRows(root, result.data);
  };

  try {
    const metaResult = await get('/api/meta');
    materialsMeta = metaResult.meta;
    nicheSelect.innerHTML = renderOptions(['all', ...(materialsMeta.autotechNiches || []), ...(materialsMeta.edutechNiches || [])]);
    await loadMaterialTypes(typeSelect);
    await loadMaterials();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить материалы', error.message || 'Проверьте подключение и доступ.');
    toast(error.message || 'Ошибка загрузки материалов', 'error');
  }

  filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    activeMaterialId = null;
    await loadMaterials().catch((error) => toast(error.message || 'Ошибка фильтрации материалов', 'error'));
  });

  filters.querySelector('[data-reset-materials-filters]').addEventListener('click', async () => {
    filters.reset();
    activeMaterialId = null;
    await loadMaterials().catch((error) => toast(error.message || 'Ошибка загрузки материалов', 'error'));
  });
}

async function loadMaterialTypes(typeSelect) {
  const result = await get('/api/materials?limit=100');
  const types = [...new Set((result.data || []).map((material) => material.type).filter(Boolean))].sort();
  typeSelect.innerHTML = renderOptions(types);
}

function bindMaterialRows(root, materials) {
  root.querySelectorAll('[data-open-material]').forEach((button) => {
    button.addEventListener('click', () => {
      activeMaterialId = button.dataset.openMaterial;
      const active = materials.find((material) => material.id === activeMaterialId);
      root.querySelector('[data-material-detail]').innerHTML = renderMaterialDetail(active);
      root.querySelectorAll('[data-open-material]').forEach((item) => {
        item.classList.toggle('active', item.dataset.openMaterial === activeMaterialId);
      });
      bindCopy(root, materials);
    });
  });
  bindCopy(root, materials);
}

function bindCopy(root, materials) {
  root.querySelector('[data-copy-material]')?.addEventListener('click', async (event) => {
    const material = materials.find((item) => item.id === event.currentTarget.dataset.copyMaterial);
    if (!material) return;
    try {
      await navigator.clipboard.writeText(material.body);
      toast('Текст скопирован', 'success');
    } catch (error) {
      toast('Не удалось скопировать текст', 'error');
    }
  });
}
