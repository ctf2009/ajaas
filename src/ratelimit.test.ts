import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimiter } from './middleware/ratelimit.js';

describe('Rate Limiting', () => {
  function createApp() {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        max: 3,
        windowMs: 60_000,
        keyGenerator: (c) => c.req.header('x-client-id') || 'ip:127.0.0.1',
      }),
    );
    app.get('/test', (c) => c.json({ message: 'ok' }));
    return app;
  }

  it('should allow requests under the limit', async () => {
    const response = await createApp().request('http://localhost/test');
    expect(response.status).toBe(200);
  });

  it('should return 429 when rate limit exceeded', async () => {
    const app = createApp();
    for (let i = 0; i < 3; i++) {
      await app.request('http://localhost/test');
    }

    const response = await app.request('http://localhost/test');
    expect(response.status).toBe(429);
  });

  it('should include rate limit headers', async () => {
    const response = await createApp().request('http://localhost/test');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
  });
});

describe('Rate Limit Key Generator', () => {
  it('should use different keys for different identifiers', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        max: 2,
        windowMs: 60_000,
        keyGenerator: (c) => {
          const auth = c.req.header('x-api-key');
          return auth ? `key:${auth}` : 'ip:127.0.0.1';
        },
      }),
    );
    app.get('/test', (c) => c.json({ message: 'ok' }));

    await app.request('http://localhost/test', { headers: { 'x-api-key': 'user1' } });
    await app.request('http://localhost/test', { headers: { 'x-api-key': 'user1' } });
    const limitedResponse = await app.request('http://localhost/test', {
      headers: { 'x-api-key': 'user1' },
    });
    expect(limitedResponse.status).toBe(429);

    const user2Response = await app.request('http://localhost/test', {
      headers: { 'x-api-key': 'user2' },
    });
    expect(user2Response.status).toBe(200);
  });
});
