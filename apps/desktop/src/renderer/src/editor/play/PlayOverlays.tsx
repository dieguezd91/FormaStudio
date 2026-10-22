import { useState } from 'react';
import type { DataRecord, Point, Runtime, RuntimeState } from '@forma/runtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;

/** Menu of the item under a right-click / long press, anchored in screen pixels. */
export function ContextMenuOverlay({
  runtime,
  menu,
  zoom,
}: {
  runtime: Runtime;
  menu: NonNullable<RuntimeState['ui']['menu']>;
  zoom: number;
}) {
  return (
    <div
      role="menu"
      aria-label="Menú contextual"
      data-testid="play-menu"
      className="absolute z-30 min-w-36 rounded-lg border border-border bg-popover p-1 text-sm shadow-xl"
      style={{ left: menu.anchor.x * zoom, top: menu.anchor.y * zoom }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          title={action.disabled ? 'No disponible para este objeto' : undefined}
          className={cn(
            'block w-full rounded px-3 py-1.5 text-left',
            action.disabled ? 'cursor-not-allowed text-muted-foreground/50' : 'hover:bg-accent',
          )}
          onClick={() => runtime.dispatch({ type: 'menuAction', actionId: action.id })}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

const TOOLTIP_FIELDS: [field: string, label: string][] = [
  ['quantity', 'Cantidad'],
  ['category', 'Categoría'],
  ['rarity', 'Rareza'],
];

/** Item details near the pointer. */
export function TooltipOverlay({ record, at }: { record: DataRecord; at: Point }) {
  return (
    <div
      role="tooltip"
      data-testid="play-tooltip"
      className="pointer-events-none fixed z-[120] max-w-60 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl"
      style={{ left: at.x + 14, top: at.y + 14 }}
    >
      <p className="text-sm font-semibold">{text(record['name']) ?? text(record['id']) ?? 'Objeto'}</p>
      {TOOLTIP_FIELDS.map(([field, label]) => {
        const value = text(record[field]);
        return value === undefined ? null : (
          <p key={field} className="text-muted-foreground">
            {label}: <span className="text-foreground">{value}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Copy of the dragged item that follows the pointer. */
export function DragGhost({ record, at }: { record: DataRecord | undefined; at: Point }) {
  const name = text(record?.['name']) ?? '?';
  return (
    <div
      data-testid="play-drag-ghost"
      className="pointer-events-none fixed z-[130] flex h-12 w-12 items-center justify-center rounded-md bg-primary/80 text-lg font-semibold text-primary-foreground shadow-xl"
      style={{ left: at.x - 24, top: at.y - 24 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** Modal asking how many items to split off the stack. */
export function SplitDialog({
  runtime,
  split,
  itemName,
}: {
  runtime: Runtime;
  split: NonNullable<RuntimeState['ui']['split']>;
  itemName: string | undefined;
}) {
  const [amount, setAmount] = useState(Math.max(1, Math.floor(split.max / 2)));
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= split.max;
  const confirm = () => {
    if (valid) runtime.dispatch({ type: 'splitConfirm', amount });
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dividir pila"
        data-testid="play-split"
        className="w-72 space-y-3 rounded-lg border border-border bg-popover p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold">Dividir pila{itemName ? `: ${itemName}` : ''}</h3>
        <p className="text-xs text-muted-foreground">Elegí cuántas unidades separar (1 a {split.max}).</p>
        <input
          type="range"
          aria-label="Cantidad a separar"
          min={1}
          max={split.max}
          value={valid ? amount : 1}
          className="w-full accent-primary"
          onChange={(event) => setAmount(Number(event.target.value))}
        />
        <Input
          type="number"
          aria-label="Cantidad"
          min={1}
          max={split.max}
          step={1}
          value={Number.isNaN(amount) ? '' : amount}
          autoFocus
          onChange={(event) => setAmount(event.target.valueAsNumber)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              confirm();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => runtime.dispatch({ type: 'splitCancel' })}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!valid} onClick={confirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
