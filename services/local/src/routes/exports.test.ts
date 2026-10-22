import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FormaDocument } from '@forma/design-core';
import { useTempDirs } from '../export/testing';
import { createProject, getDocument, inventoryDocument, useServer } from '../testing';

const GENERATED = 'Assets/FormaStudio/Generated';

describe('uGUI export routes', () => {
  const { tempDir, fakeUnityProject } = useTempDirs();
  const options = { unityPackagePath: '' };
  const server = useServer(options);
  let packageDir = '';
  beforeEach(() => {
    packageDir = tempDir('forma-pkg-');
    writeFileSync(join(packageDir, 'package.json'), '{"name":"com.forma.studio"}');
    options.unityPackagePath = packageDir;
  });

  const forward = (path: string) => path.replace(/\\/g, '/');

  const setup = async (document: FormaDocument = inventoryDocument()) => {
    const app = server();
    const project = await createProject(app);
    const put = await app.inject({
      method: 'PUT',
      url: `/projects/${project.id}/document`,
      payload: { document, baseRevision: 1 },
    });
    expect(put.statusCode).toBe(200);
    return project.id;
  };

  const post = (projectId: string, path: string, payload: object) =>
    server().inject({ method: 'POST', url: `/projects/${projectId}/exports${path}`, payload });
  const analyze = (projectId: string, screenId = 'screen_main') =>
    post(projectId, '/ugui/analyze', { screenId });
  const exportTo = (projectId: string, unityProjectPath: string, extra: object = {}) =>
    post(projectId, '/ugui', { screenId: 'screen_main', unityProjectPath, ...extra });

  describe('analyze', () => {
    it('returns the compatibility report and no diff before any export', async () => {
      const id = await setup();
      const response = await analyze(id);
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.diff).toBeNull();
      expect(body.report.items.length).toBeGreaterThan(0);
      expect(body.report.summary.youWillReceive.length).toBeGreaterThan(0);
    });

    it('checks the Unity project and the Forma package when a project folder is given', async () => {
      const id = await setup();
      const without = (await analyze(id)).json();
      expect(without.unity).toBeNull();

      const missing = await post(id, '/ugui/analyze', {
        screenId: 'screen_main',
        unityProjectPath: fakeUnityProject({ editorVersion: '2022.3.40f1' }),
      });
      expect(missing.statusCode).toBe(200);
      expect(missing.json().unity).toMatchObject({
        unityVersion: '2022.3.40f1',
        unityVersionWarning: expect.stringContaining('6000'),
        packageInstalled: false,
        manifestLine: `"com.forma.studio": "file:${forward(packageDir)}"`,
      });

      const present = await post(id, '/ugui/analyze', {
        screenId: 'screen_main',
        unityProjectPath: fakeUnityProject({
          manifest: '{"dependencies":{"com.forma.studio":"file:../p"}}',
        }),
      });
      expect(present.json().unity).toMatchObject({ packageInstalled: true });
      expect(present.json().unity.manifestLine).toBeUndefined();
    });

    it('rejects an analyze folder that is not a Unity project', async () => {
      const id = await setup();
      const response = await post(id, '/ugui/analyze', {
        screenId: 'screen_main',
        unityProjectPath: tempDir(),
      });
      expect(response.statusCode).toBe(400);
    });

    it('answers 404 for an unknown screen and for an unknown project', async () => {
      const id = await setup();
      expect((await analyze(id, 'nope')).statusCode).toBe(404);
      expect((await analyze('prj_missing')).statusCode).toBe(404);
    });

    it('validates the body', async () => {
      const id = await setup();
      expect((await post(id, '/ugui/analyze', {})).statusCode).toBe(400);
    });
  });

  describe('export', () => {
    it('writes the bundle and README inside the output folder and persists the record', async () => {
      const id = await setup();
      const unity = fakeUnityProject();
      const response = await exportTo(id, unity);
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.written).toEqual([
        `${GENERATED}/Main.forma.json`,
        `${GENERATED}/README-forma.txt`,
      ]);
      expect(body.unityVersion).toBe('6000.0.73f1');
      expect(body.unityVersionWarning).toBeUndefined();
      expect(body.diff).toBeNull();
      expect(body.report.items.length).toBeGreaterThan(0);

      const folder = join(unity, ...GENERATED.split('/'));
      expect(readdirSync(folder).sort()).toEqual(['Main.forma.json', 'README-forma.txt']);
      const bundle = JSON.parse(readFileSync(join(folder, 'Main.forma.json'), 'utf8'));
      expect(bundle.meta).toMatchObject({
        projectId: id,
        screenId: 'screen_main',
        documentRevision: 2,
      });
    });

    it('honors a custom output folder', async () => {
      const id = await setup();
      const unity = fakeUnityProject();
      const response = await exportTo(id, unity, { outputFolder: 'Assets/UI/Forma/' });
      expect(response.json().written[0]).toBe('Assets/UI/Forma/Main.forma.json');
      expect(existsSync(join(unity, 'Assets', 'UI', 'Forma', 'Main.forma.json'))).toBe(true);
    });

    it('returns a diff against the previous export after the document changes', async () => {
      const id = await setup();
      const unity = fakeUnityProject();
      await exportTo(id, unity);

      const current = await getDocument(server(), id);
      const screen = current.document.screens[0]!;
      const target = Object.values(screen.nodes).find((n) => n.parentId !== undefined)!;
      const renamed = {
        ...current.document,
        screens: [
          {
            ...screen,
            nodes: { ...screen.nodes, [target.id]: { ...target, name: 'Renombrado' } },
          },
        ],
      };
      await server().inject({
        method: 'PUT',
        url: `/projects/${id}/document`,
        payload: { document: renamed, baseRevision: current.revision },
      });

      const preview = (await analyze(id)).json();
      expect(preview.diff.renamed).toEqual([
        expect.objectContaining({ nodeId: target.id, to: 'Renombrado' }),
      ]);

      const second = (await exportTo(id, unity)).json();
      expect(second.diff.renamed).toHaveLength(1);
      expect(second.diff.added).toEqual([]);
      // Exporting again without changes now diffs against the second export.
      const third = (await exportTo(id, unity)).json();
      expect(third.diff).toEqual({ added: [], removed: [], changed: [], renamed: [] });
    });

    it('rejects folders that escape Assets with a 400 and writes nothing', async () => {
      const id = await setup();
      const unity = fakeUnityProject();
      const outside = tempDir();
      for (const outputFolder of ['../x', 'Assets/../x', outside, 'Packages/x', '/abs']) {
        const response = await exportTo(id, unity, { outputFolder });
        expect(response.statusCode, outputFolder).toBe(400);
        expect(response.json().error.message).toMatch(/carpeta|Assets/i);
      }
      expect(readdirSync(unity).sort()).toEqual(['Assets', 'Packages', 'ProjectSettings']);
      expect(readdirSync(join(unity, 'Assets'))).toEqual([]);
      expect(readdirSync(outside)).toEqual([]);
    });

    it('rejects folders that are not Unity projects', async () => {
      const id = await setup();
      const response = await exportTo(id, tempDir());
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/Unity/);
      expect((await exportTo(id, 'relative/dir')).statusCode).toBe(400);
    });

    it('warns, without failing, for editors older than Unity 6', async () => {
      const id = await setup();
      const response = await exportTo(id, fakeUnityProject({ editorVersion: '2022.3.40f1' }));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        unityVersion: '2022.3.40f1',
        unityVersionWarning: expect.stringContaining('6000'),
      });
    });

    it('answers 404 for an unknown screen and writes nothing', async () => {
      const id = await setup();
      const unity = fakeUnityProject();
      const response = await post(id, '/ugui', { screenId: 'ghost', unityProjectPath: unity });
      expect(response.statusCode).toBe(404);
      expect(readdirSync(join(unity, 'Assets'))).toEqual([]);
    });

    it('refuses an unexportable document with 422 and Spanish reasons, writing nothing', async () => {
      const doc = inventoryDocument();
      expect(doc.intents.length).toBeGreaterThan(0);
      const id = await setup({
        ...doc,
        intents: [...doc.intents, { ...doc.intents[0]!, id: 'intent_duplicate' }],
      });
      const unity = fakeUnityProject();
      const response = await exportTo(id, unity);
      expect(response.statusCode).toBe(422);
      const { error } = response.json();
      expect(error.code).toBe('invalidDocument');
      expect(error.issues[0].message).toMatch(/intenciones llamadas/);
      expect(readdirSync(join(unity, 'Assets'))).toEqual([]);
      const history = await server().inject({ method: 'GET', url: `/projects/${id}/exports` });
      expect(history.json().exports).toEqual([]);
    });

    it('reports whether the Forma package is in the manifest', async () => {
      const id = await setup();
      const missing = (await exportTo(id, fakeUnityProject())).json();
      expect(missing.packageInstalled).toBe(false);
      expect(missing.manifestLine).toBe(`"com.forma.studio": "file:${forward(packageDir)}"`);

      const present = (
        await exportTo(
          id,
          fakeUnityProject({ manifest: '{"dependencies":{"com.forma.studio":"file:../p"}}' }),
        )
      ).json();
      expect(present.packageInstalled).toBe(true);
      expect(present.manifestLine).toBeUndefined();
    });
  });

  describe('install-package', () => {
    const install = (projectId: string, unityProjectPath: string) =>
      post(projectId, '/ugui/install-package', { unityProjectPath });

    it('backs up the manifest, adds the dependency and keeps the other entries', async () => {
      const id = await setup();
      const unity = fakeUnityProject();
      const original = readFileSync(join(unity, 'Packages', 'manifest.json'), 'utf8');

      const response = await install(id, unity);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        installed: true,
        backupPath: 'Packages/manifest.json.forma-backup',
      });
      expect(readFileSync(join(unity, 'Packages', 'manifest.json.forma-backup'), 'utf8')).toBe(
        original,
      );

      const updatedText = readFileSync(join(unity, 'Packages', 'manifest.json'), 'utf8');
      expect(updatedText.endsWith('\n')).toBe(true);
      expect(updatedText).toContain('\n  "dependencies": {\n    "com.unity.ugui"');
      expect(JSON.parse(updatedText).dependencies).toEqual({
        ...JSON.parse(original).dependencies,
        'com.forma.studio': `file:${forward(packageDir)}`,
      });

      const after = (await exportTo(id, unity)).json();
      expect(after.packageInstalled).toBe(true);
    });

    it('is idempotent and does not overwrite the backup when already installed', async () => {
      const id = await setup();
      const unity = fakeUnityProject();
      await install(id, unity);
      const manifest = readFileSync(join(unity, 'Packages', 'manifest.json'), 'utf8');
      const backup = readFileSync(join(unity, 'Packages', 'manifest.json.forma-backup'), 'utf8');

      const again = await install(id, unity);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toEqual({ installed: true, backupPath: null });
      expect(readFileSync(join(unity, 'Packages', 'manifest.json'), 'utf8')).toBe(manifest);
      expect(readFileSync(join(unity, 'Packages', 'manifest.json.forma-backup'), 'utf8')).toBe(
        backup,
      );
    });

    it('answers 422 and changes nothing when the Forma package folder is missing', async () => {
      options.unityPackagePath = join(tempDir(), 'missing');
      const id = await setup();
      const unity = fakeUnityProject();
      const response = await install(id, unity);
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('packageUnavailable');
      expect(existsSync(join(unity, 'Packages', 'manifest.json.forma-backup'))).toBe(false);
    });

    it('rejects non-Unity folders and unreadable manifests', async () => {
      const id = await setup();
      expect((await install(id, tempDir())).statusCode).toBe(400);
      const noManifest = await install(id, fakeUnityProject({ manifest: null }));
      expect(noManifest.statusCode).toBe(400);
      expect(noManifest.json().error.message).toMatch(/manifest\.json/);
      const broken = fakeUnityProject({ manifest: '{nope' });
      expect((await install(id, broken)).statusCode).toBe(400);
      expect(readFileSync(join(broken, 'Packages', 'manifest.json'), 'utf8')).toBe('{nope');
      expect(existsSync(join(broken, 'Packages', 'manifest.json.forma-backup'))).toBe(false);
    });
  });

  describe('history', () => {
    it('lists exports newest first without the bundle payload', async () => {
      const id = await setup();
      const unity = fakeUnityProject();
      expect(
        (await server().inject({ method: 'GET', url: `/projects/${id}/exports` })).json(),
      ).toEqual({
        exports: [],
      });

      await exportTo(id, unity);
      await exportTo(id, unity, { outputFolder: 'Assets/Other' });
      const { exports } = (
        await server().inject({ method: 'GET', url: `/projects/${id}/exports` })
      ).json();
      expect(exports).toHaveLength(2);
      expect(exports[0]).toMatchObject({
        screenId: 'screen_main',
        target: 'unity-ugui',
        outputFolder: 'Assets/Other',
        documentRevision: 2,
        written: ['Assets/Other/Main.forma.json', 'Assets/Other/README-forma.txt'],
      });
      expect(exports[0]).not.toHaveProperty('bundle');
      expect(exports[1].outputFolder).toBe(GENERATED);
    });

    it('answers 404 for an unknown project and keeps projects separate', async () => {
      const a = await setup();
      const b = (await createProject(server(), { name: 'Other' })).id;
      await exportTo(a, fakeUnityProject());
      const listB = await server().inject({ method: 'GET', url: `/projects/${b}/exports` });
      expect(listB.json().exports).toEqual([]);
      expect(
        (await server().inject({ method: 'GET', url: '/projects/prj_missing/exports' })).statusCode,
      ).toBe(404);
    });
  });
});
