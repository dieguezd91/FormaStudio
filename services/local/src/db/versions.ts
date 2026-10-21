import type { DatabaseSync } from 'node:sqlite';
import type { FormaDocument } from '@forma/design-core';
import { touchProject } from './projects';
import { fromJson, newId, nowIso, toJson } from './util';

export type VersionStatus = 'draft' | 'approved' | 'superseded';

export interface VersionMeta {
  id: string;
  number: number;
  label: string;
  note: string | null;
  status: VersionStatus;
  documentRevision: number;
  createdAt: string;
}

export interface Version extends VersionMeta {
  document: FormaDocument;
}

interface VersionRow {
  id: string;
  number: number;
  label: string;
  note: string | null;
  status: VersionStatus;
  document_revision: number;
  document: string;
  created_at: string;
}

const META_COLUMNS = 'id, number, label, note, status, document_revision, created_at';

const toMeta = (row: Omit<VersionRow, 'document'>): VersionMeta => ({
  id: row.id,
  number: row.number,
  label: row.label,
  note: row.note,
  status: row.status,
  documentRevision: row.document_revision,
  createdAt: row.created_at,
});

/** Identifiable snapshots of a project's document (design doc §12.2). */
export function createVersionsRepo(db: DatabaseSync) {
  const getMeta = (projectId: string, versionId: string): VersionMeta | undefined => {
    const row = db
      .prepare(`SELECT ${META_COLUMNS} FROM versions WHERE project_id = ? AND id = ?`)
      .get(projectId, versionId) as unknown as Omit<VersionRow, 'document'> | undefined;
    return row && toMeta(row);
  };

  return {
    create(
      projectId: string,
      input: {
        label: string;
        note?: string | undefined;
        document: FormaDocument;
        documentRevision: number;
      },
    ): VersionMeta {
      const id = newId('ver');
      const next = db
        .prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM versions WHERE project_id = ?')
        .get(projectId) as unknown as { n: number };
      db.prepare(
        `INSERT INTO versions (id, project_id, number, label, note, status, document_revision, document, created_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      ).run(
        id,
        projectId,
        next.n,
        input.label,
        input.note ?? null,
        input.documentRevision,
        toJson(input.document),
        nowIso(),
      );
      touchProject(db, projectId);
      return getMeta(projectId, id)!;
    },

    list(projectId: string): VersionMeta[] {
      const rows = db
        .prepare(`SELECT ${META_COLUMNS} FROM versions WHERE project_id = ? ORDER BY number DESC`)
        .all(projectId) as unknown as Omit<VersionRow, 'document'>[];
      return rows.map(toMeta);
    },

    get(projectId: string, versionId: string): Version | undefined {
      const row = db
        .prepare('SELECT * FROM versions WHERE project_id = ? AND id = ?')
        .get(projectId, versionId) as unknown as VersionRow | undefined;
      return row && { ...toMeta(row), document: fromJson<FormaDocument>(row.document) };
    },

    /** Approves a version, superseding the project's previously approved one. */
    approve(projectId: string, versionId: string): VersionMeta | undefined {
      if (!getMeta(projectId, versionId)) return undefined;
      db.prepare(
        "UPDATE versions SET status = 'superseded' WHERE project_id = ? AND status = 'approved' AND id <> ?",
      ).run(projectId, versionId);
      db.prepare("UPDATE versions SET status = 'approved' WHERE project_id = ? AND id = ?").run(
        projectId,
        versionId,
      );
      touchProject(db, projectId);
      return getMeta(projectId, versionId);
    },
  };
}
