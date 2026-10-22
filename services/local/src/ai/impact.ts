import type { Repository, SourceChange } from '../db';
import type { Requirement } from '../schemas';

export interface SourceImpact {
  change: SourceChange;
  /** Requirements citing the changed source at an older version (all of them if it was deleted). */
  requirements: { id: string; text: string; status: Requirement['status']; referencedVersion: number }[];
  /** Proposals whose rationale cites an affected requirement. */
  proposals: { id: string; title: string; status: string; requirementIds: string[] }[];
  /** Screens of those proposals; `inCurrentDocument` marks screens that exist in the project's document. */
  screens: { screenId: string; name: string; proposalId: string; inCurrentDocument: boolean }[];
}

/**
 * Deterministic change-impact report (§5.5): what a source change may have invalidated.
 * Read-only on purpose; nothing is rebuilt automatically.
 */
export function sourceImpact(repo: Repository, projectId: string, since?: string): SourceImpact[] {
  const changes = repo.sources.listChanges(projectId, since);
  if (changes.length === 0) return [];
  const requirements = repo.requirements.list(projectId);
  const proposals = repo.proposals
    .list(projectId)
    .map((meta) => repo.proposals.get(projectId, meta.id))
    .filter((proposal) => proposal !== undefined);
  const currentScreens = new Set(
    repo.documents.get(projectId)?.document.screens.map((screen) => screen.id),
  );

  return changes.map((change) => {
    const affected = requirements.flatMap((requirement) => {
      const stale = requirement.sourceRefs.filter(
        (ref) =>
          ref.sourceId === change.sourceId &&
          (change.change === 'deleted' || ref.sourceVersion < change.sourceVersion),
      );
      const oldest = Math.min(...stale.map((ref) => ref.sourceVersion));
      return stale.length === 0
        ? []
        : [{ id: requirement.id, text: requirement.text, status: requirement.status, referencedVersion: oldest }];
    });
    const affectedIds = new Set(affected.map((requirement) => requirement.id));
    const linked = proposals.flatMap((proposal) => {
      const requirementIds = proposal.rationale.requirementIds.filter((id) => affectedIds.has(id));
      return requirementIds.length === 0 ? [] : [{ proposal, requirementIds }];
    });
    return {
      change,
      requirements: affected,
      proposals: linked.map(({ proposal, requirementIds }) => ({
        id: proposal.id,
        title: proposal.title,
        status: proposal.status,
        requirementIds,
      })),
      screens: linked.flatMap(({ proposal }) =>
        proposal.document.screens.map((screen) => ({
          screenId: screen.id,
          name: screen.name,
          proposalId: proposal.id,
          inCurrentDocument: currentScreens.has(screen.id),
        })),
      ),
    };
  });
}
