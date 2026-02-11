import { loadEnvFile } from './env.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface Config {
  port: number;
  host: string;
  web: {
    enabled: boolean;
  };
  endpoints: {
    schedule: {
      enabled: boolean;
    };
  };
  security: {
    enabled: boolean;
    encryptionKey: string;
  };
  messages: {
    toughLove: boolean;
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    timeWindow: string;
  };
  database: {
    path: string;
    dataEncryptionKey: string;
  };
  smtp: SmtpConfig;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(envFilePath?: string): Config {
  // Load .env file first; existing env vars take precedence.
  // On Workers this may throw due to filesystem access, which is safe to ignore.
  try {
    loadEnvFile(envFilePath);
  } catch {
    // Intentionally ignored.
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port) || port < 0 || port > 65535) {
    throw new ConfigError('Invalid PORT: must be a number between 0 and 65535');
  }

  const securityEnabled = getEnvBoolean('SECURITY_ENABLED', false);
  const scheduleEnabled = getEnvBoolean('SCHEDULE_ENABLED', true);
  const encryptionKey = process.env.ENCRYPTION_KEY || '';

  if ((securityEnabled || scheduleEnabled) && encryptionKey && encryptionKey.length < 32) {
    throw new ConfigError(
      `ENCRYPTION_KEY must be at least 32 characters (got ${encryptionKey.length})`,
    );
  }

  const dataEncryptionKey = process.env.DATA_ENCRYPTION_KEY || '';

  if (dataEncryptionKey && dataEncryptionKey.length < 32) {
    throw new ConfigError(
      `DATA_ENCRYPTION_KEY must be at least 32 characters (got ${dataEncryptionKey.length})`,
    );
  }

  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
  if (isNaN(rateLimitMax) || rateLimitMax < 1) {
    throw new ConfigError('Invalid RATE_LIMIT_MAX: must be a positive number');
  }

  return {
    port,
    host: process.env.HOST || '0.0.0.0',
    web: {
      enabled: getEnvBoolean('WEB_ENABLED', true),
    },
    endpoints: {
      schedule: {
        enabled: scheduleEnabled,
      },
    },
    security: {
      enabled: securityEnabled,
      encryptionKey,
    },
    messages: {
      toughLove: getEnvBoolean('TOUGH_LOVE_ENABLED', true),
    },
    rateLimit: {
      enabled: getEnvBoolean('RATE_LIMIT_ENABLED', false),
      max: rateLimitMax,
      timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    },
    database: {
      path: process.env.DB_PATH || ':memory:',
      dataEncryptionKey,
    },
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: getEnvBoolean('SMTP_SECURE', false),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'ajaas@example.com',
    },
  };
}
