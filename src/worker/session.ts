/**
 * Free, self-contained sign-in: one password stored as the Worker secret APP_PASSWORD.
 * A successful login returns an HttpOnly session cookie "<expiry>.<HMAC-SHA256 signature>",
 * signed with a key derived from the password (changing the password signs everyone out).
 */

export const SESSION_TTL_SECONDS = 30 * 24 * 3600;
export const MIN_PASSWORD_LENGTH = 10;
const COOKIE_NAME = 'compras_session';
const encoder = new TextEncoder();

export function isPasswordConfigured(password: string | undefined): password is string {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(text));
}

/** Constant-time comparison of two equal-length byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Compares digests (fixed length) so timing does not reveal the password length or prefix. */
export async function passwordMatches(candidate: string, password: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(`login:${candidate}`), sha256(`login:${password}`)]);
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

async function signingKey(password: string): Promise<CryptoKey> {
  const raw = await sha256(`compras-session-v1:${password}`);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signature(expiry: number, password: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await signingKey(password), encoder.encode(`v1.${expiry}`));
  return toBase64Url(mac);
}

export async function createSessionToken(password: string, nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<string> {
  const expiry = nowSeconds + SESSION_TTL_SECONDS;
  return `${expiry}.${await signature(expiry, password)}`;
}

export async function verifySessionToken(
  token: string,
  password: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]);
  if (expiry < nowSeconds || expiry > nowSeconds + SESSION_TTL_SECONDS) return false;
  const expected = await signature(expiry, password);
  return timingSafeEqual(encoder.encode(match[2]), encoder.encode(expected));
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]{1,200})`).exec(cookie);
  return match ? match[1] : null;
}

// ---------- Brute-force protection (per client IP, stored in D1) ----------

const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

export interface AttemptWindow {
  readonly count: number;
  readonly windowStart: number;
}

/** Pure rule: after 10 failures inside a 15-minute window, wait until the window ends. */
export function retryAfterSeconds(attempts: AttemptWindow | null, nowSeconds: number): number {
  if (!attempts || nowSeconds - attempts.windowStart >= ATTEMPT_WINDOW_SECONDS) return 0;
  return attempts.count >= MAX_FAILED_ATTEMPTS ? attempts.windowStart + ATTEMPT_WINDOW_SECONDS - nowSeconds : 0;
}

/** Seconds until the IP may try again, or 0 when allowed. */
export async function loginRetryAfter(db: D1Database, ip: string, nowSeconds: number): Promise<number> {
  const row = await db
    .prepare('SELECT count, window_start FROM login_attempts WHERE ip = ?')
    .bind(ip)
    .first<{ count: number; window_start: number }>();
  return retryAfterSeconds(row ? { count: row.count, windowStart: row.window_start } : null, nowSeconds);
}

export async function recordFailedLogin(db: D1Database, ip: string, nowSeconds: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_attempts (ip, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(ip) DO UPDATE SET
         count = CASE WHEN ? - window_start >= ? THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END`,
    )
    .bind(ip, nowSeconds, nowSeconds, ATTEMPT_WINDOW_SECONDS, nowSeconds, ATTEMPT_WINDOW_SECONDS, nowSeconds)
    .run();
}

export async function clearFailedLogins(db: D1Database, ip: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
}
