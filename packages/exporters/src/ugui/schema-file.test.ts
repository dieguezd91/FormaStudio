import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_FILE_URL,
  generateBundleJsonSchema,
  serializeBundleJsonSchema,
} from './schema-file';

describe('ugui-bundle.schema.json', () => {
  it('generates a JSON Schema for the bundle contract', () => {
    const schema = generateBundleJsonSchema();
    expect(schema).toMatchObject({ type: 'object' });
    expect(JSON.stringify(schema)).toContain('forma.ugui-bundle/v1');
  });

  it('matches the committed docs/export/ugui-bundle.schema.json (run `npm run schema -w @forma/exporters`)', () => {
    const committed = readFileSync(SCHEMA_FILE_URL, 'utf8');
    expect(committed).toBe(serializeBundleJsonSchema());
  });
});
