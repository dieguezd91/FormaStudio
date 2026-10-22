import type { AiProvider } from '@forma/ai';
import {
  parseDocument,
  validateDocument,
  type FormaDocument,
  type ValidationIssue,
} from '@forma/design-core';
import { notFound, revisionConflict, unprocessable, type ErrorIssue } from '../errors';
import type { Project, Repository, StoredDocument } from '../db';
import type { AiLimits } from '../ai/limits';

export interface RouteContext {
  repo: Repository;
  maxSourceBytes: number;
  /** `null` when no API key is configured: AI routes answer 503, everything else works. */
  ai: AiProvider | null;
  aiLimits: AiLimits;
  /** Folder of the Unity package `com.forma.studio` that exported projects reference. */
  unityPackagePath: string;
}

export interface ProjectParams {
  Params: { id: string };
}

export function requireProject(repo: Repository, projectId: string): Project {
  const project = repo.projects.get(projectId);
  if (!project) throw notFound('Project');
  return project;
}

export function currentDocument(repo: Repository, projectId: string): StoredDocument {
  const stored = repo.documents.get(projectId);
  if (!stored) throw notFound('Document');
  return stored;
}

/** Optimistic concurrency: a supplied base revision must match the stored one. */
export function assertRevision(current: StoredDocument, baseRevision: number | undefined): void {
  if (baseRevision !== undefined && baseRevision !== current.revision) {
    throw revisionConflict(current.revision);
  }
}

const toErrorIssue = (issue: ValidationIssue): ErrorIssue => ({
  path: [issue.screenId, issue.nodeId].filter(Boolean).join('/'),
  message: `${issue.code}: ${issue.message}`,
});

/** Parses (migrating if needed) and structurally validates an untrusted document, or throws 422. */
export function parseValidDocument(raw: unknown): FormaDocument {
  const parsed = parseDocument(raw);
  if (!parsed.ok) {
    throw unprocessable('invalidDocument', parsed.error.message, parsed.error.issues);
  }
  const issues = validateDocument(parsed.value);
  if (issues.length > 0) {
    throw unprocessable(
      'invalidDocument',
      `Document is structurally invalid (${issues.length} issue(s)).`,
      issues.map(toErrorIssue),
    );
  }
  return parsed.value;
}
