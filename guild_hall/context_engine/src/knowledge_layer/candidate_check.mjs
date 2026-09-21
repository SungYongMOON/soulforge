import { createCitationVerifier } from '../guards/citation_verifier.mjs';
import { validateLinkedBundle } from './span_link.mjs';
import { digest, fail, freeze, hashText, keys, snapshot, token } from './data.mjs';
export const IMPACT_KINDS = Object.freeze(['decision', 'deadline', 'amount', 'external_commitment']);
const normalize = s => s.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
const bounded = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const rules = Object.freeze({
  decision: /결정|승인|확정|approve|decid/iu,
  deadline: /마감|납기|기한|일정|deadline|due|[0-9]{4}-[0-9]{2}-[0-9]{2}/iu,
  amount: /금액|대금|예산|비용|금전|USD|KRW|원(?:이다|으로|을|은|에|\s|$)|[$€₩]/iu,
  external_commitment: /대외|고객|계약|약속|납품|출하|commitment|promise|contract/iu,
});
// These flags identify review candidates. They never create a deadline, decision,
// identity, payment or promise. False positives are deliberately visible.
function impacts(row) {
  const value = row.text + '\n' + row.quote;
  return [...new Set([...row.impact_kinds, ...IMPACT_KINDS.filter(k => rules[k].test(value))])].sort();
}
export function checkKnowledgeCandidates(input) {
  const request = snapshot(input);
  if (!keys(request, ['bundle', 'candidates', 'now'])) fail('candidate_request_invalid');
  const { bundle, candidates, now } = request;
  const linked = validateLinkedBundle(bundle, now), safe = snapshot(candidates);
  if (!Array.isArray(safe) || safe.length > 100) fail('candidate_batch_invalid');
  const ids = new Set(), results = [];
  for (const row of safe) {
    if (!keys(row, ['statement_id', 'unit_id', 'text', 'quote', 'impact_kinds', 'claim'])
      || !token(row.statement_id) || ids.has(row.statement_id) || !token(row.unit_id)
      || !bounded(row.text, 2000) || !bounded(row.quote, 20000)
      || !Array.isArray(row.impact_kinds) || row.impact_kinds.length > 4 || row.impact_kinds.some(k => !IMPACT_KINDS.includes(k))
      || (row.claim !== null && (!keys(row.claim, ['subject', 'key', 'value'])
        || !bounded(row.claim.subject, 200) || !bounded(row.claim.key, 200) || !bounded(row.claim.value, 500)))) fail('candidate_invalid');
    ids.add(row.statement_id);
    const source = linked.units.find(u => u.unit_id === row.unit_id), span = linked.spans.find(s => s.unit_id === row.unit_id);
    const citation = source ? createCitationVerifier({ approvedSpans: [{ binding: span.binding, text: source.text, span_sha256: span.span_sha256 }] })
      .verify({ binding: span.binding, quote: row.quote }) : { status: 'source_missing', reason: 'source_not_supplied_or_not_allowed', start: null, end: null, count: 0 };
    const stringMatch = ['exact_match', 'normalized_match'].includes(citation.status);
    // A copied source sentence is evidence of what the source said, not proof
    // that its statement is true. Paraphrases require a separate semantic check.
    const verbatim = normalize(row.text) === normalize(row.quote);
    const eligible = stringMatch && verbatim;
    const impactKinds = impacts(row);
    // Structured subject/key/value is model-proposed lint input only. No semantic
    // entailment is inferred from a quote, nor are those fields emitted as facts.
    const weak = !eligible || row.claim !== null;
    const result = { ...row, project_ref: linked.project_ref, source_digest: linked.source_digest,
      evidence_ref: span?.binding ?? null, quote_sha256: hashText(row.quote), string_check: citation,
      meaning_check: verbatim && stringMatch ? 'source_attribution_only' : 'unverified',
      structured_claim_check: row.claim === null ? 'not_provided' : 'unverified_lint_candidate',
      acceptance_check: 'not_requested', eligible_for_wiki: eligible,
      evidence_strength: weak ? 'weak' : 'source_attributed', impact_kinds: impactKinds,
      exception_required: weak && impactKinds.length > 0,
      exception_reasons: weak && impactKinds.length ? impactKinds.map(k => 'weak_evidence:' + k) : [],
      reasons: [...(!stringMatch ? [citation.reason] : []), ...(!verbatim ? ['meaning_unverified'] : [])],
      claim_ceiling: 'observed', display_label: '자동 정리본', semantic_fact_verified: false, knowledge_accepted: false };
    results.push(result);
  }
  const body = { project_ref: linked.project_ref, source_digest: linked.source_digest, results,
    counts: { supplied: safe.length, eligible: results.filter(r => r.eligible_for_wiki).length,
      rejected: results.filter(r => !r.eligible_for_wiki).length, exceptions: results.filter(r => r.exception_required).length } };
  return freeze({ ...body, check_digest: digest(body) });
}
