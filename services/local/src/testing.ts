import { afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  applyBatch,
  createEmptyDocument,
  createScreen,
  createSequentialIdGenerator,
  type FormaDocument,
} from '@forma/design-core';
import { insertEntry } from '@forma/library';
import { buildServer, type ServerOptions } from './server';

/**
 * Lazily builds one in-memory server per test and closes it afterwards. Closing is a no-op when
 * the test never built a server, so a setup failure is not masked by a teardown TypeError.
 */
export function useServer(options: ServerOptions = {}): () => FastifyInstance {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });
  return () => (app ??= buildServer({ dbPath: ':memory:', ...options }));
}

export interface ProjectBody {
  name?: string;
  target?: { platform: 'unity' | 'web'; ui?: 'ugui' | 'uitoolkit' };
}

export async function createProject(app: FastifyInstance, body: ProjectBody = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/projects',
    payload: { name: 'Inventory', target: { platform: 'unity', ui: 'ugui' }, ...body },
  });
  return response.json<{ id: string; name: string; updatedAt: string }>();
}

/** A structurally valid document with one screen. */
export function sampleDocument(name = 'Sample'): FormaDocument {
  const doc = createEmptyDocument({ name, target: { platform: 'unity', ui: 'ugui' } });
  return {
    ...doc,
    screens: [createScreen({ name: 'Main', id: 'screen_main', rootId: 'node_root' })],
  };
}

/** `sampleDocument` with the tabbed inventory pattern inserted under the root of `Main`. */
export function inventoryDocument(): FormaDocument {
  const doc = sampleDocument();
  const inserted = insertEntry(doc, {
    entryId: 'inventory.tabs',
    screenId: 'screen_main',
    parentId: 'node_root',
    idGen: createSequentialIdGenerator(),
  });
  if (!inserted.ok) throw new Error(inserted.error.message);
  const applied = applyBatch(doc, inserted.value);
  if (!applied.ok) throw new Error(applied.error.message);
  return applied.doc;
}

/** Parses cleanly but breaks tree invariants (root points to a missing node). */
export function structurallyBrokenDocument(): FormaDocument {
  const doc = sampleDocument();
  const [screen] = doc.screens;
  return { ...doc, screens: [{ ...screen!, rootId: 'node_missing' }] };
}

export const addScreenBatch = (id = 'batch_1', screenId = 'screen_extra') => ({
  id,
  label: 'Add screen',
  source: 'manual',
  ops: [
    {
      type: 'addScreen',
      screen: createScreen({ name: 'Extra', id: screenId, rootId: `${screenId}_root` }),
    },
  ],
});

export async function getDocument(app: FastifyInstance, projectId: string) {
  const response = await app.inject({ method: 'GET', url: `/projects/${projectId}/document` });
  return response.json<{ document: FormaDocument; revision: number }>();
}

export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
