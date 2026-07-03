function defaultApiBaseUrl() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:4100';
  }
  return '';
}

function storedApiBaseUrl() {
  const stored = localStorage.getItem('edudev.crm.apiBaseUrl') || '';
  if (!stored) return '';
  const host = window.location.hostname;
  const isLocalPage = host === 'localhost' || host === '127.0.0.1';
  const isLocalApi = stored.includes('127.0.0.1') || stored.includes('localhost');
  if (!isLocalPage && isLocalApi) return '';
  return stored;
}

const state = {
  apiBaseUrl: storedApiBaseUrl() || defaultApiBaseUrl(),
  token: localStorage.getItem('edudev.crm.token') || '',
  user: null,
  navigation: [],
  notifications: {
    notifications: [],
    unreadCount: 0,
  },
  route: window.location.hash.replace(/^#/, '') || '',
};

export function getState() {
  return state;
}

export function setToken(token) {
  state.token = token || '';
  if (state.token) {
    localStorage.setItem('edudev.crm.token', state.token);
  } else {
    localStorage.removeItem('edudev.crm.token');
  }
}

export function setApiBaseUrl(url) {
  state.apiBaseUrl = url || defaultApiBaseUrl();
  if (state.apiBaseUrl) {
    localStorage.setItem('edudev.crm.apiBaseUrl', state.apiBaseUrl);
  } else {
    localStorage.removeItem('edudev.crm.apiBaseUrl');
  }
}

export function setUser(user) {
  state.user = user || null;
}

export function setNavigation(navigation) {
  state.navigation = Array.isArray(navigation) ? navigation : [];
}

export function setNotifications(payload) {
  state.notifications = {
    notifications: payload?.notifications || [],
    unreadCount: payload?.unreadCount || 0,
  };
}

export function setRoute(route) {
  state.route = route || '';
}
