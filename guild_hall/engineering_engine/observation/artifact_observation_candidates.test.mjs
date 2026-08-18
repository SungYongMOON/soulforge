import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ARTIFACT_OBSERVATION_CANDIDATES_SCHEMA_VERSION,
  ArtifactObservationCandidateError,
  OBSERVATION_CANDIDATE_ERROR_CODES,
  buildArtifactObservationCandidates,
  engineStageCodeForGate,
  readMaturity,
} from './artifact_observation_candidates.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../stage_rules/artifact_vocabulary.mjs';
import { compileStageRules } from '../stage_rules/stage_rule_compiler.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../docs/architecture/workspace/examples/se_stage_rules/observation_candidates_synthetic_v0.json',
  import.meta.url,
), 'utf8'));
const STAGE_RULE_FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../docs/architecture/workspace/examples/se_stage_rules/compiled_variant_synthetic_v0.json',
  import.meta.url,
), 'utf8'));

const clone = (value) => structuredClone(value);

const build = (overrides = {}) => buildArtifactObservationCandidates({
  ...clone(FIXTURE.request),
  vocabulary: ARTIFACT_VOCABULARY_V0,
  ...overrides,
});

const byFileRef = (result) => {
  const rows = new Map();
  for (const row of result.candidates) rows.set(row.file_ref, { outcome: 'candidate', ...row });
  for (const row of result.ambiguous) rows.set(row.file_ref, { outcome: 'ambiguous', ...row });
  for (const row of result.unmatched) rows.set(row.file_ref, { outcome: 'unmatched', ...row });
  return rows;
};

// ---------------------------------------------------------------- 1. the fixture, row by row

test('every fixture file reaches the outcome the fixture states by hand', () => {
  const rows = byFileRef(build());
  assert.equal(rows.size, FIXTURE.request.inventory.length);

  for (const [fileRef, expected] of Object.entries(FIXTURE.expected.by_file_ref)) {
    const actual = rows.get(fileRef);
    assert.ok(actual !== undefined, `no outcome for ${fileRef}`);
    assert.equal(actual.outcome, expected.outcome, fileRef);
    if (expected.outcome === 'candidate') {
      assert.equal(actual.stage_code, expected.stage_code, fileRef);
      assert.equal(actual.artifact_type_id, expected.artifact_type_id, fileRef);
      assert.equal(actual.maturity, expected.maturity ?? null, fileRef);
      assert.equal(actual.confidence, expected.confidence, fileRef);
      assert.equal(actual.auto_confirmed, expected.auto_confirmed, fileRef);
      assert.equal(actual.needs_owner_confirmation, !expected.auto_confirmed, fileRef);
      assert.ok(actual.cues.length > 0, fileRef);
    } else if (expected.outcome === 'ambiguous') {
      assert.deepEqual(actual.options, expected.options, fileRef);
    } else {
      assert.equal(actual.reason, expected.reason, fileRef);
    }
  }
});

test('the fixture counts are the counts the receipt reports', () => {
  const { receipt } = build();
  assert.deepEqual({
    inventory_files: receipt.counts.inventory_files,
    candidates: receipt.counts.candidates,
    auto_confirmed: receipt.counts.auto_confirmed,
    needs_owner_confirmation: receipt.counts.needs_owner_confirmation,
    ambiguous: receipt.counts.ambiguous,
    unmatched: receipt.counts.unmatched,
  }, FIXTURE.expected.counts);
  assert.equal(receipt.schema_version, ARTIFACT_OBSERVATION_CANDIDATES_SCHEMA_VERSION);
  for (const value of Object.values(receipt.effects)) assert.equal(value, 0);
});

// ---------------------------------------------------------------- 2. determinism

test('two runs over one inventory reach byte-identical output', () => {
  const first = build();
  const second = build();
  assert.deepEqual(second.receipt.output_digests, first.receipt.output_digests);
  assert.deepEqual(second.receipt.input_digests, first.receipt.input_digests);
  assert.equal(JSON.stringify(second.candidates), JSON.stringify(first.candidates));
});

test('the inventory order does not change the answer', () => {
  const forwards = build();
  const backwards = build({ inventory: [...clone(FIXTURE.request.inventory)].reverse() });
  assert.equal(JSON.stringify(backwards.candidates), JSON.stringify(forwards.candidates));
  assert.equal(backwards.receipt.output_digests.candidates, forwards.receipt.output_digests.candidates);
});

test('the output is deeply frozen', () => {
  const result = build();
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.candidates));
  assert.ok(Object.isFrozen(result.candidates[0].cues));
});

// ---------------------------------------------------------------- 3. the auto-confirmation rule

test('only an unambiguous 03_Out row auto-confirms, and only when the rule is switched on', () => {
  const on = build();
  const autoConfirmed = on.candidates.filter((row) => row.auto_confirmed);
  assert.equal(autoConfirmed.length, FIXTURE.expected.counts.auto_confirmed);
  for (const row of autoConfirmed) {
    assert.equal(row.file_ref.split('/')[2], '03_Out');
    assert.equal(row.confidence, 'high');
  }

  const off = build({ rules: { auto_confirm_03_out: false } });
  assert.equal(off.candidates.filter((row) => row.auto_confirmed).length, 0);
  assert.equal(off.candidates.every((row) => row.needs_owner_confirmation), true);
  // Switching the rule off changes nothing else about what was recognised.
  assert.deepEqual(off.candidates.map((row) => row.artifact_type_id),
    on.candidates.map((row) => row.artifact_type_id));
});

test('a 03_Out file under a task number the spec does not carry is not auto-confirmed', () => {
  const rows = byFileRef(build());
  const overlayRow = rows.get('120_CDR/124_synthetic_prime_review/03_Out/prime_synthetic_gate_review_report.pdf');
  assert.equal(overlayRow.outcome, 'candidate');
  assert.equal(overlayRow.file_ref.split('/')[2], '03_Out');
  assert.equal(overlayRow.auto_confirmed, false);
});

test('an ambiguous file is never confirmed and never becomes a candidate', () => {
  const result = build();
  const ambiguousRefs = new Set(result.ambiguous.map((row) => row.file_ref));
  assert.ok(ambiguousRefs.size > 0);
  for (const row of result.candidates) assert.equal(ambiguousRefs.has(row.file_ref), false);
});

// ---------------------------------------------------------------- 4. what this layer may assert

test('a candidate only ever claims presence, never confirmed absence', () => {
  for (const row of build().candidates) assert.equal(row.presence_state, 'present');
});

test('a candidate id is opaque and follows the bytes, not the position', () => {
  const first = build();
  const moved = build({ inventory: [...clone(FIXTURE.request.inventory)].reverse() });
  const byRef = new Map(moved.candidates.map((row) => [row.file_ref, row.candidate_id]));
  for (const row of first.candidates) {
    assert.match(row.candidate_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.equal(byRef.get(row.file_ref), row.candidate_id);
  }
});

// ---------------------------------------------------------------- 5. maturity

test('maturity is read from the file name first and the task folder second', () => {
  assert.equal(readMaturity('kvds_hdd_final.pdf', null).maturity, 'final');
  assert.equal(readMaturity('kvds_hdd_초안.hwpx', null).maturity, 'preliminary');
  assert.equal(readMaturity('kvds_hdd_rev3.pdf', null).maturity, 'updated');
  assert.equal(readMaturity('kvds_hdd_v0.3.pdf', null).maturity, 'preliminary');
  assert.equal(readMaturity('kvds_hdd_승인.pdf', null).maturity, 'baseline');
  assert.equal(readMaturity('kvds_hdd_D.pdf', null).maturity, 'preliminary');
  assert.equal(readMaturity('kvds_hdd.pdf', '125_hardware_design_F').maturity, 'final');
  assert.equal(readMaturity('kvds_hdd.pdf', '125_hardware_design_F').cue_kind, 'task_folder');
  // The file wins over the folder: the folder says what the stage expects to end up with.
  assert.equal(readMaturity('kvds_hdd_draft.pdf', '125_hardware_design_F').maturity, 'preliminary');
  // Nothing stated is unknown, never assumed.
  assert.equal(readMaturity('kvds_hdd.pdf', '125_hardware_design').maturity, null);
  // A word that merely contains a maturity letter is not a maturity claim.
  assert.equal(readMaturity('drawings_index.pdf', null).maturity, null);
});

// ---------------------------------------------------------------- 6. refusals

test('a request is refused rather than repaired', () => {
  const cases = [
    [{ known_at: 'yesterday' }, OBSERVATION_CANDIDATE_ERROR_CODES.REQUEST_INVALID],
    [{ compiled_variants: [] }, OBSERVATION_CANDIDATE_ERROR_CODES.VARIANT_INVALID],
    [{ inventory: [{ ...clone(FIXTURE.request.inventory[0]), sha256: 'not-a-digest' }] },
      OBSERVATION_CANDIDATE_ERROR_CODES.INVENTORY_INVALID],
    // The drive letter is assembled rather than written out: a literal local absolute path in a
    // tracked file is itself a policy violation, and this suite has to stay clean to run.
    [{ inventory: [{ ...clone(FIXTURE.request.inventory[0]), file_ref: `${'D'}:/absolute/path.pdf` }] },
      OBSERVATION_CANDIDATE_ERROR_CODES.INVENTORY_INVALID],
    [{ inventory: [{ ...clone(FIXTURE.request.inventory[0]), file_ref: '/rooted/path.pdf' }] },
      OBSERVATION_CANDIDATE_ERROR_CODES.INVENTORY_INVALID],
    [{ inventory: [{ ...clone(FIXTURE.request.inventory[0]), file_ref: 'stage/../escape.pdf' }] },
      OBSERVATION_CANDIDATE_ERROR_CODES.INVENTORY_INVALID],
    [{ inventory: [clone(FIXTURE.request.inventory[0]), clone(FIXTURE.request.inventory[0])] },
      OBSERVATION_CANDIDATE_ERROR_CODES.INVENTORY_INVALID],
    [{ overlay_aliases: [{ stage_code: '999_NOWHERE', artifact_type_id: 'hdd', alias: 'x' }] },
      OBSERVATION_CANDIDATE_ERROR_CODES.STAGE_CODE_UNKNOWN],
  ];
  for (const [override, code] of cases) {
    assert.throws(() => build(override), (error) => {
      assert.ok(error instanceof ArtifactObservationCandidateError);
      assert.equal(error.code, code);
      return true;
    }, JSON.stringify(Object.keys(override)));
  }
});

test('a refusal carries a field label and not the value that caused it', () => {
  try {
    build({ inventory: [{ ...clone(FIXTURE.request.inventory[0]), sha256: 'secret-looking-value' }] });
    assert.fail('expected a refusal');
  } catch (error) {
    assert.equal(JSON.stringify(error.detail).includes('secret-looking-value'), false);
    assert.equal(error.message.includes('secret-looking-value'), false);
  }
});

test('a gate code the engine does not declare is refused for the whole variant', () => {
  const variant = clone(FIXTURE.request.compiled_variants[0]);
  variant.gates[0].code = 999;
  assert.throws(() => build({ compiled_variants: [variant] }),
    (error) => error.code === OBSERVATION_CANDIDATE_ERROR_CODES.STAGE_CODE_UNKNOWN);
});

// ---------------------------------------------------------------- 7. agreement with the compiler

test('the gate-to-stage map restated here is the one the compiler applies', () => {
  const request = clone(STAGE_RULE_FIXTURE.request);
  const gateCodes = request.compiled_variant.gates.map((gate) => gate.code);
  const stageCodes = gateCodes.map((code) => engineStageCodeForGate(code));
  for (const stageCode of stageCodes) assert.equal(typeof stageCode, 'string');

  request.target_stage_codes = stageCodes;
  const compiled = compileStageRules(request);
  const stageByTaskId = new Map();
  for (const gate of request.compiled_variant.gates) {
    for (const task of gate.tasks) stageByTaskId.set(task.id, engineStageCodeForGate(gate.code));
  }
  let checked = 0;
  for (const row of compiled.mapping_table) {
    if (row.task_id === null || row.task_id === undefined) continue;
    assert.equal(row.stage_code, stageByTaskId.get(row.task_id),
      `task ${row.task_id} lands on a different stage than this module would name`);
    checked += 1;
  }
  assert.ok(checked >= 10, 'the compiled fixture should carry enough rows to be worth comparing');
  assert.equal(engineStageCodeForGate(999), null);
});

// ---------------------------------------------------------------- 8. static effect pin

test('the modules and everything they import read no file, clock, network, or model', () => {
  const FORBIDDEN_TOKENS = [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:dns', 'node:child_process',
    'node:worker_threads', 'node:process', 'node:os', 'node:readline',
    'Date.now', 'new Date', 'Math.random', 'process.env', 'process.argv',
    'process.hrtime', 'performance.now', 'fetch(', 'XMLHttpRequest', 'require(',
  ];
  const ALLOWED_BARE_SPECIFIERS = new Set(['node:crypto']);
  const ENTRIES = [
    './artifact_observation_candidates.mjs',
    './observation_confirmation_sheet.mjs',
    './artifact_observations_from_confirmed.mjs',
  ];

  const seen = new Map();
  const walk = (url) => {
    const href = url.href;
    if (seen.has(href)) return;
    const source = readFileSync(url, 'utf8');
    seen.set(href, source);
    for (const match of source.matchAll(/\bfrom\s+'([^']+)'/gu)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) walk(new URL(specifier, url));
      else assert.ok(ALLOWED_BARE_SPECIFIERS.has(specifier), `unexpected bare import "${specifier}" in ${href}`);
    }
  };
  for (const entry of ENTRIES) walk(new URL(entry, import.meta.url));

  assert.ok(seen.size >= 5, 'the import graph should include the vocabulary and the kernel modules');
  for (const [href, source] of seen) {
    for (const token of FORBIDDEN_TOKENS) {
      assert.equal(source.includes(token), false, `${href} must not contain "${token}"`);
    }
  }
  for (const entry of ENTRIES) {
    const source = seen.get(new URL(entry, import.meta.url).href);
    assert.equal(source.includes('import.meta.main'), false);
    assert.equal(source.includes('process.'), false);
  }
});
