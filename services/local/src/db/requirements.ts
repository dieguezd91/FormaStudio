import type { DatabaseSync } from 'node:sqlite';
import type { Requirement } from '../schemas';
import { touchProject } from './projects';
import { fromJson, toJson } from './util';

interface RequirementRow {
  id: string;
  text: string;
  kind: Requirement['kind'];
  status: Requirement['status'];
  source_refs: string;
}

/** Requirements extracted by the AI layer (§5.2, §6.6); always replaced as a whole set. */
export function createRequirementsRepo(db: DatabaseSync) {
  const list = (projectId: string): Requirement[] => {
    const rows = db
      .prepare('SELECT * FROM requirements WHERE project_id = ? ORDER BY position')
      .all(projectId) as unknown as RequirementRow[];
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      kind: row.kind,
      status: row.status,
      sourceRefs: fromJson<Requirement['sourceRefs']>(row.source_refs),
    }));
  };

  return {
    list,

    replaceAll(projectId: string, requirements: Requirement[]): Requirement[] {
      db.prepare('DELETE FROM requirements WHERE project_id = ?').run(projectId);
      const insert = db.prepare(
        `INSERT INTO requirements (project_id, id, position, text, kind, status, source_refs)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      requirements.forEach((r, position) =>
        insert.run(projectId, r.id, position, r.text, r.kind, r.status, toJson(r.sourceRefs)),
      );
      touchProject(db, projectId);
      return list(projectId);
    },
  };
}
