import { Storage } from './interface.js';
import { SQLiteStorage } from './sqlite.js';
import { PostgresStorage } from './postgres.js';

export interface StorageOptions {
  connectionUrl: string;
  dataEncryptionKey?: string;
}

/**
 * Creates a storage instance based on the connection URL.
 * - URLs starting with 'postgresql://' or 'postgres://' create PostgreSQL storage
 * - All other values are treated as SQLite database paths (or ':memory:')
 */
export async function createStorage(options: StorageOptions): Promise<Storage> {
  const { connectionUrl, dataEncryptionKey } = options;

  if (connectionUrl.startsWith('postgresql://') || connectionUrl.startsWith('postgres://')) {
    const storage = new PostgresStorage(connectionUrl, dataEncryptionKey);
    await storage.initialize();
    return storage;
  }

  // Default to SQLite (file path or ':memory:')
  return new SQLiteStorage(connectionUrl, dataEncryptionKey);
}
