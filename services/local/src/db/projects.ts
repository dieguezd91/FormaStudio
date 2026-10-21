import type { DatabaseSync } from 'node:sqlite';
import type { Target } from '@forma/design-core';
import { fromJson, newId, nowIso, toJson } from './util';

export interface Project {
  id: string;
  name: string;
  target: Target;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  target: string;
  created_at: string;
  updated_at: string;
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  target: fromJson<Target>(row.target),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Marks a project as recently changed; every mutation of project-owned data calls this. */
export function touchProject(db: DatabaseSync, projectId: string): void {
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(nowIso(), projectId);
}

export function createProjectsRepo(db: DatabaseSync) {
  const get = (id: string): Project | undefined => {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as
      ProjectRow | undefined;
    return row && toProject(row);
  };

  return {
    get,

    create(input: { name: string; target: Target }): Project {
      const id = newId('prj');
      const now = nowIso();
      db.prepare(
        'INSERT INTO projects (id, name, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(id, input.name, toJson(input.target), now, now);
      return get(id)!;
    },

    list(): Project[] {
      const rows = db
        .prepare('SELECT * FROM projects ORDER BY updated_at DESC, rowid DESC')
        .all() as unknown as ProjectRow[];
      return rows.map(toProject);
    },

    rename(id: string, name: string): Project | undefined {
      const { changes } = db
        .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
        .run(name, nowIso(), id);
      return changes ? get(id) : undefined;
    },

    /** Cascades to every project-owned row; returns false when the project does not exist. */
    delete(id: string): boolean {
      return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
    },
  };
}
