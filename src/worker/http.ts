/** Small HTTP helpers for the JSON API. Every response is { data } or { error }. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

const MAX_BODY_BYTES = 1_000_000;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), { status, headers: API_HEADERS });
}

export function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: API_HEADERS });
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (what: string) => new HttpError(404, `${what} no encontrado`);

/** Rejects cross-site requests (defence in depth on every mutation, including DELETE). */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Origen no permitido');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, 'Origen no permitido');
}

/**
 * Reads a JSON body. Mutations must be same-origin JSON requests: browsers cannot send them
 * cross-site without a CORS preflight (which this API never grants), which blocks CSRF.
 */
export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Se esperaba JSON');
  }
  assertSameOrigin(request);
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) throw new HttpError(413, 'Petición demasiado grande');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new HttpError(413, 'Petición demasiado grande');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest('JSON no válido');
  }
}
