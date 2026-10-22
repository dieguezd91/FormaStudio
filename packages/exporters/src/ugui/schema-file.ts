import { z } from 'zod';
import { uguiBundleSchema } from './bundle';

/** docs/export/ugui-bundle.schema.json, resolved from this file so it works from any cwd. */
export const SCHEMA_FILE_URL = new URL(
  '../../../../docs/export/ugui-bundle.schema.json',
  import.meta.url,
);

export const generateBundleJsonSchema = () => z.toJSONSchema(uguiBundleSchema);

export const serializeBundleJsonSchema = (): string =>
  `${JSON.stringify(generateBundleJsonSchema(), null, 2)}\n`;
