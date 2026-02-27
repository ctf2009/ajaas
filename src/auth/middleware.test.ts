import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createAuthMiddleware, createOptionalAuthMiddleware, AuthEnv } from './middleware.js';
import { TokenService, TokenPayload } from './token.js';

const ENCRYPTION_KEY = 'this-is-a-32-character-test-key!';

function makeApp(
  tokenService: TokenService,
  isRevoked: (jti: string) => Promise<boolean> = async () => false,
) {
  const app = new Hono<AuthEnv>();
  const requireAuth = createAuthMiddleware(tokenService, isRevoked);

  app.get('/read-only', requireAuth('read'), (c) => {
    const payload = c.get('tokenPayload');
    return c.json({ sub: payload.sub, role: payload.role });
  });

  app.get('/schedule-only', requireAuth('schedule'), (c) => {
    return c.json({ ok: true });
  });

  app.get('/admin-only', requireAuth('admin'), (c) => {
    return c.json({ ok: true });
  });

  return app;
}

function makeOptionalApp(tokenService: TokenService) {
  const app = new Hono<AuthEnv>();
  app.use(createOptionalAuthMiddleware(tokenService));
  app.get('/optional', (c) => {
    const payload = c.get('tokenPayload');
    return c.json({ authenticated: !!payload, sub: payload?.sub ?? null });
  });
  return app;
}

describe('createAuthMiddleware', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService(ENCRYPTION_KEY);
  });

  it('returns 401 when authorization header is absent', async () => {
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/read-only');
    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('Missing authorization header');
  });

  it('returns 401 for an invalid token', async () => {
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/read-only', {
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('Invalid token');
  });

  it('returns 401 for an expired token', async () => {
    const expiredPayload: TokenPayload = {
      jti: 'expired-jti',
      sub: 'user@example.com',
      name: 'User',
      role: 'read',
      exp: Math.floor(Date.now() / 1000) - 3600,
    };
    const token = tokenService.encrypt(expiredPayload);
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/read-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('expired');
  });

  it('returns 401 for a revoked token', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'read');
    const isRevoked = vi.fn().mockResolvedValue(true);
    const app = makeApp(tokenService, isRevoked);
    const res = await app.request('http://localhost/read-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('revoked');
  });

  it('returns 403 when token role is insufficient', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'read');
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/schedule-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('schedule');
  });

  it('returns 403 when schedule role attempts admin endpoint', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'schedule');
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/admin-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('sets tokenPayload and calls next on success', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'read');
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/read-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { sub: string; role: string };
    expect(json.sub).toBe('user@example.com');
    expect(json.role).toBe('read');
  });

  it('accepts "Bearer <token>" format', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'read');
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/read-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('accepts plain token without Bearer prefix', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'read');
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/read-only', {
      headers: { authorization: token },
    });
    expect(res.status).toBe(200);
  });

  it('allows schedule role to access read-only endpoint (hierarchy)', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'schedule');
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/read-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('allows admin role to access schedule-only endpoint (hierarchy)', async () => {
    const { token } = tokenService.createToken('admin@example.com', 'Admin', 'admin');
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/schedule-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('allows admin role to access admin endpoint', async () => {
    const { token } = tokenService.createToken('admin@example.com', 'Admin', 'admin');
    const app = makeApp(tokenService);
    const res = await app.request('http://localhost/admin-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('calls isRevoked with the token jti', async () => {
    const { token, payload } = tokenService.createToken('user@example.com', 'User', 'read');
    const isRevoked = vi.fn().mockResolvedValue(false);
    const app = makeApp(tokenService, isRevoked);
    await app.request('http://localhost/read-only', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(isRevoked).toHaveBeenCalledWith(payload.jti);
  });
});

describe('createOptionalAuthMiddleware', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService(ENCRYPTION_KEY);
  });

  it('proceeds without setting tokenPayload when no auth header', async () => {
    const app = makeOptionalApp(tokenService);
    const res = await app.request('http://localhost/optional');
    expect(res.status).toBe(200);
    const json = await res.json() as { authenticated: boolean };
    expect(json.authenticated).toBe(false);
  });

  it('sets tokenPayload when a valid token is provided', async () => {
    const { token } = tokenService.createToken('user@example.com', 'User', 'read');
    const app = makeOptionalApp(tokenService);
    const res = await app.request('http://localhost/optional', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { authenticated: boolean; sub: string };
    expect(json.authenticated).toBe(true);
    expect(json.sub).toBe('user@example.com');
  });

  it('proceeds without 401 for an invalid token', async () => {
    const app = makeOptionalApp(tokenService);
    const res = await app.request('http://localhost/optional', {
      headers: { authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { authenticated: boolean };
    expect(json.authenticated).toBe(false);
  });

  it('proceeds without tokenPayload for an expired token (no 401)', async () => {
    const expiredPayload: TokenPayload = {
      jti: 'expired-jti',
      sub: 'user@example.com',
      name: 'User',
      role: 'read',
      exp: Math.floor(Date.now() / 1000) - 3600,
    };
    const token = tokenService.encrypt(expiredPayload);
    const app = makeOptionalApp(tokenService);
    const res = await app.request('http://localhost/optional', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { authenticated: boolean };
    expect(json.authenticated).toBe(false);
  });
});
