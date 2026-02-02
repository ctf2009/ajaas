# AJAAS - Awesome Job As A Service

## Concept

A wholesome API that generates personalized "awesome job" messages. Born from a Friday ritual of telling colleagues "Awesome job this week. Take the next 2 days off."

Inspired by FOAAS, but wholesome instead of profane.

---

## Endpoints

| Endpoint | Purpose | Params | Auth |
|----------|---------|--------|------|
| `GET /api/awesome/:name` | Simple compliment | `from` (optional) | Configurable |
| `GET /api/weekly/:name` | Weekly + days off | `from` (optional) | Configurable |
| `GET /api/random/:name` | Random message type | `from` (optional) | Configurable |
| `GET /api/message/:type/:name` | Specific message type | `from` (optional) | Configurable |
| `POST /api/schedule` | Create scheduled message | body | Always required |
| `DELETE /api/schedule/:id` | Remove schedule | - | Always required |

### Endpoint Rules

- **Schedule endpoints** can be completely disabled via config
- **Schedule endpoints** always require authentication (ignores global security toggle)
- All message endpoints support optional `from` parameter for attribution (e.g., `"- Mike"`)

---

## Message Content

- Curated templates to start
- Mix of wholesome and playful "tough love" (e.g., "Awesome job. Take 2 days off, but step it up next week.")
- AI-generated messages as a future option
- Simple `- {from}` attribution when `from` param provided

---

## Scheduling

### Storage

- Abstraction layer interface with SQLite implementation
- Stores: id, recipient, cron expression, endpoint, delivery method, nextRun

### Triggering

- Polling loop against SQLite
- Single process assumption for now
- After trigger: calculate next run from cron expression, update record

### Recurring Schedules

- Cron expressions (e.g., `0 17 * * FRI` for every Friday at 5pm)
- `nextRun` timestamp calculated and stored after each trigger

---

## Security

### Token Format

Encrypted JSON payload using AES-256-GCM:

```json
{
  "jti": "unique-id",
  "sub": "sarah@company.com",
  "name": "Sarah",
  "role": "schedule",
  "exp": 1740000000
}
```

The payload is encrypted and base64 encoded to produce the API key.

### Roles

Hierarchical model:

- `read` - can call message endpoints
- `schedule` - can read + manage schedules (implies read)

### Revocation

- Store revoked `jti` values in SQLite
- Check on each authenticated request

### Configuration

- Global toggle: `security.enabled` (true/false)
- Schedule endpoints always require auth regardless of global setting

### Key Generation

- npm scripts / CLI tool for generating API keys
- Example: `npm run generate-key -- --name "Sarah" --role schedule --expires 30d`

---

## Delivery

- **Email:** Nodemailer (v1 priority)
- **Discord:** Future enhancement

---

## Landing Page

- Vite + React + TypeScript
- Single page served at `/`
- Features:
  - Live "try it" demo
  - Code snippets (curl, JS, Python)
  - Links to GitHub
  - Playful tone matching the API personality
- Can be disabled via config (API-only mode)

---

## API Documentation

- OpenAPI spec via `@fastify/swagger`
- Swagger UI available at `/api/docs`
- Code-first approach: schemas defined in route definitions

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js + TypeScript |
| API Framework | Fastify |
| API Docs | @fastify/swagger + Swagger UI |
| Storage | SQLite (better-sqlite3) |
| Scheduling | SQLite + polling |
| Crypto | Node built-in (AES-256-GCM) |
| Email | Nodemailer |
| Key Tooling | npm scripts / CLI |
| Landing Page | Vite + React + TypeScript |
| Container | Docker (multi-stage, alpine base) |

---

## Configuration

```yaml
web:
  enabled: true           # Serve landing page at /

endpoints:
  schedule:
    enabled: true         # Completely hide when false

security:
  enabled: false          # Global auth toggle
                          # (schedule ignores this, always requires auth)
```

---

## Project Structure

```
/
├── src/
│   ├── api/              # Fastify API
│   │   ├── routes/       # Endpoint definitions
│   │   ├── services/     # Business logic
│   │   ├── storage/      # Storage abstraction + SQLite impl
│   │   ├── auth/         # Token encryption/validation
│   │   └── scheduler/    # Polling scheduler
│   └── web/              # React landing page
├── scripts/              # CLI tools (key generation)
├── Dockerfile
├── package.json
└── README.md
```

---

## Parking Lot (Future Enhancements)

- Public holiday API integration (auto-calculate days off)
- AI-generated messages
- Discord delivery
- OAuth client credentials flow
- Distributed scheduling (multi-process support)
- DynamoDB storage option
