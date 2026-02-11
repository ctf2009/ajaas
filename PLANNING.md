# AJaaS - Planning

## Concept

A wholesome API that generates personalized "awesome job" messages. Born from a Friday ritual of telling colleagues "Awesome job this week. Take the next 2 days off."

Inspired by FOAAS, but wholesome instead of profane.

---

## Token Revocation Refinement

The current revocation model stores revoked `jti` values in the storage backend and checks on each authenticated request. This works but needs refinement around **how tokens get revoked** and **datastore population**.

### Current State

- Tokens contain a `jti` (unique ID), `sub`, `name`, `role`, and `exp`
- Revocation stores `jti` + `revokedAt` timestamp in the `revoked_tokens` table
- Check happens in auth middleware on every authenticated request
- No admin API for revoking tokens — only programmatic access via storage interface
- No cleanup of expired revocations (revoked tokens accumulate indefinitely)

### Areas to Address

1. **Admin Revocation API**
   - Add `POST /api/admin/revoke` endpoint to revoke a token by `jti`
   - Requires a new `admin` role (or reuse `schedule` role with admin capability)
   - Consider: should revoking require the full token or just the `jti`?

2. **Revocation Cleanup**
   - Revoked tokens whose `exp` has passed no longer need to be stored
   - Add periodic cleanup: delete revoked entries where the token's `exp` < now
   - On the Node.js path, this can run as part of the scheduler polling loop
   - On the CF Workers path, a DO alarm or scheduled Worker can handle cleanup

3. **Bulk Revocation**
   - Ability to revoke all tokens for a given `sub` (e.g., when a user leaves)
   - Requires either storing `sub` alongside the `jti` in the revocation table, or scanning and decrypting all active tokens (impractical)
   - Recommendation: add a `sub` column to `revoked_tokens` and support `POST /api/admin/revoke-all?sub=user@company.com`

4. **Token Inventory / Listing**
   - Currently no way to see what tokens exist — they are stateless (encrypted, not stored)
   - Consider: should token generation also store metadata (jti, sub, role, exp, created_at) in a `tokens` table?
   - This would enable listing active tokens, revoking by selection, and audit trails
   - Trade-off: adds state to a currently stateless token model

---

## GA4 Runtime vs Build-Time Investigation

The landing page currently uses `VITE_GA_MEASUREMENT_ID` as a build-time environment variable. This means the GA4 tracking ID is baked into the built JavaScript bundle and cannot be changed without rebuilding.

### Current Approach (Build-Time)

```
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run build:web
```

- Vite replaces `import.meta.env.VITE_GA_MEASUREMENT_ID` at build time
- Simple and works, but requires a rebuild to change the ID
- Docker users must rebuild the image to change GA4 tracking

### Runtime Injection Options

1. **Server-Side Config Endpoint**
   - Add `GET /api/config` (or `/api/client-config`) that returns non-sensitive client configuration
   - Landing page fetches config on mount and initialises GA4 with the returned measurement ID
   - Pros: fully runtime, works on all platforms
   - Cons: extra HTTP request on page load, brief flash before GA initialises

2. **HTML Template Injection**
   - Server injects the GA4 ID into the `index.html` before serving (e.g., replace `__GA_MEASUREMENT_ID__` placeholder)
   - Pros: no extra request, GA initialises immediately
   - Cons: requires server-side HTML processing on every page load; doesn't work with CF Workers Assets (static CDN serving)

3. **`window.__CONFIG__` Script Tag**
   - Server injects a `<script>window.__CONFIG__ = { gaMeasurementId: "G-XXX" }</script>` into `index.html`
   - React app reads from `window.__CONFIG__`
   - Same trade-offs as option 2

### Recommendation

**Option 1 (Config Endpoint)** is the most portable approach — works with both Node.js (Hono) and CF Workers (static assets served by CDN, API handled by Worker). The extra request is minimal and can be cached.

For the CF Workers path, the `VITE_GA_MEASUREMENT_ID` can simply be set as a Worker environment variable and returned from the config endpoint.

### Decision

- [ ] Choose runtime injection approach
- [ ] Determine if this is needed before or after Hono migration

---

## General Refactor

### Code Quality

- [ ] Review and tidy up any inconsistencies in error handling across routes
- [ ] Ensure all route handlers follow the same response format patterns
- [ ] Review content negotiation implementation for consistency
- [ ] Check that all config options are validated at startup (fail fast on bad config)

### Storage Interface

- [ ] Update `deliveryMethod` type on `Schedule` interface — currently `'email' | 'webhook'`, confirm this is the final set
- [ ] Review storage factory pattern for clarity and extensibility
- [ ] Consider if `close()` should be optional (CF Workers DO storage doesn't need explicit closing)

### Project Structure

- [ ] Verify `src/` directory layout matches documented structure in README and AGENTS.md
- [ ] Remove any dead code or unused exports
- [ ] Ensure test coverage for all critical paths (auth, scheduling, delivery)

### Dependencies

- [ ] Audit dependencies for anything unused or outdated
- [ ] Review dev dependencies — ensure no production dependencies are in devDependencies or vice versa

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

### References

**Cloudflare**
- [Durable Objects SQLite Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Durable Objects Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers node:crypto (nodejs_compat)](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [Vite Plugin Overview](https://developers.cloudflare.com/workers/vite-plugin/)
- [Send Emails with Resend from Workers](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/)

**Hono**
- [Hono - Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hono GitHub Repository](https://github.com/honojs/hono)
- [CF Workers Framework Guide: Hono](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)

---

## Parking Lot

- Public holiday API integration (auto-calculate days off)
- AI-generated messages
- OAuth client credentials flow
- Distributed scheduling (multi-process support for Docker path)
