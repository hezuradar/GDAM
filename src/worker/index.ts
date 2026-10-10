import { accessKeyResolver, parseAllowedEmails, readAccessToken, verifyAccessJwt } from './auth';
import { refreshFxIfStale } from './fx';
import { assertSameOrigin, errorResponse, HttpError } from './http';
import { matchRoute } from './routes';

export interface WorkerEnv {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  readonly ALLOWED_EMAILS: string;
  readonly ACCESS_TEAM_DOMAIN: string;
  readonly ACCESS_AUD: string;
  /** Local development only (.dev.vars): skips Cloudflare Access. Never set in production. */
  readonly DEV_BYPASS_AUTH?: string;
}

async function authenticate(request: Request, env: WorkerEnv): Promise<{ email: string } | Response> {
  if (env.DEV_BYPASS_AUTH === '1' && new URL(request.url).hostname === 'localhost') return { email: 'dev@localhost' };
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.ACCESS_AUD?.trim();
  // Closed by default: without Access configured, nobody can read or write data.
  if (!teamDomain || !aud) {
    return errorResponse(503, 'El acceso todavía no está configurado (Cloudflare Access). Consulta el README.');
  }
  const token = readAccessToken(request);
  if (!token) return errorResponse(401, 'Inicia sesión para continuar');
  const result = await verifyAccessJwt(
    token,
    { teamDomain, aud, allowedEmails: parseAllowedEmails(env.ALLOWED_EMAILS) },
    accessKeyResolver(teamDomain),
  );
  if ('error' in result) {
    console.warn('Access denied:', result.error); // detail in logs only; the client gets a generic message
    return errorResponse(403, 'Acceso denegado');
  }
  return result;
}

async function handleApi(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
  let auth: { email: string } | Response;
  try {
    auth = await authenticate(request, env);
  } catch (e: unknown) {
    console.error('Auth error', e instanceof Error ? e.message : String(e));
    return errorResponse(401, 'No se pudo verificar la sesión. Recarga la página.');
  }
  if (auth instanceof Response) return auth;

  const { pathname } = new URL(request.url);
  const route = matchRoute(request.method, pathname);
  if (route === null) return errorResponse(404, 'Ruta no encontrada');
  if (route === 'method') return errorResponse(405, 'Método no permitido');

  // Keep the exchange rate fresh whenever the app is used (cheap no-op when recent).
  if (request.method === 'GET') ctx.waitUntil(refreshFxIfStale(env.DB).catch(() => undefined));

  try {
    if (request.method !== 'GET') assertSameOrigin(request);
    return await route.handler({ params: route.params, request, db: env.DB, email: auth.email });
  } catch (e: unknown) {
    if (e instanceof HttpError) return errorResponse(e.status, e.message);
    const message = e instanceof Error ? e.message : String(e);
    if (/FOREIGN KEY|CHECK constraint/i.test(message)) return errorResponse(400, 'Datos no válidos para la base de datos');
    console.error('API error', request.method, pathname, message);
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
