import type { Connection } from '@forma/design-core';

/** A row of a collection data source. Keys starting with `__` are runtime bookkeeping. */
export type DataRecord = Record<string, unknown>;

export interface Point {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Everything the player (or the Test-mode UI on their behalf) can do to the prototype. */
export type UiEvent =
  | { type: 'click'; nodeId: string; additive?: boolean }
  | { type: 'secondaryClick'; nodeId: string; anchor: Point }
  | { type: 'longPress'; nodeId: string; anchor: Point }
  | { type: 'hover'; nodeId: string | null }
  | { type: 'dragStart'; nodeId: string }
  | { type: 'dragOver'; nodeId: string }
  | { type: 'drop'; nodeId: string }
  | { type: 'dragCancel' }
  | { type: 'menuAction'; actionId: string }
  | { type: 'menuClose' }
  | { type: 'splitConfirm'; amount: number }
  | { type: 'splitCancel' }
  | { type: 'navigate'; direction: Direction }
  | { type: 'submit' }
  | { type: 'cancel' }
  | { type: 'reset' };

export interface ItemRef {
  dataSourceId: string;
  /** Runtime-unique record id (`__uid`); `itemId` is the data's own `id`, shared by split stacks. */
  uid: string;
  itemId?: string;
}

export interface MenuAction {
  id: string;
  label: string;
  intentId: string;
  /** e.g. "Dividir" on a stack of one. */
  disabled: boolean;
}

export interface MenuState {
  nodeId: string;
  actions: MenuAction[];
  anchor: Point;
}

export interface TooltipState {
  nodeId: string;
  record: DataRecord;
}

export interface DragState {
  sourceNodeId: string;
  itemRef: ItemRef;
  /** Last node reported by `dragOver`. */
  overNodeId: string | null;
}

export interface SplitState {
  nodeId: string;
  itemRef: ItemRef;
  /** Largest amount that can be split off (quantity - 1). */
  max: number;
}

export interface RuntimeUiState {
  /** Active tab id per node carrying a `tabs` behavior. */
  activeTab: Record<string, string>;
  /** Selected node ids per select scope (the parent of the node carrying `select`). */
  selection: Record<string, string[]>;
  menu: MenuState | null;
  tooltip: TooltipState | null;
  drag: DragState | null;
  split: SplitState | null;
  focus: string | null;
}

export interface RuntimeEvent {
  type: 'intent';
  /** `now()` when the intent was emitted. */
  at: number;
  intentId: string;
  name: string;
  payload: Record<string, unknown>;
  /** The intent's real status in the document, never upgraded by the simulation. */
  connection: Connection;
  /** `simulated`: built-in stand-in for the game; `custom`: a host handler; `none`: nobody. */
  handledBy: 'simulated' | 'custom' | 'none';
  outcome: 'applied' | 'rejected';
  reason?: string;
}

export interface RuntimeState {
  /** Working copy of every data source's mock (records carry `__uid` / `__equippedAt`). */
  data: Record<string, unknown>;
  /** Slot order of each item view (`<dataSourceId>|<view path>`): record uid or null = empty. */
  placement: Record<string, (string | null)[]>;
  nextUid: number;
  ui: RuntimeUiState;
  log: RuntimeEvent[];
}

export interface IntentCall {
  intentId: string;
  name: string;
  payload: Record<string, unknown>;
  connection: Connection;
  /** Read-only data as it is before the intent takes effect. */
  data: Readonly<Record<string, unknown>>;
}

/**
 * What a host (the "game") answers. `accept: false` leaves data untouched. When accepted, `data`
 * (full replacement arrays per data source id) is authoritative; without it the built-in
 * simulated effect is applied.
 */
export interface IntentResult {
  accept: boolean;
  reason?: string;
  data?: Record<string, unknown>;
}

export type IntentHandler = (call: IntentCall) => IntentResult;
/** Keyed by intent name. */
export type IntentHandlers = Record<string, IntentHandler>;

export interface RuntimeOptions {
  handlers?: Partial<IntentHandlers>;
  now?: () => number;
}

export type DropState = 'accept' | 'reject';

export interface NodeView {
  visible: boolean;
  text?: string;
  icon?: string;
  quantity?: number;
  record?: DataRecord;
  selected: boolean;
  /** Input is blocked (a modal split dialog is open). */
  disabled: boolean;
  focused: boolean;
  dropState: DropState | null;
}

export interface Runtime {
  getState(): RuntimeState;
  subscribe(listener: () => void): () => void;
  dispatch(event: UiEvent): void;
  resolveBinding(nodeId: string, prop: string): unknown;
  resolveNode(nodeId: string): NodeView;
  isNodeVisible(nodeId: string): boolean;
}
