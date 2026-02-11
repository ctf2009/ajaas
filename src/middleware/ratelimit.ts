import type { Context, MiddlewareHandler } from 'hono';

interface RateLimitOptions {
  max: number;
  windowMs: number;
  keyGenerator: (c: Context) => string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const { max, windowMs, keyGenerator } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries (every 60s)
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  };
  const cleanupInterval = setInterval(cleanup, 60_000);
  cleanupInterval.unref?.();

  return async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        429,
      );
    }

    await next();
  };
}
