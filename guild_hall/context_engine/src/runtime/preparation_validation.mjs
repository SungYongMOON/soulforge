// Independent validation of one preparation run. It reads the run record, the
// prepared documents, the coverage and the original grant, and recomputes every
// identity the preparer claimed. It holds no writer, opens no source root and
// never returns source text: findings carry refs and codes only.
//
// The validator is versioned apart from the preparer on purpose. Re-checking the
// same prepared bytes with a newer validator adds a report and leaves the run
// record untouched, so an old PASS and a new FAIL can both stand; changing the
// preparer instead produces a new run. A report pins the exact run, coverage and
// grant digests it examined, so it cannot be carried over to a different target.
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { ITEM_STATUSES, LOCATOR_REVISION_KINDS, PATH_REQUIRED_KINDS, SOURCE_COVERAGE_SCHEMA,
  SOURCE_PREPARATION_PURPOSE, SourceDocumentError, isInstant, isSafeToken, validateSourceDocument,
  validateSourceGrant } from './source_documents.mjs';
import { ADAPTER_PROFILES, PREPARATION_RUN_SCHEMA, PREPARER_ID, PREPARER_VERSION, codeInventoryConsistent,
  documentsDigest, inspectCodeClosure, inspectPreparerCode, matchesCanonical, preparationRulesDigest,
  totalDigest } from './preparation_run.mjs';

export const VALIDATION_REPORT_SCHEMA = 'soulforge.context_preparation_validation.v1';
export const VALIDATOR_ID = 'context-engine/preparation-validator';
export const VALIDATOR_VERSION = '0.2.0';
export const VALIDATOR_ENTRY = './preparation_validation.mjs';

// The validator pins its own bytes the same way the preparer does, so "which
// validator said PASS" is checkable rather than a hand-kept version string.
export function inspectValidatorCode() {
  return inspectCodeClosure([new URL(VALIDATOR_ENTRY, import.meta.url)]);
}
// Naming the validator must not be able to cost the report. An unreadable tree
// says so in the field rather than leaving a reader with nothing to read.
const validatorCodeDigest = () => {
  try { return inspectValidatorCode().code_digest; } catch { return null; }
};
export const CHECK_OUTCOMES = Object.freeze(['pass', 'fail', 'partial', 'not_run']);
// Named policy: which checks a report claims to have considered. A report states
// its policy, so a later policy cannot be read back onto an older report.
export const CHECK_POLICY_ID = 'preparation-integrity-v1';
export const CHECK_IDS = Object.freeze(['run_record_integrity', 'document_identity', 'coverage_integrity',
  'run_output_binding', 'grant_conditions', 'unit_locators', 'preparer_code_reproducible']);
export const MAX_FINDINGS_PER_CHECK = 20;

const SHA = /^sha256:[0-9a-f]{64}$/u;
// '/' cannot appear in a granted token, so it separates the parts unambiguously.
const itemKey = row => [row.source_kind, row.root_ref, row.item_id].join('/');
// Two rules, and no third. Comparing two values this module holds uses the total
// digest, which cannot throw whatever it is handed. Checking a digest that
// source_documents.mjs wrote asks matchesCanonical - "does it hash to this?" -
// so a value the canonical hash refuses answers no instead of ending the report.
// Nothing here enumerates what that hash refuses, so nothing here can fall behind it.
const same = (a, b) => totalDigest(a ?? null) === totalDigest(b ?? null);

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}

// Only the keys an adapter uses to name a revision. Scanning every string would
// read free locator text as a citation: the document adapter puts raw Markdown
// heading text into locator.section, and a heading that happens to contain a
// digest would fail honest output.
const REVISION_KEY = /_sha256$/u;
// Bounded and cycle-aware for the same reason `encode` is: this walks a locator a
// reader handed in, and a locator can be nested as deep as a parser will build.
// A walk that stops early finds no citation, which reads as "anchors nothing" -
// a finding, which is the right answer for a locator nobody can follow.
const LOCATOR_MAX_DEPTH = 64;
function shaValues(value, found = [], named = false, depth = 0, open = new Set()) {
  if (typeof value === 'string') { if (named && SHA.test(value)) found.push(value); return found; }
  if (value === null || typeof value !== 'object' || depth >= LOCATOR_MAX_DEPTH || open.has(value)) return found;
  open.add(value);
  try {
    if (Array.isArray(value)) for (const child of value) shaValues(child, found, named, depth + 1, open);
    else for (const [key, child] of Object.entries(value)) shaValues(child, found, REVISION_KEY.test(key), depth + 1, open);
  } finally { open.delete(value); }
  return found;
}

// The record's own self-consistency, independent of the tree it is read in.
function runRecordIntegrity({ run }) {
  const findings = [];
  if (run?.schema_version !== PREPARATION_RUN_SCHEMA) return { checked: 0, total: 1, findings: [{ code: 'run_schema_unexpected' }] };
  const { run_sha256: stated, ...body } = run;
  if (totalDigest(body) !== stated) findings.push({ code: 'run_sha256_mismatch' });
  if (run.preparer_id !== PREPARER_ID) findings.push({ code: 'preparer_id_unexpected' });
  if (!isSafeToken(run.preparer_version)) findings.push({ code: 'preparer_version_invalid' });
  if (!isSafeToken(run.preparation_run_id)) findings.push({ code: 'preparation_run_id_invalid' });
  if (!isInstant(run.started_at) || !isInstant(run.ended_at)
    || Date.parse(run.ended_at) < Date.parse(run.started_at)) findings.push({ code: 'run_interval_invalid' });
  // The file list must be the list the code digest was taken over, otherwise a
  // record could carry a true digest beside a fabricated inventory.
  if (!codeInventoryConsistent({ code_refs: run.preparer_code_refs, code_digest: run.preparer_code_digest })) {
    findings.push({ code: 'preparer_code_inventory_inconsistent' });
  }
  return { checked: 1, total: 1, findings };
}

// Recomputes each document key and text digest from the document's own fields,
// then recomputes the composite revision from the primary revision and the
// components the document lists. Without that second step a forger could append
// a component - widening the set of revisions a locator is allowed to cite -
// without moving either the document key or the text digest.
function documentIdentity({ documents }) {
  const findings = [];
  let checked = 0;
  for (const document of documents) {
    const doc_key = typeof document?.doc_key === 'string' ? document.doc_key : null;
    // A malformed document must be a finding, not an exception: otherwise a
    // tamper that breaks the shape prevents any FAIL report from existing.
    let identical = false;
    try { identical = validateSourceDocument(document); }
    catch { findings.push({ code: 'document_malformed', doc_key }); continue; }
    checked += 1;
    if (!identical) { findings.push({ code: 'document_identity_mismatch', doc_key }); continue; }
    if (!matchesCanonical({ primary: document.primary_revision_sha256, components: document.components },
      document.composite_revision_sha256)) findings.push({ code: 'document_composite_revision_mismatch', doc_key });
  }
  // A document the key builder refused was not checked, only reported.
  return { checked, total: documents.length, findings };
}

function coverageIntegrity({ coverage }) {
  if (coverage?.schema_version !== SOURCE_COVERAGE_SCHEMA || !Array.isArray(coverage.items)) {
    return { checked: 0, total: 1, findings: [{ code: 'coverage_schema_unexpected' }] };
  }
  const findings = [], { coverage_sha256: stated, ...body } = coverage;
  if (!matchesCanonical(body, stated)) findings.push({ code: 'coverage_sha256_mismatch' });
  const counts = Object.fromEntries(ITEM_STATUSES.map(status => [status, coverage.items.filter(row => row.status === status).length]));
  if (!same(counts, coverage.counts)) findings.push({ code: 'coverage_counts_mismatch' });
  const keys = coverage.items.map(itemKey);
  if (new Set(keys).size !== keys.length) findings.push({ code: 'coverage_duplicate_item' });
  for (const row of coverage.items) {
    if (row.status === 'prepared' ? !SHA.test(row.doc_key ?? '') : row.doc_key !== null) {
      findings.push({ code: 'coverage_row_status_inconsistent', item: itemKey(row) });
    }
  }
  return { checked: coverage.items.length, total: coverage.items.length, findings };
}

// The record must describe these exact outputs, not merely well-formed ones.
function runOutputBinding({ run, documents, coverage, changes, summary }) {
  const findings = [];
  if (documents.some(document => document.notObject === true)) findings.push({ code: 'document_entry_not_an_object' });
  if (run?.coverage_sha256 !== coverage?.coverage_sha256) findings.push({ code: 'run_coverage_ref_mismatch' });
  if (run?.document_count !== documents.length) findings.push({ code: 'run_document_count_mismatch' });
  if (run?.project_key !== coverage?.project_key) findings.push({ code: 'run_project_key_mismatch' });
  if (run?.grant_sha256 !== coverage?.grant_sha256) findings.push({ code: 'run_grant_ref_mismatch' });
  try {
    if (run?.documents_sha256 !== documentsDigest(documents)) findings.push({ code: 'run_documents_digest_mismatch' });
  } catch { findings.push({ code: 'run_documents_digest_uncomputable' }); }
  const prepared = (coverage?.items ?? []).filter(row => row.status === 'prepared').map(row => row.doc_key).sort();
  const keys = documents.map(document => document.doc_key).sort();
  if (!same(prepared, keys)) findings.push({ code: 'coverage_document_set_mismatch' });
  if (run?.changes_sha256 !== totalDigest(changes ?? null)) findings.push({ code: 'run_changes_digest_mismatch' });
  // detectSourceChanges decides changed vs unchanged off the coverage row's
  // revision, so a row naming a revision its document does not carry would
  // quietly corrupt the change set a reader gates on.
  const byKey = new Map(documents.map(document => [document?.doc_key, document]));
  for (const row of (coverage?.items ?? []).filter(item => item.status === 'prepared')) {
    const document = byKey.get(row.doc_key);
    if (document && document.composite_revision_sha256 !== row.composite_revision_sha256) {
      findings.push({ code: 'coverage_revision_differs_from_document', item: itemKey(row) });
    }
  }
  // The preparer's own grant summary travels with the result and must agree.
  if (summary?.grant_id !== run?.grant_id || summary?.grant_sha256 !== run?.grant_sha256
    || summary?.project_key !== run?.project_key) findings.push({ code: 'result_grant_summary_mismatch' });
  return { checked: 1, total: 1, findings };
}

function grantIndexOf(admittedGrant) {
  const index = new Map();
  for (const source of admittedGrant.sources) {
    for (const item of source.items) {
      index.set(itemKey({ source_kind: source.kind, root_ref: source.root_ref, item_id: item.item_id }), item);
    }
  }
  return index;
}

// Was every prepared thing actually granted, under the class, project, revision
// policy and validity window the grant named? This is the missing-condition check.
function grantConditions({ run, documents, coverage, grant, grantIndex }) {
  const findings = [];
  if (grantIndex === null) return { checked: 0, total: 1, findings: [{ code: 'grant_invalid' }] };
  if (!matchesCanonical(grant, run?.grant_sha256)) findings.push({ code: 'grant_sha256_mismatch' });
  if (exactRefIdentityKey(grant.project_ref) !== run?.project_key) findings.push({ code: 'grant_project_key_mismatch' });
  if (grant.grant_id !== run?.grant_id) findings.push({ code: 'grant_id_mismatch' });
  if (!grant.purposes.includes(SOURCE_PREPARATION_PURPOSE)) findings.push({ code: 'grant_purpose_missing' });
  if (!(Date.parse(run?.started_at) >= Date.parse(grant.valid_from)
    && Date.parse(run?.ended_at) < Date.parse(grant.valid_to))) findings.push({ code: 'run_outside_grant_window' });
  const covered = new Set((coverage?.items ?? []).map(itemKey));
  for (const row of coverage?.items ?? []) {
    if (!grantIndex.has(itemKey(row))) findings.push({ code: 'coverage_item_not_granted', item: itemKey(row) });
  }
  // The other direction matters more: a granted item that simply never appears is
  // a silently skipped condition, and reporting only the rows that are present
  // would never notice it.
  for (const key of grantIndex.keys()) {
    if (!covered.has(key)) findings.push({ code: 'granted_item_absent_from_coverage', item: key });
  }
  for (const document of documents) {
    const item = grantIndex.get(itemKey(document)) ?? null, doc_key = document.doc_key;
    if (item === null) { findings.push({ code: 'document_item_not_granted', doc_key }); continue; }
    if (document.project_key !== run?.project_key) findings.push({ code: 'document_project_mismatch', doc_key });
    if (document.grant_id !== grant.grant_id || document.grant_sha256 !== run?.grant_sha256) {
      findings.push({ code: 'document_grant_ref_mismatch', doc_key });
    }
    if (!grant.allowed_data_classes.includes(document.data_class)) findings.push({ code: 'document_data_class_not_allowed', doc_key });
    if (document.data_class !== item.data_class) findings.push({ code: 'document_data_class_differs_from_item', doc_key });
    if (document.revision_policy !== item.revision_policy) findings.push({ code: 'document_revision_policy_differs', doc_key });
    if (item.revision_policy === 'exact' && document.primary_revision_sha256 !== item.revision_sha256) {
      findings.push({ code: 'document_pinned_revision_differs', doc_key });
    }
    // Against the live constant, not the record's own copy: a fabricated record
    // must not get to declare which profile counts as correct.
    if (document.adapter_profile !== ADAPTER_PROFILES[document.source_kind]
      || document.adapter_profile !== (run?.adapter_profiles ?? {})[document.source_kind]) {
      findings.push({ code: 'document_adapter_profile_unexpected', doc_key });
    }
    if (!same(document.scope ?? null, item.scope ?? null)) findings.push({ code: 'document_scope_differs', doc_key });
  }
  const counted = documents.length + (coverage?.items ?? []).length;
  return { checked: counted, total: counted, findings };
}

// A unit must say where it came from, and every revision it names must be one the
// document actually holds. Checking only "nothing cited is unheld" would accept a
// locator stripped bare, so a kind whose adapter anchors to a revision must carry
// at least one - which revision is the adapter's business, since a Linear comment
// anchors to its own row rather than the issue snapshot. The document kind anchors
// by path and line range instead, so the revision rule does not apply to it; its
// units are still path-checked, and the inapplicable rule is stated as a limit.
function unitLocators({ documents, grantIndex }) {
  const findings = [], limits = [], unanchored = new Set();
  let units = 0, checked = 0;
  if (grantIndex === null) {
    const total = documents.reduce((sum, document) => sum + (document.units?.length ?? 0), 0);
    return { checked: 0, total, findings: [], outcome: 'not_run',
      limits: ['the grant could not be admitted, so granted paths were unknown and no locator was checked'] };
  }
  for (const document of documents) {
    const held = new Set([document.primary_revision_sha256, ...(document.components ?? []).map(component => component.sha256)]);
    const item = grantIndex?.get(itemKey(document)) ?? null, grantedPath = item?.path ?? null;
    const anchors = LOCATOR_REVISION_KINDS.includes(document.source_kind);
    const pathRequired = PATH_REQUIRED_KINDS.includes(document.source_kind);
    if (!anchors) unanchored.add(document.source_kind);
    for (const unit of document.units ?? []) {
      units += 1;
      // Counted when some locator rule applies to this kind, which is every kind
      // today: linear/voice anchor by revision, document by path, mail by both.
      if (anchors || pathRequired) checked += 1;
      const doc_key = document.doc_key, unit_id = unit.unit_id;
      const cited = shaValues(unit.locator);
      for (const value of cited) {
        if (!held.has(value)) findings.push({ code: 'locator_cites_unheld_revision', doc_key, unit_id });
      }
      // A locator must anchor to something the document holds. Which revision is
      // the adapter's business: a Linear comment anchors to its own row, not to
      // the issue snapshot, and both are revisions this document carries.
      if (anchors && cited.length === 0) findings.push({ code: 'locator_anchors_no_revision', doc_key, unit_id });
      const path = unit.locator?.path ?? null;
      if (pathRequired && path === null) findings.push({ code: 'locator_path_missing', doc_key, unit_id });
      if (path !== null && grantedPath !== null && !same(path, grantedPath)) {
        findings.push({ code: 'locator_path_not_granted', doc_key, unit_id });
      }
      if (path !== null && grantedPath === null) findings.push({ code: 'locator_path_without_granted_path', doc_key, unit_id });
    }
  }
  for (const kind of [...unanchored].sort()) {
    limits.push(`${kind} locators anchor by path and line range, not by revision; their units are not revision-checked`);
  }
  return { checked, total: units, findings, limits };
}

// Can this tree reproduce the run? A record made by different preparer code or
// rules is not defective, it is simply not reproducible here, so this reports
// `partial` with the reason rather than failing an untouched record.
function preparerCodeReproducible({ run, code, codeUnavailable }) {
  if (code === null) {
    return { checked: 0, total: 1, findings: [], outcome: 'not_run',
      limits: [codeUnavailable === null || codeUnavailable === undefined
        ? 'live preparer code comparison was not requested'
        : `this tree's preparer code could not be read (${codeUnavailable}), so nothing was compared against it`] };
  }
  const findings = [];
  if (run?.preparer_code_digest !== code.code_digest) {
    findings.push({ code: 'preparer_code_digest_differs' });
    if (run?.preparation_rules_digest !== preparationRulesDigest()) findings.push({ code: 'preparation_rules_digest_differs' });
  } else {
    // Bytes proven to be this tree's settle both what this tree declares as its
    // version and what its constants hash to. Either one differing beside this
    // tree's code digest is a contradiction, not another tree.
    const contradictions = [];
    if (run?.preparer_version !== PREPARER_VERSION) contradictions.push({ code: 'preparer_version_contradicts_code_digest' });
    if (run?.preparation_rules_digest !== preparationRulesDigest()) {
      contradictions.push({ code: 'preparation_rules_digest_contradicts_code_digest' });
    }
    if (contradictions.length > 0) return { checked: 1, total: 1, findings: contradictions };
  }
  if (findings.length === 0) return { checked: 1, total: 1, findings };
  return { checked: 1, total: 1, findings, outcome: 'partial',
    limits: ['run record was produced by other preparer code or rules; its bytes are not reproducible in this tree'] };
}

const CHECKS = Object.freeze({ run_record_integrity: runRecordIntegrity, document_identity: documentIdentity,
  coverage_integrity: coverageIntegrity, run_output_binding: runOutputBinding, grant_conditions: grantConditions,
  unit_locators: unitLocators, preparer_code_reproducible: preparerCodeReproducible });

function rollup(checks) {
  if (checks.some(check => !CHECK_OUTCOMES.includes(check.outcome))) throw new Error('preparation_validation_invalid');
  if (checks.some(check => check.outcome === 'fail')) return 'fail';
  if (checks.every(check => check.outcome === 'not_run')) return 'not_run';
  if (checks.some(check => check.outcome !== 'pass')) return 'partial';
  return 'pass';
}

/**
 * Reads only. `compareCode: false` skips the live preparer comparison, which is
 * the honest setting when re-checking an archived run in another tree.
 */
export function validatePreparationRun({ run, preparation, grant, validationRunId, checkedAt, compareCode = true } = {}) {
  if (!isSafeToken(validationRunId) || !isInstant(checkedAt)) throw new Error('preparation_validation_invalid');
  // Members are whatever a reader handed in. A null or non-object entry has to be
  // a finding, so it is kept and reported rather than dereferenced blindly.
  const documents = (Array.isArray(preparation?.documents) ? preparation.documents : [])
    .map(document => document !== null && typeof document === 'object' ? document : { doc_key: null, notObject: true });
  const coverage = preparation?.coverage ?? null;
  let admitted = null;
  try { admitted = validateSourceGrant(grant); } catch { admitted = null; }
  const grantIndex = admitted === null ? null : grantIndexOf(admitted.grant);
  // Reading this tree can fail (an unreadable or moved checkout). That is a
  // reason not to have compared, not a reason to have no report.
  let code = null, codeUnavailable = null;
  if (compareCode) {
    try { code = inspectPreparerCode(); }
    catch (error) { codeUnavailable = error instanceof SourceDocumentError ? error.code : 'preparer_code_unreadable'; }
  }
  const context = { run, documents, coverage, changes: preparation?.changes ?? null,
    summary: preparation?.grant ?? null, grant: admitted?.grant ?? null, grantIndex, code, codeUnavailable };
  const checks = CHECK_IDS.map(check_id => {
    // A check reads material a reader handed in, in whatever shape they had it.
    // Enumerating the shapes that break one has been short four times, so the
    // containment is here instead: a check that cannot run says so and the other
    // six still report. No check can end the report by meeting a value it did
    // not expect.
    let result;
    try { result = CHECKS[check_id](context); }
    catch { result = { checked: 0, total: 1, findings: [{ code: 'check_uncomputable' }], outcome: 'fail',
      limits: ['this check met a value it could not read; the other checks in this report still ran'] }; }
    const all = result.findings;
    const outcome = result.outcome ?? (all.length > 0 ? 'fail' : 'pass');
    const limits = [...(result.limits ?? [])];
    if (all.length > MAX_FINDINGS_PER_CHECK) limits.push(`findings truncated to ${MAX_FINDINGS_PER_CHECK} of ${all.length}`);
    return { check_id, outcome, scope: { checked: result.checked, total: result.total },
      findings: all.slice(0, MAX_FINDINGS_PER_CHECK), limits };
  });
  // Two different things, kept apart. `validated_run_sha256` is the target: the
  // exact record this report is evidence about, and it already covers the
  // coverage, documents and grant digests the record claimed. The `observed_*`
  // values are what the validator itself computed over the material it was
  // handed - a FAIL report must still point at its target, so a mismatch here is
  // a finding, never a reason for the report to stop covering the run.
  let observedDocuments = null;
  try { observedDocuments = documentsDigest(documents); } catch { observedDocuments = null; }
  const body = { schema_version: VALIDATION_REPORT_SCHEMA, validation_run_id: validationRunId, validator_id: VALIDATOR_ID,
    validator_version: VALIDATOR_VERSION, validator_code_digest: validatorCodeDigest(),
    check_policy: CHECK_POLICY_ID, policy_checks: [...CHECK_IDS],
    validated_run_sha256: run?.run_sha256 ?? null, project_key: run?.project_key ?? null,
    observed_coverage_sha256: coverage?.coverage_sha256 ?? null, observed_documents_sha256: observedDocuments,
    observed_grant_sha256: admitted?.grant_sha256 ?? null,
    checked_at: checkedAt, outcome: rollup(checks), checks,
    limits: ['Recomputation uses the same canonical hash function as the preparer, so it does not test that function itself.',
      'Originals are not reopened; this validates the prepared result against the run record and the grant.',
      'A report states one outcome for one target. It does not order two reports over the same run, so precedence between an earlier and a later report is the reader\'s decision, taken on validator_code_digest and checked_at.',
      'previous_coverage_sha256 and changes_sha256 are checked against the result handed in, not re-derived from the previous coverage, which this validator is not given.',
      'Document order is not bound: the documents digest sorts by document key, so a reordered list with the same members and bytes is not a finding.',
      'The run record is not a signature. It binds bytes to a claim, not a claim to an act: whoever can produce the bytes can produce a matching record, so a pass says these documents match this record, never that this record came from an actual preparation.',
      'A pass attests fidelity, not completeness: it says the record faithfully describes this result, never that every granted item was prepared. What is absent is in the coverage counts and the change set, both of which the record binds.'] };
  return deepFreeze({ ...body, report_sha256: totalDigest(body) });
}

// A report is evidence only for the exact run it examined. The record's digest is
// recomputed rather than read: a record that merely states a digest could
// otherwise carry another run's PASS by copying that field. Recomputed,
// `run_sha256` covers the record whole - coverage, documents and grant digests
// included - so data or scope that moved on yields a different run. This says
// nothing about which of two reports over the same run wins; see the precedence
// limit the report carries.
export function reportCovers(report, run) {
  if (report?.schema_version !== VALIDATION_REPORT_SCHEMA || run?.schema_version !== PREPARATION_RUN_SCHEMA
    || !SHA.test(run.run_sha256 ?? '')) return false;
  const { run_sha256: stated, ...body } = run;
  return totalDigest(body) === stated && report.validated_run_sha256 === stated
    && report.project_key === run.project_key;
}
