import type { FormaDocument, FormaNode, FormaScreen, TokenGroup } from './schema';

export type IssueCode =
  | 'rootMissing'
  | 'rootHasParent'
  | 'idMismatch'
  | 'childMissing'
  | 'duplicateChild'
  | 'parentMissing'
  | 'parentMismatch'
  | 'notListedByParent'
  | 'cycle'
  | 'unreachable'
  | 'duplicateId'
  | 'duplicateBehavior'
  | 'duplicateBinding'
  | 'unresolvedReference'
  | 'unknownToken';

export interface ValidationIssue {
  code: IssueCode;
  message: string;
  screenId?: string;
  nodeId?: string;
}

type Report = (code: IssueCode, message: string, nodeId?: string) => void;

function createReporter(screen: FormaScreen, issues: ValidationIssue[]): Report {
  return (code, message, nodeId) =>
    issues.push({
      code,
      message,
      screenId: screen.id,
      ...(nodeId === undefined ? {} : { nodeId }),
    });
}

/** Structural checks of one screen's node hierarchy (no cross-document references). */
export function validateScreenTree(screen: FormaScreen): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const report = createReporter(screen, issues);
  const { nodes } = screen;
  const label = (id: string) => `'${nodes[id]?.name ?? id}'`;

  for (const [key, node] of Object.entries(nodes)) {
    if (key !== node.id) {
      report(
        'idMismatch',
        `Node ${label(key)} is stored under key '${key}' but has id '${node.id}'.`,
        node.id,
      );
    }
  }

  const root = nodes[screen.rootId];
  if (!root) {
    report('rootMissing', `Screen '${screen.name}' has no root node '${screen.rootId}'.`);
  } else if (root.parentId !== null) {
    report('rootHasParent', `Root node ${label(root.id)} must not have a parent.`, root.id);
  }

  for (const [key, node] of Object.entries(nodes)) {
    if (key !== screen.rootId && node.parentId !== null) {
      const parent = nodes[node.parentId];
      if (!parent) {
        report(
          'parentMissing',
          `Node ${label(key)} points to missing parent '${node.parentId}'.`,
          node.id,
        );
      } else if (!parent.children.includes(key)) {
        report(
          'notListedByParent',
          `Node ${label(key)} is not listed in the children of ${label(parent.id)}.`,
          node.id,
        );
      }
    }
    const seen = new Set<string>();
    for (const childId of node.children) {
      if (seen.has(childId)) {
        report(
          'duplicateChild',
          `Node ${label(key)} lists child '${childId}' more than once.`,
          node.id,
        );
        continue;
      }
      seen.add(childId);
      const child = nodes[childId];
      if (!child) {
        report('childMissing', `Node ${label(key)} lists missing child '${childId}'.`, node.id);
      } else if (child.parentId !== node.id) {
        report(
          'parentMismatch',
          `Node ${label(childId)} is a child of ${label(key)} but its parent is '${child.parentId ?? 'none'}'.`,
          child.id,
        );
      }
    }
  }

  const visited = new Set<string>();
  const onPath = new Set<string>();
  const walk = (id: string) => {
    visited.add(id);
    onPath.add(id);
    for (const childId of nodes[id]?.children ?? []) {
      if (onPath.has(childId)) {
        report('cycle', `Cycle: ${label(id)} contains its ancestor ${label(childId)}.`, id);
      } else if (!visited.has(childId) && nodes[childId]) {
        walk(childId);
      }
    }
    onPath.delete(id);
  };

  if (root) {
    walk(root.id);
    const detached = Object.keys(nodes).filter((id) => !visited.has(id));
    for (const id of detached) {
      report(
        'unreachable',
        `Node ${label(id)} is not reachable from the root of '${screen.name}'.`,
        id,
      );
    }
    for (const id of detached) if (!visited.has(id)) walk(id);
  }
  return issues;
}

/** Token groups each style/layout field may reference; unlisted numeric fields accept any numeric group. */
const FIELD_GROUPS: Record<string, TokenGroup[]> = {
  fill: ['colors'],
  stroke: ['colors'],
  textColor: ['colors'],
  fontSize: ['fontSizes'],
  radius: ['radii'],
  gap: ['spacing'],
  padding: ['spacing'],
};
const NUMERIC_GROUPS: TokenGroup[] = ['fontSizes', 'spacing', 'radii'];

function* tokenRefs(node: FormaNode): Generator<[field: string, ref: string]> {
  const sources: Record<string, unknown>[] = [
    node.style,
    { gap: node.layout.gap, padding: node.layout.padding },
  ];
  for (const source of sources) {
    for (const [field, value] of Object.entries(source)) {
      if (typeof value === 'object' && value !== null && 'token' in value) {
        yield [field, String((value as { token: unknown }).token)];
      }
    }
  }
}

function validateNode(
  doc: FormaDocument,
  screen: FormaScreen,
  node: FormaNode,
  report: Report,
): void {
  const intentIds = new Set(doc.intents.map((i) => i.id));
  const dataSourceIds = new Set(doc.dataSources.map((d) => d.id));
  const name = `'${node.name}'`;

  const kinds = new Set<string>();
  for (const behavior of node.behaviors) {
    if (kinds.has(behavior.kind)) {
      report(
        'duplicateBehavior',
        `Node ${name} has more than one '${behavior.kind}' behavior.`,
        node.id,
      );
    }
    kinds.add(behavior.kind);

    const checkIntent = (intentId: string, what: string) => {
      if (!intentIds.has(intentId)) {
        report(
          'unresolvedReference',
          `Node ${name}: ${what} references missing intent '${intentId}'.`,
          node.id,
        );
      }
    };
    switch (behavior.kind) {
      case 'tabs':
        for (const tab of behavior.tabs) {
          if (!screen.nodes[tab.contentNodeId]) {
            report(
              'unresolvedReference',
              `Node ${name}: tab '${tab.label}' references missing content node '${tab.contentNodeId}'.`,
              node.id,
            );
          }
        }
        if (!behavior.tabs.some((t) => t.id === behavior.initialTabId)) {
          report(
            'unresolvedReference',
            `Node ${name}: initial tab '${behavior.initialTabId}' is not one of its tabs.`,
            node.id,
          );
        }
        break;
      case 'dragDrop':
        checkIntent(behavior.intentId, 'dragDrop');
        break;
      case 'split':
        checkIntent(behavior.intentId, 'split');
        break;
      case 'contextMenu':
        for (const action of behavior.actions)
          checkIntent(action.intentId, `menu action '${action.label}'`);
        break;
      case 'select':
      case 'stack':
      case 'tooltip':
        break;
    }
  }

  const bindingIds = new Set<string>();
  for (const binding of node.bindings) {
    if (bindingIds.has(binding.id)) {
      report(
        'duplicateBinding',
        `Node ${name} has more than one binding with id '${binding.id}'.`,
        node.id,
      );
    }
    bindingIds.add(binding.id);
    if (!dataSourceIds.has(binding.dataSourceId)) {
      report(
        'unresolvedReference',
        `Node ${name}: binding '${binding.prop}' references missing data source '${binding.dataSourceId}'.`,
        node.id,
      );
    }
  }

  for (const [field, ref] of tokenRefs(node)) {
    const dot = ref.indexOf('.');
    const group = ref.slice(0, dot);
    const tokenName = ref.slice(dot + 1);
    const allowed = FIELD_GROUPS[field] ?? NUMERIC_GROUPS;
    const table = (doc.tokens as Record<string, Record<string, unknown> | undefined>)[group];
    if (dot < 0 || !(allowed as string[]).includes(group) || !table || !(tokenName in table)) {
      report(
        'unknownToken',
        `Node ${name}: ${field} uses unknown ${allowed.join('/')} token '${ref}'.`,
        node.id,
      );
    }
  }
}

function reportDuplicates(items: { id: string }[], what: string, issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id))
      issues.push({ code: 'duplicateId', message: `Duplicate ${what} id '${id}'.` });
    seen.add(id);
  }
}

/** Invariants beyond the Zod schema: tree integrity and resolvable references. */
export function validateDocument(doc: FormaDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  reportDuplicates(doc.screens, 'screen', issues);
  reportDuplicates(doc.dataSources, 'data source', issues);
  reportDuplicates(doc.intents, 'intent', issues);
  for (const screen of doc.screens) {
    issues.push(...validateScreenTree(screen));
    const report = createReporter(screen, issues);
    for (const node of Object.values(screen.nodes)) validateNode(doc, screen, node, report);
  }
  return issues;
}
