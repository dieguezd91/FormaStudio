import { Sparkles } from 'lucide-react';
import { useAiGate } from '@/app/useAiGate';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useUi } from '../store';

/** "Pedir a la IA" in the inspectors: disabled, with the reason as tooltip, while AI is not available. */
export function AskAiButton({ ariaLabel }: { ariaLabel?: string }) {
  const gate = useAiGate();
  return (
    <Tooltip label={gate.reason ?? 'Pedir un cambio a la IA'} wrap={!gate.usable}>
      <Button
        variant="secondary"
        size="sm"
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
        disabled={!gate.usable}
        onClick={() => useUi.getState().setAskOpen(true)}
      >
        <Sparkles size={14} /> Pedir a la IA
      </Button>
    </Tooltip>
  );
}
