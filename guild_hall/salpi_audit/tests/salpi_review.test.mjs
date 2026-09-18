import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { digestOf } from '../../agent_observation/guard_primitives.mjs';
import { auditMailProjection } from '../src/salpi_audit.mjs';
import {
  OUTCOME_HOLD_CODES as O, REVIEW_SCHEMA_VERSION, REVIEW_VIOLATION_CODES as V,
  buildCanonicalReviewPacket, decideSalpiOutcome, validateSalpiReview,
} from '../src/salpi_review.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.mjs');
const AUDITED_AT = '2026-09-18T01:00:00.000Z';
const scratch = [];
after(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });

// The mail golden case as the projector emits it: raw 2, events 0, receipt new_events 1,
// one dedupe key without an event, cursor progressed.
function goldenProjection(overrides = {}) {
  return {
    schema_version: 'soulforge.salpi.safe_projection.v1',
    projection_type: 'mail_pipeline_audit',
    producer: { id: 'salpi_mail_pipeline_projector', version: '0.1.0' },
    observed_at: '2026-09-18T00:59:00.000Z',
    scope_ref: 'mail_pipeline:gmail:0123456789ab',
    status: 'mismatch',
    metrics: { raw_count: 2, event_count: 0, event_count_mail: 0, receipt_new_events: 1, receipt_event_written: 1,
      dedupe_key_count: 1, dedupe_orphan_count: 1, cursor_seen: 1 },
    flags: { dedupe_present: true, receipt_partial: false },
    timestamps: {},
    coverage: { state: 'complete', missing_inputs: [] },
    digests: {},
    locators: ['mail_store:raw', 'mail_store:events', 'mail_receipt:last_run_summary', 'mail_state:dedupe', 'mail_state:cursor'],
    hold_codes: [],
    safety: { raw_payload_copied: false, message_bodies_returned: false, identities_returned: false, absolute_paths_returned: false },
    claim_ceiling: 'metadata_projection_only',
    ...overrides,
  };
}

const consistentProjection = () => goldenProjection({
  status: 'consistent',
  metrics: { raw_count: 3, event_count: 3, event_count_mail: 3, receipt_new_events: 1, receipt_event_written: 1,
    dedupe_key_count: 3, dedupe_orphan_count: 0, cursor_seen: 1 },
});

const NO_AUTHORITY = Object.freeze({
  hold_release: false, cause_determined: false, source_truth_claimed: false, fix_proposed: false, priority_decided: false,
});

function build(projection = goldenProjection()) {
  const built = buildCanonicalReviewPacket(projection, { auditedAt: AUDITED_AT });
  assert.equal(built.status, 'OK');
  return built;
}

// What a model that follows the contract answers.
function confirmingReview({ packet, digest }) {
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    packet_digest: digest,
    review_status: 'CONFIRMED',
    finding_checks: packet.findings.map((item) => ({ finding_id: item.finding_id, result: 'CONFIRMED' })),
    authority: { ...NO_AUTHORITY },
    claim_ceiling: 'audit_candidate_only',
  };
}

const violationsOf = (review, packet) => validateSalpiReview(review, packet).violations;

describe('canonical review packet (deterministic checker owns the answer)', () => {
  it('golden case: 4 canonical findings with fixed ids, evidence and overall taken from the checker', () => {
    const projection = goldenProjection();
    const built = build(projection);
    const reference = auditMailProjection(projection, { auditedAt: AUDITED_AT });
    assert.equal(built.packet.findings.length, 4);
    assert.deepEqual(built.packet.findings.map((item) => item.finding_id), ['F01', 'F02', 'F03', 'F04']);
    assert.deepEqual(built.packet.findings.map(({ finding_id: _id, ...rest }) => rest), reference.findings);
    assert.deepEqual(built.packet.unknowns, []);
    assert.equal(built.packet.overall, 'HOLD');
    assert.deepEqual(built.packet.hold_codes, ['salpi_conflict_unresolved']);
    assert.equal(built.packet.canonical_report_digest, digestOf(reference));
    assert.equal(built.digest, digestOf(built.packet));
    assert.ok(Object.isFrozen(built.packet.findings[0].evidence));
  });

  it('the packet is reproducible: same projection and clock give the same digest', () => {
    assert.equal(build().digest, build().digest);
  });

  it('a rejected projection yields no packet, so nothing is sent to review', () => {
    const tainted = { ...goldenProjection(), body_text: 'confidential negotiation body text' };
    const built = buildCanonicalReviewPacket(tainted, { auditedAt: AUDITED_AT });
    assert.equal(built.status, 'HOLD');
    assert.equal('packet' in built, false);
    assert.equal(JSON.stringify(built).includes('confidential'), false);
  });

  it('refuses to validate against anything but a packet built by code', () => {
    assert.throws(() => validateSalpiReview(confirmingReview(build()), { findings: [] }), TypeError);
  });
});

describe('review contract v1 (the model reviews, never writes findings)', () => {
  it('golden case: canonical 4, confirmed 4, new 0, dropped 0, changed 0, overall HOLD', () => {
    const built = build();
    const review = confirmingReview(built);
    assert.deepEqual(validateSalpiReview(review, built.packet), { status: 'OK', violations: [] });
    const outcome = decideSalpiOutcome(built.packet, review);
    assert.equal(outcome.canonical_finding_count, 4);
    assert.equal(review.finding_checks.filter((item) => item.result === 'CONFIRMED').length, 4);
    assert.equal(outcome.review_valid, true);
    assert.equal(outcome.review_status, 'CONFIRMED');
    assert.deepEqual(outcome.flagged_findings, []);
    assert.equal(outcome.overall, 'HOLD');
    assert.equal(outcome.canonical_overall, 'HOLD');
    assert.deepEqual(outcome.hold_codes, ['salpi_conflict_unresolved']);
    assert.equal(outcome.escalate_review_to, null);
  });

  it('replays the 2026-09-18 live failure: an invented finding and UNKNOWN cannot enter the review at all', () => {
    const built = build();
    const review = {
      ...confirmingReview(built),
      findings: [{ check_group: 'regression_check', finding_code: 'previous_not_comparable', status: 'UNKNOWN',
        evidence: ['/scope_ref'], escalate_to: null }],
      unknowns: [{ pointer: '/previous_projection', reason_code: 'input_missing' }],
    };
    const verdict = validateSalpiReview(review, built.packet);
    assert.equal(verdict.status, 'HOLD');
    assert.ok(verdict.violations.includes(V.canonicalField));
    const outcome = decideSalpiOutcome(built.packet, review);
    assert.equal(outcome.overall, 'HOLD');
    assert.ok(outcome.hold_codes.includes(O.reviewRejected));
    assert.equal(outcome.canonical_finding_count, 4, 'canonical findings are untouched by a rejected review');
    assert.equal(outcome.escalate_review_to, 'owner');
  });

  it('rejects evidence pointers or finding fields written inside a finding check', () => {
    const built = build();
    const withEvidence = confirmingReview(built);
    withEvidence.finding_checks[0].evidence = ['/metrics/receipt_event_written'];
    assert.ok(violationsOf(withEvidence, built.packet).includes(V.canonicalField));
    const withCode = confirmingReview(built);
    withCode.finding_checks[1].finding_code = 'receipt_actual_event_mismatch';
    assert.ok(violationsOf(withCode, built.packet).includes(V.canonicalField));
    const withSeverity = confirmingReview(built);
    withSeverity.finding_checks[2].severity = 'WARN';
    assert.ok(violationsOf(withSeverity, built.packet).includes(V.canonicalField));
  });

  it('rejects overall, hold code and escalation writes at the top level', () => {
    const built = build();
    for (const [key, value] of [['overall', 'WARN'], ['hold_codes', []], ['escalation', 'CONTEXT_INVESTIGATION_REQUIRED'], ['status', 'OK']]) {
      assert.ok(violationsOf({ ...confirmingReview(built), [key]: value }, built.packet).includes(V.canonicalField), key);
    }
  });

  it('rejects an invented finding id, a dropped one and a duplicate', () => {
    const built = build();
    const invented = confirmingReview(built);
    invented.finding_checks.push({ finding_id: 'F05', result: 'CONFIRMED' });
    assert.ok(violationsOf(invented, built.packet).includes(V.invented));
    const dropped = confirmingReview(built);
    dropped.finding_checks.pop();
    assert.ok(violationsOf(dropped, built.packet).includes(V.dropped));
    const duplicated = confirmingReview(built);
    duplicated.finding_checks[3] = { finding_id: 'F01', result: 'CONFIRMED' };
    const violations = violationsOf(duplicated, built.packet);
    assert.ok(violations.includes(V.duplicate));
    assert.ok(violations.includes(V.dropped));
    const renamed = confirmingReview(built);
    renamed.finding_checks[0].finding_id = 'receipt_actual_event_mismatch';
    assert.ok(violationsOf(renamed, built.packet).includes(V.invented));
  });

  it('rejects results outside the three answers, free text and authority claims', () => {
    const built = build();
    const badResult = confirmingReview(built);
    badResult.finding_checks[0].result = 'OK';
    assert.ok(violationsOf(badResult, built.packet).includes(V.result));
    const note = confirmingReview(built);
    note.finding_checks[0].note = 'probably a sink bug';
    assert.ok(violationsOf(note, built.packet).includes(V.unknownField));
    assert.ok(violationsOf({ ...confirmingReview(built), summary: 'looks fine' }, built.packet).includes(V.unknownField));
    const claimed = confirmingReview(built);
    claimed.authority.hold_release = true;
    assert.ok(violationsOf(claimed, built.packet).includes(V.authority));
    assert.deepEqual(validateSalpiReview('CONFIRMED', built.packet), { status: 'HOLD', violations: [V.shape] });
  });

  it('rejects a review bound to another packet', () => {
    const built = build();
    const other = confirmingReview(built);
    other.packet_digest = build(consistentProjection()).digest;
    assert.ok(violationsOf(other, built.packet).includes(V.packet));
  });

  it('review_status may be stricter than the per-finding answers, never milder', () => {
    const built = build();
    const softened = confirmingReview(built);
    softened.finding_checks[0].result = 'CONFLICT_WITH_INPUT';
    assert.ok(violationsOf(softened, built.packet).includes(V.softened));
    const stricter = { ...confirmingReview(built), review_status: 'INSUFFICIENT_PROJECTION' };
    assert.deepEqual(validateSalpiReview(stricter, built.packet), { status: 'OK', violations: [] });
  });

  it('a valid disagreement adds a hold for the Owner and changes no canonical finding', () => {
    const built = build(consistentProjection());
    assert.equal(built.packet.overall, 'OK');
    assert.deepEqual(built.packet.findings, []);
    const agreeing = confirmingReview(built);
    assert.deepEqual(agreeing.finding_checks, []);
    const ok = decideSalpiOutcome(built.packet, agreeing);
    assert.equal(ok.overall, 'OK');
    assert.deepEqual(ok.hold_codes, []);

    const doubting = { ...agreeing, review_status: 'CONFLICT_WITH_INPUT' };
    const held = decideSalpiOutcome(built.packet, doubting);
    assert.equal(held.review_valid, true);
    assert.equal(held.canonical_overall, 'OK');
    assert.equal(held.overall, 'HOLD');
    assert.deepEqual(held.hold_codes, [O.reviewDisagreed]);
    assert.equal(held.escalate_review_to, 'owner');

    const golden = build();
    const flagged = confirmingReview(golden);
    flagged.finding_checks[1].result = 'INSUFFICIENT_PROJECTION';
    flagged.review_status = 'INSUFFICIENT_PROJECTION';
    const outcome = decideSalpiOutcome(golden.packet, flagged);
    assert.deepEqual(outcome.flagged_findings, [{ finding_id: 'F02', result: 'INSUFFICIENT_PROJECTION' }]);
    assert.deepEqual(outcome.hold_codes, [O.reviewDisagreed, 'salpi_conflict_unresolved'].sort());
    assert.equal(outcome.canonical_finding_count, 4);
  });
});

describe('review regressions (fresh review 2026-09-19)', () => {
  it('a getter cannot pass validation with one answer and give the outcome another', () => {
    const built = build(consistentProjection());
    let reads = 0;
    const review = confirmingReview(built);
    Object.defineProperty(review, 'review_status', {
      enumerable: true, get: () => { reads += 1; return reads === 1 ? 'CONFLICT_WITH_INPUT' : 'CONFIRMED'; },
    });
    const outcome = decideSalpiOutcome(built.packet, review);
    assert.equal(outcome.review_status, 'CONFLICT_WITH_INPUT');
    assert.equal(outcome.overall, 'HOLD');
    assert.deepEqual(outcome.hold_codes, [O.reviewDisagreed]);
    assert.equal(reads, 1, 'the original object is read once, through the checked copy');
  });

  it('a toJSON that hides a broken review is judged on the checked copy, without throwing', () => {
    const built = build();
    const valid = confirmingReview(built);
    const outcome = decideSalpiOutcome(built.packet, { toJSON: () => valid, finding_checks: 'x' });
    assert.equal(outcome.review_valid, true);
    assert.equal(outcome.canonical_finding_count, 4);
    assert.deepEqual(outcome.flagged_findings, []);
    const hidden = decideSalpiOutcome(built.packet, { toJSON: () => 'CONFIRMED' });
    assert.equal(hidden.review_valid, false);
    assert.equal(hidden.overall, 'HOLD');
  });
});

describe('review CLI', () => {
  it('builds the packet and judges a review locally, exit 0 only for a valid CONFIRMED review', () => {
    const dir = mkdtempSync(join(tmpdir(), 'salpi-review-'));
    scratch.push(dir);
    const projectionFile = join(dir, 'projection.json');
    writeFileSync(projectionFile, JSON.stringify(goldenProjection()));
    const packetRun = spawnSync(process.execPath, [CLI, 'review-packet', '--projection', projectionFile, '--audited-at', AUDITED_AT], { encoding: 'utf8' });
    assert.equal(packetRun.status, 0, packetRun.stderr);
    const { digest, packet } = JSON.parse(packetRun.stdout);
    assert.equal(packet.findings.length, 4);

    const reviewFile = join(dir, 'review.json');
    writeFileSync(reviewFile, JSON.stringify(confirmingReview({ packet, digest })));
    const check = (extra = []) => spawnSync(process.execPath, [CLI, 'check-review', '--projection', projectionFile,
      '--review', reviewFile, '--audited-at', AUDITED_AT, ...extra], { encoding: 'utf8' });
    const good = check();
    assert.equal(good.status, 0, good.stdout);
    assert.equal(JSON.parse(good.stdout).overall, 'HOLD');

    writeFileSync(reviewFile, JSON.stringify({ ...confirmingReview({ packet, digest }), unknowns: [] }));
    const bad = check();
    assert.equal(bad.status, 2);
    assert.ok(JSON.parse(bad.stdout).hold_codes.includes(O.reviewRejected));
  });
});
