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
- Mix of wholesome and playful "tough love"
- **Tough love messages can be disabled via config** (wholesome only mode)
- AI-generated messages as a future option
- Simple `- {from}` attribution when `from` param provided

### Message Types

Available via `/api/message/:type/:name`:

**`animal`** - Animal/nature similes
- "You've navigated this week like a bear navigates its way to honey, :name."
- "You attacked those tasks like a caffeinated squirrel at a bird feeder, :name."
- "You've been as dependable as a salmon swimming upstream, :name. But with less flopping."

**`absurd`** - Absurdist humor
- "If productivity were an Olympic sport, you'd be disqualified for being suspiciously good, :name."
- "You crushed it so hard this week, :name, geologists want to study the impact site."
- "Scientists are baffled by your output, :name. They're calling it 'unreasonably effective.'"

**`meta`** - Self-aware / meta humor
- "This automated message thinks you're great, :name. It's never wrong."
- "A computer is telling you you're awesome, :name. The machines are on your side."

**`unexpected`** - Unexpected compliments
- "You didn't just meet expectations, :name. You took expectations out for dinner and showed them a lovely time."
- "You handled this week like a diplomat handles a buffet, :name - with grace and efficiency."

**`toughLove`** - Tough love (when enabled)
- "Solid work, :name. Not legendary, but solid. Take 2 days off and come back hungry."
- "You survived, :name. That's the bar, and you cleared it. Barely. Rest up."
- "Adequate, :name. The word you're looking for is adequate. Now go away for 2 days."

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

messages:
  toughLove: true         # Include "tough love" style messages
                          # Set to false for wholesome only

rateLimit:
  enabled: false          # Enable rate limiting
  max: 100                # Requests per time window
  timeWindow: '1 minute'  # Time window for rate limiting
                          # Uses API key when authenticated, IP when not
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
