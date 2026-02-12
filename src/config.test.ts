import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env.js', () => ({
  loadEnvFile: vi.fn(),
}));

import { loadConfig, ConfigError } from './config.js';
import { loadEnvFile } from './env.js';

const mockedLoadEnvFile = vi.mocked(loadEnvFile);
const ORIGINAL_ENV = { ...process.env };

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.WEB_ENABLED;
    delete process.env.SCHEDULE_ENABLED;
    delete process.env.SECURITY_ENABLED;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.DATA_ENCRYPTION_KEY;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_WINDOW;
    delete process.env.DB_PATH;
    delete process.env.CORS_ORIGIN;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('loads defaults when env vars are not set', () => {
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.web.enabled).toBe(true);
    expect(config.endpoints.schedule.enabled).toBe(true);
    expect(config.security.enabled).toBe(false);
    expect(config.cors.origin).toBe('*');
    expect(config.rateLimit.max).toBe(100);
    expect(config.database.path).toBe(':memory:');
    expect(config.smtp.port).toBe(587);
    expect(mockedLoadEnvFile).toHaveBeenCalledTimes(1);
  });

  it('passes explicit env file path to env loader', () => {
    loadConfig('.env.test');
    expect(mockedLoadEnvFile).toHaveBeenCalledWith('.env.test');
  });

  it('does not throw when env file load fails', () => {
    mockedLoadEnvFile.mockImplementation(() => {
      throw new Error('fs unavailable');
    });

    expect(() => loadConfig()).not.toThrow();
  });

  it('throws for invalid PORT values', () => {
    process.env.PORT = '99999';
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it('throws when ENCRYPTION_KEY is too short', () => {
    process.env.SCHEDULE_ENABLED = 'true';
    process.env.ENCRYPTION_KEY = 'short-key';
    expect(() => loadConfig()).toThrow('ENCRYPTION_KEY must be at least 32 characters');
  });

  it('throws when DATA_ENCRYPTION_KEY is too short', () => {
    process.env.DATA_ENCRYPTION_KEY = 'short-key';
    expect(() => loadConfig()).toThrow('DATA_ENCRYPTION_KEY must be at least 32 characters');
  });

  it('throws for invalid RATE_LIMIT_MAX', () => {
    process.env.RATE_LIMIT_MAX = '0';
    expect(() => loadConfig()).toThrow('Invalid RATE_LIMIT_MAX: must be a positive number');
  });

  it('parses booleans and string overrides correctly', () => {
    process.env.WEB_ENABLED = 'false';
    process.env.SECURITY_ENABLED = '1';
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_MAX = '250';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

    const config = loadConfig();
    expect(config.web.enabled).toBe(false);
    expect(config.security.enabled).toBe(true);
    expect(config.rateLimit.enabled).toBe(true);
    expect(config.rateLimit.max).toBe(250);
    expect(config.cors.origin).toBe('https://example.com');
  });
});
