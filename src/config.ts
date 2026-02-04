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
  };
  smtp: SmtpConfig;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadConfig(envFilePath?: string): Config {
  // Load .env file first — existing env vars take precedence
  loadEnvFile(envFilePath);

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    web: {
      enabled: getEnvBoolean('WEB_ENABLED', true),
    },
    endpoints: {
      schedule: {
        enabled: getEnvBoolean('SCHEDULE_ENABLED', true),
      },
    },
    security: {
      enabled: getEnvBoolean('SECURITY_ENABLED', false),
      encryptionKey: process.env.ENCRYPTION_KEY || '',
    },
    messages: {
      toughLove: getEnvBoolean('TOUGH_LOVE_ENABLED', true),
    },
    rateLimit: {
      enabled: getEnvBoolean('RATE_LIMIT_ENABLED', false),
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    },
    database: {
      path: process.env.DB_PATH || ':memory:',
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
