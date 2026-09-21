import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCitationVerifier } from '../src/app.mjs';

// Public synthetic strings only: no source store, account, model or file IO.
const hash = text => 'sha256:' + createHash('sha256').update(text).digest('hex');
function fixture(source = 'The limit is 10 mA. Do not enable output.', quote = source) {
  const binding = {
    source_revision_ref: { entity_id: 'source:synthetic', revision_id: 'revision:1',
      content_id: hash('Synthetic heading\n\n' + source), content_hash_alg: 'sha256' },
    source_span_ref: 'span:synthetic-1', locator: 'paragraph:2',
  };
  return { binding, span: { binding, text: source, span_sha256: hash(source) }, citation: { binding, quote } };
}
const verify = f => createCitationVerifier({ approvedSpans: [f.span] }).verify(f.citation);
function checkMatch(f, status, start, end, count) {
  const before = structuredClone(f), result = verify(f);
  assert.equal(result.status, status);
  assert.deepEqual([result.start, result.end, result.count], [start, end, count]);
  assert.equal(result.offset_unit, 'utf16_code_unit');
  assert.equal(result.end_exclusive, true);
  assert.deepEqual(result.binding, f.binding);
  assert.equal(result.span_sha256, hash(f.span.text));
  assert.equal(result.quote_sha256, hash(f.citation.quote));
  assert.equal(result.semantic_fact_verified, false);
  assert.equal(result.knowledge_accepted, false);
  assert.equal(result.comparison_scope, 'within_supplied_span');
  assert.equal(Object.hasOwn(result, 'quote'), false);
  assert.equal(Object.hasOwn(result, 'text'), false);
  assert.deepEqual(f, before);
  return result;
}

test('literal containment returns the original range, refs and hashes without source text', () => {
  const f = fixture('Header. The limit is 10 mA. Footer.', 'The limit is 10 mA.');
  const result = checkMatch(f, 'exact_match', 8, 27, 1);
  result.binding.locator = 'changed';
  assert.equal(f.binding.locator, 'paragraph:2');
  assert.equal(result.normalization, 'none');
});

test('literal stage wins and counts only literal occurrences', () => {
  const f = fixture('limit is 10 mA / limit\tis 10 mA / limit is 10 mA', 'limit is 10 mA');
  checkMatch(f, 'exact_match', 0, f.citation.quote.length, 2);
});

test('overlapping occurrences count independently and return the first range', () => {
  checkMatch(fixture('aaaaaaaaaa', 'aaaaaaaa'), 'exact_match', 0, 8, 3);
});

test('ASCII whitespace fallback returns original positions and repeat count', () => {
  const first = 'The\tlimit\r\nis 10 mA.', second = 'The  limit\nis 10 mA.';
  const f = fixture('::' + first + '::' + second, 'The limit is 10 mA.');
  const result = checkMatch(f, 'normalized_match', 2, 2 + first.length, 2);
  assert.equal(result.normalization, 'unicode_whitespace_nfc_v1');
});

for (const separator of ['\u00a0', '\u0085', '\u2003', '\u2028', '\u2029', '\u202f', '\u3000']) {
  test('Unicode White_Space U+' + separator.codePointAt(0).toString(16) + ' maps to original range', () => {
    const inner = 'The' + separator.repeat(2) + 'limit is 10 mA.';
    checkMatch(fixture('::' + inner + '::', 'The limit is 10 mA.'), 'normalized_match', 2, 2 + inner.length, 1);
  });
}

test('NFC composes decomposed accents and maps positions after supplementary characters', () => {
  const inner = 'Cafe\u0301 limit is 10 mA.';
  const prefix = '😀🧪 ';
  checkMatch(fixture(prefix + inner + ' end', 'Café limit is 10 mA.'), 'normalized_match', prefix.length, prefix.length + inner.length, 1);
});

test('NFC handles decomposed Korean source and decomposed quote in both directions', () => {
  const quote = '출력 전류는 변경하지 않는다.';
  const decomposed = quote.normalize('NFD');
  checkMatch(fixture('앞 ' + decomposed + ' 뒤', quote), 'normalized_match', 2, 2 + decomposed.length, 1);
  checkMatch(fixture('앞 ' + quote + ' 뒤', decomposed), 'normalized_match', 2, 2 + quote.length, 1);
});

test('NFC canonical reordering retains the exact original source slice', () => {
  const inner = 'Synthetic a\u0315\u0300 limit';
  const quote = inner.normalize('NFC');
  checkMatch(fixture('::' + inner + '::', quote), 'normalized_match', 2, 2 + inner.length, 1);
});

test('combined NFC and whitespace normalization reports repeated original positions', () => {
  const inner = 'Cafe\u0301\u3000\u00a0limit\r\nis 10 mA.';
  const f = fixture('::' + inner + '::' + inner, '  Café limit is 10 mA.\u3000');
  checkMatch(f, 'normalized_match', 2, 2 + inner.length, 2);
});

test('different combining marks do not match when the NFC source lacks the quote', () => {
  const f = fixture('abcdefgha\u0301\u0323', 'abcdefghá');
  const result = verify(f);
  assert.equal(result.status, 'mismatch');
  assert.deepEqual([result.start, result.end, result.count], [null, null, 0]);
});

test('NFC inclusion maps canonical one-to-many expansion to its covering original range', () => {
  // U+0344 canonically decomposes to diaeresis + acute; the source character
  // cannot be split even when the match ends before the normalized acute mark.
  const inner = 'abcdefghx\u0344', quote = 'abcdefghẍ';
  assert.ok(inner.normalize('NFC').includes(quote));
  checkMatch(fixture('::' + inner + '::', quote), 'normalized_match', 2, 2 + inner.length, 1);
});

for (const [name, quote] of [
  ['number', 'The limit is 100 mA. Do not enable output.'],
  ['unit', 'The limit is 10 A. Do not enable output.'],
  ['unit case', 'The limit is 10 MA. Do not enable output.'],
  ['negation', 'The limit is 10 mA. Do enable output.'],
  ['digit boundary', 'The limit is 1 0 mA. Do not enable output.'],
  ['unit boundary', 'The limit is 10mA. Do not enable output.'],
  ['punctuation', 'The limit is 10 mA Do not enable output.'],
  ['quotation marks', '"The limit is 10 mA. Do not enable output."'],
]) test(name + ' changes fail without repairing the citation', () => {
  const f = fixture(); f.citation.quote = quote;
  const before = structuredClone(f), result = verify(f);
  assert.equal(result.status, 'mismatch');
  assert.equal(result.reason, 'text_mismatch');
  assert.deepEqual([result.start, result.end, result.count], [null, null, 0]);
  assert.deepEqual(f, before);
});

for (const [source, quote] of [
  ['출력 전류는 허용하지 않는다.', '출력 전류는 허용한다.'],
  ['The limit is −10 mA.', 'The limit is -10 mA.'],
  ['The limit is 10 μA.', 'The limit is 10 µA.'],
  ['The limit is １０ mA.', 'The limit is 10 mA.'],
  ['Synthetic\u200bsource content', 'Synthetic source content'],
]) test('NFC does not add compatibility, punctuation or negation folding: ' + source, () => {
  assert.equal(verify(fixture(source, quote)).reason, 'text_mismatch');
});

test('minimum quote length is eight non-whitespace NFC code points', () => {
  for (const quote of ['a', 'ab', 'abcdefg', 'a\u3000b\t c', '😀😀😀😀', 'e\u0301'.repeat(7)]) {
    const result = verify(fixture('::' + quote + '::', quote));
    assert.equal(result.reason, 'quote_too_short');
    assert.deepEqual([result.start, result.end, result.count], [null, null, 0]);
  }
  checkMatch(fixture('::abcdefgh::', 'abcdefgh'), 'exact_match', 2, 10, 1);
  const emoji = '😀'.repeat(8);
  checkMatch(fixture('::' + emoji + '::', emoji), 'exact_match', 2, 18, 1);
});

test('wrong edition or source hash fails despite identical text', () => {
  for (const field of ['revision_id', 'content_id']) {
    const f = fixture(); f.citation = structuredClone(f.citation);
    f.citation.binding.source_revision_ref[field] = field === 'content_id' ? hash('other') : 'revision:2';
    assert.equal(verify(f).reason, 'source_revision_mismatch');
  }
});

test('missing or out-of-scope source/span/location cannot be searched', () => {
  for (const change of [
    binding => { binding.source_revision_ref.entity_id = 'source:outside'; },
    binding => { binding.source_span_ref = 'span:outside'; },
    binding => { binding.locator = 'paragraph:3'; },
  ]) {
    const f = fixture(); f.citation = structuredClone(f.citation); change(f.citation.binding);
    const result = verify(f);
    assert.equal(result.status, 'source_missing');
    assert.deepEqual([result.start, result.end, result.count], [null, null, 0]);
  }
  assert.equal(createCitationVerifier({ approvedSpans: [] }).verify(fixture().citation).status, 'source_missing');
});

test('span integrity and duplicate bindings fail closed', () => {
  const f = fixture(); f.span.span_sha256 = hash('incorrect');
  assert.equal(verify(f).reason, 'span_hash_mismatch');
  assert.equal(createCitationVerifier({ approvedSpans: [f.span, f.span] }).verify(f.citation).reason, 'ambiguous_source');
});

test('approved snapshots and returned refs are detached', () => {
  const f = fixture(), citation = structuredClone(f.citation);
  const verifier = createCitationVerifier({ approvedSpans: [f.span] });
  f.span.text = 'changed'; f.binding.locator = 'paragraph:99';
  verifier.verify(citation).binding.locator = 'paragraph:100';
  assert.equal(verifier.verify(citation).status, 'exact_match');
});

test('foreign fields cannot enter either nested exact revision ref', () => {
  const f = fixture(), verifier = createCitationVerifier({ approvedSpans: [f.span] });
  const foreign = structuredClone(f.citation);
  foreign.binding.source_revision_ref.foreign_result_type = 'external-engine-result';
  assert.throws(() => verifier.verify(foreign), /invalid_citation_input/);
  f.span.binding.source_revision_ref.foreign_result_type = 'external-engine-result';
  assert.throws(() => createCitationVerifier({ approvedSpans: [f.span] }), /invalid_citation_input/);
});

test('removed matcher and normalization options are rejected rather than silently ignored', () => {
  const approvedSpans = [fixture().span];
  assert.throws(() => createCitationVerifier({ approvedSpans, matcher: { matches: () => true } }), /invalid_citation_input/);
  assert.throws(() => createCitationVerifier({ approvedSpans, normalization: 'none' }), /invalid_citation_input/);
});

test('blank, oversized and floating-ref inputs are invalid', () => {
  for (const quote of ['', ' \t\r\n\u3000', 'x'.repeat(20001)]) {
    const f = fixture(); f.citation.quote = quote;
    assert.throws(() => verify(f), /invalid_citation_input/);
  }
  const f = fixture(); delete f.binding.source_revision_ref.revision_id;
  assert.throws(() => verify(f), /invalid_citation_input/);
});
