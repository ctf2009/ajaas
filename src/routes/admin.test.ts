import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jti: 'to-revoke' }),
    });

    expect(response.status).toBe(200);
    expect(await storage.isTokenRevoked('to-revoke')).toBe(true);
  });

  it('rejects schedule role for admin endpoint', async () => {
    const { token } = tokenService.createToken('scheduler@example.com', 'Scheduler', 'schedule');

    const response = await app.request('http://localhost/api/admin/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jti: 'to-revoke' }),
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
});
