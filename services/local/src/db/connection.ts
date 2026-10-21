import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';

/** Opens (creating if needed) a database with foreign keys on and all migrations applied. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
