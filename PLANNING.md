# AJaaS Planning

## Purpose
This document is a forward-looking implementation plan for AJaaS.
It tracks what is done, what is next, and what is deferred.

## Current Baseline
- API runtime is Hono for Node and Worker entrypoints.
- Web app is Vite + React with routes:
  - `/`
  - `/card/:type/:name`
- Shareable card flow is implemented.
- Mobile alignment fixes for the Try It section are implemented.
- Cloudflare Workers deploy is working for message-only mode.

## Priority Roadmap
1. Complete Cloudflare scheduling and storage path.
2. Add token revocation admin flow and cleanup policy.
3. Improve reliability and test coverage around scheduling and delivery.
4. Improve web feature discovery and product polish.

## Workstream A: Token Revocation
### Goal
Provide reliable, explicit token revocation controls with cleanup.

### In Scope
- Add `admin` role and role hierarchy: `admin > schedule > read`.
- Add `POST /api/admin/revoke` for revoking by `jti`.
- Add revocation cleanup policy (time-based retention).

### Tasks
- [ ] Extend `Role` in `src/auth/token.ts` to include `admin`.
- [ ] Update role checks to enforce hierarchy.
- [ ] Update `scripts/generate-key.ts` to support `--role admin`.
- [ ] Add `src/routes/admin.ts` with auth-gated revoke endpoint.
- [ ] Register admin routes in `src/app.ts`.
- [ ] Add storage cleanup API for expired revocations.
- [ ] Execute cleanup on a fixed cadence in scheduler path.

### Deferred
- Token inventory and listing APIs.
- Bulk revocation by subject.

## Workstream B: Web App Enhancements
### Status Summary
- [x] Shareable card route and card UI.
- [x] Router integration in `src/web/src/main.tsx`.
- [x] Try It card sharing actions.
- [x] Mobile alignment fixes for Try It controls.

### Next
- [ ] Add Features section to landing page.
- [ ] Add dynamic feature discovery from `/health`.
- [ ] Conditionally render security/scheduling/rate-limit indicators.
- [ ] Add graceful fallback behavior if `/health` is unavailable.

## Workstream C: Cloudflare Workers Completion
### Goal
Complete parity for scheduling, storage, and delivery on Workers.

### Tasks
- [ ] Implement Durable Object schedule manager with SQLite.
- [ ] Implement Worker-to-DO storage adapter.
- [ ] Implement Worker email delivery adapter (API-based).
- [ ] Verify webhook signing and crypto behavior on Worker runtime.
- [ ] Finalize repeatable deploy runbook for new environments.

### Notes
- Keep Node/Docker path intact while adding Worker-native components.
- Continue using `nodejs_compat` for existing crypto module compatibility.

## Workstream D: Reliability and Refactor
### API and Config
- [ ] Standardize error response patterns across routes.
- [ ] Decide whether non-message routes need content negotiation support.
- [ ] Tighten config validation for storage and scheduling edge cases.

### Storage Interface
- [ ] Re-evaluate whether `close()` should remain required for all adapters.
- [ ] Re-evaluate formalizing `initialize()` lifecycle behavior.

### Documentation Consistency
- [ ] Keep `README.md`, `AGENTS.md`, and `CLAUDE.md` aligned with actual behavior.

## Test Plan Gaps
- [ ] Add route tests for `src/routes/schedule.ts`.
- [ ] Add tests for `src/scheduler/index.ts` execution behavior.
- [ ] Add tests for `src/delivery/email.ts`.
- [ ] Add direct tests for `src/auth/middleware.ts`.
- [ ] Add tests for `src/config.ts` parsing and validation.

## Definition of Done (Near Term)
Near-term plan is complete when all items below are done:
- [ ] Worker scheduling path runs with DO alarms and SQLite.
- [ ] Admin token revoke endpoint is live and tested.
- [ ] Key scheduling and delivery paths have dedicated tests.
- [ ] Web app feature discovery is implemented.
- [ ] Docs are aligned and deployment runbook is current.

## Backlog
- GA4 analytics wiring.
- Public holiday integration.
- AI-generated message variants.
- OAuth client credentials flow.
- Multi-process scheduling strategy for non-Worker deployments.
