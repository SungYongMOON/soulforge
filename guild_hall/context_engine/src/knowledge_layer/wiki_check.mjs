// K3 content checks are citation text + material accounting only. K2's stricter
// semantic/impact heuristics remain available unchanged for its own callers.
import { createCitationVerifier } from '../guards/citation_verifier.mjs';
import { digest, fail, freeze, hashText, keys, snapshot, token } from './data.mjs';
const text = (s, max) => typeof s === 'string' && s.trim() && s.length <= max;
const impacts = ['decision', 'deadline', 'amount', 'external_commitment'];
export function checkWikiOutput(bundle, proposed) {
  const p = snapshot(proposed);
  if (!keys(p, ['candidates', 'review']) || !Array.isArray(p.candidates) || p.candidates.length > 100
    || !keys(p.review, ['conflicts', 'gaps', 'exceptions']) || Object.values(p.review).some(v => !Array.isArray(v) || v.length > 100)) fail('wiki_generation_shape');
  const ids = new Set();
  const results = p.candidates.map(row => {
    if ((!keys(row, ['statement_id', 'unit_id', 'text', 'quote']) && !keys(row, ['statement_id', 'unit_id', 'text', 'quote', 'impact_kinds', 'claim']))
      || !token(row.statement_id) || ids.has(row.statement_id) || !token(row.unit_id) || !text(row.text, 2000) || !text(row.quote, 20000)) fail('wiki_sentence_invalid');
    ids.add(row.statement_id);
    const unit = bundle.units.find(u => u.unit_id === row.unit_id), span = bundle.spans.find(s => s.unit_id === row.unit_id);
    const citation = unit ? createCitationVerifier({ approvedSpans: [{ binding: span.binding, text: unit.text, span_sha256: span.span_sha256 }] })
      .verify({ binding: span.binding, quote: row.quote }) : { status: 'source_missing', reason: 'source_not_supplied_or_not_allowed' };
    const eligible = ['exact_match', 'normalized_match'].includes(citation.status);
    return { statement_id: row.statement_id, unit_id: row.unit_id, text: row.text, quote: row.quote,
      project_ref: bundle.project_ref, source_digest: bundle.source_digest, evidence_ref: span?.binding ?? null,
      quote_sha256: hashText(row.quote), string_check: citation, meaning_check: 'model_responsibility_unverified',
      acceptance_check: 'not_requested', eligible_for_wiki: eligible, reasons: eligible ? [] : [citation.reason],
      claim_ceiling: 'observed', display_label: '자동 정리본', semantic_fact_verified: false, knowledge_accepted: false };
  });
  const unitIds = new Set(bundle.units.map(u => u.unit_id));
  for (const c of p.review.conflicts) if (!keys(c, ['left', 'right', 'note']) || !ids.has(c.left) || !ids.has(c.right) || c.left === c.right || !text(c.note, 2000)) fail('wiki_review_invalid');
  for (const g of p.review.gaps) if (!keys(g, ['unit_ids', 'note']) || !Array.isArray(g.unit_ids) || !g.unit_ids.length || g.unit_ids.some(id => !unitIds.has(id)) || !text(g.note, 2000)) fail('wiki_review_invalid');
  for (const e of p.review.exceptions) if (!keys(e, ['statement_id', 'impact_kinds', 'reason']) || !ids.has(e.statement_id)
    || !Array.isArray(e.impact_kinds) || !e.impact_kinds.length || e.impact_kinds.some(k => !impacts.includes(k)) || !text(e.reason, 2000)) fail('wiki_review_invalid');
  return freeze({ results, review: p.review, check_digest: digest({ results, review: p.review }) });
}
