import { Button } from '@/components/ui/button';

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Forma Studio</h1>
        <p className="mt-2 text-muted-foreground">¿Cómo querés empezar?</p>
      </header>
      <div className="flex flex-wrap justify-center gap-4">
        <Button size="lg">Crear con IA</Button>
        <Button size="lg" variant="secondary">
          Usar plantilla
        </Button>
        <Button size="lg" variant="outline">
          Empezar desde cero
        </Button>
      </div>
    </main>
  );
}
