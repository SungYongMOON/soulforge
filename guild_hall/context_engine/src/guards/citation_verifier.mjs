// In-memory string evidence only. No retrieval, repair, persistence or acceptance.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual, types } from 'node:util';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { literalCitationMatcher } from '../adapters/citation_matcher.mjs';

export const CITATION_NORMALIZATIONS = Object.freeze(['none', 'ascii_whitespace_v1']);
const SHA = /^sha256:[0-9a-f]{64}$/u;
const MAX_CHARACTERS = 20000;
const text = value => typeof value === 'string' && value.length <= MAX_CHARACTERS && /[^ \t\r\n]/u.test(value);
const hash = value => 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');
const keys = (value, names) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const validBinding = value => keys(value, ['source_revision_ref', 'source_span_ref', 'locator'])
  && exactRefIdentityKey(value.source_revision_ref) !== null && SHA.test(value.source_revision_ref.content_id)
  && text(value.source_span_ref) && text(value.locator);
const normalize = value => value.replace(/[ \t\r\n]+/gu, ' ').replace(/^ | $/gu, '');
const invalid = () => { throw new TypeError('invalid_citation_input'); };

/**
 * Caller supplies a fresh, authorized snapshot of {binding,text,span_sha256}.
 * binding reuses the accepted reader's exact source_revision_ref, source_span_ref
 * and locator. The caller checks full-source bytes and ACL before selecting text;
 * span_sha256 checks UTF-8 span integrity, not the unavailable full-source bytes.
 * No source absent from this snapshot can be loaded by a matcher.
 *
 * matcher: {id, matches({quote,source}): boolean}, synchronous and in-process.
 * Engine-specific types stay inside its adapter. Only comparison strings cross
 * that seam; no refs, grants, paths, pages or engine-owned results cross it.
 */
export function createCitationVerifier({ approvedSpans, normalization = 'none', matcher = literalCitationMatcher } = {}) {
  if (!Array.isArray(approvedSpans) || approvedSpans.length > 100
    || !CITATION_NORMALIZATIONS.includes(normalization)
    || !text(matcher?.id) || typeof matcher.matches !== 'function') invalid();
  const spans = structuredClone(approvedSpans);
  for (const span of spans) {
    if (!keys(span, ['binding', 'text', 'span_sha256']) || !validBinding(span.binding)
      || !text(span.text) || !SHA.test(span.span_sha256)) invalid();
  }
  const engineId = matcher.id;
  const compare = matcher.matches.bind(matcher);
  return Object.freeze({
    verify(citation) {
      if (!keys(citation, ['binding', 'quote']) || !validBinding(citation.binding) || !text(citation.quote)) invalid();
      const { binding, quote } = structuredClone(citation);
      const finish = (status, reason, span = null) => ({
        status, reason, binding: structuredClone(binding), quote_sha256: hash(quote),
        span_sha256: span?.span_sha256 ?? null, normalization, matcher_id: engineId,
        comparison_scope: 'entire_supplied_span', semantic_fact_verified: false, knowledge_accepted: false,
      });
      const candidates = spans.filter(span => isDeepStrictEqual(span.binding, binding));
      if (candidates.length > 1) return finish('mismatch', 'ambiguous_source');
      if (!candidates.length) {
        // Name a wrong edition only within an otherwise identical allowed span.
        const revisionConflict = spans.some(span => span.binding.source_span_ref === binding.source_span_ref
          && span.binding.locator === binding.locator
          && span.binding.source_revision_ref.entity_id === binding.source_revision_ref.entity_id);
        return finish(revisionConflict ? 'mismatch' : 'source_missing',
          revisionConflict ? 'source_revision_mismatch' : 'source_not_supplied_or_not_allowed');
      }
      const span = candidates[0];
      if (hash(span.text) !== span.span_sha256) return finish('mismatch', 'span_hash_mismatch', span);
      const exact = quote === span.text;
      const pair = Object.freeze({
        quote: exact || normalization === 'none' ? quote : normalize(quote),
        source: exact || normalization === 'none' ? span.text : normalize(span.text),
      });
      try {
        const matched = compare(pair);
        // Async adapters are unsupported; consume rejection to avoid a process-
        // level unhandled rejection after returning the closed failure result.
        if (types.isPromise(matched)) matched.catch(() => {});
        // A replacement backend cannot introduce fuzzy/case/number normalization.
        if (typeof matched !== 'boolean' || matched !== (pair.quote === pair.source)) {
          return finish('mismatch', 'matcher_contract_violation', span);
        }
        return finish(matched ? (exact ? 'exact_match' : 'normalized_match') : 'mismatch',
          matched ? 'text_match' : 'text_mismatch', span);
      } catch {
        // Engine messages may contain source text; never return them.
        return finish('mismatch', 'matcher_failed', span);
      }
    },
  });
}
