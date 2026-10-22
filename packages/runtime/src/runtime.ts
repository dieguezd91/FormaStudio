import type { FormaDocument } from '@forma/design-core';
import { cloneJson } from './clone';
import { dropStateOf, handleEvent } from './events';
import type { Env } from './intents';
import { publicRecord, recordAt, resolveRuntimePath, seedRecords } from './records';
import { createScreenIndex, type ScreenIndex } from './screen';
import type { NodeView, Runtime, RuntimeOptions, RuntimeState, UiEvent } from './types';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function initialState(doc: FormaDocument, index: ScreenIndex): RuntimeState {
  const activeTab: Record<string, string> = {};
  for (const bar of index.tabNodes) {
    const tabs = index.behaviorOf(bar, 'tabs');
    if (tabs) activeTab[bar.id] = tabs.initialTabId;
  }
  const state: RuntimeState = {
    data: {},
    placement: {},
    nextUid: 1,
    ui: {
      activeTab,
      selection: {},
      menu: null,
      tooltip: null,
      drag: null,
      split: null,
      focus: null,
    },
    log: [],
  };
  seedRecords(state, index, new Map(doc.dataSources.map((d) => [d.id, d.mock])));
  return deepFreeze(state);
}

/**
 * Test-mode runtime for one screen: the single source of behavior semantics. Pure and
 * framework-free; the document is never mutated and every state is an immutable snapshot.
 */
export function createRuntime(
  doc: FormaDocument,
  screenId: string,
  options: RuntimeOptions = {},
): Runtime {
  const index = createScreenIndex(doc, screenId);
  const env: Env = { doc, index, handlers: options.handlers ?? {}, now: options.now ?? Date.now };
  const initial = initialState(doc, index);
  let state = initial;
  const listeners = new Set<() => void>();

  const commit = (next: RuntimeState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const isNodeVisible = (nodeId: string) =>
    index.node(nodeId) !== undefined && !index.hiddenNodes(state.ui.activeTab).has(nodeId);

  const resolveBinding = (nodeId: string, prop: string): unknown => {
    const binding = index.node(nodeId)?.bindings.find((b) => b.prop === prop);
    if (!binding) return undefined;
    const equipment = index.equipmentOf(nodeId);
    return resolveRuntimePath(state, binding.dataSourceId, binding.path, equipment?.id ?? null);
  };

  const resolveNode = (nodeId: string): NodeView => {
    const node = index.node(nodeId);
    if (!node) {
      return { visible: false, selected: false, disabled: false, focused: false, dropState: null };
    }
    const cell = index.cellOf(nodeId);
    const record = cell && recordAt(state, cell);
    const bound = (prop: string) => resolveBinding(nodeId, prop) ?? record?.[prop];

    const text = resolveBinding(nodeId, 'text');
    const label =
      node.type === 'text'
        ? node.props.text
        : node.type === 'button'
          ? node.props.label
          : undefined;
    const shownText = typeof text === 'string' ? text : label;
    const icon = bound('icon');
    const quantity = bound('quantity');
    const showCount = index.findBehavior(nodeId, 'stack')?.behavior.showCount ?? true;
    return {
      visible: isNodeVisible(nodeId),
      ...(shownText !== undefined ? { text: shownText } : {}),
      ...(typeof icon === 'string' ? { icon } : {}),
      ...(typeof quantity === 'number' && showCount ? { quantity } : {}),
      ...(record ? { record: publicRecord(record) } : {}),
      selected: Object.values(state.ui.selection).some((ids) => ids.includes(nodeId)),
      disabled: state.ui.split !== null,
      focused: state.ui.focus === nodeId,
      dropState: dropStateOf(env, state, nodeId),
    };
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispatch(event: UiEvent) {
      if (event.type === 'reset') {
        if (state !== initial) commit(initial);
        return;
      }
      const draft = cloneJson(state);
      handleEvent(env, draft, event);
      if (JSON.stringify(draft) !== JSON.stringify(state)) commit(deepFreeze(draft));
    },
    resolveBinding,
    resolveNode,
    isNodeVisible,
  };
}
