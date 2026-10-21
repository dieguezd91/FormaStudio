import type { StyleTokens, TokenGroup } from '@forma/design-core';
import { Select } from '@/components/ui/input';
import { isTokenRef, listTokens, resolveStyleValue, type TokenRefValue } from '../tokens';
import { CommitInput, Field, NumberInput } from './fields';

export type StyleInput = string | number | TokenRefValue;

interface StyleFieldProps {
  label: string;
  /** Style key, used for stable test ids. */
  prop: string;
  kind: 'color' | 'number';
  /** Token group offered in the picker; without it only literal values are possible. */
  group?: TokenGroup;
  value: StyleInput | undefined;
  tokens: StyleTokens;
  min?: number;
  max?: number;
  integer?: boolean;
  /** `null` removes the style value. */
  onChange: (value: StyleInput | null) => void;
}

const NONE = '__none__';
const LITERAL = '__literal__';

const DEFAULT_LITERAL = { color: '#ffffff', number: 0 } as const;

/** Literal-or-token editor for one style property (design doc §8.3: tokens restyle every user). */
export function StyleField({
  label,
  prop,
  kind,
  group,
  value,
  tokens,
  min,
  max,
  integer,
  onChange,
}: StyleFieldProps) {
  const entries = group ? listTokens(tokens, group) : [];
  const mode = value === undefined ? NONE : isTokenRef(value) ? value.token : LITERAL;
  const resolved = resolveStyleValue(value, tokens);
  const knownToken = entries.some((entry) => entry.path === mode);

  const changeMode = (next: string) => {
    if (next === NONE) onChange(null);
    else if (next === LITERAL) onChange(resolved ?? DEFAULT_LITERAL[kind]);
    else onChange({ token: next });
  };

  return (
    <Field label={label}>
      <span className="flex items-center gap-1.5">
        {kind === 'color' && typeof resolved === 'string' ? (
          <span
            className="h-5 w-5 shrink-0 rounded border border-border"
            style={{ background: resolved }}
            aria-hidden
          />
        ) : null}
        {group || value === undefined ? (
          <Select
            aria-label={`${label}: origen`}
            data-testid={`style-${prop}-mode`}
            className="min-w-0 flex-1"
            value={mode}
            onChange={(event) => changeMode(event.target.value)}
          >
            <option value={NONE}>Sin definir</option>
            <option value={LITERAL}>Valor propio</option>
            {entries.map((entry) => (
              <option key={entry.path} value={entry.path}>
                Token · {entry.name}
              </option>
            ))}
            {isTokenRef(value) && !knownToken ? (
              <option value={mode}>{mode} (no existe)</option>
            ) : null}
          </Select>
        ) : null}
        {mode === LITERAL && kind === 'color' ? (
          <CommitInput
            aria-label={`${label}: valor`}
            data-testid={`style-${prop}-value`}
            className="w-24 shrink-0 font-mono"
            value={String(value)}
            onCommit={(draft) => {
              const text = draft.trim();
              if (text === '') return false;
              onChange(text);
            }}
          />
        ) : null}
        {mode === LITERAL && kind === 'number' ? (
          <NumberInput
            aria-label={`${label}: valor`}
            data-testid={`style-${prop}-value`}
            className="w-20 shrink-0"
            value={Number(value)}
            {...(min === undefined ? {} : { min })}
            {...(max === undefined ? {} : { max })}
            {...(integer === undefined ? {} : { integer })}
            onCommit={onChange}
          />
        ) : null}
        {mode !== LITERAL && mode !== NONE && resolved !== undefined ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{String(resolved)}</span>
        ) : null}
      </span>
    </Field>
  );
}
