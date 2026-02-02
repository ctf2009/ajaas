import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

describe('Rate Limiting', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    await app.register(fastifyRateLimit, {
      max: 3,
      timeWindow: '1 minute',
      keyGenerator: (request) => request.ip,
    });

    app.get('/test', async () => {
      return { message: 'ok' };
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should allow requests under the limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should return 429 when rate limit exceeded', async () => {
    // Make requests up to the limit
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'GET', url: '/test' });
    }

    // This request should be rate limited
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(429);
  });

  it('should include rate limit headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.headers['x-ratelimit-limit']).toBe('3');
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
  });
});

describe('Rate Limit Key Generator', () => {
  it('should use different keys for different identifiers', async () => {
    const app = Fastify();

    await app.register(fastifyRateLimit, {
      max: 2,
      timeWindow: '1 minute',
      keyGenerator: (request) => {
        // Simulate: use auth header if present, otherwise IP
        const auth = request.headers['x-api-key'];
        return auth ? `key:${auth}` : `ip:${request.ip}`;
      },
    });

    app.get('/test', async () => ({ message: 'ok' }));

    // Make 2 requests with key "user1" (should exhaust limit)
    await app.inject({ method: 'GET', url: '/test', headers: { 'x-api-key': 'user1' } });
    await app.inject({ method: 'GET', url: '/test', headers: { 'x-api-key': 'user1' } });

    // Third request with "user1" should be rate limited
    const limitedResponse = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-api-key': 'user1' },
    });
    expect(limitedResponse.statusCode).toBe(429);

    // But "user2" should still work (different key)
    const user2Response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-api-key': 'user2' },
    });
    expect(user2Response.statusCode).toBe(200);

    await app.close();
  });
});
