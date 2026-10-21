import type { Operation, TokenGroup, TokenRef } from '@forma/design-core';

/** Values used only when the project does not already define a token with that name. */
export const DEFAULT_TOKENS = {
  colors: {
    surface: '#1f2430',
    surfaceAlt: '#2a3140',
    border: '#3b4458',
    text: '#e8ecf4',
    textMuted: '#9aa4b8',
    accent: '#d9a441',
    accentText: '#1a1405',
  },
  fontSizes: { small: 12, body: 16, title: 24 },
  spacing: { xs: 4, sm: 8, md: 16 },
  radii: { sm: 4, md: 8 },
} as const satisfies Record<TokenGroup, Record<string, string | number>>;

type Names<G extends TokenGroup> = keyof (typeof DEFAULT_TOKENS)[G] & string;

/** Token refs for styling (so project styles apply, §8.3) plus default values for layout maths. */
export interface TokenKit {
  color: (name: Names<'colors'>) => TokenRef;
  fontSize: (name: Names<'fontSizes'>) => TokenRef;
  spacing: (name: Names<'spacing'>) => TokenRef;
  radius: (name: Names<'radii'>) => TokenRef;
  /** Default numeric value, for computing sizes that must be literal numbers. */
  spacingValue: (name: Names<'spacing'>) => number;
}

export function createTokenKit(): TokenKit {
  return {
    color: (name) => ({ token: `colors.${name}` }),
    fontSize: (name) => ({ token: `fontSizes.${name}` }),
    spacing: (name) => ({ token: `spacing.${name}` }),
    radius: (name) => ({ token: `radii.${name}` }),
    spacingValue: (name) => DEFAULT_TOKENS.spacing[name],
  };
}

/** `setToken` operations for every default token in `used` that the project does not define yet. */
export function missingTokenOps(
  existing: Record<TokenGroup, Record<string, unknown>>,
  used: ReadonlySet<string>,
): Operation[] {
  const ops: Operation[] = [];
  for (const ref of used) {
    const [group, name] = ref.split('.') as [TokenGroup, string];
    const table: Record<string, string | number> = DEFAULT_TOKENS[group];
    const value = table[name];
    if (value !== undefined && !Object.hasOwn(existing[group], name)) {
      ops.push({ type: 'setToken', group, name, value });
    }
  }
  return ops;
}
