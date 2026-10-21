import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from './factory';
import { migrateDocument, parseDocument, type MigrationRegistry } from './migrate';

const validDoc = createEmptyDocument({ name: 'D', target: { platform: 'unity', ui: 'ugui' } });

describe('parseDocument', () => {
  it('parses a valid document', () => {
    const result = parseDocument(JSON.parse(JSON.stringify(validDoc)));
    expect(result).toEqual({ ok: true, value: validDoc });
  });

  it.each([null, undefined, 'text', 42, []])('rejects non-object input %j', (raw) => {
    const result = parseDocument(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('notAnObject');
  });

  it('reports a missing or invalid schemaVersion', () => {
    const { schemaVersion: omitted, ...rest } = validDoc;
    void omitted;
    const missing = parseDocument(rest);
    expect(!missing.ok && missing.error.code).toBe('missingVersion');
    for (const v of [0, -1, 1.5, '1', null]) {
      const r = parseDocument({ ...validDoc, schemaVersion: v });
      expect(!r.ok && r.error.code, String(v)).toBe('invalidVersion');
    }
  });

  it('returns a clear error for newer versions', () => {
    const r = parseDocument({ ...validDoc, schemaVersion: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('unsupportedVersion');
      expect(r.error.message).toMatch(/99/);
      expect(r.error.message).toMatch(/newer/i);
    }
  });

  it('converts schema failures into path-addressed issues without throwing', () => {
    const r = parseDocument({ ...validDoc, target: { platform: 'godot' } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalidDocument');
      expect(r.error.issues?.some((i) => i.path.startsWith('target'))).toBe(true);
      expect(typeof r.error.message).toBe('string');
    }
  });
});

describe('migrateDocument', () => {
  it('is a no-op for the current version', () => {
    expect(migrateDocument(validDoc)).toEqual({ ok: true, value: validDoc });
  });

  it('chains registered migrations up to the target version', () => {
    const registry: MigrationRegistry = {
      1: (d) => ({ ...d, schemaVersion: 2, a: true }),
      2: (d) => ({ ...d, schemaVersion: 3, b: true }),
    };
    const r = migrateDocument({ schemaVersion: 1 }, { registry, target: 3 });
    expect(r).toEqual({ ok: true, value: { schemaVersion: 3, a: true, b: true } });
  });

  it('reports a gap in the registry', () => {
    const r = migrateDocument({ schemaVersion: 1 }, { registry: {}, target: 2 });
    expect(!r.ok && r.error.code).toBe('unsupportedVersion');
  });

  it('wraps throwing migrations as migrationFailed', () => {
    const registry: MigrationRegistry = {
      1: () => {
        throw new Error('boom');
      },
    };
    const r = migrateDocument({ schemaVersion: 1 }, { registry, target: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('migrationFailed');
      expect(r.error.message).toMatch(/boom/);
    }
  });

  it('rejects a migration that does not advance the version', () => {
    const registry: MigrationRegistry = { 1: (d) => d };
    const r = migrateDocument({ schemaVersion: 1 }, { registry, target: 2 });
    expect(!r.ok && r.error.code).toBe('migrationFailed');
  });
});
