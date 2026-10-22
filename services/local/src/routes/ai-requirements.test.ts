import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { addImageSource, addSource, mockProvider, promptOf } from '../ai/testing';
import { createProject, useServer } from '../testing';

const BRIEF = [
  'El inventario muestra los objetos en una cuadrícula de 5 columnas.',
  'Los objetos se pueden apilar hasta 99 unidades.',
].join('\n');

interface Req {
  id: string;
  text: string;
  kind: string;
  status: string;
  sourceRefs: { sourceId: string; sourceVersion: number; excerpt: string }[];
}

interface Warning {
  code: string;
  message: string;
  sourceId?: string;
  requirementId?: string;
}

const extracted = (
  text: string,
  status: string,
  sourceRefs: { sourceId: string; excerpt: string }[],
  kind = 'data',
) => ({ text, kind, status, sourceRefs });

const run = (app: FastifyInstance, projectId: string, body?: object) =>
  app.inject({
    method: 'POST',
    url: `/projects/${projectId}/ai/requirements`,
    ...(body === undefined ? {} : { payload: body }),
  });

describe('POST /projects/:id/ai/requirements', () => {
  it('persists the extracted requirements with the real source version', async () => {
    let sourceId = '';
    const provider = mockProvider([
      () => ({
        requirements: [
          extracted('La cuadrícula tiene 5 columnas', 'confirmed', [
            { sourceId, excerpt: 'cuadrícula de 5 columnas' },
          ]),
          extracted('Se necesita un filtro por categoría', 'gap', []),
        ],
      }),
    ]);
    const server = useServer({ ai: provider.ai });
    const app = server();
    const { id } = await createProject(app);
    sourceId = (await addSource(app, id, { content: BRIEF })).id;

    const response = await run(app, id);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ requirements: Req[] }>();
    expect(body.requirements).toHaveLength(2);
    expect(body.requirements[0]).toMatchObject({
      status: 'confirmed',
      kind: 'data',
      sourceRefs: [{ sourceId, sourceVersion: 1, excerpt: 'cuadrícula de 5 columnas' }],
    });
    expect(body.requirements[1]).toMatchObject({ status: 'gap', sourceRefs: [] });

    const stored = await app.inject({ method: 'GET', url: `/projects/${id}/requirements` });
    expect(stored.json().requirements).toEqual(body.requirements);
  });

  it('keeps confirmed when the excerpt matches after whitespace and case normalization', async () => {
    let sourceId = '';
    const provider = mockProvider([
      () => ({
        requirements: [
          extracted('Apilado hasta 99', 'confirmed', [
            { sourceId, excerpt: 'apilar   HASTA\n99 unidades' },
          ]),
        ],
      }),
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    sourceId = (await addSource(app, id, { content: BRIEF })).id;
    const body = (await run(app, id)).json<{ requirements: Req[]; warnings: Warning[] }>();
    expect(body.requirements[0]!.status).toBe('confirmed');
    expect(body.warnings).toEqual([]);
  });

  it('downgrades confirmed to assumed when the excerpt is not in the source, and says so', async () => {
    let sourceId = '';
    const provider = mockProvider([
      () => ({
        requirements: [
          extracted('Hay un botón de soltar', 'confirmed', [
            { sourceId, excerpt: 'El jugador puede soltar objetos' },
          ]),
        ],
      }),
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    sourceId = (await addSource(app, id, { content: BRIEF })).id;

    const body = (await run(app, id)).json<{ requirements: Req[]; warnings: Warning[] }>();
    expect(body.requirements[0]).toMatchObject({ status: 'assumed', sourceRefs: [] });
    expect(body.warnings).toContainEqual(
      expect.objectContaining({
        code: 'requirementDowngraded',
        requirementId: body.requirements[0]!.id,
      }),
    );
    const stored = await app.inject({ method: 'GET', url: `/projects/${id}/requirements` });
    expect(stored.json().requirements[0].status).toBe('assumed');
  });

  it('never confirms a requirement that is only evidenced by an image (§5.4)', async () => {
    let imageId = '';
    const provider = mockProvider(
      [],
      [
        () => ({
          requirements: [
            extracted(
              'Arrastrar objetos entre casillas',
              'confirmed',
              [{ sourceId: imageId, excerpt: 'un objeto se arrastra entre casillas' }],
              'interaction',
            ),
          ],
        }),
      ],
    );
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    imageId = (await addImageSource(app, id)).id;

    const body = (await run(app, id)).json<{ requirements: Req[] }>();
    expect(body.requirements[0]).toMatchObject({ kind: 'interaction', status: 'assumed' });
    expect(body.requirements[0]!.sourceRefs).toEqual([
      expect.objectContaining({ sourceId: imageId, sourceVersion: 1 }),
    ]);
  });

  it('sends reference images to the vision model as image parts, and only then', async () => {
    const provider = mockProvider([{ requirements: [] }], [{ requirements: [] }]);
    const app = useServer({ ai: provider.ai })();
    const withText = await createProject(app);
    await addSource(app, withText.id, { content: BRIEF });
    expect((await run(app, withText.id)).statusCode).toBe(200);
    expect(provider.model.doGenerateCalls).toHaveLength(1);
    expect(provider.visionModel.doGenerateCalls).toHaveLength(0);

    const withImage = await createProject(app);
    await addImageSource(app, withImage.id);
    expect((await run(app, withImage.id)).statusCode).toBe(200);
    expect(provider.visionModel.doGenerateCalls).toHaveLength(1);
    const prompt = promptOf(provider.visionModel.doGenerateCalls[0]);
    expect(prompt).toContain('"type":"file"');
    expect(prompt).toContain('image/png');
  });

  it('retries once when the model cites an unknown source id', async () => {
    let sourceId = '';
    const provider = mockProvider([
      {
        requirements: [
          extracted('Cuadrícula', 'confirmed', [{ sourceId: 'src_made_up', excerpt: 'x' }]),
        ],
      },
      () => ({
        requirements: [
          extracted('Cuadrícula', 'confirmed', [
            { sourceId, excerpt: 'cuadrícula de 5 columnas' },
          ]),
        ],
      }),
    ]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    sourceId = (await addSource(app, id, { content: BRIEF })).id;

    const response = await run(app, id);
    expect(response.statusCode).toBe(200);
    expect(response.json().requirements[0].status).toBe('confirmed');
    expect(provider.model.doGenerateCalls).toHaveLength(2);
    expect(promptOf(provider.model.doGenerateCalls[1])).toContain('src_made_up');
  });

  it('responds 502 aiInvalidOutput with the issues when the model stays invalid', async () => {
    const provider = mockProvider([{ nope: true }, { nope: true }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    await addSource(app, id, { content: BRIEF });
    const response = await run(app, id);
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toMatchObject({ code: 'aiInvalidOutput' });
    expect(response.json().error.issues.length).toBeGreaterThan(0);
    const stored = await app.inject({ method: 'GET', url: `/projects/${id}/requirements` });
    expect(stored.json().requirements).toEqual([]);
  });

  it('skips PDFs without text with a warning and never sends their bytes', async () => {
    const provider = mockProvider([{ requirements: [] }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    await addSource(app, id, { content: BRIEF });
    const pdfBytes = Buffer.from('%PDF-1.4 secret-pdf-bytes');
    const pdf = await addSource(app, id, {
      title: 'Spec.pdf',
      mimeType: 'application/pdf',
      content: undefined,
      dataBase64: pdfBytes.toString('base64'),
    });

    const body = (await run(app, id)).json<{ warnings: Warning[] }>();
    expect(body.warnings).toContainEqual(
      expect.objectContaining({ code: 'sourceSkipped', sourceId: pdf.id }),
    );
    const prompt = promptOf(provider.model.doGenerateCalls[0]);
    expect(prompt).not.toContain('secret-pdf-bytes');
    expect(prompt).not.toContain(pdfBytes.toString('base64'));
  });

  it('responds 422 noSources without calling the model when nothing is usable', async () => {
    const provider = mockProvider([]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    await addSource(app, id, {
      mimeType: 'application/pdf',
      content: undefined,
      dataBase64: Buffer.from('%PDF').toString('base64'),
    });
    const response = await run(app, id);
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('noSources');
    expect(provider.model.doGenerateCalls).toHaveLength(0);
  });

  it('only sends project-scoped sources unless the request names others (§15.2)', async () => {
    const provider = mockProvider([{ requirements: [] }, { requirements: [] }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    await addSource(app, id, { title: 'Global', content: 'texto-global' });
    const scoped = await addSource(app, id, {
      title: 'Pantalla',
      content: 'texto-de-pantalla',
      scope: { level: 'screen', targetId: 'screen_main' },
    });

    expect((await run(app, id)).statusCode).toBe(200);
    const first = promptOf(provider.model.doGenerateCalls[0]);
    expect(first).toContain('texto-global');
    expect(first).not.toContain('texto-de-pantalla');

    expect((await run(app, id, { sourceIds: [scoped.id] })).statusCode).toBe(200);
    const second = promptOf(provider.model.doGenerateCalls[1]);
    expect(second).toContain('texto-de-pantalla');
    expect(second).not.toContain('texto-global');

    expect((await run(app, id, { sourceIds: ['src_nope'] })).statusCode).toBe(404);
  });

  it('skips images above the configured byte limit with a warning', async () => {
    const provider = mockProvider([{ requirements: [] }]);
    const app = useServer({ ai: provider.ai, maxAiBlobBytes: 10 })();
    const { id } = await createProject(app);
    await addSource(app, id, { content: BRIEF });
    const image = await addImageSource(app, id);
    const body = (await run(app, id)).json<{ warnings: Warning[] }>();
    expect(body.warnings).toContainEqual(
      expect.objectContaining({ code: 'sourceSkipped', sourceId: image.id }),
    );
    expect(provider.visionModel.doGenerateCalls).toHaveLength(0);
    expect(promptOf(provider.model.doGenerateCalls[0])).not.toContain('image/png');
  });
});
