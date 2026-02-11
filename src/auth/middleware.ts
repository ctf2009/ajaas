import type { MiddlewareHandler } from 'hono';
import { TokenService, TokenPayload, Role } from './token.js';

// Hono context variable type — used by routes that access tokenPayload
export type AuthEnv = {
  Variables: {
    tokenPayload: TokenPayload;
  };
};

export function createAuthMiddleware(
  tokenService: TokenService,
  isRevoked: (jti: string) => Promise<boolean>
) {
  return function requireAuth(requiredRole: Role): MiddlewareHandler<AuthEnv> {
    return async (c, next) => {
      const authHeader = c.req.header('authorization');

      if (!authHeader) {
        return c.json({ error: 'Missing authorization header' }, 401);
      }

      // Support both "Bearer <token>" and just "<token>"
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

      const payload = tokenService.decrypt(token);

      if (!payload) {
        return c.json({ error: 'Invalid token' }, 401);
      }

      if (tokenService.isExpired(payload)) {
        return c.json({ error: 'Token expired' }, 401);
      }

      if (await isRevoked(payload.jti)) {
        return c.json({ error: 'Token revoked' }, 401);
      }

      if (!tokenService.hasRole(payload, requiredRole)) {
        return c.json(
          { error: `Insufficient permissions. Required role: ${requiredRole}` },
          403,
        );
      }

      c.set('tokenPayload', payload);
      await next();
    };
  };
}

export function createOptionalAuthMiddleware(tokenService: TokenService): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const authHeader = c.req.header('authorization');

    if (!authHeader) {
      await next();
      return;
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const payload = tokenService.decrypt(token);

    if (payload && !tokenService.isExpired(payload)) {
      c.set('tokenPayload', payload);
    }

    await next();
  };
}
