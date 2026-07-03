import { get, patch, post } from './api.js';
import { setNavigation, setNotifications, setToken, setUser } from './state.js';

export async function login(credentials) {
  const result = await post('/api/auth/login', credentials);
  setToken(result.session.token);
  setUser(result.session.user);
  await hydrateSession();
  return result.session.user;
}

export async function hydrateSession() {
  const [me, navigation, notifications] = await Promise.all([
    get('/api/me'),
    get('/api/navigation'),
    get('/api/notifications').catch(() => ({ notifications: [], unreadCount: 0 })),
  ]);

  setUser(me.user);
  setNavigation(navigation.navigation);
  setNotifications(notifications);
}

export async function logout() {
  try {
    await post('/api/auth/logout');
  } finally {
    setToken('');
    setUser(null);
    setNavigation([]);
    setNotifications({ notifications: [], unreadCount: 0 });
  }
}

export async function changePassword(payload) {
  const result = await patch('/api/auth/password', payload);
  setToken('');
  return result.user;
}
