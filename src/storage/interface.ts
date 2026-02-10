export interface Schedule {
  id: string;
  recipient: string;
  recipientEmail: string;
  endpoint: string;
  messageType?: string;
  from?: string;
  cron: string;
  nextRun: number; // Unix timestamp in seconds
  deliveryMethod: 'email' | 'webhook';
  webhookUrl?: string;
  webhookSecret?: string;
  createdBy: string;
  createdAt: number;
}

export interface RevokedToken {
  jti: string;
  revokedAt: number;
}

export interface Storage {
  // Revocation
  revokeToken(jti: string): Promise<void>;
  isTokenRevoked(jti: string): Promise<boolean>;

  // Schedules
  createSchedule(schedule: Omit<Schedule, 'id' | 'createdAt'>): Promise<Schedule>;
  getSchedule(id: string): Promise<Schedule | null>;
  getSchedulesDue(beforeTimestamp: number): Promise<Schedule[]>;
  updateScheduleNextRun(id: string, nextRun: number): Promise<void>;
  deleteSchedule(id: string): Promise<boolean>;
  listSchedules(createdBy?: string): Promise<Schedule[]>;

  // Lifecycle
  close(): Promise<void>;
}
