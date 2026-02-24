import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { adminRoutes } from './admin.js';
import { TokenService } from '../auth/token.js';
import { SQLiteStorage } from '../storage/sqlite.js';

const ENCRYPTION_KEY = 'this-is-a-32-character-test-key!';

describe('adminRoutes', () => {
  let tokenService: TokenService;
  let storage: SQLiteStorage;
  let app: Hono;

  beforeEach(() => {
    tokenService = new TokenService(ENCRYPTION_KEY);
    storage = new SQLiteStorage(':memory:');
    app = new Hono();
    app.route('/api', adminRoutes(storage, tokenService));
  });

  afterEach(async () => {
    await storage.close();
  });

  it('revokes a token for admin role', async () => {
    const { token } = tokenService.createToken('admin@example.com', 'Admin', 'admin');
    const futureExp = Math.floor(Date.now() / 1000) + 86400;

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jti: 'to-revoke', exp: futureExp }),
    });

    expect(response.status).toBe(200);
    expect(await storage.isTokenRevoked('to-revoke')).toBe(true);
  });

  it('rejects schedule role for admin endpoint', async () => {
    const { token } = tokenService.createToken('scheduler@example.com', 'Scheduler', 'schedule');
    const futureExp = Math.floor(Date.now() / 1000) + 86400;

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jti: 'to-revoke', exp: futureExp }),
    });

    expect(response.status).toBe(403);
    expect(await storage.isTokenRevoked('to-revoke')).toBe(false);
  });

  it('returns 400 when jti is missing', async () => {
    const { token } = tokenService.createToken('admin@example.com', 'Admin', 'admin');

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('returns 400 when exp is missing', async () => {
    const { token } = tokenService.createToken('admin@example.com', 'Admin', 'admin');

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jti: 'to-revoke' }),
    });

    expect(response.status).toBe(400);
  });

  it('logs the revocation with caller details', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { token } = tokenService.createToken('admin@example.com', 'Admin', 'admin');
    const futureExp = Math.floor(Date.now() / 1000) + 86400;

    await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jti: 'target-jti', exp: futureExp }),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Token revoked: jti=target-jti by=admin@example.com (Admin)',
    );
    consoleSpy.mockRestore();
  });
});
