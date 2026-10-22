import { randomUUID } from 'node:crypto';
import type { CompositionPlan } from '@forma/ai';
import {
  TOKEN_GROUPS,
  applyBatch,
  createScreen,
  validateDocument,
  type FormaDocument,
  type Operation,
} from '@forma/design-core';
import { getEntry, insertEntry } from '@forma/library';
import { warning, type AiWarning } from './warnings';

export interface CompiledPlan {
  document: FormaDocument;
  /** Library entries the plan uses, sorted. */
  entryIds: string[];
  /** See `structuralSignature`. */
  signature: string;
  warnings: AiWarning[];
}

export type CompileOutcome =
  { ok: true; value: CompiledPlan } | { ok: false; issues: string[] };

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TOLERANCE_PX = 1;

const newId = () => randomUUID().replaceAll('-', '').slice(0, 10);

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

/** Coarse 3x3 cell of a region's centre, so "left" and "right" arrangements differ. */
function band(region: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }) {
  const third = (value: number, total: number) => (value < total / 3 ? 0 : value < (2 * total) / 3 ? 1 : 2);
  const col = 'LCR'[third(region.x + region.width / 2, size.width)]!;
  const row = 'TMB'[third(region.y + region.height / 2, size.height)]!;
  return `${col}${row}`;
}

/**
 * What makes two proposals "structurally" the same (§6.2): the library entries used, the behavior
 * kinds in the compiled screen, which entry sits in which part of the screen, and the nesting.
 * Labels, params and exact sizes deliberately do not count.
 */
export function structuralSignature(
  plan: CompositionPlan,
  doc: FormaDocument,
  screenId: string,
): string {
  const screen = doc.screens.find((s) => s.id === screenId);
  const behaviors = Object.values(screen?.nodes ?? {}).flatMap((node) => node.behaviors.map((b) => b.kind));
  const size = screen?.size ?? { width: 1920, height: 1080 };
  const arrangement = plan.layout
    .filter((placement) => placement.parentRef === undefined)
    .map((placement) => `${placement.entryId}@${band(placement.region, size)}`);
  const nesting = plan.layout.flatMap((placement) => {
    const parent = placement.parentRef === undefined ? undefined : plan.layout[placement.parentRef];
    return parent ? [`${placement.entryId}<${parent.entryId}`] : [];
  });
  return [
    sorted(plan.layout.map((p) => p.entryId)).join(','),
    sorted(behaviors).join(','),
    sorted(arrangement).join(','),
    sorted(nesting).join(','),
  ].join('|');
}

function tokenOperations(plan: CompositionPlan, issues: string[], at: string): Operation[] {
  const ops: Operation[] = [];
  for (const group of TOKEN_GROUPS) {
    for (const [name, value] of Object.entries(plan.tokens?.[group] ?? {})) {
      if (name.trim() === '') {
        issues.push(`${at}.tokens.${group}: token names must not be empty`);
      } else if (group === 'colors' && !HEX_COLOR.test(String(value))) {
        issues.push(`${at}.tokens.colors.${name}: expected a hex color such as #aabbcc, got '${String(value)}'`);
      } else if (group !== 'colors' && !(typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
        issues.push(`${at}.tokens.${group}.${name}: expected a non-negative number`);
      } else {
        ops.push({ type: 'setToken', group, name, value });
      }
    }
  }
  return ops;
}

/**
 * Turns a composition plan into a full document by driving the same code the editor uses:
 * `insertEntry` for every placement, `updateNode` for its region, `setToken` for overrides.
 * With `screenId` the proposal keeps the document's other screens and replaces only that
 * screen's content; without it, it is a one-screen design that keeps the project's tokens.
 * Nothing the model wrote reaches the document except through those validated operations.
 */
export function compilePlan(
  plan: CompositionPlan,
  base: FormaDocument,
  screenId: string | undefined,
  at: string,
): CompileOutcome {
  const issues: string[] = [];
  const warnings: AiWarning[] = [];
  const existing = screenId === undefined ? undefined : base.screens.find((s) => s.id === screenId);
  const screen = existing
    ? createScreen({ id: existing.id, name: existing.name, rootId: existing.rootId, size: existing.size })
    : createScreen({ name: plan.title });

  let doc: FormaDocument = existing
    ? { ...base, screens: base.screens.map((s) => (s.id === existing.id ? screen : s)) }
    : { ...base, screens: [screen], dataSources: [], intents: [] };

  const apply = (ops: Operation[], label: string, where: string): boolean => {
    const result = applyBatch(doc, { id: `${label}_${newId()}`, label, source: 'library', ops });
    if (!result.ok) {
      issues.push(`${where}: ${result.error.message}`);
      return false;
    }
    doc = result.doc;
    return true;
  };

  const tokens = tokenOperations(plan, issues, at);
  if (tokens.length > 0) apply(tokens, 'tokens', `${at}.tokens`);

  const placedRoots: (string | undefined)[] = [];
  const containers: ({ width: number; height: number } | undefined)[] = [];
  for (const [i, placement] of plan.layout.entries()) {
    const where = `${at}.layout.${i}`;
    let parentId = screen.rootId;
    let container: { width: number; height: number } = screen.size;
    if (placement.parentRef !== undefined) {
      if (placement.parentRef >= i) {
        issues.push(`${where}.parentRef: must be the index of an earlier placement (< ${i})`);
        placedRoots.push(undefined);
        continue;
      }
      const parent = placedRoots[placement.parentRef];
      if (parent === undefined) {
        placedRoots.push(undefined);
        continue; // the parent already reported its own issue
      }
      parentId = parent;
      container = containers[placement.parentRef] ?? container;
    }

    const inserted = insertEntry(doc, {
      entryId: placement.entryId,
      screenId: screen.id,
      parentId,
      params: placement.params,
      idGen: newId,
    });
    if (!inserted.ok) {
      issues.push(`${where}: ${inserted.error.message}`);
      placedRoots.push(undefined);
      continue;
    }
    const root = inserted.value.ops.find((op) => op.type === 'addNode' && op.parentId === parentId);
    if (root?.type !== 'addNode' || !apply(inserted.value.ops, 'insert', where)) {
      placedRoots.push(undefined);
      continue;
    }
    const { x, y, width, height } = placement.region;
    apply(
      [
        {
          type: 'updateNode',
          screenId: screen.id,
          nodeId: root.node.id,
          patch: { layout: { x, y, width, height, anchor: 'top-left' } },
        },
      ],
      'position',
      `${where}.region`,
    );
    placedRoots.push(root.node.id);
    containers[i] = { width, height };
    if (
      x < -TOLERANCE_PX ||
      y < -TOLERANCE_PX ||
      x + width > container.width + TOLERANCE_PX ||
      y + height > container.height + TOLERANCE_PX
    ) {
      const name = getEntry(placement.entryId)?.name ?? placement.entryId;
      warnings.push(
        warning('regionOutOfBounds', `«${name}» en «${plan.title}» sobresale de su contenedor (${container.width}×${container.height}).`),
      );
    }
  }

  if (issues.length === 0) {
    for (const issue of validateDocument(doc)) {
      issues.push(`${at}: ${issue.code}: ${issue.message}`);
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      document: doc,
      entryIds: sorted(plan.layout.map((p) => p.entryId)),
      signature: structuralSignature(plan, doc, screen.id),
      warnings,
    },
  };
}
