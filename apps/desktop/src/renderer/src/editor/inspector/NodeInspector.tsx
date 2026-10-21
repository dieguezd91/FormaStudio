import { Copy, Lock, LockOpen, Sparkles, Trash2 } from 'lucide-react';
import type { FormaDocument, FormaNode, FormaScreen, NodePatch } from '@forma/design-core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { actionLabelBatch, stackBatch, summarizeBehavior } from '../behaviors';
import { updateNodeBatch } from '../batches';
import { NODE_TYPE_LABELS } from '../canvas/nodeStyle';
import { editorStore } from '../store';
import { CommitInput, Field, NumberInput, Section } from './fields';
import { StyleField, type StyleInput } from './StyleField';

const CONNECTION_LABEL = {
  simulated: { text: 'simulado', tone: 'primary' },
  unconnected: { text: 'sin conectar', tone: 'neutral' },
  connected: { text: 'conectado', tone: 'success' },
} as const;

const dispatchPatch = (screen: FormaScreen, node: FormaNode, patch: NodePatch, action?: string) =>
  editorStore.getState().dispatch(updateNodeBatch(screen, node.id, patch, action));

const HAS_TEXT_STYLE = new Set<FormaNode['type']>(['text', 'button']);

function GeneralSection({ screen, node }: { screen: FormaScreen; node: FormaNode }) {
  const layout = (key: 'x' | 'y' | 'width' | 'height', value: number) =>
    dispatchPatch(screen, node, { layout: { [key]: value } }, 'Mover');
  const isRoot = node.id === screen.rootId;
  return (
    <Section title="General">
      <Field label="Nombre">
        <CommitInput
          aria-label="Nombre"
          data-testid="inspector-name"
          value={node.name}
          onCommit={(name) => {
            if (name.trim() === '') return false;
            dispatchPatch(screen, node, { name: name.trim() }, 'Renombrar');
          }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="X" className="grid-cols-[28px_1fr]">
          <NumberInput aria-label="X" value={node.layout.x} integer onCommit={(v) => layout('x', v)} />
        </Field>
        <Field label="Y" className="grid-cols-[28px_1fr]">
          <NumberInput aria-label="Y" value={node.layout.y} integer onCommit={(v) => layout('y', v)} />
        </Field>
        <Field label="Ancho" className="grid-cols-[40px_1fr]">
          <NumberInput
            aria-label="Ancho"
            value={node.layout.width}
            min={0}
            integer
            disabled={isRoot}
            onCommit={(v) => layout('width', v)}
          />
        </Field>
        <Field label="Alto" className="grid-cols-[40px_1fr]">
          <NumberInput
            aria-label="Alto"
            value={node.layout.height}
            min={0}
            integer
            disabled={isRoot}
            onCommit={(v) => layout('height', v)}
          />
        </Field>
      </div>
    </Section>
  );
}

function StyleSection({
  doc,
  screen,
  node,
}: {
  doc: FormaDocument;
  screen: FormaScreen;
  node: FormaNode;
}) {
  const style = node.style;
  const set = (key: keyof FormaNode['style']) => (value: StyleInput | null) =>
    dispatchPatch(screen, node, { style: { [key]: value } }, 'Cambiar estilo de');
  const common = { tokens: doc.tokens } as const;
  return (
    <Section title="Estilo" testId="inspector-style">
      <StyleField {...common} label="Relleno" prop="fill" kind="color" group="colors" value={style.fill} onChange={set('fill')} />
      <StyleField {...common} label="Borde" prop="stroke" kind="color" group="colors" value={style.stroke} onChange={set('stroke')} />
      <StyleField {...common} label="Grosor borde" prop="strokeWidth" kind="number" min={0} value={style.strokeWidth} onChange={set('strokeWidth')} />
      <StyleField {...common} label="Radio" prop="radius" kind="number" group="radii" min={0} value={style.radius} onChange={set('radius')} />
      <StyleField {...common} label="Opacidad" prop="opacity" kind="number" min={0} max={1} value={style.opacity} onChange={set('opacity')} />
      {HAS_TEXT_STYLE.has(node.type) ? (
        <>
          <StyleField {...common} label="Color de texto" prop="textColor" kind="color" group="colors" value={style.textColor} onChange={set('textColor')} />
          <StyleField {...common} label="Tamaño de texto" prop="fontSize" kind="number" group="fontSizes" min={1} value={style.fontSize} onChange={set('fontSize')} />
        </>
      ) : null}
    </Section>
  );
}

function PropsSection({ screen, node }: { screen: FormaScreen; node: FormaNode }) {
  // `false` makes a rejected edit revert the field (see `CommitInput`).
  const setProps = (props: Record<string, unknown>) =>
    dispatchPatch(screen, node, { props: props as NodePatch['props'] }, 'Editar').ok;
  switch (node.type) {
    case 'text':
      return (
        <Section title="Texto">
          <Field label="Contenido">
            <CommitInput aria-label="Contenido" value={node.props.text} onCommit={(text) => setProps({ text })} />
          </Field>
          <Field label="Alineación">
            <Select
              aria-label="Alineación"
              value={node.props.align}
              onChange={(event) => setProps({ align: event.target.value })}
            >
              <option value="left">Izquierda</option>
              <option value="center">Centro</option>
              <option value="right">Derecha</option>
            </Select>
          </Field>
        </Section>
      );
    case 'button':
      return (
        <Section title="Botón">
          <Field label="Etiqueta">
            <CommitInput aria-label="Etiqueta" value={node.props.label} onCommit={(label) => setProps({ label })} />
          </Field>
        </Section>
      );
    case 'inventoryGrid':
      return (
        <Section title="Cuadrícula">
          <Field label="Columnas">
            <NumberInput aria-label="Columnas" value={node.props.columns} min={1} integer onCommit={(columns) => setProps({ columns })} />
          </Field>
          <Field label="Filas">
            <NumberInput aria-label="Filas" value={node.props.rows} min={1} integer onCommit={(rows) => setProps({ rows })} />
          </Field>
          <Field label="Casilla">
            <span className="flex gap-1.5">
              <NumberInput
                aria-label="Ancho de casilla"
                value={node.props.slotSize.width}
                min={1}
                integer
                onCommit={(width) => setProps({ slotSize: { ...node.props.slotSize, width } })}
              />
              <NumberInput
                aria-label="Alto de casilla"
                value={node.props.slotSize.height}
                min={1}
                integer
                onCommit={(height) => setProps({ slotSize: { ...node.props.slotSize, height } })}
              />
            </span>
          </Field>
          <p className="text-xs text-muted-foreground">
            Estos valores describen la cuadrícula; las casillas existentes no se agregan ni quitan solas.
          </p>
        </Section>
      );
    case 'equipmentSlot':
      return (
        <Section title="Equipamiento">
          <Field label="Tipo de casilla">
            <CommitInput aria-label="Tipo de casilla" value={node.props.slotType} onCommit={(slotType) => setProps({ slotType })} />
          </Field>
        </Section>
      );
    case 'scroll':
      return (
        <Section title="Desplazamiento">
          <Field label="Dirección">
            <Select
              aria-label="Dirección"
              value={node.props.direction}
              onChange={(event) => setProps({ direction: event.target.value })}
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
              <option value="both">Ambas</option>
            </Select>
          </Field>
        </Section>
      );
    case 'image':
      return (
        <Section title="Imagen">
          <p className="text-xs text-muted-foreground">
            {node.props.placeholder ? 'Marcador de posición: todavía no tiene imagen asignada.' : 'Imagen asignada.'}
          </p>
        </Section>
      );
    default:
      return null;
  }
}

function BehaviorsSection({ screen, node }: { screen: FormaScreen; node: FormaNode }) {
  if (node.behaviors.length === 0) return null;
  const stack = node.behaviors.find((b) => b.kind === 'stack');
  const menu = node.behaviors.find((b) => b.kind === 'contextMenu');
  const dispatch = (batch: ReturnType<typeof stackBatch>) => {
    if (batch) editorStore.getState().dispatch(batch);
  };
  return (
    <Section title="Comportamientos" testId="inspector-behaviors">
      <ul className="space-y-1">
        {node.behaviors.map((behavior) => (
          <li key={behavior.kind} className="rounded bg-muted/50 px-2 py-1 text-xs">
            {summarizeBehavior(behavior)}
          </li>
        ))}
      </ul>
      {stack?.kind === 'stack' ? (
        <div className="space-y-2 rounded border border-border p-2">
          <p className="text-xs font-medium">Editar pila</p>
          <Field label="Máximo">
            <NumberInput
              aria-label="Máximo por pila"
              value={stack.maxStack}
              min={1}
              integer
              onCommit={(maxStack) => dispatch(stackBatch(screen, node.id, { maxStack }))}
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={stack.showCount}
              onChange={(event) => dispatch(stackBatch(screen, node.id, { showCount: event.target.checked }))}
            />
            Mostrar cantidad
          </label>
        </div>
      ) : null}
      {menu?.kind === 'contextMenu' ? (
        <div className="space-y-2 rounded border border-border p-2">
          <p className="text-xs font-medium">Acciones del menú contextual</p>
          {menu.actions.map((action) => (
            <Field key={action.id} label={action.id}>
              <CommitInput
                aria-label={`Acción ${action.id}`}
                value={action.label}
                onCommit={(label) => {
                  if (label.trim() === '') return false;
                  dispatch(actionLabelBatch(screen, node.id, action.id, label.trim()));
                }}
              />
            </Field>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Los demás comportamientos son de solo lectura por ahora.</p>
    </Section>
  );
}

function BindingsSection({ doc, node }: { doc: FormaDocument; node: FormaNode }) {
  if (node.bindings.length === 0) return null;
  return (
    <Section title="Datos conectados" testId="inspector-bindings">
      <ul className="space-y-1.5">
        {node.bindings.map((binding) => {
          const source = doc.dataSources.find((d) => d.id === binding.dataSourceId);
          const connection = source ? CONNECTION_LABEL[source.connection] : undefined;
          return (
            <li key={binding.id} className="rounded bg-muted/50 px-2 py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{binding.prop}</span>
                {connection ? (
                  <Badge tone={connection.tone} data-testid="binding-connection">
                    {connection.text}
                  </Badge>
                ) : (
                  <Badge tone="danger">fuente inexistente</Badge>
                )}
              </div>
              <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                {source?.name ?? binding.dataSourceId} · {binding.path}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function NodeInspector({
  doc,
  screen,
  node,
}: {
  doc: FormaDocument;
  screen: FormaScreen;
  node: FormaNode;
}) {
  const isRoot = node.id === screen.rootId;
  const state = editorStore.getState();
  return (
    <div data-testid="node-inspector">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{node.name}</p>
          <p className="text-xs text-muted-foreground">{NODE_TYPE_LABELS[node.type]}</p>
        </div>
        {node.locked ? <Badge tone="primary">Bloqueado</Badge> : null}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
        <Tooltip label="Disponible pronto">
          <Button variant="secondary" size="sm" disabled aria-label="Pedir a la IA">
            <Sparkles size={14} /> Pedir a la IA
          </Button>
        </Tooltip>
        {!isRoot ? (
          <>
            <Tooltip label="Duplicar (Ctrl+D)">
              <Button variant="ghost" size="icon" aria-label="Duplicar" onClick={() => state.duplicateSelection()}>
                <Copy size={15} />
              </Button>
            </Tooltip>
            <Tooltip label={node.locked ? 'Desbloquear' : 'Bloquear'}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={node.locked ? 'Desbloquear' : 'Bloquear'}
                onClick={() =>
                  dispatchPatch(screen, node, { locked: node.locked ? null : true }, node.locked ? 'Desbloquear' : 'Bloquear')
                }
              >
                {node.locked ? <LockOpen size={15} /> : <Lock size={15} />}
              </Button>
            </Tooltip>
            <Tooltip label="Eliminar (Supr)">
              <Button variant="destructive" size="icon" aria-label="Eliminar" onClick={() => state.deleteSelection()}>
                <Trash2 size={15} />
              </Button>
            </Tooltip>
          </>
        ) : null}
      </div>

      <GeneralSection screen={screen} node={node} />
      <StyleSection doc={doc} screen={screen} node={node} />
      <PropsSection screen={screen} node={node} />
      <BehaviorsSection screen={screen} node={node} />
      <BindingsSection doc={doc} node={node} />
    </div>
  );
}
