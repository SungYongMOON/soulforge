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
