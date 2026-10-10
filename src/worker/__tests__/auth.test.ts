import { checkClaims, parseAllowedEmails, readAccessToken, verifyAccessJwt, type AccessConfig } from '../auth';

const config: AccessConfig = {
  teamDomain: 'equipo.cloudflareaccess.com',
  aud: 'aud-123',
  allowedEmails: ['hezuradar@gmail.com', 'iotegi@gmail.com'],
};
const NOW = 1_800_000_000;
const goodClaims = { aud: ['aud-123'], iss: 'https://equipo.cloudflareaccess.com', exp: NOW + 600, email: 'Hezuradar@gmail.com' };

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

async function signedToken(claims: unknown, privateKey: CryptoKey, kid = 'k1'): Promise<string> {
  const signedPart = `${encodeJson({ alg: 'RS256', kid })}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signedPart));
  return `${signedPart}.${base64Url(new Uint8Array(signature))}`;
}

describe('parseAllowedEmails', () => {
  it('splits, trims and lowercases', () => {
    expect(parseAllowedEmails(' A@x.com, b@Y.com ,')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseAllowedEmails(undefined)).toEqual([]);
  });
});

describe('checkClaims', () => {
  it('accepts valid claims (case-insensitive e-mail)', () => {
    expect(checkClaims(goodClaims, config, NOW)).toBeNull();
  });
  it.each([
    [{ ...goodClaims, aud: 'other' }, 'otra aplicación'],
    [{ ...goodClaims, iss: 'https://evil.example' }, 'Emisor'],
    [{ ...goodClaims, exp: NOW - 3600 }, 'caducada'],
    [{ ...goodClaims, nbf: NOW + 3600 }, 'aún no'],
    [{ ...goodClaims, email: 'intruso@gmail.com' }, 'no autorizado'],
    [{ ...goodClaims, email: undefined }, 'no autorizado'],
  ])('rejects %p', (claims, fragment) => {
    expect(checkClaims(claims, config, NOW)).toContain(fragment);
  });
});

describe('verifyAccessJwt', () => {
  let keys: CryptoKeyPair;
  let otherKeys: CryptoKeyPair;
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

  beforeAll(async () => {
    keys = (await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])) as CryptoKeyPair;
    otherKeys = (await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])) as CryptoKeyPair;
  });

  const resolver = () => async (kid: string) => (kid === 'k1' ? keys.publicKey : null);

  it('accepts a correctly signed token for an allowed user', async () => {
    const token = await signedToken(goodClaims, keys.privateKey);
    await expect(verifyAccessJwt(token, config, resolver(), NOW)).resolves.toEqual({ email: 'hezuradar@gmail.com' });
  });

  it('rejects a token signed with another key', async () => {
    const token = await signedToken(goodClaims, otherKeys.privateKey);
    await expect(verifyAccessJwt(token, config, resolver(), NOW)).resolves.toEqual({ error: 'Firma no válida' });
  });

  it('rejects tampered claims', async () => {
    const token = await signedToken(goodClaims, keys.privateKey);
    const [header, , signature] = token.split('.');
    const forged = `${header}.${encodeJson({ ...goodClaims, email: 'iotegi@gmail.com', exp: NOW + 99999 })}.${signature}`;
    await expect(verifyAccessJwt(forged, config, resolver(), NOW)).resolves.toEqual({ error: 'Firma no válida' });
  });

  it('rejects unknown key ids and garbage', async () => {
    const token = await signedToken(goodClaims, keys.privateKey, 'k2');
    await expect(verifyAccessJwt(token, config, resolver(), NOW)).resolves.toEqual({ error: 'Clave de firma desconocida' });
    await expect(verifyAccessJwt('no.es.jwt', config, resolver(), NOW)).resolves.toEqual({ error: 'Token no válido' });
  });

  it('rejects valid signatures with disallowed users', async () => {
    const token = await signedToken({ ...goodClaims, email: 'otro@gmail.com' }, keys.privateKey);
    await expect(verifyAccessJwt(token, config, resolver(), NOW)).resolves.toEqual({ error: 'Usuario no autorizado' });
  });
});

describe('readAccessToken', () => {
  it('prefers the Access header, falls back to the cookie', () => {
    expect(readAccessToken(new Request('https://x.dev', { headers: { 'Cf-Access-Jwt-Assertion': 'h' } }))).toBe('h');
    expect(readAccessToken(new Request('https://x.dev', { headers: { Cookie: 'a=1; CF_Authorization=c%2E1' } }))).toBe('c.1');
    expect(readAccessToken(new Request('https://x.dev'))).toBeNull();
  });

  it('rejects oversized tokens and malformed cookies', () => {
    expect(readAccessToken(new Request('https://x.dev', { headers: { 'Cf-Access-Jwt-Assertion': 'x'.repeat(9000) } }))).toBeNull();
    expect(readAccessToken(new Request('https://x.dev', { headers: { Cookie: 'CF_Authorization=%E0%A4%A' } }))).toBeNull();
  });
});

describe('splitJwt hardening', () => {
  it('rejects tokens whose header or claims are not objects', async () => {
    const nullSegment = btoa('null').replace(/=+$/, '');
    await expect(verifyAccessJwt(`${nullSegment}.${nullSegment}.sig`, config, async () => null, NOW)).resolves.toEqual({
      error: 'Token no válido',
    });
  });
});
