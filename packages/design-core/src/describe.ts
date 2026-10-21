import { applyOperation, type Operation, type OperationBatch } from './operations';
import { subtreeIds } from './operations/support';
import type { FormaDocument } from './schema';

const nodeName = (doc: FormaDocument, screenId: string, nodeId: string): string =>
  doc.screens.find((s) => s.id === screenId)?.nodes[nodeId]?.name ?? nodeId;

const screenName = (doc: FormaDocument, screenId: string): string =>
  doc.screens.find((s) => s.id === screenId)?.name ?? screenId;

const keysOf = (section: object): string => {
  const keys = Object.entries(section)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  return keys.length > 0 ? ` (${keys.join(', ')})` : '';
};

/** Human-readable lines for one operation, resolved against the document before it applies. */
function describeOperation(doc: FormaDocument, op: Operation): string[] {
  switch (op.type) {
    case 'addNode': {
      const screen = doc.screens.find((s) => s.id === op.screenId);
      const target =
        screen && op.parentId === screen.rootId
          ? `screen '${screen.name}'`
          : `'${nodeName(doc, op.screenId, op.parentId)}'`;
      return [`Add node '${op.node.name}' to ${target}`];
    }
    case 'removeNode': {
      const screen = doc.screens.find((s) => s.id === op.screenId);
      const nested = screen ? subtreeIds(screen, op.nodeId).length - 1 : 0;
      const suffix = nested > 0 ? ` (and ${nested} nested node${nested === 1 ? '' : 's'})` : '';
      return [`Remove node '${nodeName(doc, op.screenId, op.nodeId)}'${suffix}`];
    }
    case 'updateNode': {
      const name = nodeName(doc, op.screenId, op.nodeId);
      const { patch } = op;
      const lines: string[] = [];
      if (patch.name !== undefined) lines.push(`Rename '${name}' to '${patch.name}'`);
      if (patch.layout) lines.push(`Change layout of '${name}'${keysOf(patch.layout)}`);
      if (patch.style) lines.push(`Change style of '${name}'${keysOf(patch.style)}`);
      if (patch.props) lines.push(`Change properties of '${name}'${keysOf(patch.props)}`);
      if (patch.locked !== undefined) {
        lines.push(`${patch.locked ? 'Lock' : 'Unlock'} '${name}'`);
      }
      return lines.length > 0 ? lines : [`Update '${name}' (no changes)`];
    }
    case 'moveNode':
      return [
        `Move '${nodeName(doc, op.screenId, op.nodeId)}' into '${nodeName(doc, op.screenId, op.newParentId)}'`,
      ];
    case 'setBehavior': {
      const node = doc.screens.find((s) => s.id === op.screenId)?.nodes[op.nodeId];
      const name = nodeName(doc, op.screenId, op.nodeId);
      const exists = node?.behaviors.some((b) => b.kind === op.behavior.kind);
      return [
        exists
          ? `Change '${op.behavior.kind}' behavior of '${name}'`
          : `Add '${op.behavior.kind}' behavior to '${name}'`,
      ];
    }
    case 'removeBehavior':
      return [`Remove '${op.kind}' behavior from '${nodeName(doc, op.screenId, op.nodeId)}'`];
    case 'setBinding': {
      const source = doc.dataSources.find((d) => d.id === op.binding.dataSourceId);
      return [
        `Bind '${op.binding.prop}' of '${nodeName(doc, op.screenId, op.nodeId)}' to '${source?.name ?? op.binding.dataSourceId}' (${op.binding.path})`,
      ];
    }
    case 'removeBinding': {
      const node = doc.screens.find((s) => s.id === op.screenId)?.nodes[op.nodeId];
      const prop = node?.bindings.find((b) => b.id === op.bindingId)?.prop ?? op.bindingId;
      return [`Remove binding '${prop}' from '${nodeName(doc, op.screenId, op.nodeId)}'`];
    }
    case 'setToken':
      return [`Set token ${op.group}.${op.name} to ${op.value}`];
    case 'removeToken':
      return [`Remove token ${op.group}.${op.name}`];
    case 'addScreen':
      return [`Add screen '${op.screen.name}'`];
    case 'removeScreen':
      return [`Remove screen '${screenName(doc, op.screenId)}'`];
    case 'renameScreen':
      return [`Rename screen '${screenName(doc, op.screenId)}' to '${op.name}'`];
    case 'upsertDataSource': {
      const exists = doc.dataSources.some((d) => d.id === op.dataSource.id);
      return [`${exists ? 'Update' : 'Add'} data source '${op.dataSource.name}'`];
    }
    case 'removeDataSource':
      return [
        `Remove data source '${doc.dataSources.find((d) => d.id === op.dataSourceId)?.name ?? op.dataSourceId}'`,
      ];
    case 'upsertIntent': {
      const exists = doc.intents.some((i) => i.id === op.intent.id);
      return [`${exists ? 'Update' : 'Add'} intent '${op.intent.name}'`];
    }
    case 'removeIntent':
      return [
        `Remove intent '${doc.intents.find((i) => i.id === op.intentId)?.name ?? op.intentId}'`,
      ];
  }
}

/**
 * Change list for previewing a batch (e.g. an AI proposal) before applying it. Operations are
 * resolved against the evolving document, so later ops can refer to nodes added earlier. An
 * operation that would be rejected is still listed, annotated with the reason; the preview then
 * continues from the unchanged document, mirroring what `applyBatch` would refuse as a whole.
 */
export function describeBatch(doc: FormaDocument, batch: OperationBatch): string[] {
  let working = doc;
  const lines: string[] = [];
  for (const op of batch.ops) {
    const described = describeOperation(working, op);
    const result = applyOperation(working, op, { source: batch.source });
    if (result.ok) {
      working = result.doc;
      lines.push(...described);
    } else {
      lines.push(`${described[0] ?? op.type} — rejected: ${result.error.message}`);
    }
  }
  return lines;
}
