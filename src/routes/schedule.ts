import { Hono } from 'hono';
import { Storage } from '../storage/interface.js';
import { TokenService } from '../auth/token.js';
import { createAuthMiddleware, AuthEnv } from '../auth/middleware.js';
import { Scheduler } from '../scheduler/index.js';

interface CreateScheduleBody {
  recipient: string;
  recipientEmail: string;
  endpoint: string;
  messageType?: string;
  from?: string;
  cron: string;
  deliveryMethod?: 'email' | 'webhook';
  webhookUrl?: string;
  webhookSecret?: string;
}

function formatScheduleResponse(schedule: any) {
  const { webhookSecret, ...rest } = schedule;
  return {
    ...rest,
    nextRun: new Date(schedule.nextRun * 1000).toISOString(),
    createdAt: new Date(schedule.createdAt * 1000).toISOString(),
    webhookSecretSet: !!webhookSecret,
  };
}

export function scheduleRoutes(
  storage: Storage,
  tokenService: TokenService,
  scheduler: Scheduler,
): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  const requireAuth = createAuthMiddleware(
    tokenService,
    (jti) => storage.isTokenRevoked(jti),
  );

  // POST /schedule - Create a new schedule
  app.post('/schedule', requireAuth('schedule'), async (c) => {
    const body = await c.req.json<CreateScheduleBody>();
    const {
      recipient, recipientEmail, endpoint, messageType, from,
      cron, deliveryMethod, webhookUrl, webhookSecret,
    } = body;

    // Validate cron expression
    const nextRun = scheduler.calculateNextRun(cron);
    if (!nextRun) {
      return c.json({ error: 'Invalid cron expression' }, 400);
    }

    // Validate messageType is provided when endpoint is 'message'
    if (endpoint === 'message' && !messageType) {
      return c.json({ error: 'messageType is required when endpoint is "message"' }, 400);
    }

    // Validate webhookUrl is provided when deliveryMethod is 'webhook'
    const method = deliveryMethod || 'email';
    if (method === 'webhook' && !webhookUrl) {
      return c.json({ error: 'webhookUrl is required when deliveryMethod is "webhook"' }, 400);
    }

    const tokenPayload = c.get('tokenPayload');
    const schedule = await storage.createSchedule({
      recipient,
      recipientEmail,
      endpoint,
      messageType,
      from,
      cron,
      nextRun,
      deliveryMethod: method,
      webhookUrl,
      webhookSecret,
      createdBy: tokenPayload.sub,
    });

    return c.json(formatScheduleResponse(schedule), 201);
  });

  // GET /schedule - List schedules
  app.get('/schedule', requireAuth('schedule'), async (c) => {
    const tokenPayload = c.get('tokenPayload');
    const schedules = await storage.listSchedules(tokenPayload.sub);
    return c.json({
      schedules: schedules.map(formatScheduleResponse),
    });
  });

  // GET /schedule/:id - Get a specific schedule
  app.get('/schedule/:id', requireAuth('schedule'), async (c) => {
    const id = c.req.param('id');
    const schedule = await storage.getSchedule(id);

    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    // Only allow viewing own schedules
    const tokenPayload = c.get('tokenPayload');
    if (schedule.createdBy !== tokenPayload.sub) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    return c.json(formatScheduleResponse(schedule));
  });

  // DELETE /schedule/:id - Delete a schedule
  app.delete('/schedule/:id', requireAuth('schedule'), async (c) => {
    const id = c.req.param('id');
    const schedule = await storage.getSchedule(id);

    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    // Only allow deleting own schedules
    const tokenPayload = c.get('tokenPayload');
    if (schedule.createdBy !== tokenPayload.sub) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    await storage.deleteSchedule(id);
    return c.json({ success: true });
  });

  return app;
}
