export type IdGenerator = () => string;

const randomSuffix: IdGenerator = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Creates `<prefix>_<suffix>`; inject `generate` for deterministic ids in tests. */
export function createId(prefix: string, generate: IdGenerator = randomSuffix): string {
  return `${prefix}_${generate()}`;
}

/** Generator yielding "1", "2", ... for deterministic ids. */
export function createSequentialIdGenerator(start = 1): IdGenerator {
  let next = start;
  return () => String(next++);
}
