import path from 'node:path';
import { createLinearReadEvidenceReader } from '../linear_history/linear_read_evidence_reader.mjs';
import { validateLinearCollectState, identityDigestForBinding } from '../linear_history/linear_collect_runner.mjs';
import { validateLinearCollectRunReceipt } from '../linear_history/linear_collect_receipt.mjs';
import { sha256Canonical } from '../shared/project_history_envelope.mjs';
import { verifyAgentWorkforceAuthorityClaim } from '../agent_observation/agent_authority_verification.mjs';
import { createLinearFeedbackSource } from './feedback_linear_source.mjs';
import { createFeedbackRequestProvider } from './feedback_request_provider.mjs';
import { normalizeTaskPacket } from './claim_task.mjs';
import { readRuntimeJson, runtimeCheck as check, runtimeHash as hash, runtimeRef as ref, runtimeExact as exact, writeRuntimeEvidence } from './feedback_runtime_io.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const current = (v, now) => Number.isFinite(Date.parse(v.valid_from)) && Number.isFinite(Date.parse(v.valid_until))
  && Date.parse(v.valid_from) <= now && now < Date.parse(v.valid_until);
const GRANT_KEYS = ['grant_ref', 'authority_ref', 'authority_revision', 'scope_ref', 'project_code', 'issuer_ref', 'selection_authority',
  'actions', 'allowed_kinds', 'allowed_states', 'allowed_write_paths', 'acceptance_checks', 'valid_from', 'valid_until',
  'agent_group', 'input_class', 'g2_leader_ref', 'maximum_issues'];

// Standing scope grant is separately installer-pinned, outside any model-editable
// scope. Workforce verification proves actor binding, not the grant itself.
// Only this separate explicit grant permits issue selection/request issuance.
export function createFeedbackRuntimeIssuer({ db, deployment, evidenceRoot, assertDeployment = async () => {}, now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS dev_feedback_issued_request (
    request_ref TEXT PRIMARY KEY, source_ref TEXT NOT NULL, semantic_sha256 TEXT NOT NULL,
    projection_sha256 TEXT NOT NULL, grant_sha256 TEXT NOT NULL, packet_sha256 TEXT NOT NULL,
    issued_json TEXT NOT NULL, UNIQUE(source_ref,semantic_sha256));`);
  const reader = createLinearReadEvidenceReader({ root: deployment.linear.expectedBinding.custody_root,
    expectedBinding: deployment.linear.expectedBinding, maxAgeMs: deployment.linear.maxAgeMs, now });
  let selections = new Map(), prepared = new Map(), source;
  let selectionState = { observed: 0, eligible: 0, prepared: 0, preparation_pending: 0 };
  async function authority() {
    await assertDeployment();
    const currentDescriptor = deployment.workforce.current.mode === 'current_state'
      ? { path: deployment.workforce.current.path, sha256: null } : deployment.workforce.current;
    const [grant, claim, pin, supplied] = await Promise.all([deployment.grant, deployment.workforce.claim,
      deployment.workforce.pin, currentDescriptor].map(d => readRuntimeJson(d)));
    check(exact(grant, GRANT_KEYS) && [grant.grant_ref, grant.authority_ref, grant.authority_revision, grant.scope_ref, grant.issuer_ref, grant.g2_leader_ref].every(ref)
      && grant.agent_group === 'G1' && grant.input_class === 'g2_public_code_projection'
      && grant.selection_authority === 'internal_feedback_source' && current(grant, now())
      && Number.isInteger(grant.maximum_issues) && grant.maximum_issues > 0 && grant.maximum_issues <= 256
      && [grant.actions, grant.allowed_kinds, grant.allowed_states, grant.allowed_write_paths, grant.acceptance_checks].every(a => Array.isArray(a) && a.length > 0 && a.length <= 64), 'FEEDBACK_STANDING_GRANT_INVALID');
    check(grant.scope_ref === deployment.linear.expectedBinding.project_scope_ref && grant.project_code === deployment.linear.expectedBinding.project_code
      && grant.g2_leader_ref === deployment.g2LeaderRef, 'FEEDBACK_STANDING_GRANT_SCOPE');
    check(Number.isFinite(Date.parse(supplied.evaluated_at)) && Date.parse(supplied.evaluated_at) <= now()
      && now() - Date.parse(supplied.evaluated_at) <= deployment.authorityMaxAgeMs, 'FEEDBACK_CURRENT_AUTHORITY_STALE');
    // Current wall-clock expiry is verified again, not borrowed from a historical
    // verifier evaluation timestamp supplied in the file.
    const verified = verifyAgentWorkforceAuthorityClaim(claim, pin, { ...supplied, evaluated_at: new Date(now()).toISOString() });
    check(verified.status === 'VERIFIED_ACTIVE_BINDING' && verified.authority_ref === grant.authority_ref
      && verified.project_scope_ref === grant.scope_ref, 'FEEDBACK_CURRENT_AUTHORITY_DENIED');
    return grant;
  }
  async function enumerate(grant) {
    const pins = deployment.linear.expectedBinding;
    const stateDescriptor = { path: path.join(pins.state_root, 'state', 'linear-collect.json'), sha256: null };
    const state = await readRuntimeJson(stateDescriptor, 8 * 1024 * 1024);
    const binding = { lane_id: pins.lane_id, writer: { authority_id: pins.writer_authority_id, epoch: pins.writer_epoch }, workspace: { url_key: pins.workspace_url_key } };
    validateLinearCollectState(state, { binding, identity_digest: identityDigestForBinding(binding) });
    check(ref(state.last_run_id) && !state.last_run_id.includes(':') && !state.last_run_id.includes('/'), 'FEEDBACK_COLLECTION_STATE_INVALID');
    const receipt = await readRuntimeJson({ path: path.join(pins.state_root, 'receipts', `${state.last_run_id}.json`), sha256: null }, 128 * 1024);
    validateLinearCollectRunReceipt(receipt);
    check(receipt.status === 'ok' && receipt.binding_sha256 === pins.binding_sha256 && receipt.organization_id === pins.organization_id
      && receipt.lane_id === pins.lane_id && receipt.workspace_url_key === pins.workspace_url_key
      && receipt.writer_authority_id === pins.writer_authority_id && receipt.writer_epoch === pins.writer_epoch
      && receipt.generation_seq === state.cursor.generation_seq && receipt.run_id === state.last_run_id
      && receipt.generation_seq > 0 && receipt.cursor_before.generation_seq + 1 === receipt.generation_seq
      && receipt.completed_at === state.last_completed_at && sha256Canonical(receipt.cursor_after) === sha256Canonical(state.cursor)
      && state.cursor.backfill === null && receipt.coverage_gaps.every(g => g === 'polling_cannot_prove_hard_deletes')
      && Date.parse(receipt.window.upper) <= Date.parse(receipt.started_at)
      && Date.parse(state.cursor.watermark) <= Date.parse(receipt.started_at)
      && now() - Date.parse(state.cursor.watermark) <= deployment.linear.maxAgeMs
      && Date.parse(state.last_completed_at) <= now() && now() - Date.parse(state.last_completed_at) <= deployment.linear.maxAgeMs,
    'FEEDBACK_COLLECTION_NOT_CURRENT');
    const ids = Object.keys(state.object_index).filter(key => key.startsWith('read_evidence:')).map(key => key.slice(14)).sort();
    check(ids.length <= grant.maximum_issues && ids.every(id => UUID.test(id) && state.object_index[`issues:${id}`]), 'FEEDBACK_ENUMERATION_BOUNDARY');
    const observed = [];
    for (const issueId of ids) {
      const value = await reader.resolve({ issueId });
      if (value.hold_code === 'LINEAR_PROJECT_SCOPE_MISMATCH') continue;
      check(value.status === 'CURRENT' && value.generation_seq === state.cursor.generation_seq, 'FEEDBACK_ENUMERATION_INCOMPLETE');
      observed.push(value);
    }
    check(sha256Canonical(await readRuntimeJson(stateDescriptor, 8 * 1024 * 1024)) === sha256Canonical(state), 'FEEDBACK_ENUMERATION_CHANGED');
    return observed;
  }
  async function projectionIndex(grant) {
    const index = await readRuntimeJson({ path: path.join(deployment.projectionRoot, 'current.json'), sha256: null });
    check(exact(index, ['producer_ref', 'scope_ref', 'valid_from', 'valid_until', 'generation', 'projections'])
      && index.producer_ref === grant.g2_leader_ref && index.scope_ref === grant.scope_ref && current(index, now())
      && Number.isInteger(index.generation) && index.generation > 0 && Array.isArray(index.projections)
      && index.projections.length <= grant.maximum_issues, 'FEEDBACK_G2_PROJECTION_INDEX_INVALID');
    check(new Set(index.projections.map(p => p.issue_id)).size === index.projections.length, 'FEEDBACK_G2_PROJECTION_DUPLICATE');
    return index;
  }
  async function loadProjection(grant, observed, index) {
    const descriptor = index.projections.find(p => p.issue_id === observed.issue_id);
    if (!descriptor) return null; // G2 preparation pending, not permission inferred.
    check(exact(descriptor, ['issue_id', 'file', 'sha256']) && /^[A-Za-z0-9_.-]+\.json$/u.test(descriptor.file)
      && typeof descriptor.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(descriptor.sha256), 'FEEDBACK_G2_PROJECTION_DESCRIPTOR');
    const p = await readRuntimeJson({ path: path.join(deployment.projectionRoot, descriptor.file), sha256: descriptor.sha256 });
    check(exact(p, ['projection_ref', 'producer_ref', 'content_class', 'issue_id', 'issue_content_sha256', 'scope_ref', 'kind',
      'summary', 'allowed_write_paths', 'acceptance_checks', 'valid_from', 'valid_until', 'echo'])
      && ref(p.projection_ref) && p.producer_ref === grant.g2_leader_ref && p.content_class === 'public_safe_code'
      && p.issue_id === observed.issue_id && p.issue_content_sha256 === observed.issue_content_sha256 && p.scope_ref === grant.scope_ref
      && grant.allowed_kinds.includes(p.kind) && ['bug', 'feature', 'improvement'].includes(p.kind) && current(p, now())
      && typeof p.summary === 'string' && p.summary.length > 0 && p.summary.length <= 2000
      && [p.allowed_write_paths, p.acceptance_checks].every(a => Array.isArray(a) && a.length > 0 && new Set(a).size === a.length)
      && p.allowed_write_paths.every(v => grant.allowed_write_paths.includes(v) && deployment.runner.allowedFiles.includes(v))
      && p.acceptance_checks.every(v => grant.acceptance_checks.includes(v) && deployment.runner.validationCatalog.some(c => c.check_id === v)), 'FEEDBACK_G2_PROJECTION_UNBOUND');
    return { projection: p, projection_sha256: descriptor.sha256 };
  }
  async function listDelegations() {
    selectionState = { observed: 0, eligible: 0, prepared: 0, preparation_pending: 0 };
    const grant = await authority(); check(grant.actions.includes('issue_request'), 'FEEDBACK_REQUEST_ISSUANCE_DENIED');
    const observations = await enumerate(grant), index = await projectionIndex(grant), next = new Map();
    prepared.clear(); selectionState.observed = observations.length;
    for (const observation of observations) {
      if (!grant.allowed_states.includes(observation.linear_task.task_status)) continue;
      selectionState.eligible++;
      const p = await loadProjection(grant, observation, index);
      if (!p) { selectionState.preparation_pending++; continue; }
      selectionState.prepared++;
      const delegation = { delegation_ref: `feedback.delegation.${hash([grant.grant_ref, observation.issue_id]).slice(0, 32)}`,
        authority_revision: grant.authority_revision, issue_id: observation.issue_id, scope_ref: grant.scope_ref,
        kind: p.projection.kind, status: 'CURRENT', selection_authority: 'internal_feedback_source',
        valid_from: grant.valid_from, valid_until: grant.valid_until };
      next.set(delegation.delegation_ref, { delegation, ...p, observation, grant_sha256: hash(grant) });
    }
    check(hash(await authority()) === hash(grant) && hash(await projectionIndex(grant)) === hash(index), 'FEEDBACK_SELECTION_CHANGED');
    selections = next; return [...next.values()].map(v => v.delegation);
  }
  async function currentDelegation(delegationRef) {
    const selected = selections.get(delegationRef); if (!selected) return null;
    try {
      const grant = await authority(); if (hash(grant) !== selected.grant_sha256) return null;
      const observed = await reader.resolve({ issueId: selected.delegation.issue_id });
      if (observed.status !== 'CURRENT' || !grant.allowed_states.includes(observed.linear_task.task_status)) return null;
      const p = await loadProjection(grant, observed, await projectionIndex(grant));
      if (!p || p.projection_sha256 !== selected.projection_sha256) return null;
      return selected.delegation;
    } catch { return null; }
  }
  source = createLinearFeedbackSource({ reader, listDelegations, currentDelegation, now });
  async function resolveRequest(sourceRef, semantic) {
    const selected = [...selections.values()].find(s => `linear.issue:${s.delegation.issue_id}` === sourceRef);
    check(selected && await currentDelegation(selected.delegation.delegation_ref) && await source.current(sourceRef, semantic), 'FEEDBACK_ISSUER_SOURCE_CHANGED');
    const grant = await authority(), p = selected.projection;
    const packet = { schema_version: 'soulforge.dev_worker_request.v0', task_id: `feedback_${hash([sourceRef, semantic]).slice(0, 24)}`,
      status: 'ready', summary: p.summary, project_code: grant.project_code, allowed_write_paths: p.allowed_write_paths,
      acceptance_checks: p.acceptance_checks, draft_branch_allowed: true, origin: { kind: 'agent_generated', projection_ref: p.projection_ref },
      owner_approval: { required: true, approved: true, approved_by: grant.issuer_ref } };
    check(normalizeTaskPacket(packet, { packet_path: 'feedback.yaml', packet_ref: sourceRef }).eligible, 'FEEDBACK_ISSUED_PACKET_INVALID');
    const issued = { request_ref: `feedback.request.${hash([sourceRef, semantic]).slice(0, 32)}`, source_ref: sourceRef, semantic_sha256: semantic,
      authority_ref: grant.authority_ref, authority_revision: grant.authority_revision, valid_from: grant.valid_from, valid_until: grant.valid_until, packet };
    const prior = db.prepare('SELECT * FROM dev_feedback_issued_request WHERE source_ref=? AND semantic_sha256=?').get(sourceRef, semantic);
    if (prior) check(prior.issued_json === JSON.stringify(issued) && prior.projection_sha256 === selected.projection_sha256, 'FEEDBACK_ISSUED_REQUEST_CONFLICT');
    else {
      await writeRuntimeEvidence(evidenceRoot, 'issued', issued.request_ref, { issued, projection: p, projection_sha256: selected.projection_sha256, grant_sha256: hash(grant) });
      db.prepare('INSERT INTO dev_feedback_issued_request VALUES(?,?,?,?,?,?,?)').run(issued.request_ref, sourceRef, semantic,
        selected.projection_sha256, hash(grant), hash(packet), JSON.stringify(issued));
    }
    prepared.set(hash(packet), { item: { source_ref: sourceRef, semantic_sha256: semantic, scope_ref: grant.scope_ref }, projection: p });
    return issued;
  }
  const provider = createFeedbackRequestProvider({ resolveRequest, now, currentAuthority: async assertion => {
    try {
      const grant = await authority(), row = db.prepare('SELECT * FROM dev_feedback_issued_request WHERE request_ref=?').get(assertion.request_ref);
      return !!row && row.source_ref === assertion.source_ref && row.semantic_sha256 === assertion.semantic_sha256
        && row.packet_sha256 === assertion.packet_sha256 && row.grant_sha256 === hash(grant)
        && assertion.scope_ref === grant.scope_ref && assertion.authority_ref === grant.authority_ref
        && assertion.authority_revision === grant.authority_revision && current(grant, now());
    } catch { return false; }
  } });
  return { source, prepare: provider.prepare, async authorize(action, item, execution) {
    try {
      const grant = await authority(); if (!grant.actions.includes(action)) return false;
      // Source observation is a read/selection gate. It must not issue a work
      // request for an already completed or exact-echo revision before claiming.
      if (action === 'observe') return item.scope_ref === grant.scope_ref && await source.current(item.source_ref, item.semantic_sha256);
      if (action === 'recover') {
        const row = db.prepare('SELECT * FROM dev_feedback_issued_request WHERE source_ref=? AND semantic_sha256=?').get(item.source_ref, item.semantic_sha256);
        return !!row && row.grant_sha256 === hash(grant) && item.scope_ref === grant.scope_ref
          && execution?.packet_sha256 === row.packet_sha256;
      }
      return await provider.authorize(action, item, execution);
    } catch { return false; }
  }, async authorizePacket(action, packetDigest) {
    const selected = prepared.get(packetDigest); return !!selected && await this.authorize(action, selected.item, { packet_sha256: packetDigest });
  }, prepared, authority, selectionState: () => ({ ...selectionState }),
  selection(sourceRef) { return [...selections.values()].find(s => `linear.issue:${s.delegation.issue_id}` === sourceRef) ?? null; } };
}
