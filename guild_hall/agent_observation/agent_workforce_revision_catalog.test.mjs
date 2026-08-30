import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AGENT_RECORD_SCHEMA } from './agent_registry.mjs';
import {
  AGENT_DEPLOYMENT_SCHEMA,
  AGENT_FAMILY_SCHEMA,
  AGENT_MARK_RUN_SCHEMA,
  AGENT_MARK_SCHEMA,
  AGENT_MEMORY_GENERATION_SCHEMA,
  AGENT_WORKFORCE_LINEAGE_HOLD_CODES as LINEAGE_H,
  AGENT_WORKFORCE_LINEAGE_SCHEMA,
  computeLineageRecordDigest,
  prepareAgentWorkforceLineageContract,
} from './agent_mark_lineage.mjs';
import {
  AGENT_WORKFORCE_REVISION_CATALOG_HOLD_CODES as H,
  appendAgentWorkforceRevisionEvent,
  createAgentWorkforceRevisionCatalog,
  listAgentWorkforceRevisionEvents,
  projectActiveAgentWorkforceRevisions,
} from './agent_workforce_revision_catalog.mjs';

const sha = (character) => `sha256:${character.repeat(64)}`;
const withDigest = (record, field) => ({ ...record, [field]: computeLineageRecordDigest(record) });
const refs = (scopes) => [...scopes].sort();

function lineage({ generation = 1, scopes = ['project:kvds'], familyName = 'kvds-se' } = {}) {
  const suffix = generation === 1 ? 'i' : `v${generation}`;
  const priorSuffix = generation === 2 ? 'i' : `v${generation - 1}`;
  const familyRef = `agent-family:${familyName}`;
  const markRef = `agent-mark:${familyName}-${suffix}`;
  const priorMarkRef = generation === 1 ? null : `agent-mark:${familyName}-${priorSuffix}`;
  const deploymentRef = `agent-deployment:${familyName}-${suffix}`;
  const priorDeploymentRef = generation === 1 ? null : `agent-deployment:${familyName}-${priorSuffix}`;
  const memoryRef = `memory-generation:${familyName}-${suffix}`;
  const priorMemoryRef = generation === 1 ? null : `memory-generation:${familyName}-${priorSuffix}`;
  const version = `${generation}.0.0`;

  const family = withDigest({
    schema_version: AGENT_FAMILY_SCHEMA,
    family_ref: familyRef,
    family_version: '1.0.0',
    lifecycle_state: 'approved',
    role_refs: ['role:systems-engineering'],
    capability_refs: ['capability:requirements-review'],
    supersedes_family_ref: null,
    rollback_family_ref: null,
  }, 'family_digest');
  const mark = withDigest({
    schema_version: AGENT_MARK_SCHEMA,
    mark_ref: markRef,
    mark_version: version,
    family_ref: familyRef,
    soul_revision_ref: `soul:${familyName}/${suffix}`,
    soul_digest: sha('b'),
    instruction_revision_ref: `instruction:${familyName}/${suffix}`,
    instruction_digest: sha('c'),
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
    project_scope_refs: refs(scopes),
    memory_policy_ref: 'policy:agent-memory-cache-only/v1',
    evaluation_refs: [`evaluation:${familyName}/${suffix}`],
    supersedes_mark_ref: priorMarkRef,
    rollback_mark_ref: priorMarkRef,
  }, 'mark_digest');
  const deployment = withDigest({
    schema_version: AGENT_DEPLOYMENT_SCHEMA,
    deployment_ref: deploymentRef,
    deployment_version: version,
    mark_ref: markRef,
    project_scope_refs: refs(scopes),
    runtime_ref: 'runtime:hermes',
    runtime_version: '0.20.5',
    profile_ref: `profile:${familyName}`,
    session_ref: `session:${familyName}/bot-chat`,
    tool_refs: ['tool:engineering-mcp/v0'],
    authority_policy_refs: ['policy:artifact-only/v1'],
    secret_ref: `secretref:${familyName}/runtime-binding`,
    supersedes_deployment_ref: priorDeploymentRef,
    rollback_deployment_ref: priorDeploymentRef,
  }, 'deployment_digest');
  const run = withDigest({
    schema_version: AGENT_MARK_RUN_SCHEMA,
    run_ref: `agent-run:${familyName}/${suffix}`,
    run_version: version,
    deployment_ref: deploymentRef,
    mark_ref: markRef,
    project_ref: refs(scopes)[0],
    assignment_ref: `assignment:${familyName}/${suffix}`,
    work_brief_ref: `work-brief:${familyName}/${suffix}`,
    runtime_ref: 'runtime:hermes',
    profile_ref: `profile:${familyName}`,
    session_ref: `session:${familyName}/bot-chat`,
    requested_model_id: 'gpt-5.6-terra',
    observed_model_id: 'UNKNOWN',
    requested_effort: 'max',
    observed_effort: 'UNKNOWN',
    result_refs: [],
    evidence_refs: [],
    started_at: `2026-08-31T00:0${generation}:00.000Z`,
    ended_at: null,
    run_state: 'prepared',
  }, 'run_digest');
  const memory = withDigest({
    schema_version: AGENT_MEMORY_GENERATION_SCHEMA,
    memory_generation_ref: memoryRef,
    memory_version: version,
    mark_ref: markRef,
    deployment_ref: deploymentRef,
    parent_memory_generation_ref: priorMemoryRef,
    memory_manifest_ref: `memory-manifest:${familyName}/${suffix}`,
    memory_classification: 'agent_runtime_cache',
    retention_policy_ref: 'policy:agent-memory-retention/v1',
    recovery_ref: `recovery:${familyName}/${suffix}`,
    rollback_ref: `rollback:${familyName}/${suffix}`,
    supersedes_memory_generation_ref: priorMemoryRef,
  }, 'memory_digest');

  return {
    schema_version: AGENT_WORKFORCE_LINEAGE_SCHEMA,
    family,
    mark,
    deployment,
    run,
    memory_generation: memory,
    effect_boundary: {
      persistence_write: false,
      runtime_call: false,
      configuration_mutation: false,
      authority_activation: false,
      external_call: false,
    },
  };
}

const prepared = (options) => prepareAgentWorkforceLineageContract(lineage(options));
function preparedMemoryOnlyRevision() {
  const prior = lineage();
  const next = lineage({ generation: 2 });
  next.mark = prior.mark;
  next.deployment = prior.deployment;
  next.run.mark_ref = prior.mark.mark_ref;
  next.run.deployment_ref = prior.deployment.deployment_ref;
  delete next.run.run_digest;
  next.run.run_digest = computeLineageRecordDigest(next.run);
  next.memory_generation.mark_ref = prior.mark.mark_ref;
  next.memory_generation.deployment_ref = prior.deployment.deployment_ref;
  delete next.memory_generation.memory_digest;
  next.memory_generation.memory_digest = computeLineageRecordDigest(next.memory_generation);
  return prepareAgentWorkforceLineageContract(next);
}

function preparedDeploymentOnlyRevision() {
  const prior = lineage();
  const next = lineage({ generation: 2 });
  next.mark = prior.mark;
  next.deployment.mark_ref = prior.mark.mark_ref;
  delete next.deployment.deployment_digest;
  next.deployment.deployment_digest = computeLineageRecordDigest(next.deployment);
  next.run.mark_ref = prior.mark.mark_ref;
  delete next.run.run_digest;
  next.run.run_digest = computeLineageRecordDigest(next.run);
  next.memory_generation.mark_ref = prior.mark.mark_ref;
  delete next.memory_generation.memory_digest;
  next.memory_generation.memory_digest = computeLineageRecordDigest(next.memory_generation);
  return prepareAgentWorkforceLineageContract(next);
}

function preparedFamilyReplacement() {
  const prior = lineage();
  const next = lineage({ generation: 2, familyName: 'kvds-se-next' });
  next.family.family_version = '2.0.0';
  next.family.supersedes_family_ref = prior.family.family_ref;
  next.family.rollback_family_ref = prior.family.family_ref;
  delete next.family.family_digest;
  next.family.family_digest = computeLineageRecordDigest(next.family);
  next.mark.supersedes_mark_ref = prior.mark.mark_ref;
  next.mark.rollback_mark_ref = prior.mark.mark_ref;
  delete next.mark.mark_digest;
  next.mark.mark_digest = computeLineageRecordDigest(next.mark);
  next.deployment.supersedes_deployment_ref = prior.deployment.deployment_ref;
  next.deployment.rollback_deployment_ref = prior.deployment.deployment_ref;
  delete next.deployment.deployment_digest;
  next.deployment.deployment_digest = computeLineageRecordDigest(next.deployment);
  next.memory_generation.parent_memory_generation_ref = prior.memory_generation.memory_generation_ref;
  next.memory_generation.supersedes_memory_generation_ref = prior.memory_generation.memory_generation_ref;
  delete next.memory_generation.memory_digest;
  next.memory_generation.memory_digest = computeLineageRecordDigest(next.memory_generation);
  return prepareAgentWorkforceLineageContract(next);
}

const event = (preparedContract, over = {}) => ({
  event_ref: 'agent-catalog-event:kvds-se-i/candidate',
  catalog_state: 'candidate',
  authority_receipt_ref: null,
  recorded_at: '2026-08-31T01:00:00.000Z',
  prepared_contract: preparedContract,
  ...over,
});

function approve(catalog, preparedContract, suffix = 'i') {
  return appendAgentWorkforceRevisionEvent(catalog, event(preparedContract, {
    event_ref: `agent-catalog-event:kvds-se-${suffix}/approved`,
    catalog_state: 'approval_claim',
    authority_receipt_ref: `approval-receipt:kvds-se-${suffix}`,
    recorded_at: '2026-08-31T01:01:00.000Z',
  }));
}

test('records exact Family, Mark, Deployment and Memory refs/digests from a revalidated PREPARED_CONTRACT', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  const packet = prepared();
  assert.equal(packet.status, 'PREPARED_CONTRACT');
  const result = appendAgentWorkforceRevisionEvent(catalog, event(packet));
  assert.equal(result.status, 'CANDIDATE_RECORDED');
  assert.equal(result.event.family_ref, packet.record.family.family_ref);
  assert.equal(result.event.family_digest, packet.record.family.family_digest);
  assert.equal(result.event.mark_ref, packet.record.mark.mark_ref);
  assert.equal(result.event.mark_digest, packet.record.mark.mark_digest);
  assert.equal(result.event.deployment_ref, packet.record.deployment.deployment_ref);
  assert.equal(result.event.deployment_digest, packet.record.deployment.deployment_digest);
  assert.equal(result.event.memory_generation_ref, packet.record.memory_generation.memory_generation_ref);
  assert.equal(result.event.memory_digest, packet.record.memory_generation.memory_digest);
  assert.equal(Object.hasOwn(result.event, 'run_ref'), false, 'a revision catalog event is not a run record');
  assert.equal(result.event.authority_receipt_verified, false);
  assert.equal(projectActiveAgentWorkforceRevisions(catalog).rows.length, 0, 'candidate is never active');
});

test('exact replay is NO_OP; same event or lineage-state with divergent data is HOLD', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  const packet = prepared();
  const input = event(packet);
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, input).status, 'CANDIDATE_RECORDED');
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, input).status, 'NO_OP');
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, { ...input, recorded_at: '2026-08-31T01:00:01.000Z' }).hold_code, H.EVENT_CONFLICT);
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, { ...input, event_ref: 'agent-catalog-event:duplicate' }).hold_code, H.LINEAGE_STATE_CONFLICT);
  assert.equal(listAgentWorkforceRevisionEvents(catalog).length, 1);
});

test('candidate and approval claim are separated only by an opaque caller-supplied receipt ref', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  const packet = prepared();
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, event(packet)).status, 'CANDIDATE_RECORDED');
  const approved = approve(catalog, packet);
  assert.equal(approved.status, 'APPROVAL_CLAIM_RECORDED');
  assert.equal(approved.event.authority_receipt_ref, 'approval-receipt:kvds-se-i');
  assert.equal(approved.event.authority_receipt_verified, false);
  assert.equal(approved.event.effect_boundary.approves_or_promotes, false);
  const projection = projectActiveAgentWorkforceRevisions(catalog);
  assert.equal(projection.rows.length, 0, 'an unverified receipt never produces an active Agent');
  assert.equal(projection.unverified_approval_claims.length, 1);
  assert.equal(projection.unverified_approval_claims[0].mark_ref, packet.record.mark.mark_ref);
  assert.equal(projection.authority_boundary.authority_granted, false);
});

test('candidate cannot carry an approval receipt and approval claim cannot omit it', () => {
  const packet = prepared();
  assert.equal(appendAgentWorkforceRevisionEvent(createAgentWorkforceRevisionCatalog(), event(packet, {
    authority_receipt_ref: 'approval-receipt:not-for-candidate',
  })).hold_code, H.AUTHORITY_RECEIPT_FORBIDDEN);
  assert.equal(appendAgentWorkforceRevisionEvent(createAgentWorkforceRevisionCatalog(), event(packet, {
    catalog_state: 'approval_claim',
  })).hold_code, H.AUTHORITY_RECEIPT_REQUIRED);
  assert.equal(appendAgentWorkforceRevisionEvent(createAgentWorkforceRevisionCatalog(), event(packet, {
    catalog_state: 'approved', authority_receipt_ref: 'approval-receipt:misleading-state',
  })).hold_code, H.INVALID_FIELD_VALUE);
});

test('a forged PREPARED_CONTRACT digest is revalidated and refused', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  const packet = prepared();
  const forged = { ...packet, lineage_digest: sha('0') };
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, event(forged)).hold_code, H.PREPARED_CONTRACT_DIGEST_MISMATCH);
});

test('agent_record.v1 is never accepted as an Agent Mark', () => {
  const packet = prepared();
  const forged = {
    ...packet,
    record: {
      ...packet.record,
      mark: {
        schema_version: AGENT_RECORD_SCHEMA,
        agent_id: 'agent.kvds.se.v1',
      },
    },
  };
  const result = appendAgentWorkforceRevisionEvent(createAgentWorkforceRevisionCatalog(), event(forged));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, LINEAGE_H.AGENT_RECORD_NOT_AGENT_MARK);
});

test('a same revision ref with different content is a conflict, not a rewrite', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  const first = prepared();
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, event(first)).status, 'CANDIDATE_RECORDED');
  const changedRecord = lineage();
  changedRecord.mark.evaluation_refs = ['evaluation:kvds-se/changed'];
  delete changedRecord.mark.mark_digest;
  changedRecord.mark.mark_digest = computeLineageRecordDigest(changedRecord.mark);
  const changed = prepareAgentWorkforceLineageContract(changedRecord);
  assert.equal(changed.status, 'PREPARED_CONTRACT');
  const result = appendAgentWorkforceRevisionEvent(catalog, event(changed, {
    event_ref: 'agent-catalog-event:kvds-se-i/changed',
  }));
  assert.equal(result.hold_code, H.REVISION_REF_CONFLICT);
  assert.equal(listAgentWorkforceRevisionEvents(catalog).length, 1);
});

test('new Mark, Deployment and Memory revisions must supersede monotonically and name the rollback candidate', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  const v1 = prepared();
  assert.equal(approve(catalog, v1).status, 'APPROVAL_CLAIM_RECORDED');

  const v2 = prepared({ generation: 2 });
  const candidate = appendAgentWorkforceRevisionEvent(catalog, event(v2, {
    event_ref: 'agent-catalog-event:kvds-se-v2/candidate',
    recorded_at: '2026-08-31T02:00:00.000Z',
  }));
  assert.equal(candidate.status, 'CANDIDATE_RECORDED');
  const approved = approve(catalog, v2, 'v2');
  assert.equal(approved.status, 'APPROVAL_CLAIM_RECORDED');
  const projection = projectActiveAgentWorkforceRevisions(catalog);
  assert.equal(projection.rows.length, 0);
  assert.equal(projection.unverified_approval_claims[0].mark_ref, v2.record.mark.mark_ref);
});

test('Deployment and Memory may revise independently without fabricating a new Agent Mark', () => {
  for (const [label, next] of [
    ['deployment-only', preparedDeploymentOnlyRevision()],
    ['memory-only', preparedMemoryOnlyRevision()],
  ]) {
    assert.equal(next.status, 'PREPARED_CONTRACT', label);
    const catalog = createAgentWorkforceRevisionCatalog();
    const first = prepared();
    assert.equal(approve(catalog, first).status, 'APPROVAL_CLAIM_RECORDED', label);
    const candidate = appendAgentWorkforceRevisionEvent(catalog, event(next, {
      event_ref: `agent-catalog-event:${label}/candidate`,
      recorded_at: '2026-08-31T02:00:00.000Z',
    }));
    assert.equal(candidate.status, 'CANDIDATE_RECORDED', label);
    const claim = appendAgentWorkforceRevisionEvent(catalog, event(next, {
      event_ref: `agent-catalog-event:${label}/approval-claim`,
      catalog_state: 'approval_claim',
      authority_receipt_ref: `approval-receipt:${label}`,
      recorded_at: '2026-08-31T02:01:00.000Z',
    }));
    assert.equal(claim.status, 'APPROVAL_CLAIM_RECORDED', label);
    const projected = projectActiveAgentWorkforceRevisions(catalog);
    assert.equal(projected.rows.length, 0, label);
    assert.equal(projected.unverified_approval_claims[0].mark_ref, first.record.mark.mark_ref, label);
    assert.equal(projected.unverified_approval_claims[0].memory_generation_ref, next.record.memory_generation.memory_generation_ref, label);
  }
});

test('a Family replacement must name the exact prior Family, Mark, Deployment and Memory rollback chain', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  assert.equal(approve(catalog, prepared()).status, 'APPROVAL_CLAIM_RECORDED');
  const replacement = preparedFamilyReplacement();
  assert.equal(replacement.status, 'PREPARED_CONTRACT');
  const candidate = appendAgentWorkforceRevisionEvent(catalog, event(replacement, {
    event_ref: 'agent-catalog-event:kvds-se-next/candidate',
    recorded_at: '2026-08-31T02:00:00.000Z',
  }));
  assert.equal(candidate.status, 'CANDIDATE_RECORDED');
  assert.equal(candidate.event.supersedes_family_ref, prepared().record.family.family_ref);
  assert.equal(candidate.event.rollback_family_ref, prepared().record.family.family_ref);
});

test('unknown, missing, stale and non-monotonic supersession fails closed', () => {
  const missingCatalog = createAgentWorkforceRevisionCatalog();
  const v2WithoutV1 = prepared({ generation: 2 });
  assert.equal(appendAgentWorkforceRevisionEvent(missingCatalog, event(v2WithoutV1)).hold_code, H.UNKNOWN_SUPERSEDED_REVISION);

  const catalog = createAgentWorkforceRevisionCatalog();
  assert.equal(approve(catalog, prepared()).status, 'APPROVAL_CLAIM_RECORDED');
  const staleRecord = lineage({ generation: 2 });
  staleRecord.mark.mark_version = '1.0.0';
  delete staleRecord.mark.mark_digest;
  staleRecord.mark.mark_digest = computeLineageRecordDigest(staleRecord.mark);
  const stale = prepareAgentWorkforceLineageContract(staleRecord);
  assert.equal(stale.status, 'PREPARED_CONTRACT');
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, event(stale, {
    event_ref: 'agent-catalog-event:stale-version',
  })).hold_code, H.NON_MONOTONIC_VERSION);
});

test('a stale parallel candidate cannot replace the claimed head after another candidate wins', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  assert.equal(approve(catalog, prepared()).status, 'APPROVAL_CLAIM_RECORDED');
  const v2 = prepared({ generation: 2 });
  const v3FromV2Shape = lineage({ generation: 3 });
  // Make v3 a parallel candidate off v1, not a child of v2.
  v3FromV2Shape.mark.supersedes_mark_ref = 'agent-mark:kvds-se-i';
  v3FromV2Shape.mark.rollback_mark_ref = 'agent-mark:kvds-se-i';
  delete v3FromV2Shape.mark.mark_digest;
  v3FromV2Shape.mark.mark_digest = computeLineageRecordDigest(v3FromV2Shape.mark);
  v3FromV2Shape.deployment.supersedes_deployment_ref = 'agent-deployment:kvds-se-i';
  v3FromV2Shape.deployment.rollback_deployment_ref = 'agent-deployment:kvds-se-i';
  delete v3FromV2Shape.deployment.deployment_digest;
  v3FromV2Shape.deployment.deployment_digest = computeLineageRecordDigest(v3FromV2Shape.deployment);
  v3FromV2Shape.memory_generation.parent_memory_generation_ref = 'memory-generation:kvds-se-i';
  v3FromV2Shape.memory_generation.supersedes_memory_generation_ref = 'memory-generation:kvds-se-i';
  delete v3FromV2Shape.memory_generation.memory_digest;
  v3FromV2Shape.memory_generation.memory_digest = computeLineageRecordDigest(v3FromV2Shape.memory_generation);
  const v3 = prepareAgentWorkforceLineageContract(v3FromV2Shape);
  assert.equal(v3.status, 'PREPARED_CONTRACT');
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, event(v3, {
    event_ref: 'agent-catalog-event:kvds-se-v3/candidate', recorded_at: '2026-08-31T02:00:00.000Z',
  })).status, 'CANDIDATE_RECORDED');
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, event(v2, {
    event_ref: 'agent-catalog-event:kvds-se-v2/candidate', recorded_at: '2026-08-31T02:01:00.000Z',
  })).status, 'CANDIDATE_RECORDED');
  assert.equal(approve(catalog, v2, 'v2').status, 'APPROVAL_CLAIM_RECORDED');
  assert.equal(approve(catalog, v3, 'v3').hold_code, H.SUPERSESSION_REQUIRED);
  const projection = projectActiveAgentWorkforceRevisions(catalog);
  assert.equal(projection.rows.length, 0);
  assert.equal(projection.unverified_approval_claims[0].mark_ref, v2.record.mark.mark_ref);
});

test('one multi-project deployment cannot bridge two different claimed Mark/Deployment heads', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  assert.equal(approve(catalog, prepared({ scopes: ['project:alpha'], familyName: 'alpha-se' }), 'alpha').status, 'APPROVAL_CLAIM_RECORDED');
  assert.equal(approve(catalog, prepared({ scopes: ['project:beta'], familyName: 'beta-se' }), 'beta').status, 'APPROVAL_CLAIM_RECORDED');
  const bridge = prepared({ generation: 2, scopes: ['project:alpha', 'project:beta'], familyName: 'alpha-se' });
  const result = appendAgentWorkforceRevisionEvent(catalog, event(bridge, {
    event_ref: 'agent-catalog-event:bridge/candidate',
  }));
  assert.equal(result.hold_code, H.CLAIMED_SCOPE_CONFLICT);
  const projection = projectActiveAgentWorkforceRevisions(catalog);
  assert.equal(projection.rows.length, 0);
  assert.equal(projection.unverified_approval_claims.length, 2);
});

test('raw memory, secret, local path, accessor and hostile input are fixed redacted HOLDs', () => {
  const packet = prepared();
  const catalog = createAgentWorkforceRevisionCatalog();
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, { ...event(packet), raw_memory: 'body' }).hold_code, H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  const secret = ['Bearer', 'abcdef0123456789'].join(' ');
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, event(packet, { authority_receipt_ref: secret })).hold_code, H.SECRET_VALUE_FORBIDDEN);
  const path = ['C:', 'Users', 'person', 'agent.json'].join('/');
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, event(packet, { event_ref: path })).hold_code, H.LOCAL_PATH_VALUE_FORBIDDEN);
  const accessor = event(packet);
  Object.defineProperty(accessor, 'event_ref', { enumerable: true, get() { throw new Error('must not run'); } });
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, accessor).hold_code, H.ACCESSOR_PROPERTY_FORBIDDEN);
  const hostile = new Proxy({}, { ownKeys() { throw new Error('hostile'); } });
  assert.equal(appendAgentWorkforceRevisionEvent(catalog, hostile).hold_code, H.HOSTILE_INPUT_REFUSED);
  assert.equal(listAgentWorkforceRevisionEvents(catalog).length, 0);
});

test('the ledger is inaccessible, append-only and its projections cannot mutate stored events', () => {
  const catalog = createAgentWorkforceRevisionCatalog();
  const packet = prepared();
  appendAgentWorkforceRevisionEvent(catalog, event(packet));
  assert.deepEqual(Object.keys(catalog), ['kind']);
  const events = listAgentWorkforceRevisionEvents(catalog);
  assert.equal(Object.isFrozen(events), true);
  assert.equal(Object.isFrozen(events[0]), true);
  assert.throws(() => { events[0].mark_ref = 'agent-mark:tampered'; }, TypeError);
  assert.equal(listAgentWorkforceRevisionEvents(catalog)[0].mark_ref, packet.record.mark.mark_ref);
  assert.equal(listAgentWorkforceRevisionEvents(Object.freeze({ kind: catalog.kind })), null);
  assert.equal(projectActiveAgentWorkforceRevisions(Object.freeze({ kind: catalog.kind })).hold_code, H.UNKNOWN_CATALOG);
});

test('the catalog module has no persistence, filesystem, network, process, clock, runtime or task mutation surface', () => {
  const source = readFileSync(new URL('./agent_workforce_revision_catalog.mjs', import.meta.url), 'utf8');
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
  for (const forbiddenCall of ['registerAgent(', 'observeRun(', 'recordResultReceipt(', 'task_complete(', 'run_start(']) {
    assert.equal(source.includes(forbiddenCall), false, forbiddenCall);
  }
});
