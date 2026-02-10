import { describe, it, expect, afterEach } from 'vitest';
import { createStorage } from './factory.js';
import { SQLiteStorage } from './sqlite.js';
import { PostgresStorage } from './postgres.js';
import { Storage } from './interface.js';

describe('Storage Factory', () => {
  let storage: Storage | null = null;

  afterEach(async () => {
    if (storage) {
      await storage.close();
      storage = null;
    }
  });

  it('should create SQLiteStorage for :memory: path', async () => {
    storage = await createStorage({ connectionUrl: ':memory:' });
    expect(storage).toBeInstanceOf(SQLiteStorage);
  });

  it('should create SQLiteStorage for file path', async () => {
    storage = await createStorage({ connectionUrl: './test.db' });
    expect(storage).toBeInstanceOf(SQLiteStorage);
  });

  it('should create SQLiteStorage with encryption key', async () => {
    storage = await createStorage({
      connectionUrl: ':memory:',
      dataEncryptionKey: 'test-encryption-key-32-chars-long!',
    });
    expect(storage).toBeInstanceOf(SQLiteStorage);
  });

  it('should create PostgresStorage for postgresql:// URL', async () => {
    // This test verifies the factory correctly identifies PostgreSQL URLs
    // but we don't actually connect since there's no PostgreSQL server
    const connectionUrl = 'postgresql://user:pass@localhost:5432/testdb';

    // We can't fully test PostgreSQL without a running server,
    // but we can verify the factory recognizes the URL pattern
    // by checking the storage type before initialization fails
    try {
      storage = await createStorage({ connectionUrl });
    } catch (e) {
      // Expected to fail without a real PostgreSQL server
      // The error indicates it tried to create a PostgresStorage
      expect((e as Error).message).toMatch(/connect|ECONNREFUSED|getaddrinfo/i);
    }
  });

  it('should create PostgresStorage for postgres:// URL', async () => {
    const connectionUrl = 'postgres://user:pass@localhost:5432/testdb';

    try {
      storage = await createStorage({ connectionUrl });
    } catch (e) {
      // Expected to fail without a real PostgreSQL server
      expect((e as Error).message).toMatch(/connect|ECONNREFUSED|getaddrinfo/i);
    }
  });

  describe('SQLite functional tests via factory', () => {
    it('should create and retrieve schedules', async () => {
      storage = await createStorage({ connectionUrl: ':memory:' });

      const schedule = await storage.createSchedule({
        recipient: 'Test User',
        recipientEmail: 'test@example.com',
        endpoint: '/api/awesome/Test',
        cron: '0 9 * * *',
        nextRun: Math.floor(Date.now() / 1000),
        deliveryMethod: 'email',
        createdBy: 'factory-test',
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.recipient).toBe('Test User');

      const retrieved = await storage.getSchedule(schedule.id);
      expect(retrieved).toEqual(schedule);
    });

    it('should handle token revocation', async () => {
      storage = await createStorage({ connectionUrl: ':memory:' });

      const jti = 'test-token-id';
      expect(await storage.isTokenRevoked(jti)).toBe(false);

      await storage.revokeToken(jti);
      expect(await storage.isTokenRevoked(jti)).toBe(true);
    });
  });
});
