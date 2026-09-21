// In-memory citation containment only. No retrieval, repair, store or acceptance.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';

const SHA = /^sha256:[0-9a-f]{64}$/u;
const WHITE = /\p{White_Space}/u;
const MIN_QUOTE_CHARACTERS = 8;
const MAX_CHARACTERS = 20000;
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
const text = value => typeof value === 'string' && value.length <= MAX_CHARACTERS && /\P{White_Space}/u.test(value);
const hash = value => 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');
const keys = (value, names) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const validBinding = value => keys(value, ['source_revision_ref', 'source_span_ref', 'locator'])
  && keys(value.source_revision_ref, ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'])
  && exactRefIdentityKey(value.source_revision_ref) !== null && SHA.test(value.source_revision_ref.content_id)
  && text(value.source_span_ref) && text(value.locator);
const normalize = value => value.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').replace(/^ | $/gu, '');
const invalid = () => { throw new TypeError('invalid_citation_input'); };

// Map each NFC code point to the original code points contributing to it. NFD
// queues handle canonical reordering and Hangul composition without case folding
// or compatibility normalization. Graphemes bound normalization interactions.
function normalizedSource(source) {
  const units = [];
  for (const { segment, index } of segmenter.segment(source)) {
    const queues = new Map();
    let offset = index;
    for (const cp of segment) {
      for (const decomposed of cp.normalize('NFD')) {
        if (!queues.has(decomposed)) queues.set(decomposed, { tokens: [], next: 0 });
        queues.get(decomposed).tokens.push({ start: offset, end: offset + cp.length });
      }
      offset += cp.length;
    }
    for (const cp of segment.normalize('NFC')) {
      let start = Infinity, end = 0;
      for (const decomposed of cp.normalize('NFD')) {
        const queue = queues.get(decomposed), token = queue.tokens[queue.next++];
        start = Math.min(start, token.start); end = Math.max(end, token.end);
      }
      if (WHITE.test(cp)) {
        if (units.at(-1)?.cp === ' ') units.at(-1).end = end;
        else units.push({ cp: ' ', start, end });
      } else units.push({ cp, start, end });
    }
  }
  if (units[0]?.cp === ' ') units.shift();
  if (units.at(-1)?.cp === ' ') units.pop();
  const starts = [], ends = [];
  for (const unit of units) {
    for (let i = 0; i < unit.cp.length; i++) { starts.push(unit.start); ends.push(unit.end); }
  }
  return { value: units.map(unit => unit.cp).join(''), starts, ends };
}

// Count overlapping occurrences in the successful stage. The returned half-open
// UTF-16 range always addresses the ORIGINAL supplied source, never a folded copy.
function occurrences(source, quote, mapped = null) {
  const value = mapped?.value ?? source;
  let first = null, count = 0;
  const ranges = new Set();
  for (let at = value.indexOf(quote); at !== -1; at = value.indexOf(quote, at + 1)) {
    let start = at, end = at + quote.length;
    if (mapped) {
      start = Infinity; end = 0;
      for (let i = at; i < at + quote.length; i++) {
        start = Math.min(start, mapped.starts[i]); end = Math.max(end, mapped.ends[i]);
      }
      // A single original code point may expand under canonical normalization.
      // Return the smallest source range covering the matching contributions;
      // never invent a position inside an indivisible original code point.
    }
    const key = start + ':' + end;
    if (ranges.has(key)) continue;
    ranges.add(key); count++;
    if (!first || start < first.start || (start === first.start && end < first.end)) first = { start, end };
  }
  return { start: first?.start ?? null, end: first?.end ?? null, count };
}

/**
 * Caller supplies a fresh authorized snapshot of {binding,text,span_sha256}.
 * binding reuses exact source_revision_ref, source_span_ref and locator.
 * The caller validates full-source bytes and ACL before selecting the span;
 * span_sha256 checks UTF-8 span integrity, not unavailable full-source bytes.
 */
export function createCitationVerifier(options) {
  if (!keys(options, ['approvedSpans']) || !Array.isArray(options.approvedSpans) || options.approvedSpans.length > 100) invalid();
  const spans = structuredClone(options.approvedSpans);
  for (const span of spans) {
    if (!keys(span, ['binding', 'text', 'span_sha256']) || !validBinding(span.binding)
      || !text(span.text) || !SHA.test(span.span_sha256)) invalid();
  }
  return Object.freeze({
    verify(citation) {
      if (!keys(citation, ['binding', 'quote']) || !validBinding(citation.binding) || !text(citation.quote)) invalid();
      const { binding, quote } = structuredClone(citation);
      const finish = (status, reason, span = null, match = { start: null, end: null, count: 0 }) => ({
        status, reason, binding: structuredClone(binding), quote_sha256: hash(quote),
        span_sha256: span?.span_sha256 ?? null,
        normalization: status === 'normalized_match' ? 'unicode_whitespace_nfc_v1' : 'none',
        comparison_scope: 'within_supplied_span', ...match, offset_unit: 'utf16_code_unit',
        end_exclusive: true, semantic_fact_verified: false, knowledge_accepted: false,
      });
      const normalizedQuote = normalize(quote);
      if ([...normalizedQuote].filter(cp => !WHITE.test(cp)).length < MIN_QUOTE_CHARACTERS) {
        return finish('mismatch', 'quote_too_short');
      }
      const candidates = spans.filter(span => isDeepStrictEqual(span.binding, binding));
      if (candidates.length > 1) return finish('mismatch', 'ambiguous_source');
      if (!candidates.length) {
        const revisionConflict = spans.some(span => span.binding.source_span_ref === binding.source_span_ref
          && span.binding.locator === binding.locator
          && span.binding.source_revision_ref.entity_id === binding.source_revision_ref.entity_id);
        return finish(revisionConflict ? 'mismatch' : 'source_missing',
          revisionConflict ? 'source_revision_mismatch' : 'source_not_supplied_or_not_allowed');
      }
      const span = candidates[0];
      if (hash(span.text) !== span.span_sha256) return finish('mismatch', 'span_hash_mismatch', span);
      const exact = occurrences(span.text, quote);
      if (exact.count) return finish('exact_match', 'text_match', span, exact);
      const normalized = occurrences(span.text, normalizedQuote, normalizedSource(span.text));
      return normalized.count ? finish('normalized_match', 'text_match', span, normalized)
        : finish('mismatch', 'text_mismatch', span);
    },
  });
}
