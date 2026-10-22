import { createContext, useContext, type CSSProperties } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { FormaDocument, FormaNode, FormaScreen } from '@forma/design-core';
import type { NodeView, Runtime, RuntimeState } from '@forma/runtime';
import { CLIPPING_TYPES, FILL_CENTERED, JUSTIFY, baseCss, iconHue, needsCentering } from '../canvas/nodeStyle';
import { tabForButton } from '../tabs';

export interface PlayContextValue {
  doc: FormaDocument;
  screen: FormaScreen;
  runtime: Runtime;
  /** Snapshot the tree is drawn from (re-renders the tree when it changes). */
  state: RuntimeState;
}

export const PlayContext = createContext<PlayContextValue | null>(null);

function usePlay(): PlayContextValue {
  const context = useContext(PlayContext);
  if (!context) throw new Error('PlayNode must be rendered inside a PlayContext.');
  return context;
}

/** Item icon placeholder (initial on a stable pastel) with its stack count. */
export function ItemChip({ view, node }: { view: NodeView; node: FormaNode }) {
  const name = typeof view.record?.['name'] === 'string' ? view.record['name'] : undefined;
  const size = Math.max(12, Math.min(node.layout.width, node.layout.height) * 0.62);
  const hue = iconHue(view.icon ?? name ?? node.id);
  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-center" data-testid="play-item">
      <div
        className="flex items-center justify-center rounded-md font-semibold"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.45,
          background: `oklch(0.55 0.12 ${hue})`,
          color: 'white',
        }}
      >
        {(name ?? '?').charAt(0).toUpperCase()}
      </div>
      {view.quantity !== undefined ? (
        <span
          data-testid="play-item-quantity"
          className="absolute bottom-0.5 right-1 rounded px-1 font-bold"
          style={{ fontSize: Math.max(9, node.layout.height * 0.2), background: 'rgb(0 0 0 / 0.6)', color: 'white' }}
        >
          ×{view.quantity}
        </span>
      ) : null}
    </div>
  );
}

function PlayBody({ node, view }: { node: FormaNode; view: NodeView }) {
  switch (node.type) {
    case 'text':
      return (
        <span
          className="flex h-full w-full items-center"
          style={{ justifyContent: JUSTIFY[node.props.align], textAlign: node.props.align, whiteSpace: 'pre-wrap' }}
        >
          {view.text ?? node.props.text}
        </span>
      );
    case 'button':
      return <span className="pointer-events-none px-1">{view.text ?? node.props.label}</span>;
    case 'image':
      return (
        <span className="pointer-events-none flex h-full w-full items-center justify-center text-white/40">
          <ImageIcon size={Math.min(32, node.layout.height / 2)} />
        </span>
      );
    case 'itemView':
      return view.record ? <ItemChip view={view} node={node} /> : null;
    case 'equipmentSlot':
      return view.record ? (
        <ItemChip view={view} node={node} />
      ) : (
        <span className="pointer-events-none text-[11px] opacity-60">{node.props.slotType || 'equipo'}</span>
      );
    default:
      return null;
  }
}

/** Visual state of a node: what is selected, focused, being dragged or a valid drop target. */
function stateCss(view: NodeView, dragging: boolean, activeTab: boolean): CSSProperties {
  const css: CSSProperties = {};
  if (view.selected || activeTab) {
    css.outline = '2px solid var(--primary)';
    css.outlineOffset = -1;
  }
  if (view.dropState === 'accept') {
    css.outline = '3px solid var(--success)';
    css.outlineOffset = -2;
    css.background = 'rgb(80 200 120 / 0.22)';
  } else if (view.dropState === 'reject') {
    css.outline = '3px solid var(--destructive)';
    css.outlineOffset = -2;
    css.background = 'rgb(220 70 60 / 0.22)';
    css.cursor = 'not-allowed';
  }
  if (view.focused) css.boxShadow = '0 0 0 3px #fff, 0 0 0 5px var(--primary)';
  if (dragging) css.opacity = 0.4;
  return css;
}

/** One node of the prototype, drawn from the runtime's view of it. Never editable. */
export function PlayNode({ nodeId }: { nodeId: string }) {
  const { doc, screen, runtime, state } = usePlay();
  const node = screen.nodes[nodeId];
  // Menus and tooltips are the runtime's overlays; their design placeholders are not drawn.
  if (!node || node.type === 'contextMenu' || node.type === 'tooltip') return null;
  const view = runtime.resolveNode(nodeId);
  if (!view.visible) return null;

  const isRoot = nodeId === screen.rootId;
  const tab = tabForButton(screen, nodeId);
  const activeTab = tab !== undefined && state.ui.activeTab[tab.tabBarId] === tab.tabId;
  const dragging = state.ui.drag?.sourceNodeId === nodeId;
  const css: CSSProperties = {
    ...baseCss(node, doc.tokens),
    ...(needsCentering(node.type) ? FILL_CENTERED : {}),
    overflow: CLIPPING_TYPES.has(node.type) ? 'hidden' : 'visible',
    ...(isRoot ? { left: 0, top: 0, width: screen.size.width, height: screen.size.height } : {}),
    ...(node.type === 'button' || node.type === 'slot' ? { cursor: 'pointer' } : {}),
    ...stateCss(view, dragging, activeTab),
  };
  const itemName = typeof view.record?.['name'] === 'string' ? view.record['name'] : undefined;

  return (
    <div
      data-play-node={nodeId}
      data-play-type={node.type}
      data-play-name={node.name}
      data-selected={view.selected || undefined}
      data-focused={view.focused || undefined}
      data-drop-state={view.dropState ?? undefined}
      data-dragging={dragging || undefined}
      data-item-name={node.type === 'itemView' ? itemName : undefined}
      style={css}
    >
      <PlayBody node={node} view={view} />
      {node.children.map((childId) => (
        <PlayNode key={childId} nodeId={childId} />
      ))}
    </div>
  );
}
