import type { FastifyInstance } from 'fastify';
import type { AiProvider } from '@forma/ai';
import { mockModel, toWireEdit, toWireProposals, type MockResponse } from '@forma/ai/testing';
import {
  applyBatch,
  createSequentialIdGenerator,
  type FormaDocument,
  type FormaNode,
} from '@forma/design-core';
import { insertEntry } from '@forma/library';
import { PNG_BASE64, sampleDocument } from '../testing';

type Domain = Record<string, unknown>;

/**
 * Scripts are written in domain terms (proposals with param records, edits with patch objects);
 * the real model answers the wire schemas, so object answers are encoded the same way. Strings
 * (raw text, or hand-written wire JSON) and other answers pass through unchanged.
 */
function encodeAnswer(answer: unknown): unknown {
  if (typeof answer !== 'object' || answer === null) return answer;
  const domain = answer as Domain;
  if (Array.isArray(domain.proposals)) return toWireProposals(domain as { proposals: Domain[] });
  if (Array.isArray(domain.operations)) return toWireEdit(domain as Parameters<typeof toWireEdit>[0]);
  return answer;
}

const encodeResponse = (response: MockResponse): MockResponse =>
  typeof response === 'function'
    ? async (call: never) => encodeAnswer(await (response as (call: never) => unknown)(call))
    : encodeAnswer(response);

/** Instant retries: overload backoff must not slow tests down. */
export const TEST_PROVIDER_RETRY = { overloadedRetries: 1, backoffMs: 0 } as const;

/** A provider whose text and vision models answer from scripts (see `mockModel`). */
export function mockProvider(text: MockResponse[], vision: MockResponse[] = []) {
  const model = mockModel(text.map(encodeResponse));
  const visionModel = mockModel(vision.map(encodeResponse));
  const ai: AiProvider = { id: 'mock', model, visionModel, providerRetry: TEST_PROVIDER_RETRY };
  return { ai, model, visionModel };
}

export const promptOf = (call: unknown): string => JSON.stringify((call as { prompt: unknown }).prompt);

export async function addSource(
  app: FastifyInstance,
  projectId: string,
  body: Record<string, unknown> = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/sources`,
    payload: {
      kind: 'document',
      title: 'Brief',
      mimeType: 'text/markdown',
      content: 'placeholder',
      scope: { level: 'project' },
      ...body,
    },
  });
  return response.json<{ id: string; sourceVersion: number }>();
}

export const addImageSource = (app: FastifyInstance, projectId: string, title = 'Referencia') =>
  addSource(app, projectId, {
    kind: 'reference',
    title,
    mimeType: 'image/png',
    content: undefined,
    dataBase64: PNG_BASE64,
  });

export async function putRequirements(
  app: FastifyInstance,
  projectId: string,
  requirements: unknown[],
) {
  const response = await app.inject({
    method: 'PUT',
    url: `/projects/${projectId}/requirements`,
    payload: { requirements },
  });
  return response.json();
}

export const SCREEN_ID = 'screen_main';
export const ROOT_ID = 'node_root';

/** The sample screen with a panel and a button inserted under its root. */
export function documentWithPanelAndButton(): {
  document: FormaDocument;
  panelId: string;
  buttonId: string;
} {
  let document = sampleDocument();
  const idGen = createSequentialIdGenerator();
  const ids: string[] = [];
  for (const entryId of ['panel', 'button']) {
    const inserted = insertEntry(document, {
      entryId,
      screenId: SCREEN_ID,
      parentId: ROOT_ID,
      idGen,
    });
    if (!inserted.ok) throw new Error(inserted.error.message);
    const applied = applyBatch(document, inserted.value);
    if (!applied.ok) throw new Error(applied.error.message);
    document = applied.doc;
    const added = inserted.value.ops.find((op) => op.type === 'addNode' && op.parentId === ROOT_ID);
    if (added?.type !== 'addNode') throw new Error('no root node added');
    ids.push(added.node.id);
  }
  return { document, panelId: ids[0]!, buttonId: ids[1]! };
}

export const nodeOf = (document: FormaDocument, nodeId: string): FormaNode | undefined =>
  document.screens.find((s) => s.id === SCREEN_ID)?.nodes[nodeId];

export async function putDocument(app: FastifyInstance, projectId: string, document: FormaDocument) {
  const response = await app.inject({
    method: 'PUT',
    url: `/projects/${projectId}/document`,
    payload: { document, baseRevision: 1 },
  });
  return response.json<{ revision: number }>();
}
