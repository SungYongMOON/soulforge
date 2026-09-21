// R1 (coordinator, fresh review round 4): `src/index.mjs` is the declared single entry
// point for external callers -- its own doc comment must never describe a shape the
// library does not actually have (the coordinator caught it advertising `fields:
// MATCH_FIELDS` as a way to widen step 1, which now throws). This file pins the
// public surface a caller following that doc comment actually gets, rather than
// relying on the doc comment being accurate by inspection alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as index from '../src/index.mjs';

test('index.mjs (R1): re-exports the K1 subject-only-fields primitives a caller building a new entry point would need', () => {
  assert.equal(typeof index.assertSubjectOnlyFields, 'function');
  assert.equal(typeof index.isSubjectOnlyFields, 'function');
  assert.equal(typeof index.FIELDS_NOT_SUPPORTED_CODE, 'string');
  assert.deepEqual(index.DEFAULT_MATCH_FIELDS, ['subject']);
  assert.equal(index.isSubjectOnlyFields(index.DEFAULT_MATCH_FIELDS), true);
  assert.equal(index.isSubjectOnlyFields(index.MATCH_FIELDS), false);
  assert.throws(() => index.assertSubjectOnlyFields(index.MATCH_FIELDS),
    error => error.code === index.FIELDS_NOT_SUPPORTED_CODE);
});

test('index.mjs (K1): classifyMail/hintCodes are exported as low-level primitives, not gated to subject-only -- a caller must enforce that itself', () => {
  assert.equal(typeof index.classifyMail, 'function');
  assert.equal(typeof index.hintCodes, 'function');
  // classifyMail happily matches body_text when explicitly asked -- it is not itself
  // a step-1 entry point and carries no subject-only assertion of its own.
  const rule = index.compileRule({
    schema_version: index.RULE_SCHEMA_VERSION, project_code: 'P00-001', folder_name: 'P00-001_x', rule_version: 'v1',
    match_fields: ['subject', 'body_text'], case_insensitive_literals: true,
    exact: [{ label: 'x', kind: 'literal', value: '바디전용키워드' }], hint: [],
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  }, { timeSafety: false });
  const result = index.classifyMail({ subject: '무관', body_text: '바디전용키워드 있음', attachment_names: [] }, [rule], { fields: ['subject', 'body_text'] });
  assert.equal(result.hits.length, 1); // classifyMail itself never refuses a wider fields list
});

test('index.mjs (R2/S-b): re-exports resolveOwnerTablePaths/OwnerTableConfigError for a caller inspecting owner-table config resolution directly', () => {
  assert.equal(typeof index.resolveOwnerTablePaths, 'function');
  assert.equal(typeof index.OwnerTableConfigError, 'function');
});

test('index.mjs: previewRule/refresh are still the same exported functions (name/shape unchanged, only the fields contract tightened)', () => {
  assert.equal(typeof index.previewRule, 'function');
  assert.equal(typeof index.refresh, 'function');
  assert.equal(typeof index.refreshCommon, 'function');
  assert.equal(typeof index.classifyAllCommonMail, 'function');
});
