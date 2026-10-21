import type { CSSProperties } from 'react';
import type { FormaNode, StyleTokens } from '@forma/design-core';
import { resolveNodeStyle } from '../tokens';

/** CSS for one node: absolute box from its layout plus its style with tokens resolved. */
export function nodeCss(node: FormaNode, tokens: StyleTokens): CSSProperties {
  const style = resolveNodeStyle(node.style, tokens);
  const border =
    style.stroke !== undefined && (style.strokeWidth ?? 1) > 0
      ? `${style.strokeWidth ?? 1}px solid ${style.stroke}`
      : undefined;
  return {
    position: 'absolute',
    boxSizing: 'border-box',
    left: node.layout.x,
    top: node.layout.y,
    width: node.layout.width,
    height: node.layout.height,
    ...(style.fill === undefined ? {} : { background: style.fill }),
    ...(border === undefined ? {} : { border }),
    ...(style.radius === undefined ? {} : { borderRadius: style.radius }),
    ...(style.opacity === undefined ? {} : { opacity: style.opacity }),
    ...(style.textColor === undefined ? {} : { color: style.textColor }),
    ...(style.fontSize === undefined ? {} : { fontSize: style.fontSize }),
    ...(style.fontWeight === undefined ? {} : { fontWeight: style.fontWeight }),
  };
}

/** Types whose content may overflow their box without being clipped (labels sit outside). */
export const CLIPPING_TYPES: ReadonlySet<FormaNode['type']> = new Set(['scroll']);

export const NODE_TYPE_LABELS: Record<FormaNode['type'], string> = {
  frame: 'Marco',
  panel: 'Panel',
  text: 'Texto',
  image: 'Imagen',
  button: 'Botón',
  scroll: 'Desplazable',
  tabBar: 'Barra de pestañas',
  inventoryGrid: 'Cuadrícula de inventario',
  slot: 'Casilla',
  itemView: 'Ítem',
  equipmentSlot: 'Casilla de equipamiento',
  contextMenu: 'Menú contextual',
  tooltip: 'Tooltip',
};
