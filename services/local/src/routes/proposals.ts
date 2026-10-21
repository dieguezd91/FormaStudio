import type { FastifyInstance } from 'fastify';
import { notFound } from '../errors';
import {
  createProposalBody,
  listProposalsQuery,
  optionalRevisionBody,
  patchProposalBody,
} from '../schemas';
import { parseInput } from '../validation';
import {
  assertRevision,
  currentDocument,
  parseValidDocument,
  requireProject,
  type ProjectParams,
  type RouteContext,
} from './support';

interface ProposalParams {
  Params: { id: string; proposalId: string };
}

export function registerProposalRoutes(app: FastifyInstance, { repo }: RouteContext): void {
  const requireProposal = (projectId: string, proposalId: string) => {
    requireProject(repo, projectId);
    const proposal = repo.proposals.get(projectId, proposalId);
    if (!proposal) throw notFound('Proposal');
    return proposal;
  };

  app.post<ProjectParams>('/projects/:id/proposals', async (request, reply) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(createProposalBody, request.body);
    const document = parseValidDocument(body.document);
    const proposal = repo.transaction(() =>
      repo.proposals.create(projectId, { ...body, document }),
    );
    return reply.code(201).send(proposal);
  });

  app.get<ProjectParams>('/projects/:id/proposals', async (request) => {
    requireProject(repo, request.params.id);
    const { status } = parseInput(listProposalsQuery, request.query);
    return { proposals: repo.proposals.list(request.params.id, status) };
  });

  app.get<ProposalParams>('/projects/:id/proposals/:proposalId', async (request) =>
    requireProposal(request.params.id, request.params.proposalId),
  );

  app.patch<ProposalParams>('/projects/:id/proposals/:proposalId', async (request) => {
    const { id, proposalId } = request.params;
    requireProposal(id, proposalId);
    const { status } = parseInput(patchProposalBody, request.body);
    return repo.proposals.setStatus(id, proposalId, status);
  });

  app.post<ProposalParams>('/projects/:id/proposals/:proposalId/adopt', async (request) => {
    const { id, proposalId } = request.params;
    const proposal = requireProposal(id, proposalId);
    const body = parseInput(optionalRevisionBody, request.body);
    return repo.transaction(() => {
      assertRevision(currentDocument(repo, id), body?.baseRevision);
      const stored = repo.documents.replace(id, proposal.document);
      return { ...stored, proposal: repo.proposals.setStatus(id, proposalId, 'adopted') };
    });
  });
}
