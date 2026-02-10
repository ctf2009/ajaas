import { Storage } from './interface.js';
import { SQLiteStorage } from './sqlite.js';
import { PostgresStorage } from './postgres.js';

export interface StorageOptions {
  path: string;
  dataEncryptionKey?: string;
}

/**
 * Creates a storage instance based on the connection URL.
 * - URLs starting with 'postgresql://' or 'postgres://' create PostgreSQL storage
 * - All other values are treated as SQLite database paths (or ':memory:')
 */
export async function createStorage(options: StorageOptions): Promise<Storage> {
  const { path: connectionUrl, dataEncryptionKey } = options;

  if (!dataEncryptionKey) {
    console.warn(
      'WARNING: DATA_ENCRYPTION_KEY not set. Sensitive schedule data (e.g. email addresses) will be stored unencrypted.'
    );
  }

  if (connectionUrl.startsWith('postgresql://') || connectionUrl.startsWith('postgres://')) {
    const storage = new PostgresStorage(connectionUrl, dataEncryptionKey);
    await storage.initialize();
    console.log('Storage backend: PostgreSQL');
    return storage;
  }

  // Default to SQLite (file path or ':memory:')
  console.log('Storage backend: SQLite');
  return new SQLiteStorage(connectionUrl, dataEncryptionKey);
}
