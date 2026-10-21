import { TOKEN_GROUPS, type NodeStyle, type StyleTokens, type TokenGroup } from '@forma/design-core';

export interface TokenRefValue {
  token: string;
}

export const isTokenRef = (value: unknown): value is TokenRefValue =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { token?: unknown }).token === 'string';

export function parseTokenPath(path: string): { group: TokenGroup; name: string } | undefined {
  const dot = path.indexOf('.');
  if (dot <= 0) return undefined;
  const group = path.slice(0, dot);
  const name = path.slice(dot + 1);
  if (!(TOKEN_GROUPS as readonly string[]).includes(group) || name === '') return undefined;
  return { group: group as TokenGroup, name };
}

/** Literal as-is, token reference looked up in the project tokens; `undefined` if unresolvable. */
export function resolveStyleValue<T extends string | number>(
  value: T | TokenRefValue | undefined,
  tokens: StyleTokens,
): T | undefined {
  if (value === undefined) return undefined;
  if (!isTokenRef(value)) return value;
  const parsed = parseTokenPath(value.token);
  if (!parsed) return undefined;
  const table: Record<string, string | number> = tokens[parsed.group];
  return Object.hasOwn(table, parsed.name) ? (table[parsed.name] as T) : undefined;
}

export type ResolvedStyle = {
  [K in keyof NodeStyle]?: Exclude<NodeStyle[K], TokenRefValue | undefined>;
};

export function resolveNodeStyle(style: NodeStyle, tokens: StyleTokens): ResolvedStyle {
  const resolved: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(style)) {
    const concrete = resolveStyleValue(value as string | number | TokenRefValue | undefined, tokens);
    if (concrete !== undefined) resolved[key] = concrete;
  }
  return resolved as ResolvedStyle;
}

export interface TokenEntry {
  path: string;
  name: string;
  value: string | number;
}

export function listTokens(tokens: StyleTokens, group: TokenGroup): TokenEntry[] {
  return Object.entries<string | number>(tokens[group]).map(([name, value]) => ({
    path: `${group}.${name}`,
    name,
    value,
  }));
}
