import { getState } from './state.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const state = getState();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`${state.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new ApiError(data.error || `HTTP ${response.status}`, response.status);
  }

  return data;
}

export function get(path) {
  return apiRequest(path);
}

export function post(path, body = {}) {
  return apiRequest(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function patch(path, body = {}) {
  return apiRequest(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
