import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Parse a .env file and return key-value pairs.
 * Supports:
 * - KEY=value
 * - KEY="quoted value"
 * - KEY='single quoted value'
 * - Comments (#) and blank lines
 * - Inline comments (KEY=value # comment)
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Handle quoted values
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments for unquoted values
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    result[key] = value;
  }

  return result;
}

/**
 * Load a .env file and merge into process.env.
 * Existing environment variables always take precedence.
 *
 * @param filePath Path to the .env file. Defaults to ENV_FILE env var, then .env in cwd.
 * @returns The number of variables loaded from the file.
 */
export function loadEnvFile(filePath?: string): number {
  const resolvedPath = resolve(filePath || process.env.ENV_FILE || '.env');

  if (!existsSync(resolvedPath)) {
    return 0;
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  const parsed = parseEnvFile(content);

  let loaded = 0;
  for (const [key, value] of Object.entries(parsed)) {
    // Existing env vars take precedence
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded++;
    }
  }

  return loaded;
}
