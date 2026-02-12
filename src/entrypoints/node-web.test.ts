import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const testWebRoot = join(process.cwd(), 'dist', 'web-test');

function createWebApp(webRoot: string): Hono {
  const app = new Hono();
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
  app.get('/api/ping', (c) => c.text('pong'));

  return app;
}

describe('Node web SPA fallback', () => {
  beforeAll(() => {
    mkdirSync(join(testWebRoot, 'assets'), { recursive: true });
    writeFileSync(join(testWebRoot, 'index.html'), '<!doctype html><div id="root"></div>');
    writeFileSync(join(testWebRoot, 'assets', 'app.js'), 'console.log("ok");');
  });

  afterAll(() => {
    if (existsSync(testWebRoot)) {
      rmSync(testWebRoot, { recursive: true, force: true });
    }
  });

  it('serves index.html for card routes', async () => {
    const response = await createWebApp(testWebRoot).request(
      'http://localhost/card/awesome/Rachel',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('id="root"');
  });

  it('serves static assets as files', async () => {
    const response = await createWebApp(testWebRoot).request('http://localhost/assets/app.js');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('console.log("ok");');
  });

  it('does not override API routes with SPA fallback', async () => {
    const response = await createWebApp(testWebRoot).request('http://localhost/api/ping');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pong');
  });
});
