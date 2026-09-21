import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCitationVerifier } from '../src/app.mjs';

// Public synthetic text only. No fixture files, stores, accounts or IO needed.
const hash = text => 'sha256:' + createHash('sha256').update(text).digest('hex');
function fixture(source = 'The limit is 10 mA. Do not enable output.') {
  const binding = {
    source_revision_ref: { entity_id: 'source:synthetic', revision_id: 'revision:1',
      content_id: hash('Synthetic heading\n\n' + source), content_hash_alg: 'sha256' },
    source_span_ref: 'span:synthetic-1', locator: 'paragraph:2',
  };
  const span = { binding, text: source, span_sha256: hash(source) };
  return { binding, span, citation: { binding, quote: source } };
}
const verify = (f, options = {}) => createCitationVerifier({ approvedSpans: [f.span], ...options }).verify(f.citation);

test('exact quote preserves full reference, edition, hashes and location without bodies', () => {
  const f = fixture(), before = structuredClone(f), result = verify(f);
  assert.equal(result.status, 'exact_match');
  assert.deepEqual(result.binding, before.binding);
  assert.equal(result.span_sha256, hash(f.span.text));
  assert.equal(result.quote_sha256, hash(f.citation.quote));
  assert.equal(result.semantic_fact_verified, false);
  assert.equal(result.knowledge_accepted, false);
  assert.equal(result.comparison_scope, 'entire_supplied_span');
  assert.equal(Object.hasOwn(result, 'quote'), false);
  assert.equal(Object.hasOwn(result, 'text'), false);
  result.binding.source_revision_ref.revision_id = 'changed';
  assert.deepEqual(f, before);
});

test('whitespace normalization is opt-in, exact match retains precedence', () => {
  const f = fixture('  The\tlimit is\r\n10 mA.\nDo not enable output.  ');
  f.citation.quote = 'The limit is 10 mA. Do not enable output.';
  assert.equal(verify(f).status, 'mismatch');
  assert.equal(verify(f, { normalization: 'ascii_whitespace_v1' }).status, 'normalized_match');
  f.citation.quote = f.span.text;
  assert.equal(verify(f, { normalization: 'ascii_whitespace_v1' }).status, 'exact_match');
});

for (const [name, quote] of [
  ['number changed', 'The limit is 100 mA. Do not enable output.'],
  ['unit changed', 'The limit is 10 A. Do not enable output.'],
  ['unit case changed', 'The limit is 10 MA. Do not enable output.'],
  ['negation reversed', 'The limit is 10 mA. Do enable output.'],
  ['number boundary removed', 'The limit is 1 0 mA. Do not enable output.'],
  ['unit boundary removed', 'The limit is 10mA. Do not enable output.'],
  ['punctuation removed', 'The limit is 10 mA Do not enable output.'],
  ['only a substring', 'The limit is 10 mA.'],
  ['quote marks retained', '"The limit is 10 mA. Do not enable output."'],
  ['nonbreaking space', 'The limit is 10\u00a0mA. Do not enable output.'],
]) test(name + ' cannot pass allowed normalization or rewrite input', () => {
  const f = fixture(); f.citation.quote = quote;
  const before = structuredClone(f);
  assert.equal(verify(f, { normalization: 'ascii_whitespace_v1' }).status, 'mismatch');
  assert.deepEqual(f, before);
});

for (const [source, quote] of [['허용하지 않는다.', '허용한다.'], ['−10 mA', '-10 mA'], ['10 μA', '10 µA']]) {
  test('Unicode and Korean negation remain literal: ' + source, () => {
    const f = fixture(source); f.citation.quote = quote;
    assert.equal(verify(f, { normalization: 'ascii_whitespace_v1' }).status, 'mismatch');
  });
}

test('wrong edition or source byte hash fails even when text is identical', () => {
  for (const field of ['revision_id', 'content_id']) {
    const f = fixture(); f.citation = structuredClone(f.citation);
    f.citation.binding.source_revision_ref[field] = field === 'content_id' ? hash('other') : 'revision:2';
    assert.equal(verify(f).reason, 'source_revision_mismatch');
    assert.equal(verify(f).status, 'mismatch');
  }
});

test('missing or out-of-scope source/span/location never reaches matcher', () => {
  let calls = 0;
  const matcher = { id: 'synthetic/probe', matches: () => { calls++; return true; } };
  for (const change of [
    binding => { binding.source_revision_ref.entity_id = 'source:outside'; },
    binding => { binding.source_span_ref = 'span:outside'; },
    binding => { binding.locator = 'paragraph:3'; },
  ]) {
    const f = fixture(); f.citation = structuredClone(f.citation); change(f.citation.binding);
    assert.equal(verify(f, { matcher }).status, 'source_missing');
  }
  assert.equal(createCitationVerifier({ approvedSpans: [], matcher }).verify(fixture().citation).status, 'source_missing');
  assert.equal(calls, 0);
});

test('span integrity and duplicate binding refuse comparison', () => {
  const f = fixture(); f.span.span_sha256 = hash('incorrect');
  assert.equal(verify(f).reason, 'span_hash_mismatch');
  assert.equal(createCitationVerifier({ approvedSpans: [f.span, f.span] }).verify(f.citation).reason, 'ambiguous_source');
});

test('snapshot is detached from caller mutations and returned references', () => {
  const f = fixture(); const verifier = createCitationVerifier({ approvedSpans: [f.span] });
  const citation = structuredClone(f.citation);
  f.span.text = 'changed'; f.binding.locator = 'paragraph:99';
  const result = verifier.verify(citation); result.binding.locator = 'paragraph:100';
  assert.equal(verifier.verify(citation).status, 'exact_match');
});

test('foreign fields cannot enter or be echoed through the nested exact revision ref', () => {
  const f = fixture();
  const verifier = createCitationVerifier({ approvedSpans: [f.span] });
  const foreignCitation = structuredClone(f.citation);
  foreignCitation.binding.source_revision_ref.foreign_result_type = 'external-engine-result';
  assert.throws(() => verifier.verify(foreignCitation), /invalid_citation_input/);
  f.span.binding.source_revision_ref.foreign_result_type = 'external-engine-result';
  assert.throws(() => createCitationVerifier({ approvedSpans: [f.span] }), /invalid_citation_input/);
});

test('a replacement adapter sees only strings and preserves all four outcomes', () => {
  let calls = 0;
  const matcher = { id: 'synthetic/alternative', matches(pair) {
    calls++;
    assert.deepEqual(Object.keys(pair).sort(), ['quote', 'source']);
    // Simulate an engine with a different internal result shape behind the seam.
    const foreignResult = { equal: Buffer.from(pair.quote).equals(Buffer.from(pair.source)) };
    return foreignResult.equal;
  } };
  const f = fixture();
  assert.equal(verify(f, { matcher }).status, 'exact_match');
  f.citation.quote = '  ' + f.span.text;
  assert.equal(verify(f, { matcher, normalization: 'ascii_whitespace_v1' }).status, 'normalized_match');
  assert.equal(verify(f, { matcher }).status, 'mismatch');
  assert.equal(createCitationVerifier({ approvedSpans: [], matcher }).verify(f.citation).status, 'source_missing');
  assert.equal(calls, 3);
});

test('adapter failure, foreign result, async result and permissive match fail closed', () => {
  const f = fixture(); f.citation.quote = 'The limit is 100 A. Enable output.';
  for (const matches of [() => true, () => ({ equal: true }), () => undefined,
    () => Promise.resolve(true), async () => { throw new Error('synthetic adapter failure'); }]) {
    assert.equal(verify(f, { matcher: { id: 'synthetic/invalid', matches } }).reason, 'matcher_contract_violation');
  }
  const result = verify(f, { matcher: { id: 'synthetic/failure', matches() { throw new Error(f.span.text); } } });
  assert.equal(result.reason, 'matcher_failed');
  assert.equal(JSON.stringify(result).includes(f.span.text), false);
});

test('empty text, unsupported normalization, floating ref and oversized input are invalid', () => {
  const f = fixture();
  assert.throws(() => verify(f, { normalization: 'lowercase' }), /invalid_citation_input/);
  for (const quote of ['', ' \t\r\n', 'x'.repeat(20001)]) {
    assert.throws(() => verify({ ...f, citation: { binding: f.binding, quote } }), /invalid_citation_input/);
  }
  delete f.binding.source_revision_ref.revision_id;
  assert.throws(() => verify(f), /invalid_citation_input/);
});
