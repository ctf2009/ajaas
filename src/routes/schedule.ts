import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Config } from '../config.js';
import { Storage } from '../storage/interface.js';
import { TokenService } from '../auth/token.js';
import { createAuthMiddleware } from '../auth/middleware.js';
import { Scheduler } from '../scheduler/index.js';

interface ScheduleRouteOptions extends FastifyPluginOptions {
  config: Config;
  storage: Storage;
  tokenService: TokenService;
  scheduler: Scheduler;
}

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

interface IdParam {
  id: string;
}

const createScheduleBodySchema = {
  type: 'object',
  required: ['recipient', 'recipientEmail', 'endpoint', 'cron'],
  properties: {
    recipient: { type: 'string', description: 'Recipient name' },
    recipientEmail: { type: 'string', format: 'email', description: 'Recipient email' },
    endpoint: {
      type: 'string',
      enum: ['awesome', 'weekly', 'random', 'message'],
      description: 'Message endpoint to use',
    },
    messageType: {
      type: 'string',
      enum: ['animal', 'absurd', 'meta', 'unexpected', 'toughLove'],
      description: 'Message type (required if endpoint is "message")',
    },
    from: { type: 'string', description: 'Optional sender attribution' },
    cron: {
      type: 'string',
      description: 'Cron expression (e.g., "0 17 * * FRI" for every Friday at 5pm)',
    },
    deliveryMethod: {
      type: 'string',
      enum: ['email', 'webhook'],
      default: 'email',
      description: 'Delivery method',
    },
    webhookUrl: {
      type: 'string',
      format: 'uri',
      description: 'Webhook URL (required if deliveryMethod is "webhook")',
    },
    webhookSecret: {
      type: 'string',
      description: 'Optional secret for HMAC-SHA256 webhook signature',
    },
  },
} as const;

const scheduleResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    recipient: { type: 'string' },
    recipientEmail: { type: 'string' },
    endpoint: { type: 'string' },
    messageType: { type: 'string' },
    from: { type: 'string' },
    cron: { type: 'string' },
    nextRun: { type: 'string', format: 'date-time' },
    deliveryMethod: { type: 'string' },
    webhookUrl: { type: 'string' },
    webhookSecretSet: { type: 'boolean', description: 'Whether a webhook secret is configured' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const idParamSchema = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
} as const;

function formatScheduleResponse(schedule: any) {
  const { webhookSecret, ...rest } = schedule;
  return {
    ...rest,
    nextRun: new Date(schedule.nextRun * 1000).toISOString(),
    createdAt: new Date(schedule.createdAt * 1000).toISOString(),
    webhookSecretSet: !!webhookSecret,
  };
}

export async function scheduleRoutes(
  fastify: FastifyInstance,
  options: ScheduleRouteOptions
): Promise<void> {
  const { storage, tokenService, scheduler } = options;

  const requireAuth = createAuthMiddleware(
    tokenService,
    (jti) => storage.isTokenRevoked(jti)
  );

  // POST /api/schedule - Create a new schedule
  fastify.post<{ Body: CreateScheduleBody }>(
    '/schedule',
    {
      schema: {
        tags: ['schedule'],
        summary: 'Create a new scheduled message',
        security: [{ bearerAuth: [] }],
        body: createScheduleBodySchema,
        response: {
          201: scheduleResponseSchema,
          400: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
      preHandler: requireAuth('schedule'),
    },
    async (request, reply) => {
      const {
        recipient, recipientEmail, endpoint, messageType, from,
        cron, deliveryMethod, webhookUrl, webhookSecret,
      } = request.body;

      // Validate cron expression
      const nextRun = scheduler.calculateNextRun(cron);
      if (!nextRun) {
        return reply.status(400).send({ error: 'Invalid cron expression' });
      }

      // Validate messageType is provided when endpoint is 'message'
      if (endpoint === 'message' && !messageType) {
        return reply.status(400).send({
          error: 'messageType is required when endpoint is "message"',
        });
      }

      // Validate webhookUrl is provided when deliveryMethod is 'webhook'
      const method = deliveryMethod || 'email';
      if (method === 'webhook' && !webhookUrl) {
        return reply.status(400).send({
          error: 'webhookUrl is required when deliveryMethod is "webhook"',
        });
      }

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
        createdBy: request.tokenPayload!.sub,
      });

      return reply.status(201).send(formatScheduleResponse(schedule));
    }
  );

  // GET /api/schedule - List schedules
  fastify.get(
    '/schedule',
    {
      schema: {
        tags: ['schedule'],
        summary: 'List scheduled messages',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              schedules: {
                type: 'array',
                items: scheduleResponseSchema,
              },
            },
          },
        },
      },
      preHandler: requireAuth('schedule'),
    },
    async (request) => {
      const schedules = await storage.listSchedules(request.tokenPayload!.sub);
      return {
        schedules: schedules.map(formatScheduleResponse),
      };
    }
  );

  // GET /api/schedule/:id - Get a specific schedule
  fastify.get<{ Params: IdParam }>(
    '/schedule/:id',
    {
      schema: {
        tags: ['schedule'],
        summary: 'Get a scheduled message',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: scheduleResponseSchema,
          404: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
      preHandler: requireAuth('schedule'),
    },
    async (request, reply) => {
      const { id } = request.params;
      const schedule = await storage.getSchedule(id);

      if (!schedule) {
        return reply.status(404).send({ error: 'Schedule not found' });
      }

      // Only allow viewing own schedules
      if (schedule.createdBy !== request.tokenPayload!.sub) {
        return reply.status(404).send({ error: 'Schedule not found' });
      }

      return formatScheduleResponse(schedule);
    }
  );

  // DELETE /api/schedule/:id - Delete a schedule
  fastify.delete<{ Params: IdParam }>(
    '/schedule/:id',
    {
      schema: {
        tags: ['schedule'],
        summary: 'Delete a scheduled message',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: {
            type: 'object',
            properties: { success: { type: 'boolean' } },
          },
          404: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
      preHandler: requireAuth('schedule'),
    },
    async (request, reply) => {
      const { id } = request.params;
      const schedule = await storage.getSchedule(id);

      if (!schedule) {
        return reply.status(404).send({ error: 'Schedule not found' });
      }

      // Only allow deleting own schedules
      if (schedule.createdBy !== request.tokenPayload!.sub) {
        return reply.status(404).send({ error: 'Schedule not found' });
      }

      await storage.deleteSchedule(id);
      return { success: true };
    }
  );
}
