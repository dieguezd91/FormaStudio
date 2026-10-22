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

export const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

export const FILL_CENTERED: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
};

export const needsCentering = (type: FormaNode['type']): boolean =>
  type === 'button' || type === 'equipmentSlot' || type === 'contextMenu' || type === 'tooltip';

/** Box + style of a node as the canvas draws it, with the placeholder looks of unstyled types. */
export const baseCss = (node: FormaNode, tokens: StyleTokens): CSSProperties => {
  const css = nodeCss(node, tokens);
  if (node.type === 'button' && css.background === undefined) css.background = 'rgb(255 255 255 / 0.08)';
  if (node.type === 'image' && css.background === undefined) css.background = 'rgb(255 255 255 / 0.05)';
  if (node.type === 'image' || node.type === 'equipmentSlot') css.border ??= '1px dashed rgb(255 255 255 / 0.25)';
  if (node.type === 'contextMenu' || node.type === 'tooltip') css.border ??= '1px dashed rgb(255 255 255 / 0.25)';
  return css;
};

/** Stable pastel per icon path, so each mock item is recognisable without real art. */
export function iconHue(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}
