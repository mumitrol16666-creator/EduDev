import { get, patch, post } from '../api.js';
import { labelValue } from '../labels.js';
import { emptyState, escapeHtml, pageHeader, toast } from '../ui.js';

let activeReferenceId = null;
let settingsDictionaries = {};

function humanize(value) {
  return labelValue(value);
}

function renderGroupOptions(groups, selected = '') {
  return groups.map((group) => `
    <option value="${escapeHtml(group)}" ${group === selected ? 'selected' : ''}>${escapeHtml(humanize(group))}</option>
  `).join('');
}

function renderMetaGroup(title, values = []) {
  return `
    <section class="panel settings-meta-card">
      <h2>${escapeHtml(title)}</h2>
      <div class="section-preview">
        ${values.length ? values.map((value) => `<span class="status-badge">${escapeHtml(humanize(value))}</span>`).join('') : '<span class="muted">Нет данных</span>'}
      </div>
    </section>
  `;
}

function dictionaryRow(item) {
  const isSystem = item.status === 'system' || item.value?.system;
  return `
    <tr>
      <td>
        <strong>${escapeHtml(item.label || humanize(item.key))}</strong>
        <small>${escapeHtml(item.key)} · ${escapeHtml(isSystem ? 'системный' : 'пользовательский')}</small>
      </td>
      <td><span class="status-badge">${escapeHtml(humanize(item.status))}</span></td>
      <td>${escapeHtml(item.sortOrder ?? 100)}</td>
      <td><code>${escapeHtml(JSON.stringify(item.value || {}))}</code></td>
      <td>
        ${isSystem
          ? '<span class="muted">только просмотр</span>'
          : `<button class="secondary-button compact-button" type="button" data-edit-reference="${escapeHtml(item.id)}">Изменить</button>`}
      </td>
    </tr>
  `;
}

function renderDictionaryGroup(group, items) {
  return `
    <section class="settings-dictionary">
      <div class="detail-section-head">
        <h2>${escapeHtml(humanize(group))}</h2>
        <span>${items.length}</span>
      </div>
      <div class="table-panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Элемент</th>
              <th>Статус</th>
              <th>Порядок</th>
              <th>Данные</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>${items.map(dictionaryRow).join('')}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSettings(meta, dictionaries) {
  const groups = Object.keys(dictionaries).sort();
  return `
    <div class="settings-meta-grid">
      ${renderMetaGroup('Роли', Object.values(meta.roles || {}))}
      ${renderMetaGroup('Профили', Object.values(meta.directions || {}))}
      ${renderMetaGroup('Пакеты', Object.values(meta.packages || {}))}
      ${renderMetaGroup('Статусы внедрения', Object.values(meta.implementationStatuses || {}))}
    </div>
    <div class="settings-dictionaries">
      ${groups.map((group) => renderDictionaryGroup(group, dictionaries[group])).join('')}
    </div>
  `;
}

function modalMarkup(groups) {
  return `
    <div class="modal-backdrop" data-reference-create-modal>
      <div class="modal-panel">
        <form data-create-reference-form>
          <div class="modal-header"><h2>Добавить элемент</h2></div>
          <div class="modal-body form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="referenceGroup">Группа</label>
                <select id="referenceGroup" name="group" required>${renderGroupOptions(groups)}</select>
              </div>
              <div class="field">
                <label for="referenceKey">Внутреннее название</label>
                <input id="referenceKey" name="key" required placeholder="online_school" />
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="referenceLabel">Название</label>
                <input id="referenceLabel" name="label" required placeholder="Онлайн-школа" />
              </div>
              <div class="field">
                <label for="referenceSort">Порядок</label>
                <input id="referenceSort" name="sortOrder" type="number" value="100" />
              </div>
            </div>
            <div class="field">
              <label for="referenceDescription">Описание</label>
              <textarea id="referenceDescription" name="description" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-settings-modal>Отмена</button>
            <button class="primary-button" type="submit">Добавить элемент</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" data-reference-edit-modal>
      <div class="modal-panel">
        <form data-edit-reference-form>
          <div class="modal-header"><h2>Изменить элемент</h2></div>
          <div class="modal-body form-stack">
            <div class="field">
              <label for="referenceEditLabel">Название</label>
              <input id="referenceEditLabel" name="label" required />
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="referenceEditStatus">Статус</label>
                <select id="referenceEditStatus" name="status" required>
                  <option value="active">Активно</option>
                  <option value="inactive">Отключено</option>
                </select>
              </div>
              <div class="field">
                <label for="referenceEditSort">Порядок</label>
                <input id="referenceEditSort" name="sortOrder" type="number" />
              </div>
            </div>
            <div class="field">
              <label for="referenceEditDescription">Описание</label>
              <textarea id="referenceEditDescription" name="description" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-close-settings-modal>Отмена</button>
            <button class="primary-button" type="submit">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderSettingsScreen(screen) {
  return `
    ${pageHeader({
      title: screen.label || 'Настройки',
      subtitle: 'Системные справочники и пользовательские элементы. Встроенные значения доступны только для просмотра.',
      primaryAction: '<button class="primary-button" type="button" data-open-reference-create>Добавить элемент</button>',
    })}
    <div data-settings-root>${emptyState('Загружаем настройки', 'Получаем справочники и параметры системы.')}</div>
    <div data-settings-modals></div>
  `;
}

export async function mountSettingsScreen() {
  const root = document.querySelector('[data-settings-root]');
  const modals = document.querySelector('[data-settings-modals]');
  if (!root || !modals) return;

  const loadSettings = async () => {
    root.innerHTML = emptyState('Загружаем настройки', 'Обновляем справочники.');
    const [metaResult, dictionariesResult] = await Promise.all([
      get('/api/meta'),
      get('/api/settings/dictionaries'),
    ]);
    settingsDictionaries = dictionariesResult.dictionaries || {};
    root.innerHTML = renderSettings(metaResult.meta, settingsDictionaries);
    modals.innerHTML = modalMarkup(Object.keys(settingsDictionaries).sort());
    bindSettings(root, loadSettings);
  };

  try {
    await loadSettings();
  } catch (error) {
    root.innerHTML = emptyState('Не удалось загрузить настройки', error.message || 'Проверьте подключение и права доступа.');
    toast(error.message || 'Ошибка загрузки настроек', 'error');
  }
}

function closeModals() {
  document.querySelectorAll('[data-reference-create-modal], [data-reference-edit-modal]').forEach((modal) => {
    modal.classList.remove('open');
  });
  activeReferenceId = null;
}

function openModal(selector) {
  document.querySelector(selector)?.classList.add('open');
}

function findReference(id) {
  return Object.values(settingsDictionaries).flat().find((item) => item.id === id);
}

function bindSettings(root, reload) {
  document.querySelector('[data-open-reference-create]')?.addEventListener('click', () => openModal('[data-reference-create-modal]'));

  root.querySelectorAll('[data-edit-reference]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = findReference(button.dataset.editReference);
      if (!item) return;
      activeReferenceId = item.id;
      document.querySelector('#referenceEditLabel').value = item.label || '';
      document.querySelector('#referenceEditStatus').value = item.status || 'active';
      document.querySelector('#referenceEditSort').value = item.sortOrder ?? 100;
      document.querySelector('#referenceEditDescription').value = item.value?.description || '';
      openModal('[data-reference-edit-modal]');
    });
  });

  document.querySelectorAll('[data-close-settings-modal]').forEach((button) => {
    button.addEventListener('click', closeModals);
  });
  document.querySelectorAll('[data-reference-create-modal], [data-reference-edit-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModals();
    });
  });

  document.querySelector('[data-create-reference-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post('/api/settings/reference-items', {
        group: data.get('group'),
        key: String(data.get('key') || '').trim(),
        label: String(data.get('label') || '').trim(),
        value: { description: String(data.get('description') || '').trim() },
        sortOrder: Number(data.get('sortOrder') || 100),
      });
      toast('Элемент добавлен', 'success');
      closeModals();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось добавить элемент', 'error');
    }
  });

  document.querySelector('[data-edit-reference-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await patch(`/api/settings/reference-items/${activeReferenceId}`, {
        label: String(data.get('label') || '').trim(),
        status: data.get('status'),
        value: { description: String(data.get('description') || '').trim() },
        sortOrder: Number(data.get('sortOrder') || 100),
      });
      toast('Элемент обновлен', 'success');
      closeModals();
      await reload();
    } catch (error) {
      toast(error.message || 'Не удалось обновить элемент', 'error');
    }
  });
}
