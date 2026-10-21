import { refreshFxIfStale } from './fx';
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from './http';
import { matchRoute } from './routes';
import {
  clearFailedLogins,
  clearSessionCookie,
  createSessionToken,
  isPasswordConfigured,
  loginRetryAfter,
  passwordMatches,
  readSessionCookie,
  recordFailedLogin,
  sessionCookie,
  verifySessionToken,
} from './session';

export interface WorkerEnv {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  /** Worker secret: `npx wrangler secret put APP_PASSWORD` (min. 10 characters). */
  readonly APP_PASSWORD?: string;
  /** Local development only (.dev.vars): skips sign-in on localhost. Never set in production. */
  readonly DEV_BYPASS_AUTH?: string;
}

const NOT_CONFIGURED =
  'Falta configurar la contraseña de la app (secreto APP_PASSWORD, mínimo 10 caracteres). Consulta el README.';
const nowSeconds = () => Math.floor(Date.now() / 1000);

function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, headers });
}

function isDevBypass(request: Request, env: WorkerEnv): boolean {
  return env.DEV_BYPASS_AUTH === '1' && new URL(request.url).hostname === 'localhost';
}

function isConfigured(request: Request, env: WorkerEnv): boolean {
  return isDevBypass(request, env) || isPasswordConfigured(env.APP_PASSWORD);
}

async function isAuthenticated(request: Request, env: WorkerEnv): Promise<boolean> {
  if (isDevBypass(request, env)) return true;
  const token = readSessionCookie(request);
  return Boolean(token && isPasswordConfigured(env.APP_PASSWORD) && (await verifySessionToken(token, env.APP_PASSWORD)));
}

async function login(request: Request, env: WorkerEnv): Promise<Response> {
  if (!isPasswordConfigured(env.APP_PASSWORD)) return errorResponse(503, NOT_CONFIGURED);
  const body = await readJson(request);
  const candidate = typeof body === 'object' && body !== null ? (body as { password?: unknown }).password : undefined;
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 200) {
    return errorResponse(400, 'Escribe la contraseña');
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'desconocida';
  const wait = await loginRetryAfter(env.DB, ip, nowSeconds());
  if (wait > 0) return errorResponse(429, `Demasiados intentos. Vuelve a probar en ${Math.ceil(wait / 60)} minutos.`);

  if (!(await passwordMatches(candidate, env.APP_PASSWORD))) {
    await recordFailedLogin(env.DB, ip, nowSeconds());
    return errorResponse(401, 'Contraseña incorrecta');
  }
  await clearFailedLogins(env.DB, ip);
  return withCookie(json({ ok: true }), sessionCookie(await createSessionToken(env.APP_PASSWORD)));
}

/** /api/session, /api/login and /api/logout work without a session. */
async function handleAuthRoutes(request: Request, env: WorkerEnv, pathname: string): Promise<Response | null> {
  if (pathname === '/api/session' && request.method === 'GET') {
    return json({ authenticated: await isAuthenticated(request, env), configured: isConfigured(request, env) });
  }
  if (pathname === '/api/logout' && request.method === 'POST') {
    assertSameOrigin(request);
    return withCookie(json({ ok: true }), clearSessionCookie());
  }
  if (pathname === '/api/login' && request.method === 'POST') return login(request, env);
  return null;
}

async function handleApi(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  try {
    const authResponse = await handleAuthRoutes(request, env, pathname);
    if (authResponse) return authResponse;

    if (!isConfigured(request, env)) return errorResponse(503, NOT_CONFIGURED);
    if (!(await isAuthenticated(request, env))) return errorResponse(401, 'Inicia sesión para continuar');

    const route = matchRoute(request.method, pathname);
    if (route === null) return errorResponse(404, 'Ruta no encontrada');
    if (route === 'method') return errorResponse(405, 'Método no permitido');
    if (request.method !== 'GET') assertSameOrigin(request);

    // Keep the exchange rate fresh whenever the app is used (cheap no-op when recent).
    if (request.method === 'GET') ctx.waitUntil(refreshFxIfStale(env.DB).catch(() => undefined));
    return await route.handler({ params: route.params, request, db: env.DB });
  } catch (e: unknown) {
    if (e instanceof HttpError) return errorResponse(e.status, e.message);
    const message = e instanceof Error ? e.message : String(e);
    if (/FOREIGN KEY|CHECK constraint/i.test(message)) return errorResponse(400, 'Datos no válidos para la base de datos');
    console.error(JSON.stringify({ level: 'error', msg: 'api_error', method: request.method, path: pathname, error: message }));
    return errorResponse(500, 'Error interno del servidor');
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env, ctx);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshFxIfStale(env.DB));
  },
} satisfies ExportedHandler<WorkerEnv>;
