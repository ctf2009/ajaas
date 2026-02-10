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

## Important Notes

- Schedule endpoints can be completely disabled - don't assume they exist
- Security can be toggled globally - always check config
- The `from` parameter on message endpoints is optional attribution
- Keep the tone fun - this project has personality
