import { CircleOff } from 'lucide-react';
import { AI_UNAVAILABLE_MESSAGE } from '@/api/errors';
import { useAi } from './store';

/** Shown wherever an AI result would be, once the service said the Gemini key is missing. */
export function AiUnavailable() {
  const unavailable = useAi((state) => state.availability === 'unavailable');
  if (!unavailable) return null;
  return (
    <div
      role="alert"
      data-testid="ai-unavailable"
      className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs"
    >
      <CircleOff size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
      <p>{AI_UNAVAILABLE_MESSAGE}</p>
    </div>
  );
}

/** Warnings returned next to an AI result, shown inline (never blocking). */
export function WarningList({
  warnings,
  testId,
}: {
  warnings: readonly { code: string; message: string }[];
  testId?: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <ul
      data-testid={testId ?? 'ai-warnings'}
      aria-label="Advertencias"
      className="space-y-1 rounded-lg border border-border bg-primary/5 p-2 text-xs"
    >
      {warnings.map((warning, i) => (
        <li key={`${warning.code}-${i}`} data-code={warning.code} className="flex gap-1.5">
          <span aria-hidden>⚠</span>
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}
