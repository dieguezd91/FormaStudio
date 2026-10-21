import {
  createNode,
  type Behavior,
  type Binding,
  type Layout,
  type NodeStyle,
  type NodeType,
  type Operation,
} from '@forma/design-core';
import type { BuildContext, BuildResult } from './catalog';

type NodeInit<T extends NodeType> = Parameters<typeof createNode<T>>[1];

export interface NodeSpec<T extends NodeType> {
  name: string;
  parentId: string;
  layout?: Partial<Layout>;
  style?: NodeStyle;
  props?: NodeInit<T>['props'];
  behaviors?: Behavior[];
  bindings?: Binding[];
}

/** Accumulates the operations of one library entry; parents must be added before children. */
export interface Builder {
  ops: Operation[];
  /** Adds a node under `spec.parentId` and returns its id. */
  add: <T extends NodeType>(type: T, spec: NodeSpec<T>) => string;
  /** For behaviors that reference nodes created after their owner (e.g. tab content). */
  setBehavior: (nodeId: string, behavior: Behavior) => void;
  setBinding: (nodeId: string, binding: Binding) => void;
  /** For containers whose size depends on content added after them. */
  resize: (nodeId: string, width: number, height: number) => void;
  finish: (
    rootNodeId: string,
    shared?: Pick<Partial<BuildResult>, 'dataSources' | 'intents'>,
  ) => BuildResult;
}

export function createBuilder(ctx: BuildContext): Builder {
  const ops: Operation[] = [];
  return {
    ops,
    add(type, spec) {
      const init: NodeInit<typeof type> = {
        id: ctx.newId('node'),
        name: spec.name,
        parentId: spec.parentId,
        origin: { source: 'library', ref: ctx.entryId },
        layout: spec.layout,
        style: spec.style,
        props: spec.props,
      };
      const node = createNode(type, init);
      node.behaviors = spec.behaviors ?? [];
      node.bindings = spec.bindings ?? [];
      ops.push({ type: 'addNode', screenId: ctx.screenId, node, parentId: spec.parentId });
      return node.id;
    },
    setBehavior(nodeId, behavior) {
      ops.push({ type: 'setBehavior', screenId: ctx.screenId, nodeId, behavior });
    },
    setBinding(nodeId, binding) {
      ops.push({ type: 'setBinding', screenId: ctx.screenId, nodeId, binding });
    },
    resize(nodeId, width, height) {
      ops.push({
        type: 'updateNode',
        screenId: ctx.screenId,
        nodeId,
        patch: { layout: { width, height } },
      });
    },
    finish: (rootNodeId, shared = {}) => ({
      ops,
      rootNodeId,
      dataSources: shared.dataSources ?? [],
      intents: shared.intents ?? [],
    }),
  };
}
