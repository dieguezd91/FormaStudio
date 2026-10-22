/**
 * Scenario 13.1 end to end: Forma local service (HTTP) -> uGUI export -> Unity import + game wiring ->
 * design change -> re-export -> Unity re-import. See docs/e2e-13.1.md.
 *
 * Run with `npm run e2e:unity`. Environment: `UNITY_EDITOR` overrides the Unity executable.
 */
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import {
  createNode,
  createScreen,
  createSequentialIdGenerator,
  type FormaDocument,
  type FormaNode,
  type OperationBatch,
} from '@forma/design-core';
import type { BundleDiff, CompatibilityReport } from '@forma/exporters';
import { insertEntry } from '@forma/library';
import { buildServer } from '@forma/local-service';

const ROOT = resolve(import.meta.dirname, '../..');
const SANDBOX = join(ROOT, 'unity', 'FormaSandbox');
const SAMPLE_SOURCE = join(ROOT, 'unity', 'com.forma.studio', 'Samples~', 'ExistingInventory');
const SAMPLE_TARGET = join(SANDBOX, 'Assets', 'Samples', 'ExistingInventory');
const OUTPUT_FOLDER = 'Assets/FormaStudio/Generated/E2E';
const E2E_FOLDER = join(SANDBOX, OUTPUT_FOLDER);
const ARTIFACTS = join(ROOT, 'e2e', 'unity', 'artifacts');
const UNITY =
  process.env.UNITY_EDITOR ?? 'C:/Program Files/Unity/Hub/Editor/6000.0.73f1/Editor/Unity.exe';
const UNITY_TIMEOUT_MS = 15 * 60 * 1000;

const PROJECT_NAME = 'Inventario 13.1';
const NEW_TITLE_NAME = 'Mochila';
const WEIGHT_TEXT = 'Peso total';
const NEW_SURFACE_ALT = '#3a5a40';

// ---- step bookkeeping ----

type Status = 'PASS' | 'FAIL' | 'SKIP';
interface StepRecord {
  step: string;
  status: Status;
  detail: string;
}

const steps: StepRecord[] = [];
const facts: Record<string, unknown> = {};

class StepFailed extends Error {}

async function step<T>(name: string, run: () => Promise<{ value: T; detail: string }>): Promise<T> {
  try {
    const { value, detail } = await run();
    steps.push({ step: name, status: 'PASS', detail });
    console.log(`PASS  ${name}: ${detail}`);
    return value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    steps.push({ step: name, status: 'FAIL', detail });
    console.log(`FAIL  ${name}: ${detail}`);
    throw new StepFailed(detail);
  }
}

function fail(message: string): never {
  throw new Error(message);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

// ---- HTTP (the same calls the desktop app makes) ----

interface Stored {
  document: FormaDocument;
  revision: number;
}

interface ExportResponse {
  written: string[];
  report: CompatibilityReport;
  diff: BundleDiff | null;
  packageInstalled: boolean;
}

function createApi(baseUrl: string) {
  return async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(baseUrl + path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) fail(`${method} ${path} -> ${response.status}: ${text}`);
    return (text === '' ? undefined : JSON.parse(text)) as T;
  };
}

type Api = ReturnType<typeof createApi>;

// ---- design helpers ----

const nodesOf = (doc: FormaDocument): FormaNode[] => Object.values(doc.screens[0]?.nodes ?? {});

function nodeNamed(doc: FormaDocument, type: FormaNode['type'], name: string): FormaNode {
  const node = nodesOf(doc).find((n) => n.type === type && n.name === name);
  return node ?? fail(`No ${type} node named «${name}» in the document.`);
}

function batch(id: string, label: string, ops: OperationBatch['ops']): OperationBatch {
  return { id, label, source: 'manual', ops };
}

// ---- Unity ----

interface UnityRun {
  exitCode: number | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: string[];
  resultsPath: string;
  logPath: string;
}

function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number | null> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env, stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Unity did not finish within ${UNITY_TIMEOUT_MS / 60_000} minutes.`));
    }, UNITY_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolveRun(code);
    });
  });
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function parseResults(resultsPath: string): Pick<UnityRun, 'total' | 'passed' | 'failed' | 'skipped' | 'failures'> {
  check(existsSync(resultsPath), `Unity wrote no results file (${resultsPath}); see the log.`);
  const xml = readFileSync(resultsPath, 'utf8');
  const run = /<test-run\b[^>]*>/.exec(xml)?.[0] ?? fail(`No <test-run> in ${resultsPath}.`);
  const count = (name: string) => Number(attribute(run, name) ?? 0);
  const failures = xml
    .split('<test-case ')
    .slice(1)
    .filter((chunk) => attribute(chunk.slice(0, chunk.indexOf('>')), 'result') === 'Failed')
    .map((chunk) => {
      const header = chunk.slice(0, chunk.indexOf('>'));
      const message = /<message><!\[CDATA\[([\s\S]*?)\]\]>/.exec(chunk)?.[1]?.trim() ?? '';
      return `${attribute(header, 'fullname') ?? attribute(header, 'name')}: ${message}`;
    });
  return {
    total: count('total'),
    passed: count('passed'),
    failed: count('failed'),
    skipped: count('skipped') + count('inconclusive'),
    failures,
  };
}

async function runUnity(label: string, fixture: string, env: NodeJS.ProcessEnv): Promise<UnityRun> {
  check(existsSync(UNITY), `Unity editor not found at ${UNITY} (set UNITY_EDITOR).`);
  const resultsPath = join(ARTIFACTS, `${label}.xml`);
  const logPath = join(ARTIFACTS, `${label}.log`);
  rmSync(resultsPath, { force: true });
  const exitCode = await runProcess(
    UNITY,
    [
      '-batchmode',
      '-nographics',
      '-projectPath',
      SANDBOX,
      '-runTests',
      '-testPlatform',
      'EditMode',
      '-testCategory',
      'E2E13_1',
      '-testFilter',
      fixture,
      '-testResults',
      resultsPath,
      '-logFile',
      logPath,
    ],
    { ...process.env, ...env },
  );
  return { exitCode, resultsPath, logPath, ...parseResults(resultsPath) };
}

function unityDetail(run: UnityRun): string {
  return `total=${run.total} passed=${run.passed} failed=${run.failed} skipped=${run.skipped} exit=${run.exitCode}`;
}

function assertUnityGreen(run: UnityRun): void {
  if (run.total > 0 && run.passed === run.total && run.failed === 0) return;
  fail(`${unityDetail(run)}\n${run.failures.join('\n')}`);
}

// ---- file helpers ----

/** Removes `target` only when it is strictly inside `parent`. */
function removeInside(parent: string, target: string): void {
  const absolute = resolve(target);
  check(absolute.startsWith(resolve(parent) + sep), `Refusing to delete ${absolute}: outside ${parent}.`);
  rmSync(absolute, { recursive: true, force: true });
}

/** A just-big-enough Unity project to stage an export outside the sandbox. */
function createStagingProject(dir: string): void {
  mkdirSync(join(dir, 'Assets'), { recursive: true });
  mkdirSync(join(dir, 'ProjectSettings'), { recursive: true });
  mkdirSync(join(dir, 'Packages'), { recursive: true });
  cpSync(join(SANDBOX, 'ProjectSettings', 'ProjectVersion.txt'), join(dir, 'ProjectSettings', 'ProjectVersion.txt'));
  cpSync(join(SANDBOX, 'Packages', 'manifest.json'), join(dir, 'Packages', 'manifest.json'));
}

function bundleFile(written: string[]): string {
  const bundles = written.filter((file) => file.endsWith('.forma.json'));
  check(bundles.length === 1, `Expected one .forma.json in the export, got ${JSON.stringify(written)}.`);
  return bundles[0] as string;
}

/** Copies every file the export wrote into `target` (flat), so the Unity run can delete or overwrite the sandbox folder. */
function stageExport(unityProject: string, written: string[], target: string): string {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const file of written) cpSync(join(unityProject, file), join(target, basename(file)));
  return join(target, basename(bundleFile(written)));
}

// ---- the scenario ----

async function scenario(api: Api): Promise<void> {
  // 3. Compose the design from the library: the path AI proposals compile into.
  const projectId = await step('3a. create project', async () => {
    const project = await api<{ id: string }>('POST', '/projects', {
      name: PROJECT_NAME,
      target: { platform: 'unity', ui: 'ugui' },
    });
    return { value: project.id, detail: project.id };
  });
  const base = `/projects/${projectId}`;
  const idGen = createSequentialIdGenerator();
  const post = (stored: Stored, b: OperationBatch) =>
    api<Stored>('POST', `${base}/document/batches`, { batch: b, baseRevision: stored.revision });

  const screenId = await step('3b. library: inventory.tabs + inventory.equipment', async () => {
    let stored = await api<Stored>('GET', `${base}/document`);
    const screen = createScreen({ name: 'Inventario' });
    stored = await post(stored, batch('batch_e2e_screen', 'Crear pantalla', [{ type: 'addScreen', screen }]));

    const insert = (entryId: string, params?: Record<string, unknown>, x?: number): OperationBatch => {
      const inserted = insertEntry(stored.document, {
        entryId,
        screenId: screen.id,
        parentId: screen.rootId,
        ...(params ? { params } : {}),
        idGen,
      });
      if (!inserted.ok) fail(inserted.error.message);
      if (x === undefined) return inserted.value;
      // Position the entry's root node beside the previous one.
      const ops = inserted.value.ops.map((op) =>
        op.type === 'addNode' && op.parentId === screen.rootId
          ? { ...op, node: { ...op.node, layout: { ...op.node.layout, x } } }
          : op,
      );
      return { ...inserted.value, ops };
    };

    stored = await post(stored, insert('inventory.tabs'));
    const tabs = nodeNamed(stored.document, 'panel', 'Inventario con pestañas');
    stored = await post(
      stored,
      insert('inventory.equipment', { slots: ['weapon', 'head'] }, tabs.layout.x + tabs.layout.width + 24),
    );
    const slots = nodesOf(stored.document).filter((n) => n.type === 'slot');
    return {
      value: screen.id,
      detail: `${nodesOf(stored.document).length} nodes, ${slots.length} slots, revision ${stored.revision}`,
    };
  });

  await step('3c. style batch: colors.surface + colors.accent', async () => {
    const stored = await api<Stored>('GET', `${base}/document`);
    const next = await post(
      stored,
      batch('batch_e2e_style', 'Estilo', [
        { type: 'setToken', group: 'colors', name: 'surface', value: '#232a3a' },
        { type: 'setToken', group: 'colors', name: 'accent', value: '#e0b04f' },
      ]),
    );
    check(next.document.tokens.colors.surface === '#232a3a', 'colors.surface was not applied');
    check(next.document.tokens.colors.accent === '#e0b04f', 'colors.accent was not applied');
    return { value: undefined, detail: 'surface=#232a3a accent=#e0b04f' };
  });

  await step('3d. slots have the contextMenu behavior', async () => {
    const { document } = await api<Stored>('GET', `${base}/document`);
    const slots = nodesOf(document).filter((n) => n.type === 'slot');
    const withMenu = slots.filter((n) =>
      n.behaviors.some(
        (b) => b.kind === 'contextMenu' && ['use', 'split', 'drop'].every((id) => b.actions.some((a) => a.id === id)),
      ),
    );
    check(slots.length > 0 && withMenu.length === slots.length, `${withMenu.length}/${slots.length} slots have contextMenu`);
    const equipment = nodesOf(document).filter((n) => n.type === 'equipmentSlot');
    check(equipment.length === 2, `Expected 2 equipment slots, got ${equipment.length}`);
    return { value: undefined, detail: `${withMenu.length}/${slots.length} slots, ${equipment.length} equipment slots` };
  });

  // 4. Compatibility, package, export.
  await step('4a. analyze compatibility', async () => {
    const analysis = await api<{
      report: CompatibilityReport;
      diff: BundleDiff | null;
      unity: { packageInstalled: boolean };
    }>('POST', `${base}/exports/ugui/analyze`, { screenId, unityProjectPath: SANDBOX });
    const counts = analysis.report.summary.counts;
    facts.compatibility = counts;
    check(counts.unavailable === 0, `Unavailable features: ${JSON.stringify(counts)}`);
    return { value: undefined, detail: JSON.stringify(counts) };
  });

  await step('4b. install package (idempotent)', async () => {
    const result = await api<{ installed: boolean; backupPath: string | null }>(
      'POST',
      `${base}/exports/ugui/install-package`,
      { unityProjectPath: SANDBOX },
    );
    check(result.installed, 'install-package did not report installed');
    return { value: undefined, detail: `installed, manifest backup: ${result.backupPath ?? 'none (already referenced)'}` };
  });

  // The Unity fixtures delete the sandbox E2E folder and expect the bundle elsewhere, so V1 is staged in artifacts.
  const v1 = await step('4c. export V1 into the sandbox', async () => {
    removeInside(join(SANDBOX, 'Assets', 'FormaStudio'), E2E_FOLDER);
    const exported = await api<ExportResponse>('POST', `${base}/exports/ugui`, {
      screenId,
      unityProjectPath: SANDBOX,
      outputFolder: OUTPUT_FOLDER,
    });
    check(exported.diff === null, 'The first export should have no diff');
    check(exported.packageInstalled, 'The sandbox should reference the Forma package');
    const staged = stageExport(SANDBOX, exported.written, join(ARTIFACTS, 'v1'));
    removeInside(join(SANDBOX, 'Assets', 'FormaStudio'), E2E_FOLDER);
    const bundle = JSON.parse(readFileSync(staged, 'utf8')) as { nodes: unknown[] };
    return { value: staged, detail: `${basename(staged)}, ${bundle.nodes.length} nodes, ${exported.written.length} files` };
  });

  // 5. Unity: first import + game wiring.
  await step('5. Unity: Forma13_1_FirstImport', async () => {
    const run = await runUnity('first', 'Forma13_1_FirstImport', { FORMA_E2E_BUNDLE: v1 });
    facts.unityFirst = run;
    assertUnityGreen(run);
    return { value: undefined, detail: unityDetail(run) };
  });

  // 6. Design change and re-export (to a staging project: the sandbox E2E folder holds what FirstImport imported).
  const changed = await step('6a. design change: color token, renamed node, new "Peso total" node', async () => {
    const stored = await api<Stored>('GET', `${base}/document`);
    const tabs = nodeNamed(stored.document, 'panel', 'Inventario con pestañas');
    const title = nodeNamed(stored.document, 'text', 'Título');
    const weight = createNode('text', {
      id: 'node_e2e_weight',
      name: WEIGHT_TEXT,
      parentId: tabs.id,
      layout: { x: title.layout.x + 256, y: title.layout.y, width: 100, height: title.layout.height },
      style: { textColor: { token: 'colors.text' }, fontSize: { token: 'fontSizes.body' } },
      props: { text: WEIGHT_TEXT, align: 'left' },
    });

    let next = await post(stored, batch('batch_e2e_color', 'Cambiar color', [
      { type: 'setToken', group: 'colors', name: 'surfaceAlt', value: NEW_SURFACE_ALT },
    ]));
    next = await post(next, batch('batch_e2e_rename', 'Renombrar título', [
      { type: 'updateNode', screenId, nodeId: title.id, patch: { name: NEW_TITLE_NAME } },
    ]));
    next = await post(next, batch('batch_e2e_weight', 'Agregar peso total', [
      { type: 'addNode', screenId, node: weight, parentId: tabs.id },
    ]));
    return {
      value: { titleId: title.id, weightId: weight.id },
      detail: `surfaceAlt=${NEW_SURFACE_ALT}, ${title.id} «Título» -> «${NEW_TITLE_NAME}», +${weight.id}, revision ${next.revision}`,
    };
  });

  const v2 = await step('6b. re-export V2 (non-empty diff)', async () => {
    const staging = join(ARTIFACTS, 'v2-project');
    rmSync(staging, { recursive: true, force: true });
    createStagingProject(staging);
    const exported = await api<ExportResponse>('POST', `${base}/exports/ugui`, {
      screenId,
      unityProjectPath: staging,
      outputFolder: OUTPUT_FOLDER,
    });
    const diff = exported.diff ?? fail('The re-export returned no diff');
    facts.diff = {
      added: diff.added.length,
      removed: diff.removed.length,
      changed: diff.changed.length,
      renamed: diff.renamed.length,
      addedIds: diff.added,
      renamedNodes: diff.renamed,
    };
    check(diff.added.length + diff.changed.length + diff.renamed.length > 0, 'The diff is empty');
    check(diff.added.length > 0 && diff.renamed.length > 0 && diff.changed.length > 0, `Diff misses a change kind: ${JSON.stringify(facts.diff)}`);
    check(diff.added.some((id) => id.includes(changed.weightId)), `Diff does not add ${changed.weightId}`);
    check(diff.renamed.some((r) => r.to === NEW_TITLE_NAME), `Diff does not rename the title to ${NEW_TITLE_NAME}`);
    const staged = stageExport(staging, exported.written, join(ARTIFACTS, 'v2'));
    check(basename(staged) === basename(v1), `V2 file name ${basename(staged)} differs from V1 ${basename(v1)}`);
    const d = facts.diff as Record<string, number>;
    return { value: staged, detail: `added=${d.added} changed=${d.changed} renamed=${d.renamed} removed=${d.removed}` };
  });

  await step('7. Unity: Forma13_1_Reimport', async () => {
    const run = await runUnity('second', 'Forma13_1_Reimport', {
      FORMA_E2E_BUNDLE_V2: v2,
      FORMA_E2E_V2_SURFACE_ALT: NEW_SURFACE_ALT,
    });
    facts.unitySecond = run;
    assertUnityGreen(run);
    return { value: undefined, detail: unityDetail(run) };
  });
}

// ---- main ----

async function main(): Promise<void> {
  rmSync(ARTIFACTS, { recursive: true, force: true });
  mkdirSync(ARTIFACTS, { recursive: true });
  const dataDir = mkdtempSync(join(tmpdir(), 'forma-e2e-13-1-'));
  let app: ReturnType<typeof buildServer> | undefined;
  try {
    await step('1. prepare sandbox (sample copy, clean E2E folder)', async () => {
      check(existsSync(SAMPLE_SOURCE), `Sample not found: ${SAMPLE_SOURCE}`);
      removeInside(join(SANDBOX, 'Assets'), SAMPLE_TARGET);
      mkdirSync(dirname(SAMPLE_TARGET), { recursive: true });
      cpSync(SAMPLE_SOURCE, SAMPLE_TARGET, { recursive: true });
      removeInside(join(SANDBOX, 'Assets', 'FormaStudio'), E2E_FOLDER);
      return { value: undefined, detail: `${SAMPLE_TARGET}; cleaned ${OUTPUT_FOLDER}` };
    });

    const baseUrl = await step('2. start local service', async () => {
      app = buildServer({ dataDir });
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      return { value: address, detail: address };
    });
    await scenario(createApi(baseUrl));
  } catch (error) {
    if (!(error instanceof StepFailed)) {
      const detail = error instanceof Error ? error.message : String(error);
      steps.push({ step: 'unexpected error', status: 'FAIL', detail });
      console.log(`FAIL  unexpected error: ${detail}`);
    }
  } finally {
    await app?.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

await main();

const ok = steps.every((s) => s.status === 'PASS');
const report = { ok, steps, ...facts };
writeFileSync(join(ARTIFACTS, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('\n=== Scenario 13.1 ===');
console.table(steps.map(({ step: name, status }) => ({ step: name, status })));
for (const label of ['first', 'second']) {
  for (const extension of ['xml', 'log']) {
    const file = join(ARTIFACTS, `${label}.${extension}`);
    if (existsSync(file)) console.log(file);
  }
}
console.log(join(ARTIFACTS, 'report.json'));
console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(ok ? 0 : 1);
