import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import {
  applyBatch,
  createSequentialIdGenerator,
  describeBatch,
  type FormaDocument,
  type OperationBatch,
} from '@forma/design-core';
import { insertEntry } from '@forma/library';

/**
 * AI assistance UI against the real local service. The service has no Gemini key here, so the
 * `/ai/*` model routes are stubbed with responses shaped like the service's own; everything else
 * (sources, proposals, documents, versions, adoption, impact) is the real thing.
 */
const SERVICE = 'http://127.0.0.1:4399';
const ORIGIN = 'http://localhost:5173';
const CORS = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

const BRIEF = [
  '# Inventario',
  'El jugador ve sus objetos organizados por categorías: armas, armaduras y consumibles.',
  'Cada objeto tiene una cantidad y se puede mover de una casilla a otra.',
].join('\n');

interface Stubbed {
  status: number;
  body: unknown;
}

/** Answers `POST` calls to a service path (and its CORS preflight) without reaching the service. */
async function stubPost(page: Page, suffix: string, respond: (request: Request) => Promise<Stubbed> | Stubbed) {
  await page.route(new RegExp(`/projects/[^/]+${suffix}$`), async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (request.method() !== 'POST') return route.fallback();
    const { status, body } = await respond(request);
    return route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });
}

const aiUnavailable = (): Stubbed => ({
  status: 503,
  body: { error: { code: 'aiUnavailable', message: 'Las funciones de IA están desactivadas.' } },
});

const projectIdOf = (page: Page) => decodeURIComponent(new URL(page.url()).hash.replace('#/project/', ''));

async function createProject(page: Page, intent: RegExp, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: intent }).click();
  await page.getByLabel('Nombre del proyecto').fill(name);
  await page.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('canvas-stage')).toBeVisible();
}

async function uploadBrief(page: Page) {
  await page.getByLabel('Archivo de documento').setInputFiles({
    name: 'brief.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(BRIEF),
  });
  await page.getByRole('button', { name: 'Agregar referencia' }).click();
  await expect(page.getByTestId('source-row')).toHaveCount(1);
}

async function currentDocument(request: APIRequestContext, projectId: string) {
  const response = await request.get(`${SERVICE}/projects/${projectId}/document`);
  return (await response.json()) as { document: FormaDocument; revision: number };
}

/** The document with one library entry inserted on its first screen, composed like the service would. */
function withEntry(base: FormaDocument, entryId: string): FormaDocument {
  const screen = base.screens[0]!;
  const inserted = insertEntry(base, {
    entryId,
    screenId: screen.id,
    parentId: screen.rootId,
    idGen: createSequentialIdGenerator(),
  });
  if (!inserted.ok) throw new Error(inserted.error.message);
  const applied = applyBatch(base, inserted.value);
  if (!applied.ok) throw new Error(applied.error.message);
  return applied.doc;
}

async function sourceIdsOf(request: APIRequestContext, projectId: string) {
  const response = await request.get(`${SERVICE}/projects/${projectId}/sources`);
  return ((await response.json()) as { sources: { id: string; title: string; sourceVersion: number }[] }).sources;
}

const EXCERPT = 'El jugador ve sus objetos organizados por categorías';

function requirementsFixture(source: { id: string; sourceVersion: number }) {
  const ref = { sourceId: source.id, sourceVersion: source.sourceVersion, excerpt: EXCERPT };
  return [
    { id: 'req_goal0001', text: 'Mostrar los objetos del jugador por categorías', kind: 'goal', status: 'confirmed', sourceRefs: [ref] },
    { id: 'req_data0001', text: 'Cada objeto tiene una cantidad', kind: 'data', status: 'assumed', sourceRefs: [] },
    { id: 'req_flow0001', text: 'Mover objetos entre casillas', kind: 'flow', status: 'confirmed', sourceRefs: [ref] },
    { id: 'req_gap00001', text: 'Falta definir el peso máximo', kind: 'constraint', status: 'gap', sourceRefs: [] },
  ];
}

test('Crear con IA: analizar, proponer, comparar, adoptar y pedir un cambio a la IA', async ({ page, request }) => {
  test.setTimeout(120_000);
  await createProject(page, /Crear con IA/, 'Asistente IA');
  const projectId = projectIdOf(page);

  // The guided strip: only the first step is open until there is documentation.
  await expect(page.getByTestId('ai-guide')).toBeVisible();
  await expect(page.getByTestId('guide-step-sources')).toBeEnabled();
  await expect(page.getByTestId('guide-step-requirements')).toBeDisabled();
  await expect(page.getByTestId('guide-step-proposals')).toBeDisabled();
  await expect(page.getByTestId('references-panel')).toBeVisible();

  await uploadBrief(page);
  await expect(page.getByTestId('guide-step-requirements')).toBeEnabled();
  await expect(page.getByTestId('guide-step-sources')).toHaveAttribute('data-done', 'true');
  await expect(page.getByTestId('guide-step-proposals')).toBeDisabled();

  // 1. Analyze: requirements grouped by kind, with status badges and their source excerpts.
  const [source] = await sourceIdsOf(request, projectId);
  const requirements = requirementsFixture(source!);
  await stubPost(page, '/ai/requirements', () => ({
    status: 200,
    body: {
      requirements,
      warnings: [
        {
          code: 'requirementDowngraded',
          message: '«Cada objeto tiene una cantidad» pasó de confirmado a supuesto: no cita ninguna fuente.',
          requirementId: 'req_data0001',
        },
      ],
      usedSources: [{ id: source!.id, title: 'brief.md', type: 'text', sourceVersion: source!.sourceVersion }],
    },
  }));
  await page.getByTestId('guide-step-requirements').click();
  await expect(page.getByTestId('requirements-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Analizar documentación' }).click();

  await expect(page.getByTestId('requirement')).toHaveCount(4);
  await expect(page.locator('[data-testid="requirement"][data-status="confirmed"]').first()).toContainText('Confirmado');
  await expect(page.locator('[data-testid="requirement"][data-status="assumed"]')).toContainText('Supuesto');
  await expect(page.locator('[data-testid="requirement"][data-status="gap"]')).toContainText('Laguna');
  await expect(page.getByRole('region', { name: 'Objetivos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Datos' })).toBeVisible();
  const traced = page.locator('[data-testid="requirement"][data-status="confirmed"]').first().getByTestId('source-ref');
  await expect(traced).toContainText('brief.md');
  await expect(traced).toContainText(EXCERPT);
  await expect(page.getByTestId('requirement-warnings')).toContainText('pasó de confirmado a supuesto');
  await expect(page.getByTestId('guide-step-proposals')).toBeEnabled();

  // 2. Generate: three proposals (stored through the real proposals route, returned by the stub).
  const { document: base } = await currentDocument(request, projectId);
  const drafts = [
    { title: 'Pestañas por categoría', entry: 'inventory.tabs', requirementIds: ['req_goal0001', 'req_flow0001'] },
    { title: 'Cuadrícula única', entry: 'inventory.grid', requirementIds: ['req_goal0001'] },
    { title: 'Lista compacta', entry: 'inventory.list', requirementIds: ['req_data0001'] },
  ];
  const stored = [];
  for (const draft of drafts) {
    const response = await request.post(`${SERVICE}/projects/${projectId}/proposals`, {
      data: {
        title: draft.title,
        summary: `Resumen de ${draft.title}`,
        rationale: {
          need: 'Encontrar objetos rápido',
          patterns: [draft.entry],
          tradeoffs: ['Ocupa más espacio'],
          fromReferences: [source!.id],
          requirementIds: draft.requirementIds,
        },
        document: withEntry(base, draft.entry),
        origin: 'ai',
      },
    });
    expect(response.status()).toBe(201);
    stored.push(await response.json());
  }
  let generateBody: { count?: number; screenId?: string } = {};
  await stubPost(page, '/ai/proposals', (req) => {
    generateBody = req.postDataJSON() as typeof generateBody;
    return {
      status: 201,
      body: {
        proposals: stored,
        warnings: [
          { code: 'distinctness', message: 'Dos propuestas comparten buena parte de su estructura.', proposalId: stored[2].id },
        ],
      },
    };
  });
  await page.getByTestId('guide-step-proposals').click();
  await expect(page.getByTestId('proposals-panel')).toBeVisible();
  await page.getByLabel('Indicaciones (opcional)').fill('Priorizá el uso con mando');
  await page.getByTestId('proposals-panel').getByRole('button', { name: 'Generar propuestas' }).click();

  const cards = page.getByTestId('proposal-card');
  await expect(cards).toHaveCount(3);
  expect(generateBody.count).toBe(3);
  expect(generateBody.screenId).toBeTruthy();
  await expect(cards.first().locator('[data-testid="proposal-thumbnail"][data-state="ready"]')).toBeVisible();
  await expect(cards.nth(2).locator('[data-node-type="slot"]').first()).toBeAttached();
  await expect(cards.nth(2).getByTestId('proposal-warnings')).toContainText('comparten buena parte');

  // A taller window so the screenshot shows all three cards.
  await page.setViewportSize({ width: 1600, height: 1600 });
  await expect(cards.nth(2).locator('[data-testid="proposal-thumbnail"][data-state="ready"]')).toBeVisible();
  await page.screenshot({ path: 'e2e/artifacts/ai-proposals.png' });
  await page.setViewportSize({ width: 1600, height: 900 });

  // Rationale: requirement ids are shown as their text.
  await cards.first().getByText('Ver fundamentos').click();
  await expect(cards.first().getByTestId('rationale')).toContainText('Mostrar los objetos del jugador por categorías');
  await expect(cards.first().getByTestId('rationale')).toContainText('brief.md');

  // 3. Compare two proposals: side-by-side previews and a structural diff.
  await page.getByLabel('Comparar Pestañas por categoría').check();
  await expect(page.getByRole('button', { name: /Comparar \(1\)/ })).toBeDisabled();
  await page.getByLabel('Comparar Cuadrícula única').check();
  await page.getByRole('button', { name: /Comparar \(2\)/ }).click();
  const compare = page.getByTestId('compare-dialog');
  await expect(compare).toBeVisible();
  await expect(compare.getByTestId('compare-column')).toHaveCount(2);
  await expect(compare.locator('[data-testid="proposal-thumbnail"][data-state="ready"]')).toHaveCount(2);
  const tabsRow = compare.locator('[data-testid="compare-row"][data-key="inventory.tabs"]');
  await expect(tabsRow).toHaveAttribute('data-shared', 'false');
  await expect(tabsRow.locator('[data-present="true"]')).toHaveCount(1);
  await expect(compare.locator('[data-testid="compare-row"][data-key="inventory.grid"]')).toHaveAttribute('data-shared', 'false');
  await expect(compare.locator('[data-testid="compare-behavior"] [data-key="tabs"]')).toHaveAttribute('data-shared', 'false');
  await page.screenshot({ path: 'e2e/artifacts/ai-compare.png' });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(compare).toHaveCount(0);

  // 4. Probar a proposal without adopting it: the open document stays as it was.
  await cards.first().getByRole('button', { name: 'Probar' }).click();
  const play = page.getByTestId('proposal-play');
  await expect(play).toBeVisible();
  await expect(play.getByTestId('play-banner')).toContainText('datos simulados');
  await expect(play.locator('[data-play-type="slot"]').first()).toBeVisible();
  await play.getByRole('button', { name: 'Cerrar' }).click();
  await expect(play).toHaveCount(0);
  await expect(page.getByTestId('canvas-stage').locator('[data-node-type="slot"]')).toHaveCount(0);

  // 5. Discard and recover.
  await cards.nth(2).getByRole('button', { name: 'Descartar' }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('radio', { name: /Descartadas \(1\)/ }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-status', 'discarded');
  await cards.first().getByRole('button', { name: 'Recuperar' }).click();
  await expect(cards).toHaveCount(0);
  await page.getByRole('radio', { name: 'Activas' }).click();
  await expect(cards).toHaveCount(3);

  // 6. Adopt: explained confirmation, a version is saved first, the canvas shows the proposal.
  await cards.first().getByRole('button', { name: 'Adoptar' }).click();
  const confirm = page.getByTestId('adopt-dialog');
  await expect(confirm).toContainText('reemplaza el documento actual');
  await expect(confirm).toContainText('Versiones');
  await confirm.getByRole('button', { name: 'Sí, adoptar' }).click();
  const stage = page.getByTestId('canvas-stage');
  await expect(stage.locator('[data-node-type="slot"]').first()).toBeVisible();
  await expect(cards.first()).toHaveAttribute('data-status', 'adopted');
  await expect(page.getByTestId('notice')).toContainText('Antes de adoptar Pestañas por categoría');
  await page.getByTestId('versions-trigger').click();
  await expect(page.getByTestId('versions-menu')).toContainText('Antes de adoptar Pestañas por categoría');
  await page.keyboard.press('Escape');

  // 7. Pedir a la IA on a selected node: preview first, then apply (undoable).
  const slot = stage.locator('[data-node-type="slot"]').first();
  const nodeId = (await slot.getAttribute('data-node-id'))!;
  const originalName = (await slot.getAttribute('data-node-name'))!;
  await slot.click({ force: true });
  await expect(page.getByTestId('node-inspector')).toBeVisible();
  let editBody: { selectedNodeIds: string[]; screenId: string; instruction: string } | null = null;
  await stubPost(page, '/ai/edit', async (req) => {
    editBody = req.postDataJSON() as NonNullable<typeof editBody>;
    const { document, revision } = await currentDocument(request, projectId);
    const batch: OperationBatch = {
      id: 'batch_ai_e2e',
      label: 'IA: renombrar',
      source: 'ai',
      ops: [{ type: 'updateNode', screenId: editBody.screenId, nodeId: editBody.selectedNodeIds[0]!, patch: { name: 'Casilla IA' } }],
    };
    return {
      status: 200,
      body: {
        baseRevision: revision,
        batch,
        changes: describeBatch(document, batch),
        explanation: 'Renombré la casilla seleccionada.',
        warnings: [{ code: 'outOfSelection', message: 'Se descartó la operación 2: fuera de la selección.' }],
      },
    };
  });
  await page.getByTestId('node-inspector').getByRole('button', { name: 'Pedir a la IA' }).click();
  const ask = page.getByTestId('ask-ai');
  await expect(ask).toBeVisible();
  await expect(ask.getByTestId('ask-scope')).toHaveText('Afecta: 1 elemento seleccionado');
  await ask.getByLabel('Qué querés cambiar').fill('Renombrá esta casilla');
  await ask.getByRole('button', { name: 'Ver cambios' }).click();
  const preview = ask.getByTestId('edit-preview');
  await expect(preview).toBeVisible();
  expect(editBody!.selectedNodeIds).toEqual([nodeId]);
  await expect(preview.getByTestId('edit-explanation')).toHaveText('Renombré la casilla seleccionada.');
  await expect(preview.getByTestId('edit-changes')).toContainText('Casilla IA');
  await expect(preview.getByTestId('edit-warnings')).toContainText('fuera de la selección');
  // Nothing changed yet.
  await expect(stage.locator(`[data-node-id="${nodeId}"]`)).toHaveAttribute('data-node-name', originalName);

  await preview.getByRole('button', { name: 'Aplicar' }).click();
  await expect(stage.locator(`[data-node-id="${nodeId}"]`)).toHaveAttribute('data-node-name', 'Casilla IA');
  await expect(ask.getByTestId('edit-preview')).toHaveCount(0);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(stage.locator(`[data-node-id="${nodeId}"]`)).toHaveAttribute('data-node-name', originalName);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
});

test('sin clave de Gemini la IA se explica y el trabajo manual sigue funcionando', async ({ page }) => {
  await createProject(page, /Crear con IA/, 'Asistente sin clave');
  await uploadBrief(page);
  await stubPost(page, '/ai/requirements', aiUnavailable);
  await stubPost(page, '/ai/proposals', aiUnavailable);
  await stubPost(page, '/ai/edit', aiUnavailable);

  await page.getByTestId('guide-step-requirements').click();
  await page.getByRole('button', { name: 'Analizar documentación' }).click();
  const unavailable = page.getByTestId('requirements-panel').getByTestId('ai-unavailable');
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText('GOOGLE_GENERATIVE_AI_API_KEY');
  await expect(unavailable).toContainText('trabajo manual');
  await expect(page.getByTestId('guide-ai-note')).toContainText('falta la clave de Gemini');

  await page.getByTestId('ask-ai-trigger').click();
  await page.getByTestId('ask-ai').getByLabel('Qué querés cambiar').fill('Agregá un botón');
  await page.getByTestId('ask-ai').getByRole('button', { name: 'Ver cambios' }).click();
  await expect(page.getByTestId('ask-ai').getByTestId('ai-unavailable')).toContainText('GOOGLE_GENERATIVE_AI_API_KEY');
  await page.getByTestId('ask-ai').getByRole('button', { name: 'Cerrar' }).click();

  // Manual editing is untouched.
  await page.getByRole('tab', { name: 'Biblioteca' }).click();
  await page.getByLabel('Buscar en la biblioteca').fill('inventario con pestañas');
  await page.getByTestId('library-entry').first().getByRole('button', { name: /Insertar/ }).click();
  const stage = page.getByTestId('canvas-stage');
  await expect(stage.locator('[data-node-type="slot"]').first()).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(stage.locator('[data-node-type="slot"]')).toHaveCount(0);
});

test('un cambio de la IA rechazado muestra el motivo y una vista previa vieja se vuelve a pedir', async ({ page, request }) => {
  await createProject(page, /Empezar desde cero/, 'Asistente edición');
  const projectId = projectIdOf(page);
  await page.getByRole('tab', { name: 'Biblioteca' }).click();
  await page.getByLabel('Buscar en la biblioteca').fill('inventario con pestañas');
  await page.getByTestId('library-entry').first().getByRole('button', { name: /Insertar/ }).click();
  const stage = page.getByTestId('canvas-stage');
  await expect(stage.locator('[data-node-type="slot"]').first()).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');

  // A rejected edit shows the service's Spanish reason and changes nothing.
  await stubPost(page, '/ai/edit', () => ({
    status: 422,
    body: {
      error: {
        code: 'locked',
        message: 'La edición propuesta por la IA no se puede aplicar (operación 1): el nodo «Panel» está bloqueado y la IA no puede modificarlo.',
      },
    },
  }));
  // Inserting selected the new pattern; clicking the empty canvas clears it, so the scope is the whole screen.
  await page.locator('[data-canvas-bg]').first().click({ position: { x: 4, y: 4 } });
  await page.getByTestId('ask-ai-trigger').click();
  const ask = page.getByTestId('ask-ai');
  await expect(ask.getByTestId('ask-scope')).toHaveText('Afecta: pantalla completa');
  await ask.getByLabel('Qué querés cambiar').fill('Movelo');
  await ask.getByRole('button', { name: 'Ver cambios' }).click();
  await expect(ask.getByTestId('edit-error')).toContainText('el nodo «Panel» está bloqueado');

  // A preview computed against an older revision is never applied blindly.
  const slot = stage.locator('[data-node-type="slot"]').first();
  const nodeId = (await slot.getAttribute('data-node-id'))!;
  let calls = 0;
  await page.unroute(new RegExp(`/projects/[^/]+/ai/edit$`));
  await stubPost(page, '/ai/edit', async (req) => {
    calls += 1;
    const { screenId } = req.postDataJSON() as { screenId: string };
    const { document, revision } = await currentDocument(request, projectId);
    const batch: OperationBatch = {
      id: `batch_ai_${calls}`,
      label: 'IA: renombrar',
      source: 'ai',
      ops: [{ type: 'updateNode', screenId, nodeId, patch: { name: `Casilla v${calls}` } }],
    };
    return {
      status: 200,
      body: {
        baseRevision: calls === 1 ? revision - 1 : revision,
        batch,
        changes: describeBatch(document, batch),
        explanation: `Intento ${calls}`,
        warnings: [],
      },
    };
  });
  await ask.getByRole('button', { name: 'Ver cambios' }).click();
  await expect(ask.getByTestId('edit-stale')).toBeVisible();
  await ask.getByRole('button', { name: 'Actualizar vista previa' }).click();
  await expect(ask.getByTestId('edit-refreshed')).toBeVisible();
  await expect(ask.getByTestId('edit-explanation')).toHaveText('Intento 2');
  expect(calls).toBe(2);
  await expect(stage.locator(`[data-node-id="${nodeId}"]`)).not.toHaveAttribute('data-node-name', 'Casilla v1');
  await ask.getByRole('button', { name: 'Aplicar' }).click();
  await expect(stage.locator(`[data-node-id="${nodeId}"]`)).toHaveAttribute('data-node-name', 'Casilla v2');
});

test('al borrar una fuente avisa qué podría verse afectado, sin regenerar nada', async ({ page, request }) => {
  await createProject(page, /Crear con IA/, 'Asistente impacto');
  const projectId = projectIdOf(page);
  await uploadBrief(page);
  const [source] = await sourceIdsOf(request, projectId);
  const saved = await request.put(`${SERVICE}/projects/${projectId}/requirements`, {
    data: { requirements: requirementsFixture(source!).slice(0, 1) },
  });
  expect(saved.ok()).toBe(true);

  await page.getByRole('button', { name: 'Eliminar brief.md' }).click();
  await page.getByTestId('source-row').getByRole('button', { name: 'Eliminar', exact: true }).click();
  const notice = page.getByTestId('impact-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('podrían verse afectadas');
  await expect(notice.getByTestId('impact-requirements')).toContainText('Mostrar los objetos del jugador por categorías');
  await expect(page.getByTestId('source-row')).toHaveCount(0);
  await notice.getByRole('button', { name: 'Cerrar aviso de cambios' }).click();
  await expect(notice).toHaveCount(0);
});
