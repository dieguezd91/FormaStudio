import type { Connection, FormaDocument } from '@forma/design-core';

export interface SimulationEntry {
  id: string;
  name: string;
  connection: Connection;
  /** Spanish label for the honesty banner. */
  label: string;
}

export interface SimulationDescription {
  dataSources: SimulationEntry[];
  intents: SimulationEntry[];
  /** True only when there is something to connect and all of it is really connected. */
  allConnected: boolean;
}

export const CONNECTION_LABELS: Record<Connection, string> = {
  simulated: 'Datos simulados',
  unconnected: 'Sin conectar',
  connected: 'Conectado',
};

const entry = (id: string, name: string, connection: Connection): SimulationEntry => ({
  id,
  name,
  connection,
  label: CONNECTION_LABELS[connection],
});

/** The data sources a screen binds and the intents its behaviors can emit, with their real status. */
export function describeSimulation(doc: FormaDocument, screenId: string): SimulationDescription {
  const screen = doc.screens.find((s) => s.id === screenId);
  const sourceIds = new Set<string>();
  const intentIds = new Set<string>();
  for (const node of Object.values(screen?.nodes ?? {})) {
    node.bindings.forEach((b) => sourceIds.add(b.dataSourceId));
    for (const behavior of node.behaviors) {
      if (behavior.kind === 'dragDrop' || behavior.kind === 'split')
        intentIds.add(behavior.intentId);
      if (behavior.kind === 'contextMenu')
        behavior.actions.forEach((a) => intentIds.add(a.intentId));
    }
  }

  const dataSources = doc.dataSources
    .filter((d) => sourceIds.has(d.id))
    .map((d) => entry(d.id, d.name, d.connection));
  const intents = [...intentIds].map((id) => {
    const intent = doc.intents.find((i) => i.id === id);
    return entry(id, intent?.name ?? id, intent?.connection ?? 'unconnected');
  });
  const all = [...dataSources, ...intents];
  return {
    dataSources,
    intents,
    allConnected: all.length > 0 && all.every((e) => e.connection === 'connected'),
  };
}
