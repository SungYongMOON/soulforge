// Concrete read-only input producer: approved released WorkPacket facts and
// existing committed Linear evidence. It never opens source bodies or issues tasks.
import path from 'node:path';
import { verifyAgentWorkforceAuthorityClaim } from '../../../../guild_hall/agent_observation/agent_authority_verification.mjs';
import { validateLaneRecord } from '../../../../guild_hall/path_registry/src/source_lane_index.mjs';
import { createWorkIntakeLinearReader } from './work_intake_linear.mjs';
import { hashWorkIntakeFacts } from './work_intake_adapter.mjs';
import { validateWorkIntakeDocuments } from './work_intake_documents.mjs';
import { intakeRead, intakeBytes, intakeHash as hash, intakeRef as ref, intakeCheck as check,
  intakeInside as inside, intakePin, bareHash, runIntakeReader } from './work_intake_io.mjs';

const fresh = value => Number.isFinite(Date.parse(value)) && Date.now() - Date.parse(value) >= 0 && Date.now() - Date.parse(value) <= 300000;
const unique = values => [...new Set(values)];
const COMPANY_SOURCES = ['gmail', 'slack', 'buzz', 'file_change', 'voice'];
export function workIntakeScopeDigest(index) {
  return hashWorkIntakeFacts({ project_ref: index.project_ref, scope_ref: index.scope_ref, producer_ref: index.producer_ref,
    generation: index.generation, window: index.window, observed_at: index.observed_at, source_reads: index.source_reads,
    captures: index.captures, events: index.events.map(({ release_binding, ...metadata }) => metadata),
    linear_projections: index.linear_projections.map(({ release_binding, ...metadata }) => metadata) });
}
export function createWorkIntakeSource({ deployment, assertDeployment }) {
  const roots = [deployment.control_root, deployment.evidence_root];
  const linear = createWorkIntakeLinearReader(deployment.linear);
  let last = null;
  async function authority(action = 'read') {
    await assertDeployment();
    const spec = deployment.authority;
    for (const descriptor of [spec.grant, spec.claim, spec.pin, spec.current, deployment.source_index, deployment.documents])
      check(roots.every(root => !inside(root, descriptor.path)), 'INTAKE_AUTHORITY_WRITABLE');
    const [grant, claim, pin, current] = await Promise.all([intakeRead(spec.grant), intakeRead(spec.claim), intakeRead(spec.pin), intakeRead(spec.current, { current: true })]);
    const verified = verifyAgentWorkforceAuthorityClaim(claim, pin, { ...current, evaluated_at: new Date().toISOString() });
    check(verified.status === 'VERIFIED_ACTIVE_BINDING' && verified.project_scope_ref === deployment.scope_ref
      && verified.authority_ref === grant.authority_ref && fresh(current.evaluated_at), 'INTAKE_CURRENT_AUTHORITY_REQUIRED');
    check(grant.project_ref === deployment.project_ref && grant.scope_ref === deployment.scope_ref
      && grant.agent_group === 'G1' && grant.input_class === 'g2_released_workpacket'
      && ref(grant.grant_ref) && ref(grant.producer_ref) && ref(grant.receiver_ref)
      && Array.isArray(grant.actions) && grant.actions.includes(action)
      && Date.parse(grant.valid_from) <= Date.now() && Date.parse(grant.valid_until) > Date.now()
      && Number.isInteger(grant.maximum_events) && grant.maximum_events > 0 && grant.maximum_events <= 32,
    'INTAKE_SCOPE_GRANT_REQUIRED');
    return grant;
  }
  async function indexRead(grant) {
    const index = await intakeRead(deployment.source_index, { current: true });
    check(index.version === 1 && index.project_ref === grant.project_ref && index.scope_ref === grant.scope_ref
      && index.producer_ref === grant.producer_ref && Number.isSafeInteger(index.generation) && index.generation > 0
      && fresh(index.observed_at) && Date.parse(index.window?.start) < Date.parse(index.window?.end)
      && Date.parse(index.window.end) <= Date.parse(index.observed_at)
      && Array.isArray(index.events) && index.events.length <= grant.maximum_events
      && Array.isArray(index.source_reads) && index.source_reads.length <= 5
      && Array.isArray(index.captures) && index.captures.length <= 5
      && Array.isArray(index.linear_projections) && index.linear_projections.length <= 128,
    'INTAKE_SOURCE_INDEX_INVALID');
    for (const capture of index.captures) {
      const result = validateLaneRecord(capture);
      check(result.status !== 'hold' && capture.record_kind === 'capture_generation' && fresh(capture.captured_at), 'INTAKE_CAPTURE_INVALID');
    }
    const allowed = grant.allowed_sources ?? ['gmail', 'slack'];
    check(Array.isArray(allowed) && allowed.every(source => COMPANY_SOURCES.includes(source)), 'INTAKE_SOURCE_GRANT_INVALID');
    for (const read of index.source_reads) check(allowed.includes(read.source)
      && index.captures.some(capture => read.evidence_refs?.includes(capture.capture_ref)
        && capture.source_ref === (grant.source_lanes?.[read.source] ?? `source.${read.source}`)), 'INTAKE_CAPTURE_UNBOUND');
    return index;
  }
  async function packet(pin, scopeDigest, grant, cache) {
    check(intakePin(pin) && deployment.release_binding_roots.some(root => inside(root, pin.path))
      && roots.every(root => !inside(root, pin.path)), 'INTAKE_RELEASE_BINDING_INVALID');
    const key = `${pin.path}:${pin.sha256}`;
    if (cache.has(key)) return cache.get(key);
    check(intakePin(deployment.release_profile) && roots.every(root => !inside(root, deployment.release_profile.path)), 'INTAKE_RELEASE_PROFILE_REQUIRED');
    const profile = await intakeRead(deployment.release_profile), releaseBinding = await intakeRead(pin);
    check(profile.version === 1 && profile.project_ref === grant.project_ref && profile.scope_ref === grant.scope_ref
      && Array.isArray(profile.approved_bindings) && profile.approved_bindings.length <= 128
      && profile.approved_bindings.some(approved => approved.path === pin.path && bareHash(approved.sha256) === bareHash(pin.sha256)),
    'INTAKE_RELEASE_PROFILE_MISMATCH');
    for (const field of ['kit_root', 'kit_code_pins', 'public_key'])
      check(hashWorkIntakeFacts(profile[field]) === hashWorkIntakeFacts(releaseBinding[field]), 'INTAKE_RELEASE_PROFILE_MISMATCH');
    for (const field of ['reviewer_ref', 'route_profile_id', 'route_sha256', 'model_id', 'work_type', 'work_revision',
      'work_digest', 'header_profile_sha256', 'policy_epoch', 'grant_ref', 'wire_profile'])
      check(profile[field] === releaseBinding.expected?.[field], 'INTAKE_RELEASE_PROFILE_MISMATCH');
    for (const name of ['released_body', 'prepared', 'review', 'permit', 'route', 'public_key', 'current'])
      check(releaseBinding[name]?.path && roots.every(root => !inside(root, releaseBinding[name].path)), 'INTAKE_RELEASE_AUTHORITY_WRITABLE');
    const value = await runIntakeReader({ ...deployment.packet_reader, args: ['--binding', pin.path, '--sha256', bareHash(pin.sha256)] });
    check(value.status === 'VERIFIED_RELEASE' && value.release?.project_ref === grant.project_ref
      && value.release.scope_ref === grant.scope_ref && value.release.audience === grant.receiver_ref
      && value.release.scope_digest === scopeDigest && value.release.model_id === deployment.judge.model,
    'INTAKE_RELEASE_NOT_CURRENT');
    check(deployment.data_provenance === 'synthetic' || value.release.live_enabled === true, 'INTAKE_LIVE_ROUTE_DISABLED');
    check(value.packet?.protocol === 'sf.sewe.packet/1.0' && Array.isArray(value.packet.facts), 'INTAKE_PACKET_INVALID');
    cache.set(key, value); return value;
  }
  function selectedFacts(value, factIds, sourceRef = null) {
    check(Array.isArray(factIds) && factIds.length > 0 && factIds.length <= 8 && new Set(factIds).size === factIds.length, 'INTAKE_FACT_SELECTION_INVALID');
    return factIds.map(id => {
      const fact = value.packet.facts.find(fact => fact.fact_id === id);
      check(fact?.status === 'FACT' && fact.segments.length <= 16
        && (sourceRef === null || fact.source_refs.includes(sourceRef)), 'INTAKE_FACT_NOT_CONFIRMED');
      const text = fact.segments.map(segment => segment.kind === 'literal' ? segment.text : `[${segment.slot_id}]`).join('');
      check(text.length > 0 && text.length <= 2400 && ref(id), 'INTAKE_FACT_LIMIT');
      return { fact_ref: id, text };
    });
  }
  async function produce({ run_id, cursors = {} }) {
    const grant = await authority(), index = await indexRead(grant), linearView = await linear.snapshot();
    check(linearView.status === 'CURRENT' && linearView.project_ref === grant.project_ref && linearView.scope_ref === grant.scope_ref,
      'INTAKE_LINEAR_NOT_CURRENT');
    const scopeDigest = workIntakeScopeDigest(index), packets = new Map(), events = [], engineering = {};
    for (const declared of index.events) {
      check((grant.allowed_sources ?? ['gmail', 'slack']).includes(declared.source) && ref(declared.event_ref)
        && declared.project_ref === grant.project_ref && ref(declared.project_binding_ref)
        && declared.producer_ref === undefined, 'INTAKE_EVENT_PROJECT_MISMATCH');
      const released = await packet(declared.release_binding, scopeDigest, grant, packets);
      const facts = selectedFacts(released, declared.fact_ids, declared.revision_ref);
      const { release_binding, fact_ids, engineering: context, ...metadata } = declared;
      events.push({ ...metadata, facts, facts_sha256: hashWorkIntakeFacts(facts), evidence_refs: unique([
        ...declared.evidence_refs, ...facts.map(f => f.fact_ref), released.release.ref]) });
      if (context) engineering[declared.event_ref] = structuredClone(context);
    }
    check(new Set(index.linear_projections.map(p => p.issue_id)).size === index.linear_projections.length
      && index.linear_projections.length === linearView.observations.length, 'INTAKE_LINEAR_SEMANTIC_COVERAGE');
    const tasks = [];
    for (const observation of linearView.observations) {
      const declared = index.linear_projections.find(p => p.issue_id === observation.issue_id);
      check(declared && declared.issue_content_sha256 === observation.issue_content_sha256
        && /^[a-f0-9]{64}$/u.test(declared.task_semantic_sha256), 'INTAKE_LINEAR_SEMANTIC_STALE');
      const released = await packet(declared.release_binding, scopeDigest, grant, packets), facts = selectedFacts(released, declared.fact_ids);
      tasks.push({ task_ref: `linear.task:${observation.linear_task.task_ref.task_id.toLowerCase()}`,
        project_ref: grant.project_ref, status: observation.linear_task.task_status === 'Done' ? 'completed'
          : observation.linear_task.task_status === 'Cancelled' ? 'cancelled' : 'open',
        task_semantic_sha256: declared.task_semantic_sha256, facts, facts_sha256: hashWorkIntakeFacts(facts),
        evidence_refs: unique([observation.linear_task.read_receipt_ref, observation.run_receipt_ref, ...facts.map(f => f.fact_ref)]) });
    }
    const documentSpec = await intakeRead(deployment.documents);
    const document_validation = validateWorkIntakeDocuments(documentSpec);
    const observed = new Date(Math.max(Date.parse(index.observed_at), Date.parse(linearView.observed_at))).toISOString();
    const source_reads = [...index.source_reads.map(read => ({ ...read, cursor_before: cursors[`${read.source}:${read.scope_ref}`] ?? null })),
      { source: 'linear', scope_ref: grant.scope_ref, status: tasks.length ? 'read' : 'empty', window: index.window,
        cursor_before: cursors[`linear:${grant.scope_ref}`] ?? null, cursor_after: `linear.generation.${linearView.generation_seq}`,
        observed_at: observed, permission_ref: grant.grant_ref, evidence_refs: [linearView.run_receipt_ref] }];
    const input = { run_id, provenance: deployment.mode === 'source_bound' ? 'source_bound' : 'synthetic', project_ref: grant.project_ref,
      window: index.window, observed_at: observed, permission_refs: [grant.grant_ref], source_reads, events,
      linear_view: { scope_ref: grant.scope_ref, as_of: observed, status: 'current', coverage: 'complete',
        evidence_refs: [linearView.run_receipt_ref], tasks }, echo_receipts: [], document_validation };
    check(hash(await indexRead(grant)) === hash(index) && await linear.current(linearView) && hash(await authority()) === hash(grant), 'INTAKE_SOURCE_CHANGED');
    const bindings = [...index.events, ...index.linear_projections].map(value => value.release_binding);
    last = { index_sha256: hash(index), grant_sha256: hash(grant), linearView,
      packetPins: [...new Map(bindings.map(pin => [`${pin.path}:${pin.sha256}`, pin])).values()], scopeDigest };
    return { input, engineering, source_snapshot_sha256: hash({ index: hash(index), linear: linearView.snapshot_sha256, scopeDigest }),
      generation: index.generation, source_index_sha256: hash(index), linear_snapshot_sha256: linearView.snapshot_sha256,
      coverage_gaps: linearView.coverage_gaps, releases: [...packets.values()].map(value => value.release) };
  }
  async function current(action = 'read') {
    if (!last) return false;
    try {
      const grant = await authority(action);
      if (hash(grant) !== last.grant_sha256 || hash(await indexRead(grant)) !== last.index_sha256 || !await linear.current(last.linearView)) return false;
      const cache = new Map();
      for (const pin of last.packetPins) await packet(pin, last.scopeDigest, grant, cache);
      return hash(await authority(action)) === last.grant_sha256;
    } catch { return false; }
  }
  return { produce, current, authority, async identity() { const grant = await authority(); return hash(await indexRead(grant)); } };
}
