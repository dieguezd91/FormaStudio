import { createId, type IdGenerator } from './ids';
import type {
  FormaDocument,
  FormaNode,
  FormaScreen,
  NodeType,
  Origin,
  Size,
  Target,
} from './schema';

const DEFAULT_SCREEN_SIZE: Size = { width: 1920, height: 1080 };

export interface CreateDocumentInput {
  name: string;
  target: Target;
  id?: string;
  /** ISO timestamp; defaults to the current time. */
  now?: string;
  idGenerator?: IdGenerator;
}

export function createEmptyDocument(input: CreateDocumentInput): FormaDocument {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: 1,
    id: input.id ?? createId('doc', input.idGenerator),
    name: input.name,
    target: input.target,
    tokens: { colors: {}, fontSizes: {}, spacing: {}, radii: {} },
    screens: [],
    dataSources: [],
    intents: [],
    meta: { createdAt: now, updatedAt: now },
  };
}

type PropsOf<T extends NodeType> = Extract<FormaNode, { type: T }>['props'];

/** A function so every node gets its own props object. */
const defaultProps = () =>
  ({
    frame: {},
    panel: {},
    text: { text: '', align: 'left' },
    image: { placeholder: true },
    button: { label: '' },
    scroll: { direction: 'vertical' },
    tabBar: {},
    inventoryGrid: { columns: 5, rows: 4, slotSize: { width: 64, height: 64 } },
    slot: {},
    itemView: {},
    equipmentSlot: { slotType: '' },
    contextMenu: {},
    tooltip: {},
  }) satisfies { [T in NodeType]: PropsOf<T> };

export interface CreateNodeInit<T extends NodeType> {
  id: string;
  name: string;
  parentId?: string | null;
  children?: string[];
  layout?: Partial<FormaNode['layout']>;
  style?: FormaNode['style'];
  props?: PropsOf<T>;
  origin?: Origin;
  locked?: boolean;
}

/** Builds a schema-valid node with type-specific default props. */
export function createNode<T extends NodeType>(
  type: T,
  init: CreateNodeInit<T>,
): Extract<FormaNode, { type: T }> {
  const node = {
    id: init.id,
    type,
    name: init.name,
    parentId: init.parentId ?? null,
    children: init.children ?? [],
    layout: { x: 0, y: 0, width: 100, height: 100, mode: 'absolute', ...init.layout },
    style: init.style ?? {},
    props: init.props ?? defaultProps()[type],
    behaviors: [],
    bindings: [],
    origin: init.origin ?? { source: 'manual' },
    ...(init.locked === undefined ? {} : { locked: init.locked }),
  };
  return node as unknown as Extract<FormaNode, { type: T }>;
}

export interface CreateScreenInput {
  name: string;
  id?: string;
  rootId?: string;
  size?: Size;
  idGenerator?: IdGenerator;
}

/** Creates a screen holding a single stretched root frame. */
export function createScreen(input: CreateScreenInput): FormaScreen {
  const size = input.size ?? DEFAULT_SCREEN_SIZE;
  const id = input.id ?? createId('screen', input.idGenerator);
  const rootId = input.rootId ?? createId('node', input.idGenerator);
  const root = createNode('frame', {
    id: rootId,
    name: 'Root',
    layout: { width: size.width, height: size.height, anchor: 'stretch' },
  });
  return { id, name: input.name, size, rootId, nodes: { [rootId]: root } };
}
