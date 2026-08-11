// PC-04 source authority, applicability, and ACL scope.
//
// Rank expresses precedence, not magnitude. It is never averaged, summed, or weighted:
// "guidance plus a template" does not add up to a contract baseline. And a high tier only
// wins where it actually applies, so applicability is resolved before precedence.

import { ContractError } from './errors.mjs';

// Preserved verbatim from the accepted eight tier order. The machine key is the canonical
// form; the surface label is for humans and changing it does not change precedence.
export const AUTHORITY_FAMILIES = Object.freeze([
  { rank: 1, key: 'project_contract_baseline', label: '프로젝트 계약·RFP·SOW·CDRL·승인 요구사항·기준선' },
  { rank: 2, key: 'applicable_law_and_regulation', label: '적용 시점의 현행 법령·훈령·규정' },
  { rank: 3, key: 'company_approved_procedure', label: '회사가 승인한 개발·품질 절차' },
  { rank: 4, key: 'acquisition_authority_manual', label: '방사청 공식 매뉴얼·가이드' },
  { rank: 5, key: 'general_se_guidance', label: 'ISO·INCOSE·NASA 일반 guidance' },
  { rank: 6, key: 'case_and_template', label: '사례·템플릿' },
  { rank: 7, key: 'reviewed_wiki', label: 'Reviewed Wiki' },
  { rank: 8, key: 'llm_proposal', label: 'LLM proposal' },
]);

const RANK = new Map(AUTHORITY_FAMILIES.map((f) => [f.key, f.rank]));

export const CODES = Object.freeze({
  NO_CANDIDATES: 'AUTHORITY_NO_CANDIDATES',
  CANDIDATE_NOT_OBJECT: 'AUTHORITY_CANDIDATE_NOT_OBJECT',
  UNREGISTERED_FAMILY: 'AUTHORITY_UNREGISTERED_FAMILY',
  APPLICABILITY_INVALID: 'AUTHORITY_APPLICABILITY_INVALID',
  RANK_ARITHMETIC: 'AUTHORITY_RANK_ARITHMETIC',
  CONFLICT_NEEDS_TWO_SIDES: 'AUTHORITY_CONFLICT_NEEDS_TWO_SIDES',
  CONFLICT_CLAIM_INCOMPLETE: 'AUTHORITY_CONFLICT_CLAIM_INCOMPLETE',
  CONFLICT_SIDE_DROPPED: 'AUTHORITY_CONFLICT_SIDE_DROPPED',
});

export const APPLICABILITY = Object.freeze({ YES: true, NO: false, UNKNOWN: 'unknown' });

// PC-04.2: applicability is not a single flag. All five must resolve before a source can
// be said to apply, and any unresolved component makes the whole thing unknown.
export const APPLICABILITY_COMPONENTS = Object.freeze([
  'project_binding', 'jurisdiction', 'time_window', 'document_revision', 'approval_scope',
]);

export function resolveApplicability(components) {
  if (components === null || typeof components !== 'object') return APPLICABILITY.UNKNOWN;
  let allYes = true;
  for (const name of APPLICABILITY_COMPONENTS) {
    const v = components[name];
    if (v === APPLICABILITY.UNKNOWN || v === undefined) return APPLICABILITY.UNKNOWN;
    if (v !== true) allYes = false;
  }
  return allYes ? APPLICABILITY.YES : APPLICABILITY.NO;
}

/**
 * Selects the governing source among candidates.
 *
 * An unregistered family has no rank, so any comparison against it is meaningless and
 * could hand it the win by accident. It is rejected before precedence is considered.
 *
 * A higher tier that does not apply neither wins nor disappears: the relationship is
 * recorded as a conflict so it can be reviewed rather than silently dropped.
 */
export function resolveAuthority(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new ContractError(CODES.NO_CANDIDATES, 'no candidates supplied');
  }
  for (const c of candidates) {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) {
      throw new ContractError(CODES.CANDIDATE_NOT_OBJECT, 'candidate is not an object');
    }
    if (!RANK.has(c.key)) {
      throw new ContractError(CODES.UNREGISTERED_FAMILY, `unregistered authority family "${c.key}"`, { key: c.key });
    }
    if (!(c.applicable === true || c.applicable === false || c.applicable === APPLICABILITY.UNKNOWN)) {
      throw new ContractError(CODES.APPLICABILITY_INVALID, 'applicable must be true, false, or "unknown"', { key: c.key });
    }
  }

  if (candidates.some((c) => c.applicable === APPLICABILITY.UNKNOWN)) {
    return { winner: 'unknown', conflict: true, reason: 'at least one candidate has unresolved applicability' };
  }

  const applicable = candidates.filter((c) => c.applicable === true);
  if (applicable.length === 0) {
    return { winner: 'unknown', conflict: true, reason: 'no applicable candidate' };
  }

  const winner = applicable.reduce((a, b) => (RANK.get(a.key) <= RANK.get(b.key) ? a : b));
  const outrankedButInapplicable = candidates
    .filter((c) => c.applicable !== true && RANK.get(c.key) < RANK.get(winner.key))
    .map((c) => c.key);

  return {
    winner: winner.key,
    conflict: outrankedButInapplicable.length > 0,
    reason: outrankedButInapplicable.length
      ? 'a higher tier source exists but does not apply here'
      : 'highest applicable tier',
    outranked_but_inapplicable: outrankedButInapplicable,
  };
}

export const REQUIRED_SOURCE_CLAIM_FIELDS = Object.freeze([
  'claim_id', 'authority_family', 'source_revision_ref', 'lineage_ref',
  'applicability', 'asserted_value', 'valid_at', 'known_at',
]);

/**
 * Records a disagreement between two or more applicable sources.
 *
 * The precedence question and the record question are different, and answering only the
 * first is the failure this exists to stop. Precedence says which claim governs. The record
 * says what every side actually asserted, on which source revision, through which lineage —
 * so that a later reader can see the disagreement rather than a tidy single answer that
 * happens to be the higher tier's.
 *
 * Both are returned together, and every supplied claim comes back retained. A conflict
 * record that lost a side would be indistinguishable from there never having been one.
 */
export function recordSourceConflict(claims) {
  if (!Array.isArray(claims) || claims.length < 2) {
    throw new ContractError(CODES.CONFLICT_NEEDS_TWO_SIDES,
      'a conflict is between at least two source claims; one side alone is not a conflict record',
      { given: Array.isArray(claims) ? claims.length : 0 });
  }
  for (const claim of claims) {
    if (claim === null || typeof claim !== 'object' || Array.isArray(claim)) {
      throw new ContractError(CODES.CONFLICT_CLAIM_INCOMPLETE, 'a source claim is not an object');
    }
    for (const f of REQUIRED_SOURCE_CLAIM_FIELDS) {
      if (!Object.hasOwn(claim, f)) {
        throw new ContractError(CODES.CONFLICT_CLAIM_INCOMPLETE,
          `source claim field "${f}" is missing; an unattributable side cannot be preserved`,
          { field: f, claim_id: claim.claim_id ?? null });
      }
    }
    if (!RANK.has(claim.authority_family)) {
      throw new ContractError(CODES.UNREGISTERED_FAMILY,
        `unregistered authority family "${claim.authority_family}"`, { claim_id: claim.claim_id });
    }
  }

  const verdict = resolveAuthority(claims.map((c) => ({ key: c.authority_family, applicable: c.applicability })));

  // Ordered by precedence, then by claim id, so the record is stable without the order
  // implying that the lower rows were discarded.
  const retained = [...claims].sort((a, b) => (RANK.get(a.authority_family) - RANK.get(b.authority_family))
    || (a.claim_id < b.claim_id ? -1 : a.claim_id > b.claim_id ? 1 : 0));

  if (retained.length !== claims.length) {
    throw new ContractError(CODES.CONFLICT_SIDE_DROPPED, 'a side was lost while building the conflict record');
  }

  return {
    conflict: true,
    claim_count: claims.length,
    // Every side, verbatim. This is the half that authority resolution alone throws away.
    retained_claims: retained,
    retained_claim_ids: retained.map((c) => c.claim_id),
    retained_authority_families: retained.map((c) => c.authority_family),
    governing_authority_family: verdict.winner,
    outranked_but_inapplicable: verdict.outranked_but_inapplicable ?? [],
    resolution_reason: verdict.reason,
    // The record does not resolve the disagreement away. A human reading it can see both
    // the winner and what the other side said.
    sides_dropped: 0,
  };
}

/** Guard for the one thing rank must never be used for. */
export function forbidRankArithmetic(operation) {
  throw new ContractError(CODES.RANK_ARITHMETIC,
    `authority rank is a precedence relation, not a score; "${operation}" is not defined on it`);
}

// ---------------------------------------------------------------- ACL scope (PC-04.3)

export const SCOPE = Object.freeze({ COMMON: 'common', ORGANIZATION: 'organization', PROJECT: 'project' });

/**
 * Search is limited to common applicable material plus exactly one selected project.
 * Cross-project reach is refused rather than filtered afterwards, because a filter that
 * runs after retrieval has already let the other project's material into the process.
 */
export function assertSearchScope({ scope, projectRef, selectedProjectRef }) {
  if (scope === SCOPE.COMMON || scope === SCOPE.ORGANIZATION) return true;
  if (scope !== SCOPE.PROJECT) return false;
  if (!projectRef || !selectedProjectRef) return false;
  return projectRef === selectedProjectRef;
}
