import test from 'node:test';
import assert from 'node:assert/strict';
import { linkApprovedUnits } from '../../src/knowledge_layer/index.mjs';
import { validateLinkedBundle } from '../../src/knowledge_layer/span_link.mjs';
import { hashText } from '../../src/knowledge_layer/data.mjs';
import { NOW, syntheticRequest } from './fixtures.mjs';
test('admitted mail/voice/document spans preserve exact source refs, hashes, locators and clocks', () => {
  const request = syntheticRequest(), before = structuredClone(request), bundle = linkApprovedUnits(request);
  assert.deepEqual(bundle.coverage, { supplied: 3, admitted: 3, excluded: 0, characters: request.units.reduce((n,u) => n + u.text.length, 0) });
  for (const u of bundle.units) { const s = bundle.spans.find(s => s.unit_id === u.unit_id); assert.deepEqual(s.binding.source_revision_ref, u.source_revision_ref); assert.equal(s.span_sha256, hashText(u.text)); assert.equal(s.binding.locator, u.locator); }
  assert.deepEqual(validateLinkedBundle(bundle, NOW), bundle); assert.deepEqual(request, before);
  assert.ok(Object.isFrozen(bundle.units[0]));
});
test('unit ordering does not change the source digest', () => {
  const req = syntheticRequest(), before = linkApprovedUnits(req); req.units.reverse();
  assert.equal(linkApprovedUnits(req).source_digest, before.source_digest);
});
for (const [name, mutate] of [
  ['foreign project', r => { r.units[0].project_ref = 'SYN-B'; }],
  ['wrong edition', r => { r.units[0].source_revision_ref = { ...r.units[0].source_revision_ref, revision_id: 'revision:2' }; }],
  ['altered text', r => { r.units[0].text += ' 변조'; }],
  ['wrong location', r => { r.units[0].locator = 'paragraph:99'; }],
  ['expired grant', r => { r.now = r.grant.expires_at; }],
  ['coverage omission', r => { r.units.pop(); }],
  ['duplicate unit', r => { r.units.push(r.units[0]); }],
  ['foreign ref field', r => { r.units[0].source_revision_ref.foreign = true; }],
]) test(name + ' refuses without returning a partial bundle', () => { const req = syntheticRequest(); mutate(req); assert.throws(() => linkApprovedUnits(req)); });
test('NFD Hangul and fullwidth whitespace are preserved verbatim, not silently normalized', () => {
  const req = syntheticRequest(); req.units[0].text = '출력은　승인하지 않는다.'.normalize('NFD');
  req.units[0].text_sha256 = hashText(req.units[0].text); req.grant.units[0].text_sha256 = req.units[0].text_sha256;
  assert.equal(linkApprovedUnits(req).units.find(u => u.unit_id === req.units[0].unit_id).text, req.units[0].text);
});
test('empty complete inventory is representable but is not a deletion instruction', () => {
  const req = syntheticRequest(); req.units = []; req.grant.units = [];
  assert.equal(linkApprovedUnits(req).coverage.admitted, 0);
});
test('forged bundles, accessors, proxy and excessive input are rejected', () => {
  const b = structuredClone(linkApprovedUnits(syntheticRequest())); b.spans[0].span_sha256 = 'sha256:' + '0'.repeat(64);
  assert.throws(() => validateLinkedBundle(b, NOW));
  let called = false; const req = syntheticRequest(); Object.defineProperty(req, 'now', { get() { called = true; return NOW; } });
  assert.throws(() => linkApprovedUnits(req)); assert.equal(called, false);
  assert.throws(() => linkApprovedUnits(new Proxy({}, {})));
  const large = syntheticRequest(); large.units[0].text = '가'.repeat(20001); assert.throws(() => linkApprovedUnits(large));
});
test('hidden own fields on objects, exact refs and arrays are rejected, never silently dropped', () => {
  for (const select of [r => r.units[0], r => r.units[0].source_revision_ref, r => r.grant.units[0], r => r.units]) {
    const request = syntheticRequest(); Object.defineProperty(select(request), 'foreign', { value: true, enumerable: false });
    assert.throws(() => linkApprovedUnits(request), /knowledge_plain_data_required/);
  }
});
