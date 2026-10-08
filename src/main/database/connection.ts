import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class DatabaseOpenError extends Error {
  public constructor(cause: unknown) {
    super('No se pudo abrir la base de datos local.', { cause });
    this.name = 'DatabaseOpenError';
  }
}

export function openSqliteDatabase(filePath: string): Database.Database {
  let database: Database.Database | null = null;

  try {
    if (filePath !== ':memory:' && !existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true });
    }

    database = new Database(filePath, { timeout: 5_000 });
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('journal_mode = WAL');
    return database;
  } catch (error: unknown) {
    if (database?.open) {
      database.close();
    }
    throw new DatabaseOpenError(error);
  }
}
