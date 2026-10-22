import { randomUUID } from 'node:crypto';
import {
  buildLibraryCatalog,
  editOutputSchema,
  generateValidated,
  type AiProvider,
  type EditItem,
} from '@forma/ai';
import { EDIT_SYSTEM, buildEditMessages } from '@forma/ai/prompts';
import {
  applyBatch,
  applyOperation,
  describeBatch,
  parseOperationBatch,
  validateDocument,
  type FormaDocument,
  type FormaScreen,
  type Operation,
  type OperationBatch,
  type OperationError,
  type ValidationIssue,
} from '@forma/design-core';
import { insertEntry } from '@forma/library';
import type { Repository, StoredDocument } from '../db';
import { notFound, unprocessable } from '../errors';
import { warning, type AiWarning } from './warnings';

export interface EditRequest {
  instruction: string;
  screenId: string;
  selectedNodeIds: string[];
  proposalIds?: string[] | undefined;
}

export interface EditPreview {
  /** Revision the batch was computed against; pass it back as `baseRevision` when applying. */
  baseRevision: number;
  batch: OperationBatch;
  changes: string[];
  explanation: string;
  warnings: AiWarning[];
}

const MAX_CONTEXT_CHARS = 120_000;
const MAX_PROPOSAL_NODES = 150;

const newId = () => randomUUID().replaceAll('-', '').slice(0, 10);

function subtree(screen: FormaScreen, rootId: string): string[] {
  const ids: string[] = [];
  const visit = (id: string) => {
    const node = screen.nodes[id];
    if (!node || ids.includes(id)) return;
    ids.push(id);
    node.children.forEach(visit);
  };
  visit(rootId);
  return ids;
}

const issueKey = (issue: ValidationIssue) =>
  `${issue.code}|${issue.screenId ?? ''}|${issue.nodeId ?? ''}|${issue.message}`;

const nodeLabel = (screen: FormaScreen, id: string) =>
  screen.nodes[id] ? `«${screen.nodes[id].name}» (${id})` : `«${id}»`;

/** Why an operation may not run under the selection scope (§6.4), or `undefined` if it may. */
function scopeViolation(
  op: Operation,
  screen: FormaScreen,
  allowed: ReadonlySet<string>,
  scoped: boolean,
): string | undefined {
  const outside = (id: string) => `el nodo ${nodeLabel(screen, id)} está fuera de la selección`;
  switch (op.type) {
    case 'addNode':
    case 'removeNode':
    case 'updateNode':
    case 'moveNode':
    case 'setBehavior':
    case 'removeBehavior':
    case 'setBinding':
    case 'removeBinding': {
      if (op.screenId !== screen.id) {
        return `apunta a la pantalla «${op.screenId}», no a la que se está editando`;
      }
      if (!scoped) return undefined;
      if (op.type === 'addNode') return allowed.has(op.parentId) ? undefined : outside(op.parentId);
      if (!allowed.has(op.nodeId)) return outside(op.nodeId);
      if (op.type === 'moveNode' && !allowed.has(op.newParentId)) return outside(op.newParentId);
      return undefined;
    }
    default:
      return scoped ? 'afecta al documento completo, no solo a la selección' : undefined;
  }
}

type Expansion =
  | { kind: 'invalid'; issues: string[] }
  | { kind: 'applyError'; error: OperationError; opIndex: number }
  | { kind: 'ok'; batch: OperationBatch; warnings: AiWarning[] };

/**
 * Turns the model's items into one batch by replaying them on a working copy: library insertions
 * are expanded with `insertEntry`, operations outside the scope are dropped with a warning, and
 * the result is checked again with the schema, `applyBatch` and `validateDocument`.
 */
function expandEdit(
  stored: StoredDocument,
  screen: FormaScreen,
  items: EditItem[],
  selection: string[],
  label: string,
): Expansion {
  const scoped = selection.length > 0;
  const allowed = new Set(selection.flatMap((id) => subtree(screen, id)));
  const warnings: AiWarning[] = [];
  const ops: Operation[] = [];
  let working: FormaDocument = stored.document;

  const run = (op: Operation): OperationError | undefined => {
    const result = applyOperation(working, op, { source: 'ai' });
    if (!result.ok) return result.error;
    working = result.doc;
    if (op.type === 'addNode') allowed.add(op.node.id);
    ops.push(op);
    return undefined;
  };
  const drop = (index: number, what: string, why: string) =>
    warnings.push(warning('outOfSelection', `Se descartó la operación ${index + 1} (${what}): ${why}.`));

  for (const [i, item] of items.entries()) {
    if ('insertEntry' in item) {
      const { entryId, params, parentId } = item.insertEntry;
      if (scoped && !allowed.has(parentId)) {
        drop(i, `insertar ${entryId}`, `el nodo ${nodeLabel(screen, parentId)} está fuera de la selección`);
        continue;
      }
      const inserted = insertEntry(working, {
        entryId,
        screenId: screen.id,
        parentId,
        params,
        idGen: newId,
      });
      if (!inserted.ok) {
        return { kind: 'invalid', issues: [`operations.${i}.insertEntry: ${inserted.error.message}`] };
      }
      for (const op of inserted.value.ops) {
        const error = run(op);
        if (error) return { kind: 'applyError', error, opIndex: ops.length };
      }
      continue;
    }
    const violation = scopeViolation(item, screen, allowed, scoped);
    if (violation) {
      drop(i, item.type, violation);
      continue;
    }
    const error = run(item);
    if (error) return { kind: 'applyError', error, opIndex: ops.length };
  }

  const batch: OperationBatch = { id: `batch_ai_${newId()}`, label, source: 'ai', ops };
  const parsed = parseOperationBatch(batch);
  if (!parsed.ok) {
    return { kind: 'invalid', issues: parsed.error.issues.map((issue) => `${issue.path}: ${issue.message}`) };
  }
  const applied = applyBatch(stored.document, batch);
  if (!applied.ok) return { kind: 'applyError', error: applied.error, opIndex: applied.error.opIndex };

  const before = new Set(validateDocument(stored.document).map(issueKey));
  const introduced = validateDocument(applied.doc).filter((issue) => !before.has(issueKey(issue)));
  if (introduced.length > 0) {
    return {
      kind: 'invalid',
      issues: introduced.map((issue) => `${issue.screenId ?? ''}/${issue.nodeId ?? ''}: ${issue.code}: ${issue.message}`),
    };
  }
  return { kind: 'ok', batch, warnings };
}

function spanishReason(error: OperationError, screen: FormaScreen): string {
  const name = error.nodeId ? (screen.nodes[error.nodeId]?.name ?? error.nodeId) : undefined;
  switch (error.code) {
    case 'locked':
      return `el nodo «${name}» está bloqueado y la IA no puede modificarlo`;
    case 'nodeNotFound':
      return `el nodo «${error.nodeId}» no existe en la pantalla`;
    case 'screenNotFound':
      return `la pantalla «${error.screenId}» no existe`;
    case 'duplicateId':
      return 'ya existe un elemento con el mismo id';
    case 'wouldCreateCycle':
      return `mover «${name}» ahí crearía un ciclo en la jerarquía`;
    case 'rootImmutable':
      return 'la raíz de la pantalla no se puede mover ni eliminar';
    case 'itemNotFound':
      return 'no se encontró el elemento que la operación quiere modificar';
    default:
      return `la operación no es válida (${error.message})`;
  }
}

const outlineOf = (node: FormaScreen['nodes'][string]) => ({
  id: node.id,
  type: node.type,
  name: node.name,
  parentId: node.parentId,
  ...(node.locked ? { locked: true } : {}),
});

const compactOf = (node: FormaScreen['nodes'][string]) => ({
  ...outlineOf(node),
  children: node.children,
  layout: node.layout,
  behaviors: node.behaviors.map((b) => b.kind),
});

export async function previewEdit(
  { repo, ai }: { repo: Repository; ai: AiProvider },
  projectId: string,
  stored: StoredDocument,
  request: EditRequest,
): Promise<EditPreview> {
  const screen = stored.document.screens.find((s) => s.id === request.screenId);
  if (!screen) throw notFound('Screen');
  const missing = request.selectedNodeIds.find((id) => !screen.nodes[id]);
  if (missing !== undefined) {
    throw unprocessable('nodeNotFound', `El nodo «${missing}» de la selección no existe en la pantalla.`, undefined, {
      screenId: screen.id,
      nodeId: missing,
    });
  }
  const proposals = (request.proposalIds ?? []).map((id) => {
    const proposal = repo.proposals.get(projectId, id);
    if (!proposal) throw notFound('Proposal');
    return proposal;
  });

  const warnings: AiWarning[] = [];
  const scopedIds = [...new Set(request.selectedNodeIds.flatMap((id) => subtree(screen, id)))];
  const fullIds = scopedIds.length > 0 ? scopedIds : Object.keys(screen.nodes);
  const fullSet = new Set(fullIds);
  let nodes: unknown[] = fullIds.map((id) => screen.nodes[id]);
  if (JSON.stringify(nodes).length > MAX_CONTEXT_CHARS) {
    nodes = fullIds.map((id) => compactOf(screen.nodes[id]!));
    warnings.push(
      warning('contextTrimmed', 'La pantalla es muy grande: la IA recibió una versión resumida de los nodos.'),
    );
  }
  const outline = Object.values(screen.nodes)
    .filter((node) => !fullSet.has(node.id))
    .map(outlineOf);

  const label = `IA: ${request.instruction.slice(0, 80)}`;
  const outcome = await generateValidated({
    model: ai.model,
    schema: editOutputSchema,
    schemaName: 'edit',
    system: EDIT_SYSTEM,
    messages: buildEditMessages({
      instruction: request.instruction,
      screen: {
        id: screen.id,
        name: screen.name,
        width: screen.size.width,
        height: screen.size.height,
        rootId: screen.rootId,
      },
      selectedNodeIds: request.selectedNodeIds,
      nodes,
      outline,
      tokens: stored.document.tokens,
      catalog: buildLibraryCatalog(),
      proposals: proposals.map((proposal) => ({
        id: proposal.id,
        title: proposal.title,
        summary: proposal.summary,
        nodes: proposal.document.screens
          .flatMap((s) => Object.values(s.nodes))
          .slice(0, MAX_PROPOSAL_NODES)
          .map((node) => ({
            ...compactOf(node),
            ...(node.origin.ref === undefined ? {} : { entryId: node.origin.ref }),
          })),
      })),
    }),
    validate: (output) => {
      const expansion = expandEdit(stored, screen, output.operations, request.selectedNodeIds, label);
      return expansion.kind === 'invalid'
        ? { ok: false, issues: expansion.issues }
        : { ok: true, value: { expansion, output } };
    },
  });

  const { expansion, output } = outcome;
  if (expansion.kind === 'applyError') {
    const { error, opIndex } = expansion;
    throw unprocessable(
      error.code,
      `La edición propuesta por la IA no se puede aplicar (operación ${opIndex + 1}): ${spanishReason(error, screen)}.`,
      undefined,
      {
        opIndex,
        ...(error.screenId === undefined ? {} : { screenId: error.screenId }),
        ...(error.nodeId === undefined ? {} : { nodeId: error.nodeId }),
      },
    );
  }

  return {
    baseRevision: stored.revision,
    batch: expansion.batch,
    changes: describeBatch(stored.document, expansion.batch),
    explanation: output.explanation,
    warnings: [
      ...warnings,
      ...expansion.warnings,
      ...output.warnings.map((message) => warning('model', message)),
    ],
  };
}
