import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

export interface FakeUnityOptions {
  editorVersion?: string;
  /** Raw `Packages/manifest.json` text; `null` omits the file. */
  manifest?: string | null;
}

export const DEFAULT_MANIFEST = `${JSON.stringify(
  { dependencies: { 'com.unity.ugui': '2.0.0', 'com.unity.modules.ui': '1.0.0' } },
  null,
  2,
)}\n`;

/** Creates temp directories and removes them after each test. */
export function useTempDirs() {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const tempDir = (prefix = 'forma-test-'): string => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  };
  const fakeUnityProject = (options: FakeUnityOptions = {}): string => {
    const root = tempDir('forma-unity-');
    mkdirSync(join(root, 'Assets'));
    mkdirSync(join(root, 'ProjectSettings'));
    writeFileSync(
      join(root, 'ProjectSettings', 'ProjectVersion.txt'),
      `m_EditorVersion: ${options.editorVersion ?? '6000.0.73f1'}\nm_EditorVersionWithRevision: ${options.editorVersion ?? '6000.0.73f1'} (abcdef)\n`,
    );
    const manifest = options.manifest === undefined ? DEFAULT_MANIFEST : options.manifest;
    if (manifest !== null) {
      mkdirSync(join(root, 'Packages'));
      writeFileSync(join(root, 'Packages', 'manifest.json'), manifest);
    }
    return root;
  };
  return { tempDir, fakeUnityProject };
}
