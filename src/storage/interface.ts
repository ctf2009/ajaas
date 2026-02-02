export interface Schedule {
  id: string;
  recipient: string;
  recipientEmail: string;
  endpoint: string;
  messageType?: string;
  from?: string;
  cron: string;
  nextRun: number; // Unix timestamp in seconds
  deliveryMethod: 'email' | 'discord';
  createdBy: string;
  createdAt: number;
}

export interface RevokedToken {
  jti: string;
  revokedAt: number;
}

export interface Storage {
  // Revocation
  revokeToken(jti: string): void;
  isTokenRevoked(jti: string): boolean;

  // Schedules
  createSchedule(schedule: Omit<Schedule, 'id' | 'createdAt'>): Schedule;
  getSchedule(id: string): Schedule | null;
  getSchedulesDue(beforeTimestamp: number): Schedule[];
  updateScheduleNextRun(id: string, nextRun: number): void;
  deleteSchedule(id: string): boolean;
  listSchedules(createdBy?: string): Schedule[];

  // Lifecycle
  close(): void;
}
