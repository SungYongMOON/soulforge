import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { projectMailPipeline } from '../src/mail_pipeline_projector.mjs';
import {
  FINDING_CATALOG, REPORT_VIOLATION_CODES, STATUSES, auditMailProjection, validateSalpiAuditReport,
} from '../src/salpi_audit.mjs';
import { PROJECTION_HOLD_CODES as H, validateSafeProjection } from '../src/safe_projection.mjs';

const MODULE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(MODULE_ROOT, 'cli.mjs');
const AUDITED_AT = '2026-09-18T01:00:00.000Z';
const OBSERVED_AT = '2026-09-18T00:59:00.000Z';
const CLOCK = Object.freeze({ auditedAt: AUDITED_AT });

// Synthetic sensitive strings. None of them may appear in any projection or report.
const SENSITIVE = Object.freeze({
  subject: 'Quarterly contract amendment for Project Nightjar',
  body: 'confidential negotiation body text',
  address: 'person.one@example.invalid',
  pageToken: 'cursor-page-token-7f3a91',
  uidl: 'uidl-000-sensitive',
});

const scratch = [];
after(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function writeLines(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
}

const rawRow = (id) => ({
  id, payload: { headers: [{ name: 'Subject', value: SENSITIVE.subject }, { name: 'From', value: SENSITIVE.address }] },
  snippet: SENSITIVE.body,
});
const eventRow = (id, receivedAt) => ({
  schema_version: 'email.fetch.event.v1', event_id: `evt-${id}`, source: 'gmail', provider_message_id: id,
  subject: SENSITIVE.subject, from: [{ name: 'P', email: SENSITIVE.address }], received_at: receivedAt,
  body_text: SENSITIVE.body, raw: rawRow(id),
});

// Builds a collector-shaped layout. `events` are written to the mail bucket; `null` omits a store.
function mailFixture({ raw = [], events = [], receipt, dedupeKeys, cursor } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'salpi-mail-'));
  scratch.push(root);
  const workspaceRoot = join(root, 'inbox', 'personal');
  const runtimeRoot = join(root, 'runtime');
  if (raw !== null) writeLines(join(workspaceRoot, 'mail', 'raw', 'gmail', '2026', '2026-09.jsonl'), raw);
  if (events !== null) writeLines(join(workspaceRoot, 'mail', 'events', 'gmail', '2026', '2026-09.jsonl'), events);
  if (receipt !== null && receipt !== undefined) writeJson(join(runtimeRoot, 'logs', 'last_run_summary.json'), receipt);
  if (dedupeKeys !== null && dedupeKeys !== undefined) {
    writeJson(join(runtimeRoot, 'state', 'dedupe_keys.json'), {
      schema_version: 'email.fetch.dedupe.v1', updated_at: '2026-09-18T00:58:00+00:00', keys: dedupeKeys,
    });
  }
  if (cursor !== null && cursor !== undefined) {
    writeJson(join(runtimeRoot, 'state', 'cursor_state.json'), {
      schema_version: 'email.fetch.cursor.v1', updated_at: '2026-09-18T00:58:00+00:00',
      sources: { gmail: { cursor, updated_at: '2026-09-18T00:58:00+00:00' }, hiworks: { cursor: null, updated_at: '2026-09-18T00:00:00+00:00' } },
    });
  }
  return { root, workspaceRoot, runtimeRoot };
}

const runReceipt = (row) => ({
  schema_version: 'email.fetch.run.v1', started_at: '2026-09-18T00:57:00+00:00', finished_at: '2026-09-18T00:58:00+00:00',
  partial: false, total_events: 2, total_new_events: 1, total_duplicates: 1,
  sources: [{ source: 'gmail', fetched: 2, new_events: 1, duplicates: 1, partial: false, raw_written: 1, event_written: 1,
    errors: [], cursor: { page_token: SENSITIVE.pageToken, seen_uidls: [SENSITIVE.uidl] }, ...row }],
});

// The observed mail case: raw 2, events 0, receipt new_events 1, dedupe present, cursor progressed.
function goldenFixture() {
  return mailFixture({
    raw: [rawRow('m-001'), rawRow('m-002')],
    events: [],
    receipt: runReceipt({}),
    dedupeKeys: ['gmail|m-001|2026-09-18T00:57:30+00:00'],
    cursor: { page_token: SENSITIVE.pageToken, history_id: '123456' },
  });
}

async function project(fixture) {
  const verdict = await projectMailPipeline({
    runtimeRoot: fixture.runtimeRoot, workspaceRoot: fixture.workspaceRoot, source: 'gmail',
    scopeId: 'mailbox-personal', observedAt: OBSERVED_AT,
  });
  assert.equal(verdict.status, 'OK', `projection held: ${verdict.hold_code}`);
  return verdict.value;
}

function assertNoLeak(value, fixture) {
  const text = JSON.stringify(value);
  for (const secret of Object.values(SENSITIVE)) assert.equal(text.includes(secret), false, 'sensitive string leaked');
  assert.equal(text.includes(fixture.root), false, 'local path leaked');
  assert.equal(text.includes('m-001'), false, 'message id leaked');
}

const codes = (report) => report.findings.map((item) => item.finding_code).sort();

function manualProjection(overrides = {}) {
  return {
    schema_version: 'soulforge.salpi.safe_projection.v1',
    projection_type: 'mail_pipeline_audit',
    producer: { id: 'salpi_mail_pipeline_projector', version: '0.1.0' },
    observed_at: OBSERVED_AT,
    scope_ref: 'mail_pipeline:gmail:0123456789ab',
    status: 'consistent',
    metrics: { raw_count: 3, event_count: 3, event_count_mail: 3, receipt_new_events: 1, receipt_event_written: 1,
      dedupe_key_count: 3, dedupe_orphan_count: 0, cursor_seen: 1 },
    flags: { dedupe_present: true, receipt_partial: false },
    timestamps: { receipt_finished_at: '2026-09-18T00:58:00.000Z' },
    coverage: { state: 'complete', missing_inputs: [] },
    digests: {},
    locators: ['mail_store:raw', 'mail_store:events', 'mail_receipt:last_run_summary', 'mail_state:dedupe', 'mail_state:cursor'],
    hold_codes: [],
    safety: { raw_payload_copied: false, message_bodies_returned: false, identities_returned: false, absolute_paths_returned: false },
    claim_ceiling: 'metadata_projection_only',
    ...overrides,
  };
}

describe('SAFE_PROJECTION_SCHEMA_V1 validator', () => {
  it('accepts a well-formed projection and returns a frozen copy with a digest', () => {
    const verdict = validateSafeProjection(manualProjection());
    assert.equal(verdict.status, 'OK');
    assert.match(verdict.digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(Object.isFrozen(verdict.value.metrics), true);
  });

  for (const key of ['body', 'raw', 'payload', 'source_text', 'chunk', 'transcript', 'attachment', 'secret', 'credential', 'subject', 'email', 'snippet']) {
    it(`fails closed on a top-level "${key}" field`, () => {
      assert.deepEqual(validateSafeProjection({ ...manualProjection(), [key]: 'x' }), { status: 'HOLD', hold_code: H.rawField });
    });
  }

  it('fails closed on content-like keys hidden inside an allowed section', () => {
    const projection = manualProjection();
    projection.metrics = { ...projection.metrics, body_text: 1 };
    assert.equal(validateSafeProjection(projection).hold_code, H.rawField);
    const nested = manualProjection();
    nested.flags = { ...nested.flags, transcript: false };
    assert.equal(validateSafeProjection(nested).hold_code, H.rawField);
  });

  it('fails closed on an unknown innocuous field without echoing its name', () => {
    const verdict = validateSafeProjection({ ...manualProjection(), note: 'x' });
    assert.equal(verdict.status, 'HOLD');
    assert.equal(verdict.hold_code, H.unknownField);
    assert.equal(JSON.stringify(verdict).includes('note'), false);
  });

  it('rejects objects smuggled into allowed arrays or allowed values', () => {
    assert.equal(validateSafeProjection(manualProjection({ locators: [{ body: 'x' }] })).status, 'HOLD');
    const projection = manualProjection();
    projection.metrics = { ...projection.metrics, raw_count: { payload: 'x' } };
    assert.equal(validateSafeProjection(projection).status, 'HOLD');
  });

  it('rejects free strings where only counts, enums or safe refs are allowed', () => {
    const projection = manualProjection();
    projection.metrics = { ...projection.metrics, raw_count: SENSITIVE.subject };
    assert.equal(validateSafeProjection(projection).hold_code, H.invalidValue);
    assert.equal(validateSafeProjection(manualProjection({ status: SENSITIVE.body })).hold_code, H.invalidValue);
    assert.equal(validateSafeProjection(manualProjection({ scope_ref: SENSITIVE.address })).hold_code, H.invalidValue);
    assert.equal(validateSafeProjection(manualProjection({ locators: ['mail_store:has space'] })).hold_code, H.invalidValue);
  });

  it('rejects absolute paths and secret-looking values through the shared guard', () => {
    const drivePath = ['C', ':', '\\', 'Users', '\\', 'someone'].join('');
    assert.equal(validateSafeProjection(manualProjection({ scope_ref: `mail_pipeline:${drivePath}` })).hold_code, H.localPath);
    const token = ['sk', '-', 'abcdefgh12345678'].join('');
    assert.equal(validateSafeProjection(manualProjection({ scope_ref: `mail_pipeline:${token}` })).hold_code, H.secret);
  });

  it('rejects wrong schema version, wrong type, missing fields and a true safety flag', () => {
    assert.equal(validateSafeProjection(manualProjection({ schema_version: 'soulforge.salpi.safe_projection.v0' })).hold_code, H.schemaVersion);
    assert.equal(validateSafeProjection(manualProjection({ projection_type: 'slack_pipeline_audit' })).hold_code, H.projectionType);
    const missing = manualProjection();
    delete missing.coverage;
    assert.equal(validateSafeProjection(missing).hold_code, H.missingField);
    const unsafe = manualProjection();
    unsafe.safety = { ...unsafe.safety, raw_payload_copied: true };
    assert.equal(validateSafeProjection(unsafe).hold_code, H.safety);
  });

  it('bounds counts and list sizes', () => {
    const projection = manualProjection();
    projection.metrics = { ...projection.metrics, raw_count: -1 };
    assert.equal(validateSafeProjection(projection).hold_code, H.invalidValue);
    const repeated = ['mail_receipt_unreadable', 'mail_receipt_unreadable'];
    assert.equal(validateSafeProjection(manualProjection({ hold_codes: repeated })).hold_code, H.invalidValue);
  });

  it('refuses accessors and non-object input', () => {
    const projection = manualProjection();
    Object.defineProperty(projection, 'metrics', { get: () => ({}), enumerable: true });
    assert.equal(validateSafeProjection(projection).hold_code, H.accessor);
    assert.equal(validateSafeProjection('text').status, 'HOLD');
  });
});

describe('MAIL_PIPELINE_AUDIT_GOLDEN_CASE_V1', () => {
  it('local projector turns the observed 2/0/1/dedupe/cursor state into a safe projection', async () => {
    const fixture = goldenFixture();
    const projection = await project(fixture);
    assert.equal(projection.status, 'mismatch');
    assert.equal(projection.metrics.raw_count, 2);
    assert.equal(projection.metrics.event_count, 0);
    assert.equal(projection.metrics.receipt_new_events, 1);
    assert.equal(projection.metrics.cursor_seen, 1);
    assert.equal(projection.flags.dedupe_present, true);
    assert.equal(projection.metrics.dedupe_orphan_count, 1);
    assert.deepEqual(projection.coverage, { state: 'complete', missing_inputs: [] });
    assert.deepEqual(projection.hold_codes, []);
    assertNoLeak(projection, fixture);
  });

  it('auditor reports the mismatch findings, holds the completion claim, and names no cause', async () => {
    const fixture = goldenFixture();
    const projection = await project(fixture);
    const report = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    assert.deepEqual(codes(report), [
      'cursor_progress_without_materialized_event',
      'dedupe_orphan_candidate',
      'raw_exceeds_materialized_events',
      'receipt_actual_event_mismatch',
    ]);
    const byCode = Object.fromEntries(report.findings.map((item) => [item.finding_code, item]));
    assert.equal(byCode.receipt_actual_event_mismatch.status, 'CONFLICT');
    assert.deepEqual(byCode.receipt_actual_event_mismatch.evidence, ['/metrics/receipt_new_events', '/metrics/event_count']);
    assert.equal(byCode.cursor_progress_without_materialized_event.status, 'CONFLICT');
    assert.equal(byCode.dedupe_orphan_candidate.status, 'WARN');
    for (const item of report.findings) assert.equal(item.escalate_to, 'context_investigator');
    assert.equal(report.overall, 'HOLD');
    assert.deepEqual(report.hold_codes, ['salpi_conflict_unresolved']);
    assert.deepEqual(report.authority, {
      hold_release: false, cause_determined: false, source_truth_claimed: false, fix_proposed: false, priority_decided: false,
    });
    assert.equal(report.claim_ceiling, 'audit_candidate_only');
    assertNoLeak(report, fixture);
  });

  it('accepts a model report equal to the checklist and rejects causes, drops, inventions and hold release', async () => {
    const projection = await project(goldenFixture());
    const reference = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    const copy = () => JSON.parse(JSON.stringify(reference));
    assert.deepEqual(validateSalpiAuditReport(copy(), projection, CLOCK), { status: 'OK', violations: [] });

    const withCause = copy();
    withCause.findings[0].cause = 'dedupe committed before the sink write';
    assert.ok(validateSalpiAuditReport(withCause, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.freeText));

    const withSummary = { ...copy(), summary: 'probably a sink bug' };
    assert.ok(validateSalpiAuditReport(withSummary, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.unknownField));

    const invented = copy();
    invented.findings.push({ ...invented.findings[0], finding_code: 'sink_write_failed' });
    assert.ok(validateSalpiAuditReport(invented, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.unknownCode));

    const dropped = copy();
    dropped.findings = dropped.findings.filter((item) => item.finding_code !== 'receipt_actual_event_mismatch');
    assert.ok(validateSalpiAuditReport(dropped, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.dropped));

    const released = { ...copy(), overall: 'WARN', hold_codes: [] };
    assert.ok(validateSalpiAuditReport(released, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.holdReleased));

    const softened = copy();
    softened.findings[0].status = 'WARN';
    assert.ok(validateSalpiAuditReport(softened, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.catalogMismatch));

    const claimed = copy();
    claimed.authority.cause_determined = true;
    assert.ok(validateSalpiAuditReport(claimed, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.authority));

    const offProjection = copy();
    offProjection.findings[0].evidence = ['/metrics/body_text'];
    assert.ok(validateSalpiAuditReport(offProjection, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.evidence));
  });

  it('a projection carrying raw content never reaches the auditor', () => {
    const tainted = { ...manualProjection(), body_text: SENSITIVE.body };
    const report = auditMailProjection(tainted, { auditedAt: AUDITED_AT });
    assert.equal(report.overall, 'HOLD');
    assert.deepEqual(report.findings, []);
    assert.equal(report.projection_hold_code, H.rawField);
    assert.equal(JSON.stringify(report).includes(SENSITIVE.body), false);
  });
});

describe('UNKNOWN handling', () => {
  it('missing stores stay UNKNOWN; no consistency finding and no cause is produced', async () => {
    const fixture = mailFixture({ raw: [rawRow('m-001')], events: null, receipt: runReceipt({}), dedupeKeys: null, cursor: null });
    const projection = await project(fixture);
    assert.equal(projection.status, 'incomplete');
    assert.deepEqual(projection.coverage, { state: 'partial', missing_inputs: ['event_store', 'dedupe_state', 'cursor_state'] });
    assert.equal(projection.metrics.event_count, undefined);
    const report = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    assert.deepEqual(codes(report), ['check_not_evaluable', 'required_input_missing']);
    assert.equal(report.overall, 'UNKNOWN');
    assert.ok(report.unknowns.some((item) => item.pointer === '/metrics/event_count' && item.reason_code === 'metric_absent'));
    assert.equal(report.findings.some((item) => FINDING_CATALOG[item.finding_code].group === 'consistency_check'), false);
    assertNoLeak(report, fixture);

    const filled = JSON.parse(JSON.stringify(report));
    filled.unknowns = [];
    filled.overall = 'OK';
    const verdict = validateSalpiAuditReport(filled, projection, CLOCK);
    assert.ok(verdict.violations.includes(REPORT_VIOLATION_CODES.unknownFilled));
    assert.ok(verdict.violations.includes(REPORT_VIOLATION_CODES.overall));
  });

  it('an empty collector layout is unavailable, not OK', async () => {
    const fixture = mailFixture({ raw: null, events: null, receipt: null, dedupeKeys: null, cursor: null });
    const projection = await project(fixture);
    assert.equal(projection.status, 'unavailable');
    assert.equal(auditMailProjection(projection, { auditedAt: AUDITED_AT }).overall, 'UNKNOWN');
  });

  it('an unreadable state file becomes a producer hold code', async () => {
    const fixture = mailFixture({ raw: [], events: [], receipt: runReceipt({ new_events: 0, event_written: 0 }), dedupeKeys: [], cursor: null });
    writeFileSync(join(fixture.runtimeRoot, 'state', 'cursor_state.json'), '{not json');
    const projection = await project(fixture);
    assert.deepEqual(projection.hold_codes, ['mail_cursor_state_unreadable']);
    const report = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    assert.equal(report.overall, 'HOLD');
    assert.ok(report.hold_codes.includes('salpi_producer_hold'));
  });
});

describe('collection and regression checks', () => {
  it('a consistent pipeline audits OK', async () => {
    const fixture = mailFixture({
      raw: [rawRow('m-001')],
      events: [eventRow('m-001', '2026-09-18T00:57:30+00:00')],
      receipt: runReceipt({ duplicates: 0 }),
      dedupeKeys: ['gmail|m-001|2026-09-18T00:57:30+00:00'],
      cursor: { page_token: SENSITIVE.pageToken },
    });
    const projection = await project(fixture);
    assert.equal(projection.status, 'consistent');
    assert.equal(projection.metrics.dedupe_orphan_count, 0);
    const report = auditMailProjection(projection, { auditedAt: AUDITED_AT, maxReceiptAgeSeconds: 3600 });
    assert.equal(report.overall, 'OK');
    assert.deepEqual(report.findings, []);
    assertNoLeak(projection, fixture);
  });

  it('events routed to the ads or quarantine bucket still count as materialized', async () => {
    const fixture = mailFixture({
      raw: [rawRow('m-001')], events: [], receipt: runReceipt({}),
      dedupeKeys: ['gmail|m-001|2026-09-18T00:57:30+00:00'], cursor: { page_token: SENSITIVE.pageToken },
    });
    writeLines(join(fixture.workspaceRoot, 'ads', 'events', 'gmail', '2026', '2026-09.jsonl'), [eventRow('m-001', '2026-09-18T00:57:30+00:00')]);
    const projection = await project(fixture);
    assert.equal(projection.metrics.event_count_ads, 1);
    assert.equal(projection.metrics.event_count, 1);
    assert.equal(projection.status, 'consistent');
  });

  it('stale receipts and partial runs are WARN', () => {
    const projection = manualProjection({ flags: { dedupe_present: true, receipt_partial: true } });
    const report = auditMailProjection(projection, { auditedAt: '2026-09-18T05:00:00.000Z', maxReceiptAgeSeconds: 3600 });
    assert.deepEqual(codes(report), ['receipt_partial', 'receipt_stale']);
    assert.equal(report.overall, 'WARN');
  });

  it('append-only counts that shrink against the previous run are a regression', () => {
    const previous = manualProjection({ observed_at: '2026-09-17T23:00:00.000Z' });
    const current = manualProjection();
    current.metrics = { ...current.metrics, event_count: 2, event_count_mail: 2, raw_count: 2 };
    const report = auditMailProjection(current, { auditedAt: AUDITED_AT, previous });
    assert.ok(codes(report).includes('append_only_count_decreased'));
    assert.equal(report.overall, 'HOLD');
  });

  it('a previous projection that is not older is a hold, not a comparison', () => {
    const previous = manualProjection({ observed_at: '2026-09-18T02:00:00.000Z' });
    const report = auditMailProjection(manualProjection(), { auditedAt: AUDITED_AT, previous });
    assert.deepEqual(codes(report), ['observation_order_inverted']);
    assert.equal(report.overall, 'HOLD');
  });

  it('a producer status that disagrees with its own counts is held as a producer defect', () => {
    const projection = manualProjection();
    projection.metrics = { ...projection.metrics, event_count: 0, event_count_mail: 0 };
    const report = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    assert.ok(codes(report).includes('projection_status_inconsistent'));
    assert.equal(report.overall, 'HOLD');
  });
});

describe('role contract and CLI', () => {
  it('the tracked role contract matches the enforced vocabulary', () => {
    const contract = JSON.parse(readFileSync(join(MODULE_ROOT, 'salpi_role_contract.v2.json'), 'utf8'));
    assert.deepEqual([...contract.statuses].sort(), [...STATUSES].sort());
    for (const capability of ['raw_db_query', 'read_original', 'mail_body_read', 'slack_body_read', 'attachment_open',
      'transcript_read', 'rag_source_text_read', 'secret_read', 'terminal']) {
      assert.ok(contract.forbidden_capabilities.includes(capability), capability);
      assert.equal(contract.allowed_capabilities.includes(capability), false, capability);
    }
    assert.equal(contract.input.raw_sources_reachable, false);
  });

  it('CLI runs raw -> projection -> audit locally and prints no sensitive content', async () => {
    const fixture = goldenFixture();
    const projected = spawnSync(process.execPath, [CLI, 'project-mail', '--runtime-root', fixture.runtimeRoot,
      '--workspace-root', fixture.workspaceRoot, '--source', 'gmail', '--scope-id', 'mailbox-personal', '--observed-at', OBSERVED_AT], { encoding: 'utf8' });
    assert.equal(projected.status, 0, projected.stderr);
    for (const secret of Object.values(SENSITIVE)) assert.equal(projected.stdout.includes(secret), false);
    assert.equal(projected.stdout.includes(fixture.root), false);
    const projectionFile = join(fixture.root, 'projection.json');
    writeFileSync(projectionFile, projected.stdout);
    const audited = spawnSync(process.execPath, [CLI, 'audit', '--projection', projectionFile, '--audited-at', AUDITED_AT], { encoding: 'utf8' });
    assert.equal(audited.status, 2);
    const report = JSON.parse(audited.stdout);
    assert.equal(report.overall, 'HOLD');
    const reportFile = join(fixture.root, 'report.json');
    writeFileSync(reportFile, audited.stdout);
    const checked = spawnSync(process.execPath, [CLI, 'check-report', '--projection', projectionFile, '--report', reportFile,
      '--audited-at', AUDITED_AT], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stdout);
  });
});

describe('review regressions (fresh review 2026-09-18)', () => {
  it('well-formed but unlisted locators, hold codes, producer ids and scope refs cannot carry text', () => {
    const cases = [
      manualProjection({ locators: ['mail_store:raw', 'mail_store:kim.person-example.invalid'] }),
      manualProjection({ hold_codes: ['merger_with_partner_q3_budget_cut'] }),
      manualProjection({ scope_ref: 'mail_pipeline:gmail:ceo.private-subject.re.budget' }),
      manualProjection({ producer: { id: 'someone_else', version: '0.1.0' } }),
    ];
    for (const projection of cases) assert.equal(validateSafeProjection(projection).hold_code, H.invalidValue);
  });

  it('the model cannot move the audit clock to hide a stale receipt', () => {
    const projection = manualProjection();
    const options = { auditedAt: AUDITED_AT, maxReceiptAgeSeconds: 60 };
    const reference = auditMailProjection(projection, options);
    assert.deepEqual(codes(reference), ['receipt_stale']);
    const moved = JSON.parse(JSON.stringify(reference));
    moved.audited_at = '2026-09-18T00:58:30.000Z';
    moved.findings = [];
    moved.overall = 'OK';
    const verdict = validateSalpiAuditReport(moved, projection, options);
    assert.equal(verdict.status, 'HOLD');
    assert.ok(verdict.violations.includes(REPORT_VIOLATION_CODES.shape));
    assert.throws(() => validateSalpiAuditReport(reference, projection, {}), TypeError);
  });

  it('free text in unknowns and swapped unknowns are rejected', async () => {
    const fixture = mailFixture({ raw: [rawRow('m-001')], events: [], receipt: runReceipt({ new_events: 0, event_written: 0 }), dedupeKeys: [], cursor: null });
    const projection = await project(fixture);
    const reference = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    assert.ok(reference.unknowns.length >= 2);

    const withText = JSON.parse(JSON.stringify(reference));
    withText.unknowns.push({ pointer: '/metrics', reason_code: 'metric_absent', check: 'cause: token expired, rotate it', input: 'subject: merger' });
    assert.ok(validateSalpiAuditReport(withText, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.freeText));

    const swapped = JSON.parse(JSON.stringify(reference));
    swapped.unknowns = reference.unknowns.map(() => ({ pointer: '/status', reason_code: 'input_missing', input: 'raw_store' }));
    const verdict = validateSalpiAuditReport(swapped, projection, CLOCK);
    assert.ok(verdict.violations.includes(REPORT_VIOLATION_CODES.unknownFilled));
    assert.ok(verdict.violations.includes(REPORT_VIOLATION_CODES.unsupported));
  });

  it('duplicate findings and extra hold codes are rejected', async () => {
    const projection = await project(goldenFixture());
    const reference = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    const duplicated = JSON.parse(JSON.stringify(reference));
    duplicated.findings.push(duplicated.findings[0]);
    assert.ok(validateSalpiAuditReport(duplicated, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.unsupported));
    const reordered = JSON.parse(JSON.stringify(reference));
    const twin = JSON.parse(JSON.stringify(reordered.findings.find((item) => item.evidence.length > 1)));
    twin.evidence.reverse();
    reordered.findings.push(twin);
    assert.ok(validateSalpiAuditReport(reordered, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.unsupported));
    const extraHold = JSON.parse(JSON.stringify(reference));
    extraHold.hold_codes.push('salpi_producer_hold');
    assert.ok(validateSalpiAuditReport(extraHold, projection, CLOCK).violations.includes(REPORT_VIOLATION_CODES.unsupported));
  });

  it('a dry-run receipt is not treated as a write, so it cannot raise a false CONFLICT', async () => {
    const dryRow = {
      new_events: 2, raw_written: 2, event_written: 2,
      notifications: { enabled: false, queued: 0, skipped_reason: 'dry_run', queue_files: [] },
      mail_candidates: { enabled: false, queued: 0, skipped: 0, skipped_reason: 'dry_run', queue_files: [] },
    };
    const fixture = mailFixture({ raw: [], events: [], receipt: runReceipt(dryRow), dedupeKeys: [], cursor: null });
    const projection = await project(fixture);
    assert.equal(projection.flags.receipt_dry_run, true);
    assert.equal(projection.metrics.receipt_new_events, undefined);
    const report = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    assert.equal(report.findings.some((item) => item.status === 'CONFLICT'), false);
    assert.notEqual(report.overall, 'HOLD');
    assert.ok(report.unknowns.some((item) => item.pointer === '/metrics/receipt_new_events'));
  });
});
