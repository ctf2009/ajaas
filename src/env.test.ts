import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseEnvFile, loadEnvFile } from './env.js';

describe('parseEnvFile', () => {
  it('should parse simple key=value pairs', () => {
    const result = parseEnvFile('FOO=bar\nBAZ=qux');
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('should skip empty lines and comments', () => {
    const content = `
# This is a comment
FOO=bar

# Another comment
BAZ=qux
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('should handle double-quoted values', () => {
    const result = parseEnvFile('FOO="hello world"');
    expect(result).toEqual({ FOO: 'hello world' });
  });

  it('should handle single-quoted values', () => {
    const result = parseEnvFile("FOO='hello world'");
    expect(result).toEqual({ FOO: 'hello world' });
  });

  it('should strip inline comments for unquoted values', () => {
    const result = parseEnvFile('FOO=bar # this is a comment');
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('should preserve inline # in quoted values', () => {
    const result = parseEnvFile('FOO="bar # not a comment"');
    expect(result).toEqual({ FOO: 'bar # not a comment' });
  });

  it('should handle values with equals signs', () => {
    const result = parseEnvFile('FOO=bar=baz');
    expect(result).toEqual({ FOO: 'bar=baz' });
  });

  it('should handle empty values', () => {
    const result = parseEnvFile('FOO=');
    expect(result).toEqual({ FOO: '' });
  });

  it('should trim whitespace around keys and values', () => {
    const result = parseEnvFile('  FOO  =  bar  ');
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('should skip lines without equals sign', () => {
    const result = parseEnvFile('INVALID_LINE\nFOO=bar');
    expect(result).toEqual({ FOO: 'bar' });
  });
});

describe('loadEnvFile', () => {
  let testDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    testDir = join(tmpdir(), `ajaas-env-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Restore any env vars we modified
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    // Clear saved env
    for (const key of Object.keys(savedEnv)) {
      delete savedEnv[key];
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  function saveAndClear(...keys: string[]) {
    for (const key of keys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }

  it('should load variables from a .env file', () => {
    const envFile = join(testDir, '.env');
    saveAndClear('TEST_LOAD_VAR');
    writeFileSync(envFile, 'TEST_LOAD_VAR=loaded');

    const count = loadEnvFile(envFile);

    expect(count).toBe(1);
    expect(process.env.TEST_LOAD_VAR).toBe('loaded');
  });

  it('should not overwrite existing environment variables', () => {
    const envFile = join(testDir, '.env');
    saveAndClear('TEST_EXISTING_VAR');
    process.env.TEST_EXISTING_VAR = 'original';
    writeFileSync(envFile, 'TEST_EXISTING_VAR=overwritten');

    const count = loadEnvFile(envFile);

    expect(count).toBe(0);
    expect(process.env.TEST_EXISTING_VAR).toBe('original');
  });

  it('should return 0 when file does not exist', () => {
    const count = loadEnvFile(join(testDir, 'nonexistent.env'));
    expect(count).toBe(0);
  });

  it('should load multiple variables and report correct count', () => {
    const envFile = join(testDir, '.env');
    saveAndClear('TEST_MULTI_A', 'TEST_MULTI_B', 'TEST_MULTI_C');
    process.env.TEST_MULTI_B = 'existing';
    writeFileSync(envFile, 'TEST_MULTI_A=a\nTEST_MULTI_B=b\nTEST_MULTI_C=c');

    const count = loadEnvFile(envFile);

    expect(count).toBe(2); // A and C loaded, B skipped
    expect(process.env.TEST_MULTI_A).toBe('a');
    expect(process.env.TEST_MULTI_B).toBe('existing');
    expect(process.env.TEST_MULTI_C).toBe('c');
  });
});
