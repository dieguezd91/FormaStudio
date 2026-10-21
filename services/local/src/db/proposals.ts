import type { DatabaseSync } from 'node:sqlite';
import type { FormaDocument } from '@forma/design-core';
import type { Rationale } from '../schemas';
import { touchProject } from './projects';
import { fromJson, newId, nowIso, toJson } from './util';

export type ProposalStatus = 'candidate' | 'adopted' | 'discarded';
export type ProposalOrigin = 'ai' | 'library' | 'manual';

export interface ProposalMeta {
  id: string;
  title: string;
  summary: string;
  rationale: Rationale;
  origin: ProposalOrigin;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal extends ProposalMeta {
  document: FormaDocument;
}

export interface NewProposal {
  title: string;
  summary: string;
  rationale: Rationale;
  origin: ProposalOrigin;
  document: FormaDocument;
}

interface ProposalRow {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  document: string;
  origin: ProposalOrigin;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
}

const META_COLUMNS = 'id, title, summary, rationale, origin, status, created_at, updated_at';

const toMeta = (row: Omit<ProposalRow, 'document'>): ProposalMeta => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  rationale: fromJson<Rationale>(row.rationale),
  origin: row.origin,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * AI/library/manual proposals. There is deliberately no delete: discarding only changes the
 * status, so no proposal is lost irreversibly (§6.5). Rows disappear only with their project.
 */
export function createProposalsRepo(db: DatabaseSync) {
  const getMeta = (projectId: string, proposalId: string): ProposalMeta | undefined => {
    const row = db
      .prepare(`SELECT ${META_COLUMNS} FROM proposals WHERE project_id = ? AND id = ?`)
      .get(projectId, proposalId) as unknown as Omit<ProposalRow, 'document'> | undefined;
    return row && toMeta(row);
  };

  return {
    create(projectId: string, input: NewProposal): ProposalMeta {
      const id = newId('prop');
      const now = nowIso();
      db.prepare(
        `INSERT INTO proposals (id, project_id, title, summary, rationale, document, origin, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?)`,
      ).run(
        id,
        projectId,
        input.title,
        input.summary,
        toJson(input.rationale),
        toJson(input.document),
        input.origin,
        now,
        now,
      );
      touchProject(db, projectId);
      return getMeta(projectId, id)!;
    },

    list(projectId: string, status?: ProposalStatus): ProposalMeta[] {
      const rows = db
        .prepare(
          `SELECT ${META_COLUMNS} FROM proposals
           WHERE project_id = ? AND (? IS NULL OR status = ?) ORDER BY created_at, rowid`,
        )
        .all(projectId, status ?? null, status ?? null) as unknown as Omit<
        ProposalRow,
        'document'
      >[];
      return rows.map(toMeta);
    },

    get(projectId: string, proposalId: string): Proposal | undefined {
      const row = db
        .prepare('SELECT * FROM proposals WHERE project_id = ? AND id = ?')
        .get(projectId, proposalId) as unknown as ProposalRow | undefined;
      return row && { ...toMeta(row), document: fromJson<FormaDocument>(row.document) };
    },

    setStatus(
      projectId: string,
      proposalId: string,
      status: ProposalStatus,
    ): ProposalMeta | undefined {
      const { changes } = db
        .prepare('UPDATE proposals SET status = ?, updated_at = ? WHERE project_id = ? AND id = ?')
        .run(status, nowIso(), projectId, proposalId);
      if (!changes) return undefined;
      touchProject(db, projectId);
      return getMeta(projectId, proposalId);
    },
  };
}
