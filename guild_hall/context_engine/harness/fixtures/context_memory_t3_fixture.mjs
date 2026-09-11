// Preparation only: actual candidate/review/acceptance, then materialize PUBLIC
// SYNTHETIC bytes into a new temporary worksite. Never imported by runtime code.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { authenticFixture, createBoundStore, ref, hash } from './accepted_context_fixture.mjs';
import { correctTimeline, sourceMetadata } from './accepted_context_read_fixture.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { CONTEXT_PACK_LIMITS } from '../../src/runtime/accepted_context_pack.mjs';

export const exampleRoot = new URL('../../../../docs/architecture/workspace/examples/context-memory/', import.meta.url);
const valid = '2026-08-01T00:00:00.000Z';
const known = '2026-08-02T00:00:00.000Z';
function row(id, kind, statement, key, value, extra = {}) {
  return { id, kind, statement, subject: 'T-A1', key, value, state: 'active', valid_at: valid, known_at: known,
    purposes: ['work', 'procedure_review'], relations: [], ...extra };
}
export function semanticSources(projectRef = ref(1)) {
  const source = records => JSON.stringify({ project_ref: projectRef, task_ref: 'T-A1', records });
  return {
    old: source([row('D-OLD', 'decision', 'P-A의 T-A1 시험 전압은 24 V로 정했다.', 'test-voltage', '24V')]),
    current: source([
      row('F-TASK', 'fact', 'T-A1은 P-A 전원장치 검증 업무이며 동일 이름의 P-B 업무와 별개다.', 'task-identity', 'P-A:T-A1'),
      row('D-CURRENT', 'decision', '정정 검토에서 T-A1 시험 전압을 28 V로 바꾸었다.', 'test-voltage', '28V'),
      row('C-REVISION', 'correction', '이전 24 V 결정은 대체되어 현재 근거에서 제외된다.', 'correction', '24V-to-28V',
        { relations: [{ kind: 'corrects', target: 'timeline-span:1' }] }),
      row('C-LIMIT', 'constraint', '시험 전에 입력 전류 제한을 2 A로 설정한다.', 'current-limit', '2A'),
      row('P-OPEN', 'commitment', '담당자 A는 시험 기록을 검토자에게 제출하기로 약속했으며 아직 미해소다.', 'test-record', 'pending', { subject: 'person:A' }),
      row('F-PRECEDENT', 'failure', '배선 극성을 확인하지 않아 이전 시험이 실패했다. 같은 커넥터를 사용할 때 극성을 먼저 확인한다.', 'polarity', 'failed',
        { relations: [{ kind: 'applies_to', target: 'F-TASK' }] }),
    ]),
    conflict: source([
      row('D-CONFLICT', 'decision', '별도 시험회의는 T-A1 시험 전압을 30 V로 유지한다. 28 V 정정과 충돌하며 최종 조정은 미확인이다.', 'test-voltage', '30V'),
      row('F-REVIEW', 'failure', '절차 검토용 사례: 계측기 교정 누락으로 재시험했다.', 'calibration', 'failed', { purposes: ['procedure_review'] }),
      row('S-REVIEW', 'success', '절차 검토용 사례: 교정 확인과 극성 점검을 함께 수행한 시험은 성공했다.', 'checklist', 'succeeded', { purposes: ['procedure_review'] }),
      row('P-PREF', 'preference', '담당자는 간결한 표 형식을 선호한다. 시험 전압의 사실이나 결정은 아니다.', 'format', 'table', { subject: 'person:A' }),
      row('D-WITHDRAWN', 'decision', '철회된 36 V 초안은 현재 적용하지 않는다.', 'test-voltage', '36V', { state: 'withdrawn' }),
    ]),
    common: source([row('P-COMMON', 'preference', '명시된 공통 읽기 권한으로만 간결한 형식 선호를 제공한다.', 'format', 'brief', { subject: 'person:A' })]),
  };
}

function bindBodies(request, bodies, corrected, sourceRefSeedOffset = 0) {
  const replacements = new Map([[100, bodies.old], [101, bodies.conflict], [4, bodies.common], ...(corrected ? [[901, bodies.current]] : [])]);
  for (const [seed, body] of replacements) {
    const previous = ref(seed); const next = ref(seed + sourceRefSeedOffset, hash(body));
    const replace = value => {
      if (Array.isArray(value)) return value.map(replace);
      if (!value || typeof value !== 'object') return value;
      if (exactRefIdentityKey(value) === exactRefIdentityKey(previous)) return structuredClone(next);
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
    };
    request.owner_context_contract = replace(request.owner_context_contract);
    request.producer_outputs.m2.assessment = replace(request.producer_outputs.m2.assessment);
    const entries = request.producer_outputs.timeline.projection.project_timelines[0].entries;
    const matching = request.owner_context_contract.source_ref_crosswalk.find(s => exactRefIdentityKey(s.source_revision_ref) === exactRefIdentityKey(next));
    const entry = entries.find(e => e.entry_id === matching?.timeline_entry_id);
    if (entry) entry.source_body_sha256 = hash(body).slice(7);
  }
  const timeline = request.producer_outputs.timeline;
  timeline.projection.project_timelines[0].ordered_entry_digest = sha256Canonical(timeline.projection.project_timelines[0].entries);
  const material = structuredClone(timeline.projection); delete material.projection_digest;
  timeline.projection.projection_digest = sha256Canonical(material);
  timeline.projection_pin.expected_projection_sha256 = timeline.projection.projection_digest;
  timeline.projection_pin.projection_ref.content_id = timeline.projection.projection_digest;
  const m2 = request.producer_outputs.m2;
  const digest = sha256Canonical({ domain: 'soulforge.project_context_generation.m2_assessment.v1', assessment: m2.assessment });
  m2.material_pin.expected_assessment_sha256 = digest;
  m2.material_pin.assessment_ref.content_id = digest;
}

export function createT3Fixture({ sources = semanticSources(), generation = 2, sourceRefSeedOffset = 0 } = {}) {
  const g1 = authenticFixture({ priorRef: ref(10), currentRef: ref(11), priorGenerationNum: 0, currentGenerationNum: 1,
    writerEpoch: 2, transformRequest: req => bindBodies(req, sources, false, sourceRefSeedOffset) });
  const g2 = authenticFixture({ projectBindingRef: g1.projectBindingRef, priorRef: g1.currentRef, currentRef: ref(12),
    priorGenerationNum: 1, currentGenerationNum: 2, priorCas: g1.builtCandidate.generation_proposal.cas_fingerprint_sha256,
    writerEpoch: 4, transformRequest: req => { correctTimeline(req); bindBodies(req, sources, true, sourceRefSeedOffset); } });
  g2.submission.registered_human_review.decision_ref = ref(81);
  const store = createBoundStore(g1);
  assert.equal(store.acceptCandidate(g1.submission).status, 'ACCEPTED');
  if (generation === 2) assert.equal(store.acceptCandidate(g2.submission).status, 'ACCEPTED');
  const f = generation === 2 ? g2 : g1;
  const grant = { grant_revision_ref: ref(701), allowed_projects: new Set([exactRefIdentityKey(f.projectBindingRef)]),
    allowed_scopes: new Set(['project', 'common']), allowed_purposes: new Set(['pilot_context_query']),
    field_allowed: true, chunk_allowed: true, locator_allowed: true };
  const state = { source: sourceMetadata(f), acl: { actors: new Map([['actor:alpha', grant]]), revoked_actors: new Set(), revoked_generations: new Set() } };
  const binding = { project_ref: f.projectBindingRef, producer_binding_ref: ref(800) };
  const bodies = new Map(Object.values(sources).map(body => [hash(body), body]));
  const sourceBindings = f.builtCandidate.project_context.memberships.filter(m => bodies.has(m.source_revision_ref.content_id))
    .map(m => ({ actor_ref: 'actor:alpha', purpose: 'pilot_context_query', scope: m.scope, source_lane: m.source_lane,
      project_ref: f.projectBindingRef, accepted_generation_ref: f.currentRef, grant_revision_ref: grant.grant_revision_ref,
      ...Object.fromEntries(['source_revision_ref','source_span_ref','context_unit_ref','context_event_ref','context_branch_ref','valid_at','known_at'].map(k => [k,m[k]])), locator: 'paragraph:1' }));
  const readLog = [];
  const providers = { currentPointer: () => store.getCurrentPointer(), currentSourceRevisions: () => state.source,
    currentAclPolicy: () => state.acl, readAcceptedGeneration: async () => ({ manifest: store.getGeneration(f.currentRef), receipt: store.getReceipt(f.currentRef) }),
    readSourceRevision: row => { readLog.push(row); const body = bodies.get(row.source_revision_ref.content_id);
      if (body === undefined) throw new Error('deleted synthetic source'); return { binding: row, body }; } };
  const request = { actor_ref: 'actor:alpha', project_ref: f.projectBindingRef, accepted_generation_ref: f.currentRef,
    scope: 'project', as_of: '2026-08-06T00:00:00.000Z', valid_at: '2026-08-05T00:00:00.000Z', known_at: '2026-08-06T00:00:00.000Z',
    purpose: 'pilot_context_query', task_ref: 'T-A1', memory_purpose: 'work', requested_kinds: ['fact','decision','correction','constraint','commitment','failure'],
    memory_mode: 'recall', budget: { ...CONTEXT_PACK_LIMITS } };
  return { f, g1, g2, store, state, binding, bodies, sourceBindings, providers, request, readLog,
    sourceReadback: { enabled: true, max_reads: 2, bindings: sourceBindings } };
}

export async function materializeT3(options = {}) {
  const x = createT3Fixture(options);
  const root = await mkdtemp(join(tmpdir(), 'accepted-context-synthetic-'));
  const put = (name, data) => writeFile(join(root, name), JSON.stringify(data));
  const sourceFiles = [...x.bodies].map(([digest]) => ({ source_revision_ref: x.sourceBindings.find(b => b.source_revision_ref.content_id === digest)?.source_revision_ref,
    file_name: 'source-' + digest.slice(7) + '.json' })).filter(row => row.source_revision_ref);
  for (const row of sourceFiles) await writeFile(join(root, row.file_name), x.bodies.get(row.source_revision_ref.content_id));
  const binding = { mode: 'synthetic_only', ...x.binding, project_label: 'P-A synthetic',
    actor_bindings: [{ account_id: 'account.alpha', actor_ref: 'actor:alpha' }], page_size: 2,
    context_pack: { source_bindings: x.sourceBindings, source_files: sourceFiles } };
  const bytes = JSON.stringify(binding); const bindingSha256 = hash(bytes);
  await writeFile(join(root, 'binding.json'), bytes);
  const grant = x.state.acl.actors.get('actor:alpha');
  const acl = { actors: [{ actor_ref: 'actor:alpha', grant: { ...grant, allowed_projects: [...grant.allowed_projects],
    allowed_scopes: [...grant.allowed_scopes], allowed_purposes: [...grant.allowed_purposes] } }], revoked_actors: [], revoked_generations: [] };
  await put('acl.json', acl); await put('pointer.json', x.store.getCurrentPointer()); await put('source-revisions.json', x.state.source);
  await put('accepted-generation.json', { manifest: x.store.getGeneration(x.f.currentRef), receipt: x.store.getReceipt(x.f.currentRef) });
  return { ...x, root, bindingSha256, sourceFiles, put, acl, preparation_effects: { accepted_generations: options.generation === 1 ? 1 : 2,
    temporary_files_written: sourceFiles.length + 5, operational_writes: 0 } };
}

// Explicit preparation command, separate from the production query CLI.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const x = await materializeT3();
  process.stdout.write(JSON.stringify({ root: x.root, bindingSha256: x.bindingSha256, request: x.request,
    preparation_effects: x.preparation_effects }) + '\n');
}
