import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { digestOf, guardEntry, isSafeRef } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

const hex = (value) => createHash('sha256').update(value).digest('hex');
const hold = (code) => Object.freeze({ status: 'HOLD', hold_code: code });
const safeHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const samePath = (a, b) => process.platform === 'win32'
  ? path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase() : a === b;
const CODES = Object.fromEntries(['tooDeep', 'accessor', 'tooLarge', 'hostileInput',
  'unknownField', 'secret', 'localPath'].map((key) => [key, 'HERMES_NATIVE_METADATA_INVALID']));
const exact = (value, fields) => value && Object.keys(value).length === fields.length
  && fields.every((field) => Object.hasOwn(value, field));
const sha = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const taskRef = (value) => exact(value, ['provider', 'task_id'])
  && isSafeRef(value.provider) && isSafeRef(value.task_id);
const revisionRef = (value) => exact(value, ['provider', 'task_id', 'revision_id', 'content_sha256'])
  && isSafeRef(value.provider) && isSafeRef(value.task_id) && isSafeRef(value.revision_id) && sha(value.content_sha256);
const claimRef = (value) => exact(value, ['task_ref', 'work_brief_revision_ref', 'action_ref'])
  && taskRef(value.task_ref) && revisionRef(value.work_brief_revision_ref) && isSafeRef(value.action_ref);
const RECEIPT_FIELDS = ['operation_id', 'attempt_no', 'fencing_epoch', 'brief_binding',
  'requested_session_ref', 'profile_ref', 'executable_sha256', 'source_manifest_digest',
  'before_metadata_digest', 'input_sha256', 'stdout_sha256', 'stderr_sha256',
  'after_metadata_digest', 'actual_session_id_digest', 'cli_exit_code', 'stdin_released',
  'candidate_custody', 'reviewed', 'human_accepted', 'observed_effort', 'external_effects',
  'status', 'reason_code', 'result_ref'];
function validReceipt(value) {
  const brief = value?.brief_binding;
  return exact(value, RECEIPT_FIELDS)
    && ['operation_id', 'requested_session_ref', 'profile_ref'].every((key) => isSafeRef(value[key]))
    && ['attempt_no', 'fencing_epoch'].every((key) => Number.isSafeInteger(value[key]) && value[key] > 0)
    && exact(brief, ['task_ref', 'work_brief_revision_ref', 'brief_ref', 'assignment_ref',
      'assignment_epoch', 'project_scope_ref', 'action_ref', 'authority_ref', 'input_bundle_manifest_digest'])
    && safeHash(brief.input_bundle_manifest_digest)
    && taskRef(brief.task_ref) && revisionRef(brief.work_brief_revision_ref)
    && ['brief_ref', 'assignment_ref', 'project_scope_ref', 'action_ref', 'authority_ref']
      .every((key) => isSafeRef(brief[key]))
    && Number.isSafeInteger(brief.assignment_epoch) && brief.assignment_epoch > 0
    && ['executable_sha256', 'source_manifest_digest', 'before_metadata_digest'].every((key) => sha(value[key]))
    && ['input_sha256', 'stdout_sha256', 'stderr_sha256', 'after_metadata_digest', 'actual_session_id_digest']
      .every((key) => value[key] === null || sha(value[key]))
    && (value.cli_exit_code === null || (Number.isSafeInteger(value.cli_exit_code) && value.cli_exit_code >= 0))
    && typeof value.stdin_released === 'boolean' && value.candidate_custody === false
    && value.reviewed === false && value.human_accepted === false && value.observed_effort === 'UNKNOWN'
    && value.external_effects === 'UNKNOWN' && ['hold', 'succeeded'].includes(value.status)
    && (value.reason_code === null || (typeof value.reason_code === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/u.test(value.reason_code)))
    && (value.result_ref === null || isSafeRef(value.result_ref));
}

// An operator-provisioned, protected directory is required. No fallback, expiry,
// automatic recovery or deletion of consumed claims is provided. A partial write
// is deliberately indistinguishable from a potentially executed attempt.
export function createHermesNativeAttemptStore({ directory } = {}) {
  let pinnedIdentity;
  async function checkDirectory() {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)
      || path.parse(directory).root === directory) throw new Error('directory');
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || !samePath(await realpath(directory), directory)) throw new Error('directory');
    const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    if (pinnedIdentity && identity !== pinnedIdentity) throw new Error('directory drift');
    pinnedIdentity = identity;
  }
  async function writeOnce(name, value) {
    await checkDirectory();
    const file = await open(path.join(directory, name), 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
    finally { await file.close(); }
  }
  async function reserve({ claim, session_key, attempt }) {
    try {
      const guarded = guardEntry({ claim, attempt }, ['claim', 'attempt'], CODES);
      if (guarded.status === 'HOLD' || !safeHash(session_key)
        || !claimRef(guarded.value.claim)
        || !exact(attempt, ['operation_id', 'fencing_epoch', 'attempt_no'])
        || !isSafeRef(attempt?.operation_id)
        || !Number.isSafeInteger(attempt?.fencing_epoch) || attempt.fencing_epoch < 1
        || !Number.isSafeInteger(attempt?.attempt_no) || attempt.attempt_no < 1) {
        return hold('HERMES_NATIVE_ATTEMPT_INVALID');
      }
      ({ claim, attempt } = guarded.value);
      const claimKey = hex(digestOf(claim));
      const token = Object.freeze({ claim_key: claimKey, session_key, nonce: randomUUID() });
      const record = { token, claim, attempt, state: 'CONSUMED_UNKNOWN' };
      await writeOnce(`claim-${claimKey}.json`, record);
      await writeOnce(`session-${session_key}.json`, token);
      return Object.freeze({ status: 'RESERVED', token,
        receipt_ref: `hermes-native-attempt.sha256.${claimKey}` });
    } catch (error) {
      return hold(error?.code === 'EEXIST' ? 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED'
        : 'HERMES_NATIVE_ATTEMPT_STORE_UNAVAILABLE');
    }
  }
  async function checkConsumed(claim) {
    try {
      const guarded = guardEntry({ claim }, ['claim'], CODES);
      if (guarded.status !== 'OK' || !claimRef(guarded.value.claim)) return hold('HERMES_NATIVE_ATTEMPT_INVALID');
      claim = guarded.value.claim;
      await checkDirectory();
      await lstat(path.join(directory, `claim-${hex(digestOf(claim))}.json`));
      return hold('HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
    } catch (error) {
      return error?.code === 'ENOENT' && pinnedIdentity ? Object.freeze({ status: 'AVAILABLE' })
        : hold('HERMES_NATIVE_ATTEMPT_STORE_UNAVAILABLE');
    }
  }
  async function complete(token, receipt) {
    try {
      const guarded = guardEntry(receipt, RECEIPT_FIELDS, CODES);
      if (!safeHash(token?.claim_key) || !safeHash(token?.session_key)
        || !exact(token, ['claim_key', 'session_key', 'nonce'])
        || guarded.status !== 'OK' || !validReceipt(guarded.value)) {
        return hold('HERMES_NATIVE_RECEIPT_INVALID');
      }
      receipt = guarded.value;
      await checkDirectory();
      const slotPath = path.join(directory, `session-${token.session_key}.json`);
      const slotStat = await lstat(slotPath);
      if (!slotStat.isFile() || slotStat.isSymbolicLink()) throw new Error('unsafe slot');
      const slot = await open(slotPath, 'r');
      let content;
      try {
        const stat = await slot.stat();
        if (!stat.isFile() || stat.size > 1024) throw new Error('slot');
        content = JSON.parse(await slot.readFile('utf8'));
      } finally { await slot.close(); }
      if (JSON.stringify(content) !== JSON.stringify(token)) throw new Error('owner');
      await writeOnce(`receipt-${token.claim_key}.json`, { token, receipt });
      // A verified normal exit permits a DIFFERENT task in this session. The
      // immutable claim still prevents any successor/resend of this task.
      if (receipt.status === 'succeeded') {
        await checkDirectory();
        await unlink(slotPath);
      }
      return Object.freeze({ status: 'RECORDED' });
    } catch { return hold('HERMES_NATIVE_RECEIPT_PERSISTENCE_UNKNOWN'); }
  }
  return Object.freeze({ reserve, complete, checkConsumed });
}
