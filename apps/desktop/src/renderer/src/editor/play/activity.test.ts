import { describe, expect, it } from 'vitest';
import type { RuntimeEvent } from '@forma/runtime';
import {
  handledByLabel,
  intentLabel,
  newestFirst,
  outcomeLabel,
  summarizePayload,
} from './activity';

const event = (over: Partial<RuntimeEvent> = {}): RuntimeEvent => ({
  type: 'intent',
  at: 1,
  intentId: 'intent_1',
  name: 'inventory.moveItem',
  payload: {},
  connection: 'simulated',
  handledBy: 'simulated',
  outcome: 'applied',
  ...over,
});

describe('intentLabel', () => {
  it('translates the simulated inventory intents', () => {
    expect(intentLabel('inventory.moveItem')).toBe('Mover objeto');
    expect(intentLabel('inventory.equipItem')).toBe('Equipar objeto');
    expect(intentLabel('inventory.useItem')).toBe('Usar objeto');
    expect(intentLabel('inventory.dropItem')).toBe('Soltar objeto');
    expect(intentLabel('inventory.splitStack')).toBe('Dividir pila');
  });

  it('falls back to the raw name for unknown intents', () => {
    expect(intentLabel('game.openShop')).toBe('game.openShop');
  });
});

describe('labels', () => {
  it('names who handled the intent and how it ended', () => {
    expect(handledByLabel('simulated')).toBe('Simulado');
    expect(handledByLabel('custom')).toBe('Personalizado');
    expect(handledByLabel('none')).toBe('Sin manejador');
    expect(outcomeLabel('applied')).toBe('aplicado');
    expect(outcomeLabel('rejected')).toBe('rechazado');
  });
});

describe('summarizePayload', () => {
  it('lists keys in Spanish and resolves node ids to their names', () => {
    const names: Record<string, string> = { slot_1: 'Casilla 1', slot_2: 'Casilla 2' };
    const summary = summarizePayload(
      { itemId: 'espada', fromSlot: 'slot_1', toSlot: 'slot_2' },
      (id) => names[id],
    );
    expect(summary).toBe('objeto: espada · desde: Casilla 1 · hacia: Casilla 2');
  });

  it('keeps unknown keys and values as they are', () => {
    expect(summarizePayload({ amount: 3, custom: true }, () => undefined)).toBe(
      'cantidad: 3 · custom: true',
    );
  });

  it('is empty for an empty payload', () => {
    expect(summarizePayload({}, () => undefined)).toBe('');
  });
});

describe('newestFirst', () => {
  it('reverses the log and skips what was cleared from the view', () => {
    const log = [event({ intentId: 'a' }), event({ intentId: 'b' }), event({ intentId: 'c' })];
    expect(newestFirst(log, 0).map((e) => e.intentId)).toEqual(['c', 'b', 'a']);
    expect(newestFirst(log, 2).map((e) => e.intentId)).toEqual(['c']);
    expect(newestFirst(log, 9)).toEqual([]);
  });
});
