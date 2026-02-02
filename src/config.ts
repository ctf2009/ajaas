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
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadConfig(): Config {
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
  };
}
