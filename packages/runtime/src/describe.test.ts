import { describe, expect, it } from 'vitest';
import { describeSimulation } from './describe';
import { SCREEN_ID, buildDoc, withConnection } from './test-fixtures';

describe('describeSimulation', () => {
  it('lists the screen data sources and intents with honest Spanish labels', () => {
    const description = describeSimulation(buildDoc('inventory.grid+equipment'), SCREEN_ID);
    expect(description.dataSources).toEqual([
      {
        id: 'inventory.items',
        name: 'inventory.items',
        connection: 'simulated',
        label: 'Datos simulados',
      },
    ]);
    const byId = Object.fromEntries(description.intents.map((i) => [i.id, i]));
    expect(Object.keys(byId).sort()).toEqual([
      'inventory.dropItem',
      'inventory.equipItem',
      'inventory.moveItem',
      'inventory.splitStack',
      'inventory.useItem',
    ]);
    expect(byId['inventory.moveItem']?.label).toBe('Sin conectar');
    expect(description.allConnected).toBe(false);
  });

  it('reports Conectado only for intents really connected', () => {
    const doc = withConnection(buildDoc('inventory.grid'), 'inventory.useItem', 'connected');
    const description = describeSimulation(doc, SCREEN_ID);
    const labels = Object.fromEntries(description.intents.map((i) => [i.id, i.label]));
    expect(labels['inventory.useItem']).toBe('Conectado');
    expect(labels['inventory.moveItem']).toBe('Sin conectar');
  });

  it('is empty for an unknown screen', () => {
    expect(describeSimulation(buildDoc('inventory.grid'), 'nope')).toEqual({
      dataSources: [],
      intents: [],
      allConnected: false,
    });
  });
});
