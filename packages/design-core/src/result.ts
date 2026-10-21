/** Discriminated result used instead of exceptions at every public boundary. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
