import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { existsSync } from 'node:fs';
import { createApp } from '../app.js';
import { createTokenService } from '../auth/token.js';
import { loadConfig } from '../config.js';
import { ConsoleDelivery, NodemailerDelivery } from '../delivery/email.js';
import { Scheduler } from '../scheduler/index.js';
import { MessageService } from '../services/messages.js';
import { createStorage } from '../storage/factory.js';
import type { Storage } from '../storage/interface.js';

const config = loadConfig();
const needsStorage = config.security.enabled || config.endpoints.schedule.enabled;

const storage: Storage | null = needsStorage ? await createStorage(config.database) : null;
const messageService = new MessageService(config.messages.toughLove);
const tokenService = needsStorage ? createTokenService(config.security) : null;

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
  scheduler.start();
}

const apiApp = createApp({
  config,
  messageService,
  tokenService,
  storage,
  scheduler,
});

const app = new Hono();

if (config.web.enabled) {
  const webRoot = './dist/web';
  if (existsSync(webRoot)) {
    const staticAssets = serveStatic({
      root: webRoot,
      rewriteRequestPath: (path) => path.replace(/^\/+/, ''),
    });
    const staticIndex = serveStatic({
      root: webRoot,
      path: 'index.html',
    });

    const isStaticAssetPath = (path: string): boolean => /\.[^/]+$/.test(path);

    const serveWeb = async (c: Context, next: () => Promise<void>) => {
      if (c.req.path.startsWith('/api') || c.req.path === '/health') {
        return next();
      }

      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        return next();
      }

      if (isStaticAssetPath(c.req.path)) {
        return staticAssets(c, next);
      }

      return staticIndex(c, async () => {});
    };

    app.on(['GET', 'HEAD'], '/', serveWeb);
    app.on(['GET', 'HEAD'], '/*', serveWeb);
  } else {
    console.warn('Web UI enabled but dist/web not found. Run npm run build:web first.');
  }
}

app.route('/', apiApp);

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(`AJaaS running at http://${info.address}:${info.port}`);
    console.log(`API docs at http://${info.address}:${info.port}/api/docs`);
    console.log(`Scheduling: ${config.endpoints.schedule.enabled ? 'enabled' : 'disabled'}`);
    console.log(`Security: ${config.security.enabled ? 'enabled' : 'disabled'}`);
    console.log(`Tough love: ${config.messages.toughLove ? 'enabled' : 'disabled'}`);
  },
);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down...');
  scheduler?.stop();
  await storage?.close();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
