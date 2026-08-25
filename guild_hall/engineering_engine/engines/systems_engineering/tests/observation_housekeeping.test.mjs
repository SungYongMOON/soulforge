import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HOUSEKEEPING_ERROR_CODES,
  HOUSEKEEPING_KINDS,
  OBSERVATION_HOUSEKEEPING_SCHEMA_VERSION,
  ObservationHousekeepingError,
  buildHousekeepingReport,
  renderHousekeepingMarkdown,
} from '../observation/observation_housekeeping.mjs';
import { buildArtifactObservationCandidates } from '../observation/artifact_observation_candidates.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../rules/artifact_vocabulary.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../../../docs/architecture/workspace/examples/se_stage_rules/observation_candidates_synthetic_v0.json',
  import.meta.url,
), 'utf8'));

const clone = (value) => structuredClone(value);

function report(overrides = {}) {
  const result = buildArtifactObservationCandidates({
    ...clone(FIXTURE.request), vocabulary: ARTIFACT_VOCABULARY_V0,
  });
  return buildHousekeepingReport({
    inventory: clone(FIXTURE.request.inventory),
    candidates: result.candidates,
    unmatched: result.unmatched,
    ambiguous: result.ambiguous,
    known_at: FIXTURE.request.known_at,
    ...overrides,
  });
}

const itemsOfKind = (built, kind) => built.items.filter((item) => item.kind === kind);

// ---------------------------------------------------------------- 1. each kind

test('the fixture produces exactly the housekeeping items it states by hand', () => {
  const built = report();
  const expected = FIXTURE.expected.housekeeping;
  assert.equal(built.counts.items, expected.items);
  assert.equal(built.counts.task_folders_seen, expected.task_folders_seen);
  assert.deepEqual(built.counts.by_kind, expected.by_kind);
  assert.equal(built.schema_version, OBSERVATION_HOUSEKEEPING_SCHEMA_VERSION);
  for (const item of built.items) {
    assert.ok(HOUSEKEEPING_KINDS.includes(item.kind), item.kind);
    assert.deepEqual(Object.keys(item).sort(), [
      'artifact_type_id', 'detail', 'files_count', 'gate', 'kind', 'task_folder',
    ]);
    assert.ok(item.files_count >= 1);
  }
});

test('two issues of one artifact in one 03_Out are reported with the chosen file named', () => {
  const item = itemsOfKind(report(), 'duplicate_output')
    .find((row) => row.task_folder === '130_synthetic_drawings');
  assert.ok(item !== undefined);
  assert.equal(item.artifact_type_id, 'drawings');
  assert.equal(item.files_count, 2);
  // The strongest maturity is the one the observation builder would carry, and this report says so.
  assert.match(item.detail, /우선: synthetic_drawings_승인본\.pdf/u);
  assert.match(item.detail, /뒤로 밀림: synthetic_drawings_중간수정본\.pdf/u);
});

test('material filed in the wrong task folder is reported as such, not as a revision', () => {
  const built = report();
  const item = itemsOfKind(built, 'wrong_material')
    .find((row) => row.task_folder === '139_synthetic_cdr_minutes');
  assert.ok(item !== undefined);
  assert.equal(item.artifact_type_id, 'review_minutes_cdr');
  assert.equal(item.files_count, 2);
  assert.match(item.detail, /synthetic_drawings_l3_package\.pdf/u);
  // The same folder must not also be reported as holding two issues of the minutes: a misfiled
  // drawing is not a second version of the minutes.
  assert.equal(itemsOfKind(built, 'duplicate_output')
    .some((row) => row.task_folder === '139_synthetic_cdr_minutes'), false);
});

test('transport packaging left in 03_Out is reported wherever it sits', () => {
  const folders = itemsOfKind(report(), 'transport_package').map((item) => item.task_folder).sort();
  assert.deepEqual(folders, ['139_synthetic_cdr_minutes', '199_synthetic_unmapped_task']);
});

test('interim wording left in 03_Out is reported', () => {
  const [item] = itemsOfKind(report(), 'draft_wording');
  assert.equal(item.task_folder, '130_synthetic_drawings');
  assert.match(item.detail, /중간수정본/u);
});

test('two task folders carrying one artifact in one gate are reported once', () => {
  const items = itemsOfKind(report(), 'duplicate_task_folder');
  assert.equal(items.length, 1);
  assert.equal(items[0].artifact_type_id, 'drawings');
  assert.match(items[0].detail, /130_synthetic_drawings, 156_synthetic_drawings_second/u);
});

test('a document lying in an internal folder does not make that folder a second home for it', () => {
  // A copy of the HDD sits in the inbox and is correctly classified as an HDD. What must not
  // follow is the inbox being read as an HDD folder: it would show up as a duplicate of the real
  // one, and every project has an inbox, a work log and a data-exchange folder in every gate.
  const built = report();
  const duplicates = itemsOfKind(built, 'duplicate_task_folder');
  assert.equal(duplicates.some((item) => item.detail.includes('121_synthetic_inbox')), false);
  assert.equal(built.items.some((item) => item.task_folder === '121_synthetic_inbox'), false);
});

test('an output folder with no files is reported only where an artifact is known', () => {
  const built = report();
  const items = itemsOfKind(built, 'out_folder_empty');
  assert.deepEqual(items.map((item) => item.task_folder), ['141_synthetic_srs']);
  // Stated as a folder fact, never as a missing artifact.
  assert.match(items[0].detail, /결손 판정이 아님/u);
  for (const folder of Object.keys(FIXTURE.expected.housekeeping.deliberately_not_reported)) {
    const taskFolder = folder.split('/')[1];
    assert.equal(built.items.some((item) => item.task_folder === taskFolder), false, folder);
  }
});

// ---------------------------------------------------------------- 2. determinism and boundaries

test('two runs over one walk reach byte-identical items', () => {
  const first = report();
  const second = report({ inventory: [...clone(FIXTURE.request.inventory)].reverse() });
  assert.equal(JSON.stringify(second.items), JSON.stringify(first.items));
  assert.equal(second.receipt.output_digests.items, first.receipt.output_digests.items);
  for (const value of Object.values(first.receipt.effects)) assert.equal(value, 0);
  assert.ok(Object.isFrozen(first.items));
});

test('this report is never an observation and never a judgement', () => {
  const built = report();
  const rendered = JSON.stringify(built);
  // Nothing here carries the vocabulary of the observation path or of the engine's verdicts.
  for (const word of ['presence_state', 'observation_id', 'artifact_revision_ref',
    'gap_missing', 'satisfied', 'requirement_id']) {
    assert.equal(rendered.includes(word), false, word);
  }
  const markdown = renderHousekeepingMarkdown(built);
  assert.match(markdown, /판단이 아니다/u);
  assert.match(markdown, /파일 내용을 열어보지 않는다/u);
  assert.match(markdown, /\| 단계 \| 업무폴더 \| 산출물 \| 종류 \| 내용 \| 파일수 \|/u);
});

test('an empty walk renders a report that says there is nothing to tidy', () => {
  const built = buildHousekeepingReport({
    inventory: [], candidates: [], known_at: FIXTURE.request.known_at,
  });
  assert.deepEqual(built.items, []);
  assert.match(renderHousekeepingMarkdown(built), /정리할 항목 없음/u);
});

test('a file name cannot break out of its table cell', () => {
  const built = report();
  const markdown = renderHousekeepingMarkdown(built);
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| 1') && !line.startsWith('| 0')) continue;
    assert.equal(line.split(' | ').length, 6, line);
  }
});

test('a malformed request is refused rather than repaired', () => {
  const cases = [
    { inventory: 'not-an-array', candidates: [], known_at: 'x' },
    { inventory: [], candidates: [{ no_file_ref: true }], known_at: 'x' },
    { inventory: [], candidates: [], known_at: '' },
    { inventory: [], candidates: [], known_at: 'x', surprise: 1 },
  ];
  for (const request of cases) {
    assert.throws(() => buildHousekeepingReport(request), (error) => {
      assert.ok(error instanceof ObservationHousekeepingError);
      assert.equal(error.code, HOUSEKEEPING_ERROR_CODES.REQUEST_INVALID);
      return true;
    }, JSON.stringify(Object.keys(request)));
  }
});
