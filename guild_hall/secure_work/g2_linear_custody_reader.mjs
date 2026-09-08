// G2 SOURCE-controller custody port. Metadata observation is not source authority.
// This adapter adds no role, scope, permit, projection or execution grant.
import path from 'node:path';
import { createLinearReadEvidenceReader } from '../linear_history/linear_read_evidence_reader.mjs';
import { canonicalBytes } from '../linear_history/linear_custody.mjs';
import { sha256Canonical } from '../shared/project_history_envelope.mjs';
import { readRuntimeBytes, runtimeExact, runtimeInside } from '../dev_worker/feedback_runtime_io.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const deny = code => { throw Object.assign(new Error(code), { g2Code: code }); };
const check = (value, code) => { if (!value) deny(code); };
const equal = (a, b) => sha256Canonical(a) === sha256Canonical(b);

/** authority is the existing loadExecutionAuthority() consumer. Only explicit
 * in-process synthetic tests substitute this port; the CLI cannot choose one.
 * bytes never enter stdout, a receipt, or the G1 feedback runtime.
 */
export function createG2LinearCustodyReader({ expectedBinding, authority, producerRef,
  maxAgeMs = 300000, maximumBytes = 1048576, now = Date.now } = {}) {
  check(authority && typeof authority.entry === 'function' && typeof authority.authorize === 'function'
    && REF.test(producerRef) && Number.isSafeInteger(maximumBytes) && maximumBytes > 0
    && maximumBytes <= 8388608, 'G2_CUSTODY_CONFIG_HOLD');
  const pins = structuredClone(expectedBinding);
  const reader = createLinearReadEvidenceReader({ root: pins?.custody_root,
    expectedBinding: pins, maxAgeMs, now });

  function identity() {
    const proof = authority.entry('jobs.advance');
    check(proof?.purpose === 'SOURCE' && proof.principal_ref === producerRef
      && proof.project_ref === pins.project_scope_ref && Number.isSafeInteger(proof.expires_at)
      && now() < proof.expires_at, 'G2_CUSTODY_AUTHORITY_HOLD');
    return proof;
  }
  function scoped(proof, observed) {
    check(proof.task_ref === `linear.task:${observed.linear_task.task_ref.task_id.toLowerCase()}`,
      'G2_CUSTODY_TASK_SCOPE_HOLD');
    const scope = Object.fromEntries(['project_ref', 'assignment_ref', 'assignment_epoch',
      'task_ref', 'policy_epoch', 'route_sha256', 'audience'].map(key => [key, proof[key]]));
    check(equal(authority.authorize('jobs.advance', scope), proof), 'G2_CUSTODY_AUTHORITY_CHANGED');
  }
  async function observation(selection) {
    check(runtimeExact(selection, ['issue_id', 'issue_content_sha256', 'scope_ref', 'generation_seq'])
      && UUID.test(selection.issue_id) && SHA.test(selection.issue_content_sha256)
      && selection.scope_ref === pins.project_scope_ref && Number.isSafeInteger(selection.generation_seq)
      && selection.generation_seq > 0, 'G2_CUSTODY_SELECTION_HOLD');
    const observed = await reader.resolve({ issueId: selection.issue_id });
    check(observed.status === 'CURRENT', observed.hold_code ?? 'G2_CUSTODY_CURRENTNESS_HOLD');
    check(observed.issue_content_sha256 === selection.issue_content_sha256
      && observed.project_scope_ref === selection.scope_ref && observed.generation_seq === selection.generation_seq,
    'G2_CUSTODY_REVISION_CHANGED');
    return observed;
  }

  return Object.freeze({
    async current(selection) {
      try {
        const proof = identity(), observed = await observation(selection);
        scoped(proof, observed);
        check(equal(identity(), proof), 'G2_CUSTODY_AUTHORITY_CHANGED');
        return { status: 'CURRENT', observation: observed, execution_authority: false };
      } catch (error) { return { status: 'HOLD', code: error.g2Code ?? 'G2_CUSTODY_AUTHORITY_HOLD', execution_authority: false }; }
    },
    async read(selection) {
      // Current installed controller identity precedes all custody IO.
      const proof = identity(), before = await observation(selection);
      scoped(proof, before);
      const filename = path.join(pins.custody_root, 'issues', selection.issue_id,
        `${selection.issue_content_sha256.slice(7)}.json`);
      check(runtimeInside(pins.custody_root, filename), 'G2_CUSTODY_PATH_HOLD');
      const bytes = await readRuntimeBytes(filename, null, maximumBytes);
      try {
        const wrapper = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        check(runtimeExact(wrapper, ['schema_version', 'kind', 'object_id', 'content_sha256', 'object'])
          && wrapper.schema_version === 'soulforge.linear_collect.custody_object.v1'
          && wrapper.kind === 'issues' && wrapper.object_id === selection.issue_id
          && wrapper.content_sha256 === selection.issue_content_sha256
          && wrapper.object?.id === selection.issue_id
          && wrapper.object.identifier === before.linear_task.task_ref.task_id
          && wrapper.object.updated_at === before.issue_updated_at
          && sha256Canonical(wrapper.object) === selection.issue_content_sha256
          && bytes.equals(canonicalBytes(wrapper)),
        'G2_CUSTODY_OBJECT_MISMATCH');
        scoped(proof, before);
        const after = await observation(selection);
        check(equal(before, after) && equal(identity(), proof), 'G2_CUSTODY_READ_CHANGED');
        // Exact collector wrapper bytes, with the canonical object digest kept
        // distinct from the file-byte digest. Caller owns zeroization after use.
        return { bytes, observation: after, producer_ref: producerRef, execution_authority: false };
      } catch (error) {
        bytes.fill(0);
        if (error.g2Code) throw error;
        deny('G2_CUSTODY_OBJECT_HOLD');
      }
    },
  });
}
