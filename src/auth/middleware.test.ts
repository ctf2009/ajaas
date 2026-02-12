import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createAuthMiddleware, createOptionalAuthMiddleware } from './middleware.js';
import { TokenService, type Role, type TokenPayload } from './token.js';

const tokenService = new TokenService('12345678901234567890123456789012');

function createProtectedApp(requiredRole: Role, isRevoked: (jti: string) => Promise<boolean>) {
  const app = new Hono();
  const requireAuth = createAuthMiddleware(tokenService, isRevoked);

  app.get('/protected', requireAuth(requiredRole), (c) => {
    const payload = (c as any).get('tokenPayload') as TokenPayload;
    return c.json({ sub: payload.sub, role: payload.role });
  });

  return app;
}

describe('createAuthMiddleware', () => {
  it('returns 401 when authorization header is missing', async () => {
    const response = await createProtectedApp('read', async () => false).request(
      'http://localhost/protected',
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Missing authorization header' });
  });

  it('returns 401 when token is invalid', async () => {
    const response = await createProtectedApp('read', async () => false).request(
      'http://localhost/protected',
      {
        headers: { authorization: 'Bearer invalid-token' },
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid token' });
  });

  it('returns 401 when token is expired', async () => {
    const expiredPayload: TokenPayload = {
      jti: 'expired-token',
      sub: 'expired@example.com',
      name: 'Expired',
      role: 'read',
      exp: Math.floor(Date.now() / 1000) - 60,
    };
    const expiredToken = tokenService.encrypt(expiredPayload);

    const response = await createProtectedApp('read', async () => false).request(
      'http://localhost/protected',
      {
        headers: { authorization: `Bearer ${expiredToken}` },
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Token expired' });
  });

  it('returns 401 when token is revoked', async () => {
    const { token } = tokenService.createToken('revoked@example.com', 'Revoked', 'read');
    const isRevoked = vi.fn(async () => true);

    const response = await createProtectedApp('read', isRevoked).request(
      'http://localhost/protected',
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Token revoked' });
    expect(isRevoked).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when token role is insufficient', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'read');

    const response = await createProtectedApp('schedule', async () => false).request(
      'http://localhost/protected',
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Insufficient permissions. Required role: schedule',
    });
  });

  it('allows valid Bearer tokens and sets tokenPayload', async () => {
    const { token, payload } = tokenService.createToken('schedule@example.com', 'Scheduler', 'schedule');

    const response = await createProtectedApp('schedule', async () => false).request(
      'http://localhost/protected',
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sub: payload.sub, role: payload.role });
  });

  it('accepts non-Bearer raw tokens', async () => {
    const { token } = tokenService.createToken('raw@example.com', 'Raw', 'read');

    const response = await createProtectedApp('read', async () => false).request(
      'http://localhost/protected',
      {
        headers: { authorization: token },
      },
    );

    expect(response.status).toBe(200);
  });
});

describe('createOptionalAuthMiddleware', () => {
  it('passes through when auth header is missing', async () => {
    const app = new Hono();
    app.use('*', createOptionalAuthMiddleware(tokenService) as any);
    app.get('/optional', (c) => c.json({ ok: true }));

    const response = await app.request('http://localhost/optional');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('sets tokenPayload when valid token is present', async () => {
    const { token, payload } = tokenService.createToken('optional@example.com', 'Optional', 'read');
    const app = new Hono();
    app.use('*', createOptionalAuthMiddleware(tokenService) as any);
    app.get('/optional', (c) => {
      const current = (c as any).get('tokenPayload') as TokenPayload | undefined;
      return c.json({ sub: current?.sub ?? null });
    });

    const response = await app.request('http://localhost/optional', {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sub: payload.sub });
  });
});
