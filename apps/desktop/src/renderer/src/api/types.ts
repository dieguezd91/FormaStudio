import type { FormaDocument, OperationBatch, Target } from '@forma/design-core';

export interface Project {
  id: string;
  name: string;
  target: Target;
  createdAt: string;
  updatedAt: string;
}

export interface StoredDocument {
  document: FormaDocument;
  revision: number;
}

export type SourceKind = 'document' | 'reference';
export type SourceScopeLevel = 'project' | 'screen' | 'node';
export type SourceIntent = 'structure' | 'interaction' | 'hierarchy' | 'visual-style' | 'inspiration';

export interface SourceScope {
  level: SourceScopeLevel | 'proposal';
  targetId?: string;
}

export interface SourceProvenance {
  url?: string;
  author?: string;
  license?: string;
  notes?: string;
}

export interface SourceMeta {
  id: string;
  kind: SourceKind;
  title: string;
  mimeType: string;
  scope: SourceScope;
  intent: SourceIntent[];
  provenance: SourceProvenance;
  sourceVersion: number;
  sizeBytes: number;
  hasBlob: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewSource {
  kind: SourceKind;
  title: string;
  mimeType: string;
  /** Text payload; mutually exclusive with `dataBase64`. */
  content?: string;
  dataBase64?: string;
  scope: SourceScope;
  intent?: SourceIntent[];
  provenance?: SourceProvenance;
}

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

export type { OperationBatch };

// AI (requirements, proposals, edit previews, impact)
export type RequirementKind = 'goal' | 'data' | 'flow' | 'constraint' | 'interaction';
export type RequirementStatus = 'confirmed' | 'assumed' | 'contradiction' | 'gap';

export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
  status: RequirementStatus;
  sourceRefs: { sourceId: string; sourceVersion: number; excerpt: string }[];
}

/** A non-fatal remark next to an AI result; `message` is Spanish. */
export interface AiWarning {
  code: string;
  message: string;
  sourceId?: string;
  requirementId?: string;
  proposalId?: string;
}

export interface RequirementsResult {
  requirements: Requirement[];
  warnings: AiWarning[];
  usedSources: { id: string; title: string; type: 'text' | 'image'; sourceVersion: number }[];
}

export type ProposalStatus = 'candidate' | 'adopted' | 'discarded';

export interface Rationale {
  need: string;
  patterns: string[];
  tradeoffs: string[];
  fromReferences: string[];
  requirementIds: string[];
}

export interface ProposalMeta {
  id: string;
  title: string;
  summary: string;
  rationale: Rationale;
  origin: 'ai' | 'library' | 'manual';
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal extends ProposalMeta {
  document: FormaDocument;
}

export interface ProposalsRequest {
  screenId?: string;
  count?: number;
  brief?: string;
}

export interface ProposalsResult {
  proposals: ProposalMeta[];
  warnings: AiWarning[];
}

export interface EditRequest {
  instruction: string;
  screenId: string;
  selectedNodeIds: string[];
  proposalIds?: string[];
}

export interface EditPreview {
  /** Revision the batch was computed against. */
  baseRevision: number;
  batch: OperationBatch;
  /** One line per change, as described by the service. */
  changes: string[];
  explanation: string;
  warnings: AiWarning[];
}

export interface SourceImpact {
  change: { sourceId: string; sourceVersion: number; change: 'updated' | 'deleted'; changedAt: string };
  requirements: { id: string; text: string; status: RequirementStatus; referencedVersion: number }[];
  proposals: { id: string; title: string; status: string; requirementIds: string[] }[];
  screens: { screenId: string; name: string; proposalId: string; inCurrentDocument: boolean }[];
}

export interface ImpactReport {
  since: string | null;
  impacts: SourceImpact[];
}
