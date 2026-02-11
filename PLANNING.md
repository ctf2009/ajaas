# AJaaS - Planning

## Concept

A wholesome API that generates personalized "awesome job" messages. Born from a Friday ritual of telling colleagues "Awesome job this week. Take the next 2 days off."

Inspired by FOAAS, but wholesome instead of profane.

---

## Execution Order & Dependencies

The planning items below are largely independent, but some have natural ordering constraints:

```
1. General Refactor (can start now)
   └── No dependencies — clean up the existing codebase first

2. Token Revocation Refinement (can start now, independent of refactor)
   └── No dependency on Hono migration — works with current Fastify routes
   └── Storage interface changes carry forward to CF Workers path

3. GA4 Analytics Integration (can start now)
   └── No dependency on Hono migration — add to React SPA + current Fastify API
   └── If using config endpoint: endpoint carries forward to Hono

4. CF Workers Migration Phase 1: Hono Migration
   └── Should come AFTER items 1-3 are stable (less churn during migration)
   └── All existing tests must pass before starting

5. CF Workers Migration Phase 2: Workers Entry Point
   └── Depends on Phase 1 (Hono) being complete
   └── Token revocation changes will already be in Storage interface

6. CF Workers Migration Phase 3: Testing & Polish
   └── Depends on Phase 2
```

**Recommendation:** Complete items 1-3 first (in any order, or in parallel), then proceed with the CF Workers migration phases sequentially.

---

## Token Revocation Refinement

The current revocation model stores revoked `jti` values in the storage backend and checks on each authenticated request. This works but needs refinement around **how tokens get revoked** and **datastore population**.

### Current State

- Tokens contain a `jti` (unique ID), `sub`, `name`, `role`, and `exp` (see `TokenPayload` in `src/auth/token.ts`)
- Revocation stores only `jti` + `revokedAt` in the `revoked_tokens` table — **no `exp`, `sub`, or other token metadata is stored**
- Check happens in auth middleware (`src/auth/middleware.ts`) on every authenticated request via `storage.isTokenRevoked(jti)`
- No admin API for revoking tokens — only programmatic access via `storage.revokeToken(jti)`
- No cleanup of expired revocations (revoked tokens accumulate indefinitely)
- Token generation (`scripts/generate-key.ts`) is CLI-only and does not persist any record of created tokens

### Current Schema

```sql
CREATE TABLE revoked_tokens (
  jti TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL
);
```

### Files Involved

| File | Current Role | Changes Needed |
|------|-------------|----------------|
| `src/storage/interface.ts` | `revokeToken(jti)`, `isTokenRevoked(jti)` | Add new methods for enhanced revocation |
| `src/storage/sqlite.ts` | SQLite implementation | Schema migration, new methods |
| `src/storage/postgres.ts` | PostgreSQL implementation | Schema migration, new methods |
| `src/auth/middleware.ts` | Checks revocation on each request | May need updates for new role |
| `src/auth/token.ts` | `TokenPayload` type, `Role` type | Add `admin` role if chosen |
| `src/routes/schedule.ts` | Only schedule routes exist | New admin route file needed |
| `scripts/generate-key.ts` | CLI token generation | Optionally store token metadata |

### Areas to Address

1. **Admin Revocation API**
   - Add new route file `src/routes/admin.ts` with `POST /api/admin/revoke` endpoint
   - Requires a new `admin` role (or reuse `schedule` role with admin capability)
   - Consider: should revoking require the full token or just the `jti`?
   - The `Role` type in `src/auth/token.ts` currently only supports `'read' | 'schedule'`
   - Role hierarchy would become: `admin` > `schedule` > `read`

2. **Revocation Cleanup**
   - Revoked tokens whose original `exp` has passed no longer need to be stored
   - **Problem:** the `revoked_tokens` table does not store `exp` — only `jti` and `revokedAt`
   - **Solution options:**
     - (a) Add `exp` column to `revoked_tokens` — populate at revocation time (requires knowing the token's exp)
     - (b) Use a fixed TTL: delete revocations older than N days (e.g., `revokedAt < now - 90d`)
     - (c) If token inventory exists (see item 4), cross-reference `exp` from the `tokens` table
   - On the Node.js path, cleanup can run as part of the scheduler polling loop (`src/scheduler/index.ts`)
   - On the CF Workers path, a DO alarm or scheduled Worker can handle cleanup

3. **Bulk Revocation**
   - Ability to revoke all tokens for a given `sub` (e.g., when a user leaves)
   - **Problem:** `revoked_tokens` has no `sub` column — you'd need to know every `jti` for that subject
   - **Solution options:**
     - (a) Add `sub` column to `revoked_tokens` and support `POST /api/admin/revoke-all?sub=user@company.com`
     - (b) If token inventory exists (see item 4), query all JTIs for a `sub` from the `tokens` table and revoke each
   - Scanning and decrypting all live tokens is impractical (tokens are stateless, not stored)

4. **Token Inventory / Listing**
   - Currently no way to see what tokens exist — they are encrypted, stateless, and not persisted
   - Consider: should `scripts/generate-key.ts` (and any future admin API) also store token metadata in a `tokens` table?
   - Proposed schema:
     ```sql
     CREATE TABLE tokens (
       jti TEXT PRIMARY KEY,
       sub TEXT NOT NULL,
       name TEXT NOT NULL,
       role TEXT NOT NULL,
       exp INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     );
     CREATE INDEX idx_tokens_sub ON tokens(sub);
     ```
   - This would enable: listing active tokens, revoking by selection, audit trails, bulk revocation by `sub`, and expiry-based cleanup
   - Trade-off: adds state to a currently stateless token model
   - The `Storage` interface would need new methods: `storeTokenMetadata()`, `listTokens(sub?)`, `getTokenMetadata(jti)`

---

## GA4 Analytics Integration

Google Analytics 4 (GA4) tracking is **not yet implemented** in the web app. `VITE_GA_MEASUREMENT_ID` is documented as an environment variable in the README but the React code (`src/web/src/App.tsx`, `src/web/src/main.tsx`) does not reference it or include any analytics code.

This is a two-part task: first add GA4 tracking, then decide whether the measurement ID should be build-time or runtime.

### Part 1: Add GA4 Tracking

**Files to create/modify:**
- `src/web/src/analytics.ts` — GA4 initialization and event helpers
- `src/web/src/main.tsx` or `src/web/src/App.tsx` — call initialization on mount
- `src/web/index.html` — add gtag.js script tag (or load dynamically)

**Standard GA4 integration pattern:**
```html
<!-- In index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### Part 2: Build-Time vs Runtime Measurement ID

**Option A: Build-time (simplest)**
- Use `VITE_GA_MEASUREMENT_ID` env var, Vite replaces at build time
- Docker users must rebuild to change the ID
- Pros: zero runtime overhead, GA initialises immediately
- Cons: requires rebuild to change tracking ID

**Option B: Runtime via config endpoint**
- Add `GET /api/config` returning `{ gaMeasurementId: "G-XXX" }` (non-sensitive)
- React app fetches on mount, then initialises GA4 dynamically
- Pros: fully runtime, works on all platforms (including CF Workers where assets are CDN-served)
- Cons: extra HTTP request on page load, brief delay before GA initialises

**Option C: Runtime via HTML template injection**
- Server replaces `__GA_MEASUREMENT_ID__` in `index.html` before serving
- Pros: no extra request
- Cons: requires server-side HTML processing; doesn't work with CF Workers Assets (static CDN)

**Recommendation:** Start with Option A (build-time) — it's the simplest and matches how Vite apps typically handle this. If runtime configuration becomes important (e.g., same Docker image for multiple environments), add a config endpoint later. The config endpoint approach is also the most portable for the CF Workers path.

### Decision

- [ ] Confirm whether to implement GA4 at all (or defer to parking lot)
- [ ] If implementing: build-time (Option A) or runtime (Option B)?
- [ ] Should the config endpoint return other client-side config beyond GA4?

---

## General Refactor

### Code Quality

- [ ] **Error handling consistency** — `src/routes/messages.ts` and `src/routes/schedule.ts` may handle errors differently (some return JSON error objects, some throw). Standardise on a consistent pattern.
- [ ] **Content negotiation** — the `wantsText()` helper and `sendMessage()` in `src/routes/messages.ts` work well but are only used in message routes. If schedule responses should also support text/plain, extract to a shared utility.
- [ ] **Config validation** — `src/config.ts` validates some fields (port range, key length) but not all. Check: does it fail fast on invalid `DB_PATH`? Invalid cron expressions? Invalid SMTP config when scheduling is enabled?
- [ ] **Scheduler error resilience** — `src/scheduler/index.ts` catches errors per-schedule but logs to console. Consider structured logging or an error callback pattern.

### Storage Interface

- [ ] **`deliveryMethod` type** — `src/storage/interface.ts` has `deliveryMethod: 'email' | 'webhook'`. Confirm this is the final set (Discord was removed). If webhook is the extensible delivery mechanism, document that explicitly.
- [ ] **`close()` method** — currently required on the `Storage` interface. CF Workers DO storage doesn't need explicit closing. Consider making it optional or a no-op default, or split into a `Closeable` interface.
- [ ] **PostgreSQL `initialize()`** — `src/storage/postgres.ts` has an `initialize()` method called from the factory but not part of the `Storage` interface. Consider whether this should be formalised.

### Test Coverage

- [ ] **Schedule routes** — `src/routes/schedule.ts` has no dedicated test file. Add `src/routes/schedule.test.ts` covering CRUD operations, auth enforcement, ownership checks, and webhook validation.
- [ ] **Scheduler execution** — `src/scheduler/index.ts` has no test file. Add tests for polling, message generation, delivery dispatch (email vs webhook), and next-run calculation.
- [ ] **Email delivery** — `src/delivery/email.ts` has no test file. Add tests for `NodemailerDelivery` and `ConsoleDelivery`.
- [ ] **Auth middleware** — `src/auth/middleware.ts` has no dedicated test file. Auth is tested indirectly through route tests, but direct middleware tests would be more robust.
- [ ] **Config loading** — `src/config.ts` has no test file. Add tests for env var parsing, defaults, and validation errors.

### Dependencies

- [ ] **Audit unused dependencies** — check if all dependencies in `package.json` are actually imported in the source code.
- [ ] **`@fastify/static`** — verify this is in `dependencies` not `devDependencies` (it's needed at runtime for the Docker path).
- [ ] **Type packages** — `@types/pg`, `@types/better-sqlite3`, `@types/nodemailer` should be in `devDependencies` (they are — just confirm after any changes).

### Documentation Consistency

- [ ] **Verify README, AGENTS.md, and CLAUDE.md all agree** on project structure, available endpoints, config options, and file paths. These files were recently corrected but should be checked after any refactor changes.

---

## Cloudflare Workers Migration

### Overview

Migration from Docker/Container deployment to native **Cloudflare Workers + Durable Objects**. The goal is to embrace CF-native primitives: Workers for compute, Durable Objects with SQLite for persistent state, Alarms for scheduling, and Hono as a portable HTTP framework.

The existing Docker/Container deployment path will be preserved. The codebase will support both targets through abstraction layers and build-time selection.

### Architecture Comparison

**Current: Docker/Container**

```
Client Request
    |
    v
[Fastify on Node.js]
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

**Proposed: Cloudflare Workers**

```
Client Request
    |
    v
[Hono on CF Workers runtime]
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

### HTTP Framework: Hono Migration

Fastify cannot run on Workers (relies on Node.js HTTP server primitives). Replace with Hono everywhere — it runs natively on Node.js (`@hono/node-server`), CF Workers, Bun, and Deno.

| Fastify Plugin | Hono Equivalent |
|---------------|-----------------|
| `@fastify/swagger` | `@hono/zod-openapi` |
| `@fastify/swagger-ui` | `@hono/swagger-ui` |
| `@fastify/rate-limit` | `hono/rate-limiter` or custom middleware |
| `@fastify/static` | `@hono/node-server/serve-static` (Node) / Workers Assets (CF) |
| Fastify `preHandler` | Hono middleware |

### Storage: Durable Objects SQLite

The `Storage` interface is already **fully async** with a factory pattern and two implementations (SQLite, PostgreSQL). Adding a DO SQLite implementation is a natural extension.

**DO Architecture: Singleton ScheduleManager** — one DO holds all schedules and revoked tokens (mirrors current single-process model). Uses DO Alarms instead of polling for schedule execution.

Key characteristics of DO SQLite:
- 10 GB storage per DO
- Point-in-time recovery (30 days)
- Transactional
- Co-located with DO compute

An `RpcStorageClient` bridges the Worker → DO boundary, implementing the `Storage` interface and delegating all calls via DO RPC.

### Scheduling: DO Alarms

| Aspect | Current (Polling) | CF Workers (Alarm) |
|--------|-------------------|---------------------|
| Trigger | `setInterval` every 60s | `alarm()` at exact `nextRun` time |
| Precision | Up to 60s late | Near-exact |
| Resilience | Lost on process restart | Persisted by platform |
| Resource usage | Constant polling | Zero cost when idle |
| Guarantee | Best-effort | At-least-once |

### Cryptography

`nodejs_compat` makes the existing `crypto.ts` module work unchanged on CF Workers. Both token encryption and data-at-rest encryption use `node:crypto` (AES-256-GCM). Web Crypto migration is NOT recommended — the module is synchronous and centralized; making it async would cascade through the entire codebase.

### Delivery on CF Workers

- **Webhook**: Works natively (uses `fetch()` + `createHmac` via `nodejs_compat`)
- **Email**: Nodemailer won't work (needs `net`/`tls`). Replace with fetch-based API:
  - **Resend** — stable, available now
  - **CF Email Service** — most native, currently in beta
  - Docker/Node.js path continues to use Nodemailer unchanged

### Static Assets & Web UI

On CF Workers, static assets are served by the CDN via **Workers Assets** — the Worker code has zero awareness of static files. `WEB_ENABLED` remains a Docker/Node.js-only toggle.

```jsonc
// wrangler.jsonc
{
  "assets": {
    "not_found_handling": "single-page-application"
  }
}
```

### Build Pipeline

Uses `@cloudflare/vite-plugin` for a unified build — single `vite build` produces both the React SPA and bundled Worker code.

| | CF Workers | Docker / Node.js |
|--|-----------|------------------|
| **API build** | Vite bundles Worker entry | `tsc` compiles to `dist/` |
| **Web build** | Vite builds SPA alongside Worker | Separate `npm run build:web` |
| **Local dev** | `vite dev` (runs in `workerd`) | `tsx watch src/entrypoints/node.ts` |
| **Deploy** | `wrangler deploy` | `docker build` + `docker run` |

### Proposed Project Structure

```
/
├── src/
│   ├── app.ts                    # Hono app (shared routes, middleware)
│   ├── config.ts                 # Configuration loading
│   ├── crypto.ts                 # AES-256-GCM encryption (unchanged)
│   ├── env.ts                    # .env loader (Docker/Node.js only)
│   │
│   ├── entrypoints/
│   │   ├── node.ts               # Node.js entry: @hono/node-server
│   │   └── worker.ts             # CF Worker entry: exports app + DO
│   │
│   ├── routes/
│   │   ├── messages.ts           # Message endpoints (Hono)
│   │   └── schedule.ts           # Schedule endpoints (Hono)
│   │
│   ├── services/
│   │   └── messages.ts           # Message generation (unchanged)
│   │
│   ├── storage/
│   │   ├── interface.ts          # Storage interface (unchanged)
│   │   ├── factory.ts            # Storage factory
│   │   ├── sqlite.ts             # better-sqlite3 (Docker path)
│   │   ├── postgres.ts           # PostgreSQL (Docker path)
│   │   └── do-sqlite.ts          # DO SQLite (CF Workers path)
│   │
│   ├── durable-objects/
│   │   └── schedule-manager.ts   # DO: storage + alarm scheduling
│   │
│   ├── auth/
│   │   ├── token.ts              # Token encryption/decryption
│   │   └── middleware.ts         # Auth middleware (Hono)
│   │
│   ├── scheduler/
│   │   └── index.ts              # Polling scheduler (Node.js only)
│   │
│   ├── delivery/
│   │   ├── email.ts              # Nodemailer + Console (Docker path)
│   │   ├── email-api.ts          # Resend/CF Email (CF Workers path)
│   │   └── webhook.ts            # Webhook delivery (both paths)
│   │
│   ├── types/
│   │   └── env.ts                # CF Worker Env type definitions
│   │
│   └── web/                      # React SPA (unchanged)
│
├── scripts/
│   └── generate-key.ts           # CLI key generation
│
├── vite.config.ts                # Root Vite config (CF build)
├── wrangler.jsonc                # CF Workers configuration
├── Dockerfile
├── package.json
└── tsconfig.json
```

### Implementation Phases

#### Phase 1: Hono Migration

**Goal:** Replace Fastify with Hono. All tests pass. Docker deployment works as before.

- [ ] Add Hono dependencies (`hono`, `@hono/node-server`, `@hono/swagger-ui`, `@hono/zod-openapi`)
- [ ] Create `src/app.ts` — Hono app with all routes migrated from Fastify
- [ ] Migrate route handlers (`messages.ts`, `schedule.ts`)
- [ ] Migrate auth middleware to Hono middleware pattern
- [ ] Migrate OpenAPI/Swagger to `@hono/zod-openapi`
- [ ] Migrate rate limiting and static file serving
- [ ] Create `src/entrypoints/node.ts` (replaces `src/index.ts`)
- [ ] Update tests to use Hono's test client
- [ ] Remove Fastify dependencies
- [ ] Verify Docker build and all tests pass

#### Phase 2: Cloudflare Workers Entry Point

**Goal:** AJaaS runs on CF Workers with Durable Objects for storage and alarms for scheduling.

- [ ] Add `@cloudflare/vite-plugin` and `wrangler` dependencies
- [ ] Create root `vite.config.ts`, `wrangler.jsonc`, `src/types/env.ts`
- [ ] Create `src/entrypoints/worker.ts`
- [ ] Create `src/durable-objects/schedule-manager.ts` (DO + SQLite + alarms)
- [ ] Create `src/storage/do-sqlite.ts` and `RpcStorageClient`
- [ ] Create `src/delivery/email-api.ts` (Resend)
- [ ] Verify crypto, webhook delivery, and local dev under CF Workers runtime
- [ ] Verify `vite build` and `wrangler deploy` end-to-end

#### Phase 3: Testing & Polish

**Goal:** Both deployment targets are tested, documented, and production-ready.

- [ ] CF Workers-specific tests (Miniflare / workerd)
- [ ] End-to-end: schedule creation → alarm → email/webhook delivery
- [ ] Data encryption-at-rest verification in DO SQLite
- [ ] Deployment documentation in README
- [ ] Health check verification on both paths

### Key Decisions

| Decision | Options | Status |
|----------|---------|--------|
| Hono migration strategy | **Replace Fastify everywhere (recommended)** vs wrapper pattern | Needs confirmation |
| DO topology | **Singleton ScheduleManager (recommended)** vs per-schedule DO | Needs confirmation |
| Email provider for CF | Resend (stable) vs MailChannels (free tier) vs CF Email Service (beta) | Needs selection |
| OpenAPI approach | **`@hono/zod-openapi` (recommended)** vs manual spec | Needs confirmation |

### Decisions Already Resolved

| Decision | Resolution |
|----------|-----------|
| Encryption approach | `nodejs_compat` — keep `node:crypto`, no Web Crypto migration |
| Async Storage interface | Already complete on `main` |
| Web UI on CF | Always on — CDN serves at zero Worker CPU cost |
| Token portability | Deployment-specific (separate keys per environment) |

### Risks & Constraints

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Hono API incompatibility with tests | Medium | Phase 1 is isolated |
| `croner` CF compatibility | Low | Pure JS, should work |
| CF Email Service not GA | Medium | Resend fallback |
| `src/env.ts` imported on CF path | Medium | Worker entry must not import it |
| 30s CPU time limit (Workers paid plan) | Low | Keep handlers fast, offload to DO |

### Implementation Reference

This section provides concrete code examples and configuration templates to reduce research time during implementation.

#### Hono Route Migration Example

```typescript
// Current Fastify (src/routes/messages.ts)
fastify.get('/awesome/:name', { schema: {...} }, async (request, reply) => {
  const { name } = request.params as { name: string };
  const from = (request.query as { from?: string }).from;
  const message = messageService.getSimpleMessage(name, from);
  return sendMessage(reply, request.headers.accept, message);
});

// Hono equivalent
app.get('/awesome/:name', (c) => {
  const name = c.req.param('name');
  const from = c.req.query('from');
  const message = messageService.getSimpleMessage(name, from);
  if (wantsText(c.req.header('accept'))) {
    return c.text(message);
  }
  return c.json({ message });
});
```

#### Auth Middleware Migration

```typescript
// Current Fastify: preHandler hook + module augmentation
fastify.addHook('preHandler', requireAuth('schedule'));
// request.tokenPayload accessed via declare module

// Hono equivalent: middleware + context variables
const authMiddleware = (requiredRole: Role) => {
  return async (c: Context, next: Next) => {
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    const payload = tokenService.decrypt(token);
    // ... validation ...
    c.set('tokenPayload', payload);
    await next();
  };
};
// Access via c.get('tokenPayload')
```

#### Entrypoint: Node.js (Docker path)

```typescript
// src/entrypoints/node.ts
import { serve } from '@hono/node-server';
import { app } from '../app.js';

const config = loadConfig();
// ... initialize storage, scheduler, delivery ...
serve({ fetch: app.fetch, port: config.port, hostname: config.host });
```

#### Entrypoint: CF Worker

```typescript
// src/entrypoints/worker.ts
import { app } from '../app.js';
export default app;
export { ScheduleManager } from '../durable-objects/schedule-manager.js';
```

#### DO ScheduleManager (alarm-based scheduling)

```typescript
export class ScheduleManager extends DurableObject {
  private sql: SqlStorage;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;
    this.initializeSchema();
  }

  async alarm(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const dueSchedules = this.getSchedulesDue(now);
    for (const schedule of dueSchedules) {
      await this.executeSchedule(schedule);
      const nextRun = Scheduler.calculateNextRun(schedule.cron);
      if (nextRun) this.updateScheduleNextRun(schedule.id, nextRun);
    }
    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(): Promise<void> {
    const next = this.sql.exec('SELECT MIN(next_run) as next FROM schedules').one();
    if (next?.next) {
      await this.ctx.storage.setAlarm((next.next as number) * 1000);
    }
  }

  // RPC methods called from Worker via stub
  async createSchedule(schedule: ScheduleInput): Promise<Schedule> { /* ... */ }
  async isTokenRevoked(jti: string): Promise<boolean> { /* ... */ }
  // ... all Storage interface methods exposed as RPC
}
```

#### RpcStorageClient (Worker → DO bridge)

```typescript
// Worker-side: proxies Storage calls to the Durable Object via RPC
class RpcStorageClient implements Storage {
  constructor(private stub: DurableObjectStub<ScheduleManager>) {}

  async isTokenRevoked(jti: string): Promise<boolean> {
    return this.stub.isTokenRevoked(jti);
  }
  async createSchedule(schedule: Omit<Schedule, 'id' | 'createdAt'>): Promise<Schedule> {
    return this.stub.createSchedule(schedule);
  }
  // ... all Storage interface methods delegate to DO RPC
  async close(): Promise<void> { /* no-op for DO */ }
}
```

#### wrangler.jsonc (full template)

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

#### TypeScript Env Bindings

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

#### Secrets Inventory

| Secret | Docker (.env) | CF Workers | Notes |
|--------|--------------|------------|-------|
| `ENCRYPTION_KEY` | `.env` file | `wrangler secret put` | 32+ chars, token encryption |
| `DATA_ENCRYPTION_KEY` | `.env` file | `wrangler secret put` | 32+ chars, field encryption |
| `SMTP_HOST/PORT/USER/PASS` | `.env` file | N/A on CF | Node.js path only |
| `EMAIL_API_KEY` | `.env` file (if used) | `wrangler secret put` | CF path only (Resend) |
| `SMTP_FROM` / `EMAIL_FROM` | `.env` file | `vars` in wrangler.jsonc | Not sensitive |

#### Config Loading on CF Workers

With `nodejs_compat` and compat date >= `2025-04-01`, the `nodejs_compat_populate_process_env` flag is enabled by default. This means `process.env` is populated from Worker bindings (vars + secrets), so the existing `loadConfig()` in `src/config.ts` works unchanged. The `.env` file loader (`src/env.ts`) uses `fs.readFileSync` which is not available on CF Workers — ensure the Worker entry point does **not** import `env.ts`.

#### Package.json Scripts (post-migration)

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

### References

**Cloudflare**
- [Durable Objects SQLite Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Durable Objects Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers node:crypto (nodejs_compat)](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [Vite Plugin Overview](https://developers.cloudflare.com/workers/vite-plugin/)
- [Vite Plugin Tutorial: React SPA with API](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)
- [Send Emails with Resend from Workers](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/)
- [CF Workers Framework Guide: Hono](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)

**Hono**
- [Hono - Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hono GitHub Repository](https://github.com/honojs/hono)
- [Hono + Vite + React Stack](https://github.com/yusukebe/hono-vite-react-stack)

---

## Parking Lot

- Public holiday API integration (auto-calculate days off)
- AI-generated messages
- OAuth client credentials flow
- Distributed scheduling (multi-process support for Docker path)
