import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './connection';
import { createDocumentsRepo } from './documents';
import { createExportsRepo } from './exports';
import { createProjectsRepo } from './projects';
import { createProposalsRepo } from './proposals';
import { createRequirementsRepo } from './requirements';
import { createSourcesRepo } from './sources';
import { transaction } from './util';
import { createVersionsRepo } from './versions';

export type { StoredDocument, OperationLogEntry } from './documents';
export type { ExportMeta, NewExport } from './exports';
export type { Project } from './projects';
export type { Proposal, ProposalMeta, ProposalOrigin, ProposalStatus } from './proposals';
export type { Source, SourceChange, SourceMeta } from './sources';
export type { Version, VersionMeta, VersionStatus } from './versions';

/** Everything the routes need from SQLite; the only place that touches `DatabaseSync` directly. */
export function createRepository(db: DatabaseSync) {
  return {
    projects: createProjectsRepo(db),
    documents: createDocumentsRepo(db),
    versions: createVersionsRepo(db),
    sources: createSourcesRepo(db),
    requirements: createRequirementsRepo(db),
    proposals: createProposalsRepo(db),
    exports: createExportsRepo(db),
    /** Runs a synchronous callback atomically (see `transaction`). */
    transaction: <T>(fn: () => T): T => transaction(db, fn),
    close: (): void => db.close(),
  };
}

export type Repository = ReturnType<typeof createRepository>;

export function openRepository(dbPath: string): Repository {
  return createRepository(openDatabase(dbPath));
}
