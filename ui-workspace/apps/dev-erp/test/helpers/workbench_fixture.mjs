// Isolated synthetic fixture. No live database, raw project sources, credentials or API.
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { digestOf } from '../../../../../guild_hall/agent_observation/guard_primitives.mjs';
import { compileStageRules, orderStageWork } from '../../../../../guild_hall/engineering_engine/engines/systems_engineering/rules/stage_rule_compiler.mjs';
import { mapTaskHierarchy, taskHierarchyDataDigest } from '../../../../../guild_hall/engineering_engine/engines/systems_engineering/rules/task_hierarchy_mapper.mjs';
import { requesterForAccount } from '../../src/workbench_current_sources.mjs';
import { sha256Canonical } from '../../../../../guild_hall/shared/project_history_envelope.mjs';
import { LINEAR_READ_OPERATIONS } from '../../../../../guild_hall/linear_history/linear_graphql_client.mjs';
import { runReceiptObjectKinds, validateLinearCollectRunReceipt } from '../../../../../guild_hall/linear_history/linear_collect_receipt.mjs';
import { identityDigestForBinding, readEvidenceRecordForIssue } from '../../../../../guild_hall/linear_history/linear_collect_runner.mjs';

export const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export async function makeWorkbenchFixture({ observedAt = new Date().toISOString(), validUntil = new Date(Date.now() + 3600000).toISOString() } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sf-workbench-synthetic-'));
  const intakeRoot = join(root, 'requests');
  const sourceRoot = join(root, 'sources');
  await mkdir(intakeRoot);
  await mkdir(sourceRoot);
  const write = async (name, value) => {
    const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(`${JSON.stringify(value)}\n`);
    await writeFile(join(sourceRoot, name), bytes);
    return { path: name, content_sha256: hash(bytes) };
  };
  const seed = JSON.parse(await readFile(new URL('../../../../../docs/architecture/workspace/examples/se_stage_rules/stage_work_order_synthetic_v0.json', import.meta.url), 'utf8'));
  const compiled = compileStageRules(seed.request);
  const workOrder = orderStageWork(compiled);
  const first = workOrder.stages[0].work_items[0];
  const scope = { project_code: 'SYN-001', product_ref: 'product.synthetic', work_package_ref: `wp:${first.stage_code}:synthetic`,
    stage_code: first.stage_code, artifact_family_id: first.artifact_type_id };
  const runeId = `task:${first.stage_code}:${first.artifact_type_id}`;
  const blueprintRef = { workflow_id: 'synthetic_report_v0', version: 'v0', version_source: 'id_suffix' };
  const blueprint = { workflow_id: blueprintRef.workflow_id, steps: [
    { step_id: 'inspect', title: 'Synthetic inspection', actor_slot: 'synthetic_inspector', next: { on_success: 'stop', on_fail: 'stop' },
      action: { kind: 'inspect_evidence', effect_class: 'read', receipt_required: false, requires: [], validates: [], creates: [] } },
  ] };
  const blueprintFile = await write('blueprint.json', blueprint);
  const hierarchyScope = { project_id: scope.project_code, product_id: scope.product_ref };
  const hierarchy = mapTaskHierarchy({ scope: hierarchyScope, compiled_variant: seed.request.compiled_variant,
    compile_result: compiled, work_order: workOrder,
    work_packages: [{ scope: hierarchyScope, stage_code: scope.stage_code, work_package_key: 'synthetic', title_ko: '합성 업무',
      owner_domain_rune: 'systems_engineering', task_ids: [runeId], basis_ref: { ref_kind: 'binding', exact_ref: 'ref:synthetic/wp', sha256: 'a'.repeat(64) } }],
    blueprint_sources: [{ scope: hierarchyScope, task_id: runeId, blueprint_ref: blueprintRef,
      definition_ref: { ref_kind: 'blueprint', exact_ref: 'ref:synthetic/blueprint', sha256: blueprintFile.content_sha256.slice(7) },
      definition_data_sha256: taskHierarchyDataDigest(blueprint), definition: blueprint }],
  });
  const bindingId = 'binding.synthetic.workbench';
  const realmId = 'realm.synthetic.workbench';
  const generation = 'generation.synthetic.1';
  const requester = requesterForAccount(realmId, 'account.a');
  const revisions = [{ source_ref: 'source.synthetic.1', content_sha256: `sha256:${'a'.repeat(64)}` }];
  const input = { scope, generation, revisions };
  const request = { requester, ...scope, kind: 'report', idempotency_key: 'synthetic-workbench-001', rune_task_id: runeId,
    work_order_ref: { receipt_digest: `sha256:${hierarchy.receipt.upstream_receipt.output_digests.stages}`, order_index: first.order_index },
    input_revision: digestOf(revisions), blueprint_ref: blueprintRef,
    policy_refs: { stage_policy_ref: compiled.expected_artifact_policy.policy_identity.policy_id, coverage_ref: null,
      recipe_id: 'R1-07', task_ref: null }, directives: [], instruction_ref: null, revision_of: null, revision_no: 1 };
  const codeFile = await write('recipe-code.mjs', '// Synthetic inspection definition; never executed by Workbench.\nexport const fixture = true;\n');
  const recipe = { recipe_id: 'R1-07', kind: 'report', scope, rune_task_id: runeId, task_ref: null, linear_issue_id: null, blueprint_ref: blueprintRef,
    input_revision: request.input_revision, generation, blueprint_sha256: blueprintFile.content_sha256, code_sha256: codeFile.content_sha256 };
  const sources = { policy: await write('policy.json', compiled.expected_artifact_policy), hierarchy: await write('hierarchy.json', hierarchy),
    input: await write('input.json', input), recipe: await write('recipe.json', recipe), blueprint: blueprintFile, code: codeFile };
  const catalogue = { binding_id: bindingId, realm_id: realmId, generation,
    entries: [{ id: 'synthetic.report', label: '합성 검토 보고서', request, sources, linear: null, applicability: 'synthetic_sfx' }] };
  const authority = { binding_id: bindingId, realm_id: realmId, generation, observed_at: observedAt, valid_until: validUntil,
    grants: [{ requester, ...scope, state: 'current', epoch: 7, receipt_ref: 'acl.synthetic.7' }] };
  const binding = { binding_id: bindingId, realm_id: realmId, generation, state: 'current', observed_at: observedAt, valid_until: validUntil,
    authority: await write('authority.json', authority), catalogue: await write('catalogue.json', catalogue) };
  const descriptor = await write('binding.json', binding);
  const expectedBinding = { binding_id: bindingId, realm_id: realmId, content_sha256: descriptor.content_sha256 };
  request.idempotency_key = `wb.${expectedBinding.content_sha256.slice(7)}.synthetic-001`;
  const repin = async () => {
    binding.authority = await write('authority.json', authority);
    binding.catalogue = await write('catalogue.json', catalogue);
    expectedBinding.content_sha256 = (await write('binding.json', binding)).content_sha256;
    request.idempotency_key = `wb.${expectedBinding.content_sha256.slice(7)}.synthetic-001`;
  };
  return { root, sourceRoot, intakeRoot, expectedBinding, requester, scope, request, binding, authority, catalogue,
    hierarchy, blueprint, recipe, input, write, repin };
}

export async function addSyntheticLinearEvidence(fixture, { stateName = 'In Progress' } = {}) {
  const root = join(fixture.root, 'linear-custody', 'synthetic-forge');
  const stateRoot = join(fixture.root, 'linear-state');
  const completed = fixture.binding.observed_at;
  const issueId = 'f8091a2b-3c4d-4859-aa6b-465768798a9b';
  const binding = { lane_id: 'synthetic-linear', writer: { authority_id: 'synthetic-writer', epoch: 1 },
    workspace: { url_key: 'synthetic-forge', project_scope_map: [{ linear_project_id: 'project-1', project_scope_ref: `project:${fixture.scope.project_code}` }] } };
  const expectedBinding = { custody_root: root, state_root: stateRoot, lane_id: binding.lane_id,
    identity_digest: identityDigestForBinding(binding), writer_authority_id: binding.writer.authority_id,
    writer_epoch: 1, binding_sha256: `sha256:${'a'.repeat(64)}`, workspace_url_key: 'synthetic-forge',
    organization_id: 'a8091a2b-3c4d-4859-aa6b-465768798a9b', project_scope_ref: `project:${fixture.scope.project_code}`, project_code: fixture.scope.project_code };
  const issue = { id: issueId, identifier: 'SYN-1', updated_at: completed, state_name: stateName, project_id: 'project-1' };
  const envelope = readEvidenceRecordForIssue(binding, issue).envelope;
  const evidenceDigest = sha256Canonical(envelope);
  const wrapper = { schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'read_evidence', object_id: issueId,
    content_sha256: evidenceDigest, object: envelope };
  const cursor = { schema_version: 'soulforge.linear_collect.cursor.v1', watermark: completed, backfill: null, generation_seq: 2 };
  const state = { schema_version: 'soulforge.linear_collect.state.v1', lane_id: expectedBinding.lane_id,
    identity_digest: expectedBinding.identity_digest, writer_authority_id: expectedBinding.writer_authority_id,
    writer_epoch: 1, cursor, object_index: {
      [`issues:${issueId}`]: { content_sha256: envelope.issue_content_sha256, updated_at: issue.updated_at },
      [`read_evidence:${issueId}`]: { content_sha256: evidenceDigest, updated_at: issue.updated_at },
    }, last_run_id: 'run-synthetic', last_completed_at: completed };
  const receipt = { schema_version: 'soulforge.linear_collect.run_receipt.v1', lane_id: expectedBinding.lane_id,
    run_id: state.last_run_id, generation_seq: 2, mode: 'apply', status: 'ok', writer_authority_id: expectedBinding.writer_authority_id,
    writer_epoch: 1, binding_sha256: expectedBinding.binding_sha256, workspace_url_key: expectedBinding.workspace_url_key,
    organization_id: expectedBinding.organization_id, started_at: completed, completed_at: completed, duration_ms: 0,
    window: { lower: new Date(Date.parse(completed) - 900000).toISOString(), upper: completed, phase: 'delta', order_observed: 'ascending' },
    cursor_before: { ...cursor, generation_seq: 1 }, cursor_after: cursor,
    read_calls: { total: 0, by_operation: Object.fromEntries(LINEAR_READ_OPERATIONS.map(key => [key, 0])) },
    objects: Object.fromEntries(runReceiptObjectKinds('soulforge.linear_collect.run_receipt.v1').map(key => [key, { observed: 0, created: 0, unchanged: 0 }])),
    custody_manifest_digest: expectedBinding.binding_sha256, coverage_gaps: ['polling_cannot_prove_hard_deletes'], error_codes: [],
    repository_writes: 0, private_writes: 3, network_used: false };
  validateLinearCollectRunReceipt(receipt);
  await mkdir(join(stateRoot, 'state'), { recursive: true }); await mkdir(join(stateRoot, 'receipts'), { recursive: true });
  await mkdir(join(root, 'read_evidence', issueId), { recursive: true });
  const stateFile = join(stateRoot, 'state', 'linear-collect.json');
  const receiptFile = join(stateRoot, 'receipts', `${state.last_run_id}.json`);
  await writeFile(stateFile, JSON.stringify(state)); await writeFile(receiptFile, JSON.stringify(receipt));
  await writeFile(join(root, 'read_evidence', issueId, `${evidenceDigest.slice(7)}.json`), JSON.stringify(wrapper));
  fixture.catalogue.entries[0].linear = { root, expected_binding: expectedBinding, issue_id: issueId };
  fixture.catalogue.entries[0].applicability = 'real_work';
  fixture.request.policy_refs.task_ref = { provider: 'linear', task_id: issue.identifier };
  fixture.recipe.task_ref = fixture.request.policy_refs.task_ref; fixture.recipe.linear_issue_id = issueId;
  fixture.catalogue.entries[0].sources.recipe = await fixture.write('recipe.json', fixture.recipe);
  await fixture.repin();
  return { state, receipt, stateFile, receiptFile, root, expectedBinding, issueId, envelope };
}
