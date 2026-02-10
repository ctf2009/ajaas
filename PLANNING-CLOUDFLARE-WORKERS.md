# AJaaS - Cloudflare Workers Deployment Plan

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
    ├── Auth middleware (AES-256-GCM via src/crypto.ts)
    ├── MessageService (in-memory templates)
    ├── Scheduler (setInterval polling loop)
    ├── Storage (async interface)
    │   ├── SQLiteStorage (better-sqlite3) — default
    │   └── PostgresStorage (pg) — via factory
    ├── Delivery
    │   ├── Email (Nodemailer SMTP)
    │   └── Webhook (fetch + HMAC-SHA256 signing)
    └── Data encryption at rest (recipientEmail, webhookUrl, webhookSecret)
```

- Single long-running process
- Storage factory pattern: SQLite or PostgreSQL based on connection URL
- Async `Storage` interface with encryption-at-rest for sensitive fields
- `setInterval` polling for schedule execution
- Centralized `crypto.ts` module (AES-256-GCM) for tokens AND data encryption
- Webhook delivery with optional HMAC-SHA256 signing
- `.env` file loading via `src/env.ts`
- Docker multi-stage build for deployment

### Proposed: Cloudflare Workers

```
Client Request
    |
    v
[Hono on CF Workers runtime]
    |
    ├── Routes (messages, schedule)  ← Worker (stateless)
    ├── Auth middleware (AES-256-GCM via nodejs_compat)
    ├── MessageService (in-memory templates) ← Worker (stateless)
    |
    ├── Durable Object: ScheduleManager
    │   ├── SQLite storage (schedules, revoked tokens)
    │   ├── Data encryption at rest (same crypto.ts)
    │   └── Alarm handler (schedule execution)
    |
    └── Delivery
        ├── Email (Resend / CF Email Service — fetch-based)
        └── Webhook (fetch + HMAC-SHA256 signing — works as-is)
```

- Stateless Worker for HTTP handling
- Durable Object with embedded SQLite for persistent state
- DO Alarms for precise, per-schedule wake-ups (replaces polling)
- `node:crypto` via `nodejs_compat` (existing `crypto.ts` works unchanged)
- Webhook delivery works natively (uses `fetch`)
- CF-native or third-party email sending (replaces Nodemailer only)
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

The `Storage` interface (`src/storage/interface.ts`) is already **fully async** and well-abstracted:

```typescript
interface Storage {
  revokeToken(jti: string): Promise<void>;
  isTokenRevoked(jti: string): Promise<boolean>;
  createSchedule(schedule: Omit<Schedule, 'id' | 'createdAt'>): Promise<Schedule>;
  getSchedule(id: string): Promise<Schedule | null>;
  getSchedulesDue(beforeTimestamp: number): Promise<Schedule[]>;
  updateScheduleNextRun(id: string, nextRun: number): Promise<void>;
  deleteSchedule(id: string): Promise<boolean>;
  listSchedules(createdBy?: string): Promise<Schedule[]>;
  close(): Promise<void>;
}
```

This is a significant advantage:
- **Already async** — no refactoring needed for DO RPC (which is inherently async)
- **Factory pattern** exists (`src/storage/factory.ts`) — selects backend based on connection URL
- **Two implementations** already: `SQLiteStorage` and `PostgresStorage`
- **Encryption at rest** built in — both backends encrypt `recipientEmail`, `webhookUrl`, `webhookSecret`
- Adding a DO SQLite implementation is a natural extension of this pattern

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

### Schema

The existing SQLite schema, including webhook columns and encryption-at-rest:

```sql
CREATE TABLE revoked_tokens (
  jti TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL
);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  recipient_email TEXT NOT NULL,      -- encrypted if DATA_ENCRYPTION_KEY set
  endpoint TEXT NOT NULL,
  message_type TEXT,
  from_name TEXT,
  cron TEXT NOT NULL,
  next_run INTEGER NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'email',
  webhook_url TEXT,                   -- encrypted if DATA_ENCRYPTION_KEY set
  webhook_secret TEXT,                -- encrypted if DATA_ENCRYPTION_KEY set
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_schedules_next_run ON schedules(next_run);
CREATE INDEX idx_schedules_created_by ON schedules(created_by);
```

This schema transfers directly to DO SQLite. The encryption-at-rest uses the centralized `crypto.ts` module (AES-256-GCM), which works on CF Workers via `nodejs_compat`.

### Storage Interface — Already Async

The `Storage` interface is already fully async (all methods return `Promise`). This means:

- **No `AsyncStorage` / `SyncToAsyncAdapter` needed** — the original plan's Phase 2 is complete
- Route handlers, auth middleware, and the scheduler already `await` all storage calls
- The DO SQLite implementation can implement the same `Storage` interface directly
- The storage factory (`createStorage`) can be extended with a `'do-sqlite'` path

The only new code needed is an `RpcStorageClient` that bridges the Worker → DO boundary:

```typescript
// Worker-side: proxies Storage calls to the Durable Object via RPC
class RpcStorageClient implements Storage {
  constructor(private stub: DurableObjectStub<ScheduleManager>) {}
  async isTokenRevoked(jti: string): Promise<boolean> {
    return this.stub.isTokenRevoked(jti);
  }
  async createSchedule(schedule: ...): Promise<Schedule> {
    return this.stub.createSchedule(schedule);
  }
  // ... all methods delegate to DO RPC
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

Cryptography is now **centralized** in `src/crypto.ts`, used for two purposes:

1. **Token encryption** — `TokenService` uses `encrypt()`/`decrypt()` for API key tokens
2. **Data-at-rest encryption** — Storage backends use the same functions to encrypt `recipientEmail`, `webhookUrl`, `webhookSecret`

The module uses:
- `createCipheriv` / `createDecipheriv` (AES-256-GCM)
- `randomBytes` for IV generation
- `Buffer` for binary data handling
- `createHmac` for webhook HMAC-SHA256 signatures (`src/delivery/webhook.ts`)

Two separate keys:
- `ENCRYPTION_KEY` — for token encryption (via `TokenService`)
- `DATA_ENCRYPTION_KEY` — for storage-level field encryption

### CF Workers Compatibility

**`nodejs_compat` makes all of this work unchanged.** The `crypto.ts` module uses `node:crypto` functions (`createCipheriv`, `createDecipheriv`, `randomBytes`) which are fully supported via `nodejs_compat`. Since the module is already centralized and used by both token and storage layers, there's a single place to verify CF compatibility.

The webhook delivery's `createHmac('sha256', ...)` also works under `nodejs_compat`.

**Web Crypto API migration is NOT recommended at this stage** — the centralized `crypto.ts` is used synchronously by both `TokenService` and both storage backends. Moving to Web Crypto would require making all encryption async, which cascades through the entire codebase. The benefit (smaller bundle) doesn't justify the cost.

### Token Format

Tokens use the format `[IV (16 bytes)][AuthTag (16 bytes)][Ciphertext]` → base64url. This format is consistent across environments when using `nodejs_compat`. Tokens are deployment-specific (different encryption keys), so cross-environment portability is not required.

---

## 6. Delivery (Email & Webhooks)

### Current Implementation

**Email:**
- `NodemailerDelivery` — SMTP via Nodemailer
- `ConsoleDelivery` — Development logging

**Webhook (NEW — already CF-compatible):**
- `WebhookDelivery` — POST JSON payloads via `fetch()` with optional HMAC-SHA256 signing
- `ConsoleWebhookDelivery` — Development logging
- Uses `X-AJaaS-Signature: sha256=<hex>` header when secret provided

Nodemailer depends on Node.js `net` and `tls` modules, which are not available in CF Workers. It cannot be used directly. **Webhook delivery uses `fetch()` and works natively on CF Workers** — no changes needed.

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

Environment variables loaded via `process.env` (with `.env` file support via `src/env.ts`):
- `ENCRYPTION_KEY` — token encryption (32+ chars)
- `DATA_ENCRYPTION_KEY` — storage-level field encryption (32+ chars)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — email config
- `DB_PATH` — database connection URL (SQLite path or PostgreSQL URL)
- Feature flags (`SECURITY_ENABLED`, etc.)

Note: `src/env.ts` uses `fs.readFileSync`/`existsSync` — these are not available on CF Workers. On CF, environment comes from `wrangler.jsonc` vars and secrets, and `.dev.vars` for local dev. The `.env` loader is a Docker/Node.js-only concern.

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
| `ENCRYPTION_KEY` | `.env` file | `wrangler secret put` | 32+ chars, token encryption |
| `DATA_ENCRYPTION_KEY` | `.env` file | `wrangler secret put` | 32+ chars, storage field encryption |
| `SMTP_HOST/PORT/USER/PASS` | `.env` file | N/A on CF | Node.js path only |
| `EMAIL_API_KEY` | `.env` file (if used) | `wrangler secret put` | CF path only (Resend/MailChannels) |
| `SMTP_FROM` / `EMAIL_FROM` | `.env` file | `vars` in wrangler.jsonc | Not sensitive |

---

## 8. Static Assets & Web UI

### Current Model (Docker/Node.js)

- Vite + React SPA built to `dist/web/`
- Served conditionally via `@fastify/static` when `WEB_ENABLED=true`
- SPA fallback handler for client-side routing (non-`/api` paths serve `index.html`)
- Runtime toggle — `WEB_ENABLED=false` means the static plugin is never registered and AJAAS runs as a pure API

### CF Workers: Web UI Always On

On Cloudflare Workers, static asset serving works at the **platform level** via **Workers Assets**. The CDN handles matching requests to files in the configured asset directory *before* the Worker code even runs. There is no `WEB_ENABLED` toggle — the assets config is part of `wrangler.jsonc` and is always active.

**Decision: Accept this.** The CF deployment always includes the web UI. This is a simplification, not a limitation:

- The React SPA is a static bundle — it costs nothing to serve from CF's edge CDN (no Worker CPU, no billing per static request)
- It's the natural expectation when deploying a web service to CF
- It eliminates the need for Wrangler environments, `run_worker_first` configuration, `ASSETS` bindings, or any conditional serving logic in Worker code
- The Worker code has **zero awareness** of static assets — it only handles `/api/*` and `/health`
- `WEB_ENABLED` remains a Docker/Node.js-only toggle for operators who want API-only container deployments

### `wrangler.jsonc` Assets Configuration

```jsonc
{
  "assets": {
    "directory": "./dist/web",
    "not_found_handling": "single-page-application"
  }
}
```

- `directory` — points to the Vite build output
- `not_found_handling: "single-page-application"` — any request that doesn't match a static file *and* isn't handled by the Worker returns `index.html`, enabling client-side routing

### Request Flow

```
Client Request: GET /api/awesome/Sarah
    │
    ├─ CDN checks: is this a static file? → No
    ├─ Forward to Worker
    └─ Worker: Hono routes → return JSON

Client Request: GET /index.html (or /, /assets/main.js, etc.)
    │
    ├─ CDN checks: is this a static file? → Yes
    └─ CDN serves file directly (Worker never invoked)

Client Request: GET /some/spa/route
    │
    ├─ CDN checks: is this a static file? → No
    ├─ Worker checks: does this match a route? → No
    ├─ not_found_handling: "single-page-application"
    └─ CDN serves index.html (SPA fallback)
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

AJAAS already uses Vite for the web frontend. The [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/) (GA since April 2025) unifies the entire CF build — a single `vite build` produces **both** the React SPA client assets **and** the bundled Worker code. It also auto-populates `assets.directory` in the output config, so you don't specify it manually.

There's even a first-class [Hono + CF Workers + Vite template](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/) which closely matches AJAAS's target architecture.

**CF Workers path** — unified Vite build:

```bash
vite build        # Builds React SPA + bundles Worker entry → dist/
wrangler deploy   # Deploys using the output wrangler.json from vite build
```

The plugin reads `wrangler.jsonc` as **input** and generates an output `wrangler.json` alongside the build artefacts. This output config has `assets.directory` auto-populated to point at the client build output. `wrangler deploy` picks this up automatically.

**Docker / Node.js path** — separate builds (unchanged):

```bash
npm run build:api   # tsc → dist/
npm run build:web   # vite build (src/web) → dist/web/
node dist/index.js  # Start server
```

**Root `vite.config.ts` (CF Workers build):**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),   // Reads wrangler.jsonc, bundles Worker, handles assets
  ],
});
```

The plugin looks for `wrangler.jsonc` in the project root. The `main` field in `wrangler.jsonc` points to the Worker entry (`src/entrypoints/worker.ts`), and the plugin bundles it with Vite's bundler — no separate `tsc` or `tsconfig.worker.json` needed.

**Local development:**

```bash
vite dev   # HMR for React SPA + Worker runs in workerd (real CF runtime)
```

This gives you Durable Objects, SQLite, Alarms, and all CF bindings working locally in the actual `workerd` runtime — not a Node.js approximation. Much more reliable than `wrangler dev` for a full-stack app.

**`package.json` scripts:**

```json
{
  "dev": "vite dev",
  "dev:docker": "tsx watch src/entrypoints/node.ts",
  "build": "vite build",
  "build:docker": "tsc && npm --prefix src/web run build",
  "deploy:cf": "vite build && wrangler deploy",
  "start": "node dist/entrypoints/node.js"
}
```

### Web UI Code Changes

The React SPA itself (`src/web/`) requires **no changes**. It's a client-side application that calls `/api/*` endpoints via relative URLs. Whether served by Fastify, Hono, or CF Workers Assets, the app functions identically. Both API and web UI are served from the same origin — no CORS needed.

### Summary: `WEB_ENABLED` Per Platform

| Platform | Web UI behaviour | Toggle |
|----------|-----------------|--------|
| Docker / Node.js | Conditional — `WEB_ENABLED` env var | Runtime |
| CF Workers | Always on — assets served by CDN | None needed |

---

## 9. Configuration

### `wrangler.jsonc` (CF Workers config — input file)

This is the **input** config. When using `@cloudflare/vite-plugin`, `vite build` reads this and generates an output `wrangler.json` with build artefact paths populated automatically.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ajaas",
  "main": "src/entrypoints/worker.ts",
  "compatibility_date": "2025-09-01",
  "compatibility_flags": ["nodejs_compat"],

  "vars": {
    "SECURITY_ENABLED": "true",
    "SCHEDULE_ENABLED": "true",
    "TOUGH_LOVE_ENABLED": "true",
    "RATE_LIMIT_ENABLED": "false",
    "RATE_LIMIT_MAX": "100",
    "RATE_LIMIT_WINDOW": "1 minute"
  },

  "assets": {
    "not_found_handling": "single-page-application"
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
  ]
}
```

Key points:
- **`main`** points to the TypeScript source — Vite bundles it (no `tsc` step)
- **`assets.directory`** is omitted — `vite build` auto-populates it in the output config
- **`assets.not_found_handling`** is set for SPA fallback
- **`WEB_ENABLED`** is absent — on CF Workers the web UI is always served by the CDN (see [Section 8](#8-static-assets--web-ui))

### TypeScript Bindings

```typescript
// src/types/env.ts
interface Env {
  // Durable Objects
  SCHEDULE_MANAGER: DurableObjectNamespace<ScheduleManager>;

  // Secrets (set via wrangler secret put)
  ENCRYPTION_KEY: string;
  DATA_ENCRYPTION_KEY: string;
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
│   ├── crypto.ts                 # Centralized AES-256-GCM encryption (unchanged)
│   ├── env.ts                    # .env file loader (Docker/Node.js path only)
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
│   │   ├── interface.ts          # Async Storage interface + Schedule model (unchanged)
│   │   ├── factory.ts            # Storage factory — extended for DO (CF path)
│   │   ├── sqlite.ts             # better-sqlite3 impl (Node.js/Docker path)
│   │   ├── postgres.ts           # PostgreSQL impl (Node.js/Docker path only)
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
│   │   ├── email-api.ts          # Resend/CF Email Service impl (CF path)
│   │   └── webhook.ts            # WebhookDelivery (works on both paths — uses fetch)
│   │
│   ├── types/
│   │   └── env.ts                # CF Worker Env type definitions
│   │
│   └── web/                      # React SPA
│       ├── src/                  # React components (unchanged)
│       ├── vite.config.ts        # Docker-only web build (kept for standalone SPA build)
│       └── package.json
│
├── scripts/
│   └── generate-key.ts           # CLI key generation (unchanged)
│
├── vite.config.ts                # Root Vite config with @cloudflare/vite-plugin (CF build)
├── wrangler.jsonc                # CF Workers input configuration
├── Dockerfile                    # Docker build (updated for Hono)
├── package.json
├── tsconfig.json                 # Node.js/Docker TypeScript config (tsc)
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

5. **Root `vite.config.ts`** — The CF build config. Uses `@cloudflare/vite-plugin` which reads `wrangler.jsonc`, bundles the Worker entry point from TypeScript source, builds the React SPA, and produces everything needed for `wrangler deploy`. No separate `tsconfig.worker.json` needed — Vite handles the bundling.

6. **`src/web/vite.config.ts`** — Retained for the Docker path's standalone SPA build (`npm run build:web`). The CF path doesn't use this — the root `vite.config.ts` handles both client and Worker.

### Two Build Pipelines

| | CF Workers | Docker / Node.js |
|--|-----------|------------------|
| **Vite config** | Root `vite.config.ts` (with `@cloudflare/vite-plugin`) | `src/web/vite.config.ts` (SPA only) |
| **API build** | Vite bundles `src/entrypoints/worker.ts` | `tsc` compiles to `dist/` |
| **Web build** | Vite builds React SPA alongside Worker | Separate `npm run build:web` |
| **Output** | Single `dist/` with Worker + assets + output `wrangler.json` | `dist/` (API) + `dist/web/` (SPA) |
| **Local dev** | `vite dev` (runs in `workerd` — real CF runtime) | `tsx watch src/entrypoints/node.ts` |
| **Deploy** | `wrangler deploy` (reads output `wrangler.json`) | `docker build` + `docker run` |

---

## 11. Implementation Phases

> **Note:** The original Phase 2 (Async Storage Interface) has been completed on `main`. The `Storage` interface is already fully async, with factory pattern and two backend implementations (SQLite, PostgreSQL). This reduces the plan from 4 phases to 3.

### Phase 1: Hono Migration (Framework Swap)

**Goal:** Replace Fastify with Hono. All tests pass. Docker deployment works as before.

**Tasks:**
- [ ] Add Hono dependencies: `hono`, `@hono/node-server`, `@hono/swagger-ui`, `@hono/zod-openapi`
- [ ] Create `src/app.ts` — Hono app with all routes migrated from Fastify
- [ ] Migrate `src/routes/messages.ts` — Fastify route handlers to Hono handlers
- [ ] Migrate `src/routes/schedule.ts` — Fastify route handlers to Hono handlers (incl. webhook fields)
- [ ] Migrate `src/auth/middleware.ts` — Fastify `preHandler`/`declare module` to Hono middleware (`c.set()`/`c.get()`)
- [ ] Migrate OpenAPI/Swagger setup from `@fastify/swagger` to `@hono/zod-openapi`
- [ ] Migrate rate limiting
- [ ] Migrate static file serving to `@hono/node-server/serve-static`
- [ ] Create `src/entrypoints/node.ts` to use `@hono/node-server` (replaces `src/index.ts`)
- [ ] Update all tests to use Hono's test client instead of Fastify's `inject()`
- [ ] Remove Fastify dependencies (`fastify`, `@fastify/swagger`, `@fastify/swagger-ui`, `@fastify/rate-limit`, `@fastify/static`)
- [ ] Update Dockerfile if entry point path changed
- [ ] Verify Docker build and all tests pass

**No changes to:** storage, scheduling, crypto, delivery, config, env loading.

### Phase 2: Cloudflare Workers Entry Point

**Goal:** AJaaS runs on CF Workers with Durable Objects for storage and alarms for scheduling.

**Tasks:**
- [ ] Add `@cloudflare/vite-plugin` and `wrangler` dependencies
- [ ] Create root `vite.config.ts` with `cloudflare()` plugin + React
- [ ] Create `wrangler.jsonc` input configuration (DO bindings, vars, assets, migrations)
- [ ] Create `src/types/env.ts` with CF binding type definitions
- [ ] Create `src/entrypoints/worker.ts` — Worker module entry point (exports app + DO class)
- [ ] Create `src/durable-objects/schedule-manager.ts` — DO with SQLite + alarm + encryption-at-rest
- [ ] Create `src/storage/do-sqlite.ts` — Storage implementation using DO `SqlStorage` API
- [ ] Implement `RpcStorageClient` — bridges Worker → DO RPC for the `Storage` interface
- [ ] Extend storage factory with DO-aware path (or bypass factory on CF)
- [ ] Create `src/delivery/email-api.ts` — fetch-based email delivery (Resend)
- [ ] Verify `crypto.ts` works under `nodejs_compat` (token encryption + data-at-rest)
- [ ] Verify `WebhookDelivery` works under CF Workers (uses `fetch` + `createHmac`)
- [ ] Add `.dev.vars.example` template (ENCRYPTION_KEY, DATA_ENCRYPTION_KEY, EMAIL_API_KEY)
- [ ] Verify `vite dev` runs locally with workerd (DO, SQLite, Alarms working)
- [ ] Verify `vite build` produces Worker + SPA output
- [ ] Verify `wrangler deploy` works end-to-end
- [ ] Add `deploy:cf` and `dev` scripts to `package.json`

### Phase 3: Testing & Polish

**Goal:** Both deployment targets are tested, documented, and production-ready.

**Tasks:**
- [ ] Add CF Workers-specific tests (using Miniflare / `vite preview` with workerd)
- [ ] Verify DO SQLite storage with alarm-based scheduling
- [ ] Verify data encryption-at-rest in DO SQLite (recipientEmail, webhookUrl, webhookSecret)
- [ ] Test webhook delivery end-to-end from DO alarm → WebhookDelivery
- [ ] Test secrets management (`wrangler secret put` for all 3 secrets)
- [ ] Add deployment documentation to README
- [ ] Update PLANNING.md with CF Workers as a deployment option
- [ ] Test Web UI served via Workers Assets (verify SPA fallback behaviour)
- [ ] Verify health check endpoint works on both paths
- [ ] End-to-end testing of schedule creation → alarm execution → email/webhook delivery
- [ ] Verify `vite preview` matches production behaviour before deploy

---

## 12. Key Decisions Required

### Decision 1: Hono Migration Strategy
- **Option A (Recommended):** Replace Fastify with Hono everywhere
- **Option B:** Wrapper pattern preserving both frameworks
- **Status:** Needs confirmation

### Decision 2: Durable Object Topology
- **Option A (Recommended):** Singleton ScheduleManager DO (simpler, mirrors current model)
- **Option B:** Per-schedule DO with registry (more scalable, more complex)
- **Status:** Needs confirmation

### Decision 3: Email Provider for CF Workers
- **Option A:** Resend (stable, available now)
- **Option B:** MailChannels Email API (free tier 100/day)
- **Option C:** CF Email Service (most native, but beta)
- **Status:** Needs selection based on availability and volume needs

### Decision 4: OpenAPI Documentation Approach
- **Option A (Recommended):** `@hono/zod-openapi` — Zod schemas with OpenAPI decorators (more type-safe)
- **Option B:** `@hono/swagger-ui` with manually maintained spec
- **Status:** Recommend Option A as it replaces both `@fastify/swagger` and validation

### Decisions Already Resolved

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Encryption approach | `nodejs_compat` (keep `node:crypto`) | `crypto.ts` is centralized and synchronous; Web Crypto would require async cascading through tokens AND storage encryption. Not worth the change. |
| Token portability | Deployment-specific (not portable) | Separate deployments use separate `ENCRYPTION_KEY` values anyway. |
| Async Storage interface | Already done | Completed on `main` — all methods return `Promise`, factory pattern exists. |
| Web UI on CF | Always on | CDN serves static assets at zero Worker CPU cost; no toggle needed. |

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
| `nodejs_compat` bundle size | Low | Low | Monitor; optimize later if needed |
| `src/env.ts` imported on CF path | Medium | Medium | Ensure Worker entry point does not import `env.ts` (uses `fs`) |
| PostgreSQL not usable on CF Workers | N/A | N/A | Not a risk — CF path uses DO SQLite; PostgreSQL is Docker-only |

### What Doesn't Change

- `MessageService` — pure logic, no runtime dependencies
- `crypto.ts` — centralized encryption module (works via `nodejs_compat`)
- `TokenService` / `token.ts` — token encryption/decryption
- `WebhookDelivery` — uses `fetch()` and `createHmac`, both CF-compatible
- `Storage` interface — already async, DO implementation fulfils it directly
- `Schedule` / `RevokedToken` data models (including webhook fields)
- SQLite schema (including webhook columns and encryption-at-rest)
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

### Cloudflare Vite Plugin
- [Vite Plugin Overview](https://developers.cloudflare.com/workers/vite-plugin/)
- [Tutorial: React SPA with an API](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)
- [Get Started with the Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/get-started/)
- [Vite Plugin Static Assets Reference](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/)
- [Migrating from wrangler dev](https://developers.cloudflare.com/workers/vite-plugin/reference/migrating-from-wrangler-dev/)
- [Introducing the Cloudflare Vite Plugin (Blog)](https://blog.cloudflare.com/introducing-the-cloudflare-vite-plugin/)

### Hono Framework
- [Hono - Cloudflare Workers Getting Started](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hono - Cloudflare Durable Objects Example](https://hono.dev/examples/cloudflare-durable-objects)
- [Hono GitHub Repository](https://github.com/honojs/hono)
- [CF Workers Framework Guide: Hono](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)
- [Hono + Vite + React Stack (Yusuke Wada)](https://github.com/yusukebe/hono-vite-react-stack)

### Cloudflare Workers Assets
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers Assets Binding & Configuration](https://developers.cloudflare.com/workers/static-assets/binding/)

### Blog Posts
- [Zero-latency SQLite storage in every Durable Object](https://blog.cloudflare.com/sqlite-in-durable-objects/)
- [Durable Objects Alarms — a wake-up call for your applications](https://blog.cloudflare.com/durable-objects-alarms/)
