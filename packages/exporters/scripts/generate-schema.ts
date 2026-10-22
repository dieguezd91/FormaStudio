import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_FILE_URL, serializeBundleJsonSchema } from '../src/ugui/schema-file';

const target = fileURLToPath(SCHEMA_FILE_URL);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, serializeBundleJsonSchema());
console.log(`Wrote ${target}`);
