# AJAAS - Cloudflare Workers Deployment Plan

## Overview

This document plans the migration path from a Docker/Container-based deployment model to a **native Cloudflare Workers + Durable Objects** deployment. The goal is not to run a container on Cloudflare, but to embrace the CF-native primitives: Workers for compute, Durable Objects with SQLite for persistent state, Alarms for scheduling, and Hono as a portable HTTP framework.

The existing Docker/Container deployment path will be preserved. The codebase will support both targets through abstraction layers and build-time selection.

---

## Table of Contents

1. [Architecture Comparison](#1-architecture-comparison)
2. [HTTP Framework: Hono vs Fastify](#2-http-framework-hono-vs-fastify)
3. [Storage: Durable Objects SQLite](#3-storage-durable-objects-sqlite)
4. [Scheduling: DO Alarms vs Polling](#4-scheduling-do-alarms-vs-polling)
5. [Authentication & Cryptography](#5-authentication--cryptography)
6. [Email Delivery](#6-email-delivery)
7. [Secrets Management](#7-secrets-management)
8. [Static Assets & Web UI](#8-static-assets--web-ui)
9. [Configuration](#9-configuration)
10. [Project Structure](#10-project-structure)
11. [Implementation Phases](#11-implementation-phases)
12. [Key Decisions Required](#12-key-decisions-required)
13. [Risks & Constraints](#13-risks--constraints)
14. [References](#14-references)

---

## 1. Architecture Comparison

### Current: Docker/Container

```
Client Request
    |
    v
[Fastify on Node.js]
    |
    ├── Routes (messages, schedule)
    ├── Auth middleware (Node crypto AES-256-GCM)
    ├── MessageService (in-memory templates)
    ├── Scheduler (setInterval polling loop)
    ├── SQLiteStorage (better-sqlite3 on filesystem)
    └── Email delivery (Nodemailer SMTP)
```

- Single long-running process
- Filesystem-backed SQLite database
- `setInterval` polling for schedule execution
- Node.js `crypto` module for token encryption
- Nodemailer for SMTP email delivery
- Docker multi-stage build for deployment

### Proposed: Cloudflare Workers

```
Client Request
    |
    v
[Hono on CF Workers runtime]
    |
    ├── Routes (messages, schedule)  ← Worker (stateless)
    ├── Auth middleware (Web Crypto API AES-256-GCM)
    ├── MessageService (in-memory templates) ← Worker (stateless)
    |
    ├── Durable Object: ScheduleManager
    │   ├── SQLite storage (schedules, revoked tokens)
    │   └── Alarm handler (schedule execution)
    |
    └── Email delivery (CF Email Service / Resend / MailChannels API)
```

- Stateless Worker for HTTP handling
- Durable Object with embedded SQLite for persistent state
- DO Alarms for precise, per-schedule wake-ups (replaces polling)
- Web Crypto API (or `node:crypto` via `nodejs_compat`) for encryption
- CF-native or third-party email sending
- Wrangler for deployment (no Docker needed)

---

## 2. HTTP Framework: Hono vs Fastify

### The Problem

Fastify is tightly coupled to the Node.js runtime. It relies on Node.js HTTP server primitives (`http.createServer`), Node.js streams, and the Node.js plugin system. Cloudflare Workers use the Service Worker / Module Worker API which is based on Web Standards (`fetch`, `Request`, `Response`). Fastify cannot run natively on Workers.

### The Recommendation: Lightweight Abstraction Layer

Rather than replacing Fastify outright, introduce a **routing abstraction** that allows the business logic (routes, services, middleware) to be defined once and mounted on either framework.

**Option A: Replace Fastify with Hono everywhere**

| Pros | Cons |
|------|------|
| Single framework, simpler codebase | Breaking change for Docker path |
| Hono runs on Node.js, Bun, Deno, CF Workers | Loss of Fastify ecosystem (swagger, rate-limit plugins) |
| First-class CF Workers support with typed bindings | Need to find Hono equivalents for Fastify plugins |
| Smaller bundle size for Workers | Hono's OpenAPI support differs from @fastify/swagger |

**Option B: Wrapper / adapter pattern (framework-agnostic routes)**

| Pros | Cons |
|------|------|
| Preserves existing Fastify path unchanged | More abstraction code to maintain |
| Clean separation of concerns | Routes defined in an intermediate format |
| Supports adding future runtimes | Potential type complexity |

**Option C (Recommended): Replace with Hono, use Hono everywhere**

| Rationale |
|-----------|
| Hono natively runs on Node.js (`@hono/node-server`) — so the Docker path works unchanged |
| Hono has built-in OpenAPI support via `@hono/zod-openapi` and Swagger UI via `@hono/swagger-ui` |
| Hono has middleware for rate limiting, CORS, etc. |
| Hono is the recommended framework in CF Workers documentation |
| The current Fastify usage is straightforward — migration is mechanical, not architectural |
| Maintaining two frameworks doubles maintenance burden for minimal benefit |
| Hono's middleware model (`c.set()`, `c.get()`) maps cleanly to the existing auth pattern |

### Hono Migration: Route Mapping

Current Fastify routes map directly to Hono:

```typescript
// Current Fastify
fastify.get('/awesome/:name', { schema: {...} }, async (request, reply) => {
  const { name } = request.params;
  return { message: messageService.getSimpleMessage(name) };
});

// Hono equivalent
app.get('/awesome/:name', (c) => {
  const name = c.req.param('name');
  return c.json({ message: messageService.getSimpleMessage(name) });
});
```

### Hono on Node.js (Docker path)

```typescript
// src/entrypoints/node.ts
import { serve } from '@hono/node-server';
import { app } from '../app.js';

serve({ fetch: app.fetch, port: 3000 });
```

### Hono on CF Workers

```typescript
// src/entrypoints/worker.ts
import { app } from '../app.js';

export default app;

// Durable Object export
export { ScheduleManager } from '../durable-objects/schedule-manager.js';
```

### Plugin Equivalents

| Fastify Plugin | Hono Equivalent |
|---------------|-----------------|
| `@fastify/swagger` | `@hono/zod-openapi` |
| `@fastify/swagger-ui` | `@hono/swagger-ui` |
| `@fastify/rate-limit` | `hono/rate-limiter` or custom middleware |
| `@fastify/static` | `@hono/node-server/serve-static` (Node) / Workers Assets (CF) |
| Fastify `preHandler` | Hono middleware |

---

## 3. Storage: Durable Objects SQLite

### Current Storage Interface

The existing `Storage` interface (`src/storage/interface.ts`) is already well-abstracted:

```typescript
interface Storage {
  revokeToken(jti: string): void;
  isTokenRevoked(jti: string): boolean;
  createSchedule(schedule: Omit<Schedule, 'id' | 'createdAt'>): Schedule;
  getSchedule(id: string): Schedule | null;
  getSchedulesDue(beforeTimestamp: number): Schedule[];
  updateScheduleNextRun(id: string, nextRun: number): void;
  deleteSchedule(id: string): boolean;
  listSchedules(createdBy?: string): Schedule[];
  close(): void;
}
```

This is a significant advantage — the interface already separates storage concerns from implementation. A Durable Object SQLite implementation can fulfil this same interface.

### Durable Object SQLite Implementation

Durable Objects provide an embedded SQLite database per object instance. Key characteristics:

- **10 GB storage** per Durable Object
- **Point-in-time recovery** — revert to any state in the last 30 days
- **Transactional** — SQLite transactions work as expected
- **Co-located** — the SQLite database runs on the same machine as the DO
- **Automatic replication** — Cloudflare handles durability and failover

### DO Architecture Decision: Singleton vs Per-Entity

**Option A: Singleton DO (one object holds all data)**

- Simpler to implement — mirrors the current single-process model
- All schedules and revoked tokens in one SQLite database
- Risk: becomes a bottleneck under high load (though AJAAS is unlikely to face this)
- Suitable for the current scale of AJAAS

**Option B: Per-schedule DO (one object per schedule)**

- More "Cloudflare native" — each schedule is its own DO with its own alarm
- Storage is naturally partitioned
- Scales horizontally with no bottleneck
- Requires a coordination mechanism (a "registry" DO or KV index) to list/query schedules
- More complex to implement

**Recommendation: Hybrid approach**

Use a **single `ScheduleManager` Durable Object** that holds the SQLite database with all schedules and revoked tokens (mirrors current model), but uses **DO Alarms** instead of polling. This is the simplest migration path and appropriate for AJAAS's scale. The DO will set an alarm for the next due schedule, wake up, process it, then set the next alarm.

If scale becomes a concern later, the per-schedule DO pattern can be adopted — the Storage interface abstraction makes this a contained change.

### Schema (identical to current)

The existing SQLite schema transfers directly:

```sql
CREATE TABLE revoked_tokens (
  jti TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL
);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  message_type TEXT,
  from_name TEXT,
  cron TEXT NOT NULL,
  next_run INTEGER NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'email',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_schedules_next_run ON schedules(next_run);
CREATE INDEX idx_schedules_created_by ON schedules(created_by);
```

### Storage Interface Changes

The `Storage` interface needs minor adjustments for async compatibility. Durable Object SQLite is synchronous within the DO, but calling from a Worker to a DO is always asynchronous (via RPC). Two options:

**Option A: Make the Storage interface async**

```typescript
interface Storage {
  revokeToken(jti: string): Promise<void> | void;
  isTokenRevoked(jti: string): Promise<boolean> | boolean;
  // ... etc
}
```

**Option B (Recommended): Separate transport from storage**

Keep the `Storage` interface synchronous (used inside the DO), and create an `RpcStorageClient` that wraps DO RPC calls for use from the Worker:

```typescript
// Used inside the Durable Object — synchronous, direct SQLite access
interface Storage { /* current interface, unchanged */ }

// Used from the Worker — async wrapper around DO RPC
class RpcStorageClient implements AsyncStorage {
  constructor(private stub: DurableObjectStub<ScheduleManager>) {}
  async isTokenRevoked(jti: string): Promise<boolean> {
    return this.stub.isTokenRevoked(jti);
  }
  // ... etc
}
```

This means route handlers and auth middleware need to work with `AsyncStorage`. Since the Node.js path uses synchronous `better-sqlite3`, the Node.js `Storage` can be wrapped in a thin async adapter:

```typescript
class SyncToAsyncAdapter implements AsyncStorage {
  constructor(private storage: Storage) {}
  async isTokenRevoked(jti: string): Promise<boolean> {
    return this.storage.isTokenRevoked(jti);
  }
  // ... etc
}
```

### ID Generation

Currently uses `crypto.randomBytes(16).toString('hex')`. In CF Workers:
- With `nodejs_compat`: `crypto.randomBytes` is available
- Without: use `crypto.getRandomValues(new Uint8Array(16))` and convert to hex
- Alternative: use `crypto.randomUUID()` which is available in all modern runtimes

---

## 4. Scheduling: DO Alarms vs Polling

### Current Model

The `Scheduler` class uses `setInterval` to poll every 60 seconds, querying SQLite for due schedules. This is a single-process model that doesn't survive restarts without re-polling.

### CF Workers Model: Durable Object Alarms

Durable Object Alarms are the natural replacement:

- **Guaranteed at-least-once execution** — Cloudflare retries on failure
- **Precise timing** — no wasted polling cycles
- **Survives restarts** — alarms are persisted by the platform
- **One alarm per DO** — set to the earliest `nextRun` across all schedules

### Implementation

```typescript
export class ScheduleManager extends DurableObject {
  private sql: SqlStorage;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;
    this.initializeSchema();
  }

  // Called by the alarm system
  async alarm(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const dueSchedules = this.getSchedulesDue(now);

    for (const schedule of dueSchedules) {
      await this.executeSchedule(schedule);
      const nextRun = this.calculateNextRun(schedule.cron);
      if (nextRun) {
        this.updateScheduleNextRun(schedule.id, nextRun);
      }
    }

    // Set alarm for next due schedule
    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(): Promise<void> {
    const next = this.sql.exec(
      'SELECT MIN(next_run) as next FROM schedules'
    ).one();

    if (next?.next) {
      const alarmTime = (next.next as number) * 1000; // Convert to ms
      await this.ctx.storage.setAlarm(alarmTime);
    }
  }

  // RPC method called from Worker when a schedule is created/deleted
  async createSchedule(schedule: ScheduleInput): Schedule {
    const result = /* insert into SQLite */;
    await this.scheduleNextAlarm(); // Recalculate alarm
    return result;
  }
}
```

### Key Differences from Current Scheduler

| Aspect | Current (Polling) | CF Workers (Alarm) |
|--------|-------------------|---------------------|
| Trigger | `setInterval` every 60s | `alarm()` at exact `nextRun` time |
| Precision | Up to 60s late | Near-exact (seconds) |
| Resilience | Lost on process restart | Persisted by platform |
| Resource usage | Constant polling | Zero cost when idle |
| Guarantee | Best-effort | At-least-once |

### The `croner` Library

The `croner` library (used for cron parsing) is pure JavaScript with no Node.js dependencies. It should work in CF Workers without modification. Verify by checking its `package.json` for any Node.js-specific imports.

---

## 5. Authentication & Cryptography

### Current Implementation

Uses Node.js `crypto` module for AES-256-GCM encryption:
- `createCipheriv` / `createDecipheriv`
- `randomBytes` for IV and token ID generation
- `Buffer` for binary data handling

### CF Workers Options

**Option A: Web Crypto API (native, no compat flag needed)**

```typescript
// Key import
const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(encryptionKey.slice(0, 32)),
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);

// Encrypt
const iv = crypto.getRandomValues(new Uint8Array(16));
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  new TextEncoder().encode(JSON.stringify(payload))
);

// Note: Web Crypto API appends the auth tag to the ciphertext automatically
```

**Option B: `node:crypto` via `nodejs_compat` flag**

With `nodejs_compat` enabled, the existing `TokenService` code works largely unchanged. The `node:crypto` module is fully supported in CF Workers.

**Recommendation: Option B for initial migration, Option A as a future optimization**

Using `nodejs_compat` reduces the scope of changes for the initial migration. The `TokenService` class can remain largely unchanged. However, note that `nodejs_compat` increases bundle size. A future optimization could move to Web Crypto API.

**Important consideration:** The `TokenService` is currently synchronous. Web Crypto API operations (`crypto.subtle.*`) are async. If migrating to Web Crypto, the `TokenService` methods (`encrypt`, `decrypt`, etc.) must become `async`. This has a cascading effect on auth middleware and route handlers.

### Token Format Compatibility

If moving from Node.js `crypto` to Web Crypto API, there is a **token format difference**: Web Crypto's AES-GCM appends the auth tag to the ciphertext, while the current implementation manually concatenates `[IV][authTag][ciphertext]`. For token compatibility between environments:

- Either maintain the same binary format by manually extracting the auth tag from Web Crypto output
- Or accept that tokens are not portable between container and CF deployments (likely acceptable — separate deployments would have separate encryption keys anyway)

---

## 6. Email Delivery

### Current Implementation

- `NodemailerDelivery` — SMTP via Nodemailer
- `ConsoleDelivery` — Development logging

Nodemailer depends on Node.js `net` and `tls` modules, which are not available in CF Workers. It cannot be used directly.

### CF Workers Options

**Option 1: Cloudflare Email Service (Recommended long-term)**

- Native CF binding — no API keys needed
- Announced December 2025, currently in private beta
- Configured via `wrangler.toml` binding
- Most "CF-native" approach
- Risk: still in beta; may not be GA when implementation begins

**Option 2: Resend**

- Third-party transactional email API
- Well-documented in CF Workers docs
- Requires API key (stored as a Worker secret)
- Simple `fetch`-based API

**Option 3: MailChannels Email API**

- Free tier: 100 emails/day
- Previously had free CF Workers integration (now sunset)
- Requires account setup and API key

### Recommendation

Create a `CloudflareEmailDelivery` implementation that uses a `fetch`-based email API (Resend or MailChannels initially, migrating to CF Email Service when GA). The existing `EmailDelivery` interface already abstracts this cleanly:

```typescript
export class ResendDelivery implements EmailDelivery {
  constructor(private apiKey: string) {}

  async sendMessage(to: string, recipientName: string, message: string): Promise<boolean> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ajaas@yourdomain.com',
        to,
        subject: `Awesome Job, ${recipientName}!`,
        html: `...`, // Existing HTML template
      }),
    });
    return response.ok;
  }
}
```

The Docker/Node.js path continues to use `NodemailerDelivery` unchanged.

---

## 7. Secrets Management

### Current Model

Environment variables loaded via `process.env`:
- `ENCRYPTION_KEY` — token encryption
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — email config
- Feature flags (`SECURITY_ENABLED`, etc.)

### CF Workers Model

**Worker Secrets** (for sensitive values):

```bash
# Set via Wrangler CLI
wrangler secret put ENCRYPTION_KEY
wrangler secret put EMAIL_API_KEY
```

- Encrypted at rest
- Not visible in dashboard or Wrangler after setting
- Accessed via `env` object in Worker: `env.ENCRYPTION_KEY`

**Environment Variables** (for non-sensitive config):

```jsonc
// wrangler.jsonc
{
  "vars": {
    "SECURITY_ENABLED": "true",
    "SCHEDULE_ENABLED": "true",
    "TOUGH_LOVE_ENABLED": "true",
    "RATE_LIMIT_ENABLED": "false",
    "RATE_LIMIT_MAX": "100"
  }
}
```

**Local Development** (`.dev.vars` file):

```
ENCRYPTION_KEY=your-32-character-secret-key-here!!!
EMAIL_API_KEY=re_xxxxx
```

This file is `.gitignore`d and used only for local `wrangler dev`.

### Config Loading Changes

The `loadConfig()` function currently reads from `process.env`. For CF Workers:

- With `nodejs_compat_populate_process_env` flag (default for compat date >= 2025-04-01), `process.env` is populated from bindings. The existing `loadConfig()` would work.
- Alternatively, accept the `env` object from the Worker handler and pass it through.

**Recommendation:** Use `nodejs_compat_populate_process_env` so the existing `loadConfig()` works unchanged across both environments. This reduces migration friction.

### Secrets Inventory

| Secret | Docker (.env) | CF Workers | Notes |
|--------|--------------|------------|-------|
| `ENCRYPTION_KEY` | `.env` file | `wrangler secret put` | 32+ chars, AES-256 key |
| `SMTP_HOST/PORT/USER/PASS` | `.env` file | N/A on CF | Node.js path only |
| `EMAIL_API_KEY` | `.env` file (if used) | `wrangler secret put` | CF path only (Resend/MailChannels) |
| `SMTP_FROM` / `EMAIL_FROM` | `.env` file | `vars` in wrangler.jsonc | Not sensitive |

---

## 8. Static Assets & Web UI

### Current Model

- Vite + React SPA built to `dist/web/`
- Served conditionally via `@fastify/static` when `WEB_ENABLED=true`
- SPA fallback handler for client-side routing (non-`/api` paths serve `index.html`)
- Runtime toggle — `WEB_ENABLED=false` means the static plugin is never registered and AJAAS runs as a pure API

This runtime toggle is a key design point: some deployments may want API-only mode with no landing page.

### The CF Workers Challenge

On Cloudflare Workers, static asset serving is fundamentally different. **Workers Assets** serves files at the **platform level** — the CDN handles matching requests to files in the configured asset directory *before* the Worker code even runs. This means:

- If `assets.directory` is configured in `wrangler.jsonc`, those files are **always served** for matching requests
- There is no runtime equivalent of `if (config.web.enabled)` — the platform serves assets unconditionally
- The Worker only receives requests that **don't match** a static file (unless `run_worker_first` is configured)

This turns `WEB_ENABLED` from a runtime toggle into a **deployment-time decision**.

### CF Workers Asset Serving Options

**Option A (Recommended): Wrangler Environments — deploy-time toggle**

Use [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/) to define two deployment profiles in a single config file:

```jsonc
// wrangler.jsonc
{
  "name": "ajaas",
  "main": "dist/worker.js",
  "compatibility_date": "2025-09-01",
  "compatibility_flags": ["nodejs_compat"],

  // Shared config (DO bindings, vars, secrets, etc.)
  "durable_objects": { ... },
  "vars": { ... },

  // Default: full deployment with Web UI
  "assets": {
    "directory": "./dist/web",
    "not_found_handling": "single-page-application"
  },

  // API-only environment: no assets block
  "env": {
    "api-only": {
      "name": "ajaas-api"
      // No "assets" key — pure Worker, no static files
    }
  }
}
```

Deploy with:
```bash
wrangler deploy              # Full (API + Web UI)
wrangler deploy --env api-only  # API only
```

| Pros | Cons |
|------|------|
| Single config file | Two deployment targets to remember |
| Clean separation — CDN serves assets at the edge, zero Worker CPU cost | `WEB_ENABLED` is no longer a runtime toggle on CF |
| SPA fallback handled by the platform | Need to build web assets before deploying full mode |
| Best performance for static file delivery | |

**Option B: `run_worker_first` with ASSETS binding — runtime toggle**

Configure assets with a binding and `run_worker_first: true`, allowing the Worker to decide at runtime whether to serve assets:

```jsonc
// wrangler.jsonc
{
  "assets": {
    "directory": "./dist/web",
    "binding": "ASSETS",
    "run_worker_first": true,
    "not_found_handling": "single-page-application"
  }
}
```

```typescript
// In the Worker entry point
app.get('*', async (c) => {
  if (config.web.enabled) {
    // Proxy to the platform's asset serving
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({ error: 'Not found' }, 404);
});
```

| Pros | Cons |
|------|------|
| Runtime toggle preserved — `WEB_ENABLED` works as before | **Every request** goes through the Worker first (latency + CPU cost) |
| Single deployment target | Defeats the purpose of CDN-level asset serving |
| Matches current behaviour model | More complex Worker code |
| | Static files always uploaded even if unused |

**Option C: `run_worker_first` with route patterns — hybrid**

Use `run_worker_first` as an array to selectively route:

```jsonc
{
  "assets": {
    "directory": "./dist/web",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*", "/health"],
    "not_found_handling": "single-page-application"
  }
}
```

This sends `/api/*` and `/health` to the Worker, and all other paths are served as static assets by the CDN.

| Pros | Cons |
|------|------|
| API routes go through Worker; static files served from CDN | No runtime `WEB_ENABLED` toggle |
| Best performance for both paths | Route patterns must be maintained in two places (wrangler + Hono) |
| Clean separation | Effectively same as Option A without the toggle |

### Recommendation

**Option A (Wrangler Environments)** is the recommended approach. The reasoning:

1. **Performance**: Static files served directly from the CDN edge — no Worker invocation, no CPU billing, lowest latency globally.
2. **Simplicity**: The Worker code doesn't need to know about static file serving at all. It only handles `/api/*` and `/health`.
3. **Cost**: Worker requests are billed per invocation. Having the CDN serve static files avoids paying for every CSS/JS/image request.
4. **Pragmatism**: The `WEB_ENABLED` toggle exists so operators can choose API-only mode. On CF Workers, this choice happens at deploy time rather than runtime — and that's fine. You deploy a different environment, not toggle a flag.

The trade-off is that `WEB_ENABLED` becomes deployment-time on CF and runtime on Docker. Document this clearly.

### Request Flow: CF Workers with Assets

```
Client Request: GET /awesome/Sarah
    │
    ├─ CDN checks: is /awesome/Sarah a static file? → No
    ├─ Forward to Worker
    └─ Worker: Hono routes → return JSON

Client Request: GET /index.html
    │
    ├─ CDN checks: is /index.html a static file? → Yes
    └─ CDN serves dist/web/index.html (Worker never invoked)

Client Request: GET /some/spa/route
    │
    ├─ CDN checks: is /some/spa/route a static file? → No
    ├─ not_found_handling: "single-page-application"
    └─ CDN serves dist/web/index.html (SPA fallback, Worker never invoked)
```

### Request Flow: CF Workers API-only (no assets)

```
Client Request: GET /awesome/Sarah
    │
    └─ Worker: Hono routes → return JSON

Client Request: GET /
    │
    └─ Worker: Hono 404 handler → { error: "Not found" }
```

### Hono on Node.js (Docker path)

The Docker path preserves the runtime `WEB_ENABLED` toggle, using Hono's static middleware:

```typescript
// src/entrypoints/node.ts
import { serveStatic } from '@hono/node-server/serve-static';

if (config.web.enabled) {
  // Serve static files from dist/web
  app.use('/*', serveStatic({ root: './dist/web' }));

  // SPA fallback — non-API routes serve index.html
  app.get('*', async (c) => {
    if (!c.req.path.startsWith('/api')) {
      return serveStatic({ root: './dist/web', path: 'index.html' })(c, async () => {});
    }
    return c.json({ error: 'Not found' }, 404);
  });
}
```

### Build Pipeline

The web UI build remains unchanged regardless of deployment target:

```bash
npm run build:web    # Vite builds React SPA → dist/web/
```

For CF deployment (full mode), `dist/web/` must exist before `wrangler deploy`. The deploy script should enforce this:

```bash
# package.json scripts
{
  "deploy:cf": "npm run build:api && npm run build:web && wrangler deploy",
  "deploy:cf:api-only": "npm run build:api && wrangler deploy --env api-only"
}
```

### Web UI Code Changes

The React SPA itself (`src/web/`) requires **no changes**. It's a client-side application that calls `/api/*` endpoints via relative URLs. Whether it's served by Fastify, Hono, or CF Workers Assets, the app functions identically.

The only consideration: if the API and web UI are deployed to different origins (e.g., web on CF Pages, API on CF Workers), CORS headers would need to be added. However, with Workers Assets, both are served from the same origin — no CORS needed.

### Env Type Update

When using the `ASSETS` binding (Option B/C), add to the `Env` type:

```typescript
interface Env {
  // ... existing bindings
  ASSETS?: Fetcher;  // Only present when assets are configured with a binding
}
```

For Option A (recommended), no `ASSETS` binding is needed in the Worker code — the platform handles everything.

---

## 9. Configuration

### `wrangler.jsonc` (CF Workers config)

```jsonc
{
  "name": "ajaas",
  "main": "dist/worker.js",
  "compatibility_date": "2025-09-01",
  "compatibility_flags": ["nodejs_compat"],

  // --- Shared configuration ---

  "vars": {
    "SECURITY_ENABLED": "true",
    "SCHEDULE_ENABLED": "true",
    "TOUGH_LOVE_ENABLED": "true",
    "RATE_LIMIT_ENABLED": "false",
    "RATE_LIMIT_MAX": "100",
    "RATE_LIMIT_WINDOW": "1 minute"
  },

  "durable_objects": {
    "bindings": [
      {
        "name": "SCHEDULE_MANAGER",
        "class_name": "ScheduleManager"
      }
    ]
  },

  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["ScheduleManager"]
    }
  ],

  // --- Default deployment: API + Web UI ---

  "assets": {
    "directory": "./dist/web",
    "not_found_handling": "single-page-application"
  },

  // --- API-only deployment (no web UI) ---

  "env": {
    "api-only": {
      "name": "ajaas-api"
      // No "assets" block — Worker handles all requests, no static files
    }
  }
}
```

**Deploy commands:**
```bash
# Full deployment (API + Web UI)
npm run build && wrangler deploy

# API-only deployment (no web UI)
npm run build:api && wrangler deploy --env api-only
```

Note: `WEB_ENABLED` is deliberately absent from `vars`. On CF Workers, front-end serving is controlled by which deployment profile you use, not a runtime flag. On Docker/Node.js, it remains a runtime environment variable.

### TypeScript Bindings

```typescript
// src/types/env.ts
interface Env {
  // Durable Objects
  SCHEDULE_MANAGER: DurableObjectNamespace<ScheduleManager>;

  // Secrets (set via wrangler secret put)
  ENCRYPTION_KEY: string;
  EMAIL_API_KEY: string;

  // Environment variables (set in wrangler.jsonc vars)
  SECURITY_ENABLED: string;
  SCHEDULE_ENABLED: string;
  TOUGH_LOVE_ENABLED: string;
  RATE_LIMIT_ENABLED: string;
  RATE_LIMIT_MAX: string;
  RATE_LIMIT_WINDOW: string;
}
```

---

## 10. Project Structure

### Proposed Directory Layout

```
/
├── src/
│   ├── app.ts                    # Hono app definition (shared routes, middleware)
│   ├── config.ts                 # Configuration loading (works with both envs)
│   │
│   ├── entrypoints/
│   │   ├── node.ts               # Node.js entry (Docker path): @hono/node-server
│   │   └── worker.ts             # CF Worker entry: exports app + DO classes
│   │
│   ├── routes/
│   │   ├── messages.ts           # Message endpoints (Hono)
│   │   └── schedule.ts           # Schedule endpoints (Hono)
│   │
│   ├── services/
│   │   └── messages.ts           # Message generation (unchanged)
│   │
│   ├── storage/
│   │   ├── interface.ts          # Storage interfaces (sync + async)
│   │   ├── sqlite.ts             # better-sqlite3 impl (Node.js/Docker path)
│   │   └── do-sqlite.ts          # Durable Object SQLite impl (CF Workers path)
│   │
│   ├── durable-objects/
│   │   └── schedule-manager.ts   # DO class: storage + alarm-based scheduling
│   │
│   ├── auth/
│   │   ├── token.ts              # Token encryption/decryption (unchanged)
│   │   └── middleware.ts         # Auth middleware (adapted for Hono)
│   │
│   ├── scheduler/
│   │   └── index.ts              # Polling scheduler (Node.js path only)
│   │
│   ├── delivery/
│   │   ├── email.ts              # EmailDelivery interface + Nodemailer + Console
│   │   └── email-api.ts          # Resend/CF Email Service impl (CF path)
│   │
│   ├── types/
│   │   └── env.ts                # CF Worker Env type definitions
│   │
│   └── web/                      # React SPA (unchanged)
│       ├── src/
│       ├── vite.config.ts
│       └── package.json
│
├── scripts/
│   └── generate-key.ts           # CLI key generation (unchanged)
│
├── wrangler.jsonc                # CF Workers configuration
├── Dockerfile                    # Docker build (updated for Hono)
├── package.json
├── tsconfig.json
├── tsconfig.worker.json          # Separate TS config for Worker build
├── vitest.config.ts
├── .dev.vars.example             # CF local dev secrets template
├── .env.example                  # Docker/Node.js env template
└── PLANNING-CLOUDFLARE-WORKERS.md
```

### Key Structural Changes

1. **`src/app.ts`** — The core Hono app with all route and middleware registration. Framework-agnostic; no Node.js or CF-specific code.

2. **`src/entrypoints/`** — Platform-specific bootstrap code. The Node.js entrypoint creates the `@hono/node-server`, initializes `better-sqlite3`, and starts the polling scheduler. The Worker entrypoint exports the Hono app as the default handler and exports the Durable Object class.

3. **`src/durable-objects/`** — CF-specific Durable Object classes. Only included in the Worker build.

4. **`src/storage/do-sqlite.ts`** — A new `Storage` implementation using the DO's `SqlStorage` API.

5. **Separate `tsconfig.worker.json`** — Worker builds target `esnext`/`webworker` with CF-specific types. The Node.js build continues using the existing `tsconfig.json`.

---

## 11. Implementation Phases

### Phase 1: Hono Migration (Framework Swap)

**Goal:** Replace Fastify with Hono. All tests pass. Docker deployment works as before.

**Tasks:**
- [ ] Add Hono dependencies: `hono`, `@hono/node-server`, `@hono/swagger-ui`, `@hono/zod-openapi`
- [ ] Create `src/app.ts` — Hono app with all routes migrated from Fastify
- [ ] Migrate `src/routes/messages.ts` — Fastify route handlers to Hono handlers
- [ ] Migrate `src/routes/schedule.ts` — Fastify route handlers to Hono handlers
- [ ] Migrate `src/auth/middleware.ts` — Fastify `preHandler` to Hono middleware
- [ ] Migrate OpenAPI/Swagger setup from `@fastify/swagger` to `@hono/zod-openapi`
- [ ] Migrate rate limiting
- [ ] Migrate static file serving to `@hono/node-server/serve-static`
- [ ] Update `src/index.ts` (or create `src/entrypoints/node.ts`) to use `@hono/node-server`
- [ ] Update all tests to use Hono's test client instead of Fastify's `inject()`
- [ ] Remove Fastify dependencies
- [ ] Update Dockerfile if entry point path changed
- [ ] Verify Docker build and all tests pass

**No storage or scheduling changes in this phase.**

### Phase 2: Async Storage Interface

**Goal:** Make the Storage interface async-compatible so it works with both synchronous (better-sqlite3) and asynchronous (DO RPC) backends.

**Tasks:**
- [ ] Define `AsyncStorage` interface alongside the existing `Storage` interface
- [ ] Create `SyncToAsyncAdapter` that wraps synchronous `Storage` as `AsyncStorage`
- [ ] Update route handlers and auth middleware to work with `AsyncStorage`
- [ ] Update tests to work with async storage
- [ ] Verify no regressions on Docker path

### Phase 3: Cloudflare Workers Entry Point

**Goal:** AJAAS runs on CF Workers with Durable Objects for storage and alarms for scheduling.

**Tasks:**
- [ ] Create `wrangler.jsonc` configuration
- [ ] Create `tsconfig.worker.json` for Worker-specific TypeScript compilation
- [ ] Create `src/types/env.ts` with CF binding type definitions
- [ ] Create `src/entrypoints/worker.ts` — Worker module entry point
- [ ] Create `src/durable-objects/schedule-manager.ts` — DO with SQLite storage + alarm
- [ ] Create `src/storage/do-sqlite.ts` — Storage implementation using DO SQLite API
- [ ] Implement `RpcStorageClient` — async bridge from Worker to DO
- [ ] Create `src/delivery/email-api.ts` — fetch-based email delivery (Resend)
- [ ] Add build script for Worker (`wrangler deploy` or custom bundling)
- [ ] Add `.dev.vars.example` template
- [ ] Test with `wrangler dev` locally
- [ ] Add `npm run deploy:cf` script

### Phase 4: Testing & Polish

**Goal:** Both deployment targets are tested, documented, and production-ready.

**Tasks:**
- [ ] Add CF Workers-specific tests (using `unstable_dev` or Miniflare)
- [ ] Verify DO SQLite storage with alarm-based scheduling
- [ ] Test secrets management (`wrangler secret put`)
- [ ] Add deployment documentation to README
- [ ] Update PLANNING.md with CF Workers as a deployment option
- [ ] Test Web UI served via Workers Assets
- [ ] Verify health check endpoint works on both paths
- [ ] End-to-end testing of schedule creation → alarm execution → email delivery

---

## 12. Key Decisions Required

### Decision 1: Hono Migration Strategy
- **Option A:** Replace Fastify with Hono everywhere (recommended)
- **Option B:** Wrapper pattern preserving both frameworks
- **Status:** Needs confirmation

### Decision 2: Durable Object Topology
- **Option A:** Singleton ScheduleManager DO (simpler, recommended for current scale)
- **Option B:** Per-schedule DO with registry (more scalable, more complex)
- **Status:** Needs confirmation

### Decision 3: Email Provider for CF Workers
- **Option A:** Resend (stable, available now)
- **Option B:** MailChannels Email API (free tier 100/day)
- **Option C:** CF Email Service (most native, but beta)
- **Status:** Needs selection based on availability and volume needs

### Decision 4: Web Crypto vs nodejs_compat for Encryption
- **Option A:** Keep `node:crypto` via `nodejs_compat` (less change, larger bundle)
- **Option B:** Migrate to Web Crypto API (more CF-native, async changes)
- **Status:** Recommend Option A initially, Option B as future optimization

### Decision 5: OpenAPI Documentation Approach
- **Option A:** `@hono/zod-openapi` — Zod schemas with OpenAPI decorators (more type-safe)
- **Option B:** `@hono/swagger-ui` with manually maintained spec
- **Status:** Recommend Option A as it replaces both `@fastify/swagger` and validation

### Decision 6: Token Portability
- **Option A:** Tokens must work across both Docker and CF deployments (same format)
- **Option B:** Tokens are deployment-specific (different encryption keys anyway)
- **Status:** Likely Option B is sufficient — clarify requirements

### Decision 7: Web UI Serving Strategy on CF Workers
- **Option A (Recommended):** Wrangler environments — deploy-time toggle (`wrangler deploy` for full, `wrangler deploy --env api-only` for API-only). CDN serves static assets directly with zero Worker CPU cost.
- **Option B:** `run_worker_first: true` with `ASSETS` binding — runtime toggle preserved, but all requests (including static files) pass through Worker code, adding latency and cost.
- **Option C:** `run_worker_first` with route patterns — hybrid, but effectively same as Option A without the toggle.
- **Status:** Recommend Option A. Accept that `WEB_ENABLED` is a deploy-time choice on CF and a runtime choice on Docker. Document the difference clearly.

---

## 13. Risks & Constraints

### CF Workers Runtime Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| 30s CPU time limit (paid) | Long operations may timeout | Keep handlers fast; offload to DO |
| 128 MB memory limit | Large data sets may exceed | AJAAS data is small; non-issue |
| No filesystem access | Can't write files | Using DO SQLite instead |
| Single-threaded | No worker_threads | AJAAS doesn't use threads |
| 10 GB SQLite per DO | Storage cap | More than sufficient for AJAAS |

### Migration Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hono API incompatibility with existing tests | Medium | Medium | Phase 1 is isolated; verify before proceeding |
| `croner` library CF compatibility | Low | Medium | Test early; pure JS, should work |
| CF Email Service not GA when needed | Medium | Low | Resend fallback is straightforward |
| Web Crypto token format incompatibility | Low | Low | Use `nodejs_compat` initially |
| Async storage refactor breaks existing code | Medium | Medium | Phase 2 isolates this change |

### What Doesn't Change

- `MessageService` — pure logic, no runtime dependencies
- Message templates — data, not code
- `Schedule` / `RevokedToken` data models
- SQLite schema
- Web UI (React SPA)
- `generate-key.ts` CLI script (Node.js only tool)
- OpenAPI endpoint definitions (semantics, just different framework syntax)

---

## 14. References

### Cloudflare Documentation
- [Durable Objects SQLite Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Durable Objects Overview](https://developers.cloudflare.com/durable-objects/)
- [Durable Objects Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Rules of Durable Objects (Best Practices)](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers Secrets Store](https://developers.cloudflare.com/secrets-store/integrations/workers/)
- [Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Workers node:crypto (nodejs_compat)](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [Building a Scheduling System with Workers and Durable Objects](https://blog.cloudflare.com/building-scheduling-system-with-workers-and-durable-objects/)
- [CF Email Service (Private Beta)](https://blog.cloudflare.com/email-service/)
- [Send Emails with Resend from Workers](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/)

### Hono Framework
- [Hono - Cloudflare Workers Getting Started](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hono - Cloudflare Durable Objects Example](https://hono.dev/examples/cloudflare-durable-objects)
- [Hono GitHub Repository](https://github.com/honojs/hono)
- [CF Workers Framework Guide: Hono](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)

### Cloudflare Workers Assets
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers Assets Binding & Configuration](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Wrangler Environments](https://developers.cloudflare.com/workers/wrangler/environments/)

### Blog Posts
- [Zero-latency SQLite storage in every Durable Object](https://blog.cloudflare.com/sqlite-in-durable-objects/)
- [Durable Objects Alarms — a wake-up call for your applications](https://blog.cloudflare.com/durable-objects-alarms/)
