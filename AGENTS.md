# AGENTS.md - AI Agent Context

This file provides context for AI agents working on this codebase.

## Project Overview

AJaaS (Awesome Job As A Service) is a wholesome API that generates personalized compliment messages. Think FOAAS, but positive and encouraging instead of profane.

## Key Design Decisions

### Architecture

- **Monorepo**: API and landing page live together
- **Abstraction layers**: Storage and scheduling have interfaces to allow future implementations
- **Single process**: Current assumption is single-process deployment; don't over-engineer for distribution

### Security Model

- Tokens are **encrypted** (AES-256-GCM), not just signed
- Role hierarchy: `schedule` > `read`
- Schedule endpoints **always** require auth, even if global security is disabled
- Revocation via `jti` blocklist in storage (SQLite or PostgreSQL)

### Configuration Philosophy

- Features should be toggleable (landing page, schedule endpoints, security)
- Sensible defaults for simple deployments
- No cloud-specific dependencies required for basic usage

## Code Style Guidelines

- TypeScript with strict mode
- Fastify for API routes with JSON Schema validation
- Code-first OpenAPI (schemas in route definitions)
- Keep it simple - this is a fun project, not enterprise software

## File Locations

- API code: `src/`
- React landing page: `src/web/`
- CLI scripts: `scripts/`
- Planning doc: `PLANNING.md`
- Agent instructions: `CLAUDE.md`

### Key Modules

- `src/crypto.ts` - Centralized AES-256-GCM encryption (used by both token service and storage-level field encryption)
- `src/env.ts` - `.env` file parser and loader (Docker/Node.js path only)
- `src/config.ts` - Environment variable configuration with validation and defaults

## Testing

- Test files should live alongside source files or in `__tests__` directories
- Focus on testing business logic and API contracts

## Common Tasks

### Adding a new message endpoint

1. Create route in `src/routes/`
2. Define schema for OpenAPI
3. Add message templates to the appropriate service

### Adding a new message template

1. Add to the curated templates in the messages service
2. Consider both wholesome and "tough love" variations

### Modifying storage

1. Update the storage interface in `src/storage/interface.ts` if adding new capabilities
2. Implement changes in **both** the SQLite (`src/storage/sqlite.ts`) and PostgreSQL (`src/storage/postgres.ts`) adapters
3. Storage factory (`src/storage/factory.ts`) selects backend based on `DB_PATH` (PostgreSQL URL or SQLite file path)
4. Sensitive fields (`recipientEmail`, `webhookUrl`, `webhookSecret`) are encrypted at rest via `src/crypto.ts` when `DATA_ENCRYPTION_KEY` is set

### Adding or modifying delivery methods

1. Delivery implementations live in `src/delivery/`
2. Current methods: email (`email.ts` via Nodemailer) and webhook (`webhook.ts` via fetch + HMAC-SHA256)
3. The `deliveryMethod` field on `Schedule` is typed as `'email' | 'webhook'` in `src/storage/interface.ts`
4. The scheduler (`src/scheduler/index.ts`) dispatches to the correct delivery based on `schedule.deliveryMethod`

## Git & CI/CD

### Commit Messages

This project uses **conventional commits** enforced via PR title validation. PR titles become the commit message on squash-merge and drive automated semantic versioning via release-please.

Format: `<type>: <description>`

| Type | Purpose | Version bump (pre-1.0) |
|------|---------|----------------------|
| `feat` | New feature | patch |
| `fix` | Bug fix | patch |
| `docs` | Documentation only | none |
| `chore` | Maintenance, deps, CI | none |
| `refactor` | Code restructuring | none |
| `test` | Adding/updating tests | none |
| `ci` | CI/CD pipeline changes | none |
| `perf` | Performance improvement | patch |

Add `!` after the type for breaking changes (e.g. `feat!: remove endpoint`), which bumps minor while pre-1.0.

### Branching & PRs

- All changes reach `main` through pull requests (no direct pushes)
- External contributors: fork the repo, branch, and open a PR
- CI runs on every PR: build, test, and PR title validation
- Releases only happen from `main` via release-please

### Release Process

Releases are automated via release-please. When PRs with conventional commit titles are merged to `main`, release-please accumulates changes into a Release PR. Merging that Release PR triggers:
- Git tag and GitHub Release
- Zip artifact attached to the release
- Docker image pushed to `ghcr.io/ctf2009/ajaas`

## Important Notes

- Schedule endpoints can be completely disabled - don't assume they exist
- Security can be toggled globally - always check config
- The `from` parameter on message endpoints is optional attribution
- Message endpoints support content negotiation: `Accept: text/plain` returns plain text, JSON is the default
- Keep the tone fun - this project has personality
