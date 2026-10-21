import type { OperationBatch } from '@forma/design-core';
import { errorFromResponse, serviceUnavailableError } from './errors';
import type { NewSource, Project, SourceMeta, StoredDocument, VersionMeta } from './types';

export const DEFAULT_SERVICE_URL = 'http://127.0.0.1:4318';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_SERVICE_URL).replace(/\/+$/, '');
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch {
      throw serviceUnavailableError();
    }
    if (!response.ok) {
      const parsed: unknown = await response.json().catch(() => null);
      throw errorFromResponse(response.status, parsed);
    }
    return response;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await send(method, path, body);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const project = (id: string) => `/projects/${encodeURIComponent(id)}`;
  const source = (id: string, sourceId: string) =>
    `${project(id)}/sources/${encodeURIComponent(sourceId)}`;
  const version = (id: string, versionId: string) =>
    `${project(id)}/versions/${encodeURIComponent(versionId)}`;

  return {
    baseUrl,

    health: () => request<{ ok: boolean }>('GET', '/health'),

    listProjects: async (): Promise<Project[]> =>
      (await request<{ projects: Project[] }>('GET', '/projects')).projects,
    createProject: (name: string) =>
      request<Project>('POST', '/projects', { name, target: { platform: 'unity', ui: 'ugui' } }),
    getProject: (id: string) => request<Project>('GET', project(id)),

    getDocument: (id: string) => request<StoredDocument>('GET', `${project(id)}/document`),
    applyBatch: (id: string, batch: OperationBatch, baseRevision: number) =>
      request<StoredDocument>('POST', `${project(id)}/document/batches`, { batch, baseRevision }),

    listSources: async (id: string): Promise<SourceMeta[]> =>
      (await request<{ sources: SourceMeta[] }>('GET', `${project(id)}/sources`)).sources,
    createSource: (id: string, input: NewSource) =>
      request<SourceMeta>('POST', `${project(id)}/sources`, input),
    deleteSource: (id: string, sourceId: string) => request<void>('DELETE', source(id, sourceId)),
    sourceBlobUrl: (id: string, sourceId: string) => `${baseUrl}${source(id, sourceId)}/blob`,
    getSourceBlob: async (id: string, sourceId: string): Promise<Blob> =>
      (await send('GET', `${source(id, sourceId)}/blob`)).blob(),

    listVersions: async (id: string): Promise<VersionMeta[]> =>
      (await request<{ versions: VersionMeta[] }>('GET', `${project(id)}/versions`)).versions,
    createVersion: (id: string, label: string) =>
      request<VersionMeta>('POST', `${project(id)}/versions`, { label }),
    approveVersion: (id: string, versionId: string) =>
      request<VersionMeta>('POST', `${version(id, versionId)}/approve`),
    restoreVersion: (id: string, versionId: string, baseRevision?: number) =>
      request<StoredDocument>(
        'POST',
        `${version(id, versionId)}/restore`,
        baseRevision === undefined ? undefined : { baseRevision },
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
