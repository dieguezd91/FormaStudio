import type { RuntimeEvent } from '@forma/runtime';

const INTENT_LABELS: Record<string, string> = {
  'inventory.moveItem': 'Mover objeto',
  'inventory.equipItem': 'Equipar objeto',
  'inventory.useItem': 'Usar objeto',
  'inventory.dropItem': 'Soltar objeto',
  'inventory.splitStack': 'Dividir pila',
};

/** Spanish label of an intent name; unknown intents keep their name. */
export const intentLabel = (name: string): string => INTENT_LABELS[name] ?? name;

const HANDLED_BY_LABELS: Record<RuntimeEvent['handledBy'], string> = {
  simulated: 'Simulado',
  custom: 'Personalizado',
  none: 'Sin manejador',
};

export const handledByLabel = (handledBy: RuntimeEvent['handledBy']): string =>
  HANDLED_BY_LABELS[handledBy];

export const outcomeLabel = (outcome: RuntimeEvent['outcome']): string =>
  outcome === 'applied' ? 'aplicado' : 'rechazado';

const PAYLOAD_KEYS: Record<string, string> = {
  itemId: 'objeto',
  fromSlot: 'desde',
  toSlot: 'hacia',
  slotId: 'casilla',
  slotType: 'tipo',
  amount: 'cantidad',
  actionId: 'acción',
};

/** One-line payload for the activity list; `nodeName` turns node ids into their layer names. */
export function summarizePayload(
  payload: Record<string, unknown>,
  nodeName: (value: string) => string | undefined,
): string {
  return Object.entries(payload)
    .map(([key, value]) => {
      const shown = typeof value === 'string' ? (nodeName(value) ?? value) : String(value);
      return `${PAYLOAD_KEYS[key] ?? key}: ${shown}`;
    })
    .join(' · ');
}

/** Log entries newest first, without the first `cleared` ones (the view's "Limpiar registro"). */
export function newestFirst(log: readonly RuntimeEvent[], cleared: number): RuntimeEvent[] {
  return log.slice(cleared).reverse();
}
