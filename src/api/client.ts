/** Thin JSON client for the Worker API (same origin, HttpOnly session cookie). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const OFFLINE = 'Sin conexión con el servidor. Comprueba tu conexión a Internet e inténtalo de nuevo.';

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
let sessionExpired = false;

/** The sign-in gate subscribes here to show the login screen when the session expires. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

/**
 * true once a 401 has closed the session: from then on every request fails with 401 too, so
 * the resulting errors are silenced (the login gate is already on screen) until login succeeds.
 */
export function isSessionExpired(): boolean {
  return sessionExpired;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function apiRequest<T>(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new ApiError(0, OFFLINE);
  }

  const isJson = (response.headers.get('Content-Type') ?? '').includes('application/json');
  if (!isJson) throw new ApiError(response.status, `Error del servidor (${response.status})`);
  const payload = (await response.json()) as { data?: T; error?: string };
  if (!response.ok) {
    // Login failures are handled by the login form itself; any other 401 means the session expired.
    // Parallel requests after the expiry must not fire the gate (and its alert) again and again.
    if (response.status === 401 && path !== '/login' && !sessionExpired) {
      sessionExpired = true;
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw new ApiError(response.status, payload.error ?? `Error del servidor (${response.status})`);
  }
  if (path === '/login') sessionExpired = false;
  return payload.data as T;
}

/** GET that maps "not found" to null. */
export async function getOrNull<T>(path: string): Promise<T | null> {
  try {
    return await apiRequest<T>('GET', path);
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
