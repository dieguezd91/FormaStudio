import { useState } from 'react';
import type { Project } from '@/api';
import { ServiceBanner } from '@/app/ServiceBanner';
import { useServiceStatus } from '@/app/useServiceStatus';
import { EditorScreen } from '@/editor/EditorScreen';
import { editorStore, useUi } from '@/editor/store';
import { StartScreen, type OpenOptions } from '@/start/StartScreen';

type View = { kind: 'start' } | { kind: 'editor'; projectId: string; projectName: string };

const HASH_PATTERN = /^#\/project\/([^/]+)$/;

/** The open project lives in the URL hash so a page reload lands back in the same editor. */
function viewFromHash(): View {
  const match = HASH_PATTERN.exec(window.location.hash);
  return match?.[1]
    ? { kind: 'editor', projectId: decodeURIComponent(match[1]), projectName: '' }
    : { kind: 'start' };
}

export function App() {
  const [view, setViewState] = useState<View>(viewFromHash);
  const setView = (next: View) => {
    window.location.hash = next.kind === 'editor' ? `/project/${encodeURIComponent(next.projectId)}` : '';
    setViewState(next);
  };
  const { status, recheck } = useServiceStatus();
  const serviceDown = status === 'down';

  const open = (project: Project, options: OpenOptions) => {
    const ui = useUi.getState();
    ui.setMode('design');
    ui.setExploreTab(options.tab);
    ui.setAiNotice(options.aiNotice);
    setView({ kind: 'editor', projectId: project.id, projectName: project.name });
  };

  return (
    <div className="flex h-full flex-col">
      {serviceDown ? (
        <ServiceBanner
          onRetry={() => {
            void recheck();
            editorStore.getState().retrySync();
          }}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        {view.kind === 'start' ? (
          <StartScreen serviceUp={!serviceDown} onOpen={open} />
        ) : (
          <EditorScreen
            projectId={view.projectId}
            projectName={view.projectName}
            serviceUp={!serviceDown}
            onExit={() => setView({ kind: 'start' })}
          />
        )}
      </div>
    </div>
  );
}
