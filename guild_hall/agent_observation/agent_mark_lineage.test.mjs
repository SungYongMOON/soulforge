import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AGENT_RECORD_SCHEMA } from './agent_registry.mjs';
import {
  AGENT_FAMILY_SCHEMA,
  AGENT_MARK_SCHEMA,
  AGENT_DEPLOYMENT_SCHEMA,
  AGENT_MARK_RUN_SCHEMA,
  AGENT_MEMORY_GENERATION_SCHEMA,
  AGENT_WORKFORCE_LINEAGE_SCHEMA,
  AGENT_WORKFORCE_LINEAGE_HOLD_CODES,
  computeLineageRecordDigest,
  prepareAgentWorkforceLineageContract,
} from './agent_mark_lineage.mjs';

const H = AGENT_WORKFORCE_LINEAGE_HOLD_CODES;
const digestRecord = (record, field) => ({
  ...record,
  [field]: computeLineageRecordDigest(record),
});

const family = (over = {}) => digestRecord({
  schema_version: AGENT_FAMILY_SCHEMA,
  family_ref: 'agent-family:kvds-systems-engineering',
  family_version: '1.0.0',
  lifecycle_state: 'approved',
  role_refs: ['role:systems-engineering'],
  capability_refs: ['capability:requirements-review'],
  supersedes_family_ref: null,
  rollback_family_ref: null,
  ...over,
}, 'family_digest');

const mark = (over = {}) => digestRecord({
  schema_version: AGENT_MARK_SCHEMA,
  mark_ref: 'agent-mark:kvds-se-mark-i',
  mark_version: '1.0.0',
  family_ref: 'agent-family:kvds-systems-engineering',
  soul_revision_ref: 'soul:kvds-se/rev-1',
  soul_digest: `sha256:${'b'.repeat(64)}`,
  instruction_revision_ref: 'instruction:kvds-se/rev-1',
  instruction_digest: `sha256:${'c'.repeat(64)}`,
  requested_model_id: 'gpt-5.6-terra',
  observed_model_id: 'gpt-5.6-terra',
  requested_effort: 'max',
  observed_effort: 'max',
  role_refs: ['role:systems-engineering'],
  capability_refs: ['capability:requirements-review'],
  skill_refs: ['skill:requirements-review/v1'],
  workflow_refs: ['workflow:se-review/v1'],
  tool_refs: ['tool:engineering-mcp/v0'],
  authority_policy_refs: ['policy:artifact-only/v1'],
  project_scope_refs: ['project:kvds'],
  memory_policy_ref: 'policy:agent-memory-cache-only/v1',
  evaluation_refs: ['evaluation:kvds-se-mark-i/synthetic-1'],
  supersedes_mark_ref: null,
  rollback_mark_ref: null,
  ...over,
}, 'mark_digest');

const deployment = (over = {}) => digestRecord({
  schema_version: AGENT_DEPLOYMENT_SCHEMA,
  deployment_ref: 'agent-deployment:kvds-se/hpp-1',
  deployment_version: '1.0.0',
  mark_ref: 'agent-mark:kvds-se-mark-i',
  project_scope_refs: ['project:kvds'],
  runtime_ref: 'runtime:hermes',
  runtime_version: '0.20.5',
  profile_ref: 'profile:kvds-se',
  session_ref: 'session:kvds-se/bot-chat',
  tool_refs: ['tool:engineering-mcp/v0'],
  authority_policy_refs: ['policy:artifact-only/v1'],
  secret_ref: 'secretref:kvds-se/runtime-binding',
  supersedes_deployment_ref: null,
  rollback_deployment_ref: null,
  ...over,
}, 'deployment_digest');

const run = (over = {}) => digestRecord({
  schema_version: AGENT_MARK_RUN_SCHEMA,
  run_ref: 'agent-run:kvds-se/synthetic-1',
  run_version: '1.0.0',
  deployment_ref: 'agent-deployment:kvds-se/hpp-1',
  mark_ref: 'agent-mark:kvds-se-mark-i',
  project_ref: 'project:kvds',
  assignment_ref: 'assignment:kvds/synthetic-1',
  work_brief_ref: 'work-brief:kvds/synthetic-1',
  runtime_ref: 'runtime:hermes',
  profile_ref: 'profile:kvds-se',
  session_ref: 'session:kvds-se/bot-chat',
  requested_model_id: 'gpt-5.6-terra',
  observed_model_id: 'gpt-5.6-terra',
  requested_effort: 'max',
  observed_effort: 'max',
  result_refs: ['result:kvds/synthetic-1'],
  evidence_refs: ['evidence:kvds/synthetic-1'],
  started_at: '2026-08-31T00:00:00.000Z',
  ended_at: '2026-08-31T00:01:00.000Z',
  run_state: 'result_observed',
  ...over,
}, 'run_digest');

const memory = (over = {}) => digestRecord({
  schema_version: AGENT_MEMORY_GENERATION_SCHEMA,
  memory_generation_ref: 'memory-generation:kvds-se/gen-1',
  memory_version: '1.0.0',
  mark_ref: 'agent-mark:kvds-se-mark-i',
  deployment_ref: 'agent-deployment:kvds-se/hpp-1',
  parent_memory_generation_ref: null,
  memory_manifest_ref: 'memory-manifest:kvds-se/gen-1',
  memory_classification: 'agent_runtime_cache',
  retention_policy_ref: 'policy:agent-memory-retention/v1',
  recovery_ref: 'recovery:kvds-se/gen-1',
  rollback_ref: 'rollback:kvds-se/gen-1',
  supersedes_memory_generation_ref: null,
  ...over,
}, 'memory_digest');

const packet = (over = {}) => ({
  schema_version: AGENT_WORKFORCE_LINEAGE_SCHEMA,
  family: family(),
  mark: mark(),
  deployment: deployment(),
  run: run(),
  memory_generation: memory(),
  effect_boundary: {
    persistence_write: false,
    runtime_call: false,
    configuration_mutation: false,
    authority_activation: false,
    external_call: false,
  },
  ...over,
});

test('prepares one exact Family -> Mark -> Deployment -> Run -> Memory Generation lineage without effects', () => {
  const result = prepareAgentWorkforceLineageContract(packet());
  assert.equal(result.status, 'PREPARED_CONTRACT');
  assert.equal(result.record.schema_version, AGENT_WORKFORCE_LINEAGE_SCHEMA);
  assert.equal(result.record.mark.family_ref, result.record.family.family_ref);
  assert.equal(result.record.deployment.mark_ref, result.record.mark.mark_ref);
  assert.equal(result.record.run.deployment_ref, result.record.deployment.deployment_ref);
  assert.equal(result.record.memory_generation.deployment_ref, result.record.deployment.deployment_ref);
  assert.match(result.lineage_digest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(result.record), true);
  assert.equal(Object.isFrozen(result.record.mark.tool_refs), true);
});

test('missing requested and observed model/effort remain separate UNKNOWN fields', () => {
  const markWithoutModels = mark({
    requested_model_id: undefined,
    observed_model_id: undefined,
    requested_effort: undefined,
    observed_effort: undefined,
  });
  for (const field of ['requested_model_id', 'observed_model_id', 'requested_effort', 'observed_effort']) delete markWithoutModels[field];
  delete markWithoutModels.mark_digest;
  markWithoutModels.mark_digest = computeLineageRecordDigest({
    ...markWithoutModels,
    requested_model_id: 'UNKNOWN',
    observed_model_id: 'UNKNOWN',
    requested_effort: 'UNKNOWN',
    observed_effort: 'UNKNOWN',
  });

  const runWithoutObserved = run({ observed_model_id: undefined, observed_effort: undefined });
  delete runWithoutObserved.observed_model_id;
  delete runWithoutObserved.observed_effort;
  delete runWithoutObserved.run_digest;
  runWithoutObserved.run_digest = computeLineageRecordDigest({
    ...runWithoutObserved,
    observed_model_id: 'UNKNOWN',
    observed_effort: 'UNKNOWN',
  });

  const result = prepareAgentWorkforceLineageContract(packet({ mark: markWithoutModels, run: runWithoutObserved }));
  assert.equal(result.status, 'PREPARED_CONTRACT');
  assert.equal(result.record.mark.requested_model_id, 'UNKNOWN');
  assert.equal(result.record.mark.observed_model_id, 'UNKNOWN');
  assert.equal(result.record.run.requested_model_id, 'gpt-5.6-terra');
  assert.equal(result.record.run.observed_model_id, 'UNKNOWN');
  assert.equal(result.record.run.observed_effort, 'UNKNOWN');
});

test('an Agent Observation agent_record is explicitly refused as an Agent Mark', () => {
  assert.notEqual(AGENT_RECORD_SCHEMA, AGENT_MARK_SCHEMA);
  const legacyAgentRecord = {
    schema_version: AGENT_RECORD_SCHEMA,
    agent_id: 'agent.kvds.se.v1',
    agent_kind: 'project_isolated_functional',
    functional_role: 'systems_engineering',
    project_id: 'project-kvds',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'thread-synthetic' }],
    authority_scope: { allowed_projects: ['project-kvds'], allowed_actions: ['read'] },
    memory_class: 'cache_only',
    registered_at: '2026-08-31T00:00:00.000Z',
  };
  const result = prepareAgentWorkforceLineageContract(packet({ mark: legacyAgentRecord }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, H.AGENT_RECORD_NOT_AGENT_MARK);
});

test('digest and semantic version tampering fail closed', () => {
  const badDigest = packet({ mark: { ...mark(), mark_digest: `sha256:${'0'.repeat(64)}` } });
  assert.equal(prepareAgentWorkforceLineageContract(badDigest).hold_code, H.REVISION_DIGEST_MISMATCH);
  const badVersion = packet({ deployment: deployment({ deployment_version: 'latest' }) });
  assert.equal(prepareAgentWorkforceLineageContract(badVersion).hold_code, H.INVALID_FIELD_VALUE);
});

test('cross-layer family, mark, deployment, run, project and memory mismatches are refused', () => {
  const cases = [
    [packet({ mark: mark({ family_ref: 'agent-family:other' }) }), H.FAMILY_MARK_MISMATCH],
    [packet({ deployment: deployment({ mark_ref: 'agent-mark:other' }) }), H.MARK_DEPLOYMENT_MISMATCH],
    [packet({ run: run({ deployment_ref: 'agent-deployment:other' }) }), H.RUN_DEPLOYMENT_MISMATCH],
    [packet({ run: run({ project_ref: 'project:other' }) }), H.PROJECT_SCOPE_MISMATCH],
    [packet({ memory_generation: memory({ mark_ref: 'agent-mark:other' }) }), H.MEMORY_LINEAGE_MISMATCH],
  ];
  for (const [candidate, code] of cases) assert.equal(prepareAgentWorkforceLineageContract(candidate).hold_code, code);
});

test('project, role, capability, tool and authority bindings may not silently drift between layers', () => {
  const cases = [
    [packet({ deployment: deployment({ project_scope_refs: ['project:other'] }) }), H.PROJECT_SCOPE_MISMATCH],
    [packet({ mark: mark({ role_refs: ['role:quality'] }) }), H.BINDING_SNAPSHOT_MISMATCH],
    [packet({ deployment: deployment({ tool_refs: ['tool:other/v1'] }) }), H.BINDING_SNAPSHOT_MISMATCH],
    [packet({ deployment: deployment({ authority_policy_refs: ['policy:other/v1'] }) }), H.BINDING_SNAPSHOT_MISMATCH],
  ];
  for (const [candidate, code] of cases) {
    const result = prepareAgentWorkforceLineageContract(candidate);
    assert.equal(result.status, 'HOLD');
    assert.equal(result.hold_code, code);
  }
});

test('raw memory, payload, transcript and secret-bearing values are refused', () => {
  for (const candidate of [
    packet({ memory_generation: { ...memory(), raw_memory: 'do not store' } }),
    packet({ run: { ...run(), payload: 'do not store' } }),
    packet({ mark: { ...mark(), transcript: 'do not store' } }),
  ]) {
    assert.equal(prepareAgentWorkforceLineageContract(candidate).hold_code, H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  }
  const secret = ['Bearer', 'abcdef0123456789'].join(' ');
  const candidate = packet({ deployment: deployment({ secret_ref: secret }) });
  assert.equal(prepareAgentWorkforceLineageContract(candidate).hold_code, H.SECRET_VALUE_FORBIDDEN);
});

test('secret_ref is a pointer only and local paths are not accepted as refs', () => {
  assert.equal(prepareAgentWorkforceLineageContract(packet()).status, 'PREPARED_CONTRACT');
  assert.equal(
    prepareAgentWorkforceLineageContract(packet({ deployment: deployment({ secret_ref: 'opaqueCredentialValue' }) })).hold_code,
    H.INVALID_FIELD_VALUE,
  );
  const localRef = ['C:', 'Users', 'person', 'secret.txt'].join('/');
  const result = prepareAgentWorkforceLineageContract(packet({ deployment: deployment({ secret_ref: localRef }) }));
  assert.equal(result.hold_code, H.LOCAL_PATH_VALUE_FORBIDDEN);
});

test('the contract cannot activate authority, mutate configuration, write persistence, call runtime or call externally', () => {
  for (const field of ['persistence_write', 'runtime_call', 'configuration_mutation', 'authority_activation', 'external_call']) {
    const result = prepareAgentWorkforceLineageContract(packet({
      effect_boundary: { ...packet().effect_boundary, [field]: true },
    }));
    assert.equal(result.status, 'HOLD', field);
    assert.equal(result.hold_code, H.EFFECT_ACTIVATION_FORBIDDEN, field);
  }
});

test('lineage refs are required even though null is permitted for first-generation supersession and rollback', () => {
  const missingRollback = mark();
  delete missingRollback.rollback_mark_ref;
  const result = prepareAgentWorkforceLineageContract(packet({ mark: missingRollback }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, H.INVALID_FIELD_VALUE);
  const mismatchedRollback = packet({ mark: mark({
    supersedes_mark_ref: 'agent-mark:kvds-se-mark-previous',
    rollback_mark_ref: 'agent-mark:kvds-se-mark-unrelated',
  }) });
  assert.equal(prepareAgentWorkforceLineageContract(mismatchedRollback).hold_code, H.INVALID_FIELD_VALUE);
});

test('malformed, accessor and hostile Proxy inputs return HOLD instead of throwing', () => {
  for (const malformed of [null, undefined, [], 'packet', 42]) {
    const result = prepareAgentWorkforceLineageContract(malformed);
    assert.equal(result.status, 'HOLD');
  }
  const accessor = packet();
  Object.defineProperty(accessor.mark, 'mark_ref', { enumerable: true, get() { throw new Error('must not run'); } });
  assert.equal(prepareAgentWorkforceLineageContract(accessor).hold_code, H.ACCESSOR_PROPERTY_FORBIDDEN);
  const hostile = new Proxy({}, { ownKeys() { throw new Error('hostile'); } });
  assert.equal(prepareAgentWorkforceLineageContract(hostile).hold_code, H.HOSTILE_INPUT_REFUSED);
});

test('the lineage module is pure, clock-free and opens no runtime, config, persistence or network surface', () => {
  const source = readFileSync(new URL('./agent_mark_lineage.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes(String.fromCharCode(0)), false);
  for (const forbidden of [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:child_process', 'node:dgram',
    'node:worker_threads', 'node:cluster', 'node:v8', 'node:vm',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  for (const pattern of [
    /\brequire\s*\(/u, /\bimport\s*\(/u, /\bfetch\s*\(/u, /\beval\s*\(/u,
    /new\s+Function\s*\(/u, /\bprocess\./u, /\bglobalThis\./u, /\bDate\.now\s*\(/u,
    /new\s+Date\s*\(/u, /\bMath\.random\s*\(/u,
  ]) assert.equal(pattern.test(source), false, String(pattern));
});
