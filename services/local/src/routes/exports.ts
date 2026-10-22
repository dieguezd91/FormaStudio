import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  createUguiExporter,
  diffBundles,
  type BundleDiff,
  type UguiBundle,
} from '@forma/exporters';
import { notFound, unprocessable } from '../errors';
import {
  checkPackage,
  DEFAULT_OUTPUT_FOLDER,
  inspectUnityProject,
  installPackage,
  type UnityProjectInfo,
  packageExists,
  resolveOutputFolder,
  writeFilesAtomically,
} from '../export/unity-project';
import { analyzeExportBody, exportUguiBody, installPackageBody } from '../schemas';
import { parseInput } from '../validation';
import { currentDocument, requireProject, type ProjectParams, type RouteContext } from './support';

const TARGET = 'unity-ugui';

export function registerExportRoutes(
  app: FastifyInstance,
  { repo, unityPackagePath }: RouteContext,
): void {
  const exporter = createUguiExporter();

  /** Exports `screenId` in memory without touching disk. */
  const exportInMemory = (projectId: string, screenId: string) => {
    const project = requireProject(repo, projectId);
    const stored = currentDocument(repo, projectId);
    const result = exporter.export(stored.document, screenId, {
      projectId,
      projectName: project.name,
      documentRevision: stored.revision,
      exportedAt: new Date().toISOString(),
    });
    return { result, revision: stored.revision };
  };

  /** Like `exportInMemory`, but a refusal becomes a 404/422 with the exporter's reasons. */
  const buildExport = (projectId: string, screenId: string) => {
    const { result, revision } = exportInMemory(projectId, screenId);
    if (!result.ok) {
      if (result.error.code === 'screenNotFound') throw notFound('Screen');
      throw unprocessable(
        result.error.code,
        result.error.reasons.join(' '),
        result.error.reasons.map((message) => ({ path: '', message })),
      );
    }
    return { output: result.value, revision };
  };

  /** What the Unity project tells us: editor version (+ warning) and whether the Forma package is listed. */
  const unityFacts = (unity: UnityProjectInfo) => ({
    unityVersion: unity.unityVersion,
    ...(unity.unityVersionWarning ? { unityVersionWarning: unity.unityVersionWarning } : {}),
    ...checkPackage(unity.path, unityPackagePath),
  });

  /** What re-exporting would change versus the last stored export, or `null` if there is none. */
  const diffAgainstLast = (
    projectId: string,
    screenId: string,
    next: UguiBundle,
  ): BundleDiff | null => {
    const previous = repo.exports.lastBundle<UguiBundle>(projectId, screenId, TARGET);
    return previous ? diffBundles(previous, next) : null;
  };

  app.post<ProjectParams>('/projects/:id/exports/ugui/analyze', async (request) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const { screenId, unityProjectPath } = parseInput(analyzeExportBody, request.body);
    const unity = unityProjectPath ? inspectUnityProject(unityProjectPath) : null;
    const stored = currentDocument(repo, projectId);
    if (!stored.document.screens.some((screen) => screen.id === screenId)) {
      throw notFound('Screen');
    }
    const report = exporter.analyze(stored.document, screenId);
    // The report is still useful when the screen cannot be exported yet; the export itself explains why.
    const { result } = exportInMemory(projectId, screenId);
    const diff = result.ok ? diffAgainstLast(projectId, screenId, result.value.bundle) : null;
    return { report, diff, unity: unity && unityFacts(unity) };
  });

  app.post<ProjectParams>('/projects/:id/exports/ugui', async (request) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(exportUguiBody, request.body);
    const unity = inspectUnityProject(body.unityProjectPath);
    const output = resolveOutputFolder(unity.path, body.outputFolder ?? DEFAULT_OUTPUT_FOLDER);
    const { output: exported, revision } = buildExport(projectId, body.screenId);
    const diff = diffAgainstLast(projectId, body.screenId, exported.bundle);

    await writeFilesAtomically(output.absolute, exported.files, join(unity.path, 'Assets'));
    const written = exported.files.map((file) => `${output.folder}/${file.path}`);
    repo.transaction(() =>
      repo.exports.create(projectId, {
        screenId: body.screenId,
        target: TARGET,
        unityProjectPath: unity.path,
        outputFolder: output.folder,
        documentRevision: revision,
        bundle: exported.bundle,
        written,
      }),
    );

    return {
      written,
      report: exported.report,
      diff,
      ...unityFacts(unity),
    };
  });

  app.post<ProjectParams>('/projects/:id/exports/ugui/install-package', async (request) => {
    requireProject(repo, request.params.id);
    const { unityProjectPath } = parseInput(installPackageBody, request.body);
    const unity = inspectUnityProject(unityProjectPath);
    if (!packageExists(unityPackagePath)) {
      throw unprocessable(
        'packageUnavailable',
        `No se encontró el paquete de Forma en «${unityPackagePath}». No se modificó el proyecto Unity.`,
      );
    }
    return installPackage(unity.path, unityPackagePath);
  });

  app.get<ProjectParams>('/projects/:id/exports', async (request) => {
    requireProject(repo, request.params.id);
    return { exports: repo.exports.list(request.params.id) };
  });
}
