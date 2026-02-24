import { Hono } from 'hono';
import { createAuthMiddleware, AuthEnv } from '../auth/middleware.js';
import { TokenService } from '../auth/token.js';
import { Storage } from '../storage/interface.js';

interface RevokeBody {
  token: string;
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

    if (!body.token || typeof body.token !== 'string') {
      return c.json({ error: 'Missing required field: token' }, 400);
    }

    const payload = tokenService.decrypt(body.token);
    if (!payload) {
      return c.json({ error: 'Invalid token: could not decrypt' }, 400);
    }

    const caller = c.get('tokenPayload');
    await storage.revokeToken(payload.jti, payload.exp);
    console.log(`Token revoked: jti=${payload.jti} by=${caller.sub} (${caller.name})`);
    return c.json({ success: true, jti: payload.jti });
  });

  return app;
}
