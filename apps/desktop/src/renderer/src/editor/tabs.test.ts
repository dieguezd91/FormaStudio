import { describe, expect, it } from 'vitest';
import { computeHiddenNodes, tabForButton, tabsToReveal } from './tabs';
import { inventoryDoc, nodesOfType, screenOf } from './testing';

const screen = screenOf(inventoryDoc());
const tabBar = nodesOfType(screen, 'tabBar')[0]!;
const tabsBehavior = tabBar.behaviors.find((b) => b.kind === 'tabs');
if (tabsBehavior?.kind !== 'tabs') throw new Error('tabs behavior expected');
const [first, second, third] = tabsBehavior.tabs;

describe('computeHiddenNodes', () => {
  it('hides every tab content except the initial tab, including descendants', () => {
    const hidden = computeHiddenNodes(screen, {});
    expect(hidden.has(first!.contentNodeId)).toBe(false);
    expect(hidden.has(second!.contentNodeId)).toBe(true);
    const grid = screen.nodes[second!.contentNodeId]!.children[0]!;
    expect(hidden.has(grid)).toBe(true);
    const firstGrid = screen.nodes[first!.contentNodeId]!.children[0]!;
    expect(hidden.has(firstGrid)).toBe(false);
  });

  it('honours the tab picked in the canvas', () => {
    const hidden = computeHiddenNodes(screen, { [tabBar.id]: second!.id });
    expect(hidden.has(first!.contentNodeId)).toBe(true);
    expect(hidden.has(second!.contentNodeId)).toBe(false);
  });

  it('ignores a stale tab id and falls back to the initial tab', () => {
    const hidden = computeHiddenNodes(screen, { [tabBar.id]: 'gone' });
    expect(hidden.has(first!.contentNodeId)).toBe(false);
  });

  it('hides nothing on screens without tabs', () => {
    const plain = { ...screen, nodes: { [screen.rootId]: screen.nodes[screen.rootId]! } };
    expect(computeHiddenNodes(plain, {}).size).toBe(0);
  });
});

describe('tabForButton', () => {
  it('maps a tab bar button to its tab by label', () => {
    const button = screen.nodes[tabBar.children[2]!]!;
    expect(tabForButton(screen, button.id)).toEqual({ tabBarId: tabBar.id, tabId: third!.id });
  });

  it('returns undefined for other nodes', () => {
    expect(tabForButton(screen, screen.rootId)).toBeUndefined();
  });
});

describe('tabsToReveal', () => {
  it('returns the tab selection that makes a nested node visible', () => {
    const contentId = third!.contentNodeId;
    const nested = screen.nodes[contentId]!.children[0]!;
    expect(tabsToReveal(screen, nested)).toEqual({ [tabBar.id]: third!.id });
  });

  it('returns nothing for nodes outside tab contents', () => {
    expect(tabsToReveal(screen, tabBar.id)).toEqual({});
  });
});
