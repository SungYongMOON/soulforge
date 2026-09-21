import test from 'node:test';
import assert from 'node:assert/strict';
import { initialChipEditorState, addLiteralChip, removeChip, setNote, toDraft, MAX_TERMS, MAX_LITERAL_CHARS } from './mail-rule-chip-editor.mjs';

test('initialChipEditorState seeds chips from the rule and starts with an empty note', () => {
  const state = initialChipEditorState({ exact: [{ label: 'a', kind: 'literal', value: 'a' }], hint: [{ label: 'r', kind: 'regex', value: '^x', flags: 'u' }] });
  assert.deepEqual(state.exact, [{ label: 'a', kind: 'literal', value: 'a' }]);
  assert.deepEqual(state.hint, [{ label: 'r', kind: 'regex', value: '^x', flags: 'u' }]);
  assert.equal(state.note, '');
  assert.deepEqual(initialChipEditorState(undefined), { exact: [], hint: [], note: '' });
});

test('addLiteralChip adds a trimmed literal chip and is a no-op for empty, oversized or duplicate values', () => {
  let state = initialChipEditorState(undefined);
  state = addLiteralChip(state, 'exact', '  견적  ');
  assert.deepEqual(state.exact, [{ label: '견적', kind: 'literal', value: '견적' }]);
  const noop1 = addLiteralChip(state, 'exact', '   ');
  assert.equal(noop1, state);
  const noop2 = addLiteralChip(state, 'exact', 'x'.repeat(MAX_LITERAL_CHARS + 1));
  assert.equal(noop2, state);
  const dup = addLiteralChip(state, 'exact', '견적');
  assert.equal(dup, state, 'duplicate label is a no-op, not a second chip');
  const added = addLiteralChip(state, 'hint', '문의');
  assert.deepEqual(added.hint, [{ label: '문의', kind: 'literal', value: '문의' }]);
  assert.deepEqual(added.exact, state.exact, 'the other group is untouched');
});

test('addLiteralChip refuses once a group reaches MAX_TERMS', () => {
  let state = initialChipEditorState(undefined);
  for (let i = 0; i < MAX_TERMS; i++) state = addLiteralChip(state, 'exact', `term-${i}`);
  assert.equal(state.exact.length, MAX_TERMS);
  const atLimit = addLiteralChip(state, 'exact', 'one-more');
  assert.equal(atLimit, state);
});

test('removeChip removes by label from the named group only, and is a no-op for an unknown label', () => {
  let state = initialChipEditorState({ exact: [{ label: 'a', kind: 'literal', value: 'a' }, { label: 'b', kind: 'literal', value: 'b' }], hint: [] });
  const removed = removeChip(state, 'exact', 'a');
  assert.deepEqual(removed.exact, [{ label: 'b', kind: 'literal', value: 'b' }]);
  const noop = removeChip(state, 'hint', 'a');
  assert.deepEqual(noop.hint, []);
});

test('setNote trims to the character cap and toDraft omits an empty note', () => {
  let state = initialChipEditorState(undefined);
  state = setNote(state, 'x'.repeat(600));
  assert.equal(state.note.length, 500);
  assert.deepEqual(toDraft(initialChipEditorState(undefined)), { exact: [], hint: [] });
  assert.deepEqual(toDraft(setNote(initialChipEditorState(undefined), '사유')), { exact: [], hint: [], note: '사유' });
});
