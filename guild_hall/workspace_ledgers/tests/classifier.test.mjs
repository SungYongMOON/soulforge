import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyMail, compileRule, compileRules, compileTerm, hintCodes, MAX_YIELDS_TO_ENTRIES,
  normalizeYieldsTo, RuleCompileError, RULE_SCHEMA_VERSION,
} from '../src/classifier.mjs';

const lit = (label, value) => ({ label, kind: 'literal', value });
const rx = (label, value, flags) => ({ label, kind: 'regex', value, flags });

function ruleJson({ code, folder, exact, hint = [], yieldsTo = null, version = 'v1' }) {
  return {
    schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: folder, rule_version: version,
    status: 'draft', match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact, hint, yields_to: yieldsTo, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution',
    sender_policy: 'hint_only',
  };
}

test('compileTerm: literal matches case-insensitively', () => {
  const term = compileTerm(lit('X', 'Widget'));
  assert.equal(term.test('a WIDGET here'), true);
  assert.equal(term.test('no match'), false);
});

test('compileTerm: regex compiles and tests with unicode flag', () => {
  const term = compileTerm(rx('mask', '기[0Oo]탐', 'u'));
  assert.equal(term.test('기0탐 device'), true);
  assert.equal(term.test('기뢰'), false);
});

test('compileTerm: rejects empty value and overlong value', () => {
  assert.throws(() => compileTerm(lit('empty', '')), RuleCompileError);
  assert.throws(() => compileTerm(lit('long', 'x'.repeat(300))), RuleCompileError);
});

test('compileTerm: rejects invalid regex and over-complex regex', () => {
  assert.throws(() => compileTerm(rx('bad', '(unterminated')), RuleCompileError);
  const manyQuantifiers = Array.from({ length: 30 }, () => 'a*').join('');
  assert.throws(() => compileTerm(rx('complex', manyQuantifiers)), RuleCompileError);
});

test('compileRule: rejects empty exact list and duplicate labels', () => {
  assert.throws(() => compileRule(ruleJson({ code: 'P00-001', folder: 'P00-001_x', exact: [] })), RuleCompileError);
  assert.throws(() => compileRule(ruleJson({
    code: 'P00-001', folder: 'P00-001_x',
    exact: [lit('DUP', 'a')], hint: [lit('DUP', 'b')],
  })), RuleCompileError);
});

test('classifyMail: exact hit, held on two-project overlap, yields_to redirect', () => {
  const ruleA = ruleJson({ code: 'P00-001', folder: 'P00-001_a', exact: [lit('ALPHA', 'alpha')] });
  const ruleB = ruleJson({ code: 'P00-002', folder: 'P00-002_b', exact: [lit('BETA', 'beta')] });
  const ruleC = ruleJson({
    code: 'P00-003', folder: 'P00-003_c', exact: [lit('GAMMA', 'gamma')],
    yieldsTo: { project_code: 'P00-001', when: lit('UPGRADE', 'upgrade') },
  });
  const compiled = compileRules([ruleA, ruleB, ruleC]);

  const single = classifyMail({ subject: 'alpha report', body_text: '', attachment_names: [] }, compiled);
  assert.equal(single.held, false);
  assert.deepEqual(single.hits.map(hit => hit.project_code), ['P00-001']);

  const overlap = classifyMail({ subject: 'alpha and beta together', body_text: '', attachment_names: [] }, compiled);
  assert.equal(overlap.held, true);
  assert.deepEqual(overlap.hits.map(hit => hit.project_code).sort(), ['P00-001', 'P00-002']);

  const yielded = classifyMail({ subject: 'gamma upgrade', body_text: '', attachment_names: [] }, compiled);
  assert.equal(yielded.hits.length, 0); // rule C yields away; nothing else in this fixture mentions "gamma upgrade"
});

test('classifyMail: fields option reproduces subject-only numbers even when body_text would also match', () => {
  const rule = ruleJson({ code: 'P00-001', folder: 'P00-001_a', exact: [lit('WIDGET', 'widget')] });
  const compiled = compileRules([rule]);
  const mail = { subject: 'no keyword here', body_text: 'this mentions widget in the body', attachment_names: [] };
  const subjectOnly = classifyMail(mail, compiled, { fields: ['subject'] });
  const allFields = classifyMail(mail, compiled, { fields: ['subject', 'body_text', 'attachment_names'] });
  assert.equal(subjectOnly.hits.length, 0);
  assert.equal(allFields.hits.length, 1);
});

test('classifyMail: attachment_names field participates when requested', () => {
  const rule = ruleJson({ code: 'P00-001', folder: 'P00-001_a', exact: [lit('BOARD', 'PMOD BOARD')] });
  const compiled = compileRules([rule]);
  const mail = { subject: 'quote', body_text: '', attachment_names: ['PMOD BOARD spec.pdf'] };
  assert.equal(classifyMail(mail, compiled, { fields: ['subject'] }).hits.length, 0);
  assert.equal(classifyMail(mail, compiled, { fields: ['attachment_names'] }).hits.length, 1);
});

test('normalizeYieldsTo: accepts null/undefined/object/array, caps entry count', () => {
  assert.deepEqual(normalizeYieldsTo(null), []);
  assert.deepEqual(normalizeYieldsTo(undefined), []);
  const one = { project_code: 'X', when: lit('a', 'a') };
  assert.deepEqual(normalizeYieldsTo(one), [one]);
  assert.deepEqual(normalizeYieldsTo([one, one]), [one, one]);
  const tooMany = Array.from({ length: MAX_YIELDS_TO_ENTRIES + 1 }, () => one);
  assert.throws(() => normalizeYieldsTo(tooMany), RuleCompileError);
});

test('classifyMail: yields_to as a single object (legacy) and as an array both redirect', () => {
  const withArray = ruleJson({
    code: 'P00-001', folder: 'P00-001_a', exact: [lit('GAMMA', 'gamma')],
    yieldsTo: [{ project_code: 'P00-002', when: lit('UPGRADE', 'upgrade') }, { project_code: 'P00-003', when: lit('VARIANT', 'variant') }],
  });
  const compiledArray = compileRules([withArray]);
  assert.equal(classifyMail({ subject: 'gamma upgrade', body_text: '', attachment_names: [] }, compiledArray).hits.length, 0);
  assert.equal(classifyMail({ subject: 'gamma variant', body_text: '', attachment_names: [] }, compiledArray).hits.length, 0);
  assert.equal(classifyMail({ subject: 'gamma only', body_text: '', attachment_names: [] }, compiledArray).hits.length, 1);

  const withObject = ruleJson({
    code: 'P00-001', folder: 'P00-001_a', exact: [lit('GAMMA', 'gamma')],
    yieldsTo: { project_code: 'P00-002', when: lit('UPGRADE', 'upgrade') }, // legacy single-object shape
  });
  const compiledObject = compileRules([withObject]);
  assert.equal(classifyMail({ subject: 'gamma upgrade', body_text: '', attachment_names: [] }, compiledObject).hits.length, 0);
});

test('hintCodes: reports hint-only matches, excludes projects with an exact hit', () => {
  const rule = ruleJson({
    code: 'P00-001', folder: 'P00-001_a', exact: [lit('EXACT', 'exactterm')], hint: [lit('HINT', 'hintterm')],
  });
  const compiled = compileRules([rule]);
  assert.deepEqual(hintCodes({ subject: 'has hintterm only', body_text: '', attachment_names: [] }, compiled), ['P00-001']);
  assert.deepEqual(hintCodes({ subject: 'exactterm and hintterm', body_text: '', attachment_names: [] }, compiled), []);
});
