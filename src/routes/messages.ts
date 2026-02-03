import { FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';
import { MessageService, MessageType } from '../services/messages.js';
import { Config } from '../config.js';

interface MessageRouteOptions extends FastifyPluginOptions {
  config: Config;
}

function wantsText(accept: string | undefined): boolean {
  if (!accept) return false;
  // Check if text/plain is explicitly requested and preferred over JSON
  const types = accept.split(',').map((t) => t.trim().split(';')[0].trim());
  const textIndex = types.indexOf('text/plain');
  const jsonIndex = types.indexOf('application/json');
  if (textIndex === -1) return false;
  if (jsonIndex === -1) return true;
  return textIndex < jsonIndex;
}

function sendMessage(reply: FastifyReply, accept: string | undefined, message: string) {
  if (wantsText(accept)) {
    return reply.type('text/plain').send(message);
  }
  return { message };
}

const nameParamSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Recipient name' },
  },
  required: ['name'],
} as const;

const fromQuerySchema = {
  type: 'object',
  properties: {
    from: { type: 'string', description: 'Optional sender attribution' },
  },
} as const;

const messageResponseSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
} as const;

const typeParamSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['animal', 'absurd', 'meta', 'unexpected', 'toughLove'],
      description: 'Message type',
    },
    name: { type: 'string', description: 'Recipient name' },
  },
  required: ['type', 'name'],
} as const;

export async function messageRoutes(
  fastify: FastifyInstance,
  options: MessageRouteOptions
): Promise<void> {
  const messageService = new MessageService(options.config.messages.toughLove);

  // GET /api/awesome/:name - Simple compliment
  fastify.get<{
    Params: { name: string };
    Querystring: { from?: string };
  }>(
    '/awesome/:name',
    {
      schema: {
        tags: ['messages'],
        summary: 'Get a simple awesome message',
        params: nameParamSchema,
        querystring: fromQuerySchema,
        response: {
          200: messageResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const { from } = request.query;
      return sendMessage(reply, request.headers.accept, messageService.getSimpleMessage(name, from));
    }
  );

  // GET /api/weekly/:name - Weekly message with days off
  fastify.get<{
    Params: { name: string };
    Querystring: { from?: string };
  }>(
    '/weekly/:name',
    {
      schema: {
        tags: ['messages'],
        summary: 'Get a weekly awesome message with days off',
        params: nameParamSchema,
        querystring: fromQuerySchema,
        response: {
          200: messageResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const { from } = request.query;
      return sendMessage(reply, request.headers.accept, messageService.getWeeklyMessage(name, from));
    }
  );

  // GET /api/random/:name - Random message type
  fastify.get<{
    Params: { name: string };
    Querystring: { from?: string };
  }>(
    '/random/:name',
    {
      schema: {
        tags: ['messages'],
        summary: 'Get a random awesome message',
        params: nameParamSchema,
        querystring: fromQuerySchema,
        response: {
          200: messageResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const { from } = request.query;
      return sendMessage(reply, request.headers.accept, messageService.getRandomMessage(name, from));
    }
  );

  // GET /api/message/:type/:name - Specific message type
  fastify.get<{
    Params: { type: string; name: string };
    Querystring: { from?: string };
  }>(
    '/message/:type/:name',
    {
      schema: {
        tags: ['messages'],
        summary: 'Get a message of a specific type',
        params: typeParamSchema,
        querystring: fromQuerySchema,
        response: {
          200: messageResponseSchema,
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { type, name } = request.params;
      const { from } = request.query;

      const validTypes: MessageType[] = ['animal', 'absurd', 'meta', 'unexpected', 'toughLove'];
      if (!validTypes.includes(type as MessageType)) {
        return reply.status(400).send({
          error: `Invalid message type. Available types: ${messageService.getAvailableTypes().join(', ')}`,
        });
      }

      const message = messageService.getMessageByType(type as MessageType, name, from);
      if (!message) {
        return reply.status(404).send({
          error: `Message type '${type}' is not available`,
        });
      }

      return sendMessage(reply, request.headers.accept, message);
    }
  );

  // GET /api/types - List available message types
  fastify.get(
    '/types',
    {
      schema: {
        tags: ['messages'],
        summary: 'List available message types',
        response: {
          200: {
            type: 'object',
            properties: {
              types: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async () => {
      return { types: messageService.getAvailableTypes() };
    }
  );
}
