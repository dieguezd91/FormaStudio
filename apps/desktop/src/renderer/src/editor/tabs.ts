import type { FormaScreen } from '@forma/design-core';

/** Per tab bar: the tab picked in the canvas (design-time only, never written to the document). */
export type TabShown = Record<string, string>;

interface TabsInfo {
  tabBarId: string;
  initialTabId: string;
  tabs: { id: string; label: string; contentNodeId: string }[];
}

function tabBars(screen: FormaScreen): TabsInfo[] {
  const found: TabsInfo[] = [];
  for (const node of Object.values(screen.nodes)) {
    for (const behavior of node.behaviors) {
      if (behavior.kind === 'tabs') {
        found.push({ tabBarId: node.id, initialTabId: behavior.initialTabId, tabs: behavior.tabs });
      }
    }
  }
  return found;
}

function subtree(screen: FormaScreen, rootId: string, into: Set<string>): void {
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (into.has(id)) continue;
    const node = screen.nodes[id];
    if (!node) continue;
    into.add(id);
    stack.push(...node.children);
  }
}

const shownTab = (info: TabsInfo, shown: TabShown): string => {
  const picked = shown[info.tabBarId];
  return picked !== undefined && info.tabs.some((t) => t.id === picked) ? picked : info.initialTabId;
};

/**
 * Nodes to hide in the canvas so tab panels do not overlap: the content of every tab other than
 * the shown one (initial tab by default), with all descendants.
 */
export function computeHiddenNodes(screen: FormaScreen, shown: TabShown): Set<string> {
  const hidden = new Set<string>();
  for (const info of tabBars(screen)) {
    const active = shownTab(info, shown);
    for (const tab of info.tabs) {
      if (tab.id !== active) subtree(screen, tab.contentNodeId, hidden);
    }
  }
  return hidden;
}

/** The tab a tab-bar button stands for (matched by label), if any. */
export function tabForButton(
  screen: FormaScreen,
  buttonId: string,
): { tabBarId: string; tabId: string } | undefined {
  const button = screen.nodes[buttonId];
  if (button?.type !== 'button' || button.parentId === null) return undefined;
  const info = tabBars(screen).find((t) => t.tabBarId === button.parentId);
  const tab = info?.tabs.find((t) => t.label === button.props.label);
  return info && tab ? { tabBarId: info.tabBarId, tabId: tab.id } : undefined;
}

/** Tab selections that make `nodeId` visible (it may sit inside several tab contents). */
export function tabsToReveal(screen: FormaScreen, nodeId: string): TabShown {
  const reveal: TabShown = {};
  const infos = tabBars(screen);
  for (let id: string | null = nodeId; id !== null; id = screen.nodes[id]?.parentId ?? null) {
    for (const info of infos) {
      const tab = info.tabs.find((t) => t.contentNodeId === id);
      if (tab) reveal[info.tabBarId] = tab.id;
    }
  }
  return reveal;
}
