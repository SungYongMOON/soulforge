// Isolated synthetic producer events. No gateway/model/tool execution or real data.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProtectedWorkingBytes } from '../../../../../guild_hall/shared/protected_working_bytes.mjs';
import { createBuzzPilotJob, BUZZ_PILOT_ROLES } from '../../src/buzz_pilot_job.mjs';
import { BUZZ_PILOT_SOURCE_FILES } from '../../tools/buzz_pilot_job_cli.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const repositoryRoot = resolve(fileURLToPath(new URL('../../../../..', import.meta.url)));
const owner = '1'.repeat(64), bot = '2'.repeat(64), chat = '00000000-0000-4000-8000-000000000001';
const messageId = value => value.toString(16).padStart(64, '0');
export async function makeBuzzPilotWorkbenchFixture({ state = 'waiting_owner' } = {}) {
  if (!['waiting_owner', 'delivered', 'question_delivery_unknown'].includes(state)) throw new Error('Unsupported synthetic Buzz state');
  const root = await mkdtemp(join(tmpdir(), 'sf-buzz-workbench-'));
  const evidenceRoot = join(root, 'evidence'), controlPath = join(root, 'control', 'buzz-pilot.sqlite'), home = join(root, 'synthetic-home');
  await mkdir(evidenceRoot); await mkdir(dirname(controlPath)); await mkdir(home);
  const instruction = Buffer.from('합성 자료를 검토하고 독자를 확인해 주세요.\n');
  const question = { question: '이 합성 검토문의 독자는 누구인가요?', choices: ['개발팀', '경영진'], multi_select: false };
  const time = Date.now();
  const coreBinding = { version: 1, job_id: 'job.synthetic-workbench', project_id: 'SYN-001', owner_account_id: 'account.a',
    expected_owner_pubkey: owner, expected_bot_pubkey: bot, chat_id: chat, profile_ref: 'profile.synthetic-workbench',
    instruction_sha256: `sha256:${hash(instruction)}`, issued_at: new Date(time - 1000).toISOString(),
    expires_at: new Date(time + 3600000).toISOString() };
  const workingBytes = createProtectedWorkingBytes({ root: evidenceRoot, repositoryRoot,
    storageClass: 'owner_approved_shared_worksite', ownerApprovalRef: 'approval.synthetic-buzz-workbench', roles: BUZZ_PILOT_ROLES });
  const db = new DatabaseSync(controlPath);
  let sequence = 0;
  const access = { accountId: 'account.a', checkSession: async () => true, canAccessProject: async project => project === 'SYN-001' };
  try {
    const producer = createBuzzPilotJob({ db, workingBytes, binding: coreBinding,
      authorize: async (action, context, actor) => action === 'append' ? actor?.job_id === context.job_id
        : actor?.accountId === context.owner_account_id && await actor.checkSession() && await actor.canAccessProject(context.project_id) });
    const append = (type, payload) => producer.append({ version: 1, observation_id: `synthetic.event.${++sequence}`,
      job_id: coreBinding.job_id, event_type: type, profile_ref: coreBinding.profile_ref, chat_id: chat, bot_pubkey: bot,
      actor_pubkey: ['instruction_received', 'answer_received', 'answer_accepted'].includes(type) ? owner : bot,
      session_key: 'session:synthetic-workbench', session_id: 'session.synthetic-workbench', observed_at: new Date().toISOString(), payload });
    await producer.issue({ instructionBytes: instruction }, access);
    await append('instruction_received', { message_id: messageId(1), text: instruction.toString().trim() });
    await append('tool_started', { tool_call_id: 'call.synthetic', tool_name: 'clarify', input: question });
    await append('question_registered', { clarify_id: 'clarify.synthetic', tool_call_id: 'call.synthetic', ...question });
    await append('question_delivery', { clarify_id: 'clarify.synthetic', delivery_status: state === 'question_delivery_unknown' ? 'unknown' : 'sent',
      message_id: state === 'question_delivery_unknown' ? null : messageId(2) });
    if (state === 'delivered') {
      await append('answer_received', { clarify_id: 'clarify.synthetic', message_id: messageId(3), text: '개발팀' });
      await append('answer_accepted', { clarify_id: 'clarify.synthetic', message_id: messageId(3) });
      await append('resumed', { clarify_id: 'clarify.synthetic', tool_call_id: 'call.synthetic' });
      await append('tool_completed', { tool_call_id: 'call.synthetic', tool_name: 'clarify', output: '개발팀', outcome: 'completed' });
      await append('final_response', { text: '개발팀을 위한 합성 검토문입니다. 실제 업무 결과가 아닙니다.' });
      await append('final_delivery', { delivery_status: 'sent', message_id: messageId(4) });
    }
    if ((await producer.snapshot(access)).state !== state) throw new Error('Synthetic producer state mismatch');
  } finally { db.close(); }
  const sourceHashes = Object.fromEntries(await Promise.all(BUZZ_PILOT_SOURCE_FILES.map(async part => [part, hash(await readFile(join(repositoryRoot, part)))])));
  const binding = { ...coreBinding, node_path: process.execPath, node_sha256: hash(await readFile(process.execPath)),
    observer_entry_path: join(repositoryRoot, BUZZ_PILOT_SOURCE_FILES[0]), observer_entry_sha256: sourceHashes[BUZZ_PILOT_SOURCE_FILES[0]],
    observer_code_root: repositoryRoot, observer_source_hashes: sourceHashes, control_db_path: controlPath,
    evidence_root: evidenceRoot, repository_root: repositoryRoot, storage_class: 'owner_approved_shared_worksite',
    owner_approval_ref: 'approval.synthetic-buzz-workbench', expected_hermes_home: home };
  const bindingPath = join(root, 'synthetic-binding.json'), bindingBytes = Buffer.from(JSON.stringify(binding));
  await writeFile(bindingPath, bindingBytes);
  return { root, scope: { project_code: 'SYN-001' }, bindingPath, bindingSha256: hash(bindingBytes), binding, instruction, state };
}
