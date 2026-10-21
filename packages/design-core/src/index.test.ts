import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SCHEMA_VERSION } from './index';

describe('design-core', () => {
  it('exposes the current schema version', () => {
    expect(z.literal(1).parse(SCHEMA_VERSION)).toBe(1);
  });
});
