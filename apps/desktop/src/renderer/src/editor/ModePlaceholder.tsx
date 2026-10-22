import { PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUi } from './store';

/** Exportar is not built yet. */
export function ModePlaceholder() {
  const setMode = useUi((state) => state.setMode);
  return (
    <div
      data-testid="placeholder-export"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <PackageOpen size={40} className="text-muted-foreground" />
      <h2 className="text-lg font-semibold">Exportar: disponible pronto</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Acá vas a poder exportar tu diseño a Unity (uGUI) como un Prefab nativo, con un informe de compatibilidad.
      </p>
      <Button variant="secondary" onClick={() => setMode('design')}>
        Volver a Diseñar
      </Button>
    </div>
  );
}
