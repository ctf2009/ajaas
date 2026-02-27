import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { scheduleRoutes } from './schedule.js';
import { TokenService } from '../auth/token.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { Scheduler } from '../scheduler/index.js';

const ENCRYPTION_KEY = 'this-is-a-32-character-test-key!';

function makeScheduler(nextRun: number | null = Math.floor(Date.now() / 1000) + 3600) {
  return { calculateNextRun: vi.fn().mockReturnValue(nextRun) } as unknown as Scheduler;
}

type ScheduleBody = {
  id: string;
  recipient: string;
  recipientEmail: string;
  endpoint: string;
  messageType?: string;
  cron: string;
  nextRun: string;
  createdAt: string;
  deliveryMethod: string;
  webhookSecretSet: boolean;
};

type ErrorBody = { error: string };

const VALID_BODY = {
  recipient: 'Rachel',
  recipientEmail: 'rachel@example.com',
  endpoint: 'weekly',
  cron: '0 17 * * FRI',
};

describe('scheduleRoutes', () => {
  let tokenService: TokenService;
  let storage: SQLiteStorage;
  let scheduler: Scheduler;
  let app: Hono;

  beforeEach(() => {
    tokenService = new TokenService(ENCRYPTION_KEY);
    storage = new SQLiteStorage(':memory:');
    scheduler = makeScheduler();
    app = new Hono();
    app.route('/api', scheduleRoutes(storage, tokenService, scheduler));
  });

  afterEach(async () => {
    await storage.close();
  });

  function scheduleToken() {
    return tokenService.createToken('user@example.com', 'User', 'schedule').token;
  }

  function readToken() {
    return tokenService.createToken('user@example.com', 'User', 'read').token;
  }

  function otherScheduleToken() {
    return tokenService.createToken('other@example.com', 'Other', 'schedule').token;
  }

  async function createSchedule(token: string, body: Record<string, unknown> = VALID_BODY) {
    return app.request('http://localhost/api/schedule', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  describe('POST /schedule', () => {
    it('returns 401 without authorization header', async () => {
      const res = await app.request('http://localhost/api/schedule', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for read role', async () => {
      const res = await createSchedule(readToken());
      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid JSON body', async () => {
      const res = await app.request('http://localhost/api/schedule', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${scheduleToken()}`,
        },
        body: 'not-json',
      });
      expect(res.status).toBe(400);
      const json = await res.json() as ErrorBody;
      expect(json.error).toContain('Invalid JSON');
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await createSchedule(scheduleToken(), { recipient: 'Rachel' });
      expect(res.status).toBe(400);
      const json = await res.json() as ErrorBody;
      expect(json.error).toContain('Missing required fields');
    });

    it('returns 400 for invalid cron expression', async () => {
      (scheduler.calculateNextRun as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
      const res = await createSchedule(scheduleToken(), { ...VALID_BODY, cron: 'not-a-cron' });
      expect(res.status).toBe(400);
      const json = await res.json() as ErrorBody;
      expect(json.error).toContain('Invalid cron');
    });

    it('returns 400 when endpoint is "message" but messageType is missing', async () => {
      const res = await createSchedule(scheduleToken(), { ...VALID_BODY, endpoint: 'message' });
      expect(res.status).toBe(400);
      const json = await res.json() as ErrorBody;
      expect(json.error).toContain('messageType');
    });

    it('returns 400 when deliveryMethod is "webhook" but webhookUrl is missing', async () => {
      const res = await createSchedule(scheduleToken(), { ...VALID_BODY, deliveryMethod: 'webhook' });
      expect(res.status).toBe(400);
      const json = await res.json() as ErrorBody;
      expect(json.error).toContain('webhookUrl');
    });

    it('returns 201 with schedule on success', async () => {
      const res = await createSchedule(scheduleToken());
      expect(res.status).toBe(201);
      const json = await res.json() as ScheduleBody;
      expect(json.id).toBeTruthy();
      expect(json.recipient).toBe('Rachel');
      expect(json.recipientEmail).toBe('rachel@example.com');
      expect(json.endpoint).toBe('weekly');
      expect(json.cron).toBe('0 17 * * FRI');
    });

    it('returns ISO timestamps for nextRun and createdAt', async () => {
      const res = await createSchedule(scheduleToken());
      const json = await res.json() as ScheduleBody;
      expect(json.nextRun).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(json.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(new Date(json.nextRun).getTime()).toBeGreaterThan(0);
      expect(new Date(json.createdAt).getTime()).toBeGreaterThan(0);
    });

    it('hides webhook secret and returns webhookSecretSet: true', async () => {
      const res = await createSchedule(scheduleToken(), {
        ...VALID_BODY,
        deliveryMethod: 'webhook',
        webhookUrl: 'https://example.com/hook',
        webhookSecret: 'mysecret',
      });
      expect(res.status).toBe(201);
      const json = await res.json() as Record<string, unknown>;
      expect(json.webhookSecret).toBeUndefined();
      expect(json.webhookSecretSet).toBe(true);
    });

    it('returns webhookSecretSet: false when no secret provided', async () => {
      const res = await createSchedule(scheduleToken(), {
        ...VALID_BODY,
        deliveryMethod: 'webhook',
        webhookUrl: 'https://example.com/hook',
      });
      const json = await res.json() as Record<string, unknown>;
      expect(json.webhookSecretSet).toBe(false);
    });

    it('accepts message endpoint with messageType', async () => {
      const res = await createSchedule(scheduleToken(), {
        ...VALID_BODY,
        endpoint: 'message',
        messageType: 'animal',
      });
      expect(res.status).toBe(201);
      const json = await res.json() as ScheduleBody;
      expect(json.endpoint).toBe('message');
    });

    it('defaults deliveryMethod to email', async () => {
      const res = await createSchedule(scheduleToken());
      const json = await res.json() as ScheduleBody;
      expect(json.deliveryMethod).toBe('email');
    });
  });

  describe('GET /schedule', () => {
    it('returns 401 without authorization header', async () => {
      const res = await app.request('http://localhost/api/schedule');
      expect(res.status).toBe(401);
    });

    it('returns 403 for read role', async () => {
      const res = await app.request('http://localhost/api/schedule', {
        headers: { authorization: `Bearer ${readToken()}` },
      });
      expect(res.status).toBe(403);
    });

    it('returns empty list when no schedules exist', async () => {
      const res = await app.request('http://localhost/api/schedule', {
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { schedules: ScheduleBody[] };
      expect(json.schedules).toEqual([]);
    });

    it('returns only own schedules', async () => {
      await createSchedule(scheduleToken());
      await createSchedule(otherScheduleToken());

      const res = await app.request('http://localhost/api/schedule', {
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      const json = await res.json() as { schedules: ScheduleBody[] };
      expect(json.schedules).toHaveLength(1);
      expect(json.schedules[0].recipient).toBe('Rachel');
    });

    it('returns multiple own schedules', async () => {
      await createSchedule(scheduleToken(), { ...VALID_BODY, recipient: 'Alice' });
      await createSchedule(scheduleToken(), { ...VALID_BODY, recipient: 'Bob' });

      const res = await app.request('http://localhost/api/schedule', {
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      const json = await res.json() as { schedules: ScheduleBody[] };
      expect(json.schedules).toHaveLength(2);
    });
  });

  describe('GET /schedule/:id', () => {
    it('returns 401 without authorization header', async () => {
      const res = await app.request('http://localhost/api/schedule/some-id');
      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await app.request('http://localhost/api/schedule/does-not-exist', {
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's schedule", async () => {
      const createRes = await createSchedule(otherScheduleToken());
      const { id } = await createRes.json() as ScheduleBody;

      const res = await app.request(`http://localhost/api/schedule/${id}`, {
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      expect(res.status).toBe(404);
    });

    it('returns own schedule', async () => {
      const createRes = await createSchedule(scheduleToken());
      const created = await createRes.json() as ScheduleBody;

      const res = await app.request(`http://localhost/api/schedule/${created.id}`, {
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json() as ScheduleBody;
      expect(json.id).toBe(created.id);
      expect(json.recipient).toBe('Rachel');
    });
  });

  describe('DELETE /schedule/:id', () => {
    it('returns 401 without authorization header', async () => {
      const res = await app.request('http://localhost/api/schedule/some-id', { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await app.request('http://localhost/api/schedule/does-not-exist', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's schedule", async () => {
      const createRes = await createSchedule(otherScheduleToken());
      const { id } = await createRes.json() as ScheduleBody;

      const res = await app.request(`http://localhost/api/schedule/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      expect(res.status).toBe(404);
    });

    it('deletes own schedule and returns success', async () => {
      const createRes = await createSchedule(scheduleToken());
      const { id } = await createRes.json() as ScheduleBody;

      const res = await app.request(`http://localhost/api/schedule/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { success: boolean };
      expect(json.success).toBe(true);
    });

    it('schedule is no longer accessible after deletion', async () => {
      const createRes = await createSchedule(scheduleToken());
      const { id } = await createRes.json() as ScheduleBody;

      await app.request(`http://localhost/api/schedule/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });

      const getRes = await app.request(`http://localhost/api/schedule/${id}`, {
        headers: { authorization: `Bearer ${scheduleToken()}` },
      });
      expect(getRes.status).toBe(404);
    });
  });
});
