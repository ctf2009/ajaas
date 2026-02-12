export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AJaaS - Awesome Job as a Service',
    description: 'A wholesome API that generates personalized compliment messages.',
    version: '0.1.5', // x-release-please-version
  },
  tags: [
    { name: 'messages', description: 'Message endpoints' },
    { name: 'schedule', description: 'Scheduling endpoints' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http' as const,
        scheme: 'bearer',
      },
    },
    schemas: {
      MessageResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
      ScheduleResponse: {
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
      },
      CreateScheduleBody: {
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
          cron: { type: 'string', description: 'Cron expression (e.g., "0 17 * * FRI")' },
          deliveryMethod: {
            type: 'string',
            enum: ['email', 'webhook'],
            default: 'email',
            description: 'Delivery method',
          },
          webhookUrl: { type: 'string', format: 'uri', description: 'Webhook URL (required if deliveryMethod is "webhook")' },
          webhookSecret: { type: 'string', description: 'Optional secret for HMAC-SHA256 webhook signature' },
        },
      },
    },
  },
  paths: {
    '/api/awesome/{name}': {
      get: {
        tags: ['messages'],
        summary: 'Get a simple awesome message',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Recipient name' },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Optional sender attribution' },
        ],
        responses: {
          200: { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } } },
        },
      },
    },
    '/api/weekly/{name}': {
      get: {
        tags: ['messages'],
        summary: 'Get a weekly awesome message with days off',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Recipient name' },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Optional sender attribution' },
          { name: 'tz', in: 'query', schema: { type: 'string' }, description: 'IANA timezone (e.g. Australia/Sydney). Determines the local day of week for calculating days off. Defaults to server timezone.' },
        ],
        responses: {
          200: { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } } },
          400: { description: 'Invalid timezone', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/random/{name}': {
      get: {
        tags: ['messages'],
        summary: 'Get a random awesome message',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Recipient name' },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Optional sender attribution' },
        ],
        responses: {
          200: { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } } },
        },
      },
    },
    '/api/message/{type}/{name}': {
      get: {
        tags: ['messages'],
        summary: 'Get a message of a specific type',
        parameters: [
          {
            name: 'type', in: 'path', required: true,
            schema: { type: 'string', enum: ['animal', 'absurd', 'meta', 'unexpected', 'toughLove'] },
            description: 'Message type',
          },
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Recipient name' },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Optional sender attribution' },
        ],
        responses: {
          200: { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } } },
          400: { description: 'Invalid type', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Type not available', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/types': {
      get: {
        tags: ['messages'],
        summary: 'List available message types',
        responses: {
          200: {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    types: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/schedule': {
      get: {
        tags: ['schedule'],
        summary: 'List scheduled messages',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    schedules: { type: 'array', items: { $ref: '#/components/schemas/ScheduleResponse' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['schedule'],
        summary: 'Create a new scheduled message',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateScheduleBody' } },
          },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScheduleResponse' } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/schedule/{id}': {
      get: {
        tags: ['schedule'],
        summary: 'Get a scheduled message',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScheduleResponse' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['schedule'],
        summary: 'Delete a scheduled message',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Success', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    scheduling: { type: 'boolean' },
                    security: { type: 'boolean' },
                    web: { type: 'boolean' },
                    rateLimit: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
