import type { DatabaseSync } from 'node:sqlite';
import type { FormaDocument, Operation, OperationBatch } from '@forma/design-core';
import { touchProject } from './projects';
import { fromJson, nowIso, toJson } from './util';

export interface StoredDocument {
  document: FormaDocument;
  revision: number;
}

export interface OperationLogEntry {
  id: string;
  label: string;
  source: OperationBatch['source'];
  ops: Operation[];
  revision: number;
  createdAt: string;
}

interface LogRow {
  id: string;
  label: string;
  source: OperationBatch['source'];
  ops: string;
  revision: number;
  created_at: string;
}

/** The current design document of each project plus the log of operation batches applied to it. */
export function createDocumentsRepo(db: DatabaseSync) {
  const get = (projectId: string): StoredDocument | undefined => {
    const row = db
      .prepare('SELECT document, revision FROM documents WHERE project_id = ?')
      .get(projectId) as unknown as { document: string; revision: number } | undefined;
    return row && { document: fromJson<FormaDocument>(row.document), revision: row.revision };
  };

  return {
    get,

    /** Inserts the first document (revision 1) of a project. */
    create(projectId: string, document: FormaDocument): StoredDocument {
      db.prepare(
        'INSERT INTO documents (project_id, revision, document, updated_at) VALUES (?, 1, ?, ?)',
      ).run(projectId, toJson(document), nowIso());
      return { document, revision: 1 };
    },

    /** Stores `document` as the next revision. Callers check the base revision first. */
    replace(projectId: string, document: FormaDocument): StoredDocument {
      const now = nowIso();
      db.prepare(
        'UPDATE documents SET document = ?, revision = revision + 1, updated_at = ? WHERE project_id = ?',
      ).run(toJson(document), now, projectId);
      touchProject(db, projectId);
      return get(projectId)!;
    },

    appendLog(projectId: string, batch: OperationBatch, revision: number): void {
      db.prepare(
        `INSERT INTO operation_log (project_id, id, label, source, ops, revision, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(projectId, batch.id, batch.label, batch.source, toJson(batch.ops), revision, nowIso());
    },

    listLog(projectId: string): OperationLogEntry[] {
      const rows = db
        .prepare('SELECT * FROM operation_log WHERE project_id = ? ORDER BY seq')
        .all(projectId) as unknown as LogRow[];
      return rows.map((row) => ({
        id: row.id,
        label: row.label,
        source: row.source,
        ops: fromJson<Operation[]>(row.ops),
        revision: row.revision,
        createdAt: row.created_at,
      }));
    },
  };
}
