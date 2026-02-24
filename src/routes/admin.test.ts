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
    const adminAuth = tokenService.createToken('admin@example.com', 'Admin', 'admin');
    const target = tokenService.createToken('user@example.com', 'User', 'read');

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminAuth.token}`,
      },
      body: JSON.stringify({ token: target.token }),
    });

    expect(response.status).toBe(200);
    const json = await response.json() as { jti: string };
    expect(json.jti).toBe(target.payload.jti);
    expect(await storage.isTokenRevoked(target.payload.jti)).toBe(true);
  });

  it('rejects schedule role for admin endpoint', async () => {
    const schedulerAuth = tokenService.createToken('scheduler@example.com', 'Scheduler', 'schedule');
    const target = tokenService.createToken('user@example.com', 'User', 'read');

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${schedulerAuth.token}`,
      },
      body: JSON.stringify({ token: target.token }),
    });

    expect(response.status).toBe(403);
    expect(await storage.isTokenRevoked(target.payload.jti)).toBe(false);
  });

  it('returns 400 when token is missing', async () => {
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

  it('returns 400 for invalid token to revoke', async () => {
    const { token } = tokenService.createToken('admin@example.com', 'Admin', 'admin');

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token: 'not-a-real-token' }),
    });

    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toContain('could not decrypt');
  });

  it('logs the revocation with caller details', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adminAuth = tokenService.createToken('admin@example.com', 'Admin', 'admin');
    const target = tokenService.createToken('victim@example.com', 'Victim', 'read');

    await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminAuth.token}`,
      },
      body: JSON.stringify({ token: target.token }),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      `Token revoked: jti=${target.payload.jti} by=admin@example.com (Admin)`,
    );
    consoleSpy.mockRestore();
  });
});
