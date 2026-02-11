# AJaaS - Planning

## Concept

A wholesome API that generates personalized "awesome job" messages. Born from a Friday ritual of telling colleagues "Awesome job this week. Take the next 2 days off."

Inspired by FOAAS, but wholesome instead of profane.

---

## Execution Order & Dependencies

The planning items below are largely independent, but some have natural ordering constraints:

```
1. General Refactor ← CORS done, other items remain
   └── No dependencies — clean up the existing codebase

2. Token Revocation Refinement (can start now)
   └── Storage interface changes carry forward to CF Workers path

3. Web UI Enhancements (can start now)
   └── Feature discovery uses existing /health endpoint

4. CF Workers Migration Phase 1: Hono Migration ← COMPLETE
   └── Fastify replaced with Hono everywhere

5. CF Workers Migration Phase 2: Workers Entry Point ← PARTIAL
   └── Basic Worker entry point done, deployed to ajaas.io
   └── Durable Objects, email-api, RPC client still pending

6. CF Workers Migration Phase 3: Testing & Polish
   └── Depends on Phase 2
```

**Recommendation:** Items 1-3 can be done in any order. Phase 2 remaining work (Durable Objects) is the next major milestone.

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

### Scope: Minimal First

Start with an admin revocation endpoint only. Token inventory (persisting token metadata on generation, listing, bulk revocation) is deferred — can be added later if needed.

### Implementation Plan

1. **Add `admin` role to role hierarchy**
   - Update `Role` type in `src/auth/token.ts`: `'read' | 'schedule' | 'admin'`
   - Update `hasRole()` so `admin` > `schedule` > `read`
   - Update `scripts/generate-key.ts` to accept `--role admin`

2. **Add admin revocation endpoint**
   - Create `src/routes/admin.ts` with `POST /api/admin/revoke`
   - Request body: `{ "jti": "token-id-to-revoke" }` (revoke by JTI)
   - Requires `admin` role authentication
   - Calls `storage.revokeToken(jti)` (method already exists)
   - Returns `{ "revoked": true, "jti": "..." }`

3. **Register admin routes in app**
   - Register in `src/app.ts` alongside schedule routes
   - Admin routes always require auth (same pattern as schedule routes)

4. **Add revocation cleanup with fixed TTL**
   - Since `revoked_tokens` does not store the token's `exp`, use a fixed TTL approach
   - Add `cleanupExpiredRevocations(maxAgeDays: number)` to the `Storage` interface
   - Implementation: `DELETE FROM revoked_tokens WHERE revoked_at < ?` (current time - maxAgeDays)
   - Run during scheduler polling loop (`src/scheduler/index.ts`) — e.g., once per hour
   - Default TTL: 90 days (configurable)

### Future Enhancements (deferred)

- Token inventory table (persist metadata on generation, enable listing/searching)
- Bulk revocation by `sub` (requires token inventory or `sub` column on `revoked_tokens`)
- Admin API for listing active tokens

---

## Web UI Enhancements

The React SPA (`src/web/`) currently has: a try-it demo form, endpoint listing, code examples, the origin story, and footer links. Three enhancements are planned.

### Current Web UI Structure

**Files:**
- `src/web/src/App.tsx` — single-component SPA (all sections in one file)
- `src/web/src/App.css` — styles
- `src/web/src/main.tsx` — React entry point
- `src/web/vite.config.ts` — Vite build config

The app is a single `App` component with no routing (no `react-router`). All content is rendered in one scrollable page.

### 3a. Features List

Add a "Features" section to the landing page highlighting what AJaaS offers. This is static content — no API calls needed.

**Suggested features to showcase:**
- Multiple message types (wholesome, animal, absurd, meta, unexpected, tough love)
- Content negotiation (JSON or plain text responses)
- Scheduled messages with cron expressions
- Email and webhook delivery
- Encrypted token authentication (AES-256-GCM)
- OpenAPI documentation with Swagger UI
- Rate limiting
- Configurable — features can be toggled on/off

**Implementation:**
- [ ] Add a `<section className="features">` block to `src/web/src/App.tsx`
- [ ] Style with a card grid layout (similar to existing endpoint grid)
- [ ] Place between the story and try-it sections (or after try-it — use judgement)

### 3b. Dynamic Feature Discovery

The frontend should know which server features are enabled so it can conditionally show or hide UI elements (e.g., don't show scheduling info if scheduling is disabled).

**Current state:** The `/health` endpoint already returns everything needed:

```json
{
  "status": "ok",
  "scheduling": true,
  "security": true,
  "web": true,
  "rateLimit": false
}
```

**Implementation:**
- [ ] Fetch `/health` on app mount in `src/web/src/App.tsx` (or a context provider)
- [ ] Store the response in React state
- [ ] Conditionally render scheduling-related content based on `scheduling` flag
- [ ] Conditionally show security info based on `security` flag
- [ ] Show rate limiting status if enabled
- [ ] Handle fetch failure gracefully (show all features as a fallback)

**Considerations:**
- The health endpoint is unauthenticated and lightweight — fine to call on every page load
- Cache the response in session state to avoid re-fetching on SPA navigation (not currently relevant since there's no routing, but good practice)
- On CF Workers, the health endpoint is handled by the Worker, not the CDN — this works fine

### 3c. Shareable Message Cards

Generate a link that opens a visual "card" with a personalized message for a specific person. The message is generated fresh each time the link is opened (different message on refresh).

**URL format:** `/card/:type/:name?from=Someone`

Examples:
- `https://ajaas.example.com/card/awesome/Rachel`
- `https://ajaas.example.com/card/weekly/Mike?from=Boss`
- `https://ajaas.example.com/card/random/Alex`

**User flow:**
1. User creates a link (either manually or via a "Share" button in the try-it demo)
2. Recipient clicks the link
3. The SPA renders a full-screen visual card with the generated message
4. Each visit generates a fresh message (different on refresh)

**Implementation:**

This requires adding client-side routing to the React SPA.

- [ ] Add `react-router-dom` to `src/web/`
- [ ] Create a `CardView` component (`src/web/src/CardView.tsx`)
  - Extracts `:type` and `:name` from URL params, `from` from query string
  - Calls the appropriate API endpoint on mount (e.g., `GET /api/awesome/:name?from=...`)
  - Renders the message as a styled card (large text, centered, branded)
  - Includes a subtle "Powered by AJaaS" footer link back to the main page
- [ ] Update `src/web/src/App.tsx` to use `<BrowserRouter>` with routes:
  - `/` → existing landing page
  - `/card/:type/:name` → `CardView` component
- [ ] Add a "Share" button to the try-it demo that generates the card URL
- [ ] Style the card view — full viewport, centered message, clean typography
- [ ] SPA fallback already works (non-API routes serve `index.html` via `@hono/node-server/serve-static`, and `not_found_handling: "single-page-application"` on CF Workers)

**Design notes:**
- The card should feel like receiving a personal message, not like visiting an API docs page
- Keep it simple — the message itself is the star
- Consider adding a "Get another message" button that re-fetches
- The card URL can be shared via any messaging platform (Slack, email, WhatsApp, etc.)

---

## General Refactor

### CORS ✅

CORS is implemented using Hono's built-in `hono/cors` middleware, applied to `/api/*` and `/health` routes in `src/app.ts`.

- **Config:** `CORS_ORIGIN` env var (default: `*` for open public API)
- **Config type:** `config.cors.origin` in `src/config.ts`
- AJaaS is designed as a public API — `origin: '*'` is appropriate for message endpoints
- Schedule and admin endpoints are auth-gated, so CORS `*` is safe
- Preflight `OPTIONS` requests are handled automatically by the middleware

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
- [ ] **Type packages** — `@types/pg`, `@types/better-sqlite3`, `@types/nodemailer` should be in `devDependencies` (they are — just confirm after any changes).

### Documentation Consistency

- [ ] **Verify README, AGENTS.md, and CLAUDE.md all agree** on project structure, available endpoints, config options, and file paths. These files were recently corrected but should be checked after any refactor changes.

---

## Cloudflare Workers Migration

### Overview

Migration from Docker/Container deployment to native **Cloudflare Workers + Durable Objects**. The goal is to embrace CF-native primitives: Workers for compute, Durable Objects with SQLite for persistent state, Alarms for scheduling, and Hono as a portable HTTP framework.

The existing Docker/Container deployment path will be preserved. The codebase will support both targets through abstraction layers and build-time selection.

### Deployment Log (2026-02-11)

Initial Cloudflare deployment from local machine was completed successfully for the message-only mode (no storage/security/scheduling), including custom domain attachment.

**What was run**
- `npm run build:web`
- `npx wrangler login --browser false`
- `npx wrangler deploy --domain ajaas.io`

**Observed result**
- Worker deployed successfully (`ajaas`)
- Custom domain attached successfully: `ajaas.io`
- Live checks succeeded:
  - `https://ajaas.io/health` returned `200`
  - `https://ajaas.io/` returned `200` (`text/html`)
  - `https://ajaas.io/api/types` returned valid JSON

### Lessons Learned

- `wrangler deploy --domain <domain>` is enough to attach a custom domain during deployment.
- Current split build flow works reliably: build SPA first (`build:web`), then deploy worker.
- Added one-command shortcuts for repeat deploys:
  - `npm run deploy:worker:full`
  - `npm run deploy:worker:domain` (edit domain placeholder in package.json)
- Keeping `SCHEDULE_ENABLED=false`, `SECURITY_ENABLED=false`, and `RATE_LIMIT_ENABLED=false` in `wrangler.jsonc` made first deploy straightforward.
- Static assets + API routing configuration in `wrangler.jsonc` is correct for this project:
  - `assets.directory = dist/web`
  - `run_worker_first = [\"/api/*\", \"/health\"]`
  - `not_found_handling = \"single-page-application\"`

### Architecture Comparison

**Current: Docker/Container (Hono on Node.js)**

```
Client Request
    |
    v
[Hono on Node.js via @hono/node-server]
    ├── Routes (messages, schedule)
    ├── CORS middleware (hono/cors, configurable origin)
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

**Target: Cloudflare Workers (with Durable Objects)**

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

### HTTP Framework: Hono Migration ✅

Fastify has been fully replaced with Hono. The migration is complete — all routes, middleware, tests, and entrypoints use Hono.

| Former Fastify Plugin | Hono Replacement (implemented) |
|----------------------|-------------------------------|
| `@fastify/swagger` | Static OpenAPI spec object in `src/openapi.ts` |
| `@fastify/swagger-ui` | `@hono/swagger-ui` |
| `@fastify/cors` | `hono/cors` (built-in middleware) |
| `@fastify/rate-limit` | Custom `src/middleware/ratelimit.ts` (in-memory) |
| `@fastify/static` | `@hono/node-server/serve-static` (Node) / Workers Assets (CF) |
| Fastify `preHandler` | Hono middleware via `MiddlewareHandler<AuthEnv>` |

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

The current pipeline uses a split build: `tsc` for the API, Vite for the SPA, and `wrangler deploy` bundles the Worker entry with esbuild.

| | CF Workers | Docker / Node.js |
|--|-----------|------------------|
| **API build** | `wrangler deploy` bundles via esbuild | `tsc` compiles to `dist/` |
| **Web build** | `npm run build:web` (Vite, outputs to `dist/web`) | Same |
| **Local dev** | `wrangler dev` | `tsx watch src/entrypoints/node.ts` |
| **Deploy** | `npm run deploy:worker:full` | `docker build` + `docker run` |

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

#### Phase 1: Hono Migration ✅

**Goal:** Replace Fastify with Hono. All tests pass. Docker deployment works as before.

- [x] Add Hono dependencies (`hono`, `@hono/node-server`, `@hono/swagger-ui`)
- [x] Create `src/app.ts` — Hono app factory with all routes, CORS, rate limiting
- [x] Migrate route handlers (`messages.ts`, `schedule.ts`)
- [x] Migrate auth middleware to Hono middleware pattern (`MiddlewareHandler<AuthEnv>`)
- [x] Create static OpenAPI spec (`src/openapi.ts`) with `@hono/swagger-ui`
- [x] Create custom rate limiter (`src/middleware/ratelimit.ts`)
- [x] Migrate static file serving to `@hono/node-server/serve-static`
- [x] Create `src/entrypoints/node.ts` (replaces `src/index.ts`)
- [x] Update tests to use Hono's `app.request()` test pattern
- [x] Remove all Fastify dependencies
- [x] All 122 tests pass, TypeScript compiles cleanly

#### Phase 2: Cloudflare Workers Entry Point

**Goal:** AJaaS runs on CF Workers with Durable Objects for storage and alarms for scheduling.

- [x] Add `wrangler` and Worker runtime type dependencies
- [x] Create `wrangler.jsonc` (assets + worker-first API routing)
- [x] Create `src/entrypoints/worker.ts`
- [x] Validate first local deploy with `wrangler deploy`
- [x] Attach and validate custom domain (`ajaas.io`)
- [x] Add one-command deploy scripts (`deploy:worker:full`, `deploy:worker:domain`)
- [ ] Create `src/durable-objects/schedule-manager.ts` (DO + SQLite + alarms)
- [ ] Create `src/storage/do-sqlite.ts` and `RpcStorageClient`
- [ ] Create `src/delivery/email-api.ts` (Resend)
- [ ] Verify crypto, webhook delivery, and local dev under CF Workers runtime
- [ ] Verify repeatable deploy runbook for new environments

#### Phase 3: Testing & Polish

**Goal:** Both deployment targets are tested, documented, and production-ready.

- [ ] CF Workers-specific tests (Miniflare / workerd)
- [ ] End-to-end: schedule creation → alarm → email/webhook delivery
- [ ] Data encryption-at-rest verification in DO SQLite
- [ ] Deployment documentation in README
- [ ] Health check verification on both paths

### Decisions Resolved

| Decision | Resolution |
|----------|-----------|
| Hono migration strategy | ✅ Fastify fully replaced with Hono |
| DO topology | Singleton ScheduleManager DO |
| Email provider for CF | Resend (stable, available now) |
| OpenAPI approach | Static spec object in `src/openapi.ts` + `@hono/swagger-ui` |
| Rate limiting approach | Custom in-memory middleware (`src/middleware/ratelimit.ts`) |
| CORS approach | ✅ `hono/cors` with configurable `CORS_ORIGIN` env var |
| Encryption approach | `nodejs_compat` — keep `node:crypto`, no Web Crypto migration |
| Async Storage interface | Already complete on `main` |
| Web UI on CF | Always on — CDN serves at zero Worker CPU cost |
| Token portability | Deployment-specific (separate keys per environment) |

### Risks & Constraints

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| ~~Hono API incompatibility with tests~~ | ~~Medium~~ | ✅ Resolved — all 122 tests pass |
| `croner` CF compatibility | Low | Pure JS, should work |
| CF Email Service not GA | Medium | Resend fallback |
| `src/env.ts` imported on CF path | ~~Medium~~ | ✅ Resolved — `loadConfig()` wraps `loadEnvFile()` in try/catch |
| 30s CPU time limit (Workers paid plan) | Low | Keep handlers fast, offload to DO |

### Implementation Reference

This section provides code examples and configuration templates for remaining work (Durable Objects, email API).

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

#### Package.json Scripts (current)

```json
{
  "dev": "tsx watch src/entrypoints/node.ts",
  "dev:web": "npm --prefix src/web run dev",
  "dev:worker": "wrangler dev",
  "build": "tsc && npm --prefix src/web run build",
  "build:api": "tsc",
  "build:web": "npm --prefix src/web run build",
  "deploy:worker": "wrangler deploy",
  "deploy:worker:full": "npm run build:web && wrangler deploy",
  "deploy:worker:domain": "npm run build:web && wrangler deploy --domain your-domain.example.com",
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

- GA4 analytics integration (not yet implemented in web app — `VITE_GA_MEASUREMENT_ID` documented but unused)
- Public holiday API integration (auto-calculate days off)
- AI-generated messages
- OAuth client credentials flow
- Distributed scheduling (multi-process support for Docker path)
