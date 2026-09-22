// K3 permits paraphrases. The K2-compatible impact floor only raises review
// candidates; it does not reject text or verify meaning. K2 remains unchanged.
import { createCitationVerifier } from '../guards/citation_verifier.mjs';
import { digest, fail, freeze, hashText, keys, snapshot, token } from './data.mjs';
const text = (s, max) => typeof s === 'string' && s.trim() && s.length <= max;
const impacts = ['decision', 'deadline', 'amount', 'external_commitment'];
// A candidate row's REQUIRED fields are always statement_id/unit_id/text/quote.
// impact_kinds and claim are each independently optional (a model naturally omits
// whichever one it has nothing to say about) -- so all four shapes (base, +impact_
// kinds only, +claim only, +both) are accepted. Additive: no previously-accepted
// shape is rejected.
const CANDIDATE_BASE_FIELDS = ['statement_id', 'unit_id', 'text', 'quote'];
const CANDIDATE_OPTIONAL_FIELDS = ['impact_kinds', 'claim', 'topic'];
const candidateShapeOk = row => row !== null && typeof row === 'object' && !Array.isArray(row)
  && CANDIDATE_BASE_FIELDS.every(k => Object.hasOwn(row, k))
  && Object.keys(row).every(k => CANDIDATE_BASE_FIELDS.includes(k) || CANDIDATE_OPTIONAL_FIELDS.includes(k));
// Kept identical to K2's fixed KO/EN markers; parity is regression-tested.
const rules = {
  decision: /결정|승인|확정|approve|decid/iu,
  deadline: /마감|납기|기한|일정|deadline|due|[0-9]{4}-[0-9]{2}-[0-9]{2}/iu,
  amount: /금액|대금|예산|비용|금전|USD|KRW|원(?:이다|으로|을|은|에|\s|$)|[$€₩]/iu,
  external_commitment: /대외|고객|계약|약속|납품|출하|commitment|promise|contract/iu,
};
export function checkWikiOutput(bundle, proposed) {
  const p = snapshot(proposed);
  if (!keys(p, ['candidates', 'review']) || !Array.isArray(p.candidates) || p.candidates.length > 100
    || !keys(p.review, ['conflicts', 'gaps', 'exceptions']) || Object.values(p.review).some(v => !Array.isArray(v) || v.length > 100)) fail('wiki_generation_shape');
  const ids = new Set();
  const results = p.candidates.map(row => {
    if (!candidateShapeOk(row)
      || !token(row.statement_id) || ids.has(row.statement_id) || !token(row.unit_id) || !text(row.text, 2000) || !text(row.quote, 20000)) fail('wiki_sentence_invalid');
    ids.add(row.statement_id);
    const unit = bundle.units.find(u => u.unit_id === row.unit_id), span = bundle.spans.find(s => s.unit_id === row.unit_id);
    const citation = unit ? createCitationVerifier({ approvedSpans: [{ binding: span.binding, text: unit.text, span_sha256: span.span_sha256 }] })
      .verify({ binding: span.binding, quote: row.quote }) : { status: 'source_missing', reason: 'source_not_supplied_or_not_allowed' };
    const eligible = ['exact_match', 'normalized_match'].includes(citation.status);
    const topic = row.topic ?? null;
    if (topic !== null && (!text(topic, 100) || topic !== topic.trim() || topic !== topic.normalize('NFC') || /[\r\n\p{Cc}\p{Cf}]/u.test(topic))) fail('wiki_topic_invalid');
    const impactKinds = impacts.filter(k => rules[k].test(row.text + '\n' + row.quote)
      || (Array.isArray(row.impact_kinds) && row.impact_kinds.includes(k))).sort();
    const weak = !eligible || row.claim != null;
    return { statement_id: row.statement_id, unit_id: row.unit_id, text: row.text, quote: row.quote,
      topic,
      project_ref: bundle.project_ref, source_digest: bundle.source_digest, evidence_ref: span?.binding ?? null,
      quote_sha256: hashText(row.quote), string_check: citation, meaning_check: 'model_responsibility_unverified',
      acceptance_check: 'not_requested', eligible_for_wiki: eligible, reasons: eligible ? [] : [citation.reason],
      evidence_strength: weak ? 'weak' : 'source_attributed', impact_kinds: impactKinds,
      exception_required: weak && impactKinds.length > 0,
      exception_reasons: weak ? impactKinds.map(k => 'weak_evidence:' + k) : [],
      claim_ceiling: 'observed', display_label: '자동 정리본', semantic_fact_verified: false, knowledge_accepted: false };
  });
  const unitIds = new Set(bundle.units.map(u => u.unit_id));
  for (const c of p.review.conflicts) if (!keys(c, ['left', 'right', 'note']) || !ids.has(c.left) || !ids.has(c.right) || c.left === c.right || !text(c.note, 2000)) fail('wiki_review_invalid');
  for (const g of p.review.gaps) if (!keys(g, ['unit_ids', 'note']) || !Array.isArray(g.unit_ids) || !g.unit_ids.length || g.unit_ids.some(id => !unitIds.has(id)) || !text(g.note, 2000)) fail('wiki_review_invalid');
  for (const e of p.review.exceptions) if (!keys(e, ['statement_id', 'impact_kinds', 'reason']) || !ids.has(e.statement_id)
    || !Array.isArray(e.impact_kinds) || !e.impact_kinds.length || e.impact_kinds.some(k => !impacts.includes(k)) || !text(e.reason, 2000)) fail('wiki_review_invalid');
  // Union model reports and deterministic floor by statement, preserving both reasons.
  for (const row of results) {
    const reported = p.review.exceptions.filter(e => e.statement_id === row.statement_id);
    row.exception_origins = [...(reported.length ? ['model_proposal'] : []), ...(row.exception_required ? ['deterministic_projection'] : [])];
    row.impact_kinds = [...new Set([...row.impact_kinds, ...reported.flatMap(e => e.impact_kinds)])].sort();
    row.exception_required ||= reported.length > 0;
    row.exception_reasons = [...new Set([...row.exception_reasons, ...reported.map(e => e.reason)])];
  }
  return freeze({ results, review: p.review, check_digest: digest({ results, review: p.review }) });
}
