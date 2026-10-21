import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection';

describe('migrations', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('records applied migrations in schema_migrations in order', () => {
    const db = openDatabase(':memory:');
    const rows = db
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all() as { version: number; name: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.version)).toEqual(rows.map((_, i) => i + 1));
    db.close();
  });

  it('does not reapply migrations when reopening a database file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forma-mig-'));
    dirs.push(dir);
    const file = join(dir, 'forma.sqlite');
    const first = openDatabase(file);
    const before = first.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {
      n: number;
    };
    first.close();
    const second = openDatabase(file);
    const after = second.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {
      n: number;
    };
    second.close();
    expect(after.n).toBe(before.n);
  });

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    db.close();
  });
});
