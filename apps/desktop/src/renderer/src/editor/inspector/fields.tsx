import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type InputProps = Omit<
  ComponentProps<typeof Input>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'onKeyDown'
>;

interface CommitInputProps extends InputProps {
  value: string;
  /** Called on blur/Enter with a changed value. Return `false` to reject it and show `value` again. */
  onCommit: (value: string) => boolean | void;
  /** Called on blur/Escape when nothing changed. */
  onCancel?: () => void;
}

/**
 * Text input that edits locally and commits once, on blur or Enter (Escape reverts), so that one
 * edit is one batch and one undo step. Keyed by `value` so upstream changes replace the draft.
 */
export function CommitInput({ value, onCommit, onCancel, ...props }: CommitInputProps) {
  return (
    <Input
      key={value}
      defaultValue={value}
      onBlur={(event) => {
        const draft = event.currentTarget.value;
        if (draft === value) return onCancel?.();
        if (onCommit(draft) === false) event.currentTarget.value = value;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        else if (event.key === 'Escape') {
          event.stopPropagation();
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
      {...props}
    />
  );
}

interface NumberInputProps extends InputProps {
  value: number;
  min?: number;
  max?: number;
  integer?: boolean;
  onCommit: (value: number) => void;
}

/** Numeric variant of `CommitInput`: invalid or out-of-range text is discarded, not committed. */
export function NumberInput({ value, min, max, integer, onCommit, ...props }: NumberInputProps) {
  return (
    <CommitInput
      inputMode="decimal"
      value={String(value)}
      onCommit={(draft) => {
        const parsed = Number(draft.trim().replace(',', '.'));
        if (draft.trim() === '' || !Number.isFinite(parsed)) return false;
        const rounded = integer ? Math.round(parsed) : Math.round(parsed * 100) / 100;
        const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, rounded));
        if (clamped === value) return false;
        onCommit(clamped);
      }}
      {...props}
    />
  );
}

export function Section({
  title,
  children,
  defaultOpen = true,
  testId,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  return (
    <details open={defaultOpen} className="border-b border-border" data-testid={testId}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {title}
      </summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </details>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('grid grid-cols-[88px_1fr] items-center gap-2 text-[13px]', className)}>
      <span className="truncate text-muted-foreground" title={label}>
        {label}
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}
