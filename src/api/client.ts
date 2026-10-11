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

/** The sign-in gate subscribes here to show the login screen when the session expires. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, OFFLINE);
  }

  const isJson = (response.headers.get('Content-Type') ?? '').includes('application/json');
  if (!isJson) throw new ApiError(response.status, `Error del servidor (${response.status})`);
  const payload = (await response.json()) as { data?: T; error?: string };
  if (!response.ok) {
    // Login failures are handled by the login form itself; any other 401 means the session expired.
    if (response.status === 401 && path !== '/login') unauthorizedListeners.forEach((listener) => listener());
    throw new ApiError(response.status, payload.error ?? `Error del servidor (${response.status})`);
  }
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
