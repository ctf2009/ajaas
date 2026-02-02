import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from './sqlite.js';

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;

  beforeEach(() => {
    // Use in-memory database for tests
    storage = new SQLiteStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  describe('token revocation', () => {
    it('should return false for non-revoked token', () => {
      expect(storage.isTokenRevoked('some-jti')).toBe(false);
    });

    it('should return true after revoking a token', () => {
      storage.revokeToken('test-jti');
      expect(storage.isTokenRevoked('test-jti')).toBe(true);
    });

    it('should handle revoking the same token twice', () => {
      storage.revokeToken('test-jti');
      storage.revokeToken('test-jti');
      expect(storage.isTokenRevoked('test-jti')).toBe(true);
    });

    it('should only revoke the specified token', () => {
      storage.revokeToken('revoked-jti');
      expect(storage.isTokenRevoked('revoked-jti')).toBe(true);
      expect(storage.isTokenRevoked('other-jti')).toBe(false);
    });
  });

  describe('schedules', () => {
    const baseSchedule = {
      recipient: 'Sarah',
      recipientEmail: 'sarah@example.com',
      endpoint: 'weekly',
      cron: '0 17 * * FRI',
      nextRun: Math.floor(Date.now() / 1000) + 3600,
      deliveryMethod: 'email' as const,
      createdBy: 'admin@example.com',
    };

    describe('createSchedule', () => {
      it('should create a schedule with generated id and createdAt', () => {
        const schedule = storage.createSchedule(baseSchedule);

        expect(schedule.id).toBeTruthy();
        expect(schedule.createdAt).toBeTruthy();
        expect(schedule.recipient).toBe('Sarah');
        expect(schedule.recipientEmail).toBe('sarah@example.com');
        expect(schedule.endpoint).toBe('weekly');
        expect(schedule.cron).toBe('0 17 * * FRI');
        expect(schedule.deliveryMethod).toBe('email');
        expect(schedule.createdBy).toBe('admin@example.com');
      });

      it('should generate unique IDs for each schedule', () => {
        const schedule1 = storage.createSchedule(baseSchedule);
        const schedule2 = storage.createSchedule(baseSchedule);

        expect(schedule1.id).not.toBe(schedule2.id);
      });

      it('should store optional fields', () => {
        const schedule = storage.createSchedule({
          ...baseSchedule,
          messageType: 'animal',
          from: 'Boss',
        });

        expect(schedule.messageType).toBe('animal');
        expect(schedule.from).toBe('Boss');
      });
    });

    describe('getSchedule', () => {
      it('should return null for non-existent schedule', () => {
        expect(storage.getSchedule('non-existent')).toBeNull();
      });

      it('should return the created schedule', () => {
        const created = storage.createSchedule(baseSchedule);
        const retrieved = storage.getSchedule(created.id);

        expect(retrieved).toEqual(created);
      });
    });

    describe('getSchedulesDue', () => {
      it('should return empty array when no schedules are due', () => {
        storage.createSchedule({
          ...baseSchedule,
          nextRun: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        });

        const due = storage.getSchedulesDue(Math.floor(Date.now() / 1000));
        expect(due).toHaveLength(0);
      });

      it('should return schedules that are due', () => {
        const pastSchedule = storage.createSchedule({
          ...baseSchedule,
          nextRun: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        });

        storage.createSchedule({
          ...baseSchedule,
          nextRun: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        });

        const due = storage.getSchedulesDue(Math.floor(Date.now() / 1000));
        expect(due).toHaveLength(1);
        expect(due[0].id).toBe(pastSchedule.id);
      });
    });

    describe('updateScheduleNextRun', () => {
      it('should update the nextRun timestamp', () => {
        const schedule = storage.createSchedule(baseSchedule);
        const newNextRun = Math.floor(Date.now() / 1000) + 7200;

        storage.updateScheduleNextRun(schedule.id, newNextRun);

        const updated = storage.getSchedule(schedule.id);
        expect(updated?.nextRun).toBe(newNextRun);
      });
    });

    describe('deleteSchedule', () => {
      it('should return false for non-existent schedule', () => {
        expect(storage.deleteSchedule('non-existent')).toBe(false);
      });

      it('should delete the schedule and return true', () => {
        const schedule = storage.createSchedule(baseSchedule);

        expect(storage.deleteSchedule(schedule.id)).toBe(true);
        expect(storage.getSchedule(schedule.id)).toBeNull();
      });
    });

    describe('listSchedules', () => {
      it('should return empty array when no schedules exist', () => {
        expect(storage.listSchedules()).toHaveLength(0);
      });

      it('should return all schedules when no filter is provided', () => {
        storage.createSchedule({ ...baseSchedule, createdBy: 'user1@example.com' });
        storage.createSchedule({ ...baseSchedule, createdBy: 'user2@example.com' });

        const all = storage.listSchedules();
        expect(all).toHaveLength(2);
      });

      it('should filter by createdBy when provided', () => {
        storage.createSchedule({ ...baseSchedule, createdBy: 'user1@example.com' });
        storage.createSchedule({ ...baseSchedule, createdBy: 'user2@example.com' });
        storage.createSchedule({ ...baseSchedule, createdBy: 'user1@example.com' });

        const user1Schedules = storage.listSchedules('user1@example.com');
        expect(user1Schedules).toHaveLength(2);
        expect(user1Schedules.every(s => s.createdBy === 'user1@example.com')).toBe(true);
      });

      it('should return multiple schedules', () => {
        storage.createSchedule({ ...baseSchedule, recipient: 'First' });
        storage.createSchedule({ ...baseSchedule, recipient: 'Second' });
        storage.createSchedule({ ...baseSchedule, recipient: 'Third' });

        const all = storage.listSchedules();
        expect(all).toHaveLength(3);
        const recipients = all.map(s => s.recipient);
        expect(recipients).toContain('First');
        expect(recipients).toContain('Second');
        expect(recipients).toContain('Third');
      });
    });
  });
});
