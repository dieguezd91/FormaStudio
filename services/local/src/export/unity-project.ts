import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExportFile } from '@forma/exporters';
import { AppError } from '../errors';

export const PACKAGE_NAME = 'com.forma.studio';
export const DEFAULT_OUTPUT_FOLDER = 'Assets/FormaStudio/Generated';
const MANIFEST_BACKUP = 'manifest.json.forma-backup';

/** A client mistake about the Unity project or output folder: 400 with a Spanish message. */
export class ExportPathError extends AppError {
  constructor(message: string) {
    super(400, 'invalidExportPath', message);
  }
}

export const forwardSlashes = (path: string): string => path.replace(/\\/g, '/');

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

export interface UnityProjectInfo {
  /** Absolute path as given. */
  path: string;
  /** `m_EditorVersion`, or `null` when the file does not state one. */
  unityVersion: string | null;
  unityVersionWarning?: string;
}

/** Validates that `unityProjectPath` is an existing Unity project and reads its editor version. */
export function inspectUnityProject(unityProjectPath: string): UnityProjectInfo {
  if (!isAbsolute(unityProjectPath)) {
    throw new ExportPathError('La carpeta del proyecto Unity debe ser una ruta absoluta.');
  }
  if (!isDirectory(unityProjectPath)) {
    throw new ExportPathError(`La carpeta «${unityProjectPath}» no existe.`);
  }
  if (!isDirectory(join(unityProjectPath, 'Assets'))) {
    throw new ExportPathError(
      'La carpeta no parece un proyecto Unity: falta la carpeta Assets. Elegí la carpeta raíz del proyecto.',
    );
  }
  const versionFile = join(unityProjectPath, 'ProjectSettings', 'ProjectVersion.txt');
  if (!isFile(versionFile)) {
    throw new ExportPathError(
      'La carpeta no parece un proyecto Unity: falta ProjectSettings/ProjectVersion.txt.',
    );
  }
  const unityVersion =
    /^m_EditorVersion:\s*(\S+)/m.exec(readFileSync(versionFile, 'utf8'))?.[1] ?? null;
  const info: UnityProjectInfo = { path: unityProjectPath, unityVersion };
  if (unityVersion === null) {
    info.unityVersionWarning =
      'No se pudo leer la versión de Unity de ProjectVersion.txt; el importador de Forma necesita Unity 6 (6000.x).';
  } else if (!unityVersion.startsWith('6000.')) {
    info.unityVersionWarning = `El proyecto usa Unity ${unityVersion}; el importador de Forma está pensado para Unity 6 (6000.x) y puede no funcionar.`;
  }
  return info;
}

export interface OutputFolder {
  /** Normalized, relative to the Unity project, forward slashes (e.g. `Assets/Forma/Generated`). */
  folder: string;
  /** Absolute path of the folder, guaranteed to be inside `<unityProjectPath>/Assets`. */
  absolute: string;
}

const invalidFolder = (reason: string) =>
  new ExportPathError(`La carpeta de salida no es válida: ${reason}`);

/** Output folder must be relative, inside `Assets/`, without `..`; throws otherwise. */
export function resolveOutputFolder(unityProjectPath: string, outputFolder: string): OutputFolder {
  const raw = forwardSlashes(outputFolder.trim());
  if (raw === '') throw invalidFolder('está vacía.');
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw invalidFolder(
      'tiene que ser relativa al proyecto Unity (por ejemplo Assets/FormaStudio/Generated).',
    );
  }
  if (raw.split('/').includes('..')) throw invalidFolder('no puede contener «..».');

  const folder = posix.normalize(raw).replace(/\/+$/, '');
  if (folder !== 'Assets' && !folder.startsWith('Assets/')) {
    throw invalidFolder('tiene que estar dentro de la carpeta Assets del proyecto.');
  }

  const assets = resolve(unityProjectPath, 'Assets');
  const absolute = resolve(unityProjectPath, folder);
  const inside = relative(assets, absolute);
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw invalidFolder('queda fuera de la carpeta Assets del proyecto.');
  }
  return { folder, absolute };
}

/** The deepest existing ancestor must really live under Assets (guards against symlinks). */
async function assertRealPathInside(assets: string, target: string): Promise<void> {
  const realAssets = await realpath(assets);
  const realTarget = await realpath(target);
  const inside = relative(realAssets, realTarget);
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw invalidFolder('queda fuera de la carpeta Assets del proyecto.');
  }
}

/** Writes `contents` to `<dir>/<name>` through a hidden temp file in the same folder plus a rename. */
async function writeAtomically(dir: string, name: string, contents: string): Promise<void> {
  const target = join(dir, name);
  const temp = join(dir, `.${name}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temp, contents, 'utf8');
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** Creates `dir` if needed and writes every file atomically; file names must be plain names. */
export async function writeFilesAtomically(
  dir: string,
  files: readonly ExportFile[],
  assetsDir?: string,
): Promise<void> {
  for (const file of files) {
    if (file.path.includes('/') || file.path.includes('\\') || file.path.startsWith('.')) {
      throw new ExportPathError(`Nombre de archivo no permitido: ${file.path}`);
    }
  }
  await mkdir(dir, { recursive: true });
  if (assetsDir) await assertRealPathInside(assetsDir, dir);
  for (const file of files) await writeAtomically(dir, file.path, file.contents);
}

/** Folder holding the Unity package: `FORMA_UNITY_PACKAGE_PATH`, else the repo's `unity/com.forma.studio`. */
export function resolveUnityPackagePath(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.FORMA_UNITY_PACKAGE_PATH;
  if (override) return forwardSlashes(override);
  const here = dirname(fileURLToPath(import.meta.url));
  return forwardSlashes(resolve(here, '../../../../unity', PACKAGE_NAME));
}

type Manifest = { dependencies?: Record<string, unknown> } & Record<string, unknown>;

function readManifest(unityProjectPath: string): { text: string; manifest: Manifest } | null {
  const file = join(unityProjectPath, 'Packages', 'manifest.json');
  if (!isFile(file)) return null;
  const text = readFileSync(file, 'utf8');
  try {
    const manifest: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return null;
    return { text, manifest: manifest as Manifest };
  } catch {
    return null;
  }
}

const hasPackage = (manifest: Manifest): boolean =>
  typeof manifest.dependencies === 'object' &&
  manifest.dependencies !== null &&
  PACKAGE_NAME in manifest.dependencies;

const manifestDependency = (packagePath: string): string => `file:${forwardSlashes(packagePath)}`;

export type PackageCheck =
  { packageInstalled: true } | { packageInstalled: false; manifestLine: string };

/** Whether `Packages/manifest.json` lists the Forma package, and the line to add if not. */
export function checkPackage(unityProjectPath: string, packagePath: string): PackageCheck {
  const read = readManifest(unityProjectPath);
  if (read && hasPackage(read.manifest)) return { packageInstalled: true };
  return {
    packageInstalled: false,
    manifestLine: `"${PACKAGE_NAME}": "${manifestDependency(packagePath)}"`,
  };
}

export interface InstallResult {
  installed: true;
  /** Manifest backup relative to the Unity project; `null` when nothing had to change. */
  backupPath: string | null;
}

/** Adds the Forma package to the manifest after backing it up. Idempotent. */
export async function installPackage(
  unityProjectPath: string,
  packagePath: string,
): Promise<InstallResult> {
  const read = readManifest(unityProjectPath);
  if (!read) {
    throw new ExportPathError(
      'No se pudo leer Packages/manifest.json del proyecto Unity (falta o no es un JSON válido). No se modificó nada.',
    );
  }
  if (hasPackage(read.manifest)) return { installed: true, backupPath: null };

  const packagesDir = join(unityProjectPath, 'Packages');
  await copyFile(join(packagesDir, 'manifest.json'), join(packagesDir, MANIFEST_BACKUP));

  const dependencies =
    typeof read.manifest.dependencies === 'object' && read.manifest.dependencies !== null
      ? read.manifest.dependencies
      : {};
  const updated: Manifest = {
    ...read.manifest,
    dependencies: { ...dependencies, [PACKAGE_NAME]: manifestDependency(packagePath) },
  };
  let text = JSON.stringify(updated, null, 2);
  if (/\n$/.test(read.text)) text += '\n';
  if (read.text.includes('\r\n')) text = text.replace(/\n/g, '\r\n');
  await writeAtomically(packagesDir, 'manifest.json', text);
  return { installed: true, backupPath: `Packages/${MANIFEST_BACKUP}` };
}

export const packageExists = (packagePath: string): boolean =>
  existsSync(join(packagePath, 'package.json'));
