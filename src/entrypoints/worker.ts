import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { MessageService } from '../services/messages.js';

type WorkerEnv = Record<string, unknown>;

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
  fetch(request: Request, env: WorkerEnv): Promise<Response> | Response {
    return getApp(env).fetch(request);
  },
};
