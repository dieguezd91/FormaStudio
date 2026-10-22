import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createScreen, validateDocument, type FormaDocument } from '@forma/design-core';
import {
  addImageSource,
  documentWithPanelAndButton,
  mockProvider,
  promptOf,
  putDocument,
  putRequirements,
  SCREEN_ID,
} from '../ai/testing';
import { createProject, useServer } from '../testing';

interface Placement {
  entryId: string;
  params?: Record<string, unknown>;
  region?: { x: number; y: number; width: number; height: number };
  parentRef?: number;
}

const placement = (p: Placement) => ({
  params: {},
  region: { x: 100, y: 100, width: 600, height: 400 },
  ...p,
});

const rationale = (overrides: Record<string, unknown> = {}) => ({
  need: 'Encontrar objetos rápido',
  patterns: ['pestañas'],
  tradeoffs: ['más clics'],
  fromReferences: [],
  requirementIds: [],
  ...overrides,
});

const plan = (
  title: string,
  layout: Placement[],
  extra: Record<string, unknown> = {},
  rationaleOverrides: Record<string, unknown> = {},
) => ({
  title,
  summary: `Resumen de ${title}`,
  rationale: rationale(rationaleOverrides),
  layout: layout.map(placement),
  ...extra,
});

const tabsPlan = (title = 'Pestañas') => plan(title, [{ entryId: 'inventory.tabs' }]);
const gridEquipmentPlan = (title = 'Cuadrícula y equipo') =>
  plan(title, [
    { entryId: 'inventory.grid', params: { columns: 6, rows: 5 }, region: { x: 80, y: 100, width: 420, height: 360 } },
    { entryId: 'inventory.equipment', region: { x: 600, y: 100, width: 200, height: 360 } },
  ]);
const listPlan = (title = 'Lista') => plan(title, [{ entryId: 'inventory.list' }]);

interface ProposalMeta {
  id: string;
  title: string;
  status: string;
  origin: string;
  rationale: { requirementIds: string[]; fromReferences: string[] };
}
interface Warning {
  code: string;
  message: string;
  proposalId?: string;
}

const run = (app: FastifyInstance, projectId: string, body: object = {}) =>
  app.inject({ method: 'POST', url: `/projects/${projectId}/ai/proposals`, payload: body });

const fetchProposal = async (app: FastifyInstance, projectId: string, proposalId: string) =>
  (
    await app.inject({ method: 'GET', url: `/projects/${projectId}/proposals/${proposalId}` })
  ).json<ProposalMeta & { document: FormaDocument }>();

describe('POST /projects/:id/ai/proposals', () => {
  it('stores 3 structurally distinct candidates whose documents validate', async () => {
    const provider = mockProvider([
      { proposals: [tabsPlan(), gridEquipmentPlan(), listPlan()] },
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);

    const response = await run(app, id, { brief: 'Inventario de un RPG' });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ proposals: ProposalMeta[]; warnings: Warning[] }>();
    expect(body.proposals.map((p) => p.title)).toEqual(['Pestañas', 'Cuadrícula y equipo', 'Lista']);
    expect(body.proposals.every((p) => p.status === 'candidate' && p.origin === 'ai')).toBe(true);
    expect(body.warnings).toEqual([]);
    expect(provider.model.doGenerateCalls).toHaveLength(1);
    expect(promptOf(provider.model.doGenerateCalls[0])).toContain('Inventario de un RPG');

    const signatures = new Set<string>();
    for (const meta of body.proposals) {
      const { document } = await fetchProposal(app, id, meta.id);
      expect(validateDocument(document)).toEqual([]);
      expect(document.screens).toHaveLength(1);
      const nodes = Object.values(document.screens[0]!.nodes);
      expect(nodes.length).toBeGreaterThan(3);
      signatures.add(
        nodes
          .map((n) => n.origin.ref ?? n.type)
          .sort()
          .join(','),
      );
    }
    expect(signatures.size).toBe(3);

    const listed = await app.inject({ method: 'GET', url: `/projects/${id}/proposals` });
    expect(listed.json().proposals).toHaveLength(3);
  });

  it('positions each placement with its region and nests it under parentRef', async () => {
    const nested = plan('Anidado', [
      { entryId: 'panel', params: { width: 500, height: 300 }, region: { x: 40, y: 50, width: 500, height: 300 } },
      { entryId: 'button', params: { label: 'Cerrar' }, region: { x: 10, y: 20, width: 120, height: 40 }, parentRef: 0 },
    ]);
    const provider = mockProvider([{ proposals: [nested] }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);

    const meta = (await run(app, id, { count: 1 })).json<{ proposals: ProposalMeta[] }>()
      .proposals[0]!;
    const { document } = await fetchProposal(app, id, meta.id);
    const screen = document.screens[0]!;
    const nodes = Object.values(screen.nodes);
    const panel = nodes.find((n) => n.type === 'panel')!;
    const button = nodes.find((n) => n.type === 'button')!;
    expect(panel.parentId).toBe(screen.rootId);
    expect(panel.layout).toMatchObject({ x: 40, y: 50, width: 500, height: 300 });
    expect(button.parentId).toBe(panel.id);
    expect(button.layout).toMatchObject({ x: 10, y: 20, width: 120, height: 40 });
  });

  it('regenerates structural duplicates once and keeps the distinct replacement', async () => {
    const provider = mockProvider([
      {
        proposals: [
          tabsPlan('A'),
          plan('A-bis', [{ entryId: 'inventory.tabs', params: { columns: 4 } }]),
          gridEquipmentPlan('B'),
        ],
      },
      { proposals: [listPlan('C')] },
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);

    const response = await run(app, id);
    expect(response.statusCode).toBe(201);
    const body = response.json<{ proposals: ProposalMeta[]; warnings: Warning[] }>();
    expect(body.proposals.map((p) => p.title).sort()).toEqual(['A', 'B', 'C']);
    expect(body.warnings.filter((w) => w.code === 'distinctness')).toEqual([]);
    expect(provider.model.doGenerateCalls).toHaveLength(2);
    const regeneration = promptOf(provider.model.doGenerateCalls[1]);
    expect(regeneration).toContain('structurally different');
    expect(regeneration).toContain('\\"title\\":\\"A\\"');
  });

  it('returns the duplicates with a distinctness warning when regeneration does not help', async () => {
    const provider = mockProvider([
      { proposals: [tabsPlan('A'), tabsPlan('A-bis'), gridEquipmentPlan('B')] },
      { proposals: [tabsPlan('A-ter')] },
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);

    const response = await run(app, id);
    expect(response.statusCode).toBe(201);
    const body = response.json<{ proposals: ProposalMeta[]; warnings: Warning[] }>();
    expect(body.proposals).toHaveLength(3);
    expect(body.warnings.map((w) => w.code)).toContain('distinctness');
    expect(provider.model.doGenerateCalls).toHaveLength(2);
  });

  it('keeps the original proposals with a warning when regeneration itself is invalid', async () => {
    const provider = mockProvider([
      { proposals: [tabsPlan('A'), tabsPlan('A-bis')] },
      { proposals: [plan('Rota', [{ entryId: 'does.not.exist' }])] },
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);

    const response = await run(app, id, { count: 2 });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ proposals: ProposalMeta[]; warnings: Warning[] }>();
    expect(body.proposals).toHaveLength(2);
    expect(body.warnings.map((w) => w.code)).toContain('distinctness');
    expect(provider.model.doGenerateCalls).toHaveLength(2);
  });

  it('retries once on invalid entry params, then answers 502 and stores nothing', async () => {
    const broken = () =>
      plan('Rota', [{ entryId: 'inventory.grid', params: { columns: 999 } }]);
    const provider = mockProvider([{ proposals: [broken()] }, { proposals: [broken()] }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);

    const response = await run(app, id, { count: 1 });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('aiInvalidOutput');
    expect(JSON.stringify(response.json().error.issues)).toContain('inventory.grid');
    expect(provider.model.doGenerateCalls).toHaveLength(2);
    expect(promptOf(provider.model.doGenerateCalls[1])).toContain('rejected');
    const listed = await app.inject({ method: 'GET', url: `/projects/${id}/proposals` });
    expect(listed.json().proposals).toEqual([]);
  });

  it('recovers when the retry fixes an unknown entry or a wrong proposal count', async () => {
    const provider = mockProvider([
      { proposals: [plan('X', [{ entryId: 'inventory.nope' }]), tabsPlan('B')] },
      { proposals: [tabsPlan('A'), gridEquipmentPlan('B')] },
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    const response = await run(app, id, { count: 2 });
    expect(response.statusCode).toBe(201);
    expect(response.json().proposals).toHaveLength(2);
    expect(provider.model.doGenerateCalls).toHaveLength(2);
  });

  it('asks for the requested count and rejects an out-of-range one', async () => {
    const provider = mockProvider([{ proposals: [tabsPlan(), listPlan()] }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    expect((await run(app, id, { count: 0 })).statusCode).toBe(400);
    expect((await run(app, id, { count: 9 })).statusCode).toBe(400);
    const response = await run(app, id, { count: 2 });
    expect(response.json().proposals).toHaveLength(2);
    expect(promptOf(provider.model.doGenerateCalls[0])).toContain('Design 2 proposal');
  });

  it('drops requirement and reference ids that do not exist, and reports it', async () => {
    let referenceId = '';
    const provider = mockProvider([
      () => ({
        proposals: [
          plan('A', [{ entryId: 'inventory.tabs' }], {}, {
            requirementIds: ['req_real', 'req_ghost'],
            fromReferences: [referenceId, 'src_ghost'],
          }),
        ],
      }),
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    await putRequirements(app, id, [
      { id: 'req_real', text: 'Pestañas', kind: 'interaction', status: 'assumed', sourceRefs: [] },
    ]);
    referenceId = (await addImageSource(app, id)).id;

    const response = await run(app, id, { count: 1 });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ proposals: ProposalMeta[]; warnings: Warning[] }>();
    expect(body.proposals[0]!.rationale.requirementIds).toEqual(['req_real']);
    expect(body.proposals[0]!.rationale.fromReferences).toEqual([referenceId]);
    const dropped = body.warnings.filter((w) => w.code === 'unknownReferences');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.message).toContain('req_ghost');
    expect(dropped[0]!.message).toContain('src_ghost');
    // Reference metadata, never content, reaches the model.
    const prompt = promptOf(provider.model.doGenerateCalls[0]);
    expect(prompt).toContain('req_real');
    expect(prompt).not.toContain('image/png');
  });

  it('applies token overrides on top of the library defaults', async () => {
    const themed = plan('Oscuro', [{ entryId: 'inventory.tabs' }], {
      tokens: { colors: { accent: '#ff0000' }, spacing: { md: 20 } },
    });
    const provider = mockProvider([{ proposals: [themed] }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    const meta = (await run(app, id, { count: 1 })).json().proposals[0] as ProposalMeta;
    const { document } = await fetchProposal(app, id, meta.id);
    expect(document.tokens.colors.accent).toBe('#ff0000');
    expect(document.tokens.spacing.md).toBe(20);
    expect(validateDocument(document)).toEqual([]);
  });

  it('with screenId keeps the other screens and the screen identity, and warns about locked nodes', async () => {
    const provider = mockProvider([{ proposals: [tabsPlan('Rediseño')] }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    const { document, panelId } = documentWithPanelAndButton();
    const withLock = structuredClone(document);
    withLock.screens[0]!.nodes[panelId]!.locked = true;
    withLock.screens.push(createScreen({ name: 'Dos', id: 'screen_two', rootId: 'root_two' }));
    await putDocument(app, id, withLock);

    const response = await run(app, id, { screenId: SCREEN_ID, count: 1 });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ proposals: ProposalMeta[]; warnings: Warning[] }>();
    expect(body.warnings.map((w) => w.code)).toContain('lockedNodesReplaced');
    const proposal = await fetchProposal(app, id, body.proposals[0]!.id);
    expect(proposal.document.screens.map((s) => s.id)).toEqual([SCREEN_ID, 'screen_two']);
    const replaced = proposal.document.screens[0]!;
    expect(Object.values(replaced.nodes).some((n) => n.origin.ref === 'inventory.tabs')).toBe(true);
    expect(replaced.nodes[panelId]).toBeUndefined();
    expect(proposal.document.id).toBe(withLock.id);
    expect(validateDocument(proposal.document)).toEqual([]);
  });

  it('answers 404 for an unknown screen and sends no model call', async () => {
    const provider = mockProvider([]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    expect((await run(app, id, { screenId: 'screen_nope' })).statusCode).toBe(404);
    expect(provider.model.doGenerateCalls).toHaveLength(0);
  });
});
