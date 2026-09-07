import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digestOf } from '../../../../../guild_hall/agent_observation/guard_primitives.mjs';
import { AGENT_AUTHORITY_CURRENT_STATE_SCHEMA, AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
  computeUnverifiedAgentApprovalClaimDigest } from '../../../../../guild_hall/agent_observation/agent_authority_verification.mjs';
import { EXECUTOR_AUTHORITY_BINDING_SCHEMA, TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA } from '../../src/candidate_execution_authority_adapter.mjs';
import { createWorkbenchCurrentSources } from '../../src/workbench_current_sources.mjs';
import { createWorkbenchExecutionSources, SYNTHETIC_WORKER_URL, workbenchExecutionRequestBasis } from '../../src/workbench_execution_sources.mjs';
import { createLinearReadEvidenceReader } from '../../../../../guild_hall/linear_history/linear_read_evidence_reader.mjs';
import { createWorkbenchIntakeStore } from '../../../team-ops-board/src/server/workbench-intake-store.mjs';
import { makeWorkbenchFixture, addSyntheticLinearEvidence, hash } from './workbench_fixture.mjs';

export async function makeWorkbenchExecutionFixture({ timeoutMs = 2000, delayMs = 0 } = {}) {
  const fixture = await makeWorkbenchFixture();
  const linear = await addSyntheticLinearEvidence(fixture, { stateName: 'Todo' });
  const intakeSources = createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding,
    linearReaderFactory: createLinearReadEvidenceReader });
  const access = { requester: fixture.requester, canAccessProject: async () => true, checkSession: async () => true };
  const request = (await intakeSources.catalogue(access)).entries[0].request;
  const intakeStore = createWorkbenchIntakeStore({ root: fixture.intakeRoot });
  const recorded = await intakeStore.record(request, { trusted_evidence: await intakeSources.evidence({ ...access, request }),
    request_id: `w_${'a'.repeat(32)}`, created_at: new Date().toISOString() });
  if (recorded.status !== 'RECORDED') throw new Error('Synthetic intake failed');
  const scope = `project:${request.project_code}`;
  const task = { provider: 'linear', task_id: 'SYN-1' };
  const assignment = { assignment_id: 'assignment.synthetic.1', task_ref: 'linear.task:syn-1', intent_id: 'intent.synthetic.1',
    primary_role: 'role.synthetic.review', actor_ref: 'actor.synthetic.review', authority_ref: 'authority.synthetic.task', assignment_epoch: 11,
    expires_at: new Date(Date.now() + 86400000).toISOString() };
  const brief = { brief_id: 'brief.synthetic.1', assignment_id: assignment.assignment_id, task_ref: assignment.task_ref,
    intent_id: assignment.intent_id, primary_role: assignment.primary_role, problem: 'Synthetic execution-boundary verification.',
    requested_outcome: 'Produce one local synthetic verification candidate.', allowed_write_scope: ['workspace.synthetic.candidate'],
    required_evidence: ['receipt.synthetic.compute'], stop_conditions: ['Stop on changed inputs or authority.'], escalation_path: 'role.synthetic.reviewer',
    input_bundle_manifest_digest: request.input_revision.slice(7), required_review_role: 'role.synthetic.reviewer',
    source_draft_ref: 'draft.synthetic.1', expires_at: assignment.expires_at };
  const packet = { forge_official_task: { task_ref: assignment.task_ref, writer_ref: 'writer.synthetic.approved', intent_id: assignment.intent_id },
    forge_assignment: assignment, forge_issued_work_brief: brief, linear_official_task_read_evidence: linear.envelope.evidence,
    execution_binding: { schema_version: 'soulforge.forge_linear.execution_binding.v0', candidate_ref: 'candidate.synthetic.1', project_scope_ref: scope,
      action_ref: 'action.synthetic.review', authority_ref: assignment.authority_ref, required_role_ref: assignment.primary_role,
      required_capability_refs: ['cap.synthetic.compute'], responsible_actor_ref: assignment.actor_ref,
      source_receipt_refs: [...linear.envelope.evidence.source_receipt_refs], assignment_id: assignment.assignment_id,
      assignment_authority_ref: assignment.authority_ref, assignment_epoch: assignment.assignment_epoch, assignment_state: 'current',
      work_brief_revision_id: brief.brief_id, work_brief_content_sha256: digestOf(brief), parent_task_ref: null } };
  const roles = { schema_version: 'soulforge.organization.role_snapshot.v1', roles: [{ role_ref: assignment.primary_role, status: 'active',
    responsible_action_refs: [packet.execution_binding.action_ref], responsible_actor_ref: assignment.actor_ref, candidate_actor_refs: [assignment.actor_ref] }] };
  roles.snapshot_ref = { revision_id: 'roles.synthetic.1', content_sha256: digestOf(roles.roles) };
  const capabilities = { schema_version: 'soulforge.organization.capability_snapshot.v1', actor_bindings: [{ actor_ref: assignment.actor_ref,
    performing_agent_id: 'agent.synthetic.review', bot_ref: 'bot.synthetic.review', executor_ref: 'executor.workbench.synthetic.v1', status: 'active', capability_refs: ['cap.synthetic.compute'] }] };
  capabilities.snapshot_ref = { revision_id: 'capabilities.synthetic.1', content_sha256: digestOf(capabilities.actor_bindings) };
  const policy = { schema_version: 'soulforge.assignment_policy.snapshot.v1', validation_state: 'prevalidated', mode: 'responsible_ceo_triage',
    policy_revision_ref: { revision_id: 'assignment-policy.synthetic.1', content_sha256: digestOf({ mode: 'responsible_ceo_triage' }) } };
  const digest = digit => `sha256:${digit.repeat(64)}`;
  const projection = { project_scope_ref: scope, project_scope_refs: [scope], lineage_digest: digest('1'), family_ref: 'family.synthetic',
    family_digest: digest('2'), mark_ref: 'mark.synthetic', mark_digest: digest('3'), deployment_ref: 'deployment.synthetic', deployment_digest: digest('4'),
    memory_generation_ref: 'memory.synthetic', memory_digest: digest('5'), authority_receipt_ref: 'approval.synthetic.agent', authority_receipt_verified: false };
  const instant = Date.now(); const date = offset => new Date(instant + offset).toISOString();
  const pin = { schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA, pin_ref: 'pin.synthetic.agent', verification_receipt_ref: 'verification.synthetic.agent',
    owner_ref: 'owner.synthetic', authority_ref: 'authority.synthetic.agent', verifier_ref: 'verifier.synthetic', project_scope_ref: scope,
    ...Object.fromEntries(['lineage_digest', 'family_ref', 'family_digest', 'mark_ref', 'mark_digest', 'deployment_ref', 'deployment_digest',
      'memory_generation_ref', 'memory_digest', 'authority_receipt_ref'].map(key => [key, projection[key]])),
    approval_claim_digest: computeUnverifiedAgentApprovalClaimDigest(projection, scope).claim_digest, authority_receipt_digest: digest('6'),
    claim_ceiling: 'validated_private', issued_at: date(-3000), verified_at: date(-2000), expires_at: date(60000),
    receipt_epoch: 7, trusted_authority_epoch: 7, revoked: false };
  const authorityCurrent = { schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA, evaluation_ref: 'authority-current.synthetic',
    evaluated_at: date(-1000), authority_ref: pin.authority_ref, current_authority_epoch: 7, revoked_pin_refs: [], claim_ceiling: 'validated_private' };
  const executorBinding = { schema_version: EXECUTOR_AUTHORITY_BINDING_SCHEMA, assignment_epoch: 11, project_scope_ref: scope,
    family_ref: projection.family_ref, mark_ref: projection.mark_ref, role_snapshot_ref: roles.snapshot_ref, capability_snapshot_ref: capabilities.snapshot_ref,
    responsible_role_ref: assignment.primary_role, required_capability_refs: ['cap.synthetic.compute'], actor_ref: assignment.actor_ref,
    performing_agent_id: 'agent.synthetic.review', bot_ref: 'bot.synthetic.review', executor_ref: 'executor.workbench.synthetic.v1',
    profile_ref: 'profile.synthetic', session_ref: 'session.synthetic.fixed', deployment_ref: projection.deployment_ref, deployment_digest: projection.deployment_digest,
    requested_model: 'synthetic-code', requested_effort: 'none', observed_model: 'synthetic-code', observed_effort: 'none',
    tool_authority_ref: 'tool-authority.synthetic', tool_authority_epoch: 3, tool_policy_digest: digest('7'),
    authorized_tool_refs: ['tool.synthetic.compute'], required_tool_refs: ['tool.synthetic.compute'] };
  const executorCurrent = { schema_version: TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA, status: 'TRUSTED_CURRENT', evaluation_ref: 'executor-current.synthetic',
    evaluated_at: date(0), authority_state_evaluation_ref: authorityCurrent.evaluation_ref, authority_ref: pin.authority_ref,
    current_authority_epoch: 7, current_assignment_epoch: 11, active_slot_state: 'idle', active_run_ref: null, revoked_binding_refs: [],
    ...Object.fromEntries(['project_scope_ref', 'family_ref', 'mark_ref', 'performing_agent_id', 'bot_ref', 'executor_ref', 'profile_ref', 'session_ref',
      'deployment_ref', 'deployment_digest', 'role_snapshot_ref', 'capability_snapshot_ref', 'responsible_role_ref', 'actor_ref',
      'required_capability_refs', 'observed_model', 'observed_effort', 'tool_authority_ref', 'tool_authority_epoch', 'tool_policy_digest', 'authorized_tool_refs']
      .map(key => [key, executorBinding[key]])) };
  const taskAuthorization = { approval_ref: 'approval.synthetic.task', state: 'approved', task_ref: task, project_scope_ref: scope,
    authority_ref: assignment.authority_ref, assignment_epoch: 11, approved_task_status: 'Todo', read_receipt_digest: linear.envelope.evidence.read_receipt_digest,
    work_brief_content_sha256: digestOf(brief), observed_at: date(-1000), valid_until: date(60000) };
  const documents = { packet, roles, capabilities, assignment_policy: policy, agent_projection: projection, authority_pin: pin,
    authority_current: authorityCurrent, executor_current: executorCurrent, executor_binding: executorBinding, task_authorization: taskAuthorization };
  const approval = { request_basis_digest: workbenchExecutionRequestBasis(request), linear: fixture.catalogue.entries[0].linear,
    executor_code_sha256: hash(await readFile(SYNTHETIC_WORKER_URL)), timeout_ms: timeoutMs, synthetic_delay_ms: delayMs };
  for (const [name, value] of Object.entries(documents)) approval[name] = await fixture.write(`execution-${name}.json`, value);
  const executionBinding = { binding_id: 'execution-binding.synthetic', realm_id: fixture.expectedBinding.realm_id,
    intake_binding_sha256: fixture.expectedBinding.content_sha256, mode: 'synthetic_fixed', generation: fixture.binding.generation,
    observed_at: date(-1000), valid_until: date(60000), approvals: [approval] };
  let executionDigest = (await fixture.write('execution-binding.json', executionBinding)).content_sha256;
  const executionRoot = join(fixture.root, 'execution'); await mkdir(executionRoot);
  const repinExecution = async () => {
    for (const [name, value] of Object.entries(documents)) approval[name] = await fixture.write(`execution-${name}.json`, value);
    executionDigest = (await fixture.write('execution-binding.json', executionBinding)).content_sha256; return executionDigest;
  };
  const sources = () => createWorkbenchExecutionSources({ intakeSources, bindingDigest: executionDigest });
  return { ...fixture, request, record: recorded.record, intakeSources, intakeStore, access, linear, executionRoot,
    executionDigest, executionBinding, approval, documents, repinExecution, executionSources: sources(), sources };
}
