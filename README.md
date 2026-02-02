# AJAAS - Awesome Job As A Service

> A wholesome API for telling people they're doing great. Because everyone deserves to hear it.

Every Friday, as I leave the office, I have a little ritual. I walk past my colleagues and tell them:

*"Awesome job this week. Take the next 2 days off."*

It's a bit of fun. People look forward to it. Sometimes I personalize it, sometimes I get creative. It lifts morale and ends the week on a high note.

**AJAAS is that ritual, as an API.**

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
curl http://localhost:3000/api/awesome/Sarah
# → {"message":"Awesome job, Sarah!"}

curl http://localhost:3000/api/weekly/Mike
# → {"message":"Awesome job this week, Mike. Take the next 2 days off."}

curl "http://localhost:3000/api/random/Alex?from=Boss"
# → {"message":"You crushed it so hard this week, Alex, geologists want to study the impact site. - Boss"}
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

All message endpoints accept an optional `?from=Name` query parameter for attribution.

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
    "recipient": "Sarah",
    "recipientEmail": "sarah@example.com",
    "endpoint": "weekly",
    "cron": "0 17 * * FRI",
    "deliveryMethod": "email"
  }'
```

## Security

AJAAS uses encrypted tokens (AES-256-GCM) for authentication. Two roles are available:

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

```
├── src/
│   ├── api/
│   │   ├── auth/         # Token encryption & middleware
│   │   ├── delivery/     # Email delivery
│   │   ├── routes/       # API endpoints
│   │   ├── scheduler/    # Polling scheduler
│   │   ├── services/     # Message generation
│   │   └── storage/      # SQLite storage
│   └── web/              # React landing page
├── scripts/              # CLI tools
├── Dockerfile
└── package.json
```

## License

MIT

---

*You've read this far. Awesome job. Take the rest of the day off.*
