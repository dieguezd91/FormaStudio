import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { FormaDocument, FormaScreen } from '@forma/design-core';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { renameScreenBatch, resizeScreenBatch, SCREEN_PRESETS, setTokenBatch } from '../batches';
import { editorStore } from '../store';
import { listTokens } from '../tokens';
import { CommitInput, Field, Section } from './fields';

const sameSize = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  a.width === b.width && a.height === b.height;

function TokensSection({ doc }: { doc: FormaDocument }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('#888888');
  const colors = listTokens(doc.tokens, 'colors');
  const isNew = name.trim() !== '' && !colors.some((c) => c.name === name.trim());

  const set = (tokenName: string, tokenValue: string) =>
    editorStore.getState().dispatch(setTokenBatch('colors', tokenName, tokenValue));

  return (
    <Section title="Colores del proyecto" testId="inspector-tokens">
      <p className="text-xs text-muted-foreground">
        Al cambiar un color, todo lo que lo usa se actualiza.
      </p>
      {colors.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no hay colores definidos.</p>
      ) : null}
      {colors.map((token) => (
        <Field key={token.path} label={token.name}>
          <span className="flex items-center gap-1.5">
            <span
              className="h-5 w-5 shrink-0 rounded border border-border"
              style={{ background: String(token.value) }}
              aria-hidden
            />
            <CommitInput
              aria-label={`Color ${token.name}`}
              data-testid={`token-${token.name}`}
              className="font-mono"
              value={String(token.value)}
              onCommit={(next) => {
                if (next.trim() === '') return false;
                set(token.name, next.trim());
              }}
            />
          </span>
        </Field>
      ))}
      <form
        className="flex items-center gap-1.5 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isNew) return;
          set(name.trim(), value.trim() || '#888888');
          setName('');
        }}
      >
        <Input
          aria-label="Nombre del nuevo color"
          placeholder="nuevo color"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          aria-label="Valor del nuevo color"
          className="w-24 shrink-0 font-mono"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" variant="secondary" size="icon" aria-label="Agregar color" disabled={!isNew}>
          <Plus size={15} />
        </Button>
      </form>
    </Section>
  );
}

export function ScreenInspector({ doc, screen }: { doc: FormaDocument; screen: FormaScreen }) {
  const current = SCREEN_PRESETS.findIndex((preset) => sameSize(preset.size, screen.size));
  const state = editorStore.getState();
  return (
    <div data-testid="screen-inspector">
      <div className="border-b border-border px-3 py-2.5">
        <p className="text-sm font-semibold">Pantalla</p>
        <p className="text-xs text-muted-foreground">
          Seleccioná un elemento del canvas para editarlo.
        </p>
      </div>
      <Section title="Pantalla">
        <Field label="Nombre">
          <CommitInput
            aria-label="Nombre de la pantalla"
            value={screen.name}
            onCommit={(name) => {
              if (name.trim() === '') return false;
              state.dispatch(renameScreenBatch(screen, name.trim()));
            }}
          />
        </Field>
        <Field label="Tamaño">
          <Select
            aria-label="Tamaño de la pantalla"
            value={current >= 0 ? String(current) : 'custom'}
            onChange={(event) => {
              const preset = SCREEN_PRESETS[Number(event.target.value)];
              const batch = preset && resizeScreenBatch(doc, screen.id, preset.size);
              if (batch) state.dispatch(batch);
            }}
          >
            {current < 0 ? (
              <option value="custom">
                {screen.size.width} × {screen.size.height} (personalizado)
              </option>
            ) : null}
            {SCREEN_PRESETS.map((preset, index) => (
              <option key={preset.label} value={index}>
                {preset.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className={cn('text-xs text-muted-foreground')}>
          Al cambiar el tamaño, los elementos conservan su posición.
        </p>
      </Section>
      <TokensSection doc={doc} />
    </div>
  );
}
