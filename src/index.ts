import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import { loadConfig } from './config.js';
import { messageRoutes } from './routes/messages.js';
import { scheduleRoutes } from './routes/schedule.js';
import { createStorage } from './storage/factory.js';
import { Storage } from './storage/interface.js';
import { TokenService } from './auth/token.js';
import { MessageService } from './services/messages.js';
import { Scheduler } from './scheduler/index.js';
import { ConsoleDelivery, NodemailerDelivery } from './delivery/email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();

const needsStorage = config.security.enabled || config.endpoints.schedule.enabled;

// Initialize storage (needed for token revocation and/or scheduling)
let storage: Storage | null = null;
if (needsStorage) {
  storage = await createStorage({
    connectionUrl: config.database.path,
    dataEncryptionKey: config.database.dataEncryptionKey || undefined,
  });

  if (!config.database.dataEncryptionKey) {
    console.warn(
      'WARNING: DATA_ENCRYPTION_KEY not set. Sensitive schedule data (e.g. email addresses) will be stored unencrypted.'
    );
  }

  // Log storage backend type
  const isPostgres = config.database.path.startsWith('postgresql://') || config.database.path.startsWith('postgres://');
  console.log(`Storage backend: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);
}

// Initialize services
const messageService = new MessageService(config.messages.toughLove);

// Initialize token service (only if security is enabled or schedule endpoints are enabled)
let tokenService: TokenService | null = null;
if (needsStorage) {
  if (!config.security.encryptionKey) {
    console.warn(
      'WARNING: ENCRYPTION_KEY not set. Security features will not work properly.'
    );
  } else {
    tokenService = new TokenService(config.security.encryptionKey);
  }
}

// Initialize scheduler and email delivery (only if scheduling is enabled)
let scheduler: Scheduler | null = null;
if (config.endpoints.schedule.enabled && storage) {
  const emailDelivery = config.smtp.host
    ? new NodemailerDelivery({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user
          ? {
              user: config.smtp.user,
              pass: config.smtp.pass,
            }
          : undefined,
        from: config.smtp.from,
      })
    : new ConsoleDelivery();

  scheduler = new Scheduler(storage, messageService, emailDelivery);
}

const fastify = Fastify({
  logger: true,
});

// OpenAPI setup
await fastify.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'AJAAS - Awesome Job As A Service',
      description: 'A wholesome API that generates personalized compliment messages.',
      version: '0.1.0',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'messages', description: 'Message endpoints' },
      { name: 'schedule', description: 'Scheduling endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
  },
});

await fastify.register(fastifySwaggerUi, {
  routePrefix: '/api/docs',
});

// Rate limiting (if enabled)
if (config.rateLimit.enabled) {
  await fastify.register(fastifyRateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    keyGenerator: (request) => {
      // Use API key (sub claim) if authenticated, otherwise use IP
      const authHeader = request.headers.authorization;
      if (authHeader && tokenService) {
        const token = authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : authHeader;
        const payload = tokenService.decrypt(token);
        if (payload && !tokenService.isExpired(payload)) {
          return `key:${payload.sub}`;
        }
      }
      return `ip:${request.ip}`;
    },
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: Math.ceil(context.ttl / 1000),
      };
    },
  });
  console.log(`Rate limiting enabled: ${config.rateLimit.max} requests per ${config.rateLimit.timeWindow}`);
}

// Register message routes
await fastify.register(messageRoutes, { prefix: '/api', config });

// Register schedule routes (only if enabled and dependencies are available)
if (config.endpoints.schedule.enabled && tokenService && storage && scheduler) {
  await fastify.register(scheduleRoutes, {
    prefix: '/api',
    config,
    storage,
    tokenService,
    scheduler,
  });

  // Start the scheduler
  scheduler.start();
}

// Serve static web app if enabled
if (config.web.enabled) {
  const webDir = join(__dirname, 'web');
  if (existsSync(webDir)) {
    await fastify.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      decorateReply: false,
    });

    // SPA fallback - serve index.html for non-API routes
    fastify.setNotFoundHandler((request, reply) => {
      if (!request.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found' });
    });

    console.log('Web UI enabled');
  } else {
    console.log('Web UI enabled but dist/web not found. Run npm run build:web first.');
  }
}

// Health check
fastify.get('/health', async () => {
  return {
    status: 'ok',
    scheduling: config.endpoints.schedule.enabled,
    security: config.security.enabled,
    web: config.web.enabled,
    rateLimit: config.rateLimit.enabled,
  };
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down...');
  scheduler?.stop();
  await storage?.close();
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
try {
  await fastify.listen({ port: config.port, host: config.host });
  console.log(`AJAAS running at http://${config.host}:${config.port}`);
  console.log(`API docs at http://${config.host}:${config.port}/api/docs`);
  console.log(`Scheduling: ${config.endpoints.schedule.enabled ? 'enabled' : 'disabled'}`);
  console.log(`Security: ${config.security.enabled ? 'enabled' : 'disabled'}`);
  console.log(`Tough love: ${config.messages.toughLove ? 'enabled' : 'disabled'}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
