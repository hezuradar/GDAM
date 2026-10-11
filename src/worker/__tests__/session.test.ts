import {
  clearSessionCookie,
  createSessionToken,
  isPasswordConfigured,
  passwordMatches,
  readSessionCookie,
  retryAfterSeconds,
  sessionCookie,
  verifySessionToken,
} from '../session';

describe('retryAfterSeconds (brute-force limit)', () => {
  const start = 1_800_000_000;
  it('allows when there are no previous failures', () => {
    expect(retryAfterSeconds(null, start)).toBe(0);
  });
  it('allows up to 9 failures inside the window', () => {
    expect(retryAfterSeconds({ count: 9, windowStart: start }, start + 60)).toBe(0);
  });
  it('blocks the 10th failure until the 15-minute window ends', () => {
    expect(retryAfterSeconds({ count: 10, windowStart: start }, start + 60)).toBe(15 * 60 - 60);
  });
  it('allows again once the window has passed', () => {
    expect(retryAfterSeconds({ count: 50, windowStart: start }, start + 15 * 60)).toBe(0);
  });
});

const PASSWORD = 'una-clave-larga-de-prueba';
const NOW = 1_800_000_000;

describe('isPasswordConfigured', () => {
  it('requires at least 10 characters', () => {
    expect(isPasswordConfigured(undefined)).toBe(false);
    expect(isPasswordConfigured('corta')).toBe(false);
    expect(isPasswordConfigured(PASSWORD)).toBe(true);
  });
});

describe('passwordMatches', () => {
  it('accepts the right password and rejects others', async () => {
    await expect(passwordMatches(PASSWORD, PASSWORD)).resolves.toBe(true);
    await expect(passwordMatches('otra-clave-cualquiera', PASSWORD)).resolves.toBe(false);
    await expect(passwordMatches('', PASSWORD)).resolves.toBe(false);
  });
});

describe('session tokens', () => {
  it('verifies a token it created', async () => {
    const token = await createSessionToken(PASSWORD, NOW);
    await expect(verifySessionToken(token, PASSWORD, NOW + 60)).resolves.toBe(true);
  });

  it('expires after 30 days', async () => {
    const token = await createSessionToken(PASSWORD, NOW);
    await expect(verifySessionToken(token, PASSWORD, NOW + 31 * 24 * 3600)).resolves.toBe(false);
  });

  it('is invalidated when the password changes', async () => {
    const token = await createSessionToken(PASSWORD, NOW);
    await expect(verifySessionToken(token, 'nueva-clave-distinta', NOW + 60)).resolves.toBe(false);
  });

  it('rejects tampered expiry and garbage', async () => {
    const token = await createSessionToken(PASSWORD, NOW);
    const [, signature] = token.split('.');
    await expect(verifySessionToken(`${NOW + 99_999_999}.${signature}`, PASSWORD, NOW)).resolves.toBe(false);
    await expect(verifySessionToken('basura', PASSWORD, NOW)).resolves.toBe(false);
    await expect(verifySessionToken('', PASSWORD, NOW)).resolves.toBe(false);
  });
});

describe('cookies', () => {
  it('builds a secure, http-only, strict cookie', () => {
    const cookie = sessionCookie('abc.def');
    expect(cookie).toContain('compras_session=abc.def');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api');
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });

  it('reads the session cookie among others', () => {
    const request = new Request('https://x.dev/api/orders', { headers: { Cookie: 'a=1; compras_session=t.k; b=2' } });
    expect(readSessionCookie(request)).toBe('t.k');
    expect(readSessionCookie(new Request('https://x.dev'))).toBeNull();
  });
});
