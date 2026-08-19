// The file door, driven end to end over a synthetic project (문 앞 칸, 09장 §9.1D).
//
// Everything here happens in a temporary directory that plays the part of a repository root: a
// `_workspaces` project plane with a folder tree built from the public compiled-variant fixture, a
// `_workmeta` metadata plane for the ledgers, and one profile naming both. No real project, no real
// path, no real person.
//
// The properties these tests are here to hold:
//
//   * a ticket is a folder somebody owns, for a while, once;
//   * a registration moves bytes into the folder the *rules* name — and refuses when the rules and
//     the folder tree disagree, rather than filing the document under whatever that number is now;
//   * nothing is ever overwritten and nothing is ever deleted;
//   * a confidential folder is refused per item, even for a role the tool itself is open to;
//   * every one of those decisions leaves a line behind.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCESS_TABLE_FIXTURE, DOOR_RELATIVE, SYNTHETIC_MISMATCHED_TOKEN, SYNTHETIC_REGISTER_TOKEN,
  SYNTHETIC_STAGE, stageSyntheticProject,
} from '../fixtures/engine_mcp_synthetic_project.mjs';
import { resolveAccessView, validateAccessTable } from './access_table.mjs';
import {
  FILE_OPERATIONS_RECEIPT_FILE, FILE_TICKETS_FILE, REGISTERED_CANDIDATES_FILE,
  REGISTERED_OBSERVATIONS_FILE, createEngineContext,
} from './engine_context.mjs';
import { ENGINE_MCP_TOOLS_BY_NAME, TOOL_DESCRIPTORS } from './tools/index.mjs';

const ENGINE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENGINE_VERSION = readFileSync(join(ENGINE_ROOT, 'topology', 'ENGINE_VERSION'), 'utf8').trim();
const ACCESS_TABLE = validateAccessTable(ACCESS_TABLE_FIXTURE.access_table);

/** The stage's own folder, as the fixture built it out of the compiled variant. */
const GATE_FOLDER = '030_SRR';
const TASK_FOLDER = '3004_Synthetic system requirements specification';

async function stage({ role = 'owner', write = true, now = null, file_door: fileDoor = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_file_'));
  const staged = stageSyntheticProject(root, { file_door: fileDoor });
  const context = await createEngineContext({
    profile_path: staged.profile_path,
    repo_root: root,
    engine_root: ENGINE_ROOT,
    engine_version: ENGINE_VERSION,
    write_enabled: write,
    view: resolveAccessView({
      table: ACCESS_TABLE,
      principal: { principal_ref: `test_${role}`, role },
      project_code: staged.project_code,
    }),
    shared: { tools: TOOL_DESCRIPTORS, access_table: ACCESS_TABLE, protocol_version: 'test' },
  });
  // The clock is a seam on purpose: "this ticket expired" has to be something a test can state.
  if (now !== null) context.now = () => now;
  return { root, staged, context };
}

const call = (name, args, context) => ENGINE_MCP_TOOLS_BY_NAME.get(name).handler(args, context);

const refusalOf = async (run) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail('this should have been refused');
  return null;
};

const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const base64 = (text) => Buffer.from(text, 'utf8').toString('base64');

const readLines = (path) => {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
};

/** One upload ticket with one file already sitting in it, the way a person would have left it. */
async function stagedTicket(context, staged, name = 'SSRS_draft_v1.pdf', body = 'synthetic') {
  const ticket = await call('file_ticket', { purpose: 'upload' }, context);
  const folder = join(staged.project_root, ...ticket.structured.folder_ref.split('/'));
  writeFileSync(join(folder, name), body, 'utf8');
  return { ticket: ticket.structured, folder };
}

// ---------------------------------------------------------------- tickets

test('an upload ticket makes one folder nobody else has, and the ledger says whose it is', async () => {
  const { root, staged, context } = await stage();
  try {
    const result = await call('file_ticket', { purpose: 'upload', note: '발표자료 올릴 자리' }, context);
    const structured = result.structured;
    assert.match(structured.ticket_id, /^up_[0-9]{8}t[0-9]{6}z_[0-9a-f]{6}$/u);
    assert.equal(structured.purpose, 'upload');
    assert.ok(structured.folder_ref.startsWith(DOOR_RELATIVE.intake.join('/')));
    assert.ok(structured.folder_ref.endsWith(`test_owner/${structured.ticket_id}`));
    assert.equal(structured.artifact_ref, null);
    assert.ok(Date.parse(structured.expires_at) > Date.now());

    const rows = readLines(join(staged.receipts_dir, FILE_TICKETS_FILE));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].principal_ref, 'test_owner');
    assert.equal(rows[0].status, 'open');
    // Metadata only: the ledger carries a pointer, never an absolute path.
    assert.equal(rows[0].folder_ref.includes(':'), false);

    const listed = await call('file_tickets_list', {}, context);
    assert.equal(listed.structured.counts.open, 1);
    assert.equal(listed.structured.rows[0].ticket_id, structured.ticket_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a ticket whose hour has passed is expired, and registering from it is refused', async () => {
  const { root, staged, context } = await stage({ now: '2026-08-19T05:00:00.000Z' });
  try {
    const { ticket } = await stagedTicket(context, staged);
    context.now = () => '2026-08-30T05:00:00.000Z';
    const listed = await call('file_tickets_list', {}, context);
    assert.equal(listed.structured.counts.expired, 1);
    assert.equal(listed.structured.counts.open, 0);

    const refusal = await refusalOf(() => call('file_register', {
      ticket_id: ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, context));
    assert.equal(refusal.code, 'ENGINE_MCP_TICKET_NOT_OPEN');
    assert.equal(refusal.detail.state, 'expired');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a project with no file door refuses every file tool by naming the profile field', async () => {
  const { root, context } = await stage({ file_door: false });
  try {
    const refusal = await refusalOf(() => call('file_ticket', { purpose: 'upload' }, context));
    assert.equal(refusal.code, 'ENGINE_MCP_FILE_DOOR_DISABLED');
    assert.equal(refusal.detail.field, 'intake_dir');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- register by move

test('registering moves the file into the task folder the rules name and writes the observation', async () => {
  const { root, staged, context } = await stage();
  try {
    const { ticket, folder } = await stagedTicket(context, staged);
    const result = await call('file_register', {
      ticket_id: ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
      note: '최종본',
    }, context);
    const structured = result.structured;

    assert.equal(structured.observation_state, 'observed');
    assert.equal(structured.counts.moved, 1);
    assert.equal(structured.counts.observations, 1);
    assert.equal(structured.counts.awaiting_confirmation, 0);
    assert.equal(structured.task_number, 3004);
    assert.equal(structured.registered[0].file_ref,
      `${GATE_FOLDER}/${TASK_FOLDER}/03_Out/SSRS_draft_v1.pdf`);

    // The bytes are in the task folder and out of the ticket folder: a move, not a copy.
    const landed = join(staged.project_root, GATE_FOLDER, TASK_FOLDER, '03_Out', 'SSRS_draft_v1.pdf');
    assert.equal(readFileSync(landed, 'utf8'), 'synthetic');
    assert.equal(existsSync(join(folder, 'SSRS_draft_v1.pdf')), false);
    assert.equal(structured.registered[0].sha256, sha256('synthetic'));

    // 등록 = 저장: the row is an observation the engine reads, not a candidate.
    const observations = readLines(join(staged.observations_dir, REGISTERED_OBSERVATIONS_FILE));
    assert.equal(observations.length, 1);
    assert.equal(observations[0].artifact_type_id, SYNTHETIC_REGISTER_TOKEN);
    assert.equal(observations[0].principal_ref, 'test_owner');
    assert.equal(observations[0].observation.presence_state, 'present');
    assert.equal(readLines(join(staged.observations_dir, REGISTERED_CANDIDATES_FILE)).length, 0);

    const loaded = await context.loadObservations();
    assert.equal(loaded.sources.registered_rows, 1);
    assert.ok(loaded.rows.some((row) => row.artifact_type_id === SYNTHETIC_REGISTER_TOKEN));

    // The ticket is spent, and the receipt says who moved which digest where.
    const tickets = readLines(join(staged.receipts_dir, FILE_TICKETS_FILE));
    assert.equal(tickets[tickets.length - 1].status, 'used');
    const receipts = readLines(join(staged.receipts_dir, FILE_OPERATIONS_RECEIPT_FILE));
    const move = receipts.find((row) => row.operation === 'register_move');
    assert.equal(move.principal_ref, 'test_owner');
    assert.equal(move.ticket_id, ticket.ticket_id);
    assert.equal(move.files[0].sha256, sha256('synthetic'));
    assert.equal(move.task_number, 3004);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a file whose own name says nothing waits for a person rather than becoming an observation', async () => {
  const { root, staged, context } = await stage();
  try {
    const { ticket } = await stagedTicket(context, staged, 'meeting notes.txt', 'no cue here');
    const result = await call('file_register', {
      ticket_id: ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, context);
    assert.equal(result.structured.observation_state, 'awaiting_confirmation');
    assert.equal(result.structured.counts.moved, 1);
    assert.equal(result.structured.counts.observations, 0);
    assert.equal(result.structured.counts.awaiting_confirmation, 1);

    const waiting = readLines(join(staged.observations_dir, REGISTERED_CANDIDATES_FILE));
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].decision, null);
    assert.equal(waiting[0].source, 'mcp.file_register');
    assert.equal(readLines(join(staged.observations_dir, REGISTERED_OBSERVATIONS_FILE)).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a task folder that is missing, or that carries another task name, refuses the move', async () => {
  const { root, staged, context } = await stage();
  try {
    // The folder tree disagrees with the rules: the number is right, the name is another task's.
    const first = await stagedTicket(context, staged, 'SEMP_v1.pdf');
    const mismatch = await refusalOf(() => call('file_register', {
      ticket_id: first.ticket.ticket_id,
      artifact_type_id: SYNTHETIC_MISMATCHED_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, context));
    assert.equal(mismatch.code, 'ENGINE_MCP_TASK_FOLDER_UNRESOLVED');
    assert.equal(mismatch.reason ?? mismatch.detail.reason, 'task_folder_names_a_different_task');
    // Nothing moved, and the ticket is still the caller's to use.
    assert.equal(readLines(join(staged.receipts_dir, FILE_OPERATIONS_RECEIPT_FILE))
      .filter((row) => row.operation === 'register_move').length, 0);

    // And the folder simply not being there is its own refusal — never a folder the door creates.
    rmSync(join(staged.project_root, GATE_FOLDER, TASK_FOLDER), { recursive: true, force: true });
    const missing = await refusalOf(() => call('file_register', {
      ticket_id: first.ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, context));
    assert.equal(missing.code, 'ENGINE_MCP_TASK_FOLDER_UNRESOLVED');
    assert.equal(missing.detail.reason, 'task_folder_missing');
    assert.equal(missing.detail.task_number, 3004);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a name already in the task folder is refused, and only a stated version gets in', async () => {
  const { root, staged, context } = await stage();
  try {
    const first = await stagedTicket(context, staged, 'SSRS_final.pdf', 'first');
    await call('file_register', {
      ticket_id: first.ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, context);

    const second = await stagedTicket(context, staged, 'SSRS_final.pdf', 'second');
    const refusal = await refusalOf(() => call('file_register', {
      ticket_id: second.ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, context));
    assert.equal(refusal.code, 'ENGINE_MCP_OUTPUT_EXISTS');
    // The first file is untouched: a refusal never half-replaces anything.
    assert.equal(
      readFileSync(join(staged.project_root, GATE_FOLDER, TASK_FOLDER, '03_Out', 'SSRS_final.pdf'), 'utf8'),
      'first');

    const versioned = await call('file_register', {
      ticket_id: second.ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
      allow_new_version: true,
    }, context);
    assert.equal(versioned.structured.registered[0].name, 'SSRS_final (v2).pdf');
    assert.equal(versioned.structured.registered[0].version, 2);
    assert.equal(
      readFileSync(join(staged.project_root, GATE_FOLDER, TASK_FOLDER, '03_Out', 'SSRS_final (v2).pdf'), 'utf8'),
      'second');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- small files in and out

test('a small file comes through the call, hashed, and is not registered by arriving', async () => {
  const { root, staged, context } = await stage();
  try {
    const ticket = (await call('file_ticket', { purpose: 'upload' }, context)).structured;
    const body = 'a synthetic requirements specification';
    const put = await call('file_put', {
      ticket_id: ticket.ticket_id,
      name: 'SSRS_put.pdf',
      content_base64: base64(body),
      sha256: sha256(body),
    }, context);
    assert.equal(put.structured.registered, false);
    assert.equal(put.structured.sha256, sha256(body));
    assert.equal(put.structured.bytes, Buffer.byteLength(body));
    assert.equal(
      readFileSync(join(staged.project_root, ...ticket.folder_ref.split('/'), 'SSRS_put.pdf'), 'utf8'),
      body);

    // A second file of the same name into the same ticket folder is refused, not merged.
    const twice = await refusalOf(() => call('file_put', {
      ticket_id: ticket.ticket_id,
      name: 'SSRS_put.pdf',
      content_base64: base64(body),
      sha256: sha256(body),
    }, context));
    assert.equal(twice.code, 'ENGINE_MCP_OUTPUT_EXISTS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the small door refuses a wrong digest, a forbidden extension and a file over the cap', async () => {
  const { root, context } = await stage();
  try {
    const ticket = (await call('file_ticket', { purpose: 'upload' }, context)).structured;
    const body = 'hello';

    const wrongHash = await refusalOf(() => call('file_put', {
      ticket_id: ticket.ticket_id, name: 'a.pdf', content_base64: base64(body), sha256: sha256('other'),
    }, context));
    assert.equal(wrongHash.code, 'ENGINE_MCP_FILE_HASH_MISMATCH');

    const badExtension = await refusalOf(() => call('file_put', {
      ticket_id: ticket.ticket_id, name: 'payload.exe', content_base64: base64(body), sha256: sha256(body),
    }, context));
    assert.equal(badExtension.code, 'ENGINE_MCP_FILE_EXTENSION_REFUSED');

    const climb = await refusalOf(() => call('file_put', {
      ticket_id: ticket.ticket_id, name: '../escape.pdf', content_base64: base64(body), sha256: sha256(body),
    }, context));
    assert.equal(climb.code, 'ENGINE_MCP_FILE_NAME_REFUSED');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the size cap the profile states is the cap the door applies', async () => {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_file_cap_'));
  try {
    const staged = stageSyntheticProject(root, {
      ticket_policy: { upload_ttl_hours: 72, download_ttl_hours: 24, cleanup_after_days: 30, max_file_bytes: 8 },
    });
    const context = await createEngineContext({
      profile_path: staged.profile_path,
      repo_root: root,
      engine_root: ENGINE_ROOT,
      engine_version: ENGINE_VERSION,
      write_enabled: true,
      view: resolveAccessView({
        table: ACCESS_TABLE,
        principal: { principal_ref: 'test_owner', role: 'owner' },
        project_code: staged.project_code,
      }),
      shared: { tools: TOOL_DESCRIPTORS, access_table: ACCESS_TABLE, protocol_version: 'test' },
    });
    const ticket = (await call('file_ticket', { purpose: 'upload' }, context)).structured;
    const body = 'far too long for eight bytes';
    const refusal = await refusalOf(() => call('file_put', {
      ticket_id: ticket.ticket_id, name: 'a.pdf', content_base64: base64(body), sha256: sha256(body),
    }, context));
    assert.equal(refusal.code, 'ENGINE_MCP_FILE_TOO_LARGE');
    assert.equal(refusal.detail.max_bytes, 8);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- taking a file back out

test('a download ticket copies the registered file into the outbox and leaves the original', async () => {
  const { root, staged, context } = await stage();
  try {
    const { ticket } = await stagedTicket(context, staged);
    const registered = await call('file_register', {
      ticket_id: ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, context);
    const artifactRef = registered.structured.registered[0].file_ref;

    const download = await call('file_ticket', { purpose: 'download', artifact_ref: artifactRef }, context);
    assert.equal(download.structured.purpose, 'download');
    assert.equal(download.structured.copied_file, 'SSRS_draft_v1.pdf');
    assert.ok(download.structured.folder_ref.startsWith(DOOR_RELATIVE.outbox.join('/')));
    const copy = join(staged.project_root, ...download.structured.folder_ref.split('/'), 'SSRS_draft_v1.pdf');
    assert.equal(readFileSync(copy, 'utf8'), 'synthetic');
    // The registered file is still where it was registered.
    assert.equal(readFileSync(join(staged.project_root, ...artifactRef.split('/')), 'utf8'), 'synthetic');

    const got = await call('file_get', { artifact_ref: artifactRef }, context);
    assert.equal(Buffer.from(got.structured.content_base64, 'base64').toString('utf8'), 'synthetic');
    assert.equal(got.structured.sha256, sha256('synthetic'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a file in a confidential folder does not come out for a role without that class', async () => {
  for (const role of ['hw', 'owner']) {
    const { root, staged, context } = await stage({ role });
    try {
      const secret = join(staged.confidential_dir, 'contract_price_list.pdf');
      mkdirSync(staged.confidential_dir, { recursive: true });
      writeFileSync(secret, 'confidential', 'utf8');
      const ref = context.projectRef(secret);

      if (role === 'hw') {
        const ticketRefusal = await refusalOf(() =>
          call('file_ticket', { purpose: 'download', artifact_ref: ref }, context));
        assert.equal(ticketRefusal.code, 'SE_MCP_CLASS_EXCEEDED');
        const getRefusal = await refusalOf(() => call('file_get', { artifact_ref: ref }, context));
        assert.equal(getRefusal.code, 'SE_MCP_CLASS_EXCEEDED');
        // A refusal leaves nothing behind that says somebody was allowed to ask.
        assert.equal(readLines(join(staged.receipts_dir, FILE_TICKETS_FILE)).length, 0);
      } else {
        const allowed = await call('file_get', { artifact_ref: ref }, context);
        assert.equal(Buffer.from(allowed.structured.content_base64, 'base64').toString('utf8'),
          'confidential');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('a team role is shown its own answer with the paths taken out', async () => {
  const { root, context } = await stage({ role: 'hw' });
  try {
    const tool = ENGINE_MCP_TOOLS_BY_NAME.get('file_ticket');
    assert.deepEqual([...tool.restricted_fields.confidential_contract],
      ['folder', 'folder_ref', 'artifact_ref', 'copied_file']);
    const result = await call('file_ticket', { purpose: 'upload' }, context);
    // The handler answers in full; the server is what blanks the ⓒ fields, and the fields it will
    // blank are declared by the tool. Both halves are asserted so neither can drift alone.
    assert.equal(typeof result.structured.folder_ref, 'string');
    const { redactFields } = await import('./access_table.mjs');
    const shown = redactFields(result.structured, [...tool.restricted_fields.confidential_contract]);
    assert.equal(shown.value.folder_ref, null);
    assert.equal(shown.value.folder, null);
    assert.equal(shown.value.ticket_id, result.structured.ticket_id);
    assert.ok(shown.redacted.includes('folder_ref'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a team role may not sweep, and may not use somebody else’s ticket', async () => {
  const { root, staged, context } = await stage({ role: 'owner' });
  try {
    const { ticket } = await stagedTicket(context, staged);
    const hw = await createEngineContext({
      profile_path: staged.profile_path,
      repo_root: root,
      engine_root: ENGINE_ROOT,
      engine_version: ENGINE_VERSION,
      write_enabled: true,
      view: resolveAccessView({
        table: ACCESS_TABLE,
        principal: { principal_ref: 'test_hw', role: 'hw' },
        project_code: staged.project_code,
      }),
      shared: { tools: TOOL_DESCRIPTORS, access_table: ACCESS_TABLE, protocol_version: 'test' },
    });
    const refusal = await refusalOf(() => call('file_register', {
      ticket_id: ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, hw));
    assert.equal(refusal.code, 'SE_MCP_PERMISSION_DENIED');
    // And the listing shows a team role only their own tickets.
    const listed = await call('file_tickets_list', {}, hw);
    assert.equal(listed.structured.scope, 'mine');
    assert.equal(listed.structured.counts.total, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- housekeeping

test('the sweep reports first, then moves finished tickets to the trash and deletes nothing', async () => {
  const { root, staged, context } = await stage({ now: '2026-08-19T05:00:00.000Z' });
  try {
    const { ticket } = await stagedTicket(context, staged);
    await call('file_register', {
      ticket_id: ticket.ticket_id,
      artifact_type_id: SYNTHETIC_REGISTER_TOKEN,
      stage_code: SYNTHETIC_STAGE,
    }, context);
    const open = (await call('file_ticket', { purpose: 'upload' }, context)).structured;

    // Nothing is due yet: the grace period has not passed.
    const early = await call('file_tickets_gc', {}, context);
    assert.equal(early.structured.dry_run, true);
    assert.equal(early.structured.counts.due, 0);
    assert.equal(early.structured.counts.still_open, 1);

    context.now = () => '2026-10-19T05:00:00.000Z';
    const report = await call('file_tickets_gc', {}, context);
    assert.equal(report.structured.dry_run, true);
    // The used one and the one that has since expired, and nothing has moved yet.
    assert.equal(report.structured.counts.due, 2);
    assert.equal(report.structured.counts.moved, 0);
    assert.ok(report.structured.items.every((item) => item.moved === false));

    const swept = await call('file_tickets_gc', { dry_run: false }, context);
    assert.equal(swept.structured.counts.moved, 2);
    for (const item of swept.structured.items) {
      assert.equal(item.moved, true);
      // Moved, with its name intact, into the trash the profile names — never removed.
      assert.ok(item.trash_ref.startsWith(DOOR_RELATIVE.trash.join('/')));
      assert.equal(existsSync(join(staged.project_root, ...item.trash_ref.split('/'))), true);
      assert.equal(existsSync(join(staged.project_root, ...item.folder_ref.split('/'))), false);
    }
    assert.ok(swept.structured.items.some((item) => item.ticket_id === open.ticket_id));

    const rows = readLines(join(staged.receipts_dir, FILE_TICKETS_FILE));
    assert.equal(rows.filter((row) => row.status === 'cleaned').length, 2);
    const receipts = readLines(join(staged.receipts_dir, FILE_OPERATIONS_RECEIPT_FILE));
    assert.equal(receipts.filter((row) => row.operation === 'cleanup_to_trash').length, 1);

    // A second sweep finds them gone and says so rather than failing.
    const again = await call('file_tickets_gc', { dry_run: false }, context);
    assert.equal(again.structured.counts.moved, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the write switch gates every file tool that writes, and only those', async () => {
  const { root, context } = await stage({ write: false });
  try {
    for (const name of ['file_ticket', 'file_put', 'file_register', 'file_tickets_gc']) {
      const refusal = await refusalOf(() => call(name, {
        purpose: 'upload', ticket_id: 'up_20260819t050000z_abcdef', name: 'a.pdf',
        content_base64: base64('x'), sha256: sha256('x'),
        artifact_type_id: SYNTHETIC_REGISTER_TOKEN, stage_code: SYNTHETIC_STAGE,
      }, context));
      assert.equal(refusal.code, 'WRITE_TOOLS_DISABLED', name);
    }
    // Reading is not writing: the read tools answer with the switch off.
    const listed = await call('file_tickets_list', {}, context);
    assert.equal(listed.structured.counts.total, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
