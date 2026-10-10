/**
 * Cloudflare Access authentication. Access sits in front of the Worker and signs every
 * request with a JWT (header Cf-Access-Jwt-Assertion). We verify that JWT ourselves so the
 * API stays closed even if Access were misconfigured: no valid token → no data.
 */

export interface AccessConfig {
  readonly teamDomain: string; // e.g. "miequipo.cloudflareaccess.com"
  readonly aud: string; // Access application "AUD" tag
  readonly allowedEmails: readonly string[];
}

export interface AccessClaims {
  readonly aud?: string | string[];
  readonly email?: string;
  readonly exp?: number;
  readonly nbf?: number;
  readonly iss?: string;
}

interface JwtParts {
  readonly header: { alg?: string; kid?: string };
  readonly claims: AccessClaims;
  readonly signedPart: string;
  readonly signature: Uint8Array;
}

const CLOCK_SKEW_SECONDS = 60;

export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function splitJwt(token: string): JwtParts | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const header = decodeJson<unknown>(segments[0]);
    const claims = decodeJson<unknown>(segments[1]);
    if (!isObject(header) || !isObject(claims)) return null;
    return {
      header: header as JwtParts['header'],
      claims: claims as AccessClaims,
      signedPart: `${segments[0]}.${segments[1]}`,
      signature: base64UrlDecode(segments[2]),
    };
  } catch {
    return null;
  }
}

/** Returns an error message, or null when the claims are acceptable. */
export function checkClaims(claims: AccessClaims, config: AccessConfig, nowSeconds: number): string | null {
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.aud)) return 'Token para otra aplicación';
  if (claims.iss !== `https://${config.teamDomain}`) return 'Emisor no válido';
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) return 'Sesión caducada';
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SECONDS > nowSeconds) return 'Token aún no válido';
  const email = claims.email?.toLowerCase();
  if (!email || !config.allowedEmails.includes(email)) return 'Usuario no autorizado';
  return null;
}

export type KeyResolver = (kid: string) => Promise<CryptoKey | null>;

/** Verifies an RS256 Access JWT. Returns the authorised e-mail or an error message. */
export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  resolveKey: KeyResolver,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ email: string } | { error: string }> {
  const parts = splitJwt(token);
  if (!parts || parts.header.alg !== 'RS256' || !parts.header.kid) return { error: 'Token no válido' };
  const key = await resolveKey(parts.header.kid);
  if (!key) return { error: 'Clave de firma desconocida' };
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    parts.signature,
    new TextEncoder().encode(parts.signedPart),
  );
  if (!isValid) return { error: 'Firma no válida' };
  const problem = checkClaims(parts.claims, config, nowSeconds);
  return problem ? { error: problem } : { email: (parts.claims.email ?? '').toLowerCase() };
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

const KEY_CACHE_TTL_MS = 60 * 60 * 1000;
/** Unknown key ids never trigger more than one certs download per minute (junk tokens can't amplify). */
const KEY_REFETCH_MIN_INTERVAL_MS = 60 * 1000;
let cachedKeys: { teamDomain: string; fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;
let lastFetchAttemptAt = 0;

/** Fetches (and caches for an hour) the team's public signing keys. */
export function accessKeyResolver(teamDomain: string): KeyResolver {
  return async (kid) => {
    const sameTeam = cachedKeys?.teamDomain === teamDomain;
    const age = sameTeam && cachedKeys ? Date.now() - cachedKeys.fetchedAt : Infinity;
    const needsKeys = age > KEY_CACHE_TTL_MS || !cachedKeys?.keys.has(kid);
    // Also throttles failed downloads, so a certs outage or junk kids cannot cause a fetch per request.
    if (needsKeys && Date.now() - lastFetchAttemptAt > KEY_REFETCH_MIN_INTERVAL_MS) {
      lastFetchAttemptAt = Date.now();
      const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
      if (!response.ok) return null;
      const body = (await response.json()) as { keys?: Jwk[] };
      const entries = await Promise.all(
        (body.keys ?? [])
          .filter((jwk) => jwk.kid)
          .map(async (jwk) => {
            const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
            return [jwk.kid as string, key] as const;
          }),
      );
      cachedKeys = { teamDomain, fetchedAt: Date.now(), keys: new Map(entries) };
    }
    return cachedKeys?.teamDomain === teamDomain ? (cachedKeys.keys.get(kid) ?? null) : null;
  };
}

/** Real Access tokens are ~1 KB; anything far larger is rejected before parsing. */
const MAX_TOKEN_LENGTH = 8192;

export function readAccessToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  const cookie = request.headers.get('Cookie') ?? '';
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  let token = header;
  if (!token && match) {
    try {
      token = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  return token && token.length <= MAX_TOKEN_LENGTH ? token : null;
}
