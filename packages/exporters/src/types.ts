import type { FormaDocument, Result } from '@forma/design-core';
import type { CompatibilityReport } from './report';

export const EXPORT_TARGETS = ['unity-ugui', 'unity-uitoolkit', 'web-react'] as const;

export type ExportTargetId = (typeof EXPORT_TARGETS)[number];

/** Project facts and the clock come from the caller so exports are deterministic. */
export interface ExportMeta {
  projectId: string;
  projectName: string;
  documentRevision: number;
  /** ISO timestamp. */
  exportedAt: string;
}

export interface ExportFile {
  /** Relative output path. */
  path: string;
  contents: string;
}

export interface ExportOutput<B = unknown> {
  bundle: B;
  report: CompatibilityReport;
  files: ExportFile[];
}

export type ExportErrorCode = 'invalidDocument' | 'screenNotFound' | 'notImplemented';

export interface ExportError {
  code: ExportErrorCode;
  /** Spanish, user-facing. */
  reasons: string[];
}

export interface Exporter<B = unknown> {
  readonly target: ExportTargetId;
  /** The compatibility report, available before exporting anything. */
  analyze(document: FormaDocument, screenId: string): CompatibilityReport;
  export(
    document: FormaDocument,
    screenId: string,
    meta: ExportMeta,
  ): Result<ExportOutput<B>, ExportError>;
}
