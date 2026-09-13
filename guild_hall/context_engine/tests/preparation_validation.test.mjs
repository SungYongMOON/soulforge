// Preparation run records and their independent validation, over the real mail
// adapter and real files. Tampering is applied to the prepared result the way a
// later reader would see it, so the checks are exercised against actual output
// rather than hand-built objects.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA } from '../src/runtime/source_documents.mjs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';
import { PREPARATION_RUN_SCHEMA, PREPARER_ID, PREPARER_VERSION, buildPreparationRun, codeInventoryConsistent,
  documentsDigest, inspectPreparerCode, preparationRulesDigest } from '../src/runtime/preparation_run.mjs';
// buildPreparationRun is reached through the module, never through app.mjs: these
// tests use it only to construct records a caller could not obtain legitimately.
import { CHECK_IDS, CHECK_POLICY_ID, VALIDATION_REPORT_SCHEMA, VALIDATOR_ID, VALIDATOR_VERSION,
  inspectValidatorCode, reportCovers, validatePreparationRun } from '../src/runtime/preparation_validation.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const STARTED = '2026-09-12T00:00:00.000Z';
const ENDED = '2026-09-12T00:00:01.000Z';
const MAIL_FILE = ['acme', 'mail', 'events', 'gmail', '2026', '09.jsonl'];
const ROOT_REF = 'mail.synthetic';
const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const item = (item_id, extra = {}) => ({ item_id, revision_policy: 'latest_in_custody', revision_sha256: null,
  data_class: 'public_synthetic', path: MAIL_FILE, ...extra });
const grantFor = (items, overrides = {}) => ({ schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.mail',
  project_ref: ref(1), purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
  valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
  sources: [{ kind: 'mail', root_ref: ROOT_REF, items }], ...overrides });

const mailRow = (event_id, subject, body_text, extra = {}) => ({ schema_version: 'email.fetch.event.v1', event_id,
  source: 'gmail', provider_message_id: `pm-${event_id}`, thread_id: 'thread-syn-1', subject,
  from: [{ name: '요청자', address: 'requester@example.invalid' }], to: [{ name: '담당자', address: 'owner@example.invalid' }],
  cc: [], received_at: '2026-09-10T00:00:00.000Z', body_text, body_html: null, attachments: [],
  ingested_at: '2026-09-10T00:05:00.000Z', ingest_status: 'ok', raw: null, metadata: null, ...extra });

async function mailRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-prep-run-'));
  const file = path.join(root, ...MAIL_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  const rows = [
    mailRow('gmail-0001', '합성 요청: 시험 장비 A 설계 검토', '설계 검토 의견을 금요일까지 주세요.',
      { attachments: [{ type: 'file', name: 'spec-a.pdf', mime: 'application/pdf', size: 1024, content_sha256: sha('spec-a') }] }),
    mailRow('gmail-0002', 'Re: 합성 요청', '확인했습니다. 수요일에 공유하겠습니다.',
      { received_at: '2026-09-10T03:00:00.000Z' }),
  ];
  await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  return root;
}

// One prepared result plus its run record, the shape every case below starts from.
async function preparedRun(grant = grantFor([item('gmail-0001'), item('gmail-0002')])) {
  const root = await mailRoot();
  // The preparer emits its own record; the caller never mints one.
  const preparation = await prepareSourceDocuments({ grant, roots: { [ROOT_REF]: root }, now: NOW,
    runId: 'prep-0001', clock: fixedClock() });
  const { run, ...rest } = preparation;
  return { grant, preparation: rest, run, root };
}
// Two ticks: one for the observed start, one for the observed end.
function fixedClock() {
  const ticks = [new Date(STARTED), new Date(ENDED)];
  return () => ticks.length > 1 ? ticks.shift() : ticks[0];
}

const validate = ({ run, preparation, grant }, overrides = {}) => validatePreparationRun({ run, preparation, grant,
  validationRunId: 'val-0001', checkedAt: '2026-09-12T01:00:00.000Z', ...overrides });
const outcomes = report => Object.fromEntries(report.checks.map(check => [check.check_id, check.outcome]));
const codes = (report, check_id) => report.checks.find(check => check.check_id === check_id).findings.map(finding => finding.code);

// Rebuilds a preparation with one document replaced, the way a later reader sees
// stored bytes; the run record is left exactly as the preparer wrote it.
function withDocuments(preparation, documents) {
  return { grant: preparation.grant, documents, coverage: preparation.coverage, changes: preparation.changes };
}
const editDocument = (document, patch) => ({ ...document, ...patch });

test('a preparation run records its preparer, code, rules, grant and exact result', async () => {
  const { preparation, run } = await preparedRun();
  assert.equal(run.schema_version, PREPARATION_RUN_SCHEMA);
  assert.equal(run.preparer_id, PREPARER_ID);
  assert.equal(run.preparer_version, PREPARER_VERSION);
  assert.equal(run.preparation_run_id, 'prep-0001');
  assert.equal(run.preparer_code_digest, inspectPreparerCode().code_digest);
  assert.equal(run.preparation_rules_digest, preparationRulesDigest());
  assert.equal(run.coverage_sha256, preparation.coverage.coverage_sha256);
  assert.equal(run.documents_sha256, documentsDigest(preparation.documents));
  assert.equal(run.document_count, 2);
  assert.equal(run.started_at, STARTED);
  assert.equal(run.ended_at, ENDED);
  // The refs are the computed preparing closure, so they reach outside this
  // module to whatever actually produces prepared bytes.
  assert.equal(run.preparer_code_refs.length, 16);
  assert.ok(run.preparer_code_refs.every(row => row.ref.startsWith('guild_hall/')
    && /^sha256:[0-9a-f]{64}$/u.test(row.sha256)));
  assert.ok(codeInventoryConsistent({ code_refs: run.preparer_code_refs, code_digest: run.preparer_code_digest }));
  assert.ok(Object.isFrozen(run) && Object.isFrozen(run.preparer_code_refs));
});

test('an untouched preparation passes every check and the report pins exactly that run', async () => {
  const prepared = await preparedRun();
  const report = validate(prepared);
  assert.equal(report.schema_version, VALIDATION_REPORT_SCHEMA);
  assert.equal(report.validator_id, VALIDATOR_ID);
  assert.equal(report.validator_version, VALIDATOR_VERSION);
  assert.equal(report.check_policy, CHECK_POLICY_ID);
  assert.deepEqual(report.policy_checks, [...CHECK_IDS]);
  assert.equal(report.outcome, 'pass');
  assert.deepEqual(new Set(report.checks.map(check => check.outcome)), new Set(['pass']));
  assert.equal(report.validated_run_sha256, prepared.run.run_sha256);
  // Observed values are what the validator computed, and here they agree.
  assert.equal(report.observed_grant_sha256, prepared.run.grant_sha256);
  assert.equal(report.observed_documents_sha256, prepared.run.documents_sha256);
  assert.equal(report.observed_coverage_sha256, prepared.run.coverage_sha256);
  assert.ok(reportCovers(report, prepared.run));
  // Scope is stated, not implied: the locator check saw every unit.
  const locators = report.checks.find(check => check.check_id === 'unit_locators');
  assert.equal(locators.scope.checked, prepared.preparation.documents.reduce((sum, doc) => sum + doc.units.length, 0));
  assert.ok(locators.scope.checked > 0);
});

test('tampered document text fails identity while the run record stays as written', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  const units = first.units.map((unit, index) => index === 1 ? { ...unit, text: '금요일이 아니라 다음 달까지입니다.' } : unit);
  const tampered = withDocuments(prepared.preparation, [editDocument(first, { units }), ...rest]);
  const report = validate({ ...prepared, preparation: tampered });
  assert.equal(report.outcome, 'fail');
  assert.deepEqual(codes(report, 'document_identity'), ['document_identity_mismatch']);
  // The document is bound whole, so the run record notices as well.
  assert.deepEqual(codes(report, 'run_output_binding'), ['run_documents_digest_mismatch']);
  assert.equal(outcomes(report).run_record_integrity, 'pass');
  // Findings name the document, never the text that was changed.
  const finding = report.checks.find(check => check.check_id === 'document_identity').findings[0];
  assert.deepEqual(Object.keys(finding).sort(), ['code', 'doc_key']);
});

test('a rewritten document that also restates its digests still fails the run binding', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  // A forger who recomputes the document's own identity still cannot match the
  // documents digest the run record fixed at preparation time.
  const units = first.units.map((unit, index) => index === 1 ? { ...unit, text: '다음 달까지입니다.' } : unit);
  const reforged = editDocument(first, { units, text_sha256: sha('forged') });
  const report = validate({ ...prepared, preparation: withDocuments(prepared.preparation, [reforged, ...rest]) });
  assert.equal(report.outcome, 'fail');
  assert.ok(codes(report, 'run_output_binding').includes('run_documents_digest_mismatch'));
});

test('a wrong locator is caught even though it leaves the document identity intact', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  // doc_key and text_sha256 cover fields and unit text, not locators, so this
  // edit is invisible to identity and must be caught by the locator check.
  const units = first.units.map((unit, index) => index === 0
    ? { ...unit, locator: { ...unit.locator, event_sha256: sha('some other event') } } : unit);
  const moved = first.units.map((unit, index) => index === 1
    ? { ...unit, locator: { ...unit.locator, path: ['acme', 'mail', 'events', 'gmail', '2026', '08.jsonl'] } } : unit);
  const citesUnheld = validate({ ...prepared, preparation: withDocuments(prepared.preparation, [editDocument(first, { units }), ...rest]) });
  assert.equal(outcomes(citesUnheld).document_identity, 'pass');
  assert.equal(citesUnheld.outcome, 'fail');
  assert.deepEqual(codes(citesUnheld, 'unit_locators'), ['locator_cites_unheld_revision']);
  const wrongPath = validate({ ...prepared, preparation: withDocuments(prepared.preparation, [editDocument(first, { units: moved }), ...rest]) });
  assert.deepEqual(codes(wrongPath, 'unit_locators'), ['locator_path_not_granted']);
});

test('preparing beyond the grant is caught as a missing condition', async () => {
  const prepared = await preparedRun();
  // The same prepared bytes checked against a grant that no longer covers the
  // second mail: both the coverage row and the document are reported.
  const narrowed = grantFor([item('gmail-0001')]);
  const report = validate({ ...prepared, grant: narrowed });
  assert.equal(report.outcome, 'fail');
  const found = codes(report, 'grant_conditions');
  assert.ok(found.includes('coverage_item_not_granted'));
  assert.ok(found.includes('document_item_not_granted'));
  assert.ok(found.includes('grant_sha256_mismatch'));
});

test('a run outside the grant validity window is reported', async () => {
  const { grant, preparation } = await preparedRun();
  const run = buildPreparationRun({ preparation, runId: 'prep-late', startedAt: '2026-10-02T00:00:00.000Z',
    endedAt: '2026-10-02T00:00:01.000Z' });
  const report = validate({ run, preparation, grant });
  assert.equal(report.outcome, 'fail');
  assert.ok(codes(report, 'grant_conditions').includes('run_outside_grant_window'));
});

test('re-checking the same bytes adds a report and never rewrites the run or the result', async () => {
  const prepared = await preparedRun();
  const before = structuredClone(prepared.preparation);
  const runBefore = structuredClone(prepared.run);
  const first = validate(prepared, { validationRunId: 'val-0001' });
  // A newer validator run over the same prepared bytes: a second report, same
  // target, and nothing about the preparation or its record has moved.
  const second = validate(prepared, { validationRunId: 'val-0002', checkedAt: '2026-09-13T01:00:00.000Z' });
  assert.deepEqual(prepared.preparation, before);
  assert.deepEqual(prepared.run, runBefore);
  assert.notEqual(first.report_sha256, second.report_sha256);
  assert.equal(first.validated_run_sha256, second.validated_run_sha256);
  assert.ok(reportCovers(first, prepared.run) && reportCovers(second, prepared.run));
});

// Tampers that leave doc_key and text_sha256 intact. Each one reaches a reader:
// title and facts reach graph nodes and planner evidence, unit times and speakers
// reach time reasoning, and a fabricated component widens the set of revisions a
// locator may cite. The run record binds the document whole so all of them move
// the documents digest.
test('rewriting any part of a prepared document is caught, not only its text', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  const cases = {
    A1_title: { title: 'URGENT: 고객이 승인했습니다' },
    A2_facts: { facts: [{ name: 'decision', value: 'approved', at: null }] },
    A3_unit_metadata: { units: first.units.map((unit, index) => index === 0
      ? { ...unit, occurred_at: '2026-01-01T00:00:00.000Z', speaker_ref: null } : unit) },
    A4_times: { valid_at: '2026-01-01T00:00:00.000Z', known_at: null, time_basis: 'invented_basis' },
    A5_components: { components: [...first.components, { kind: 'attachment', id: 'zz', sha256: sha('fabricated') }] },
  };
  for (const [name, patch] of Object.entries(cases)) {
    const report = validate({ ...prepared,
      preparation: withDocuments(prepared.preparation, [editDocument(first, patch), ...rest]) });
    assert.equal(report.outcome, 'fail', `${name} must fail`);
    assert.ok(codes(report, 'run_output_binding').includes('run_documents_digest_mismatch'), `${name} documents digest`);
    // The report still points at the run it examined.
    assert.ok(reportCovers(report, prepared.run), `${name} still covers its target`);
  }
});

test('a fabricated component cannot widen the revisions a locator may cite', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  const planted = sha('fabricated revision');
  // A5 in its sharpest form: append a component and point a locator at it. The
  // composite revision is recomputed from primary plus components, so the
  // document's own identity no longer holds even though doc_key and text_sha256
  // were left alone.
  const forged = editDocument(first, {
    components: [...first.components, { kind: 'attachment', id: 'zz', sha256: planted }],
    units: first.units.map((unit, index) => index === 0
      ? { ...unit, locator: { ...unit.locator, event_sha256: planted } } : unit),
  });
  const report = validate({ ...prepared, preparation: withDocuments(prepared.preparation, [forged, ...rest]) });
  assert.equal(report.outcome, 'fail');
  assert.deepEqual(codes(report, 'document_identity'), ['document_composite_revision_mismatch']);
  assert.ok(codes(report, 'run_output_binding').includes('run_documents_digest_mismatch'));
});

test('a malformed document is reported as a finding rather than thrown', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  // Shapes that make the key builder refuse outright. A tamper must not be able
  // to prevent a FAIL report from existing by breaking the shape.
  for (const patch of [{ root_ref: 'mail/synthetic' }, { project_key: null },
    { adapter_profile: 'not a token' }, { scope: { start_seconds: 9, end_seconds: 1 } }]) {
    const report = validate({ ...prepared,
      preparation: withDocuments(prepared.preparation, [editDocument(first, patch), ...rest]) });
    assert.equal(report.outcome, 'fail');
    assert.deepEqual(codes(report, 'document_identity'), ['document_malformed']);
  }
});

test('a record cannot carry a true code digest beside a fabricated file list', async () => {
  const prepared = await preparedRun();
  const real = inspectPreparerCode();
  const lying = { ...prepared.run, preparer_code_refs: [{ ref: 'guild_hall/only_this.mjs', sha256: sha('x') }] };
  const report = validate({ ...prepared, run: lying });
  assert.equal(report.outcome, 'fail');
  assert.ok(codes(report, 'run_record_integrity').includes('preparer_code_inventory_inconsistent'));
  // The honest inventory is self-consistent and covers the real preparing closure,
  // including the modules outside this one that produce prepared bytes.
  assert.ok(codeInventoryConsistent(real));
  const refs = real.code_refs.map(row => row.ref);
  for (const required of ['guild_hall/gateway/mail_body_excerpt.mjs',
    'guild_hall/shared/project_history_envelope.mjs', 'guild_hall/engineering_engine/kernel/identity.mjs',
    'guild_hall/context_engine/src/runtime/source_preparation.mjs']) assert.ok(refs.includes(required), required);
});

test('the validator pins its own bytes too', async () => {
  const prepared = await preparedRun();
  const report = validate(prepared);
  const code = inspectValidatorCode();
  assert.ok(codeInventoryConsistent(code));
  assert.equal(report.validator_code_digest, code.code_digest);
  assert.notEqual(report.validator_code_digest, prepared.run.preparer_code_digest);
  // Precedence between two reports over one run is stated as a limit, not decided,
  // and the report says in its own body that the record is unsigned. The count is
  // asserted so a limit cannot be added without the README's list moving too.
  assert.equal(report.limits.length, 7);
  assert.ok(report.limits.some(limit => limit.includes('does not order two reports')));
  assert.ok(report.limits.some(limit => limit.includes('not a signature')));
  assert.ok(report.limits.some(limit => limit.includes('Document order is not bound')));
});

test('the record comes from preparing, so a caller cannot mint one for its own documents', async () => {
  const prepared = await preparedRun();
  // The supported surface offers no record builder: a record exists only as the
  // preparer's own output, alongside the documents that call produced.
  const app = await import('../src/app.mjs');
  assert.equal(app.buildPreparationRun, undefined);
  assert.equal(typeof app.prepareSourceDocuments, 'function');
  // Preparing without a run id yields no record at all, so a record is never
  // implied by holding a result.
  const plain = await prepareSourceDocuments({ grant: prepared.grant, roots: { [ROOT_REF]: prepared.root }, now: NOW });
  assert.equal(plain.run, null);
  assert.equal(plain.run_unavailable, 'record_not_requested');
  assert.equal(plain.documents.length, prepared.preparation.documents.length);
  // Same inputs, same emitted record: the record is a function of the run, not of
  // when someone got around to describing it.
  const again = await prepareSourceDocuments({ grant: prepared.grant, roots: { [ROOT_REF]: prepared.root }, now: NOW,
    runId: 'prep-0001', clock: fixedClock() });
  assert.equal(again.run.run_sha256, prepared.run.run_sha256);
});

test('a locator stripped of its anchor is a finding, not a silent pass', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  // Deleting the cited revision leaves nothing for "is everything cited held?" to
  // object to; the unit must still say where it came from.
  const units = first.units.map((unit, index) => index === 0
    ? { ...unit, locator: { event_id: unit.locator.event_id, path: unit.locator.path, part: unit.locator.part } } : unit);
  const report = validate({ ...prepared,
    preparation: withDocuments(prepared.preparation, [editDocument(first, { units }), ...rest]) });
  assert.equal(report.outcome, 'fail');
  assert.deepEqual(codes(report, 'unit_locators'), ['locator_anchors_no_revision']);
  const stripped = first.units.map((unit, index) => index === 0
    ? { ...unit, locator: { event_id: unit.locator.event_id, event_sha256: unit.locator.event_sha256, part: unit.locator.part } } : unit);
  const noPath = validate({ ...prepared,
    preparation: withDocuments(prepared.preparation, [editDocument(first, { units: stripped }), ...rest]) });
  assert.deepEqual(codes(noPath, 'unit_locators'), ['locator_path_missing']);
});

test('a kind that anchors by path is path-checked, and the rule that does not apply is a limit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-prep-doc-'));
  await writeFile(path.join(root, 'memo.md'), '# 설계 메모\n\n첫 문단입니다.\n\n두 번째 문단입니다.\n');
  const grant = { schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.document', project_ref: ref(1),
    purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
    valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
    sources: [{ kind: 'document', root_ref: 'doc.synthetic', items: [{ item_id: 'memo', revision_policy: 'latest_in_custody',
      revision_sha256: null, data_class: 'public_synthetic', path: ['memo.md'] }] }] };
  const preparation = await prepareSourceDocuments({ grant, roots: { 'doc.synthetic': root }, now: NOW,
    runId: 'prep-doc-1', clock: fixedClock() });
  const { run, ...rest } = preparation;
  const report = validatePreparationRun({ run, preparation: rest, grant, validationRunId: 'val-doc-1',
    checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(report.outcome, 'pass');
  const check = report.checks.find(row => row.check_id === 'unit_locators');
  // The path rule applies to every document unit, so they are counted as checked;
  // the rule that does not apply to this kind is named as a limit instead.
  assert.ok(check.scope.total > 0);
  assert.equal(check.scope.checked, check.scope.total);
  assert.deepEqual(check.limits,
    ['document locators anchor by path and line range, not by revision; their units are not revision-checked']);
  // The path anchor is still required and still checked.
  const [doc] = rest.documents;
  const moved = doc.units.map((unit, index) => index === 0 ? { ...unit, locator: { ...unit.locator, path: ['other.md'] } } : unit);
  const wrong = validatePreparationRun({ run, preparation: withDocuments(rest, [editDocument(doc, { units: moved })]),
    grant, validationRunId: 'val-doc-2', checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.ok(codes(wrong, 'unit_locators').includes('locator_path_not_granted'));
});

test('a record claiming that nothing prepared it is refused, not merely stale', async () => {
  assert.equal(codeInventoryConsistent({ code_refs: [], code_digest: sha256Canonical([]) }), false);
  const prepared = await preparedRun();
  const empty = { ...prepared.run, preparer_code_refs: [], preparer_code_digest: sha256Canonical([]) };
  const report = validate({ ...prepared, run: empty });
  assert.equal(report.outcome, 'fail');
  assert.ok(codes(report, 'run_record_integrity').includes('preparer_code_inventory_inconsistent'));
});

test('the preparer import walker stays in step with the release closure it mirrors', async () => {
  // preparation_run.mjs deliberately does not import release/closure.mjs: that is
  // release tooling, and importing it would pull the release surface into the
  // preparer's own digest. The duplication is the price, so it is guarded here
  // rather than left to whoever edits one of the two next.
  const read = async ref => readFile(new URL(ref, import.meta.url), 'utf8');
  const between = (text, open, close) => {
    const from = text.indexOf(open);
    assert.notEqual(from, -1, `marker not found: ${open}`);
    const to = text.indexOf(close, from + open.length);
    assert.notEqual(to, -1, `terminator not found: ${close}`);
    return text.slice(from + open.length, to).replace(/\s+/gu, '');
  };
  const runtime = between(await read('../src/runtime/preparation_run.mjs'),
    'const IMPORT_PATTERNS = Object.freeze([', ']);');
  const release = between(await read('../release/closure.mjs'), 'for(const pattern of [', ']){');
  assert.equal(runtime.split('/gu,').length, 3, 'three import forms');
  assert.equal(runtime, release, 'the two import walkers must recognise the same specifiers');
});

test('the change set and the grant summary travel bound to the record', async () => {
  const prepared = await preparedRun();
  // A reader holds an incomplete source set by looking at changes.unavailable, so
  // an unbound change set could turn incomplete into complete. This fixture
  // prepares cleanly, so the telling edit is the reverse: claim nothing was added.
  assert.equal(prepared.preparation.changes.added.length, 2);
  const rewritten = { ...prepared.preparation,
    changes: { ...prepared.preparation.changes, added: [] } };
  const report = validate({ ...prepared, preparation: rewritten });
  assert.equal(report.outcome, 'fail');
  assert.ok(codes(report, 'run_output_binding').includes('run_changes_digest_mismatch'));
  const foreign = { ...prepared.preparation,
    grant: { grant_id: 'someone-elses-grant', grant_sha256: sha('x'), project_key: 'nope' } };
  const swapped = validate({ ...prepared, preparation: foreign });
  assert.ok(codes(swapped, 'run_output_binding').includes('result_grant_summary_mismatch'));
  assert.equal(prepared.run.previous_coverage_sha256, null);
});

test('without an admissible grant the locator check reports not run, not findings', async () => {
  const prepared = await preparedRun();
  const report = validate({ ...prepared, grant: { schema_version: 'wrong' } });
  assert.equal(outcomes(report).unit_locators, 'not_run');
  assert.deepEqual(codes(report, 'unit_locators'), []);
  assert.deepEqual(codes(report, 'grant_conditions'), ['grant_invalid']);
  const check = report.checks.find(row => row.check_id === 'unit_locators');
  assert.equal(check.scope.checked, 0);
  assert.ok(check.scope.total > 0);
});

test('a version claim that contradicts this tree\'s proven bytes is caught', async () => {
  const prepared = await preparedRun();
  // The code digest already proves these are this tree's bytes, and this tree
  // declares one version, so another version beside it is self-contradictory.
  const lying = { ...prepared.run, preparer_version: '9.9.9' };
  const report = validate({ ...prepared, run: lying });
  assert.equal(report.outcome, 'fail');
  assert.deepEqual(codes(report, 'preparer_code_reproducible'), ['preparer_version_contradicts_code_digest']);
  // A record from other bytes may of course declare another version.
  const otherRefs = [{ ref: 'guild_hall/context_engine/src/runtime/source_preparation.mjs', sha256: sha('other build') }];
  const foreign = buildPreparationRun({ preparation: prepared.preparation, runId: 'prep-0001', startedAt: STARTED,
    endedAt: ENDED, code: { code_refs: otherRefs, code_digest: sha256Canonical(otherRefs) } });
  const elsewhere = validate({ ...prepared, run: foreign });
  assert.equal(outcomes(elsewhere).preparer_code_reproducible, 'partial');
});

// The canonical hash refuses non-NFC strings and unsafe-integer numbers. A tamper
// of that shape must not be able to stop the report from existing: if it threw,
// making a tamper malformed would be the way to ensure no FAIL is ever recorded.
test('a value the canonical hash refuses becomes a finding, never an exception', async () => {
  const prepared = await preparedRun();
  const nfd = '검토'.normalize('NFD');
  const [first, ...rest] = prepared.preparation.documents;
  const withCoverage = coverage => ({ ...prepared.preparation, coverage });
  const cases = {
    C1_coverage_code_non_nfc: () => validate({ ...prepared, preparation: withCoverage({ ...prepared.preparation.coverage,
      items: prepared.preparation.coverage.items.map((row, index) => index === 0 ? { ...row, code: nfd } : row) }) }),
    C2_coverage_counts_fraction: () => validate({ ...prepared, preparation: withCoverage({
      ...prepared.preparation.coverage, counts: { ...prepared.preparation.coverage.counts, prepared: 1.5 } }) }),
    C3_run_count_fraction: () => validate({ ...prepared, run: { ...prepared.run, document_count: 1.5 } }),
    C4_run_grant_id_non_nfc: () => validate({ ...prepared, run: { ...prepared.run, grant_id: nfd } }),
    C5_document_scope_fraction: () => validate({ ...prepared, preparation: withDocuments(prepared.preparation,
      [editDocument(first, { scope: { start_seconds: 0.5, end_seconds: 9.5 } }), ...rest]) }),
    C6_locator_path_non_nfc: () => validate({ ...prepared, preparation: withDocuments(prepared.preparation,
      [editDocument(first, { units: first.units.map((unit, index) => index === 0
        ? { ...unit, locator: { ...unit.locator, path: [nfd] } } : unit) }), ...rest]) }),
    C7_changes_fraction: () => validate({ ...prepared, preparation: { ...prepared.preparation,
      changes: { ...prepared.preparation.changes, unavailable: [{ weight: 1.5 }] } } }),
  };
  for (const [name, run] of Object.entries(cases)) {
    let report;
    assert.doesNotThrow(() => { report = run(); }, `${name} must report, not throw`);
    assert.equal(report.outcome, 'fail', name);
    assert.ok(report.checks.some(check => check.findings.length > 0), `${name} names what it found`);
  }
});

test('no value a reader hands in can end the report instead of appearing in it', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  const surrogate = '검토\ud83d';
  const nfdKey = '검토'.normalize('NFD');
  const withCoverage = coverage => ({ ...prepared.preparation, coverage });
  const items = prepared.preparation.coverage.items;
  const cases = {
    T2_scope_negative_zero: () => validate({ ...prepared, preparation: withDocuments(prepared.preparation,
      [editDocument(first, { scope: { start_seconds: -0, end_seconds: 9 } }), ...rest]) }),
    T3_run_string_lone_surrogate: () => validate({ ...prepared, run: { ...prepared.run, grant_id: surrogate } }),
    T4_run_count_negative_zero: () => validate({ ...prepared, run: { ...prepared.run, document_count: -0 } }),
    T5_coverage_non_nfc_key: () => validate({ ...prepared, preparation: withCoverage({
      ...prepared.preparation.coverage, items: items.map((row, index) => index === 0 ? { ...row, [nfdKey]: 1 } : row) }) }),
    T6_changes_lone_surrogate: () => validate({ ...prepared, preparation: { ...prepared.preparation,
      changes: { ...prepared.preparation.changes, unavailable: [surrogate] } } }),
    D1_components_deleted: () => {
      const { components, ...stripped } = first;
      return validate({ ...prepared, preparation: withDocuments(prepared.preparation, [stripped, ...rest]) });
    },
    D3_null_document_entry: () => validate({ ...prepared,
      preparation: withDocuments(prepared.preparation, [null, first, ...rest]) }),
  };
  for (const [name, run] of Object.entries(cases)) {
    let report;
    assert.doesNotThrow(() => { report = run(); }, `${name} must report, not throw`);
    assert.equal(report.outcome, 'fail', name);
    assert.ok(report.checks.some(check => check.findings.length > 0), `${name} names what it found`);
  }
});

test('a record that merely states a digest cannot borrow another run\'s report', async () => {
  const prepared = await preparedRun();
  const report = validate(prepared);
  const narrower = await preparedRun(grantFor([item('gmail-0001')]));
  assert.ok(reportCovers(report, prepared.run));
  assert.equal(reportCovers(report, narrower.run), false);
  // Copying the examined run's digest onto a different record must not make that
  // record look examined: the digest is recomputed, not read.
  const borrowed = { ...narrower.run, run_sha256: prepared.run.run_sha256 };
  assert.equal(reportCovers(report, borrowed), false);
});

test('a report does not carry over to a different preparation or a changed grant', async () => {
  const prepared = await preparedRun();
  const report = validate(prepared);
  const narrower = await preparedRun(grantFor([item('gmail-0001')]));
  assert.ok(reportCovers(report, prepared.run));
  assert.equal(reportCovers(report, narrower.run), false);
  assert.equal(reportCovers(report, null), false);
  // A grant widened to a third item is a different target even though every
  // prepared document is unchanged and the extra item resolves to nothing.
  const widened = await preparedRun(grantFor([item('gmail-0001'), item('gmail-0002'), item('gmail-9999')]));
  assert.notEqual(widened.run.run_sha256, prepared.run.run_sha256);
  assert.equal(reportCovers(report, widened.run), false);
});

test('skipping the live code comparison is reported as not run, not as a pass', async () => {
  const prepared = await preparedRun();
  const report = validate(prepared, { compareCode: false });
  assert.equal(outcomes(report).preparer_code_reproducible, 'not_run');
  assert.equal(report.outcome, 'partial');
  const check = report.checks.find(row => row.check_id === 'preparer_code_reproducible');
  assert.deepEqual(check.limits, ['live preparer code comparison was not requested']);
  assert.deepEqual(check.scope, { checked: 0, total: 1 });
});

test('a record made by other preparer code is not reproducible here, and is not called a failure', async () => {
  const prepared = await preparedRun();
  // Another tree's honest inventory: internally consistent, different bytes.
  const otherRefs = [{ ref: 'guild_hall/context_engine/src/runtime/source_preparation.mjs', sha256: sha('other build') }];
  const foreign = buildPreparationRun({ preparation: prepared.preparation, runId: 'prep-0001',
    startedAt: STARTED, endedAt: ENDED, code: { code_refs: otherRefs, code_digest: sha256Canonical(otherRefs) } });
  const report = validate({ ...prepared, run: foreign });
  assert.equal(outcomes(report).preparer_code_reproducible, 'partial');
  assert.equal(report.outcome, 'partial');
  assert.deepEqual(codes(report, 'preparer_code_reproducible'), ['preparer_code_digest_differs']);
  assert.equal(outcomes(report).run_record_integrity, 'pass');
  assert.equal(outcomes(report).document_identity, 'pass');
});

test('an edited run record fails its own integrity check', async () => {
  const prepared = await preparedRun();
  const edited = { ...prepared.run, document_count: 99 };
  const report = validate({ ...prepared, run: edited });
  assert.equal(report.outcome, 'fail');
  assert.deepEqual(codes(report, 'run_record_integrity'), ['run_sha256_mismatch']);
  assert.ok(codes(report, 'run_output_binding').includes('run_document_count_mismatch'));
});

test('the record refuses inputs it cannot describe', async () => {
  const { preparation } = await preparedRun();
  const bad = overrides => assert.throws(() => buildPreparationRun({ preparation, runId: 'prep-0001',
    startedAt: STARTED, endedAt: ENDED, ...overrides }), /preparation_run_invalid/u);
  bad({ runId: 'not a token' });
  bad({ startedAt: 'yesterday' });
  bad({ endedAt: '2026-09-11T00:00:00.000Z' });
  bad({ preparation: { ...preparation, coverage: { ...preparation.coverage, coverage_sha256: 'sha256:zz' } } });
  assert.throws(() => validatePreparationRun({ run: null, preparation, grant: null, validationRunId: 'v',
    checkedAt: 'not a time' }), /preparation_validation_invalid/u);
});

// "Hands the hash anything" has to include values a caller can build but an
// adapter never emits. A cycle or a stack-deep nest must read as a difference,
// not as a crash that leaves no report.
test('a self-referential or stack-deep value is a difference, not a crash', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  const cyclic = { ...first };
  cyclic.facts = [{ name: 'loop', value: null, at: null, self: cyclic }];
  let deep = {}, cursor = deep;
  for (let i = 0; i < 20000; i += 1) { cursor.next = {}; cursor = cursor.next; }
  for (const [name, patch] of [['cyclic', cyclic], ['deep', { ...first, facts: [deep] }]]) {
    let report;
    assert.doesNotThrow(() => {
      report = validate({ ...prepared, preparation: withDocuments(prepared.preparation, [patch, ...rest]) });
    }, `${name} must report, not throw`);
    assert.equal(report.outcome, 'fail', name);
  }
  // Sharing one object twice is not a cycle and must not be read as one.
  const shared = { name: 'shared', value: 'x', at: null };
  assert.notEqual(documentsDigest([{ ...first, facts: [shared, shared] }]),
    documentsDigest([{ ...first, facts: [shared] }]));
});

// The shapes are type-level, not value-level: a field that should be an array or
// an object is something else entirely. Enumerating values was short four times,
// so what is pinned here is that no check can end the report, whatever it meets.
test('a check that meets a shape it cannot read says so and the others still report', async () => {
  const prepared = await preparedRun();
  const [first, ...rest] = prepared.preparation.documents;
  const withCoverage = coverage => ({ ...prepared.preparation, coverage });
  let deepLocator = {}, cursor = deepLocator;
  for (let i = 0; i < 60000; i += 1) { cursor.n = {}; cursor = cursor.n; }
  const cases = {
    D1_coverage_items_null_member: () => validate({ ...prepared,
      preparation: withCoverage({ ...prepared.preparation.coverage, items: [null] }) }),
    D3_units_number: () => validate({ ...prepared,
      preparation: withDocuments(prepared.preparation, [editDocument(first, { units: 5 }), ...rest]) }),
    D4_units_object: () => validate({ ...prepared,
      preparation: withDocuments(prepared.preparation, [editDocument(first, { units: {} }), ...rest]) }),
    D5_components_number: () => validate({ ...prepared,
      preparation: withDocuments(prepared.preparation, [editDocument(first, { components: 7 }), ...rest]) }),
    D6_units_null_member: () => validate({ ...prepared,
      preparation: withDocuments(prepared.preparation, [editDocument(first, { units: [null] }), ...rest]) }),
    D10_locator_60000_deep: () => validate({ ...prepared,
      preparation: withDocuments(prepared.preparation, [editDocument(first, {
        units: first.units.map((unit, index) => index === 0 ? { ...unit, locator: deepLocator } : unit) }), ...rest]) }),
  };
  for (const [name, run] of Object.entries(cases)) {
    let report;
    assert.doesNotThrow(() => { report = run(); }, `${name} must report, not throw`);
    assert.equal(report.outcome, 'fail', name);
    assert.equal(report.checks.length, CHECK_IDS.length, `${name} keeps every check in the report`);
    // Whatever broke, the record's own integrity was still read and reported.
    assert.equal(outcomes(report).run_record_integrity, 'pass', name);
  }
});

test('both lineage-less states answer the same gate', async () => {
  const prepared = await preparedRun();
  const roots = { [ROOT_REF]: prepared.root }, grant = prepared.grant;
  const notAsked = await prepareSourceDocuments({ grant, roots, now: NOW });
  assert.equal(notAsked.run, null);
  assert.equal(notAsked.run_unavailable, 'record_not_requested');
  const asked = await prepareSourceDocuments({ grant, roots, now: NOW, runId: 'prep-gate', clock: fixedClock() });
  assert.notEqual(asked.run, null);
  assert.equal(asked.run_unavailable, null);
  // One gate covers both: no record, and why.
  for (const result of [notAsked, asked]) assert.ok('run' in result && 'run_unavailable' in result);
});
