import { TokenService, Role } from '../src/auth/token.js';

function parseArgs(): {
  sub: string;
  name: string;
  role: Role;
  expires: number;
  encryptionKey: string;
} {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        parsed[key] = value;
        i++;
      }
    }
  }

  const sub = parsed.sub || parsed.email;
  const name = parsed.name;
  const role = parsed.role as Role;
  const expiresArg = parsed.expires || '365d';
  const encryptionKey = parsed.key || process.env.ENCRYPTION_KEY;

  if (!sub || !name || !role) {
    console.error(`
Usage: npm run generate-key -- --sub <email> --name <name> --role <role> [options]

Required:
  --sub, --email   Subject identifier (e.g., email address)
  --name           Display name
  --role           Role: 'read' or 'schedule'

Optional:
  --expires        Expiry duration (default: 365d). Examples: 30d, 90d, 1y
  --key            Encryption key (or set ENCRYPTION_KEY env var)

Examples:
  npm run generate-key -- --sub sarah@example.com --name Sarah --role schedule
  npm run generate-key -- --sub api@example.com --name "API Client" --role read --expires 30d
`);
    process.exit(1);
  }

  if (!['read', 'schedule'].includes(role)) {
    console.error(`Error: role must be 'read' or 'schedule'`);
    process.exit(1);
  }

  if (!encryptionKey) {
    console.error(`Error: encryption key required. Set ENCRYPTION_KEY env var or use --key`);
    process.exit(1);
  }

  // Parse expires duration
  let expiresDays = 365;
  const match = expiresArg.match(/^(\d+)(d|y)?$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2] || 'd';
    expiresDays = unit === 'y' ? num * 365 : num;
  }

  return { sub, name, role, expires: expiresDays, encryptionKey };
}

function main() {
  const { sub, name, role, expires, encryptionKey } = parseArgs();

  const tokenService = new TokenService(encryptionKey);
  const { token, payload } = tokenService.createToken(sub, name, role, expires);

  console.log(`
API Key Generated
=================

Token:
${token}

Details:
  ID (jti):  ${payload.jti}
  Subject:   ${payload.sub}
  Name:      ${payload.name}
  Role:      ${payload.role}
  Expires:   ${new Date(payload.exp * 1000).toISOString()}

Usage:
  curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/awesome/Someone
`);
}

main();
