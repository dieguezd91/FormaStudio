import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HierarchyPanel } from '../hierarchy/HierarchyPanel';
import { LibraryPanel } from '../library/LibraryPanel';
import { ReferencesPanel } from '../references/ReferencesPanel';
import { useUi, type ExploreTab } from '../store';

export function ExplorePanel() {
  const tab = useUi((state) => state.exploreTab);
  const setTab = useUi((state) => state.setExploreTab);
  return (
    <aside
      aria-label="Explorar"
      data-testid="explore"
      className="flex w-80 shrink-0 flex-col border-r border-border bg-card"
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as ExploreTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label="Explorar" className="shrink-0 border-b border-border p-2">
          <TabsTrigger value="layers">Capas</TabsTrigger>
          <TabsTrigger value="library">Biblioteca</TabsTrigger>
          <TabsTrigger value="references">Referencias</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="layers">
            <HierarchyPanel />
          </TabsContent>
          <TabsContent value="library">
            <LibraryPanel />
          </TabsContent>
          <TabsContent value="references">
            <ReferencesPanel />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}
