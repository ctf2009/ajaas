import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { injectCardMeta } from '../seo.js';
import { MessageService } from '../services/messages.js';

interface WorkerEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  [key: string]: unknown;
}

let app: ReturnType<typeof createApp> | null = null;

function applyWorkerBindings(env: WorkerEnv): void {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    }
  }
}

function applyWorkerDefaults(): void {
  if (process.env.SECURITY_ENABLED === undefined) {
    process.env.SECURITY_ENABLED = 'false';
  }
  if (process.env.SCHEDULE_ENABLED === undefined) {
    process.env.SCHEDULE_ENABLED = 'false';
  }
  if (process.env.RATE_LIMIT_ENABLED === undefined) {
    process.env.RATE_LIMIT_ENABLED = 'false';
  }
}

function getApp(env: WorkerEnv) {
  if (!app) {
    applyWorkerBindings(env);
    applyWorkerDefaults();
    const config = loadConfig();
    const messageService = new MessageService(config.messages.toughLove);
    app = createApp({ config, messageService });
  }

  return app;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    // API and health routes go through the Hono app
    if (url.pathname.startsWith('/api') || url.pathname === '/health') {
      return getApp(env).fetch(request);
    }

    // All other routes: serve from static assets via the ASSETS binding
    const response = await env.ASSETS.fetch(request);

    // Substitute GA_MEASUREMENT_ID in HTML responses
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const gaId = typeof env.GA_MEASUREMENT_ID === 'string' ? env.GA_MEASUREMENT_ID : '';
      const withGa = html.replace('{{GA_MEASUREMENT_ID}}', gaId);
      const modified = injectCardMeta(withGa, url.pathname);
      return new Response(modified, {
        status: response.status,
        headers: response.headers,
      });
    }

    return response;
  },
};
