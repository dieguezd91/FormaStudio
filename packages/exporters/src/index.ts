export const EXPORT_TARGETS = ['unity-ugui', 'unity-uitoolkit', 'web-react'] as const;

export type ExportTargetId = (typeof EXPORT_TARGETS)[number];

export interface ExportResult {
  /** Relative output path to file contents. */
  files: Record<string, string>;
}

export interface Exporter {
  readonly target: ExportTargetId;
  export(document: unknown): Promise<ExportResult>;
}
