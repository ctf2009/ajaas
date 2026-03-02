import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, ConfigError } from './config.js';

// Keys to clean up between tests
const ENV_KEYS = [
  'PORT', 'HOST', 'WEB_ENABLED', 'SCHEDULE_ENABLED', 'SECURITY_ENABLED',
  'ENCRYPTION_KEY', 'DATA_ENCRYPTION_KEY', 'TOUGH_LOVE_ENABLED', 'DB_PATH',
  'RATE_LIMIT_ENABLED', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW', 'CORS_ORIGIN',
  'GA_MEASUREMENT_ID', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER',
  'SMTP_PASS', 'SMTP_FROM', 'KLIPY_API_KEY', 'ENV_FILE',
];

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('loadConfig', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    // Prevent loadConfig from reading the real .env file
    process.env.ENV_FILE = '/nonexistent/.env';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  describe('defaults', () => {
    it('uses port 3000 by default', () => {
      expect(loadConfig().port).toBe(3000);
    });

    it('uses host 0.0.0.0 by default', () => {
      expect(loadConfig().host).toBe('0.0.0.0');
    });

    it('enables web by default', () => {
      expect(loadConfig().web.enabled).toBe(true);
    });

    it('enables schedule endpoints by default', () => {
      expect(loadConfig().endpoints.schedule.enabled).toBe(true);
    });

    it('disables security by default', () => {
      expect(loadConfig().security.enabled).toBe(false);
    });

    it('enables tough love by default', () => {
      expect(loadConfig().messages.toughLove).toBe(true);
    });

    it('uses in-memory database by default', () => {
      expect(loadConfig().database.path).toBe(':memory:');
    });

    it('disables rate limiting by default', () => {
      expect(loadConfig().rateLimit.enabled).toBe(false);
    });

    it('uses rate limit max of 100 by default', () => {
      expect(loadConfig().rateLimit.max).toBe(100);
    });

    it('uses "1 minute" rate limit window by default', () => {
      expect(loadConfig().rateLimit.timeWindow).toBe('1 minute');
    });

    it('uses SMTP port 587 by default', () => {
      expect(loadConfig().smtp.port).toBe(587);
    });

    it('uses default SMTP from address', () => {
      expect(loadConfig().smtp.from).toBe('ajaas@example.com');
    });

    it('disables SMTP TLS by default', () => {
      expect(loadConfig().smtp.secure).toBe(false);
    });

    it('uses CORS wildcard by default', () => {
      expect(loadConfig().cors.origin).toBe('*');
    });

    it('uses empty KLIPY API key by default', () => {
      expect(loadConfig().klipy.apiKey).toBe('');
    });
  });

  describe('PORT', () => {
    it('accepts a custom port', () => {
      setEnv({ PORT: '8080' });
      expect(loadConfig().port).toBe(8080);
    });

    it('throws ConfigError for non-numeric PORT', () => {
      setEnv({ PORT: 'notanumber' });
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('Invalid PORT');
    });

    it('throws ConfigError for port above 65535', () => {
      setEnv({ PORT: '65536' });
      expect(() => loadConfig()).toThrow(ConfigError);
    });

    it('throws ConfigError for negative port', () => {
      setEnv({ PORT: '-1' });
      expect(() => loadConfig()).toThrow(ConfigError);
    });

    it('accepts port 0', () => {
      setEnv({ PORT: '0' });
      expect(loadConfig().port).toBe(0);
    });

    it('accepts port 65535', () => {
      setEnv({ PORT: '65535' });
      expect(loadConfig().port).toBe(65535);
    });
  });

  describe('ENCRYPTION_KEY', () => {
    it('throws when SECURITY_ENABLED=true and key is shorter than 32 chars', () => {
      setEnv({ SECURITY_ENABLED: 'true', ENCRYPTION_KEY: 'tooshort' });
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('ENCRYPTION_KEY must be at least 32 characters');
    });

    it('throws when SCHEDULE_ENABLED=true and key is shorter than 32 chars', () => {
      setEnv({ SCHEDULE_ENABLED: 'true', ENCRYPTION_KEY: 'tooshort' });
      expect(() => loadConfig()).toThrow(ConfigError);
    });

    it('does not throw when key is absent and security/schedule are disabled', () => {
      setEnv({ SECURITY_ENABLED: 'false', SCHEDULE_ENABLED: 'false' });
      expect(() => loadConfig()).not.toThrow();
    });

    it('does not throw when key is absent and only defaults apply', () => {
      // SECURITY_ENABLED defaults to false; short/absent key is acceptable
      expect(() => loadConfig()).not.toThrow();
    });

    it('accepts a key of exactly 32 characters with security enabled', () => {
      setEnv({
        SECURITY_ENABLED: 'true',
        ENCRYPTION_KEY: 'this-is-a-32-character-test-key!',
      });
      expect(() => loadConfig()).not.toThrow();
    });

    it('stores the encryption key in config', () => {
      const key = 'this-is-a-32-character-test-key!';
      setEnv({ ENCRYPTION_KEY: key });
      expect(loadConfig().security.encryptionKey).toBe(key);
    });
  });

  describe('DATA_ENCRYPTION_KEY', () => {
    it('throws when set to fewer than 32 characters', () => {
      setEnv({ DATA_ENCRYPTION_KEY: 'short' });
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('DATA_ENCRYPTION_KEY must be at least 32 characters');
    });

    it('accepts a key of 32+ characters', () => {
      setEnv({ DATA_ENCRYPTION_KEY: 'this-is-a-32-character-data-key!!' });
      expect(() => loadConfig()).not.toThrow();
    });

    it('is empty string when not set', () => {
      expect(loadConfig().database.dataEncryptionKey).toBe('');
    });
  });

  describe('RATE_LIMIT_MAX', () => {
    it('throws for non-numeric value', () => {
      setEnv({ RATE_LIMIT_MAX: 'notanumber' });
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('Invalid RATE_LIMIT_MAX');
    });

    it('throws for zero', () => {
      setEnv({ RATE_LIMIT_MAX: '0' });
      expect(() => loadConfig()).toThrow(ConfigError);
    });

    it('throws for negative value', () => {
      setEnv({ RATE_LIMIT_MAX: '-10' });
      expect(() => loadConfig()).toThrow(ConfigError);
    });

    it('accepts a positive value', () => {
      setEnv({ RATE_LIMIT_MAX: '50' });
      expect(loadConfig().rateLimit.max).toBe(50);
    });
  });

  describe('boolean env var parsing', () => {
    it('parses "true" as true', () => {
      setEnv({ WEB_ENABLED: 'true' });
      expect(loadConfig().web.enabled).toBe(true);
    });

    it('parses "1" as true', () => {
      setEnv({ WEB_ENABLED: '1' });
      expect(loadConfig().web.enabled).toBe(true);
    });

    it('parses "false" as false', () => {
      setEnv({ WEB_ENABLED: 'false' });
      expect(loadConfig().web.enabled).toBe(false);
    });

    it('parses "FALSE" as false (case-insensitive)', () => {
      setEnv({ WEB_ENABLED: 'FALSE' });
      expect(loadConfig().web.enabled).toBe(false);
    });

    it('parses "TRUE" as true (case-insensitive)', () => {
      setEnv({ WEB_ENABLED: 'TRUE' });
      expect(loadConfig().web.enabled).toBe(true);
    });

    it('parses "0" as false', () => {
      setEnv({ WEB_ENABLED: '0' });
      expect(loadConfig().web.enabled).toBe(false);
    });
  });

  describe('feature flags', () => {
    it('disables web when WEB_ENABLED=false', () => {
      setEnv({ WEB_ENABLED: 'false' });
      expect(loadConfig().web.enabled).toBe(false);
    });

    it('disables tough love when TOUGH_LOVE_ENABLED=false', () => {
      setEnv({ TOUGH_LOVE_ENABLED: 'false' });
      expect(loadConfig().messages.toughLove).toBe(false);
    });

    it('enables rate limiting when RATE_LIMIT_ENABLED=true', () => {
      setEnv({ RATE_LIMIT_ENABLED: 'true' });
      expect(loadConfig().rateLimit.enabled).toBe(true);
    });

    it('disables schedule endpoints when SCHEDULE_ENABLED=false', () => {
      setEnv({ SCHEDULE_ENABLED: 'false' });
      expect(loadConfig().endpoints.schedule.enabled).toBe(false);
    });

    it('enables security when SECURITY_ENABLED=true with valid key', () => {
      setEnv({
        SECURITY_ENABLED: 'true',
        ENCRYPTION_KEY: 'this-is-a-32-character-test-key!',
      });
      expect(loadConfig().security.enabled).toBe(true);
    });
  });

  describe('SMTP config', () => {
    it('reads all SMTP settings from env', () => {
      setEnv({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'secret',
        SMTP_FROM: 'from@example.com',
      });
      const config = loadConfig();
      expect(config.smtp.host).toBe('smtp.example.com');
      expect(config.smtp.port).toBe(465);
      expect(config.smtp.secure).toBe(true);
      expect(config.smtp.user).toBe('user@example.com');
      expect(config.smtp.pass).toBe('secret');
      expect(config.smtp.from).toBe('from@example.com');
    });
  });

  describe('misc config', () => {
    it('reads DB_PATH from env', () => {
      setEnv({ DB_PATH: '/data/ajaas.db' });
      expect(loadConfig().database.path).toBe('/data/ajaas.db');
    });

    it('reads CORS_ORIGIN from env', () => {
      setEnv({ CORS_ORIGIN: 'https://example.com' });
      expect(loadConfig().cors.origin).toBe('https://example.com');
    });

    it('reads HOST from env', () => {
      setEnv({ HOST: '127.0.0.1' });
      expect(loadConfig().host).toBe('127.0.0.1');
    });

    it('reads GA_MEASUREMENT_ID from env', () => {
      setEnv({ GA_MEASUREMENT_ID: 'G-12345' });
      expect(loadConfig().web.gaMeasurementId).toBe('G-12345');
    });

    it('reads RATE_LIMIT_WINDOW from env', () => {
      setEnv({ RATE_LIMIT_WINDOW: '5 minutes' });
      expect(loadConfig().rateLimit.timeWindow).toBe('5 minutes');
    });

    it('reads KLIPY_API_KEY from env', () => {
      setEnv({ KLIPY_API_KEY: 'test-klipy-key' });
      expect(loadConfig().klipy.apiKey).toBe('test-klipy-key');
    });
  });
});
