import type { FormaDocument } from '@forma/design-core';
import { describe, expect, it, vi } from 'vitest';
import { createRuntime } from './runtime';
import {
  SCREEN_ID,
  ROOT_ID,
  buildDoc,
  deepFreeze,
  iconOf,
  idsOfType,
  itemViewOf,
  nodeOf,
  patchNode,
  rec,
  start,
  subtreeOf,
  tabBarOf,
  withConnection,
  withItems,
} from './test-fixtures';
import type { Runtime, RuntimeEvent } from './types';

const lastIntent = (rt: Runtime): RuntimeEvent => {
  const event = rt.getState().log.at(-1);
  if (!event) throw new Error('no intent was logged');
  return event;
};

const iconIn = (rt: Runtime, doc: FormaDocument, slotId: string) =>
  rt.resolveBinding(itemViewOf(doc, slotId), 'icon');

function drag(rt: Runtime, from: string, to: string) {
  rt.dispatch({ type: 'dragStart', nodeId: from });
  rt.dispatch({ type: 'dragOver', nodeId: to });
  rt.dispatch({ type: 'drop', nodeId: to });
}

/** The first tab (Armas: espada, arco, bastón, daga) of the tabbed inventory. */
function tabbed(params?: Record<string, unknown>) {
  const doc = buildDoc('inventory.tabs', params);
  const bar = tabBarOf(doc);
  return { doc, bar, slots: (tab: number) => idsOfType(doc, 'slot', bar.contentIds[tab]) };
}

/** A single-category tabbed inventory over custom rows, handy for stacking scenarios. */
function stacks(items: ReturnType<typeof rec>[], params: Record<string, unknown> = {}) {
  const base = buildDoc('inventory.tabs', {
    categories: ['Materiales'],
    columns: 3,
    rows: 1,
    ...params,
  });
  const doc = withItems(base, items);
  return { doc, slots: idsOfType(doc, 'slot') };
}

const menuAction = (rt: Runtime, slotId: string, actionId: string) => {
  rt.dispatch({ type: 'secondaryClick', nodeId: slotId, anchor: { x: 1, y: 2 } });
  rt.dispatch({ type: 'menuAction', actionId });
};

describe('createRuntime', () => {
  it('rejects an unknown screen', () => {
    expect(() => createRuntime(buildDoc('inventory.grid'), 'nope')).toThrow(/nope/);
  });

  it('starts from a working copy of the mock data', () => {
    const doc = buildDoc('inventory.grid');
    const rt = start(doc);
    const items = rt.getState().data['inventory.items'];
    expect(items).toHaveLength(16);
    expect(items).not.toBe(doc.dataSources[0]?.mock);
  });
});

describe('tabs', () => {
  it('shows only the initial tab content', () => {
    const { doc, bar, slots } = tabbed();
    const rt = start(doc);
    expect(rt.getState().ui.activeTab[bar.id]).toBe('tab-1');
    expect(rt.isNodeVisible(bar.contentIds[0]!)).toBe(true);
    expect(rt.isNodeVisible(bar.contentIds[1]!)).toBe(false);
    expect(rt.isNodeVisible(slots(0)[0]!)).toBe(true);
    expect(rt.isNodeVisible(slots(1)[0]!)).toBe(false);
    expect(rt.resolveNode(slots(1)[0]!).visible).toBe(false);
    expect(rt.isNodeVisible(bar.id)).toBe(true);
  });

  it('switches content when a tab label is clicked', () => {
    const { doc, bar, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'click', nodeId: bar.buttonIds[2]! });
    expect(rt.getState().ui.activeTab[bar.id]).toBe('tab-3');
    expect(rt.isNodeVisible(bar.contentIds[0]!)).toBe(false);
    expect(rt.isNodeVisible(bar.contentIds[2]!)).toBe(true);
    expect(rt.isNodeVisible(slots(2)[0]!)).toBe(true);
    expect(iconIn(rt, doc, slots(2)[0]!)).toBe(iconOf('pocion-de-vida'));
  });
});

describe('binding resolution', () => {
  it('follows the filter, position and field convention over the runtime data', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    expect(iconIn(rt, doc, slots(0)[1]!)).toBe(iconOf('arco-de-fresno'));
    expect(rt.resolveBinding(itemViewOf(doc, slots(0)[1]!), 'quantity')).toBe(1);
    expect(iconIn(rt, doc, slots(0)[10]!)).toBeUndefined();
    expect(rt.resolveBinding(itemViewOf(doc, slots(0)[1]!), 'nope')).toBeUndefined();
    expect(rt.resolveBinding('missing-node', 'icon')).toBeUndefined();
  });

  it('reports node text, icon, quantity and record', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    const view = rt.resolveNode(itemViewOf(doc, slots(0)[0]!));
    expect(view).toMatchObject({
      icon: iconOf('espada-de-hierro'),
      quantity: 1,
      visible: true,
      selected: false,
      disabled: false,
      focused: false,
      dropState: null,
    });
    expect(view.record).toMatchObject({ id: 'espada-de-hierro', name: 'Espada de hierro' });
    expect(Object.keys(view.record ?? {}).some((k) => k.startsWith('__'))).toBe(false);
    const buttonId = tabBarOf(doc).buttonIds[1]!;
    expect(rt.resolveNode(buttonId).text).toBe('Armaduras');
  });
});

describe('select', () => {
  it('single selection keeps one selected node per scope', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'click', nodeId: slots(0)[0]! });
    rt.dispatch({ type: 'click', nodeId: slots(0)[1]! });
    expect(rt.resolveNode(slots(0)[0]!).selected).toBe(false);
    expect(rt.resolveNode(slots(0)[1]!).selected).toBe(true);
  });

  it('multi selection toggles with the additive flag', () => {
    const { doc, slots } = tabbed();
    const multi = slots(0).reduce(
      (d, id) =>
        patchNode(d, id, (n) => ({
          ...n,
          behaviors: n.behaviors.map((b) =>
            b.kind === 'select' ? { ...b, mode: 'multi' as const } : b,
          ),
        })),
      doc,
    );
    const rt = start(multi);
    rt.dispatch({ type: 'click', nodeId: slots(0)[0]! });
    rt.dispatch({ type: 'click', nodeId: slots(0)[1]!, additive: true });
    expect(rt.resolveNode(slots(0)[0]!).selected).toBe(true);
    expect(rt.resolveNode(slots(0)[1]!).selected).toBe(true);
    rt.dispatch({ type: 'click', nodeId: slots(0)[0]!, additive: true });
    expect(rt.resolveNode(slots(0)[0]!).selected).toBe(false);
    rt.dispatch({ type: 'click', nodeId: slots(0)[2]! });
    expect(rt.resolveNode(slots(0)[1]!).selected).toBe(false);
    expect(rt.resolveNode(slots(0)[2]!).selected).toBe(true);
  });
});

describe('drag and drop', () => {
  it('moves an item into an empty slot', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    drag(rt, slots(0)[0]!, slots(0)[7]!);
    expect(iconIn(rt, doc, slots(0)[7]!)).toBe(iconOf('espada-de-hierro'));
    expect(iconIn(rt, doc, slots(0)[0]!)).toBeUndefined();
    expect(iconIn(rt, doc, slots(0)[1]!)).toBe(iconOf('arco-de-fresno'));
    expect(rt.getState().ui.drag).toBeNull();
    expect(lastIntent(rt)).toMatchObject({
      type: 'intent',
      name: 'inventory.moveItem',
      intentId: 'inventory.moveItem',
      handledBy: 'simulated',
      outcome: 'applied',
      connection: 'unconnected',
      payload: { itemId: 'espada-de-hierro', fromSlot: slots(0)[0], toSlot: slots(0)[7] },
    });
  });

  it('swaps two different items', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    drag(rt, slots(0)[0]!, slots(0)[2]!);
    expect(iconIn(rt, doc, slots(0)[0]!)).toBe(iconOf('baston-de-runas'));
    expect(iconIn(rt, doc, slots(0)[2]!)).toBe(iconOf('espada-de-hierro'));
  });

  it('exposes the drag state and the drop target feedback while dragging', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'dragStart', nodeId: slots(0)[1]! });
    expect(rt.getState().ui.drag).toMatchObject({
      sourceNodeId: slots(0)[1],
      itemRef: { dataSourceId: 'inventory.items', itemId: 'arco-de-fresno' },
    });
    expect(rt.resolveNode(slots(0)[5]!).dropState).toBe('accept');
    rt.dispatch({ type: 'dragCancel' });
    expect(rt.getState().ui.drag).toBeNull();
    expect(rt.resolveNode(slots(0)[5]!).dropState).toBeNull();
  });

  it('does not start a drag from an empty slot', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'dragStart', nodeId: slots(0)[9]! });
    expect(rt.getState().ui.drag).toBeNull();
  });

  it('merges equal stacks up to maxStack and leaves the remainder', () => {
    const { doc, slots } = stacks([
      rec('mineral', { quantity: 30, maxStack: 50 }),
      rec('mineral', { quantity: 30, maxStack: 50 }),
    ]);
    const rt = start(doc);
    drag(rt, slots[0]!, slots[1]!);
    expect(rt.resolveBinding(itemViewOf(doc, slots[1]!), 'quantity')).toBe(50);
    expect(rt.resolveBinding(itemViewOf(doc, slots[0]!), 'quantity')).toBe(10);
    expect(lastIntent(rt).outcome).toBe('applied');
  });

  it('merges completely when the stack fits, freeing the source slot', () => {
    const { doc, slots } = stacks([
      rec('mineral', { quantity: 10, maxStack: 50 }),
      rec('mineral', { quantity: 20, maxStack: 50 }),
    ]);
    const rt = start(doc);
    drag(rt, slots[0]!, slots[1]!);
    expect(rt.resolveBinding(itemViewOf(doc, slots[1]!), 'quantity')).toBe(30);
    expect(iconIn(rt, doc, slots[0]!)).toBeUndefined();
  });

  it('swaps instead of merging when the target stack is already full', () => {
    const { doc, slots } = stacks([
      rec('mineral', { quantity: 5, maxStack: 50 }),
      rec('mineral', { quantity: 50, maxStack: 50 }),
    ]);
    const rt = start(doc);
    drag(rt, slots[0]!, slots[1]!);
    expect(rt.resolveBinding(itemViewOf(doc, slots[0]!), 'quantity')).toBe(50);
    expect(rt.resolveBinding(itemViewOf(doc, slots[1]!), 'quantity')).toBe(5);
  });

  it('dropping on the source slot does nothing and emits no intent', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    drag(rt, slots(0)[0]!, slots(0)[0]!);
    expect(rt.getState().log).toEqual([]);
    expect(rt.getState().ui.drag).toBeNull();
  });
});

describe('stack display', () => {
  it('shows the quantity by default and hides it when showCount is false', () => {
    const shown = tabbed();
    const rtShown = start(shown.doc);
    rtShown.dispatch({ type: 'click', nodeId: shown.bar.buttonIds[2]! });
    expect(rtShown.resolveNode(itemViewOf(shown.doc, shown.slots(2)[0]!)).quantity).toBe(5);

    const hidden = tabbed({ showCount: false });
    const rtHidden = start(hidden.doc);
    rtHidden.dispatch({ type: 'click', nodeId: hidden.bar.buttonIds[2]! });
    const view = rtHidden.resolveNode(itemViewOf(hidden.doc, hidden.slots(2)[0]!));
    expect(view.quantity).toBeUndefined();
    expect(view.icon).toBe(iconOf('pocion-de-vida'));
  });
});

describe('context menu', () => {
  it('opens on secondary click with the slot actions and closes on menuClose', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'secondaryClick', nodeId: slots(0)[0]!, anchor: { x: 10, y: 20 } });
    const menu = rt.getState().ui.menu;
    expect(menu).toMatchObject({ nodeId: slots(0)[0], anchor: { x: 10, y: 20 } });
    expect(menu?.actions.map((a) => a.label)).toEqual(['Usar', 'Dividir', 'Soltar']);
    expect(menu?.actions.find((a) => a.id === 'split')?.disabled).toBe(true);
    rt.dispatch({ type: 'menuClose' });
    expect(rt.getState().ui.menu).toBeNull();
  });

  it('does not open on an empty slot or on a different trigger', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'secondaryClick', nodeId: slots(0)[9]!, anchor: { x: 0, y: 0 } });
    expect(rt.getState().ui.menu).toBeNull();
    rt.dispatch({ type: 'longPress', nodeId: slots(0)[0]!, anchor: { x: 0, y: 0 } });
    expect(rt.getState().ui.menu).toBeNull();
  });

  it('opens on long press when the behavior asks for it', () => {
    const { doc, slots } = tabbed();
    const longPress = patchNode(doc, slots(0)[0]!, (n) => ({
      ...n,
      behaviors: n.behaviors.map((b) =>
        b.kind === 'contextMenu' ? { ...b, trigger: 'longPress' as const } : b,
      ),
    }));
    const rt = start(longPress);
    rt.dispatch({ type: 'secondaryClick', nodeId: slots(0)[0]!, anchor: { x: 0, y: 0 } });
    expect(rt.getState().ui.menu).toBeNull();
    rt.dispatch({ type: 'longPress', nodeId: slots(0)[0]!, anchor: { x: 3, y: 4 } });
    expect(rt.getState().ui.menu?.anchor).toEqual({ x: 3, y: 4 });
  });

  it('use decrements the quantity and closes the menu', () => {
    const { doc, bar, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'click', nodeId: bar.buttonIds[2]! });
    menuAction(rt, slots(2)[0]!, 'use');
    expect(rt.getState().ui.menu).toBeNull();
    expect(rt.resolveBinding(itemViewOf(doc, slots(2)[0]!), 'quantity')).toBe(4);
    expect(lastIntent(rt)).toMatchObject({
      name: 'inventory.useItem',
      handledBy: 'simulated',
      outcome: 'applied',
      payload: { itemId: 'pocion-de-vida', slotId: slots(2)[0] },
    });
  });

  it('use removes the item when the last unit is consumed', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    menuAction(rt, slots(0)[0]!, 'use');
    expect(iconIn(rt, doc, slots(0)[0]!)).toBeUndefined();
    expect(iconIn(rt, doc, slots(0)[1]!)).toBe(iconOf('arco-de-fresno'));
    expect(rt.getState().data['inventory.items']).toHaveLength(15);
  });

  it('drop removes the item', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    menuAction(rt, slots(0)[1]!, 'drop');
    expect(iconIn(rt, doc, slots(0)[1]!)).toBeUndefined();
    expect(lastIntent(rt).name).toBe('inventory.dropItem');
  });

  it('rejects an action whose intent nobody handles, without changing data', () => {
    const { doc, slots } = tabbed();
    const custom = patchNode(
      {
        ...doc,
        intents: [
          ...doc.intents,
          {
            id: 'ui.menuAction',
            name: 'ui.menuAction',
            description: '',
            payload: [],
            connection: 'unconnected' as const,
          },
        ],
      },
      slots(0)[0]!,
      (n) => ({
        ...n,
        behaviors: n.behaviors.map((b) =>
          b.kind === 'contextMenu'
            ? {
                ...b,
                actions: [{ id: 'inspect', label: 'Inspeccionar', intentId: 'ui.menuAction' }],
              }
            : b,
        ),
      }),
    );
    const rt = start(custom);
    const before = JSON.stringify(rt.getState().data);
    menuAction(rt, slots(0)[0]!, 'inspect');
    expect(lastIntent(rt)).toMatchObject({ handledBy: 'none', outcome: 'rejected' });
    expect(lastIntent(rt).reason).toMatch(/Sin manejador/);
    expect(JSON.stringify(rt.getState().data)).toBe(before);
  });
});

describe('split', () => {
  const potions = () =>
    stacks([rec('pocion', { quantity: 8, maxStack: 20, category: 'Materiales' })], {
      columns: 3,
      rows: 1,
    });

  it('opens the dialog from the Dividir action with max = quantity - 1', () => {
    const { doc, slots } = potions();
    const rt = start(doc);
    menuAction(rt, slots[0]!, 'split');
    expect(rt.getState().ui.menu).toBeNull();
    expect(rt.getState().ui.split).toMatchObject({ nodeId: slots[0], max: 7 });
    expect(rt.getState().log).toEqual([]);
    expect(rt.resolveNode(slots[1]!).disabled).toBe(true);
  });

  it('confirm moves the amount into the first empty slot', () => {
    const { doc, slots } = potions();
    const rt = start(doc);
    menuAction(rt, slots[0]!, 'split');
    rt.dispatch({ type: 'splitConfirm', amount: 3 });
    expect(rt.getState().ui.split).toBeNull();
    expect(rt.resolveBinding(itemViewOf(doc, slots[0]!), 'quantity')).toBe(5);
    expect(rt.resolveBinding(itemViewOf(doc, slots[1]!), 'quantity')).toBe(3);
    expect(iconIn(rt, doc, slots[1]!)).toBe(iconOf('pocion'));
    expect(lastIntent(rt)).toMatchObject({
      name: 'inventory.splitStack',
      outcome: 'applied',
      payload: { itemId: 'pocion', amount: 3 },
    });
  });

  it('keeps the dialog open for an invalid amount and closes it on cancel', () => {
    const { doc, slots } = potions();
    const rt = start(doc);
    menuAction(rt, slots[0]!, 'split');
    for (const amount of [0, 8, 2.5, -1]) rt.dispatch({ type: 'splitConfirm', amount });
    expect(rt.getState().ui.split).not.toBeNull();
    expect(rt.getState().log).toEqual([]);
    rt.dispatch({ type: 'splitCancel' });
    expect(rt.getState().ui.split).toBeNull();
  });

  it('rejects when the view has no free slot', () => {
    const { doc, slots } = stacks(
      [rec('pocion', { quantity: 8, maxStack: 20 }), rec('hierba', { quantity: 2, maxStack: 20 })],
      { columns: 2, rows: 1 },
    );
    const rt = start(doc);
    const before = JSON.stringify(rt.getState().data);
    menuAction(rt, slots[0]!, 'split');
    rt.dispatch({ type: 'splitConfirm', amount: 2 });
    expect(lastIntent(rt)).toMatchObject({ outcome: 'rejected', handledBy: 'simulated' });
    expect(lastIntent(rt).reason).toMatch(/libre/);
    expect(JSON.stringify(rt.getState().data)).toBe(before);
    expect(rt.getState().ui.split).toBeNull();
  });
});

describe('tooltip', () => {
  it('shows the hovered item and hides on leave', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'hover', nodeId: slots(0)[2]! });
    expect(rt.getState().ui.tooltip).toMatchObject({
      nodeId: slots(0)[2],
      record: { id: 'baston-de-runas', name: 'Bastón de runas' },
    });
    rt.dispatch({ type: 'hover', nodeId: itemViewOf(doc, slots(0)[1]!) });
    expect(rt.getState().ui.tooltip?.record).toMatchObject({ id: 'arco-de-fresno' });
    rt.dispatch({ type: 'hover', nodeId: null });
    expect(rt.getState().ui.tooltip).toBeNull();
  });

  it('has nothing to show on an empty slot', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'hover', nodeId: slots(0)[12]! });
    expect(rt.getState().ui.tooltip).toBeNull();
  });
});

describe('equipment', () => {
  const equipped = () => {
    const doc = buildDoc('inventory.grid+equipment');
    const slots = idsOfType(doc, 'slot');
    const equipment = Object.fromEntries(
      idsOfType(doc, 'equipmentSlot').map((id) => {
        const node = nodeOf(doc, id);
        return [node.type === 'equipmentSlot' ? node.props.slotType : id, id];
      }),
    );
    return { doc, slots, equipment: equipment as Record<string, string> };
  };

  it('starts with the mock equipment on the paper doll and out of the bag', () => {
    const { doc, slots, equipment } = equipped();
    const rt = start(doc);
    expect(rt.resolveBinding(itemViewOf(doc, equipment['weapon']!), 'icon')).toBe(
      iconOf('espada-de-hierro'),
    );
    expect(rt.resolveBinding(itemViewOf(doc, equipment['head']!), 'icon')).toBe(
      iconOf('yelmo-de-acero'),
    );
    expect(iconIn(rt, doc, slots[0]!)).toBe(iconOf('arco-de-fresno'));
  });

  it('accepts a matching slotType and sends the previous item back to the origin slot', () => {
    const { doc, slots, equipment } = equipped();
    const rt = start(doc);
    rt.dispatch({ type: 'dragStart', nodeId: slots[0]! });
    expect(rt.resolveNode(equipment['weapon']!).dropState).toBe('accept');
    rt.dispatch({ type: 'dragOver', nodeId: equipment['weapon']! });
    rt.dispatch({ type: 'drop', nodeId: equipment['weapon']! });
    expect(rt.resolveBinding(itemViewOf(doc, equipment['weapon']!), 'icon')).toBe(
      iconOf('arco-de-fresno'),
    );
    expect(iconIn(rt, doc, slots[0]!)).toBe(iconOf('espada-de-hierro'));
    expect(lastIntent(rt)).toMatchObject({
      name: 'inventory.equipItem',
      outcome: 'applied',
      handledBy: 'simulated',
      payload: { itemId: 'arco-de-fresno', slotType: 'weapon' },
    });
  });

  it('rejects a mismatched slotType: drop feedback and intent outcome', () => {
    const { doc, slots, equipment } = equipped();
    const rt = start(doc);
    const before = JSON.stringify(rt.getState().data);
    const potion = slots.findIndex((id) => iconIn(rt, doc, id) === iconOf('pocion-de-vida'));
    rt.dispatch({ type: 'dragStart', nodeId: slots[potion]! });
    expect(rt.resolveNode(equipment['weapon']!).dropState).toBe('reject');
    rt.dispatch({ type: 'drop', nodeId: equipment['weapon']! });
    expect(lastIntent(rt)).toMatchObject({ name: 'inventory.equipItem', outcome: 'rejected' });
    expect(lastIntent(rt).reason).toBeTruthy();
    expect(JSON.stringify(rt.getState().data)).toBe(before);
  });

  it('rejects an item of another equipment type', () => {
    const { doc, slots, equipment } = equipped();
    const rt = start(doc);
    rt.dispatch({ type: 'dragStart', nodeId: slots[0]! });
    expect(rt.resolveNode(equipment['head']!).dropState).toBe('reject');
  });
});

describe('custom intent handlers', () => {
  it('a rejection leaves data unchanged and logs the reason', () => {
    const { doc, slots } = tabbed();
    const handler = vi.fn(() => ({ accept: false, reason: 'Inventario bloqueado' }));
    const rt = start(doc, { handlers: { 'inventory.moveItem': handler } });
    const before = JSON.stringify(rt.getState().data);
    const placement = JSON.stringify(rt.getState().placement);
    drag(rt, slots(0)[0]!, slots(0)[7]!);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]).toMatchObject([
      { name: 'inventory.moveItem', payload: { itemId: 'espada-de-hierro', toSlot: slots(0)[7] } },
    ]);
    expect(JSON.stringify(rt.getState().data)).toBe(before);
    expect(JSON.stringify(rt.getState().placement)).toBe(placement);
    expect(lastIntent(rt)).toMatchObject({
      handledBy: 'custom',
      outcome: 'rejected',
      reason: 'Inventario bloqueado',
    });
  });

  it('an acceptance without data applies the simulated effect', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc, { handlers: { 'inventory.moveItem': () => ({ accept: true }) } });
    drag(rt, slots(0)[0]!, slots(0)[7]!);
    expect(iconIn(rt, doc, slots(0)[7]!)).toBe(iconOf('espada-de-hierro'));
    expect(lastIntent(rt)).toMatchObject({ handledBy: 'custom', outcome: 'applied' });
  });

  it('an acceptance with data makes the host authoritative', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc, {
      handlers: {
        'inventory.moveItem': () => ({
          accept: true,
          data: { 'inventory.items': [rec('hacha', { category: 'Armas' })] },
        }),
      },
    });
    drag(rt, slots(0)[0]!, slots(0)[7]!);
    expect(iconIn(rt, doc, slots(0)[0]!)).toBe(iconOf('hacha'));
    expect(iconIn(rt, doc, slots(0)[7]!)).toBeUndefined();
    expect(rt.getState().data['inventory.items']).toHaveLength(1);
  });

  it('a throwing handler is a rejection, not a crash', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc, {
      handlers: {
        'inventory.moveItem': () => {
          throw new Error('boom');
        },
      },
    });
    drag(rt, slots(0)[0]!, slots(0)[7]!);
    expect(lastIntent(rt)).toMatchObject({ handledBy: 'custom', outcome: 'rejected' });
    expect(lastIntent(rt).reason).toMatch(/boom/);
  });

  it('keeps the intent connection from the document and stamps events with now()', () => {
    const { doc, slots } = tabbed();
    const connected = withConnection(doc, 'inventory.moveItem', 'connected');
    const rt = start(connected, { now: () => 42 });
    drag(rt, slots(0)[0]!, slots(0)[7]!);
    expect(lastIntent(rt)).toMatchObject({
      connection: 'connected',
      handledBy: 'simulated',
      at: 42,
    });
    const unconnected = start(doc);
    drag(unconnected, slots(0)[0]!, slots(0)[7]!);
    expect(lastIntent(unconnected).connection).toBe('unconnected');
  });
});

describe('keyboard and gamepad navigation', () => {
  it('moves focus spatially across the grid', () => {
    const { doc, bar, slots } = tabbed();
    const rt = start(doc);
    const s = slots(0);
    rt.dispatch({ type: 'click', nodeId: s[0]! });
    expect(rt.getState().ui.focus).toBe(s[0]);
    rt.dispatch({ type: 'navigate', direction: 'right' });
    expect(rt.getState().ui.focus).toBe(s[1]);
    rt.dispatch({ type: 'navigate', direction: 'down' });
    expect(rt.getState().ui.focus).toBe(s[6]);
    rt.dispatch({ type: 'navigate', direction: 'left' });
    expect(rt.getState().ui.focus).toBe(s[5]);
    rt.dispatch({ type: 'navigate', direction: 'up' });
    expect(rt.getState().ui.focus).toBe(s[0]);
    rt.dispatch({ type: 'navigate', direction: 'left' });
    expect(rt.getState().ui.focus).toBe(s[0]);
    rt.dispatch({ type: 'navigate', direction: 'up' });
    expect(rt.getState().ui.focus).toBe(bar.buttonIds[0]);
    expect(rt.resolveNode(bar.buttonIds[0]!).focused).toBe(true);
  });

  it('starts at the first focusable in reading order and skips hidden tab content', () => {
    const { doc, bar, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'navigate', direction: 'down' });
    expect(rt.getState().ui.focus).toBe(bar.buttonIds[0]);
    rt.dispatch({ type: 'navigate', direction: 'down' });
    expect(rt.getState().ui.focus).toBe(slots(0)[0]);
    let guard = 0;
    while (rt.getState().ui.focus !== slots(0)[15] && guard++ < 40) {
      rt.dispatch({ type: 'navigate', direction: 'down' });
      rt.dispatch({ type: 'navigate', direction: 'right' });
    }
    expect(slots(1)).not.toContain(rt.getState().ui.focus);
  });

  it('submit acts as a click on the focused node and cancel closes layers', () => {
    const { doc, bar, slots } = tabbed();
    const rt = start(doc);
    rt.dispatch({ type: 'click', nodeId: bar.buttonIds[0]! });
    rt.dispatch({ type: 'navigate', direction: 'right' });
    expect(rt.getState().ui.focus).toBe(bar.buttonIds[1]);
    rt.dispatch({ type: 'submit' });
    expect(rt.getState().ui.activeTab[bar.id]).toBe('tab-2');

    rt.dispatch({ type: 'secondaryClick', nodeId: slots(1)[0]!, anchor: { x: 0, y: 0 } });
    expect(rt.getState().ui.menu).not.toBeNull();
    rt.dispatch({ type: 'cancel' });
    expect(rt.getState().ui.menu).toBeNull();

    rt.dispatch({ type: 'dragStart', nodeId: slots(1)[0]! });
    rt.dispatch({ type: 'cancel' });
    expect(rt.getState().ui.drag).toBeNull();
  });
});

describe('reset, subscriptions and immutability', () => {
  it('reset restores mock data, UI and the log', () => {
    const { doc, bar, slots } = tabbed();
    const rt = start(doc);
    const initial = JSON.stringify(rt.getState());
    drag(rt, slots(0)[0]!, slots(0)[7]!);
    rt.dispatch({ type: 'click', nodeId: bar.buttonIds[3]! });
    expect(JSON.stringify(rt.getState())).not.toBe(initial);
    rt.dispatch({ type: 'reset' });
    expect(JSON.stringify(rt.getState())).toBe(initial);
    expect(rt.getState().log).toEqual([]);
  });

  it('notifies subscribers on effective changes only, until unsubscribed', () => {
    const { doc, bar, slots } = tabbed();
    const rt = start(doc);
    const listener = vi.fn();
    const unsubscribe = rt.subscribe(listener);
    rt.dispatch({ type: 'hover', nodeId: null });
    rt.dispatch({ type: 'menuClose' });
    expect(listener).not.toHaveBeenCalled();
    rt.dispatch({ type: 'click', nodeId: bar.buttonIds[1]! });
    expect(listener).toHaveBeenCalledTimes(1);
    drag(rt, slots(1)[0]!, slots(1)[5]!);
    expect(listener.mock.calls.length).toBeGreaterThan(1);
    unsubscribe();
    const calls = listener.mock.calls.length;
    rt.dispatch({ type: 'click', nodeId: bar.buttonIds[0]! });
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('never mutates the input document and hands out immutable snapshots', () => {
    const doc = buildDoc('inventory.tabs');
    const bar = tabBarOf(doc);
    const slots = idsOfType(doc, 'slot', bar.contentIds[0]);
    const snapshot = JSON.stringify(doc);
    deepFreeze(doc);
    const rt = start(doc);
    const before = rt.getState();
    const beforeJson = JSON.stringify(before);
    drag(rt, slots[0]!, slots[7]!);
    menuAction(rt, slots[1]!, 'use');
    rt.dispatch({ type: 'click', nodeId: bar.buttonIds[2]! });
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(JSON.stringify(before)).toBe(beforeJson);
    expect(rt.getState()).not.toBe(before);
    expect(Object.isFrozen(rt.getState())).toBe(true);
  });

  it('ignores events aimed at unknown or hidden nodes', () => {
    const { doc, slots } = tabbed();
    const rt = start(doc);
    const before = JSON.stringify(rt.getState());
    rt.dispatch({ type: 'click', nodeId: 'missing' });
    rt.dispatch({ type: 'click', nodeId: slots(1)[0]! });
    rt.dispatch({ type: 'secondaryClick', nodeId: slots(1)[0]!, anchor: { x: 0, y: 0 } });
    expect(JSON.stringify(rt.getState())).toBe(before);
  });
});

describe('fixtures sanity', () => {
  it('builds the screen from real library entries', () => {
    const doc = buildDoc('inventory.grid');
    expect(doc.screens[0]?.id).toBe(SCREEN_ID);
    expect(subtreeOf(doc, ROOT_ID).filter((n) => n.type === 'slot')).toHaveLength(20);
  });
});
