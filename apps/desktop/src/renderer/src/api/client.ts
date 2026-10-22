import type { OperationBatch } from '@forma/design-core';
import { abortedError, errorFromResponse, serviceUnavailableError } from './errors';
import type {
  EditPreview,
  EditRequest,
  ImpactReport,
  NewSource,
  Project,
  Proposal,
  ProposalMeta,
  ProposalsRequest,
  ProposalsResult,
  ProposalStatus,
  Requirement,
  RequirementsResult,
  SourceMeta,
  StoredDocument,
  VersionMeta,
} from './types';

export const DEFAULT_SERVICE_URL = 'http://127.0.0.1:4318';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_SERVICE_URL).replace(/\/+$/, '');
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  interface RequestOptions {
    signal?: AbortSignal | undefined;
    /** AI routes: their error envelope is mapped to AI-specific errors. */
    ai?: boolean;
  }

  async function send(
    method: string,
    path: string,
    body?: unknown,
    { signal, ai }: RequestOptions = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw abortedError();
      throw serviceUnavailableError();
    }
    if (!response.ok) {
      const parsed: unknown = await response.json().catch(() => null);
      throw errorFromResponse(response.status, parsed, { ai: ai === true });
    }
    return response;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const response = await send(method, path, body, options);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const project = (id: string) => `/projects/${encodeURIComponent(id)}`;
  const source = (id: string, sourceId: string) =>
    `${project(id)}/sources/${encodeURIComponent(sourceId)}`;
  const proposal = (id: string, proposalId: string) =>
    `${project(id)}/proposals/${encodeURIComponent(proposalId)}`;
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

    listRequirements: async (id: string): Promise<Requirement[]> =>
      (await request<{ requirements: Requirement[] }>('GET', `${project(id)}/requirements`)).requirements,

    listProposals: async (id: string, status?: ProposalStatus): Promise<ProposalMeta[]> =>
      (
        await request<{ proposals: ProposalMeta[] }>(
          'GET',
          `${project(id)}/proposals${status ? `?status=${status}` : ''}`,
        )
      ).proposals,
    getProposal: (id: string, proposalId: string) => request<Proposal>('GET', proposal(id, proposalId)),
    setProposalStatus: (id: string, proposalId: string, status: 'candidate' | 'discarded') =>
      request<ProposalMeta>('PATCH', proposal(id, proposalId), { status }),
    adoptProposal: (id: string, proposalId: string, baseRevision?: number) =>
      request<StoredDocument & { proposal: ProposalMeta }>(
        'POST',
        `${proposal(id, proposalId)}/adopt`,
        baseRevision === undefined ? undefined : { baseRevision },
      ),

    extractRequirements: (id: string, sourceIds?: string[], signal?: AbortSignal) =>
      request<RequirementsResult>(
        'POST',
        `${project(id)}/ai/requirements`,
        sourceIds === undefined ? undefined : { sourceIds },
        { signal, ai: true },
      ),
    generateProposals: (id: string, body: ProposalsRequest, signal?: AbortSignal) =>
      request<ProposalsResult>('POST', `${project(id)}/ai/proposals`, body, { signal, ai: true }),
    previewEdit: (id: string, body: EditRequest, signal?: AbortSignal) =>
      request<EditPreview>('POST', `${project(id)}/ai/edit`, body, { signal, ai: true }),
    getImpact: (id: string, since?: string) =>
      request<ImpactReport>(
        'GET',
        `${project(id)}/ai/impact${since === undefined ? '' : `?since=${encodeURIComponent(since)}`}`,
        undefined,
        { ai: true },
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
