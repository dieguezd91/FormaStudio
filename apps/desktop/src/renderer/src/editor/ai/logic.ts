import type { FormaDocument } from '@forma/design-core';
import { getEntry } from '@forma/library';
import type { Requirement, RequirementKind, RequirementStatus, SourceImpact } from '@/api/types';
import { BEHAVIOR_LABELS } from '../behaviors';
import { NODE_TYPE_LABELS } from '../canvas/nodeStyle';

export const KIND_LABEL: Record<RequirementKind, string> = {
  goal: 'Objetivos',
  data: 'Datos',
  flow: 'Flujos',
  constraint: 'Restricciones',
  interaction: 'Interacciones',
};

export const STATUS_LABEL: Record<RequirementStatus, string> = {
  confirmed: 'Confirmado',
  assumed: 'Supuesto',
  contradiction: 'Contradicción',
  gap: 'Laguna',
};

const KIND_ORDER: RequirementKind[] = ['goal', 'data', 'flow', 'constraint', 'interaction'];
/** What needs the user's attention comes first. */
const STATUS_ORDER: RequirementStatus[] = ['contradiction', 'gap', 'assumed', 'confirmed'];

export interface RequirementGroup {
  kind: RequirementKind;
  label: string;
  requirements: Requirement[];
}

/** Requirements grouped by kind (fixed order, empty kinds skipped), most urgent status first. */
export function groupRequirements(requirements: readonly Requirement[]): RequirementGroup[] {
  return KIND_ORDER.flatMap((kind) => {
    const inKind = requirements
      .filter((requirement) => requirement.kind === kind)
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    return inKind.length === 0 ? [] : [{ kind, label: KIND_LABEL[kind], requirements: inKind }];
  });
}

export function countByStatus(requirements: readonly Requirement[]): Record<RequirementStatus, number> {
  const counts: Record<RequirementStatus, number> = { confirmed: 0, assumed: 0, contradiction: 0, gap: 0 };
  for (const requirement of requirements) counts[requirement.status] += 1;
  return counts;
}

export interface ComparableProposal {
  id: string;
  title: string;
  document: FormaDocument;
}

export interface ComparisonRow {
  kind: 'entry' | 'behavior' | 'nodeType';
  key: string;
  label: string;
  /** Occurrences per compared proposal, aligned with `columns`. */
  counts: number[];
  present: boolean[];
  /** Every compared proposal has it. */
  shared: boolean;
}

export interface Comparison {
  columns: { id: string; title: string; nodeCount: number }[];
  rows: ComparisonRow[];
}

interface Structure {
  nodeCount: number;
  entries: Map<string, number>;
  behaviors: Map<string, number>;
  nodeTypes: Map<string, number>;
}

const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

function structureOf(doc: FormaDocument): Structure {
  const structure: Structure = {
    nodeCount: 0,
    entries: new Map(),
    behaviors: new Map(),
    nodeTypes: new Map(),
  };
  for (const screen of doc.screens) {
    for (const node of Object.values(screen.nodes)) {
      structure.nodeCount += 1;
      bump(structure.nodeTypes, node.type);
      if (node.origin.source === 'library' && node.origin.ref !== undefined) {
        bump(structure.entries, node.origin.ref);
      }
      for (const behavior of node.behaviors) bump(structure.behaviors, behavior.kind);
    }
  }
  return structure;
}

const ROW_KINDS: { kind: ComparisonRow['kind']; pick: (s: Structure) => Map<string, number>; label: (key: string) => string }[] = [
  { kind: 'entry', pick: (s) => s.entries, label: (key) => getEntry(key)?.name ?? key },
  {
    kind: 'behavior',
    pick: (s) => s.behaviors,
    label: (key) => BEHAVIOR_LABELS[key as keyof typeof BEHAVIOR_LABELS] ?? key,
  },
  {
    kind: 'nodeType',
    pick: (s) => s.nodeTypes,
    label: (key) => NODE_TYPE_LABELS[key as keyof typeof NODE_TYPE_LABELS] ?? key,
  },
];

/**
 * Structural diff (design doc §6.5): which library entries, behaviors and node types each
 * proposal contains. Rows that differ come before rows every proposal shares.
 */
export function compareProposals(proposals: readonly ComparableProposal[]): Comparison {
  const structures = proposals.map((proposal) => structureOf(proposal.document));
  const rows = ROW_KINDS.flatMap(({ kind, pick, label }) => {
    const keys = [...new Set(structures.flatMap((structure) => [...pick(structure).keys()]))].sort();
    const built = keys.map((key): ComparisonRow => {
      const counts = structures.map((structure) => pick(structure).get(key) ?? 0);
      const present = counts.map((count) => count > 0);
      return { kind, key, label: label(key), counts, present, shared: present.every(Boolean) };
    });
    return [...built.filter((row) => !row.shared), ...built.filter((row) => row.shared)];
  });
  return {
    columns: proposals.map((proposal, i) => ({
      id: proposal.id,
      title: proposal.title,
      nodeCount: structures[i]?.nodeCount ?? 0,
    })),
    rows,
  };
}

/**
 * A preview was computed against one revision; applying it blindly after the document moved on
 * (or while local edits are still unsaved) could clash with what the user sees.
 */
export function isPreviewStale(
  preview: { baseRevision: number },
  current: { revision: number; pending: number },
): boolean {
  return preview.baseRevision !== current.revision || current.pending > 0;
}

export type GuideStepId = 'sources' | 'requirements' | 'proposals';

export interface GuideStep {
  id: GuideStepId;
  label: string;
  enabled: boolean;
  done: boolean;
}

/** The "Crear con IA" strip: each step unlocks once the previous one has content. */
export function guideSteps(counts: { sources: number; requirements: number; proposals: number }): GuideStep[] {
  return [
    { id: 'sources', label: 'Adjuntá documentación y referencias', enabled: true, done: counts.sources > 0 },
    { id: 'requirements', label: 'Analizar requisitos', enabled: counts.sources > 0, done: counts.requirements > 0 },
    { id: 'proposals', label: 'Generar propuestas', enabled: counts.requirements > 0, done: counts.proposals > 0 },
  ];
}

export interface ImpactSummary {
  requirements: { id: string; text: string }[];
  proposals: { id: string; title: string }[];
}

/** Everything a set of source changes may have invalidated, without duplicates; null when nothing. */
export function summarizeImpact(impacts: readonly SourceImpact[]): ImpactSummary | null {
  const requirements = new Map<string, string>();
  const proposals = new Map<string, string>();
  for (const impact of impacts) {
    for (const requirement of impact.requirements) requirements.set(requirement.id, requirement.text);
    for (const proposal of impact.proposals) proposals.set(proposal.id, proposal.title);
  }
  if (requirements.size === 0 && proposals.size === 0) return null;
  return {
    requirements: [...requirements].map(([id, text]) => ({ id, text })),
    proposals: [...proposals].map(([id, title]) => ({ id, title })),
  };
}
