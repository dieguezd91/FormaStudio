import { PlugZap } from 'lucide-react';
import { SERVICE_URL } from '@/api';
import { Button } from '@/components/ui/button';

/** Shown while the local service is unreachable (design doc §4.4): says what to do, never crashes. */
export function ServiceBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-testid="service-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-sm"
    >
      <PlugZap size={16} className="shrink-0 text-destructive" />
      <p className="min-w-0 flex-1">
        <strong>No se pudo conectar con el servicio local</strong> ({SERVICE_URL}). Iniciálo desde una
        terminal con{' '}
        <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">npm run dev:service</code> y volvé a
        intentar. Tus cambios pendientes se conservan en pantalla.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
