const isTauri = !!(window as any).__TAURI_INTERNALS__;
const BASE_URL = isTauri ? 'http://localhost:3001/api' : '/api';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * Minimal fetch wrapper. Sends no tracking headers.
 * Auth token is included only when available.
 */
export async function api<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  // Attach session token if available
  if (!skipAuth) {
    const token = sessionStorage.getItem('polarchat_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Strip any tracking-related headers
  delete headers['X-Requested-With'];

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...rest,
    headers,
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(response.status, body.message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export default api;
