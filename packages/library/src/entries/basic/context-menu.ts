import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { INTENT_IDS, MENU_ACTION_INTENT, cloneIntents } from '../../intents';
import { surfaceStyle } from '../parts';

const ITEM_HEIGHT = 36;

export const contextMenuEntry = defineEntry({
  id: 'contextMenu',
  kind: 'component',
  category: 'interaction',
  name: 'Menú contextual',
  purpose: 'Muestra acciones secundarias de un elemento al hacer clic derecho o mantener pulsado.',
  tags: ['menú contextual', 'menu contextual', 'context menu', 'clic derecho', 'acciones', 'popup'],
  behaviors: ['contextMenu'],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': {
      level: 'adapted',
      note: 'Panel oculto que un MonoBehaviour muestra junto al cursor.',
    },
    'unity-uitoolkit': {
      level: 'approximate',
      note: 'Sin menú contextual nativo en runtime; se emula con un VisualElement.',
    },
    'web-react': { level: 'supported', note: 'Evento contextmenu con menú posicionado.' },
  },
  params: z.strictObject({
    actions: z
      .array(z.string().min(1))
      .min(1)
      .max(10)
      .default(['Opción 1', 'Opción 2', 'Opción 3'])
      .describe('Acciones'),
    width: z.number().int().min(80).max(600).default(180).describe('Ancho'),
  }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const gap = ctx.tokens.spacingValue('xs');
    const root = b.add('contextMenu', {
      name: 'Menú contextual',
      parentId: ctx.parentId,
      layout: {
        width: params.width,
        height: params.actions.length * (ITEM_HEIGHT + gap) + gap,
        mode: 'column',
        gap: ctx.tokens.spacing('xs'),
        padding: ctx.tokens.spacing('xs'),
      },
      style: surfaceStyle(ctx.tokens),
      behaviors: [
        {
          kind: 'contextMenu',
          trigger: 'secondaryClick',
          actions: params.actions.map((label, index) => ({
            id: `action-${index + 1}`,
            label,
            intentId: INTENT_IDS.menuAction,
          })),
        },
      ],
    });
    params.actions.forEach((label, index) => {
      b.add('button', {
        name: `Acción ${label}`,
        parentId: root,
        layout: {
          x: gap,
          y: gap + index * (ITEM_HEIGHT + gap),
          width: params.width - 2 * gap,
          height: ITEM_HEIGHT,
        },
        style: {
          fill: ctx.tokens.color('surfaceAlt'),
          textColor: ctx.tokens.color('text'),
          radius: ctx.tokens.radius('sm'),
          fontSize: ctx.tokens.fontSize('body'),
        },
        props: { label },
      });
    });
    return b.finish(root, { intents: cloneIntents([MENU_ACTION_INTENT]) });
  },
});
