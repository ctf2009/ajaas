# CLAUDE.md

Project instructions for AI agents working on this codebase.

## Commit Convention

This project uses **Conventional Commits**. This is enforced in CI — PR titles that don't follow the convention will block the build.

Every commit message and PR title MUST follow this format:

```
<type>(<optional scope>): <description>
```

Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

Examples:
- `feat: add Discord delivery method`
- `fix(scheduler): correct cron timezone handling`
- `docs: update API endpoint table in README`
- `chore: bump fastify to v5.3.0`
- `test: add coverage for rate limiting edge cases`
- `ci: add lint step to pipeline`

Release versioning is handled by release-please:
- `feat` commits trigger a **minor** version bump
- `fix` commits trigger a **patch** version bump

## Build & Test

```bash
npm install          # Install all dependencies (includes web via postinstall)
npm run build        # Build API (tsc) + Web (vite)
npm run build:api    # Build API only
npm run build:web    # Build web only
npm test             # Run tests (vitest)
npm run dev          # Dev mode with hot reload (tsx watch)
npm run dev:web      # Web dev server with API proxy
```

## Project Structure

- `src/` - All source code (TypeScript)
  - `auth/` - Token encryption (AES-256-GCM) and auth middleware
  - `config.ts` - Environment variable configuration loader
  - `delivery/` - Email (Nodemailer) and webhook delivery
  - `index.ts` - Application entry point (Fastify server)
  - `routes/` - API route handlers (messages, schedule)
  - `scheduler/` - Cron-based polling scheduler
  - `services/` - Message generation logic and templates
  - `storage/` - Storage interface, SQLite and PostgreSQL implementations
  - `web/` - React landing page (Vite, separate package.json)
- `scripts/` - CLI tools (token generation)
- `.github/workflows/` - CI (build/test/lint PR title) and Release (release-please, Docker, artifacts)

## Key Conventions

- ESM (`"type": "module"`) — use `.js` extensions in imports even for TypeScript files
- Fastify for HTTP framework
- Vitest for testing (config in `vitest.config.ts`)
- Web app is a separate npm workspace under `src/web/` with its own `package.json`
- Web build outputs to `dist/web/`, API build outputs to `dist/`
