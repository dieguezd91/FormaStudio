import { useState, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Lock, LockOpen } from 'lucide-react';
import type { FormaScreen } from '@forma/design-core';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { reorderBatch, updateNodeBatch } from '../batches';
import { editorStore, useActiveScreen, useEditor } from '../store';
import { NODE_TYPE_LABELS } from '../canvas/nodeStyle';
import { CommitInput } from '../inspector/fields';

/** Ids of every ancestor of the given nodes: these rows must be open to show the selection. */
function ancestorsOf(screen: FormaScreen, ids: readonly string[]): Set<string> {
  const open = new Set<string>();
  for (const id of ids) {
    for (let parent = screen.nodes[id]?.parentId; parent; parent = screen.nodes[parent]?.parentId) {
      open.add(parent);
    }
  }
  return open;
}

interface RowProps {
  screen: FormaScreen;
  nodeId: string;
  depth: number;
  expanded: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  editing: string | null;
  onToggle: (id: string) => void;
  onEdit: (id: string | null) => void;
}

function Row({ screen, nodeId, depth, expanded, selected, editing, onToggle, onEdit }: RowProps) {
  const node = screen.nodes[nodeId];
  if (!node) return null;
  const isRoot = nodeId === screen.rootId;
  const isOpen = expanded.has(nodeId);
  const isSelected = selected.has(nodeId);
  const hasChildren = node.children.length > 0;
  const parent = node.parentId ? screen.nodes[node.parentId] : undefined;
  const siblingIndex = parent ? parent.children.indexOf(nodeId) : -1;

  const select = (event: MouseEvent) => {
    if (isRoot) editorStore.getState().clearSelection();
    else editorStore.getState().select([nodeId], { additive: event.shiftKey });
  };

  const dispatchReorder = (delta: -1 | 1) => {
    const batch = reorderBatch(screen, nodeId, delta);
    if (batch) editorStore.getState().dispatch(batch);
  };

  const toggleLock = () =>
    editorStore
      .getState()
      .dispatch(
        updateNodeBatch(screen, nodeId, { locked: node.locked ? null : true }, node.locked ? 'Desbloquear' : 'Bloquear'),
      );

  const rename = (name: string) => {
    onEdit(null);
    const trimmed = name.trim();
    if (trimmed !== '' && trimmed !== node.name) {
      editorStore.getState().dispatch(updateNodeBatch(screen, nodeId, { name: trimmed }, 'Renombrar'));
    }
  };

  return (
    <>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isOpen : undefined}
        data-testid="layer-row"
        data-node-id={nodeId}
        onClick={select}
        className={cn(
          'group flex h-7 cursor-default items-center gap-1 rounded pr-1 text-[13px] hover:bg-accent/60',
          isSelected && 'bg-accent text-foreground',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          aria-label={isOpen ? 'Contraer' : 'Expandir'}
          className={cn('flex h-5 w-4 items-center justify-center text-muted-foreground', !hasChildren && 'invisible')}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(nodeId);
          }}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {editing === nodeId ? (
          <CommitInput
            autoFocus
            className="h-6 flex-1"
            value={node.name}
            onCommit={rename}
            onCancel={() => onEdit(null)}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate"
            title={`${NODE_TYPE_LABELS[node.type]} · doble clic para renombrar`}
            onDoubleClick={() => !isRoot && onEdit(nodeId)}
          >
            {node.name}
          </span>
        )}

        {!isRoot && editing !== nodeId ? (
          <span className={cn('hidden items-center group-hover:flex', isSelected && 'flex')}>
            <Tooltip label="Subir">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Subir ${node.name}`}
                disabled={siblingIndex <= 0}
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchReorder(-1);
                }}
              >
                <ArrowUp size={13} />
              </Button>
            </Tooltip>
            <Tooltip label="Bajar">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Bajar ${node.name}`}
                disabled={!parent || siblingIndex >= parent.children.length - 1}
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchReorder(1);
                }}
              >
                <ArrowDown size={13} />
              </Button>
            </Tooltip>
          </span>
        ) : null}

        {!isRoot && editing !== nodeId ? (
          <Tooltip label={node.locked ? 'Desbloquear' : 'Bloquear'}>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', !node.locked && 'hidden group-hover:inline-flex')}
              aria-label={`${node.locked ? 'Desbloquear' : 'Bloquear'} ${node.name}`}
              aria-pressed={!!node.locked}
              onClick={(event) => {
                event.stopPropagation();
                toggleLock();
              }}
            >
              {node.locked ? <Lock size={13} className="text-primary" /> : <LockOpen size={13} />}
            </Button>
          </Tooltip>
        ) : null}
      </div>
      {isOpen
        ? node.children.map((childId) => (
            <Row
              key={childId}
              screen={screen}
              nodeId={childId}
              depth={depth + 1}
              expanded={expanded}
              selected={selected}
              editing={editing}
              onToggle={onToggle}
              onEdit={onEdit}
            />
          ))
        : null}
    </>
  );
}

export function HierarchyPanel() {
  const screen = useActiveScreen();
  const selection = useEditor((state) => state.selection);
  // Rows the user opened by hand; ancestors of the selection are always open.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  if (!screen) return null;

  const expanded = new Set<string>([screen.rootId, ...ancestorsOf(screen, selection), ...toggled]);

  const onToggle = (id: string) =>
    setToggled((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div role="tree" aria-label="Capas" className="p-2" data-testid="layers-tree">
      <Row
        screen={screen}
        nodeId={screen.rootId}
        depth={0}
        expanded={expanded}
        selected={new Set(selection)}
        editing={editing}
        onToggle={onToggle}
        onEdit={setEditing}
      />
    </div>
  );
}
