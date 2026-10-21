import { summarizeIssues, zodIssues, type Issue } from './issues';
import type { Result } from './result';
import { formaDocumentSchema, SCHEMA_VERSION, type FormaDocument } from './schema';

export type DocumentErrorCode =
  | 'notAnObject'
  | 'missingVersion'
  | 'invalidVersion'
  | 'unsupportedVersion'
  | 'migrationFailed'
  | 'invalidDocument';

export type DocumentIssue = Issue;

export interface DocumentError {
  code: DocumentErrorCode;
  message: string;
  issues?: DocumentIssue[];
}

/** Upgrades a raw document from version N to N + 1. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
/** Keyed by the schemaVersion a migration upgrades *from*. */
export type MigrationRegistry = Record<number, Migration>;

/** Only v1 exists today; add `1: migrateV1ToV2` here when the schema changes. */
export const migrations: MigrationRegistry = {};

export interface MigrateOptions {
  registry?: MigrationRegistry;
  target?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const fail = (code: DocumentErrorCode, message: string): Result<never, DocumentError> => ({
  ok: false,
  error: { code, message },
});

/** Upgrades raw JSON to the target schema version without validating its shape. */
export function migrateDocument(
  raw: unknown,
  { registry = migrations, target = SCHEMA_VERSION }: MigrateOptions = {},
): Result<Record<string, unknown>, DocumentError> {
  if (!isRecord(raw)) return fail('notAnObject', 'A document must be a JSON object.');
  const version = raw.schemaVersion;
  if (version === undefined) return fail('missingVersion', 'Document has no schemaVersion.');
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail(
      'invalidVersion',
      `schemaVersion must be a positive integer, got ${String(version)}.`,
    );
  }
  if (version > target) {
    return fail(
      'unsupportedVersion',
      `Document schemaVersion ${version} is newer than the supported version ${target}; update Forma Studio to open it.`,
    );
  }

  let current = raw;
  for (let v = version; v < target; v++) {
    const migration = registry[v];
    if (!migration) {
      return fail(
        'unsupportedVersion',
        `No migration registered from schemaVersion ${v} to ${v + 1}.`,
      );
    }
    try {
      current = migration(current);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      return fail('migrationFailed', `Migration from schemaVersion ${v} failed: ${reason}`);
    }
    if (current.schemaVersion !== v + 1) {
      return fail(
        'migrationFailed',
        `Migration from schemaVersion ${v} did not produce version ${v + 1}.`,
      );
    }
  }
  return { ok: true, value: current };
}

/** Migrates then validates raw JSON. Never throws. */
export function parseDocument(raw: unknown): Result<FormaDocument, DocumentError> {
  const migrated = migrateDocument(raw);
  if (!migrated.ok) return migrated;
  const parsed = formaDocumentSchema.safeParse(migrated.value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = zodIssues(parsed.error);
  return {
    ok: false,
    error: { code: 'invalidDocument', message: summarizeIssues('Document', issues), issues },
  };
}
