import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { touchProject } from './projects';
import { fromJson, newId, nowIso, toJson } from './util';

export interface SourceScope {
  level: 'project' | 'screen' | 'node' | 'proposal';
  targetId?: string | undefined;
}

export interface SourceMeta {
  id: string;
  kind: 'document' | 'reference';
  title: string;
  mimeType: string;
  scope: SourceScope;
  intent: string[];
  provenance: Record<string, string | undefined>;
  sourceVersion: number;
  sizeBytes: number;
  hasBlob: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Source extends SourceMeta {
  content: string | null;
}

export interface SourceChange {
  sourceId: string;
  sourceVersion: number;
  change: 'updated' | 'deleted';
  changedAt: string;
}

export interface NewSource {
  kind: SourceMeta['kind'];
  title: string;
  mimeType: string;
  content?: string | undefined;
  data?: Buffer | undefined;
  scope: SourceScope;
  intent: string[];
  provenance: Record<string, string | undefined>;
}

export interface SourceReplacement {
  title?: string | undefined;
  mimeType?: string | undefined;
  content?: string | undefined;
  data?: Buffer | undefined;
}

interface SourceRow {
  id: string;
  kind: SourceMeta['kind'];
  title: string;
  mime_type: string;
  content: string | null;
  blob_sha256: string | null;
  size_bytes: number;
  scope_level: SourceScope['level'];
  scope_target_id: string | null;
  intent: string;
  provenance: string;
  source_version: number;
  created_at: string;
  updated_at: string;
}

const toMeta = (row: SourceRow): SourceMeta => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  mimeType: row.mime_type,
  scope: {
    level: row.scope_level,
    ...(row.scope_target_id === null ? {} : { targetId: row.scope_target_id }),
  },
  intent: fromJson<string[]>(row.intent),
  provenance: fromJson<SourceMeta['provenance']>(row.provenance),
  sourceVersion: row.source_version,
  sizeBytes: row.size_bytes,
  hasBlob: row.blob_sha256 !== null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const sizeOf = (content: string | undefined, data: Buffer | undefined): number =>
  data ? data.length : content === undefined ? 0 : Buffer.byteLength(content);

/**
 * Documentation and references of a project. Binary payloads live in the `blobs` table keyed by
 * SHA-256 (deduplicated, transactional with the metadata, identical in memory and on disk).
 */
export function createSourcesRepo(db: DatabaseSync) {
  const getRow = (projectId: string, sourceId: string): SourceRow | undefined =>
    db
      .prepare('SELECT * FROM sources WHERE project_id = ? AND id = ?')
      .get(projectId, sourceId) as unknown as SourceRow | undefined;

  /** Stores the bytes (once per distinct content) and returns their hash. */
  const putBlob = (data: Buffer): string => {
    const sha256 = createHash('sha256').update(data).digest('hex');
    db.prepare('INSERT OR IGNORE INTO blobs (sha256, data) VALUES (?, ?)').run(sha256, data);
    return sha256;
  };

  const pruneBlobs = (): void => {
    db.exec(
      'DELETE FROM blobs WHERE sha256 NOT IN (SELECT blob_sha256 FROM sources WHERE blob_sha256 IS NOT NULL)',
    );
  };

  const recordChange = (
    projectId: string,
    sourceId: string,
    sourceVersion: number,
    change: SourceChange['change'],
  ): void => {
    db.prepare(
      `INSERT INTO source_changes (project_id, source_id, source_version, change, changed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(projectId, sourceId, sourceVersion, change, nowIso());
  };

  return {
    pruneBlobs,

    create(projectId: string, input: NewSource): SourceMeta {
      const id = newId('src');
      const now = nowIso();
      const sha256 = input.data ? putBlob(input.data) : null;
      db.prepare(
        `INSERT INTO sources (id, project_id, kind, title, mime_type, content, blob_sha256, size_bytes,
           scope_level, scope_target_id, intent, provenance, source_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        id,
        projectId,
        input.kind,
        input.title,
        input.mimeType,
        input.content ?? null,
        sha256,
        sizeOf(input.content, input.data),
        input.scope.level,
        input.scope.targetId ?? null,
        toJson(input.intent),
        toJson(input.provenance),
        now,
        now,
      );
      touchProject(db, projectId);
      return toMeta(getRow(projectId, id)!);
    },

    list(projectId: string): SourceMeta[] {
      const rows = db
        .prepare('SELECT * FROM sources WHERE project_id = ? ORDER BY created_at, rowid')
        .all(projectId) as unknown as SourceRow[];
      return rows.map(toMeta);
    },

    get(projectId: string, sourceId: string): Source | undefined {
      const row = getRow(projectId, sourceId);
      return row && { ...toMeta(row), content: row.content };
    },

    getBlob(projectId: string, sourceId: string): { mimeType: string; data: Buffer } | undefined {
      const row = db
        .prepare(
          `SELECT s.mime_type AS mime_type, b.data AS data FROM sources s
           JOIN blobs b ON b.sha256 = s.blob_sha256 WHERE s.project_id = ? AND s.id = ?`,
        )
        .get(projectId, sourceId) as unknown as { mime_type: string; data: Uint8Array } | undefined;
      return row && { mimeType: row.mime_type, data: Buffer.from(row.data) };
    },

    /** Replaces the payload, bumps `sourceVersion` and logs the change for the AI layer (§5.5). */
    replace(projectId: string, sourceId: string, input: SourceReplacement): SourceMeta | undefined {
      const current = getRow(projectId, sourceId);
      if (!current) return undefined;
      const sha256 = input.data ? putBlob(input.data) : null;
      const version = current.source_version + 1;
      db.prepare(
        `UPDATE sources SET title = ?, mime_type = ?, content = ?, blob_sha256 = ?, size_bytes = ?,
           source_version = ?, updated_at = ? WHERE project_id = ? AND id = ?`,
      ).run(
        input.title ?? current.title,
        input.mimeType ?? current.mime_type,
        input.content ?? null,
        sha256,
        sizeOf(input.content, input.data),
        version,
        nowIso(),
        projectId,
        sourceId,
      );
      recordChange(projectId, sourceId, version, 'updated');
      pruneBlobs();
      touchProject(db, projectId);
      return toMeta(getRow(projectId, sourceId)!);
    },

    delete(projectId: string, sourceId: string): boolean {
      const current = getRow(projectId, sourceId);
      if (!current) return false;
      db.prepare('DELETE FROM sources WHERE project_id = ? AND id = ?').run(projectId, sourceId);
      recordChange(projectId, sourceId, current.source_version, 'deleted');
      pruneBlobs();
      touchProject(db, projectId);
      return true;
    },

    /** Changes strictly after `since` (an ISO instant), oldest first. */
    listChanges(projectId: string, since?: string): SourceChange[] {
      const rows = db
        .prepare(
          `SELECT source_id, source_version, change, changed_at FROM source_changes
           WHERE project_id = ? AND changed_at > ? ORDER BY seq`,
        )
        .all(projectId, since ?? '') as unknown as {
        source_id: string;
        source_version: number;
        change: SourceChange['change'];
        changed_at: string;
      }[];
      return rows.map((row) => ({
        sourceId: row.source_id,
        sourceVersion: row.source_version,
        change: row.change,
        changedAt: row.changed_at,
      }));
    },
  };
}
