/** Thin JSON client for the Worker API (same origin, protected by Cloudflare Access). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SESSION_EXPIRED = 'Tu sesión ha caducado. Recarga la página para volver a entrar.';
const OFFLINE = 'Sin conexión con el servidor. Comprueba tu conexión a Internet e inténtalo de nuevo.';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      // An expired Access session answers with a redirect to the login page: surface it instead of following it.
      redirect: 'manual',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, OFFLINE);
  }

  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    throw new ApiError(401, SESSION_EXPIRED);
  }
  const isJson = (response.headers.get('Content-Type') ?? '').includes('application/json');
  if (!isJson) throw new ApiError(response.status, response.ok ? SESSION_EXPIRED : `Error del servidor (${response.status})`);

  const payload = (await response.json()) as { data?: T; error?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error ?? `Error del servidor (${response.status})`);
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
