import { createContext, useContext, type CSSProperties, type PointerEvent } from 'react';
import { Image as ImageIcon, Lock } from 'lucide-react';
import type { FormaDocument, FormaNode, FormaScreen } from '@forma/design-core';
import { resolveItemPreview } from '@forma/runtime';
import { CLIPPING_TYPES, FILL_CENTERED, JUSTIFY, baseCss, iconHue, needsCentering } from './nodeStyle';

export interface CanvasContextValue {
  doc: FormaDocument;
  screen: FormaScreen;
  /** Nodes not drawn so alternative tab panels do not overlap. */
  hidden: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  onNodePointerDown: (event: PointerEvent, nodeId: string) => void;
}

export const CanvasContext = createContext<CanvasContextValue | null>(null);

function useCanvas(): CanvasContextValue {
  const context = useContext(CanvasContext);
  if (!context) throw new Error('NodeView must be rendered inside a CanvasContext.');
  return context;
}

function ItemPreview({ node }: { node: FormaNode }) {
  const { doc, screen } = useCanvas();
  const preview = resolveItemPreview(doc, node);
  if (!preview) return null;

  const slot = node.parentId ? screen.nodes[node.parentId] : undefined;
  const stack = slot?.behaviors.find((b) => b.kind === 'stack');
  const showCount = stack?.kind === 'stack' ? stack.showCount : true;
  const hue = iconHue(preview.icon ?? preview.name ?? node.id);
  const size = Math.max(12, Math.min(node.layout.width, node.layout.height) * 0.62);

  return (
    <div
      data-testid="item-preview"
      title={preview.name}
      className="flex h-full w-full items-center justify-center"
      style={{ pointerEvents: 'none' }}
    >
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
        {(preview.name ?? '?').charAt(0).toUpperCase()}
      </div>
      {showCount && preview.quantity !== undefined ? (
        <span
          data-testid="item-quantity"
          className="absolute bottom-0.5 right-1 rounded px-1 font-bold"
          style={{ fontSize: Math.max(9, node.layout.height * 0.2), background: 'rgb(0 0 0 / 0.6)', color: 'white' }}
        >
          ×{preview.quantity}
        </span>
      ) : null}
    </div>
  );
}

function NodeBody({ node }: { node: FormaNode }) {
  switch (node.type) {
    case 'text':
      return (
        <span
          className="flex h-full w-full items-center"
          style={{ justifyContent: JUSTIFY[node.props.align], textAlign: node.props.align, whiteSpace: 'pre-wrap' }}
        >
          {node.props.text}
        </span>
      );
    case 'button':
      return <span className="pointer-events-none px-1">{node.props.label}</span>;
    case 'image':
      return (
        <span className="flex h-full w-full items-center justify-center text-white/40">
          <ImageIcon size={Math.min(32, node.layout.height / 2)} />
        </span>
      );
    case 'itemView':
      return <ItemPreview node={node} />;
    case 'equipmentSlot':
      return (
        <span className="pointer-events-none text-[11px] opacity-60">{node.props.slotType || 'equipo'}</span>
      );
    case 'contextMenu':
    case 'tooltip':
      return (
        <span className="pointer-events-none text-[11px] opacity-60">
          {node.type === 'contextMenu' ? 'Menú contextual' : 'Tooltip'}
        </span>
      );
    default:
      return null;
  }
}

export function NodeView({ nodeId }: { nodeId: string }) {
  const { doc, screen, hidden, selected, onNodePointerDown } = useCanvas();
  const node = screen.nodes[nodeId];
  if (!node || hidden.has(nodeId)) return null;

  const isRoot = nodeId === screen.rootId;
  const isSelected = selected.has(nodeId);
  const css: CSSProperties = {
    ...baseCss(node, doc.tokens),
    ...(needsCentering(node.type) ? FILL_CENTERED : {}),
    overflow: CLIPPING_TYPES.has(node.type) ? 'hidden' : 'visible',
    ...(isRoot ? { left: 0, top: 0, width: screen.size.width, height: screen.size.height } : {}),
  };

  return (
    <div
      data-node-id={nodeId}
      data-node-type={node.type}
      data-node-name={node.name}
      data-selected={isSelected}
      data-locked={node.locked ? true : undefined}
      style={css}
      onPointerDown={(event) => onNodePointerDown(event, nodeId)}
    >
      <NodeBody node={node} />
      {node.children.map((childId) => (
        <NodeView key={childId} nodeId={childId} />
      ))}
      {isSelected && !isRoot ? <span className="node-label">{node.name}</span> : null}
      {node.locked ? (
        <span className="node-lock" title="Bloqueado" data-testid="lock-icon">
          <Lock size={11} />
        </span>
      ) : null}
    </div>
  );
}
