import type { FormaDocument, TokenGroup } from '@forma/design-core';
import type { ColorRef } from './bundle';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` to lowercase `#rrggbb[aa]`; undefined for anything else. */
export function normalizeHex(value: string): string | undefined {
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return undefined;
  const digits = trimmed.slice(1).toLowerCase();
  const full = digits.length <= 4 ? [...digits].map((c) => c + c).join('') : digits;
  return `#${full}`;
}

type StyleInput = string | number | { token: string } | undefined;

const isTokenRef = (value: unknown): value is { token: string } =>
  typeof value === 'object' && value !== null && 'token' in value;

/** Looks `colors.surface` up in the document's tokens. */
function lookupToken(
  doc: FormaDocument,
  ref: string,
  groups: readonly TokenGroup[],
): string | number | undefined {
  const dot = ref.indexOf('.');
  const group = ref.slice(0, dot) as TokenGroup;
  const name = ref.slice(dot + 1);
  if (dot < 0 || !groups.includes(group)) return undefined;
  const table: Record<string, string | number> = doc.tokens[group];
  return Object.hasOwn(table, name) ? table[name] : undefined;
}

export interface ResolvedColor {
  color: ColorRef;
  /** The source value was not a usable hex color and `color` is the fallback. */
  invalid?: string;
}

/** Resolves a color style value; `fallback` is used when the value is missing or unusable. */
export function resolveColor(
  doc: FormaDocument,
  input: StyleInput,
  fallback: string,
): ResolvedColor | undefined {
  if (input === undefined) return undefined;
  const token = isTokenRef(input) ? input.token : undefined;
  const raw = token === undefined ? input : lookupToken(doc, token, ['colors']);
  const hex = typeof raw === 'string' ? normalizeHex(raw) : undefined;
  if (hex === undefined) {
    return { color: { value: fallback }, invalid: String(token ?? raw) };
  }
  return { color: token === undefined ? { value: hex } : { value: hex, token } };
}

/** Resolves a numeric style value (literal or token of any numeric group). */
export function resolveNumber(doc: FormaDocument, input: StyleInput): number | undefined {
  if (input === undefined) return undefined;
  if (!isTokenRef(input)) return typeof input === 'number' ? input : undefined;
  const value = lookupToken(doc, input.token, ['fontSizes', 'spacing', 'radii']);
  return typeof value === 'number' ? value : undefined;
}

/** Document tokens with colors normalized; colors that are not hex are left out. */
export function resolveTheme(doc: FormaDocument) {
  const colors: Record<string, string> = {};
  for (const [name, value] of Object.entries(doc.tokens.colors)) {
    const hex = normalizeHex(value);
    if (hex !== undefined) colors[name] = hex;
  }
  return {
    colors,
    fontSizes: { ...doc.tokens.fontSizes },
    spacing: { ...doc.tokens.spacing },
    radii: { ...doc.tokens.radii },
  };
}
