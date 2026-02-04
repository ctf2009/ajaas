import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { Storage, Schedule, RevokedToken } from './interface.js';
import { deriveKeyBuffer, encrypt, decrypt } from '../crypto.js';

export class SQLiteStorage implements Storage {
  private db: Database.Database;
  private dataKey: Buffer | null;

  constructor(dbPath: string = ':memory:', dataEncryptionKey?: string) {
    this.db = new Database(dbPath);
    this.dataKey = dataEncryptionKey ? deriveKeyBuffer(dataEncryptionKey) : null;
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        jti TEXT PRIMARY KEY,
        revoked_at INTEGER NOT NULL
      );

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
      );

      CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run);
      CREATE INDEX IF NOT EXISTS idx_schedules_created_by ON schedules(created_by);
    `);

    // Add webhook columns to existing databases
    this.migrateWebhookColumns();
  }

  private migrateWebhookColumns(): void {
    const columns = this.db.pragma('table_info(schedules)') as { name: string }[];
    const columnNames = columns.map((c) => c.name);

    if (!columnNames.includes('webhook_url')) {
      this.db.exec('ALTER TABLE schedules ADD COLUMN webhook_url TEXT');
    }
    if (!columnNames.includes('webhook_secret')) {
      this.db.exec('ALTER TABLE schedules ADD COLUMN webhook_secret TEXT');
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

  // Revocation methods
  revokeToken(jti: string): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO revoked_tokens (jti, revoked_at) VALUES (?, ?)'
    );
    stmt.run(jti, Math.floor(Date.now() / 1000));
  }

  isTokenRevoked(jti: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?');
    return stmt.get(jti) !== undefined;
  }

  // Schedule methods
  createSchedule(schedule: Omit<Schedule, 'id' | 'createdAt'>): Schedule {
    const id = randomBytes(8).toString('hex');
    const createdAt = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO schedules (
        id, recipient, recipient_email, endpoint, message_type, from_name,
        cron, next_run, delivery_method, webhook_url, webhook_secret,
        created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
      createdAt
    );

    return { ...schedule, id, createdAt };
  }

  getSchedule(id: string): Schedule | null {
    const stmt = this.db.prepare('SELECT * FROM schedules WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToSchedule(row) : null;
  }

  getSchedulesDue(beforeTimestamp: number): Schedule[] {
    const stmt = this.db.prepare('SELECT * FROM schedules WHERE next_run <= ?');
    const rows = stmt.all(beforeTimestamp) as any[];
    return rows.map((row) => this.rowToSchedule(row));
  }

  updateScheduleNextRun(id: string, nextRun: number): void {
    const stmt = this.db.prepare('UPDATE schedules SET next_run = ? WHERE id = ?');
    stmt.run(nextRun, id);
  }

  deleteSchedule(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM schedules WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  listSchedules(createdBy?: string): Schedule[] {
    if (createdBy) {
      const stmt = this.db.prepare('SELECT * FROM schedules WHERE created_by = ? ORDER BY created_at DESC');
      const rows = stmt.all(createdBy) as any[];
      return rows.map((row) => this.rowToSchedule(row));
    }
    const stmt = this.db.prepare('SELECT * FROM schedules ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToSchedule(row));
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

  close(): void {
    this.db.close();
  }
}
