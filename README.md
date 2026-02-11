# AJaaS - Awesome Job As A Service

> A wholesome API for telling people they're doing great. Because everyone deserves to hear it.

Every Friday, as I leave the office, I have a little ritual. I walk past my colleagues and tell them:

*"Awesome job this week. Take the next 2 days off."*

It's a bit of fun. People look forward to it. Sometimes I personalize it, sometimes I get creative. It lifts morale and ends the week on a high note.

**AJaaS is that ritual, as an API.**

## Quick Start

```bash
# Run with Docker
docker run -p 3000:3000 ajaas

# Or run locally
npm install
npm run build
npm start
```

Visit `http://localhost:3000` for the interactive demo, or dive straight into the API:

```bash
curl http://localhost:3000/api/awesome/Rachel
# -> {"message":"Awesome job, Rachel!"}

curl http://localhost:3000/api/weekly/Mike
# -> {"message":"Awesome job this week, Mike. Take the next 2 days off."}

curl "http://localhost:3000/api/random/Alex?from=Boss"
# -> {"message":"You crushed it so hard this week, Alex, geologists want to study the impact site. - Boss"}
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/awesome/:name` | Simple compliment |
| `GET /api/weekly/:name` | Weekly message with days off |
| `GET /api/random/:name` | Random message type |
| `GET /api/message/:type/:name` | Specific message type |
| `GET /api/types` | List available message types |
| `GET /api/docs` | Swagger UI documentation |
| `GET /health` | Health check with feature status |

All message endpoints accept an optional `?from=Name` query parameter for attribution.

Message endpoints also support content negotiation via the `Accept` header. Set `Accept: text/plain` to receive plain text responses instead of JSON.

### Message Types

- **animal** - *"You've navigated this week like a bear navigates its way to honey"*
- **absurd** - *"Scientists are baffled by your output. They're calling it 'unreasonably effective.'"*
- **meta** - *"A computer is telling you you're awesome. The machines are on your side."*
- **unexpected** - *"You took expectations out for dinner and showed them a lovely time."*
- **toughLove** - *"Solid work. Not legendary, but solid. Take 2 days off and come back hungry."*

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `WEB_ENABLED` | `true` | Serve landing page at `/` |
| `SCHEDULE_ENABLED` | `true` | Enable scheduling endpoints |
| `SECURITY_ENABLED` | `false` | Require authentication for endpoints |
| `ENCRYPTION_KEY` | - | Key for token encryption (32+ chars) |
| `TOUGH_LOVE_ENABLED` | `true` | Include tough love messages |
| `DB_PATH` | `:memory:` | SQLite database path |
| `RATE_LIMIT_ENABLED` | `false` | Enable rate limiting |
| `RATE_LIMIT_MAX` | `100` | Max requests per time window |
| `RATE_LIMIT_WINDOW` | `1 minute` | Rate limit time window |

### Web / Analytics

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `VITE_GA_MEASUREMENT_ID` | - | Google Analytics 4 measurement ID (build-time) |

### Email Configuration (for scheduled messages)

| Environment Variable | Description |
|---------------------|-------------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_SECURE` | Use TLS (true/false) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address |

## Scheduling

Schedule recurring messages to be sent automatically:

```bash
# Generate an API key first
ENCRYPTION_KEY="your-32-char-secret-key-here!!!" npm run generate-key -- \
  --sub scheduler@example.com \
  --name "Scheduler" \
  --role schedule

# Create a scheduled message (every Friday at 5pm)
curl -X POST http://localhost:3000/api/schedule \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "Rachel",
    "recipientEmail": "sarah@example.com",
    "endpoint": "weekly",
    "cron": "0 17 * * FRI",
    "deliveryMethod": "email"
  }'
```

## Security

AJaaS uses encrypted tokens (AES-256-GCM) for authentication. Two roles are available:

- **read** - Can call message endpoints
- **schedule** - Can call message endpoints AND manage schedules

Generate a token:

```bash
ENCRYPTION_KEY="your-32-char-secret-key-here!!!" npm run generate-key -- \
  --sub user@example.com \
  --name "User Name" \
  --role read \
  --expires 30d
```

## Contributing

This project enforces [Conventional Commits](https://www.conventionalcommits.org/). All commit messages and PR titles **must** follow this format:

```
<type>(<optional scope>): <description>
```

| Type | Purpose |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Maintenance, dependencies, CI |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `ci` | CI/CD pipeline changes |

Examples:

```
feat: add Discord delivery method
fix(scheduler): correct cron timezone handling
docs: update API endpoint table in README
chore: bump hono and wrangler
```

PR titles are validated in CI - builds will not run if the title does not follow conventional commits.

Release versions are managed automatically by [release-please](https://github.com/googleapis/release-please) based on commit types (`feat` = minor, `fix` = patch).

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Run web dev server (for landing page development)
npm run dev:web

# Build everything
npm run build

# Build API only
npm run build:api

# Build web only
npm run build:web

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Docker

```bash
# Build the image
docker build -t ajaas .

# Run with default settings
docker run -p 3000:3000 ajaas

# Run with configuration
docker run -p 3000:3000 \
  -e ENCRYPTION_KEY="your-32-char-secret-key-here!!!" \
  -e SECURITY_ENABLED=true \
  -e TOUGH_LOVE_ENABLED=false \
  ajaas
```

## Project Structure

```text
src/
  auth/               # Token encryption and middleware
  delivery/           # Email and webhook delivery
  entrypoints/
    node.ts           # Local/Docker runtime entrypoint
    worker.ts         # Cloudflare Worker entrypoint
  middleware/         # Shared middleware (rate limiter)
  routes/             # API endpoints
  scheduler/          # Polling scheduler (Node runtime)
  services/           # Message generation
  storage/            # SQLite/PostgreSQL adapters
  app.ts              # Shared Hono app factory
  config.ts           # Configuration loader
  openapi.ts          # OpenAPI spec object
  web/                # React landing page (Vite)
scripts/              # CLI tools
vitest.config.ts      # Test configuration
tsconfig.json         # TypeScript configuration
Dockerfile
package.json
wrangler.jsonc        # Cloudflare Worker configuration
```

## License

MIT

---

*You've read this far. Awesome job. Take the rest of the day off.*
