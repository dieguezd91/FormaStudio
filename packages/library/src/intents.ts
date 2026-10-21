import type { Intent } from '@forma/design-core';

type Payload = Intent['payload'];

/** Intent ids equal their names so library nodes can reference them without a lookup. */
export const INTENT_IDS = {
  moveItem: 'inventory.moveItem',
  useItem: 'inventory.useItem',
  splitStack: 'inventory.splitStack',
  dropItem: 'inventory.dropItem',
  equipItem: 'inventory.equipItem',
  menuAction: 'ui.menuAction',
} as const;

/** The UI expresses intent; the game decides (§10.5), so every library intent starts unconnected. */
const intent = (name: string, description: string, payload: Payload): Intent => ({
  id: name,
  name,
  description,
  payload,
  connection: 'unconnected',
});

export const INVENTORY_INTENTS: Intent[] = [
  intent(INTENT_IDS.moveItem, 'El jugador arrastra un ítem de una casilla a otra.', [
    { name: 'itemId', type: 'id' },
    { name: 'fromSlot', type: 'id' },
    { name: 'toSlot', type: 'id' },
  ]),
  intent(INTENT_IDS.useItem, 'El jugador usa un ítem.', [{ name: 'itemId', type: 'id' }]),
  intent(INTENT_IDS.splitStack, 'El jugador divide una pila de ítems.', [
    { name: 'itemId', type: 'id' },
    { name: 'amount', type: 'number' },
  ]),
  intent(INTENT_IDS.dropItem, 'El jugador suelta un ítem al mundo.', [
    { name: 'itemId', type: 'id' },
  ]),
  intent(INTENT_IDS.equipItem, 'El jugador equipa un ítem en una casilla de equipamiento.', [
    { name: 'itemId', type: 'id' },
    { name: 'slotType', type: 'string' },
  ]),
];

/** Generic action of a context menu that is not tied to a specific game system. */
export const MENU_ACTION_INTENT: Intent = intent(
  INTENT_IDS.menuAction,
  'El jugador elige una acción de un menú contextual.',
  [{ name: 'actionId', type: 'id' }],
);

/** Fresh copies so callers can never share (and mutate) the module-level definitions. */
export const cloneIntents = (intents: readonly Intent[]): Intent[] =>
  intents.map((i) => ({ ...i, payload: i.payload.map((p) => ({ ...p })) }));
