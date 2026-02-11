import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { messageRoutes } from './messages.js';
import { Config } from '../config.js';

describe('Message Routes', () => {
  let app: FastifyInstance;

  const createApp = async (toughLove: boolean = true): Promise<FastifyInstance> => {
    const fastify = Fastify();
    const config: Config = {
      port: 3000,
      host: '0.0.0.0',
      web: { enabled: false },
      endpoints: { schedule: { enabled: false } },
      security: { enabled: false, encryptionKey: '' },
      messages: { toughLove },
      cors: { origin: '*' },
      rateLimit: { enabled: false, max: 100, timeWindow: '1 minute' },
      database: { path: ':memory:', dataEncryptionKey: '' },
      smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: 'ajaas@example.com' },
    };
    await fastify.register(messageRoutes, { prefix: '/api', config });
    return fastify;
  };

  beforeEach(async () => {
    app = await createApp(true);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/awesome/:name', () => {
    it('should return a simple message', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Awesome job, Rachel!');
    });

    it('should include attribution when from is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel?from=Mike',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Awesome job, Rachel! - Mike');
    });

    it('should handle URL-encoded names', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel%20Jane',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Rachel Jane');
    });
  });

  describe('GET /api/weekly/:name', () => {
    it('should return a weekly message with days off', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/weekly/Mike',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toMatch(/Awesome job this week, Mike\. Take the next \d+ days off\./);
    });

    it('should include attribution when from is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/weekly/Mike?from=Boss',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('- Boss');
    });
  });

  describe('GET /api/random/:name', () => {
    it('should return a random message containing the name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/random/Alex',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Alex');
    });
  });

  describe('GET /api/message/:type/:name', () => {
    it('should return a message of the specified type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/message/animal/Rachel',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Rachel');
    });

    it('should return 400 for invalid type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/message/invalid/Rachel',
      });

      expect(response.statusCode).toBe(400);
      // Fastify schema validation returns a different error format
      const body = JSON.parse(response.body);
      expect(body.message || body.error).toBeTruthy();
    });

    it('should include attribution when from is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/message/absurd/Rachel?from=Team',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('- Team');
    });
  });

  describe('GET /api/types', () => {
    it('should return available message types', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/types',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.types).toContain('animal');
      expect(body.types).toContain('absurd');
      expect(body.types).toContain('meta');
      expect(body.types).toContain('unexpected');
      expect(body.types).toContain('toughLove');
    });
  });

  describe('Content negotiation', () => {
    it('should return text/plain when Accept: text/plain', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel',
        headers: { accept: 'text/plain' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toBe('Awesome job, Rachel!');
    });

    it('should return JSON by default', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Awesome job, Rachel!');
    });

    it('should return JSON when Accept: application/json', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel',
        headers: { accept: 'application/json' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Awesome job, Rachel!');
    });

    it('should prefer text/plain when listed first in Accept', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel',
        headers: { accept: 'text/plain, application/json' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toBe('Awesome job, Rachel!');
    });

    it('should prefer JSON when listed first in Accept', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel',
        headers: { accept: 'application/json, text/plain' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return text/plain for weekly endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/weekly/Mike',
        headers: { accept: 'text/plain' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toMatch(/Awesome job this week, Mike/);
    });

    it('should return text/plain for random endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/random/Alex',
        headers: { accept: 'text/plain' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('Alex');
    });

    it('should return text/plain for message type endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/message/animal/Rachel',
        headers: { accept: 'text/plain' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('Rachel');
    });

    it('should include attribution in text/plain response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Rachel?from=Mike',
        headers: { accept: 'text/plain' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toBe('Awesome job, Rachel! - Mike');
    });
  });

  describe('with tough love disabled', () => {
    beforeEach(async () => {
      await app.close();
      app = await createApp(false);
    });

    it('should not include toughLove in types', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/types',
      });

      const body = JSON.parse(response.body);
      expect(body.types).not.toContain('toughLove');
    });

    it('should return 404 for toughLove type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/message/toughLove/Rachel',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
