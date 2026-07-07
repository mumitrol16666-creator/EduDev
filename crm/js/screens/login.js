import { login } from '../auth.js';
import { toast } from '../ui.js';

export function renderLogin(app, onSuccess) {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-shell">
        <div class="login-copy">
          <img class="login-logo" src="./assets/edudev-logo.svg" alt="EduDev" />
          <h1>Внутренняя система для продаж, внедрения и поддержки</h1>
          <p>
            Один вход для менеджера, управляющего, программиста и поддержки.
            Меню и доступы открываются по роли пользователя.
          </p>
        </div>
        <form class="login-card" data-login-form>
          <h2>Вход</h2>
          <p>Введите рабочий email и пароль.</p>
          <div class="form-stack">
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" autocomplete="username" required />
            </div>
            <div class="field">
              <label for="password">Пароль</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <div class="form-error hidden" data-login-error></div>
            <button class="primary-button" type="submit" data-login-submit>Войти</button>
          </div>
        </form>
      </section>
    </main>
  `;

  const form = app.querySelector('[data-login-form]');
  const errorBox = app.querySelector('[data-login-error]');
  const submit = app.querySelector('[data-login-submit]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    submit.disabled = true;
    submit.textContent = 'Входим...';

    const data = new FormData(form);
    try {
      await login({
        email: String(data.get('email') || '').trim(),
        password: String(data.get('password') || ''),
      });
      toast('Вход выполнен', 'success');
      onSuccess();
    } catch (error) {
      errorBox.textContent = error.message || 'Не удалось войти';
      errorBox.classList.remove('hidden');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  });
}
