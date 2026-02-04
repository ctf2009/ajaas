import { FastifyRequest, FastifyReply } from 'fastify';
import { TokenService, TokenPayload, Role } from './token.js';

declare module 'fastify' {
  interface FastifyRequest {
    tokenPayload?: TokenPayload;
  }
}

export function createAuthMiddleware(
  tokenService: TokenService,
  isRevoked: (jti: string) => boolean
) {
  return function requireAuth(requiredRole: Role) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;

      if (!authHeader) {
        return reply.status(401).send({ error: 'Missing authorization header' });
      }

      // Support both "Bearer <token>" and just "<token>"
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

      const payload = tokenService.decrypt(token);

      if (!payload) {
        return reply.status(401).send({ error: 'Invalid token' });
      }

      if (tokenService.isExpired(payload)) {
        return reply.status(401).send({ error: 'Token expired' });
      }

      if (isRevoked(payload.jti)) {
        return reply.status(401).send({ error: 'Token revoked' });
      }

      if (!tokenService.hasRole(payload, requiredRole)) {
        return reply.status(403).send({
          error: `Insufficient permissions. Required role: ${requiredRole}`,
        });
      }

      request.tokenPayload = payload;
    };
  };
}

export function createOptionalAuthMiddleware(tokenService: TokenService) {
  return async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return; // No auth provided, that's ok for optional
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const payload = tokenService.decrypt(token);

    if (payload && !tokenService.isExpired(payload)) {
      request.tokenPayload = payload;
    }
  };
}
