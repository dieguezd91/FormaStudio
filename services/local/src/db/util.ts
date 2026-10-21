import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const newId = (prefix: string): string => `${prefix}_${randomUUID()}`;

export const nowIso = (): string => new Date().toISOString();

/**
 * Runs `fn` atomically. `node:sqlite` is synchronous, so `fn` must not await; that also keeps
 * concurrent requests from interleaving inside a transaction. Re-entrant calls join the outer one.
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const toJson = (value: unknown): string => JSON.stringify(value);

export const fromJson = <T>(text: unknown): T => JSON.parse(text as string) as T;
