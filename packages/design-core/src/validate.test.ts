import { describe, expect, it } from 'vitest';
import { formaDocumentSchema, type FormaDocument } from './schema';
import { clone, makeDoc, mutate, nodeOf, screenOf } from './test-fixtures';
import { validateDocument, validateScreenTree } from './validate';

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('validateDocument', () => {
  it('fixture is schema-valid and has no issues', () => {
    const doc = makeDoc();
    expect(formaDocumentSchema.safeParse(doc).success).toBe(true);
    expect(validateDocument(doc)).toEqual([]);
  });

  it('reports a missing root', () => {
    const doc = mutate(makeDoc(), (d) => {
      screenOf(d).rootId = 'nope';
    });
    const issues = validateDocument(doc);
    expect(codes(issues)).toContain('rootMissing');
    expect(issues[0]?.screenId).toBe('s1');
    expect(issues[0]?.message).toMatch(/Inventory/);
  });

  it('reports a root that has a parent', () => {
    const doc = mutate(makeDoc(), (d) => {
      nodeOf(d, 'root').parentId = 'panel';
    });
    expect(codes(validateDocument(doc))).toContain('rootHasParent');
  });

  it('reports a node stored under a mismatching key', () => {
    const doc = mutate(makeDoc(), (d) => {
      const nodes = screenOf(d).nodes;
      nodes['wrong'] = nodes['slot2']!;
      delete nodes['slot2'];
      nodeOf(d, 'grid').children = ['slot1', 'wrong'];
    });
    const issue = validateDocument(doc).find((i) => i.code === 'idMismatch');
    expect(issue?.nodeId).toBe('slot2');
  });

  it('reports children that do not exist', () => {
    const doc = mutate(makeDoc(), (d) => {
      nodeOf(d, 'grid').children.push('ghost');
    });
    const issue = validateDocument(doc).find((i) => i.code === 'childMissing');
    expect(issue).toMatchObject({ nodeId: 'grid' });
    expect(issue?.message).toMatch(/ghost/);
  });

  it('reports parent/child inconsistencies', () => {
    const wrongParent = mutate(makeDoc(), (d) => {
      nodeOf(d, 'slot2').parentId = 'panel';
    });
    expect(validateDocument(wrongParent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'parentMismatch', nodeId: 'slot2' }),
      ]),
    );

    const unlisted = mutate(makeDoc(), (d) => {
      nodeOf(d, 'grid').children = ['slot1'];
    });
    expect(validateDocument(unlisted)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'notListedByParent', nodeId: 'slot2' }),
        expect.objectContaining({ code: 'unreachable', nodeId: 'slot2' }),
      ]),
    );

    const missingParent = mutate(makeDoc(), (d) => {
      nodeOf(d, 'slot2').parentId = 'ghost';
    });
    expect(codes(validateDocument(missingParent))).toContain('parentMissing');
  });

  it('reports duplicate children', () => {
    const doc = mutate(makeDoc(), (d) => {
      nodeOf(d, 'grid').children = ['slot1', 'slot2', 'slot2'];
    });
    expect(codes(validateDocument(doc))).toContain('duplicateChild');
  });

  it('detects a cycle reachable from the root', () => {
    const doc = mutate(makeDoc(), (d) => {
      nodeOf(d, 'slot1').children = ['panel'];
    });
    const issue = validateDocument(doc).find((i) => i.code === 'cycle');
    expect(issue).toBeDefined();
    expect(issue?.nodeId).toBeDefined();
  });

  it('detects a detached cycle', () => {
    const doc = mutate(makeDoc(), (d) => {
      const nodes = screenOf(d).nodes;
      nodes['a'] = { ...nodeOf(d, 'slot2'), id: 'a', parentId: 'b', children: ['b'] };
      nodes['b'] = { ...nodeOf(d, 'slot2'), id: 'b', parentId: 'a', children: ['a'] };
    });
    const issues = validateDocument(doc);
    expect(codes(issues)).toContain('cycle');
    expect(issues.filter((i) => i.code === 'unreachable').map((i) => i.nodeId)).toEqual(
      expect.arrayContaining(['a', 'b']),
    );
  });

  it('reports unreachable orphans', () => {
    const doc = mutate(makeDoc(), (d) => {
      screenOf(d).nodes['orphan'] = { ...nodeOf(d, 'slot2'), id: 'orphan', parentId: null };
    });
    expect(validateDocument(doc)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unreachable', nodeId: 'orphan' })]),
    );
  });
});

describe('validateDocument references', () => {
  const unresolved = (doc: FormaDocument) =>
    validateDocument(doc).filter((i) => i.code === 'unresolvedReference');

  it('resolves tab content nodes and the initial tab', () => {
    const badContent = mutate(makeDoc(), (d) => {
      const b = nodeOf(d, 'tabs').behaviors[0];
      if (b?.kind === 'tabs') b.tabs[0]!.contentNodeId = 'ghost';
    });
    const issue = unresolved(badContent)[0];
    expect(issue?.nodeId).toBe('tabs');
    expect(issue?.message).toMatch(/Tabs/);
    expect(issue?.message).toMatch(/ghost/);

    const badInitial = mutate(makeDoc(), (d) => {
      const b = nodeOf(d, 'tabs').behaviors[0];
      if (b?.kind === 'tabs') b.initialTabId = 'zzz';
    });
    expect(unresolved(badInitial)).toHaveLength(1);
  });

  it('resolves intent references of dragDrop, split and contextMenu', () => {
    const doc = mutate(makeDoc(), (d) => {
      nodeOf(d, 'slot2').behaviors.push(
        { kind: 'dragDrop', role: 'source', intentId: 'missing1' },
        { kind: 'split', intentId: 'missing2' },
        {
          kind: 'contextMenu',
          trigger: 'button',
          actions: [
            { id: 'a1', label: 'Use', intentId: 'i_use' },
            { id: 'a2', label: 'Drop', intentId: 'missing3' },
          ],
        },
      );
    });
    const issues = unresolved(doc);
    expect(issues).toHaveLength(3);
    expect(issues.every((i) => i.nodeId === 'slot2')).toBe(true);
  });

  it('resolves binding data sources', () => {
    const doc = mutate(makeDoc(), (d) => {
      nodeOf(d, 'slot1').bindings[0]!.dataSourceId = 'ghost';
    });
    expect(unresolved(doc)).toHaveLength(1);
  });

  it('reports unknown style tokens and accepts defined ones', () => {
    const withRef = (d: FormaDocument) => {
      nodeOf(d, 'panel').style = { fill: { token: 'colors.primary' } };
      nodeOf(d, 'panel').layout.gap = { token: 'spacing.sm' };
    };
    const missing = mutate(makeDoc(), withRef);
    const issues = validateDocument(missing).filter((i) => i.code === 'unknownToken');
    expect(issues.map((i) => i.nodeId)).toEqual(['panel', 'panel']);

    const defined = mutate(makeDoc(), (d) => {
      withRef(d);
      d.tokens.colors['primary'] = '#fff';
      d.tokens.spacing['sm'] = 4;
    });
    expect(validateDocument(defined)).toEqual([]);
  });

  it('reports duplicate ids and behavior kinds', () => {
    const doc = mutate(makeDoc(), (d) => {
      d.screens.push(clone(screenOf(d)));
      d.intents.push({ ...d.intents[0]! });
      d.dataSources.push({ ...d.dataSources[0]! });
      nodeOf(d, 'slot1').behaviors.push({ kind: 'dragDrop', role: 'source', intentId: 'i_move' });
      nodeOf(d, 'slot1').bindings.push({ ...nodeOf(d, 'slot1').bindings[0]! });
    });
    const issues = validateDocument(doc);
    expect(issues.filter((i) => i.code === 'duplicateId')).toHaveLength(3);
    expect(codes(issues)).toContain('duplicateBehavior');
    expect(codes(issues)).toContain('duplicateBinding');
  });
});

describe('validateScreenTree', () => {
  it('checks only the screen hierarchy', () => {
    const doc = makeDoc();
    expect(validateScreenTree(screenOf(doc))).toEqual([]);
    const broken = mutate(doc, (d) => {
      nodeOf(d, 'grid').children.push('ghost');
    });
    expect(codes(validateScreenTree(screenOf(broken)))).toEqual(['childMissing']);
  });
});
