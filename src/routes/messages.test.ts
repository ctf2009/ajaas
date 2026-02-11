import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { messageRoutes } from './messages.js';
import { MessageService } from '../services/messages.js';

type MessageBody = { message: string };
type ErrorBody = { error: string };
type TypesBody = { types: string[] };

function createApp(toughLove: boolean = true): Hono {
  const app = new Hono();
  const messageService = new MessageService(toughLove);
  app.route('/api', messageRoutes(messageService));
  return app;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('Message Routes', () => {
  describe('GET /api/awesome/:name', () => {
    it('should return a simple message', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel');
      expect(response.status).toBe(200);
      const body = await readJson<MessageBody>(response);
      expect(body.message).toBe('Awesome job, Rachel!');
    });

    it('should include attribution when from is provided', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel?from=Mike');
      expect(response.status).toBe(200);
      const body = await readJson<MessageBody>(response);
      expect(body.message).toBe('Awesome job, Rachel! - Mike');
    });

    it('should handle URL-encoded names', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel%20Jane');
      expect(response.status).toBe(200);
      const body = await readJson<MessageBody>(response);
      expect(body.message).toContain('Rachel Jane');
    });
  });

  describe('GET /api/weekly/:name', () => {
    it('should return a weekly message with days off', async () => {
      const response = await createApp().request('http://localhost/api/weekly/Mike');
      expect(response.status).toBe(200);
      const body = await readJson<MessageBody>(response);
      expect(body.message).toMatch(/Awesome job this week, Mike\. Take the next \d+ days off\./);
    });

    it('should include attribution when from is provided', async () => {
      const response = await createApp().request('http://localhost/api/weekly/Mike?from=Boss');
      expect(response.status).toBe(200);
      const body = await readJson<MessageBody>(response);
      expect(body.message).toContain('- Boss');
    });
  });

  describe('GET /api/random/:name', () => {
    it('should return a random message containing the name', async () => {
      const response = await createApp().request('http://localhost/api/random/Alex');
      expect(response.status).toBe(200);
      const body = await readJson<MessageBody>(response);
      expect(body.message).toContain('Alex');
    });
  });

  describe('GET /api/message/:type/:name', () => {
    it('should return a message of the specified type', async () => {
      const response = await createApp().request('http://localhost/api/message/animal/Rachel');
      expect(response.status).toBe(200);
      const body = await readJson<MessageBody>(response);
      expect(body.message).toContain('Rachel');
    });

    it('should return 400 for invalid type', async () => {
      const response = await createApp().request('http://localhost/api/message/invalid/Rachel');
      expect(response.status).toBe(400);
      const body = await readJson<ErrorBody>(response);
      expect(body.error).toBeTruthy();
    });

    it('should include attribution when from is provided', async () => {
      const response = await createApp().request(
        'http://localhost/api/message/absurd/Rachel?from=Team',
      );
      expect(response.status).toBe(200);
      const body = await readJson<MessageBody>(response);
      expect(body.message).toContain('- Team');
    });
  });

  describe('GET /api/types', () => {
    it('should return available message types', async () => {
      const response = await createApp().request('http://localhost/api/types');
      expect(response.status).toBe(200);
      const body = await readJson<TypesBody>(response);
      expect(body.types).toContain('animal');
      expect(body.types).toContain('absurd');
      expect(body.types).toContain('meta');
      expect(body.types).toContain('unexpected');
      expect(body.types).toContain('toughLove');
    });
  });

  describe('Content negotiation', () => {
    it('should return text/plain when Accept: text/plain', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel', {
        headers: { accept: 'text/plain' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(await response.text()).toBe('Awesome job, Rachel!');
    });

    it('should return JSON by default', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      const body = await readJson<MessageBody>(response);
      expect(body.message).toBe('Awesome job, Rachel!');
    });

    it('should return JSON when Accept: application/json', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel', {
        headers: { accept: 'application/json' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      const body = await readJson<MessageBody>(response);
      expect(body.message).toBe('Awesome job, Rachel!');
    });

    it('should prefer text/plain when listed first in Accept', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel', {
        headers: { accept: 'text/plain, application/json' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(await response.text()).toBe('Awesome job, Rachel!');
    });

    it('should prefer JSON when listed first in Accept', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel', {
        headers: { accept: 'application/json, text/plain' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should return text/plain for weekly endpoint', async () => {
      const response = await createApp().request('http://localhost/api/weekly/Mike', {
        headers: { accept: 'text/plain' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(await response.text()).toMatch(/Awesome job this week, Mike/);
    });

    it('should return text/plain for random endpoint', async () => {
      const response = await createApp().request('http://localhost/api/random/Alex', {
        headers: { accept: 'text/plain' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(await response.text()).toContain('Alex');
    });

    it('should return text/plain for message type endpoint', async () => {
      const response = await createApp().request('http://localhost/api/message/animal/Rachel', {
        headers: { accept: 'text/plain' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(await response.text()).toContain('Rachel');
    });

    it('should include attribution in text/plain response', async () => {
      const response = await createApp().request('http://localhost/api/awesome/Rachel?from=Mike', {
        headers: { accept: 'text/plain' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(await response.text()).toBe('Awesome job, Rachel! - Mike');
    });
  });

  describe('with tough love disabled', () => {
    it('should not include toughLove in types', async () => {
      const response = await createApp(false).request('http://localhost/api/types');
      const body = await readJson<TypesBody>(response);
      expect(body.types).not.toContain('toughLove');
    });

    it('should return 404 for toughLove type', async () => {
      const response = await createApp(false).request(
        'http://localhost/api/message/toughLove/Rachel',
      );
      expect(response.status).toBe(404);
    });
  });
});
