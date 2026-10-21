import { PackageOpen, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUi } from './store';

const COPY = {
  test: {
    icon: PlayCircle,
    title: 'Probar: disponible pronto',
    body: 'Acá vas a poder arrastrar objetos, apilarlos y abrir menús con datos de ejemplo, como si estuvieras en el juego, antes de exportar.',
  },
  export: {
    icon: PackageOpen,
    title: 'Exportar: disponible pronto',
    body: 'Acá vas a poder exportar tu diseño a Unity (uGUI) como un Prefab nativo, con un informe de compatibilidad.',
  },
} as const;

export function ModePlaceholder({ mode }: { mode: 'test' | 'export' }) {
  const setMode = useUi((state) => state.setMode);
  const { icon: Icon, title, body } = COPY[mode];
  return (
    <div
      data-testid={`placeholder-${mode}`}
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <Icon size={40} className="text-muted-foreground" />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      <Button variant="secondary" onClick={() => setMode('design')}>
        Volver a Diseñar
      </Button>
    </div>
  );
}
