import { describe, expect, it } from 'vitest';
import { createId, createSequentialIdGenerator } from './ids';

describe('createId', () => {
  it('prefixes the generated suffix', () => {
    expect(createId('node', () => 'abc')).toBe('node_abc');
  });

  it('is deterministic with a sequential generator', () => {
    const gen = createSequentialIdGenerator();
    expect([createId('n', gen), createId('n', gen), createId('s', gen)]).toEqual([
      'n_1',
      'n_2',
      's_3',
    ]);
  });

  it('produces distinct ids with the default generator', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createId('node')));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^node_[a-z0-9]+$/);
  });
});
