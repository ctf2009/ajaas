import { Pool, PoolConfig } from 'pg';
import { randomBytes } from 'crypto';
import { Storage, Schedule } from './interface.js';
import { deriveKeyBuffer, encrypt, decrypt } from '../crypto.js';

export class PostgresStorage implements Storage {
  private pool: Pool;
  private dataKey: Buffer | null;
  private initialized: boolean = false;

  constructor(connectionString: string, dataEncryptionKey?: string) {
    const config: PoolConfig = {
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    this.pool = new Pool(config);
    this.dataKey = dataEncryptionKey ? deriveKeyBuffer(dataEncryptionKey) : null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS revoked_tokens (
          jti TEXT PRIMARY KEY,
          revoked_at INTEGER NOT NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS schedules (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          recipient_email TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          message_type TEXT,
          from_name TEXT,
          cron TEXT NOT NULL,
          next_run INTEGER NOT NULL,
          delivery_method TEXT NOT NULL DEFAULT 'email',
          webhook_url TEXT,
          webhook_secret TEXT,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_schedules_created_by ON schedules(created_by)
      `);

      this.initialized = true;
    } finally {
      client.release();
    }
  }

  private encryptField(value: string): string {
    if (!this.dataKey) return value;
    return encrypt(value, this.dataKey);
  }

  private decryptField(value: string): string {
    if (!this.dataKey) return value;
    return decrypt(value, this.dataKey) ?? value;
  }

  async revokeToken(jti: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO revoked_tokens (jti, revoked_at) VALUES ($1, $2)
       ON CONFLICT (jti) DO UPDATE SET revoked_at = $2`,
      [jti, Math.floor(Date.now() / 1000)]
    );
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM revoked_tokens WHERE jti = $1',
      [jti]
    );
    return result.rows.length > 0;
  }

  async createSchedule(schedule: Omit<Schedule, 'id' | 'createdAt'>): Promise<Schedule> {
    const id = randomBytes(8).toString('hex');
    const createdAt = Math.floor(Date.now() / 1000);

    await this.pool.query(
      `INSERT INTO schedules (
        id, recipient, recipient_email, endpoint, message_type, from_name,
        cron, next_run, delivery_method, webhook_url, webhook_secret,
        created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        schedule.recipient,
        this.encryptField(schedule.recipientEmail),
        schedule.endpoint,
        schedule.messageType || null,
        schedule.from || null,
        schedule.cron,
        schedule.nextRun,
        schedule.deliveryMethod,
        schedule.webhookUrl ? this.encryptField(schedule.webhookUrl) : null,
        schedule.webhookSecret ? this.encryptField(schedule.webhookSecret) : null,
        schedule.createdBy,
        createdAt,
      ]
    );

    return { ...schedule, id, createdAt };
  }

  async getSchedule(id: string): Promise<Schedule | null> {
    const result = await this.pool.query(
      'SELECT * FROM schedules WHERE id = $1',
      [id]
    );
    return result.rows.length > 0 ? this.rowToSchedule(result.rows[0]) : null;
  }

  /**
   * Get schedules that are due for processing.
   * Uses FOR UPDATE SKIP LOCKED to safely handle concurrent polling:
   * - Locks rows to prevent other workers from processing the same schedules
   * - SKIP LOCKED means if another worker already locked a row, skip it
   * - This enables safe horizontal scaling of scheduler workers
   */
  async getSchedulesDue(beforeTimestamp: number): Promise<Schedule[]> {
    const result = await this.pool.query(
      `SELECT * FROM schedules
       WHERE next_run <= $1
       FOR UPDATE SKIP LOCKED`,
      [beforeTimestamp]
    );
    return result.rows.map((row) => this.rowToSchedule(row));
  }

  async updateScheduleNextRun(id: string, nextRun: number): Promise<void> {
    await this.pool.query(
      'UPDATE schedules SET next_run = $1 WHERE id = $2',
      [nextRun, id]
    );
  }

  async deleteSchedule(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM schedules WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listSchedules(createdBy?: string): Promise<Schedule[]> {
    if (createdBy) {
      const result = await this.pool.query(
        'SELECT * FROM schedules WHERE created_by = $1 ORDER BY created_at DESC',
        [createdBy]
      );
      return result.rows.map((row) => this.rowToSchedule(row));
    }
    const result = await this.pool.query(
      'SELECT * FROM schedules ORDER BY created_at DESC'
    );
    return result.rows.map((row) => this.rowToSchedule(row));
  }

  private rowToSchedule(row: any): Schedule {
    return {
      id: row.id,
      recipient: row.recipient,
      recipientEmail: this.decryptField(row.recipient_email),
      endpoint: row.endpoint,
      messageType: row.message_type || undefined,
      from: row.from_name || undefined,
      cron: row.cron,
      nextRun: row.next_run,
      deliveryMethod: row.delivery_method,
      webhookUrl: row.webhook_url ? this.decryptField(row.webhook_url) : undefined,
      webhookSecret: row.webhook_secret ? this.decryptField(row.webhook_secret) : undefined,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
