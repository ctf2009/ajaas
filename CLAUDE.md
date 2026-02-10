# CLAUDE.md

@AGENTS.md

## Setup

```bash
npm install        # also installs web dependencies via postinstall
```

Copy `.env.example` to `.env` and configure as needed. See `.env.example` for all options.

## Commands

```bash
# Development
npm run dev          # API with hot reload (tsx watch)
npm run dev:web      # Landing page dev server (Vite)

# Build
npm run build        # Build API (tsc) + web (Vite)
npm run build:api    # Build API only
npm run build:web    # Build web only

# Test
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage

# Production
npm start            # Run built API (node dist/index.js)

# Utilities
npm run generate-key -- --name "Name" --role schedule --expires 30d
```

## Tech Stack

- Node.js + TypeScript (strict mode, ES2022, NodeNext modules)
- Fastify 5 for API, Vite + React for landing page
- Vitest for testing
- SQLite (better-sqlite3) or PostgreSQL for storage
- AES-256-GCM token encryption (not JWT)

## Project Layout

- `src/api/` - Fastify API (routes, services, storage, auth, scheduler)
- `src/web/` - React landing page (separate npm project)
- `scripts/` - CLI tools (key generation)
- `PLANNING.md` - Full design document with endpoints, message types, and config
