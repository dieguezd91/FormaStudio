import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDirs } from './testing';
import {
  checkPackage,
  inspectUnityProject,
  installPackage,
  resolveOutputFolder,
  resolveUnityPackagePath,
  writeFilesAtomically,
  ExportPathError,
} from './unity-project';

describe('inspectUnityProject', () => {
  const { tempDir, fakeUnityProject } = useTempDirs();

  it('reads the editor version of a Unity project', () => {
    expect(inspectUnityProject(fakeUnityProject())).toMatchObject({ unityVersion: '6000.0.73f1' });
  });

  it('warns, without failing, when the editor is not Unity 6', () => {
    const info = inspectUnityProject(fakeUnityProject({ editorVersion: '2022.3.40f1' }));
    expect(info.unityVersion).toBe('2022.3.40f1');
    expect(info.unityVersionWarning).toMatch(/2022\.3\.40f1/);
  });

  it('rejects relative paths, missing folders and folders that are not Unity projects', () => {
    expect(() => inspectUnityProject('relative/path')).toThrow(ExportPathError);
    expect(() => inspectUnityProject(join(tempDir(), 'missing'))).toThrow(/no existe/);
    expect(() => inspectUnityProject(tempDir())).toThrow(/Assets/);
    const noVersion = tempDir();
    mkdirSync(join(noVersion, 'Assets'));
    mkdirSync(join(noVersion, 'ProjectSettings'));
    expect(() => inspectUnityProject(noVersion)).toThrow(/ProjectVersion\.txt/);
  });
});

describe('resolveOutputFolder', () => {
  const { fakeUnityProject } = useTempDirs();

  it('normalizes a folder inside Assets', () => {
    const root = fakeUnityProject();
    expect(resolveOutputFolder(root, 'Assets/FormaStudio//Generated/').folder).toBe(
      'Assets/FormaStudio/Generated',
    );
    expect(resolveOutputFolder(root, 'Assets\\UI\\.\\Forma').folder).toBe('Assets/UI/Forma');
    expect(resolveOutputFolder(root, 'Assets').folder).toBe('Assets');
  });

  it.each([
    '../x',
    'Assets/../x',
    'Assets/../../x',
    '/etc',
    'C:\\temp',
    'C:/temp',
    'Other/Folder',
    'assets/x',
    'AssetsX',
    '',
    '  ',
  ])('rejects %j', (folder) => {
    expect(() => resolveOutputFolder(fakeUnityProject(), folder)).toThrow(ExportPathError);
  });
});

describe('writeFilesAtomically', () => {
  const { tempDir } = useTempDirs();

  it('creates the folder and leaves no temp files behind', async () => {
    const root = tempDir();
    const dir = join(root, 'Assets', 'A', 'B');
    await writeFilesAtomically(dir, [
      { path: 'X.forma.json', contents: '{}\n' },
      { path: 'README-forma.txt', contents: 'hi' },
    ]);
    expect(readdirSync(dir).sort()).toEqual(['README-forma.txt', 'X.forma.json']);
    expect(readFileSync(join(dir, 'X.forma.json'), 'utf8')).toBe('{}\n');
  });

  it('overwrites existing files and refuses file names with folders', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.txt'), 'old');
    await writeFilesAtomically(dir, [{ path: 'a.txt', contents: 'new' }]);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('new');
    await expect(
      writeFilesAtomically(dir, [{ path: '../evil.txt', contents: 'x' }]),
    ).rejects.toThrow(ExportPathError);
    expect(existsSync(join(dir, '..', 'evil.txt'))).toBe(false);
  });
});

describe('Forma package', () => {
  const { tempDir, fakeUnityProject } = useTempDirs();

  it('resolves the package path from an env override, with forward slashes', () => {
    expect(resolveUnityPackagePath({ FORMA_UNITY_PACKAGE_PATH: 'C:\\x\\y' })).toBe('C:/x/y');
    expect(resolveUnityPackagePath({})).toMatch(/\/unity\/com\.forma\.studio$/);
  });

  it('detects whether the manifest lists the package', () => {
    const pkg = tempDir();
    const missing = checkPackage(fakeUnityProject(), pkg);
    expect(missing).toEqual({
      packageInstalled: false,
      manifestLine: `"com.forma.studio": "file:${pkg.replace(/\\/g, '/')}"`,
    });
    const present = checkPackage(
      fakeUnityProject({ manifest: '{"dependencies":{"com.forma.studio":"file:../x"}}' }),
      pkg,
    );
    expect(present).toEqual({ packageInstalled: true });
  });

  it('treats a missing or unreadable manifest as not installed', () => {
    expect(checkPackage(fakeUnityProject({ manifest: null }), 'D:/p').packageInstalled).toBe(false);
    expect(checkPackage(fakeUnityProject({ manifest: '{nope' }), 'D:/p').packageInstalled).toBe(
      false,
    );
  });

  it('preserves CRLF line endings when installing', async () => {
    const root = fakeUnityProject({
      manifest: '{\r\n  "dependencies": {\r\n    "a": "1"\r\n  }\r\n}\r\n',
    });
    await installPackage(root, 'D:/pkg');
    const text = readFileSync(join(root, 'Packages', 'manifest.json'), 'utf8');
    expect(text).toContain('\r\n');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(JSON.parse(text).dependencies['com.forma.studio']).toBe('file:D:/pkg');
  });
});
