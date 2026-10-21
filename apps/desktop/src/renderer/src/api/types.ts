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
