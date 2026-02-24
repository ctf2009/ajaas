import { Hono } from 'hono';
import { createAuthMiddleware, AuthEnv } from '../auth/middleware.js';
import { TokenService } from '../auth/token.js';
import { Storage } from '../storage/interface.js';

interface RevokeBody {
  jti: string;
  exp: number;
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

    if (!body.exp || typeof body.exp !== 'number') {
      return c.json({ error: 'Missing required field: exp (token expiry timestamp)' }, 400);
    }

    const caller = c.get('tokenPayload');
    await storage.revokeToken(body.jti, body.exp);
    console.log(`Token revoked: jti=${body.jti} by=${caller.sub} (${caller.name})`);
    return c.json({ success: true, jti: body.jti });
  });

  return app;
}
