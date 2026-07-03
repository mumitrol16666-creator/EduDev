import { getState, setRoute } from './state.js';
import { renderPlaceholderScreen } from './ui.js';

const screenRenderers = new Map();
const parentRoutes = {
  'client-detail': 'clients',
  'deal-detail': 'deals',
  'implementation-detail': 'implementation',
  'lead-detail': 'leads',
};

export function registerScreen(id, renderer) {
  screenRenderers.set(id, renderer);
}

export function currentRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return raw || '';
}

export function routeBase(route = currentRoute()) {
  return String(route || '').split('/')[0];
}

export function routeParam(index = 1, route = currentRoute()) {
  return String(route || '').split('/')[index] || '';
}

export function navigate(route) {
  window.location.hash = `/${route}`;
}

export function firstAllowedRoute() {
  const navigation = getState().navigation;
  return navigation[0]?.id || 'dashboard';
}

export function renderRoute(host) {
  const route = currentRoute() || firstAllowedRoute();
  setRoute(route);
  const base = routeBase(route);

  const screen = getState().navigation.find((item) => item.id === route || item.id === base || item.id === parentRoutes[base]);
  const renderer = screenRenderers.get(base);
  if (!screen && !renderer) {
    host.innerHTML = renderPlaceholderScreen({
      id: route,
      label: 'Недоступный раздел',
      api: [],
      entities: [],
    });
    return;
  }

  host.innerHTML = renderer ? renderer(screen || { id: base }) : renderPlaceholderScreen(screen);

  document.querySelectorAll('[data-nav-id]').forEach((item) => {
    item.classList.toggle('active', item.dataset.navId === route || item.dataset.navId === base || item.dataset.navId === parentRoutes[base]);
  });
}
