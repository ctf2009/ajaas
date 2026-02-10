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
- Revocation via `jti` blocklist in SQLite

### Configuration Philosophy

- Features should be toggleable (landing page, schedule endpoints, security)
- Sensible defaults for simple deployments
- No AWS dependencies required for basic usage

## Code Style Guidelines

- TypeScript with strict mode
- Fastify for API routes with JSON Schema validation
- Code-first OpenAPI (schemas in route definitions)
- Keep it simple - this is a fun project, not enterprise software

## File Locations

- API code: `src/api/`
- React landing page: `src/web/`
- CLI scripts: `scripts/`
- Planning doc: `PLANNING.md`

## Testing

- Test files should live alongside source files or in `__tests__` directories
- Focus on testing business logic and API contracts

## Common Tasks

### Adding a new message endpoint

1. Create route in `src/api/routes/`
2. Define schema for OpenAPI
3. Add message templates to the appropriate service

### Adding a new message template

1. Add to the curated templates in the messages service
2. Consider both wholesome and "tough love" variations

### Modifying storage

1. Update the storage interface if adding new capabilities
2. Implement changes in the SQLite adapter
3. Storage abstraction exists to allow future DynamoDB support (not currently implemented)

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
- Keep the tone fun - this project has personality
