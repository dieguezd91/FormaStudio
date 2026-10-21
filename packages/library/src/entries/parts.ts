import type { NodeStyle } from '@forma/design-core';
import type { Builder } from '../builder';
import type { BuildContext } from '../catalog';
import type { TokenKit } from '../tokens';

export const surfaceStyle = (t: TokenKit): NodeStyle => ({
  fill: t.color('surface'),
  stroke: t.color('border'),
  strokeWidth: 1,
  radius: t.radius('md'),
});

export const slotStyle = (t: TokenKit): NodeStyle => ({
  fill: t.color('surfaceAlt'),
  stroke: t.color('border'),
  strokeWidth: 1,
  radius: t.radius('sm'),
});

export interface TextSpec {
  parentId: string;
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  size?: 'small' | 'body' | 'title';
  muted?: boolean;
  align?: 'left' | 'center' | 'right';
}

const TEXT_HEIGHT = { small: 18, body: 24, title: 32 } as const;

export function addText(b: Builder, ctx: BuildContext, spec: TextSpec): string {
  const size = spec.size ?? 'body';
  return b.add('text', {
    name: spec.name,
    parentId: spec.parentId,
    layout: { x: spec.x, y: spec.y, width: spec.width, height: spec.height ?? TEXT_HEIGHT[size] },
    style: {
      textColor: ctx.tokens.color(spec.muted ? 'textMuted' : 'text'),
      fontSize: ctx.tokens.fontSize(size),
    },
    props: { text: spec.text, align: spec.align ?? 'left' },
  });
}

export interface TabsSpec {
  parentId: string;
  x: number;
  y: number;
  labels: string[];
  contentWidth: number;
  contentHeight: number;
  /** Fills one tab's content panel. */
  fillContent: (contentId: string, label: string, index: number) => void;
}

export const TAB_WIDTH = 112;
export const TAB_HEIGHT = 36;

/**
 * A tab bar with one button per tab plus one content panel per tab, all stacked in the same
 * area (the runtime shows the active one). Wires the `tabs` behavior to the content panels.
 */
export function addTabs(
  b: Builder,
  ctx: BuildContext,
  spec: TabsSpec,
): { tabBarId: string; contentIds: string[]; width: number; height: number } {
  const gap = ctx.tokens.spacingValue('sm');
  const barWidth = spec.labels.length * TAB_WIDTH + (spec.labels.length - 1) * gap;
  const width = Math.max(spec.contentWidth, barWidth);

  const tabBarId = b.add('tabBar', {
    name: 'Barra de pestañas',
    parentId: spec.parentId,
    layout: {
      x: spec.x,
      y: spec.y,
      width,
      height: TAB_HEIGHT,
      mode: 'row',
      gap: ctx.tokens.spacing('sm'),
    },
  });
  spec.labels.forEach((label, index) => {
    b.add('button', {
      name: `Pestaña ${label}`,
      parentId: tabBarId,
      layout: { x: index * (TAB_WIDTH + gap), y: 0, width: TAB_WIDTH, height: TAB_HEIGHT },
      style: {
        fill: ctx.tokens.color(index === 0 ? 'accent' : 'surfaceAlt'),
        textColor: ctx.tokens.color(index === 0 ? 'accentText' : 'text'),
        radius: ctx.tokens.radius('sm'),
        fontSize: ctx.tokens.fontSize('body'),
      },
      props: { label },
    });
  });

  const contentY = spec.y + TAB_HEIGHT + gap;
  const contentIds = spec.labels.map((label, index) => {
    const contentId = b.add('panel', {
      name: `Contenido ${label}`,
      parentId: spec.parentId,
      layout: { x: spec.x, y: contentY, width, height: spec.contentHeight },
    });
    spec.fillContent(contentId, label, index);
    return contentId;
  });

  const tabs = spec.labels.map((label, index) => ({
    id: `tab-${index + 1}`,
    label,
    contentNodeId: contentIds[index] ?? '',
  }));
  b.setBehavior(tabBarId, { kind: 'tabs', tabs, initialTabId: 'tab-1' });
  return {
    tabBarId,
    contentIds,
    width,
    height: TAB_HEIGHT + gap + spec.contentHeight,
  };
}
