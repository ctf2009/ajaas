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
      rateLimit: { enabled: false, max: 100, timeWindow: '1 minute' },
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
        url: '/api/awesome/Sarah',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Awesome job, Sarah!');
    });

    it('should include attribution when from is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Sarah?from=Mike',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Awesome job, Sarah! - Mike');
    });

    it('should handle URL-encoded names', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/awesome/Sarah%20Jane',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Sarah Jane');
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
        url: '/api/message/animal/Sarah',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Sarah');
    });

    it('should return 400 for invalid type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/message/invalid/Sarah',
      });

      expect(response.statusCode).toBe(400);
      // Fastify schema validation returns a different error format
      const body = JSON.parse(response.body);
      expect(body.message || body.error).toBeTruthy();
    });

    it('should include attribution when from is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/message/absurd/Sarah?from=Team',
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
        url: '/api/message/toughLove/Sarah',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
