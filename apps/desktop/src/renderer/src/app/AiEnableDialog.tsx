import { useState } from 'react';
import { AI_ENV_VAR, AI_KILL_SWITCH_VAR } from '@/api/aiMessages';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { retryAiStatus, useAiGate } from './useAiGate';

const Code = ({ children }: { children: string }) => (
  <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{children}</code>
);

/** How to turn AI on (or back on). The AI is optional: templates and manual design never need it. */
export function AiEnableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const gate = useAiGate();
  const [checking, setChecking] = useState(false);
  const disabled = gate.state === 'disabled';

  const recheck = async () => {
    setChecking(true);
    await retryAiStatus();
    setChecking(false);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cómo habilitar la IA"
      description="La IA es opcional: podés seguir con plantillas o diseñando a mano, nada más se bloquea."
    >
      <div data-testid="ai-enable-dialog" className="space-y-3 text-sm">
        {gate.usable ? (
          <p role="status" className="text-success">
            La IA ya está disponible.
          </p>
        ) : null}
        <ol className="list-decimal space-y-1.5 pl-5">
          {disabled ? (
            <li>
              Quitá <Code>{`${AI_KILL_SWITCH_VAR}=false`}</Code> del archivo <Code>.env</Code> (o ponelo en <Code>true</Code>).
            </li>
          ) : null}
          <li>
            Creá una clave en Google AI Studio y definila en el archivo <Code>.env</Code> como{' '}
            <Code>{`${AI_ENV_VAR}=tu_clave`}</Code> (podés copiar <Code>.env.example</Code>).
          </li>
          <li>Reiniciá el servicio local y tocá «Comprobar de nuevo».</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Una clave sin facturación usa el nivel gratuito, con una cuota diaria muy chica. Una suscripción a Google AI Pro
          o Google One no incluye cuota de API: para tener más, habilitá la facturación del proyecto en Google AI Studio.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="secondary" disabled={checking} onClick={() => void recheck()}>
            {checking ? 'Comprobando…' : 'Comprobar de nuevo'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
