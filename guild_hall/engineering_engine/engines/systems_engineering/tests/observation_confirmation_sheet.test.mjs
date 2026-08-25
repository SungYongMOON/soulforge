import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONFIRMATION_SHEET_ERROR_CODES,
  CONFIRMATION_SOURCES,
  ObservationConfirmationError,
  applyConfirmationSheet,
  buildObservationConfirmationSheet,
} from '../observation/observation_confirmation_sheet.mjs';
import { buildArtifactObservationCandidates } from '../observation/artifact_observation_candidates.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../rules/artifact_vocabulary.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../../../docs/architecture/workspace/examples/se_stage_rules/observation_candidates_synthetic_v0.json',
  import.meta.url,
), 'utf8'));

const clone = (value) => structuredClone(value);
const candidates = () => buildArtifactObservationCandidates({
  ...clone(FIXTURE.request), vocabulary: ARTIFACT_VOCABULARY_V0,
}).candidates;

const find = (rows, suffix) => {
  const row = rows.find((candidate) => candidate.file_ref.endsWith(suffix));
  assert.ok(row !== undefined, `no candidate ends with ${suffix}`);
  return row;
};

// ---------------------------------------------------------------- 1. the sheet a person reads

test('the table is Korean, grouped by stage, and marks what confirmed itself', () => {
  const { markdown, sheet } = buildObservationConfirmationSheet({
    candidates: candidates(), known_at: FIXTURE.request.known_at,
  });
  assert.match(markdown, /\| 확인\[ \] \| 파일 \| 산출물 종류\(추정\) \| 단계 \| 성숙도\(추정\) \| 근거 단서 \| 신뢰도 \|/u);
  const perStage = new Map();
  for (const row of candidates()) perStage.set(row.stage_code, (perStage.get(row.stage_code) ?? 0) + 1);
  for (const [stageCode, count] of perStage) {
    assert.ok(markdown.includes(`### ${stageCode} (${count}건)`), `${stageCode} heading`);
  }
  // The stage headings appear in the order the stage codes sort in, not in inventory order.
  assert.ok(markdown.indexOf('## 090_PDR') < markdown.indexOf('## 120_CDR'));
  assert.equal((markdown.match(/\[x\] 자동확정/gu) ?? []).length, FIXTURE.expected.counts.auto_confirmed);
  // Counted in the file section only: the folder table above it has its own tick boxes.
  const fileSection = markdown.slice(markdown.indexOf('## 2. 파일 단위 확인'));
  assert.equal((fileSection.match(/\| \[ \] \|/gu) ?? []).length,
    FIXTURE.expected.counts.needs_owner_confirmation);
  assert.match(markdown, /최종\(F\)/u);
  assert.match(markdown, /미표기/u);

  assert.equal(sheet.rows.length, FIXTURE.expected.counts.candidates);
  for (const row of sheet.rows) assert.equal(row.decision, null);
  assert.equal(sheet.counts.auto_confirmed, FIXTURE.expected.counts.auto_confirmed);
  assert.equal(sheet.known_at, FIXTURE.request.known_at);
  assert.match(sheet.rows_digest, /^[0-9a-f]{64}$/u);
});

test('a file name cannot break out of its table cell', () => {
  const rows = clone(candidates());
  rows[0] = { ...rows[0], file_ref: 'stage/task|with|pipes/`backtick`.pdf' };
  const { markdown } = buildObservationConfirmationSheet({ candidates: rows });
  const line = markdown.split('\n').find((text) => text.includes('with'));
  // Seven cells, so six inner delimiters plus the two edges: a pipe inside a file name would
  // otherwise silently become an eighth column and shift every later cell.
  assert.equal(line.split(' | ').length, 7);
  assert.ok(line.includes('\\|'));
  assert.equal(line.includes('`backtick`'), false);
});

test('an empty candidate set still renders a sheet', () => {
  const { markdown, sheet } = buildObservationConfirmationSheet({ candidates: [] });
  assert.match(markdown, /후보 없음/u);
  assert.deepEqual(sheet.rows, []);
});

test('the sheet is deterministic', () => {
  const first = buildObservationConfirmationSheet({ candidates: candidates() });
  const second = buildObservationConfirmationSheet({ candidates: [...candidates()].reverse() });
  assert.equal(second.markdown, first.markdown);
  assert.equal(second.sheet.rows_digest, first.sheet.rows_digest);
});

// ---------------------------------------------------------------- 2. the return path

test('with no decisions, only the auto-confirmed rows are confirmed and the rest wait', () => {
  const rows = candidates();
  const applied = applyConfirmationSheet(rows, []);
  assert.equal(applied.confirmed.length, FIXTURE.expected.counts.auto_confirmed);
  assert.equal(applied.pending.length, FIXTURE.expected.counts.needs_owner_confirmation);
  assert.equal(applied.rejected.length, 0);
  for (const row of applied.confirmed) {
    assert.equal(row.confirmation, CONFIRMATION_SOURCES.AUTO_OUT_FOLDER);
  }
  for (const value of Object.values(applied.receipt.effects)) assert.equal(value, 0);
});

test('confirm, reject, and reassign each do exactly one thing', () => {
  const rows = candidates();
  const draft = find(rows, 'synthetic_icd_draft.docx');
  const datasheet = find(rows, 'synthetic_vendor_datasheet.pdf');
  const scan = find(rows, 'synthetic_scan_0001.pdf');

  const applied = applyConfirmationSheet(rows, [
    { candidate_id: draft.candidate_id, decision: 'confirm' },
    { candidate_id: datasheet.candidate_id, decision: 'reject', note: 'vendor input, not our design description' },
    { candidate_id: scan.candidate_id, decision: 'reassign', artifact_type_id: 'idd', maturity: 'updated' },
  ]);

  const confirmedById = new Map(applied.confirmed.map((row) => [row.candidate_id, row]));
  assert.equal(confirmedById.get(draft.candidate_id).confirmation, CONFIRMATION_SOURCES.OWNER_CONFIRMED);
  assert.equal(confirmedById.get(draft.candidate_id).artifact_type_id, 'icd');
  assert.equal(confirmedById.get(scan.candidate_id).confirmation, CONFIRMATION_SOURCES.OWNER_REASSIGNED);
  assert.equal(confirmedById.get(scan.candidate_id).artifact_type_id, 'idd');
  assert.equal(confirmedById.get(scan.candidate_id).maturity, 'updated');
  assert.equal(confirmedById.has(datasheet.candidate_id), false);
  assert.equal(applied.rejected[0].candidate_id, datasheet.candidate_id);
  assert.equal(applied.receipt.counts.confirmed_owner, 2);
  assert.equal(applied.receipt.counts.confirmed_auto, FIXTURE.expected.counts.auto_confirmed);
});

test('a decision may overturn an auto-confirmation', () => {
  const rows = candidates();
  const auto = find(rows, '125_synthetic_hdd_F/03_Out/synthetic_hdd_final.pdf');
  assert.equal(auto.auto_confirmed, true);
  const applied = applyConfirmationSheet(rows, [{ candidate_id: auto.candidate_id, decision: 'reject' }]);
  assert.equal(applied.confirmed.some((row) => row.candidate_id === auto.candidate_id), false);
  assert.equal(applied.rejected[0].candidate_id, auto.candidate_id);
});

test('a decision this candidate set cannot carry is refused', () => {
  const rows = candidates();
  const first = rows[0];
  const cases = [
    [[{ candidate_id: 'not-a-candidate', decision: 'confirm' }], 'unknown candidate'],
    [[{ candidate_id: first.candidate_id, decision: 'confirm' },
      { candidate_id: first.candidate_id, decision: 'reject' }], 'two decisions for one candidate'],
    [[{ candidate_id: first.candidate_id, decision: 'maybe' }], 'undeclared decision'],
    [[{ candidate_id: first.candidate_id, decision: 'reassign' }], 'reassignment with no type'],
    [[{ candidate_id: first.candidate_id, decision: 'reassign', artifact_type_id: 'not_a_token' }],
      'reassignment to an unknown type'],
    [[{ candidate_id: first.candidate_id, decision: 'confirm', artifact_type_id: 'hdd' }],
      'a plain confirmation may not rename'],
    [[{ candidate_id: first.candidate_id, decision: 'confirm', maturity: 'shipped' }],
      'undeclared maturity'],
    [[{ candidate_id: first.candidate_id, decision: 'confirm', reason: 'because' }],
      'undeclared field'],
  ];
  for (const [decisions, label] of cases) {
    assert.throws(() => applyConfirmationSheet(rows, decisions), (error) => {
      assert.ok(error instanceof ObservationConfirmationError);
      assert.equal(error.code, CONFIRMATION_SHEET_ERROR_CODES.DECISION_INVALID);
      return true;
    }, label);
  }
});

// ---------------------------------------------------------------- 3. folder-level confirmation

test('the sheet offers a folder table first, for folders that resolve to one artifact', () => {
  const { markdown, sheet } = buildObservationConfirmationSheet({
    candidates: candidates(), known_at: FIXTURE.request.known_at,
  });
  assert.ok(markdown.indexOf('## 1. 업무폴더 단위 확인') < markdown.indexOf('## 2. 파일 단위 확인'));
  assert.match(markdown, /\| 단계 \| 업무폴더 \| 산출물 \| 후보 수 \| 03_Out 파일 수 \| 확인\[ \] \|/u);

  assert.ok(sheet.folders.length >= 5);
  assert.equal(sheet.counts.decidable_task_folders, sheet.folders.length);
  for (const folder of sheet.folders) {
    assert.equal(folder.decision, null);
    assert.equal(folder.task_folder_ref, `${folder.stage_code}/${folder.task_folder}`);
    assert.ok(folder.candidate_count >= 1);
    assert.ok(folder.out_file_count <= folder.candidate_count + folder.out_file_count);
  }
  // The inbox holds a classified document but is nobody's output folder, so it is not offered.
  assert.equal(sheet.folders.some((folder) => folder.task_folder === '121_synthetic_inbox'), false);
  assert.match(sheet.folders_digest, /^[0-9a-f]{64}$/u);
});

test('the real 03_Out file count is used when the walk is handed over', () => {
  const withWalk = buildObservationConfirmationSheet({
    candidates: candidates(), inventory: clone(FIXTURE.request.inventory),
  });
  const minutes = withWalk.sheet.folders.find((row) => row.task_folder === '139_synthetic_cdr_minutes');
  assert.equal(minutes.out_file_count, 3);
});

test('one folder tick confirms that folder\'s output files and nothing else', () => {
  const rows = candidates();
  const applied = applyConfirmationSheet(rows, [
    { task_folder_ref: '120_CDR/139_synthetic_cdr_minutes', decision: 'confirm_folder' },
  ]);
  const expected = FIXTURE.expected.folder_confirmed_run;
  assert.equal(applied.receipt.counts.folder_decisions, 1);
  // Every 03_Out file of that folder, the automatically confirmed one included: a person
  // deciding the folder outranks the rule that decided one of its files.
  assert.equal(applied.receipt.counts.confirmed_by_folder, expected.confirmed_by_folder);
  assert.equal(applied.receipt.counts.confirmed_auto, FIXTURE.expected.counts.auto_confirmed - 1);

  const confirmedRefs = new Set(applied.confirmed.map((row) => row.file_ref));
  // The two files the tightened rule withheld are now confirmed by the folder tick.
  assert.ok(confirmedRefs.has('120_CDR/139_synthetic_cdr_minutes/03_Out/synthetic_drawings_l3_package.pdf'));
  assert.ok(confirmedRefs.has('120_CDR/139_synthetic_cdr_minutes/03_Out/synthetic_submitted_set_01of03.zip'));
  for (const row of applied.confirmed) {
    if (!row.file_ref.startsWith('120_CDR/139_synthetic_cdr_minutes/')) continue;
    assert.equal(row.artifact_type_id, 'review_minutes_cdr');
  }
  // Working material in a folder is not a claim about what was produced, so a folder tick does
  // not reach it: the ICD draft in 129's 01_Work stays pending.
  assert.equal(confirmedRefs.has('120_CDR/129_synthetic_icd_F/01_Work/synthetic_icd_draft.docx'), false);
});

test('a folder tick may reassign, may reject, and yields to a per-file decision', () => {
  const rows = candidates();
  const drawing = find(rows, '156_synthetic_drawings_second/03_Out/synthetic_drawings_index.pdf');

  const reassigned = applyConfirmationSheet(rows, [
    { task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'confirm_folder', artifact_type_id: 'icd' },
  ]);
  for (const row of reassigned.confirmed) {
    if (!row.file_ref.startsWith('120_CDR/156_synthetic_drawings_second/')) continue;
    assert.equal(row.artifact_type_id, 'icd');
    assert.equal(row.confirmation, CONFIRMATION_SOURCES.OWNER_FOLDER_REASSIGNED);
  }

  const rejected = applyConfirmationSheet(rows, [
    { task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'reject_folder' },
  ]);
  assert.ok(rejected.rejected.some((row) => row.candidate_id === drawing.candidate_id));

  // The file decision wins over the folder decision covering it.
  const both = applyConfirmationSheet(rows, [
    { task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'reject_folder' },
    { candidate_id: drawing.candidate_id, decision: 'confirm' },
  ]);
  const kept = both.confirmed.find((row) => row.candidate_id === drawing.candidate_id);
  assert.equal(kept.confirmation, CONFIRMATION_SOURCES.OWNER_CONFIRMED);
  assert.equal(both.rejected.some((row) => row.candidate_id === drawing.candidate_id), false);
});

test('a folder decision this sheet does not offer is refused', () => {
  const rows = candidates();
  const cases = [
    [{ task_folder_ref: '120_CDR/999_not_a_folder', decision: 'confirm_folder' }, 'unknown folder'],
    [{ task_folder_ref: '120_CDR/121_synthetic_inbox', decision: 'confirm_folder' }, 'folder not offered'],
    [{ task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'confirm' }, 'file decision word'],
    [{ task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'reject_folder', artifact_type_id: 'icd' },
      'only a confirmation may rename'],
    [{ task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'confirm_folder', artifact_type_id: 'nope' },
      'unknown artifact type'],
    [{ task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'confirm_folder', maturity: 'final' },
      'undeclared field'],
  ];
  for (const [decision, label] of cases) {
    assert.throws(() => applyConfirmationSheet(rows, [decision]),
      (error) => error.code === CONFIRMATION_SHEET_ERROR_CODES.DECISION_INVALID, label);
  }
  assert.throws(() => applyConfirmationSheet(rows, [
    { task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'confirm_folder' },
    { task_folder_ref: '120_CDR/156_synthetic_drawings_second', decision: 'reject_folder' },
  ]), (error) => error.code === CONFIRMATION_SHEET_ERROR_CODES.DECISION_INVALID);
});

test('one candidate id may not appear twice in the candidate set', () => {
  const rows = candidates();
  assert.throws(() => applyConfirmationSheet([rows[0], rows[0]], []),
    (error) => error.code === CONFIRMATION_SHEET_ERROR_CODES.CANDIDATE_INVALID);
});
