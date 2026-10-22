import type { DatabaseSync } from 'node:sqlite';
import { touchProject } from './projects';
import { fromJson, newId, nowIso, toJson } from './util';

export interface ExportMeta {
  id: string;
  screenId: string;
  target: string;
  unityProjectPath: string;
  outputFolder: string;
  documentRevision: number;
  /** Paths relative to the Unity project. */
  written: string[];
  createdAt: string;
}

export interface NewExport {
  screenId: string;
  target: string;
  unityProjectPath: string;
  outputFolder: string;
  documentRevision: number;
  bundle: unknown;
  written: string[];
}

interface ExportRow {
  id: string;
  screen_id: string;
  target: string;
  unity_project_path: string;
  output_folder: string;
  document_revision: number;
  written: string;
  created_at: string;
}

const META_COLUMNS =
  'id, screen_id, target, unity_project_path, output_folder, document_revision, written, created_at';

const toMeta = (row: ExportRow): ExportMeta => ({
  id: row.id,
  screenId: row.screen_id,
  target: row.target,
  unityProjectPath: row.unity_project_path,
  outputFolder: row.output_folder,
  documentRevision: row.document_revision,
  written: fromJson<string[]>(row.written),
  createdAt: row.created_at,
});

/** Records of what was written to Unity projects; the stored bundle feeds the re-export diff. */
export function createExportsRepo(db: DatabaseSync) {
  return {
    create(projectId: string, input: NewExport): ExportMeta {
      const id = newId('exp');
      db.prepare(
        `INSERT INTO exports (id, project_id, screen_id, target, unity_project_path, output_folder, document_revision, bundle, written, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        projectId,
        input.screenId,
        input.target,
        input.unityProjectPath,
        input.outputFolder,
        input.documentRevision,
        toJson(input.bundle),
        toJson(input.written),
        nowIso(),
      );
      touchProject(db, projectId);
      const row = db
        .prepare(`SELECT ${META_COLUMNS} FROM exports WHERE id = ?`)
        .get(id) as unknown as ExportRow;
      return toMeta(row);
    },

    /** Newest first, without bundle payloads. */
    list(projectId: string): ExportMeta[] {
      const rows = db
        .prepare(
          `SELECT ${META_COLUMNS} FROM exports WHERE project_id = ? ORDER BY created_at DESC, rowid DESC`,
        )
        .all(projectId) as unknown as ExportRow[];
      return rows.map(toMeta);
    },

    /** The bundle of the most recent export of a screen for a target, if any. */
    lastBundle<B>(projectId: string, screenId: string, target: string): B | undefined {
      const row = db
        .prepare(
          `SELECT bundle FROM exports WHERE project_id = ? AND screen_id = ? AND target = ?
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(projectId, screenId, target) as unknown as { bundle: string } | undefined;
      return row && fromJson<B>(row.bundle);
    },
  };
}
