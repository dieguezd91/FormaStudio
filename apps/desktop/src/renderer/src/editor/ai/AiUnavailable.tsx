import { useState } from 'react';
import { CircleOff } from 'lucide-react';
import { AiEnableDialog } from '@/app/AiEnableDialog';
import { retryAiStatus, useAiGate } from '@/app/useAiGate';

/** Shown wherever an AI result would be, while AI cannot be used. Manual work is never blocked. */
export function AiUnavailable() {
  const gate = useAiGate();
  const [helpOpen, setHelpOpen] = useState(false);
  if (gate.usable) return null;
  return (
    <div
      role="alert"
      data-testid="ai-unavailable"
      className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs"
    >
      <CircleOff size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="space-y-1">
        <p>{gate.detail}</p>
        <p className="flex gap-3">
          {gate.state !== 'unknown' ? (
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setHelpOpen(true)}>
              Cómo habilitarla
            </button>
          ) : null}
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => void retryAiStatus()}>
            Reintentar
          </button>
        </p>
      </div>
      <AiEnableDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
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
