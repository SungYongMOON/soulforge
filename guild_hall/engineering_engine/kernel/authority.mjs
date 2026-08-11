// PC-04 source authority, applicability, and ACL scope.
//
// Rank expresses precedence, not magnitude. It is never averaged, summed, or weighted:
// "guidance plus a template" does not add up to a contract baseline. And a high tier only
// wins where it actually applies, so applicability is resolved before precedence.

import { inspectInstant, compareCodePoints } from './canonical.mjs';
import { classifyRef, RESOLUTION } from './identity.mjs';
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
  CONFLICT_NOT_A_DISAGREEMENT: 'AUTHORITY_CONFLICT_NOT_A_DISAGREEMENT',
  CONFLICT_SOURCE_NOT_DISTINCT: 'AUTHORITY_CONFLICT_SOURCE_NOT_DISTINCT',
  TWO_SOURCE_INVARIANT_VIOLATED: 'AUTHORITY_TWO_SOURCE_INVARIANT_VIOLATED',
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
 * The comparison form of a claim value.
 *
 * Two sides "disagree" only if what they assert is actually different. Without a declared
 * normal form, a trailing space or a capital letter would make one statement look like two,
 * and a conflict record could then be manufactured from a source quoted twice. Deliberately
 * shallow: it folds whitespace and case, and nothing else. Anything cleverer would start
 * deciding that two differently worded requirements mean the same thing, which is a judgement
 * no deterministic kernel is entitled to make.
 */
export function normaliseClaimValue(value) {
  if (typeof value !== 'string') return JSON.stringify(value ?? null);
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

/**
 * The revision a claim cites, or null when it does not cite one exactly.
 *
 * A bare string used to be accepted here and read as a revision id. It is not one: a string
 * names nothing checkable, carries no content id, and cannot be resolved back to the bytes the
 * side actually rested on — so a conflict record built from two strings looked complete while
 * neither side could be re-derived. Two sides "citing different revisions" then meant no more
 * than two different pieces of text. Only a fully formed exact revision ref counts.
 */
const claimRevisionId = (claim) => {
  const ref = claim?.source_revision_ref;
  return classifyRef(ref, { bytesAvailable: true }) === RESOLUTION.RESOLVABLE ? ref.revision_id : null;
};

/**
 * The time semantics both sides of a conflict have to satisfy.
 *
 * Returns the failing field, or null. `known_at` before `valid_at` is the one worth naming: it
 * says the record was known before the fact it asserts was even dated, which is the same
 * refusal the graph applies to an edge. A side with incoherent times cannot be placed in the
 * window a precedence question is asked about.
 */
const claimTimeFault = (claim) => {
  for (const t of ['valid_at', 'known_at']) {
    if (!inspectInstant(claim?.[t]).valid) return t;
  }
  return compareCodePoints(claim.known_at, claim.valid_at) < 0 ? 'known_at_precedes_valid_at' : null;
};

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
    if (claimRevisionId(claim) === null) {
      throw new ContractError(CODES.CONFLICT_CLAIM_INCOMPLETE,
        'a source claim must cite an exact typed source revision ref; a name, a string or a partial ref cannot be traced back to the bytes the side rested on',
        { claim_id: claim.claim_id });
    }
    if (typeof claim.lineage_ref !== 'string' || !claim.lineage_ref) {
      throw new ContractError(CODES.CONFLICT_CLAIM_INCOMPLETE,
        'a source claim must carry its lineage ref, or the preserved side cannot be re-derived',
        { claim_id: claim.claim_id });
    }
    const timeFault = claimTimeFault(claim);
    if (timeFault !== null) {
      throw new ContractError(CODES.CONFLICT_CLAIM_INCOMPLETE,
        'a source claim must be dated coherently, or it cannot be placed in the window the precedence question is asked about',
        { claim_id: claim.claim_id, time_fault: timeFault });
    }
  }

  // Distinct sides, or it is not a conflict. Two of these were reachable before and both
  // produce the same false record: a disagreement that never happened.
  const claimIds = claims.map((c) => c.claim_id);
  if (new Set(claimIds).size !== claimIds.length) {
    throw new ContractError(CODES.CONFLICT_SOURCE_NOT_DISTINCT,
      'the same claim id appears on more than one side; one claim counted twice is not a conflict');
  }
  const revisions = claims.map(claimRevisionId);
  if (new Set(revisions).size !== revisions.length) {
    throw new ContractError(CODES.CONFLICT_SOURCE_NOT_DISTINCT,
      'two sides cite the same source revision; a source cannot disagree with itself');
  }
  if (new Set(claims.map((c) => normaliseClaimValue(c.asserted_value))).size < 2) {
    throw new ContractError(CODES.CONFLICT_NOT_A_DISAGREEMENT,
      'every side asserts the same value, so there is no disagreement to record');
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

/**
 * The exact two-source authority invariant.
 *
 * `recordSourceConflict` answers "is this a conflict record at all". This answers a narrower
 * and stricter question: is this *the* two-source disagreement the frozen O4 case specifies —
 * a project contract baseline against a reviewed wiki, both applicable, on two different
 * source revisions, actually saying different things, with the baseline governing and the
 * losing side still in the record.
 *
 * It exists because "a conflict was recorded" is far weaker than what O4 requires, and every
 * gap between the two is a way to pass the oracle without holding the property. A single
 * source quoted twice, two wiki claims, a pair on one revision, a pair that agrees, an
 * unresolved applicability, the losing side quietly absent: each of those still produces a
 * record with `conflict: true`, and none of them is a two-source authority disagreement. The
 * checks are named individually so a failure says which property is missing rather than
 * inviting a caller to reshape the input until something passes.
 *
 * `HOLD` rather than a silent pass is the intended reading of every rejection here: the pair
 * is not the invariant, so nothing may be concluded from it about precedence.
 */
export const TWO_SOURCE_AUTHORITY_INVARIANT = Object.freeze({
  claim_count: 2,
  governing_family: 'project_contract_baseline',
  contesting_family: 'reviewed_wiki',
});

export function assertTwoSourceAuthorityInvariant(record) {
  const failed = [];
  const detail = {};

  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new ContractError(CODES.TWO_SOURCE_INVARIANT_VIOLATED,
      'the two-source invariant needs a conflict record to judge', { failed_checks: ['record_present'] });
  }
  const claims = Array.isArray(record.retained_claims) ? record.retained_claims : [];

  if (record.conflict !== true) failed.push('record_states_a_conflict');
  if (record.sides_dropped !== 0) failed.push('no_side_dropped');
  // Exactly two. Not "at least two": a third claim changes which pair governs, so a record
  // holding one is a different question wearing this one's answer.
  if (record.claim_count !== TWO_SOURCE_AUTHORITY_INVARIANT.claim_count
      || claims.length !== TWO_SOURCE_AUTHORITY_INVARIANT.claim_count) {
    failed.push('exactly_two_claims');
    detail.claim_count = claims.length;
  }

  if (claims.length === TWO_SOURCE_AUTHORITY_INVARIANT.claim_count) {
    const [a, b] = claims;
    if (a.claim_id === b.claim_id || !a.claim_id || !b.claim_id) failed.push('two_distinct_claim_ids');

    // The exact pair of families, as a set. This one rejection covers the one-source
    // substitution, the two-reviewed_wiki pair, the equal-authority pair and every other pair.
    const families = [a.authority_family, b.authority_family];
    const wanted = [TWO_SOURCE_AUTHORITY_INVARIANT.governing_family, TWO_SOURCE_AUTHORITY_INVARIANT.contesting_family];
    // This is also what keeps the losing side present: a record from which the reviewed_wiki
    // claim has been removed no longer holds the required pair, so "the loser was dropped" and
    // "this is not the pair" are one refusal rather than two that could disagree.
    if ([...families].sort().join('|') !== [...wanted].sort().join('|')) {
      failed.push('exactly_one_project_contract_baseline_and_one_reviewed_wiki');
      detail.authority_families = families;
    }
    if (families[0] === families[1]) failed.push('the_two_authorities_are_not_equal');

    // Exact typed refs on both sides, checked before distinctness. A hand-built record can
    // carry bare strings that never went through `recordSourceConflict`, and two strings that
    // differ are not two revisions that differ: nothing about them can be resolved, so the
    // pair proves nothing about which source actually governs.
    const exactRefs = [a, b].map((c) => claimRevisionId(c) !== null);
    if (exactRefs.some((ok) => !ok)) {
      failed.push('exact_typed_source_revision_refs');
      detail.sides_without_an_exact_ref = exactRefs.filter((ok) => !ok).length;
    }

    const revisions = [claimRevisionId(a), claimRevisionId(b)];
    if (revisions.some((r) => r === null) || revisions[0] === revisions[1]) failed.push('two_distinct_source_revisions');

    // Coherent times on both sides, for the same reason. A pair whose dates do not resolve
    // cannot be said to disagree *at a time*, and precedence is only ever asked at one.
    const timeFaults = [a, b].map((c) => claimTimeFault(c)).filter((f) => f !== null);
    if (timeFaults.length) {
      failed.push('both_sides_dated_coherently');
      detail.time_faults = timeFaults;
    }

    if ([a, b].some((c) => typeof c.lineage_ref !== 'string' || !c.lineage_ref)) failed.push('lineage_preserved_for_both');

    // An actual disagreement, in the declared normal form. Two sources that say the same
    // thing are corroboration, and reporting corroboration as a conflict is its own error.
    if (normaliseClaimValue(a.asserted_value) === normaliseClaimValue(b.asserted_value)) {
      failed.push('the_two_claims_actually_disagree');
    }

    // Known and applicable, both sides. "unknown" is not a weaker yes; a pair whose
    // applicability is unresolved cannot establish which authority governs at all.
    for (const c of [a, b]) {
      if (c.applicability !== true) {
        failed.push('both_authorities_known_and_applicable');
        detail.unresolved_applicability_claim_id = c.claim_id ?? null;
        break;
      }
    }
  }

  if (record.governing_authority_family !== TWO_SOURCE_AUTHORITY_INVARIANT.governing_family) {
    failed.push('project_contract_baseline_governs');
    detail.governing_authority_family = record.governing_authority_family ?? null;
  }

  if (failed.length) {
    throw new ContractError(CODES.TWO_SOURCE_INVARIANT_VIOLATED,
      'this is not the exact two-source authority disagreement the invariant requires, so nothing may be concluded from it',
      { failed_checks: failed, ...detail });
  }
  return {
    invariant: 'exact_two_source_authority_disagreement',
    holds: true,
    governing_authority_family: TWO_SOURCE_AUTHORITY_INVARIANT.governing_family,
    contesting_authority_family: TWO_SOURCE_AUTHORITY_INVARIANT.contesting_family,
    retained_claim_ids: claims.map((c) => c.claim_id).sort(),
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
