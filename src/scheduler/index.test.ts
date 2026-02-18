import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from './index.js';
import type { Storage, Schedule } from '../storage/interface.js';
import { MessageService } from '../services/messages.js';
import type { EmailDelivery } from '../delivery/email.js';

function createSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sch-1',
    recipient: 'Rachel',
    recipientEmail: 'rachel@example.com',
    endpoint: 'awesome',
    cron: '* * * * *',
    nextRun: 0,
    deliveryMethod: 'email',
    createdBy: 'rachel@example.com',
    createdAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cleans up expired revocations on configured cadence', async () => {
    const storage: Storage = {
      revokeToken: vi.fn(),
      isTokenRevoked: vi.fn(),
      cleanupRevokedTokens: vi.fn().mockResolvedValue(0),
      createSchedule: vi.fn(),
      getSchedule: vi.fn(),
      getSchedulesDue: vi.fn().mockResolvedValue([]),
      updateScheduleNextRun: vi.fn(),
      deleteSchedule: vi.fn(),
      listSchedules: vi.fn(),
      close: vi.fn(),
    };

    const emailDelivery = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailDelivery;

    const scheduler = new Scheduler(
      storage,
      new MessageService(true),
      emailDelivery,
      undefined,
      60_000,
      60,
      120_000,
    );

    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await (scheduler as any).poll();
    expect(storage.cleanupRevokedTokens).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    await (scheduler as any).poll();
    expect(storage.cleanupRevokedTokens).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
    await (scheduler as any).poll();
    expect(storage.cleanupRevokedTokens).toHaveBeenCalledTimes(2);
  });


  it('continues schedule processing when revocation cleanup fails', async () => {
    const dueSchedule = createSchedule({ nextRun: Math.floor(Date.now() / 1000) - 10 });

    const storage: Storage = {
      revokeToken: vi.fn(),
      isTokenRevoked: vi.fn(),
      cleanupRevokedTokens: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      createSchedule: vi.fn(),
      getSchedule: vi.fn(),
      getSchedulesDue: vi.fn().mockResolvedValue([dueSchedule]),
      updateScheduleNextRun: vi.fn().mockResolvedValue(undefined),
      deleteSchedule: vi.fn(),
      listSchedules: vi.fn(),
      close: vi.fn(),
    };

    const emailDelivery = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailDelivery;

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const scheduler = new Scheduler(storage, new MessageService(true), emailDelivery);
    await (scheduler as any).poll();

    expect(storage.getSchedulesDue).toHaveBeenCalledTimes(1);
    expect(emailDelivery.sendMessage).toHaveBeenCalledTimes(1);
    expect(storage.updateScheduleNextRun).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to cleanup revoked tokens:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it('processes due schedules and sends emails', async () => {
    const dueSchedule = createSchedule({ nextRun: Math.floor(Date.now() / 1000) - 10 });

    const storage: Storage = {
      revokeToken: vi.fn(),
      isTokenRevoked: vi.fn(),
      cleanupRevokedTokens: vi.fn().mockResolvedValue(0),
      createSchedule: vi.fn(),
      getSchedule: vi.fn(),
      getSchedulesDue: vi.fn().mockResolvedValue([dueSchedule]),
      updateScheduleNextRun: vi.fn().mockResolvedValue(undefined),
      deleteSchedule: vi.fn(),
      listSchedules: vi.fn(),
      close: vi.fn(),
    };

    const emailDelivery = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailDelivery;

    const scheduler = new Scheduler(storage, new MessageService(true), emailDelivery);
    await (scheduler as any).poll();

    expect(emailDelivery.sendMessage).toHaveBeenCalledTimes(1);
    expect(storage.updateScheduleNextRun).toHaveBeenCalledTimes(1);
  });
});
