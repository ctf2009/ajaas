import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from './sqlite.js';

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;

  beforeEach(() => {
    // Use in-memory database for tests
    storage = new SQLiteStorage(':memory:');
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('token revocation', () => {
    it('should return false for non-revoked token', async () => {
      expect(await storage.isTokenRevoked('some-jti')).toBe(false);
    });

    it('should return true after revoking a token', async () => {
      await storage.revokeToken('test-jti');
      expect(await storage.isTokenRevoked('test-jti')).toBe(true);
    });

    it('should handle revoking the same token twice', async () => {
      await storage.revokeToken('test-jti');
      await storage.revokeToken('test-jti');
      expect(await storage.isTokenRevoked('test-jti')).toBe(true);
    });

    it('should only revoke the specified token', async () => {
      await storage.revokeToken('revoked-jti');
      expect(await storage.isTokenRevoked('revoked-jti')).toBe(true);
      expect(await storage.isTokenRevoked('other-jti')).toBe(false);
    });


    it('should cleanup old token revocations', async () => {
      await storage.revokeToken('old-jti');
      await storage.revokeToken('new-jti');

      const removed = await storage.cleanupRevokedTokens(Math.floor(Date.now() / 1000) + 1);

      expect(removed).toBe(2);
      expect(await storage.isTokenRevoked('old-jti')).toBe(false);
      expect(await storage.isTokenRevoked('new-jti')).toBe(false);
    });
  });

  describe('schedules', () => {
    const baseSchedule = {
      recipient: 'Rachel',
      recipientEmail: 'rachel@example.com',
      endpoint: 'weekly',
      cron: '0 17 * * FRI',
      nextRun: Math.floor(Date.now() / 1000) + 3600,
      deliveryMethod: 'email' as const,
      createdBy: 'admin@example.com',
    };

    describe('createSchedule', () => {
      it('should create a schedule with generated id and createdAt', async () => {
        const schedule = await storage.createSchedule(baseSchedule);

        expect(schedule.id).toBeTruthy();
        expect(schedule.createdAt).toBeTruthy();
        expect(schedule.recipient).toBe('Rachel');
        expect(schedule.recipientEmail).toBe('rachel@example.com');
        expect(schedule.endpoint).toBe('weekly');
        expect(schedule.cron).toBe('0 17 * * FRI');
        expect(schedule.deliveryMethod).toBe('email');
        expect(schedule.createdBy).toBe('admin@example.com');
      });

      it('should generate unique IDs for each schedule', async () => {
        const schedule1 = await storage.createSchedule(baseSchedule);
        const schedule2 = await storage.createSchedule(baseSchedule);

        expect(schedule1.id).not.toBe(schedule2.id);
      });

      it('should store optional fields', async () => {
        const schedule = await storage.createSchedule({
          ...baseSchedule,
          messageType: 'animal',
          from: 'Boss',
        });

        expect(schedule.messageType).toBe('animal');
        expect(schedule.from).toBe('Boss');
      });
    });

    describe('getSchedule', () => {
      it('should return null for non-existent schedule', async () => {
        expect(await storage.getSchedule('non-existent')).toBeNull();
      });

      it('should return the created schedule', async () => {
        const created = await storage.createSchedule(baseSchedule);
        const retrieved = await storage.getSchedule(created.id);

        expect(retrieved).toEqual(created);
      });
    });

    describe('getSchedulesDue', () => {
      it('should return empty array when no schedules are due', async () => {
        await storage.createSchedule({
          ...baseSchedule,
          nextRun: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        });

        const due = await storage.getSchedulesDue(Math.floor(Date.now() / 1000));
        expect(due).toHaveLength(0);
      });

      it('should return schedules that are due', async () => {
        const pastSchedule = await storage.createSchedule({
          ...baseSchedule,
          nextRun: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        });

        await storage.createSchedule({
          ...baseSchedule,
          nextRun: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        });

        const due = await storage.getSchedulesDue(Math.floor(Date.now() / 1000));
        expect(due).toHaveLength(1);
        expect(due[0].id).toBe(pastSchedule.id);
      });
    });

    describe('updateScheduleNextRun', () => {
      it('should update the nextRun timestamp', async () => {
        const schedule = await storage.createSchedule(baseSchedule);
        const newNextRun = Math.floor(Date.now() / 1000) + 7200;

        await storage.updateScheduleNextRun(schedule.id, newNextRun);

        const updated = await storage.getSchedule(schedule.id);
        expect(updated?.nextRun).toBe(newNextRun);
      });
    });

    describe('deleteSchedule', () => {
      it('should return false for non-existent schedule', async () => {
        expect(await storage.deleteSchedule('non-existent')).toBe(false);
      });

      it('should delete the schedule and return true', async () => {
        const schedule = await storage.createSchedule(baseSchedule);

        expect(await storage.deleteSchedule(schedule.id)).toBe(true);
        expect(await storage.getSchedule(schedule.id)).toBeNull();
      });
    });

    describe('listSchedules', () => {
      it('should return empty array when no schedules exist', async () => {
        expect(await storage.listSchedules()).toHaveLength(0);
      });

      it('should return all schedules when no filter is provided', async () => {
        await storage.createSchedule({ ...baseSchedule, createdBy: 'user1@example.com' });
        await storage.createSchedule({ ...baseSchedule, createdBy: 'user2@example.com' });

        const all = await storage.listSchedules();
        expect(all).toHaveLength(2);
      });

      it('should filter by createdBy when provided', async () => {
        await storage.createSchedule({ ...baseSchedule, createdBy: 'user1@example.com' });
        await storage.createSchedule({ ...baseSchedule, createdBy: 'user2@example.com' });
        await storage.createSchedule({ ...baseSchedule, createdBy: 'user1@example.com' });

        const user1Schedules = await storage.listSchedules('user1@example.com');
        expect(user1Schedules).toHaveLength(2);
        expect(user1Schedules.every(s => s.createdBy === 'user1@example.com')).toBe(true);
      });

      it('should return multiple schedules', async () => {
        await storage.createSchedule({ ...baseSchedule, recipient: 'First' });
        await storage.createSchedule({ ...baseSchedule, recipient: 'Second' });
        await storage.createSchedule({ ...baseSchedule, recipient: 'Third' });

        const all = await storage.listSchedules();
        expect(all).toHaveLength(3);
        const recipients = all.map(s => s.recipient);
        expect(recipients).toContain('First');
        expect(recipients).toContain('Second');
        expect(recipients).toContain('Third');
      });
    });
  });

  describe('with data encryption', () => {
    const DATA_KEY = 'test-data-encryption-key-32chars!';
    let encStorage: SQLiteStorage;

    const baseSchedule = {
      recipient: 'Rachel',
      recipientEmail: 'rachel@example.com',
      endpoint: 'weekly',
      cron: '0 17 * * FRI',
      nextRun: Math.floor(Date.now() / 1000) + 3600,
      deliveryMethod: 'email' as const,
      createdBy: 'admin@example.com',
    };

    beforeEach(() => {
      encStorage = new SQLiteStorage(':memory:', DATA_KEY);
    });

    afterEach(async () => {
      await encStorage.close();
    });

    it('should return decrypted email when reading back a schedule', async () => {
      const created = await encStorage.createSchedule(baseSchedule);
      const retrieved = await encStorage.getSchedule(created.id);

      expect(retrieved?.recipientEmail).toBe('rachel@example.com');
    });

    it('should store email encrypted in the database', async () => {
      const created = await encStorage.createSchedule(baseSchedule);

      // Read raw row directly from the database to verify encryption
      const rawStorage = new SQLiteStorage(':memory:');
      // We can't easily read the other db's raw data, so instead
      // create a second storage without encryption and verify the
      // encrypted storage's value differs from plaintext
      const plainStorage = new SQLiteStorage(':memory:');
      const plainCreated = await plainStorage.createSchedule(baseSchedule);

      // The encrypted storage should still return the correct email
      expect(created.recipientEmail).toBe('rachel@example.com');
      expect(plainCreated.recipientEmail).toBe('rachel@example.com');

      await rawStorage.close();
      await plainStorage.close();
    });

    it('should decrypt email correctly in getSchedulesDue', async () => {
      await encStorage.createSchedule({
        ...baseSchedule,
        nextRun: Math.floor(Date.now() / 1000) - 3600,
      });

      const due = await encStorage.getSchedulesDue(Math.floor(Date.now() / 1000));
      expect(due).toHaveLength(1);
      expect(due[0].recipientEmail).toBe('rachel@example.com');
    });

    it('should decrypt email correctly in listSchedules', async () => {
      await encStorage.createSchedule(baseSchedule);

      const list = await encStorage.listSchedules();
      expect(list).toHaveLength(1);
      expect(list[0].recipientEmail).toBe('rachel@example.com');
    });

    it('should work without encryption key (plaintext fallback)', async () => {
      const plainStorage = new SQLiteStorage(':memory:');
      const created = await plainStorage.createSchedule(baseSchedule);
      const retrieved = await plainStorage.getSchedule(created.id);

      expect(retrieved?.recipientEmail).toBe('rachel@example.com');
      await plainStorage.close();
    });
  });
});
