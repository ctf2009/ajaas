import { Hono } from 'hono';
import { createAuthMiddleware, AuthEnv } from '../auth/middleware.js';
import { TokenService } from '../auth/token.js';
import { Storage } from '../storage/interface.js';

interface RevokeBody {
  jti: string;
}

export function adminRoutes(storage: Storage, tokenService: TokenService): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const requireAuth = createAuthMiddleware(
    tokenService,
    (jti) => storage.isTokenRevoked(jti),
  );

  app.post('/admin/revoke', requireAuth('admin'), async (c) => {
    let body: RevokeBody;
    try {
      body = await c.req.json<RevokeBody>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.jti || typeof body.jti !== 'string') {
      return c.json({ error: 'Missing required field: jti' }, 400);
    }

    await storage.revokeToken(body.jti);
    return c.json({ success: true, jti: body.jti });
  });

  return app;
}
