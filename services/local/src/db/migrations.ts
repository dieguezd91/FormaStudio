import type { DatabaseSync } from 'node:sqlite';
import { nowIso, transaction } from './util';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Append-only and strictly numbered; never edit a migration that has shipped. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        target TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_projects_updated_at ON projects(updated_at DESC);

      CREATE TABLE documents (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        document TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE operation_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        label TEXT NOT NULL,
        source TEXT NOT NULL,
        ops TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_operation_log_project ON operation_log(project_id, seq);

      CREATE TABLE versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        label TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'superseded')),
        document_revision INTEGER NOT NULL,
        document TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (project_id, number)
      );
      CREATE UNIQUE INDEX idx_versions_one_approved ON versions(project_id) WHERE status = 'approved';

      CREATE TABLE blobs (
        sha256 TEXT PRIMARY KEY,
        data BLOB NOT NULL
      );

      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        content TEXT,
        blob_sha256 TEXT REFERENCES blobs(sha256),
        size_bytes INTEGER NOT NULL,
        scope_level TEXT NOT NULL,
        scope_target_id TEXT,
        intent TEXT NOT NULL,
        provenance TEXT NOT NULL,
        source_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_sources_project ON sources(project_id, created_at);
      CREATE INDEX idx_sources_blob ON sources(blob_sha256);

      CREATE TABLE source_changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        source_version INTEGER NOT NULL,
        change TEXT NOT NULL CHECK (change IN ('updated', 'deleted')),
        changed_at TEXT NOT NULL
      );
      CREATE INDEX idx_source_changes_project ON source_changes(project_id, changed_at);

      CREATE TABLE requirements (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        position INTEGER NOT NULL,
        text TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        source_refs TEXT NOT NULL,
        PRIMARY KEY (project_id, id)
      );

      CREATE TABLE proposals (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        rationale TEXT NOT NULL,
        document TEXT NOT NULL,
        origin TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('candidate', 'adopted', 'discarded')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_proposals_project ON proposals(project_id, created_at);
    `,
  },
];

export function migrate(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = (
    db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
      version: number;
    }[]
  ).map((row) => row.version);
  const latest = migrations.at(-1)?.version ?? 0;
  if (applied.some((version) => version > latest)) {
    throw new Error('Database was created by a newer version of Forma Studio.');
  }
  for (const migration of migrations) {
    if (applied.includes(migration.version)) continue;
    transaction(db, () => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        nowIso(),
      );
    });
  }
}
