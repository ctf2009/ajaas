import { swaggerUI } from '@hono/swagger-ui';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { TokenService } from './auth/token.js';
import type { Config } from './config.js';
import { rateLimiter } from './middleware/ratelimit.js';
import { openApiSpec } from './openapi.js';
import { messageRoutes } from './routes/messages.js';
import { scheduleRoutes } from './routes/schedule.js';
import { MessageService } from './services/messages.js';
import type { Scheduler } from './scheduler/index.js';
import type { Storage } from './storage/interface.js';

interface AppOptions {
  config: Config;
  messageService: MessageService;
  tokenService?: TokenService | null;
  storage?: Storage | null;
  scheduler?: Scheduler | null;
}

function parseRateLimitWindow(window: string): number {
  const trimmed = window.trim();
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && asNumber > 0) {
    return asNumber;
  }

  const match = /^(\d+)\s*(second|minute|hour|day)s?$/i.exec(trimmed);
  if (!match) {
    return 60_000;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'second') return value * 1000;
  if (unit === 'minute') return value * 60_000;
  if (unit === 'hour') return value * 3_600_000;
  return value * 86_400_000;
}

function getClientIdentifier(c: Context): string {
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

export function createApp(options: AppOptions): Hono {
  const { config, messageService, tokenService, storage, scheduler } = options;
  const app = new Hono();

  if (config.rateLimit.enabled) {
    app.use(
      '/api/*',
      rateLimiter({
        max: config.rateLimit.max,
        windowMs: parseRateLimitWindow(config.rateLimit.timeWindow),
        keyGenerator: (c) => {
          const authHeader = c.req.header('authorization');
          if (authHeader && tokenService) {
            const token = authHeader.startsWith('Bearer ')
              ? authHeader.slice(7)
              : authHeader;
            const payload = tokenService.decrypt(token);
            if (payload && !tokenService.isExpired(payload)) {
              return `key:${payload.sub}`;
            }
          }
          return `ip:${getClientIdentifier(c)}`;
        },
      }),
    );
  }

  app.route('/api', messageRoutes(messageService));

  const schedulingActive =
    config.endpoints.schedule.enabled &&
    !!tokenService &&
    !!storage &&
    !!scheduler;

  if (schedulingActive) {
    app.route('/api', scheduleRoutes(storage, tokenService, scheduler));
  }

  app.get('/api/openapi.json', (c) => c.json(openApiSpec));
  app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      scheduling: schedulingActive,
      security: config.security.enabled,
      web: config.web.enabled,
      rateLimit: config.rateLimit.enabled,
    }),
  );

  app.notFound((c) => {
    if (c.req.path.startsWith('/api')) {
      return c.json({ error: 'Not found' }, 404);
    }
    return c.json({ error: 'Not found' }, 404);
  });

  return app;
}
