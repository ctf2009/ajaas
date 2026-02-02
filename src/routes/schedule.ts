import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Config } from '../config.js';
import { Storage } from '../storage/interface.js';
import { TokenService } from '../auth/token.js';
import { createAuthMiddleware, AuthenticatedRequest } from '../auth/middleware.js';
import { Scheduler } from '../scheduler/index.js';

interface ScheduleRouteOptions extends FastifyPluginOptions {
  config: Config;
  storage: Storage;
  tokenService: TokenService;
  scheduler: Scheduler;
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
      enum: ['email'],
      default: 'email',
      description: 'Delivery method',
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
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export async function scheduleRoutes(
  fastify: FastifyInstance,
  options: ScheduleRouteOptions
): Promise<void> {
  const { config, storage, tokenService, scheduler } = options;

  const requireAuth = createAuthMiddleware(
    tokenService,
    (jti) => storage.isTokenRevoked(jti)
  );

  // POST /api/schedule - Create a new schedule
  fastify.post<{
    Body: {
      recipient: string;
      recipientEmail: string;
      endpoint: string;
      messageType?: string;
      from?: string;
      cron: string;
      deliveryMethod?: 'email';
    };
  }>(
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
    async (request: AuthenticatedRequest, reply) => {
      const { recipient, recipientEmail, endpoint, messageType, from, cron, deliveryMethod } =
        request.body as any;

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

      const schedule = storage.createSchedule({
        recipient,
        recipientEmail,
        endpoint,
        messageType,
        from,
        cron,
        nextRun,
        deliveryMethod: deliveryMethod || 'email',
        createdBy: request.tokenPayload!.sub,
      });

      return reply.status(201).send({
        ...schedule,
        nextRun: new Date(schedule.nextRun * 1000).toISOString(),
        createdAt: new Date(schedule.createdAt * 1000).toISOString(),
      });
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
    async (request: AuthenticatedRequest) => {
      const schedules = storage.listSchedules(request.tokenPayload!.sub);
      return {
        schedules: schedules.map((s) => ({
          ...s,
          nextRun: new Date(s.nextRun * 1000).toISOString(),
          createdAt: new Date(s.createdAt * 1000).toISOString(),
        })),
      };
    }
  );

  // GET /api/schedule/:id - Get a specific schedule
  fastify.get<{ Params: { id: string } }>(
    '/schedule/:id',
    {
      schema: {
        tags: ['schedule'],
        summary: 'Get a scheduled message',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
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
    async (request: AuthenticatedRequest, reply) => {
      const { id } = request.params as { id: string };
      const schedule = storage.getSchedule(id);

      if (!schedule) {
        return reply.status(404).send({ error: 'Schedule not found' });
      }

      // Only allow viewing own schedules
      if (schedule.createdBy !== request.tokenPayload!.sub) {
        return reply.status(404).send({ error: 'Schedule not found' });
      }

      return {
        ...schedule,
        nextRun: new Date(schedule.nextRun * 1000).toISOString(),
        createdAt: new Date(schedule.createdAt * 1000).toISOString(),
      };
    }
  );

  // DELETE /api/schedule/:id - Delete a schedule
  fastify.delete<{ Params: { id: string } }>(
    '/schedule/:id',
    {
      schema: {
        tags: ['schedule'],
        summary: 'Delete a scheduled message',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
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
    async (request: AuthenticatedRequest, reply) => {
      const { id } = request.params as { id: string };
      const schedule = storage.getSchedule(id);

      if (!schedule) {
        return reply.status(404).send({ error: 'Schedule not found' });
      }

      // Only allow deleting own schedules
      if (schedule.createdBy !== request.tokenPayload!.sub) {
        return reply.status(404).send({ error: 'Schedule not found' });
      }

      storage.deleteSchedule(id);
      return { success: true };
    }
  );
}
