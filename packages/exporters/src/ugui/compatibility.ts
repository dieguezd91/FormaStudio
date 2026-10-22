import type { Behavior, FormaDocument, FormaScreen } from '@forma/design-core';
import { getEntry } from '@forma/library';
import type { CompatibilityItem, CompatibilityReport, CompatibilityStatus } from '../report';
import type { ConvertedScreen } from './convert';

const LEVEL_ACTION: Record<CompatibilityStatus, string> = {
  supported: 'No requiere acción.',
  adapted: 'Revisá la adaptación antes de usarlo en tu proyecto.',
  approximate: 'Revisá el resultado visual en Unity.',
  unavailable: 'Elegí una alternativa: uGUI no puede reproducirlo.',
};

const BEHAVIOR_NOTES: Record<
  Exclude<Behavior['kind'], 'contextMenu'>,
  { status: CompatibilityStatus; impact: string }
> = {
  tabs: {
    status: 'supported',
    impact: 'Las pestañas cambian el contenido visible con el componente FormaTabs.',
  },
  select: {
    status: 'supported',
    impact: 'La selección de casillas se maneja con el componente FormaSelectable.',
  },
  dragDrop: {
    status: 'supported',
    impact: 'Arrastrar y soltar usa los handlers de eventos de uGUI (FormaDragDrop).',
  },
  stack: {
    status: 'supported',
    impact: 'El límite y el contador de pilas lo gestiona el componente FormaStack.',
  },
  split: {
    status: 'supported',
    impact: 'Dividir una pila pide la cantidad y emite la intención (FormaSplit).',
  },
  tooltip: {
    status: 'adapted',
    impact:
      'El tooltip aparece al pasar el cursor; en pantallas táctiles no hay hover, así que no se muestra.',
  },
};

const MENU_NOTES: Record<
  Extract<Behavior, { kind: 'contextMenu' }>['trigger'],
  { status: CompatibilityStatus; impact: string }
> = {
  secondaryClick: {
    status: 'supported',
    impact: 'El menú contextual se abre con el clic derecho del mouse (FormaContextMenu).',
  },
  button: {
    status: 'supported',
    impact: 'El menú contextual se abre al pulsar su botón (FormaContextMenu).',
  },
  longPress: {
    status: 'adapted',
    impact:
      'Con mouse no hay pulsación larga: el importador abre el menú con el clic derecho (y con pulsación larga en pantallas táctiles).',
  },
};

/** Merges findings that only differ by node, keeping the first node as `subject.nodeId`. */
class ItemCollector {
  private readonly merged = new Map<string, CompatibilityItem>();

  add(item: CompatibilityItem): void {
    const { nodeId: _nodeId, ...subject } = item.subject;
    void _nodeId;
    const key = JSON.stringify([subject, item.status, item.impact, item.action]);
    const existing = this.merged.get(key);
    const nodeIds = item.nodeIds ?? (item.subject.nodeId ? [item.subject.nodeId] : undefined);
    if (!existing) {
      this.merged.set(key, { ...item, ...(nodeIds ? { nodeIds: [...nodeIds] } : {}) });
    } else if (nodeIds) {
      existing.nodeIds = [...new Set([...(existing.nodeIds ?? []), ...nodeIds])];
    }
  }

  get items(): CompatibilityItem[] {
    return [...this.merged.values()];
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function describeReceived(screen: FormaScreen, converted: ConvertedScreen): string[] {
  const received = [
    `Un Prefab uGUI de «${screen.name}» con ${plural(converted.nodes.length, 'objeto', 'objetos')} y sus RectTransforms.`,
  ];
  const counts = new Map<string, number>();
  for (const node of converted.nodes) {
    for (const component of node.components) {
      counts.set(component.type, (counts.get(component.type) ?? 0) + 1);
    }
  }
  if (counts.size > 0) {
    received.push(
      `Componentes de comportamiento: ${[...counts].map(([type, n]) => `${type} ×${n}`).join(', ')}.`,
    );
  }
  const { colors, fontSizes, spacing, radii } = converted.theme;
  const tokens = [colors, fontSizes, spacing, radii].reduce((n, t) => n + Object.keys(t).length, 0);
  if (tokens > 0)
    received.push(`Un tema FormaTheme con ${plural(tokens, 'token', 'tokens')} de estilo.`);
  if (converted.dataSources.length + converted.intents.length > 0) {
    received.push(
      `Interfaces de conexión: ${plural(converted.dataSources.length, 'fuente de datos', 'fuentes de datos')} y ${plural(converted.intents.length, 'intención', 'intenciones')}.`,
    );
  }
  return received;
}

/** The pre-export compatibility report (design doc §10.7) for a converted screen. */
export function buildCompatibilityReport(
  doc: FormaDocument,
  screen: FormaScreen,
  converted: ConvertedScreen,
): CompatibilityReport {
  const collector = new ItemCollector();
  const youMustConnect: string[] = [];

  // Library hints, once per inserted entry (its topmost node).
  for (const { id } of converted.nodes) {
    const node = screen.nodes[id];
    const ref = node?.origin.ref;
    const entry = ref === undefined ? undefined : getEntry(ref);
    if (!node || !entry) continue;
    const parent = node.parentId === null ? undefined : screen.nodes[node.parentId];
    if (parent?.origin.ref === ref) continue;
    const hint = entry.compatibility['unity-ugui'];
    collector.add({
      subject: { nodeId: id },
      status: hint.level,
      impact: `${entry.name}: ${hint.note}`,
      action: LEVEL_ACTION[hint.level],
    });
  }

  for (const node of converted.nodes) {
    const nodeId = node.id;
    if (node.cornerRadius !== undefined) {
      collector.add({
        subject: { nodeId, property: 'cornerRadius' },
        status: 'approximate',
        impact:
          'uGUI no tiene bordes redondeados nativos; el importador usa un sprite 9-slice redondeado.',
        action:
          'Revisá el resultado en Unity o asigná tu propio sprite con las esquinas que quieras.',
      });
    }
    if (node.outline) {
      collector.add({
        subject: { nodeId, property: 'stroke' },
        status: 'approximate',
        impact: 'uGUI no dibuja bordes de panel; el trazo se aproxima con el componente Outline.',
        action: 'Revisá el grosor y el color del contorno en Unity.',
      });
    }
    if (node.canvasGroupAlpha !== undefined) {
      collector.add({
        subject: { nodeId, property: 'opacity' },
        status: 'supported',
        impact: 'La opacidad se aplica con un CanvasGroup y también afecta a los hijos del objeto.',
        action: LEVEL_ACTION.supported,
      });
    }

    for (const behavior of screen.nodes[nodeId]?.behaviors ?? []) {
      const note =
        behavior.kind === 'contextMenu'
          ? MENU_NOTES[behavior.trigger]
          : BEHAVIOR_NOTES[behavior.kind];
      collector.add({
        subject: { nodeId, behavior: behavior.kind },
        status: note.status,
        impact: note.impact,
        action: LEVEL_ACTION[note.status],
      });
    }
  }

  for (const source of converted.dataSources) {
    const subject = { dataSourceId: source.id };
    if (source.connection === 'connected') {
      collector.add({
        subject,
        status: 'supported',
        impact: `«${source.name}» está marcada como conectada: el juego entrega los datos reales.`,
        action: 'Verificá que tu IFormaDataSource entregue los campos declarados.',
      });
      continue;
    }
    const simulated = source.connection === 'simulated';
    collector.add({
      subject,
      status: simulated ? 'adapted' : 'unavailable',
      impact: simulated
        ? `«${source.name}» usa datos de ejemplo (solo vista previa): sin conexión la UI quedará vacía en el juego.`
        : `«${source.name}» no está conectada: la UI no tendrá datos.`,
      action: `Requiere conexión: implementá IFormaDataSource para «${source.name}».`,
    });
    youMustConnect.push(`Fuente de datos «${source.name}»: implementá IFormaDataSource.`);
  }

  for (const intent of converted.intents) {
    const subject = { intentName: intent.name };
    if (intent.connection === 'connected') {
      collector.add({
        subject,
        status: 'supported',
        impact: `La intención «${intent.name}» está conectada con el juego.`,
        action: LEVEL_ACTION.supported,
      });
    } else if (intent.connection === 'simulated') {
      collector.add({
        subject,
        status: 'adapted',
        impact: `La intención «${intent.name}» se resuelve con la simulación incluida, igual que en el modo Probar.`,
        action: `Reemplazá la simulación con tu IFormaIntentHandler para «${intent.name}».`,
      });
    } else {
      collector.add({
        subject,
        status: 'adapted',
        impact: `La UI emite «${intent.name}» pero nadie la atiende todavía: el juego decide qué ocurre.`,
        action: `Punto de conexión: implementá IFormaIntentHandler para «${intent.name}».`,
      });
      youMustConnect.push(`Intención «${intent.name}»: implementá IFormaIntentHandler.`);
    }
  }

  for (const note of converted.notes) collector.add(note);

  const items = collector.items;
  const counts = { supported: 0, adapted: 0, approximate: 0, unavailable: 0 };
  for (const item of items) counts[item.status]++;
  return {
    items,
    summary: { counts, youWillReceive: describeReceived(screen, converted), youMustConnect },
  };
}

/** Report for a screen that cannot be analyzed. */
export function missingScreenReport(screenId: string): CompatibilityReport {
  return {
    items: [
      {
        subject: {},
        status: 'unavailable',
        impact: `La pantalla «${screenId}» no existe en el documento.`,
        action: 'Elegí una pantalla existente para exportar.',
      },
    ],
    summary: {
      counts: { supported: 0, adapted: 0, approximate: 0, unavailable: 1 },
      youWillReceive: [],
      youMustConnect: [],
    },
  };
}
