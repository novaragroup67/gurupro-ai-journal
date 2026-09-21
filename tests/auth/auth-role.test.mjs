import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isRecoverableAuthError,
  isSessionExpiring,
  isJwtExpired,
  readJwtPayload,
  looksLikeJwt,
} from '../../src/integrations/supabase/auth-token.ts';

function createMockJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = 'mock_signature';
  return `${header}.${body}.${sig}`;
}

test('auth token helpers', async (t) => {
  await t.test('1. correctly identifies valid JWT structure', () => {
    assert.equal(looksLikeJwt('a.b.c'), true);
    assert.equal(looksLikeJwt('invalid-token'), false);
    assert.equal(looksLikeJwt('a.b'), false);
    assert.equal(looksLikeJwt(''), false);
  });

  await t.test('2. decodes mock JWT payload correctly', () => {
    const payload = { sub: 'usr_123', exp: 1700000000, role: 'authenticated' };
    const jwt = createMockJwt(payload);
    const decoded = readJwtPayload(jwt);
    assert.deepEqual(decoded, payload);
  });

  await t.test('3. identifies expired JWT', () => {
    const pastExp = Math.floor((Date.now() - 60_000) / 1000);
    const expiredJwt = createMockJwt({ exp: pastExp });
    assert.equal(isJwtExpired(expiredJwt, 0), true);
  });

  await t.test('4. identifies unexpired JWT', () => {
    const futureExp = Math.floor((Date.now() + 300_000) / 1000);
    const validJwt = createMockJwt({ exp: futureExp });
    assert.equal(isJwtExpired(validJwt, 0), false);
  });

  await t.test('5. respects skewMs parameter for expiration check', () => {
    const closeExp = Math.floor((Date.now() + 15_000) / 1000);
    const token = createMockJwt({ exp: closeExp });
    // Expires in 15s. With 30s skew, it is considered expired.
    assert.equal(isJwtExpired(token, 30_000), true);
    // With 10s skew, it is not yet expired.
    assert.equal(isJwtExpired(token, 10_000), false);
  });

  await t.test('6. isSessionExpiring handles seconds timestamp correctly', () => {
    const futureSec = Math.floor((Date.now() + 120_000) / 1000);
    assert.equal(isSessionExpiring(futureSec, undefined, 60_000), false);

    const soonSec = Math.floor((Date.now() + 30_000) / 1000);
    assert.equal(isSessionExpiring(soonSec, undefined, 60_000), true);
  });

  await t.test('7. isSessionExpiring handles millisecond timestamp correctly', () => {
    const futureMs = Date.now() + 120_000;
    assert.equal(isSessionExpiring(futureMs, undefined, 60_000), false);

    const soonMs = Date.now() + 30_000;
    assert.equal(isSessionExpiring(soonMs, undefined, 60_000), true);
  });

  await t.test('8. isSessionExpiring inspects token if expiresAt is omitted', () => {
    const futureExp = Math.floor((Date.now() + 300_000) / 1000);
    const token = createMockJwt({ exp: futureExp });
    assert.equal(isSessionExpiring(undefined, token, 60_000), false);

    const soonExp = Math.floor((Date.now() + 30_000) / 1000);
    const expiringToken = createMockJwt({ exp: soonExp });
    assert.equal(isSessionExpiring(undefined, expiringToken, 60_000), true);
  });

  await t.test('9. isRecoverableAuthError detects JWT expiration and auth failures', () => {
    assert.equal(isRecoverableAuthError(new Error('jwt expired')), true);
    assert.equal(isRecoverableAuthError(new Error('Sesi kedaluwarsa')), true);
    assert.equal(isRecoverableAuthError(new Error('invalid jwt token')), true);
    assert.equal(isRecoverableAuthError(new Error('bad_jwt')), true);
    assert.equal(isRecoverableAuthError(new Error('Unauthorized: No authorization header provided')), true);
  });

  await t.test('10. isRecoverableAuthError rejects non-auth or fatal errors', () => {
    assert.equal(isRecoverableAuthError(new Error('Network connection timeout')), false);
    assert.equal(isRecoverableAuthError(new Error('Rate limit reached')), false);
    assert.equal(isRecoverableAuthError(new Error('AI model quota exceeded')), false);
    assert.equal(isRecoverableAuthError(new Error('Forbidden: Operasi ini hanya diizinkan untuk peran Guru.')), false);
    assert.equal(isRecoverableAuthError(new Error('Forbidden: Profil pengguna tidak ditemukan.')), false);
  });
});
