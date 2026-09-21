import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialChipEditorState, addLiteralChip, removeChip, setNote, toDraft, MAX_TERMS, MAX_LITERAL_CHARS,
  mailRuleStatusLabel, mailRuleStatusTone, describeChipAddRejection, shouldCommitChipOnKeyDown,
} from './mail-rule-chip-editor.mjs';

test('initialChipEditorState seeds chips and yields_to from the rule and starts with an empty note', () => {
  const yieldsTo = [{ project_code: 'P00-002', when: { label: '견적', kind: 'literal', value: '견적' } }];
  const state = initialChipEditorState({ exact: [{ label: 'a', kind: 'literal', value: 'a' }], hint: [{ label: 'r', kind: 'regex', value: '^x', flags: 'u' }], yields_to: yieldsTo });
  assert.deepEqual(state.exact, [{ label: 'a', kind: 'literal', value: 'a' }]);
  assert.deepEqual(state.hint, [{ label: 'r', kind: 'regex', value: '^x', flags: 'u' }]);
  assert.equal(state.note, '');
  assert.equal(state.yields_to, yieldsTo, 'carried through by reference, not editable in this slice');
  assert.deepEqual(initialChipEditorState(undefined), { exact: [], hint: [], note: '', yields_to: [] });
});

test('mailRuleStatusLabel/Tone map draft*/confirmed/accepted and pass unknown statuses through as-is', () => {
  assert.equal(mailRuleStatusLabel('draft_open_items'), '초안');
  assert.equal(mailRuleStatusLabel('draft_owner_answers_applied_no_open_items'), '초안');
  assert.equal(mailRuleStatusLabel('confirmed'), '확정');
  assert.equal(mailRuleStatusLabel('accepted'), '확정');
  assert.equal(mailRuleStatusLabel('archived'), 'archived');
  assert.equal(mailRuleStatusLabel(''), '미확인');
  assert.equal(mailRuleStatusLabel(undefined), '미확인');
  assert.equal(mailRuleStatusTone('confirmed'), 'green');
  assert.equal(mailRuleStatusTone('accepted'), 'green');
  assert.equal(mailRuleStatusTone('draft_open_items'), 'amber');
  assert.equal(mailRuleStatusTone('archived'), 'amber');
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

test('removeChip removes by index from the named group only, and is a no-op for an out-of-range index', () => {
  let state = initialChipEditorState({ exact: [{ label: 'a', kind: 'literal', value: 'a' }, { label: 'b', kind: 'literal', value: 'b' }], hint: [] });
  const removed = removeChip(state, 'exact', 0);
  assert.deepEqual(removed.exact, [{ label: 'b', kind: 'literal', value: 'b' }]);
  const noop = removeChip(state, 'hint', 0);
  assert.equal(noop, state, 'out-of-range index is a no-op, same state reference');
  assert.equal(removeChip(state, 'exact', -1), state);
  assert.equal(removeChip(state, 'exact', 2.5), state);
});

// nit: a hand-edited rule file can carry duplicate labels within one group; removing by index
// (not by label) must remove only the specific chip that was clicked, never every chip sharing
// that label.
test('removeChip removes only the one clicked chip even when two chips in the same group share a label', () => {
  const state = initialChipEditorState({ exact: [
    { label: 'dup', kind: 'literal', value: 'dup' }, { label: 'mid', kind: 'literal', value: 'mid' }, { label: 'dup', kind: 'literal', value: 'dup' },
  ], hint: [] });
  const removedFirst = removeChip(state, 'exact', 0);
  assert.deepEqual(removedFirst.exact, [{ label: 'mid', kind: 'literal', value: 'mid' }, { label: 'dup', kind: 'literal', value: 'dup' }]);
  const removedLast = removeChip(state, 'exact', 2);
  assert.deepEqual(removedLast.exact, [{ label: 'dup', kind: 'literal', value: 'dup' }, { label: 'mid', kind: 'literal', value: 'mid' }]);
});

test('describeChipAddRejection names why addLiteralChip would no-op, in the same order addLiteralChip checks, and returns null when it would succeed', () => {
  let state = initialChipEditorState({ exact: [{ label: '견적', kind: 'literal', value: '견적' }], hint: [] });
  assert.equal(describeChipAddRejection(state, 'exact', '   '), 'empty');
  assert.equal(describeChipAddRejection(state, 'exact', 'x'.repeat(MAX_LITERAL_CHARS + 1)), 'too_long');
  assert.equal(describeChipAddRejection(state, 'exact', '견적'), 'duplicate');
  assert.equal(describeChipAddRejection(state, 'exact', '새 키워드'), null, 'a value that would actually add has no rejection reason');
  for (let i = 0; i < MAX_TERMS; i++) state = addLiteralChip(state, 'hint', `term-${i}`);
  assert.equal(describeChipAddRejection(state, 'hint', 'one-more'), 'at_max');
});

test('shouldCommitChipOnKeyDown fires only on a real Enter, never mid-IME-composition (isComposing or the Windows keyCode 229 replay)', () => {
  assert.equal(shouldCommitChipOnKeyDown({ key: 'Enter', isComposing: false, keyCode: 13 }), true);
  assert.equal(shouldCommitChipOnKeyDown({ key: 'Enter' }), true, 'missing isComposing/keyCode defaults to a real commit');
  assert.equal(shouldCommitChipOnKeyDown({ key: 'Enter', isComposing: true, keyCode: 13 }), false, 'still composing');
  assert.equal(shouldCommitChipOnKeyDown({ key: 'Enter', isComposing: false, keyCode: 229 }), false, 'Windows IME commit replay');
  assert.equal(shouldCommitChipOnKeyDown({ key: 'a', isComposing: false, keyCode: 65 }), false, 'not Enter at all');
  assert.equal(shouldCommitChipOnKeyDown(undefined), false);
});

test('setNote trims to the character cap and toDraft omits an empty note but always carries yields_to', () => {
  let state = initialChipEditorState(undefined);
  state = setNote(state, 'x'.repeat(600));
  assert.equal(state.note.length, 500);
  assert.deepEqual(toDraft(initialChipEditorState(undefined)), { exact: [], hint: [], yields_to: [] });
  assert.deepEqual(toDraft(setNote(initialChipEditorState(undefined), '사유')), { exact: [], hint: [], yields_to: [], note: '사유' });
  const withYields = initialChipEditorState({ yields_to: [{ project_code: 'P00-002', when: { label: 'a', kind: 'literal', value: 'a' } }] });
  assert.deepEqual(toDraft(withYields).yields_to, [{ project_code: 'P00-002', when: { label: 'a', kind: 'literal', value: 'a' } }]);
});
