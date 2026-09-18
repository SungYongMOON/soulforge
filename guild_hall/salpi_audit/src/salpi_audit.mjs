// SALPIMI_ROLE_CONTRACT_V2 checklist for the mail pipeline projection.
//
// `auditMailProjection` is the deterministic reference for what the salpi auditor may report from
// one validated Safe Projection: which finding codes, at which status, pointing at which projection
// fields. It never reads anything but the projection, never names a cause, and never releases a
// hold. `validateSalpiAuditReport` holds a model-written report to the same contract: closed
// schema, catalog codes only, evidence that resolves inside the projection, no finding the
// projection does not support, no dropped finding, and no downgraded overall status.

import { deepFreeze, digestOf, isDenseArray, isPlainObject, UTC_MS } from '../../agent_observation/guard_primitives.mjs';
import { MAIL_INPUTS, MAIL_INPUT_LOCATORS as INPUT_LOCATOR, validateSafeProjection } from './safe_projection.mjs';

export const AUDIT_REPORT_SCHEMA_VERSION = 'soulforge.salpi.audit_report.v1';
export const MAIL_CHECKLIST_ID = 'salpi.mail_pipeline_audit.v1';
export const AUDIT_CLAIM_CEILING = 'audit_candidate_only';

export const STATUSES = Object.freeze(['OK', 'WARN', 'UNKNOWN', 'CONFLICT', 'HOLD']);
const SEVERITY = Object.freeze({ OK: 0, WARN: 1, UNKNOWN: 2, CONFLICT: 3, HOLD: 4 });
export const CHECK_GROUPS = Object.freeze(['collection_check', 'consistency_check', 'artifact_check', 'regression_check']);
export const ESCALATION_TARGETS = Object.freeze(['context_investigator', 'producer_owner', 'owner']);
export const AUTHORITY_KEYS = Object.freeze([
  'hold_release', 'cause_determined', 'source_truth_claimed', 'fix_proposed', 'priority_decided',
]);

// Every code the auditor may emit, with its fixed group, status and escalation target.
export const FINDING_CATALOG = deepFreeze({
  receipt_actual_event_mismatch: { group: 'consistency_check', status: 'CONFLICT', escalate_to: 'context_investigator' },
  receipt_internal_mismatch: { group: 'consistency_check', status: 'CONFLICT', escalate_to: 'context_investigator' },
  cursor_progress_without_materialized_event: { group: 'consistency_check', status: 'CONFLICT', escalate_to: 'context_investigator' },
  raw_exceeds_materialized_events: { group: 'consistency_check', status: 'CONFLICT', escalate_to: 'context_investigator' },
  dedupe_orphan_candidate: { group: 'consistency_check', status: 'WARN', escalate_to: 'context_investigator' },
  required_input_missing: { group: 'collection_check', status: 'UNKNOWN', escalate_to: 'producer_owner' },
  receipt_partial: { group: 'collection_check', status: 'WARN', escalate_to: null },
  receipt_stale: { group: 'collection_check', status: 'WARN', escalate_to: 'producer_owner' },
  check_not_evaluable: { group: 'artifact_check', status: 'UNKNOWN', escalate_to: null },
  safe_locator_missing: { group: 'artifact_check', status: 'WARN', escalate_to: 'producer_owner' },
  producer_hold_code_present: { group: 'artifact_check', status: 'HOLD', escalate_to: 'owner' },
  projection_status_inconsistent: { group: 'artifact_check', status: 'HOLD', escalate_to: 'producer_owner' },
  append_only_count_decreased: { group: 'regression_check', status: 'CONFLICT', escalate_to: 'context_investigator' },
  dedupe_key_count_decreased: { group: 'regression_check', status: 'WARN', escalate_to: null },
  status_regressed: { group: 'regression_check', status: 'WARN', escalate_to: null },
  previous_not_comparable: { group: 'regression_check', status: 'UNKNOWN', escalate_to: null },
  observation_order_inverted: { group: 'regression_check', status: 'HOLD', escalate_to: 'producer_owner' },
});

export const REPORT_HOLD_CODES = Object.freeze({
  projectionRejected: 'salpi_projection_rejected',
  conflictUnresolved: 'salpi_conflict_unresolved',
  producerHold: 'salpi_producer_hold',
  checkHold: 'salpi_check_hold',
});

export const UNKNOWN_REASONS = Object.freeze(['input_missing', 'metric_absent', 'timestamp_absent']);

// Consistency rules over producer-counted values. Each rule names the metrics it needs; when one is
// absent the rule is not evaluable and stays UNKNOWN instead of being guessed.
const CONSISTENCY_RULES = Object.freeze([
  {
    code: 'receipt_actual_event_mismatch',
    needs: ['receipt_new_events', 'event_count'],
    fails: (m) => m.event_count < m.receipt_new_events,
  },
  {
    code: 'receipt_internal_mismatch',
    needs: ['receipt_new_events', 'receipt_event_written'],
    fails: (m) => m.receipt_event_written !== m.receipt_new_events,
  },
  {
    // Only when something was actually seen: an empty mailbox may legitimately move its cursor.
    code: 'cursor_progress_without_materialized_event',
    needs: ['cursor_seen', 'event_count'],
    fails: (m) => m.cursor_seen > 0 && m.event_count === 0
      && ((m.receipt_new_events ?? 0) > 0 || (m.raw_count ?? 0) > 0 || (m.dedupe_key_count ?? 0) > 0),
    evidence: ['/metrics/cursor_seen', '/metrics/event_count'],
  },
  {
    code: 'raw_exceeds_materialized_events',
    needs: ['raw_count', 'event_count'],
    fails: (m) => m.raw_count > m.event_count,
  },
  {
    code: 'dedupe_orphan_candidate',
    needs: ['dedupe_orphan_count', 'dedupe_key_count'],
    fails: (m) => m.dedupe_orphan_count > 0,
  },
]);

export function evaluateMailConsistency(metrics) {
  const failed = [];
  const notEvaluable = [];
  for (const rule of CONSISTENCY_RULES) {
    const missing = rule.needs.filter((key) => metrics[key] === undefined);
    if (missing.length > 0) notEvaluable.push({ rule, missing });
    else if (rule.fails(metrics)) failed.push(rule);
  }
  return { failed, notEvaluable };
}

// The projection status a producer must emit for these metrics and this coverage.
export function expectedProjectionStatus(metrics, missingInputs, inputCount) {
  if (missingInputs.length === inputCount) return 'unavailable';
  if (evaluateMailConsistency(metrics).failed.length > 0) return 'mismatch';
  return missingInputs.length > 0 ? 'incomplete' : 'consistent';
}

const finding = (code, evidence) => ({
  check_group: FINDING_CATALOG[code].group,
  finding_code: code,
  status: FINDING_CATALOG[code].status,
  evidence: [...evidence],
  escalate_to: FINDING_CATALOG[code].escalate_to,
});

const APPEND_ONLY_METRICS = Object.freeze(['raw_count', 'event_count']);
const STATUS_RANK = Object.freeze({ consistent: 0, incomplete: 1, mismatch: 2, unavailable: 3 });

function regressionFindings(current, previous, findings) {
  if (previous.projection_type !== current.projection_type || previous.scope_ref !== current.scope_ref) {
    findings.push(finding('previous_not_comparable', ['/scope_ref']));
    return;
  }
  if (Date.parse(previous.observed_at) >= Date.parse(current.observed_at)) {
    findings.push(finding('observation_order_inverted', ['/observed_at']));
    return;
  }
  for (const key of APPEND_ONLY_METRICS) {
    const before = previous.metrics[key];
    const after = current.metrics[key];
    if (before === undefined || after === undefined) continue;
    if (after < before) findings.push(finding('append_only_count_decreased', [`/metrics/${key}`]));
  }
  const dedupeBefore = previous.metrics.dedupe_key_count;
  const dedupeAfter = current.metrics.dedupe_key_count;
  if (dedupeBefore !== undefined && dedupeAfter !== undefined && dedupeAfter < dedupeBefore) {
    findings.push(finding('dedupe_key_count_decreased', ['/metrics/dedupe_key_count']));
  }
  if (STATUS_RANK[current.status] > STATUS_RANK[previous.status]) {
    findings.push(finding('status_regressed', ['/status']));
  }
}

function overallOf(findings, holdCodes) {
  let worst = 'OK';
  for (const item of findings) if (SEVERITY[item.status] > SEVERITY[worst]) worst = item.status;
  if (worst === 'CONFLICT') {
    // A contradiction between deterministic sources holds any completion claim until a human
    // accepts a new projection. The finding itself keeps its CONFLICT status.
    holdCodes.push(REPORT_HOLD_CODES.conflictUnresolved);
    return 'HOLD';
  }
  if (worst === 'HOLD') holdCodes.push(REPORT_HOLD_CODES.checkHold);
  return worst;
}

function sortFindings(findings) {
  return findings.sort((a, b) => CHECK_GROUPS.indexOf(a.check_group) - CHECK_GROUPS.indexOf(b.check_group)
    || a.finding_code.localeCompare(b.finding_code)
    || a.evidence.join(',').localeCompare(b.evidence.join(',')));
}

const NO_AUTHORITY = Object.freeze(Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])));

function reportShell({ projectionDigest, scopeRef, auditedAt }) {
  return {
    schema_version: AUDIT_REPORT_SCHEMA_VERSION,
    checklist_id: MAIL_CHECKLIST_ID,
    projection_digest: projectionDigest,
    scope_ref: scopeRef,
    audited_at: auditedAt,
    projection_hold_code: null,
    overall: 'OK',
    hold_codes: [],
    findings: [],
    unknowns: [],
    authority: { ...NO_AUTHORITY },
    claim_ceiling: AUDIT_CLAIM_CEILING,
  };
}

// options: { auditedAt (UTC ms string), maxReceiptAgeSeconds, previous (raw projection or undefined) }
export function auditMailProjection(rawProjection, options = {}) {
  const auditedAt = options.auditedAt ?? new Date().toISOString();
  if (typeof auditedAt !== 'string' || !UTC_MS.test(auditedAt)) throw new TypeError('auditedAt must be a UTC ms timestamp');
  const verdict = validateSafeProjection(rawProjection);
  if (verdict.status !== 'OK') {
    // A rejected projection is never read further: no scope, no values, only the hold.
    const report = reportShell({ projectionDigest: null, scopeRef: null, auditedAt });
    report.overall = 'HOLD';
    report.hold_codes = [REPORT_HOLD_CODES.projectionRejected];
    report.projection_hold_code = verdict.hold_code;
    return deepFreeze(report);
  }
  const p = verdict.value;
  const report = reportShell({ projectionDigest: verdict.digest, scopeRef: p.scope_ref, auditedAt });
  const findings = [];
  const unknowns = [];
  const holdCodes = [];

  // collection_check
  for (const input of p.coverage.missing_inputs) {
    unknowns.push({ pointer: '/coverage/missing_inputs', reason_code: 'input_missing', input });
  }
  if (p.coverage.missing_inputs.length > 0) findings.push(finding('required_input_missing', ['/coverage/missing_inputs']));
  if (p.flags.receipt_partial === true) findings.push(finding('receipt_partial', ['/flags/receipt_partial']));
  const maxAge = options.maxReceiptAgeSeconds;
  if (maxAge !== undefined) {
    if (!Number.isSafeInteger(maxAge) || maxAge <= 0) throw new TypeError('maxReceiptAgeSeconds must be a positive integer');
    const finishedAt = p.timestamps.receipt_finished_at;
    if (finishedAt === undefined) {
      unknowns.push({ pointer: '/timestamps/receipt_finished_at', reason_code: 'timestamp_absent' });
    } else if ((Date.parse(auditedAt) - Date.parse(finishedAt)) / 1000 > maxAge) {
      findings.push(finding('receipt_stale', ['/timestamps/receipt_finished_at']));
    }
  }

  // consistency_check — values are compared, never recounted or corrected.
  const { failed, notEvaluable } = evaluateMailConsistency(p.metrics);
  for (const rule of failed) {
    findings.push(finding(rule.code, rule.evidence ?? rule.needs.map((key) => `/metrics/${key}`)));
  }
  // artifact_check
  for (const { rule, missing } of notEvaluable) {
    for (const key of missing) unknowns.push({ pointer: `/metrics/${key}`, reason_code: 'metric_absent', check: rule.code });
  }
  if (notEvaluable.length > 0) findings.push(finding('check_not_evaluable', ['/metrics']));
  const expectedStatus = expectedProjectionStatus(p.metrics, p.coverage.missing_inputs, Object.keys(INPUT_LOCATOR).length);
  if (p.status !== expectedStatus) findings.push(finding('projection_status_inconsistent', ['/status']));
  const presentInputs = Object.keys(INPUT_LOCATOR).filter((input) => !p.coverage.missing_inputs.includes(input));
  if (presentInputs.some((input) => !p.locators.includes(INPUT_LOCATOR[input]))) {
    findings.push(finding('safe_locator_missing', ['/locators']));
  }
  if (p.hold_codes.length > 0) {
    findings.push(finding('producer_hold_code_present', ['/hold_codes']));
    holdCodes.push(REPORT_HOLD_CODES.producerHold);
  }

  // regression_check
  if (options.previous !== undefined) {
    const previous = validateSafeProjection(options.previous);
    if (previous.status !== 'OK') findings.push(finding('previous_not_comparable', ['/scope_ref']));
    else regressionFindings(p, previous.value, findings);
  }

  report.findings = sortFindings(findings);
  report.unknowns = unknowns;
  report.overall = overallOf(report.findings, holdCodes);
  report.hold_codes = [...new Set(holdCodes)].sort();
  return deepFreeze(report);
}

// ---------------------------------------------------------------------------------------------
// Model output boundary

export const REPORT_VIOLATION_CODES = Object.freeze({
  shape: 'SALPI_REPORT_SHAPE_INVALID',
  unknownField: 'SALPI_REPORT_UNKNOWN_FIELD',
  freeText: 'SALPI_REPORT_FREE_TEXT_FORBIDDEN',
  authority: 'SALPI_REPORT_AUTHORITY_CLAIMED',
  projection: 'SALPI_REPORT_PROJECTION_MISMATCH',
  unknownCode: 'SALPI_REPORT_FINDING_CODE_UNKNOWN',
  catalogMismatch: 'SALPI_REPORT_FINDING_CATALOG_MISMATCH',
  evidence: 'SALPI_REPORT_EVIDENCE_UNRESOLVED',
  unsupported: 'SALPI_REPORT_FINDING_NOT_SUPPORTED',
  dropped: 'SALPI_REPORT_FINDING_DROPPED',
  overall: 'SALPI_REPORT_OVERALL_MISMATCH',
  holdReleased: 'SALPI_REPORT_HOLD_RELEASED',
  unknownFilled: 'SALPI_REPORT_UNKNOWN_FILLED',
});

const REPORT_KEYS = Object.freeze([
  'schema_version', 'checklist_id', 'projection_digest', 'scope_ref', 'audited_at', 'projection_hold_code', 'overall', 'hold_codes',
  'findings', 'unknowns', 'authority', 'claim_ceiling',
]);
const FINDING_KEYS = Object.freeze(['check_group', 'finding_code', 'status', 'evidence', 'escalate_to']);
const UNKNOWN_KEYS = Object.freeze(['pointer', 'reason_code', 'input', 'check']);
const POINTER = /^(?:\/[a-z_]{1,40}){1,2}$/u;

function resolvesIn(projection, pointer) {
  if (typeof pointer !== 'string' || !POINTER.test(pointer)) return false;
  const [, top, leaf] = pointer.split('/');
  if (!(top in projection)) return false;
  return leaf === undefined || (isPlainObject(projection[top]) && leaf in projection[top]);
}

const findingKey = (item) => `${item.finding_code}|${[...item.evidence].sort().join(',')}`;

const canonical = (value) => digestOf(value);

// Checks a report written by the salpi model against the projection it was given. The audit clock
// belongs to the caller: `options.auditedAt` is required and the report must carry exactly it, so
// the model cannot move the clock to make a stale receipt look fresh.
export function validateSalpiAuditReport(rawReport, rawProjection, options = {}) {
  if (typeof options.auditedAt !== 'string' || !UTC_MS.test(options.auditedAt)) {
    throw new TypeError('auditedAt (caller clock, UTC ms) is required');
  }
  const violations = [];
  const add = (code) => { if (!violations.includes(code)) violations.push(code); };
  const verdict = validateSafeProjection(rawProjection);
  if (verdict.status !== 'OK') return { status: 'HOLD', violations: [REPORT_VIOLATION_CODES.projection] };
  const projection = verdict.value;

  if (!isPlainObject(rawReport)) return { status: 'HOLD', violations: [REPORT_VIOLATION_CODES.shape] };
  let report;
  try { report = JSON.parse(JSON.stringify(rawReport)); } catch { return { status: 'HOLD', violations: [REPORT_VIOLATION_CODES.shape] }; }

  for (const key of Object.keys(report)) if (!REPORT_KEYS.includes(key)) add(REPORT_VIOLATION_CODES.unknownField);
  if (report.schema_version !== AUDIT_REPORT_SCHEMA_VERSION || report.checklist_id !== MAIL_CHECKLIST_ID
    || report.claim_ceiling !== AUDIT_CLAIM_CEILING || !STATUSES.includes(report.overall)
    || report.audited_at !== options.auditedAt) add(REPORT_VIOLATION_CODES.shape);
  if (report.projection_digest !== verdict.digest || report.scope_ref !== projection.scope_ref
    || report.projection_hold_code !== null) {
    add(REPORT_VIOLATION_CODES.projection);
  }
  if (!isPlainObject(report.authority) || Object.keys(report.authority).length !== AUTHORITY_KEYS.length
    || AUTHORITY_KEYS.some((key) => report.authority[key] !== false)) add(REPORT_VIOLATION_CODES.authority);

  const findings = isDenseArray(report.findings) ? report.findings : (add(REPORT_VIOLATION_CODES.shape), []);
  if (new Set(findings.map((item) => (isPlainObject(item) && isDenseArray(item.evidence) ? findingKey(item) : canonical(item)))).size !== findings.length) add(REPORT_VIOLATION_CODES.unsupported);
  for (const item of findings) {
    if (!isPlainObject(item)) { add(REPORT_VIOLATION_CODES.shape); continue; }
    if (Object.keys(item).some((key) => !FINDING_KEYS.includes(key))) add(REPORT_VIOLATION_CODES.freeText);
    const entry = FINDING_CATALOG[item.finding_code];
    if (entry === undefined) { add(REPORT_VIOLATION_CODES.unknownCode); continue; }
    if (item.check_group !== entry.group || item.status !== entry.status || item.escalate_to !== entry.escalate_to) {
      add(REPORT_VIOLATION_CODES.catalogMismatch);
    }
    if (!isDenseArray(item.evidence) || item.evidence.length === 0
      || !item.evidence.every((pointer) => resolvesIn(projection, pointer))) add(REPORT_VIOLATION_CODES.evidence);
  }

  const unknowns = isDenseArray(report.unknowns) ? report.unknowns : (add(REPORT_VIOLATION_CODES.shape), []);
  for (const item of unknowns) {
    if (!isPlainObject(item) || Object.keys(item).some((key) => !UNKNOWN_KEYS.includes(key))) { add(REPORT_VIOLATION_CODES.freeText); continue; }
    if (!UNKNOWN_REASONS.includes(item.reason_code) || typeof item.pointer !== 'string' || !POINTER.test(item.pointer)) {
      add(REPORT_VIOLATION_CODES.shape);
    }
    // Every value is an enum; a sentence in `input` or `check` is free text.
    if (('input' in item && !MAIL_INPUTS.includes(item.input))
      || ('check' in item && !CONSISTENCY_RULES.some((rule) => rule.code === item.check))) add(REPORT_VIOLATION_CODES.freeText);
  }
  if (!isDenseArray(report.hold_codes) || !report.hold_codes.every((code) => Object.values(REPORT_HOLD_CODES).includes(code))) {
    add(REPORT_VIOLATION_CODES.shape);
  }

  // Compare with the deterministic reference: nothing invented, nothing dropped, nothing softened.
  const reference = auditMailProjection(projection, {
    auditedAt: options.auditedAt,
    maxReceiptAgeSeconds: options.maxReceiptAgeSeconds,
    previous: options.previous,
  });
  const expected = new Set(reference.findings.map(findingKey));
  const given = new Set(findings.filter((item) => isPlainObject(item) && isDenseArray(item.evidence)).map(findingKey));
  for (const key of given) if (!expected.has(key)) add(REPORT_VIOLATION_CODES.unsupported);
  for (const key of expected) if (!given.has(key)) add(REPORT_VIOLATION_CODES.dropped);
  if (report.overall !== reference.overall) {
    add(SEVERITY[report.overall] < SEVERITY[reference.overall] && reference.overall === 'HOLD'
      ? REPORT_VIOLATION_CODES.holdReleased
      : REPORT_VIOLATION_CODES.overall);
  }
  // UNKNOWNs are compared by content, not count: each reference UNKNOWN must be present as-is and
  // nothing else may appear, so a real UNKNOWN cannot be swapped for a harmless-looking one.
  const expectedUnknowns = reference.unknowns.map(canonical);
  const givenUnknowns = unknowns.map(canonical);
  if (expectedUnknowns.some((key) => !givenUnknowns.includes(key))) add(REPORT_VIOLATION_CODES.unknownFilled);
  if (givenUnknowns.some((key) => !expectedUnknowns.includes(key))
    || new Set(givenUnknowns).size !== givenUnknowns.length) add(REPORT_VIOLATION_CODES.unsupported);
  if (isDenseArray(report.hold_codes)) {
    if (reference.hold_codes.some((code) => !report.hold_codes.includes(code))) add(REPORT_VIOLATION_CODES.holdReleased);
    if (report.hold_codes.some((code) => !reference.hold_codes.includes(code))
      || new Set(report.hold_codes).size !== report.hold_codes.length) add(REPORT_VIOLATION_CODES.unsupported);
  }

  return violations.length === 0 ? { status: 'OK', violations: [] } : { status: 'HOLD', violations };
}

export const reportDigest = (report) => digestOf(report);
