import {
  AiOutputError,
  AiProviderError,
  buildLibraryCatalog,
  generateValidated,
  proposalsOutputSchema,
  type AiProvider,
  type CompositionPlan,
} from '@forma/ai';
import { PROPOSALS_SYSTEM, buildProposalsMessages } from '@forma/ai/prompts';
import type { FormaDocument } from '@forma/design-core';
import type { ProposalMeta, Repository } from '../db';
import { notFound } from '../errors';
import { compilePlan, type CompiledPlan } from './compile';
import { warning, type AiWarning } from './warnings';

export interface ProposalsRequest {
  screenId?: string | undefined;
  count: number;
  brief?: string | undefined;
}

export interface ProposalsResult {
  proposals: ProposalMeta[];
  warnings: AiWarning[];
}

interface Candidate extends CompiledPlan {
  plan: CompositionPlan;
}

const DEFAULT_SCREEN = { name: 'Nueva pantalla', width: 1920, height: 1080 };

export async function generateProposals(
  { repo, ai }: { repo: Repository; ai: AiProvider },
  projectId: string,
  base: FormaDocument,
  request: ProposalsRequest,
): Promise<ProposalsResult> {
  const screen =
    request.screenId === undefined ? undefined : base.screens.find((s) => s.id === request.screenId);
  if (request.screenId !== undefined && !screen) throw notFound('Screen');

  const requirements = repo.requirements.list(projectId);
  const references = repo.sources
    .list(projectId)
    .filter((source) => source.kind === 'reference' && source.scope.level === 'project')
    .map(({ id, title, intent }) => ({ id, title, intent }));
  const requirementIds = new Set(requirements.map((r) => r.id));
  const referenceIds = new Set(references.map((r) => r.id));
  const catalog = buildLibraryCatalog();
  const screenInfo = screen
    ? { name: screen.name, width: screen.size.width, height: screen.size.height }
    : DEFAULT_SCREEN;

  /** One model call; every plan must compile into a valid document or the whole answer is retried. */
  const generate = (
    count: number,
    distinctFrom: { title: string; entries: string[] }[] | undefined,
    retries: number,
  ): Promise<Candidate[]> =>
    generateValidated({
      model: ai.model,
      schema: proposalsOutputSchema,
      schemaName: 'proposals',
      system: PROPOSALS_SYSTEM,
      messages: buildProposalsMessages({
        count,
        screen: screenInfo,
        brief: request.brief,
        requirements: requirements.map(({ id, text, kind, status }) => ({ id, text, kind, status })),
        references,
        catalog,
        distinctFrom,
      }),
      retries,
      validate: (output) => {
        if (output.proposals.length !== count) {
          return {
            ok: false,
            issues: [`proposals: expected exactly ${count} proposal(s), got ${output.proposals.length}`],
          };
        }
        const candidates: Candidate[] = [];
        const issues: string[] = [];
        output.proposals.forEach((plan, i) => {
          const compiled = compilePlan(plan, base, request.screenId, `proposals.${i}`);
          if (compiled.ok) candidates.push({ plan, ...compiled.value });
          else issues.push(...compiled.issues);
        });
        return issues.length > 0 ? { ok: false, issues } : { ok: true, value: candidates };
      },
    });

  let candidates = await generate(request.count, undefined, 1);
  const warnings: AiWarning[] = [];

  const duplicateIndexes = (list: Candidate[]): number[] => {
    const seen = new Set<string>();
    return list.flatMap((candidate, i) => (seen.has(candidate.signature) ? [i] : (seen.add(candidate.signature), [])));
  };

  const duplicates = duplicateIndexes(candidates);
  if (duplicates.length > 0) {
    const skip = new Set(duplicates);
    const kept = candidates.filter((_, i) => !skip.has(i));
    try {
      const fresh = await generate(
        duplicates.length,
        kept.map((c) => ({ title: c.plan.title, entries: c.entryIds })),
        0,
      );
      const used = new Set(kept.map((c) => c.signature));
      const next = [...candidates];
      duplicates.forEach((slot, k) => {
        const replacement = fresh[k];
        if (replacement && !used.has(replacement.signature)) {
          used.add(replacement.signature);
          next[slot] = replacement;
        }
      });
      candidates = next;
    } catch (error) {
      // A failed regeneration must not discard proposals that are already valid.
      if (!(error instanceof AiOutputError || error instanceof AiProviderError)) throw error;
    }
    if (duplicateIndexes(candidates).length > 0) {
      warnings.push(
        warning(
          'distinctness',
          'Algunas propuestas son estructuralmente muy parecidas (mismos componentes, comportamientos y disposición) incluso tras pedir una alternativa a la IA.',
        ),
      );
    }
  }

  const lockedNodes = screen
    ? Object.values(screen.nodes).filter((node) => node.locked).length
    : 0;
  if (screen && lockedNodes > 0) {
    warnings.push(
      warning(
        'lockedNodesReplaced',
        `La pantalla «${screen.name}» tiene ${lockedNodes} nodo(s) bloqueado(s); adoptar una propuesta los reemplazaría.`,
      ),
    );
  }

  const proposals = repo.transaction(() =>
    candidates.map((candidate) => {
      const { rationale } = candidate.plan;
      const requirementsKept = [...new Set(rationale.requirementIds)].filter((id) => requirementIds.has(id));
      const referencesKept = [...new Set(rationale.fromReferences)].filter((id) => referenceIds.has(id));
      const dropped = [
        ...rationale.requirementIds.filter((id) => !requirementIds.has(id)),
        ...rationale.fromReferences.filter((id) => !referenceIds.has(id)),
      ];
      const meta = repo.proposals.create(projectId, {
        title: candidate.plan.title,
        summary: candidate.plan.summary,
        rationale: {
          ...rationale,
          requirementIds: requirementsKept,
          fromReferences: referencesKept,
        },
        origin: 'ai',
        document: candidate.document,
      });
      if (dropped.length > 0) {
        warnings.push(
          warning(
            'unknownReferences',
            `«${meta.title}» citaba ids que no existen y se descartaron: ${dropped.join(', ')}.`,
            { proposalId: meta.id },
          ),
        );
      }
      warnings.push(...candidate.warnings.map((w) => ({ ...w, proposalId: meta.id })));
      return meta;
    }),
  );
  return { proposals, warnings };
}
