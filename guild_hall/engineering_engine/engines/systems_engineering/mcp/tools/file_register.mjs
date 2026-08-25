// 등록 = 저장 (Owner 결정 2026-08-19, 09장 §9.1D) — the one formal way a file enters a project.
//
// A person puts files in the folder their ticket named and says what they are: this stage, this
// artifact type. The door then does the part a person used to do by hand and get wrong: it works
// out which task folder the rules put that artifact in, moves the bytes into that folder's
// `03_Out` without ever replacing anything, and writes the observation. Nobody opens the project
// tree and nobody decides where a file goes by looking at it.
//
// Four judgements are worth reading before changing this file.
//
//   1. **The rules choose the folder, and both halves have to agree.** The compiled variant has to
//      declare exactly one task at this stage for this artifact type, and the folder carrying that
//      task's number has to carry that task's name (`resolveTaskFolder`). A tree generated from an
//      older rule revision can reuse a number for a different task, and a move that trusted the
//      number alone would file a presentation as a maturity assessment. Disagreement is a refusal.
//   2. **A missing task folder is refused, never created.** The folder tree is the folder-tree
//      skill's output; a door that invents a folder invents a task.
//   3. **The automatic-confirmation rule is the walk's rule, not a second one.** The moved file is
//      handed to `buildArtifactObservationCandidates` as a one-row inventory with the same
//      `auto_confirm_03_out` switch, so "task folder resolves to one artifact + the file's own name
//      says what it is" is decided by the module that owns it. A row that fails it waits in
//      `registered_candidates.jsonl` — the door is not where D37 stops holding.
//   4. **Never overwrite.** A name already in `03_Out` is refused unless the caller says
//      `allow_new_version`, and then the file lands as `name (v2).ext`. Silently replacing a
//      submitted document is the one failure this whole path exists to prevent.
//   5. **Across roots it copies, and then consumes** (Owner 결정 2026-08-19, §12.C). When the door's
//      folders sit on the NAS share and the task folder is in the project tree, there is no move to
//      make: the bytes are copied, the destination is hashed and checked against the source, and
//      only then is the source **moved into the share's own trash folder** — never deleted, so a
//      copy that turns out to be wrong is still recoverable, and never left in place, so the next
//      person to look in the ticket folder does not find a file that has already been filed. Within
//      one root it stays the old move. The receipt says which of the two happened
//      (`transfer_kind: move | copy_verify`) and carries the hash from both ends.

import { join } from 'node:path';

import {
  MATURITY, buildArtifactObservationCandidates, overlayAliasCues, resolveGateFolder,
  resolveTaskFolder,
} from '../../observation/artifact_observation_candidates.mjs';
import { applyConfirmationSheet } from '../../observation/observation_confirmation_sheet.mjs';
import {
  buildArtifactObservationsFromConfirmed,
} from '../../observation/artifact_observations_from_confirmed.mjs';
import { isKnownArtifactType } from '../../rules/artifact_vocabulary.mjs';
import {
  ENGINE_MCP_ERROR_CODES, REGISTERED_CANDIDATES_FILE, assertArgumentString, mcpFail,
} from '../engine_context.mjs';
import {
  MAX, TICKET_MARKER_FILE, assertPrincipalRef, assertTicketId, assertTicketUsable,
  assertUploadFileName, nextFreeName, ticketFolderRoot,
} from '../tickets.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'file_register';
export const title_ko = '등록 (문 앞 칸 → 정식 자리)';
export const description_ko = '표가 가리키는 칸의 파일을 그 단계·산출물의 업무폴더 03_Out으로 옮기고 관측을 만든다. 덮어쓰지 않으며, 폴더가 없으면 만들지 않고 거절한다.';
export const write = true;
export const data_class = 'team_judgment';
export const idempotent = false;
export const confidential_fields = Object.freeze([
  'target_folder', 'registered[].file_ref', 'registered[].target',
  'registered[].consumed_ref',
]);

const MATURITY_VALUES = Object.freeze(Object.values(MATURITY));

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    ticket_id: { type: 'string', description: 'file_ticket(upload)이 낸 표' },
    artifact_type_id: { type: 'string', description: '산출물 표준어 토큰 (예: bom)' },
    stage_code: { type: 'string', description: '엔진 단계 코드 (예: 120_CDR)' },
    maturity: { type: 'string', enum: [...MATURITY_VALUES], description: '성숙도(선택). 생략하면 파일 이름에서 읽는다' },
    allow_new_version: {
      type: 'boolean',
      description: '같은 이름이 이미 있을 때 "이름 (v2).확장자"로 넣을지. 기본은 거절',
    },
    note: { type: 'string', description: '왜 이 산출물로 보는지 한 줄(선택)' },
  },
  required: ['ticket_id', 'artifact_type_id', 'stage_code'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  ctx.requireWrite(name);
  const principalRef = assertPrincipalRef(ctx.requirePrincipal(name));
  const door = ctx.fileDoor();
  const ticketId = assertTicketId(args.ticket_id);
  const knownAt = ctx.now();

  const ledger = await ctx.readTicketLedger();
  const ticket = assertTicketUsable(ledger.tickets.get(ticketId), {
    now: knownAt,
    purpose: 'upload',
    principal_ref: principalRef,
    may_act_for_others: ctx.mayActForOthers(),
  });

  const stageCode = await ctx.assertKnownStage(args.stage_code);
  const token = assertArgumentString(args.artifact_type_id, 'artifact_type_id', 64);
  if (!isKnownArtifactType(token)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'this token is not in the artifact vocabulary', { field: 'artifact_type_id' });
  }
  const maturity = args.maturity === undefined ? null
    : assertArgumentString(args.maturity, 'maturity', 64);
  if (maturity !== null && !MATURITY_VALUES.includes(maturity)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'unknown maturity',
      { field: 'maturity', allowed: [...MATURITY_VALUES] });
  }
  const note = args.note === undefined ? null : assertArgumentString(args.note, 'note', MAX.note);
  const allowNewVersion = args.allow_new_version === true;

  // ---- where the rules say this belongs

  const variant = await ctx.loadVariant();
  // Loaded before the folder is resolved, not only for the alias cues further down: an overlay
  // that carries `task_id` + `folder_name` on an `add` op is the only thing that can say where a
  // rule the standard table never had lives on disk.
  const overlayFiles = await ctx.loadOverlayFiles();
  const overlays = overlayFiles.map((row) => row.overlay);
  const gate = resolveGateFolder({
    compiled_variant: variant,
    stage_code: stageCode,
    folder_names: await ctx.listDirectoriesIn(ctx.profile.project_root),
  });
  if (!gate.ok) {
    mcpFail(ENGINE_MCP_ERROR_CODES.TASK_FOLDER_UNRESOLVED,
      'this stage has no folder in this project', { field: 'stage_code', ...gate.detail, reason: gate.reason });
  }
  const gateDir = join(ctx.profile.project_root, gate.gate_folder);
  const task = resolveTaskFolder({
    compiled_variant: variant,
    stage_code: stageCode,
    artifact_type_id: token,
    folder_names: await ctx.listDirectoriesIn(gateDir),
    overlays,
  });
  if (!task.ok) {
    // The reason travels, the folder name does not: a refusal is read by whoever called, and where
    // a project keeps its material is ⓒ.
    mcpFail(ENGINE_MCP_ERROR_CODES.TASK_FOLDER_UNRESOLVED,
      'the engine cannot name one task folder for this artifact at this stage, so nothing was moved',
      { field: 'artifact_type_id', reason: task.reason, ...task.detail });
  }
  const outDir = join(gateDir, task.task_folder, task.out_folder);

  // ---- what is in the ticket folder

  const ticketDir = ctx.resolveDoorRef(ticket.folder_ref, 'ticket_id', ticketFolderRoot(ticket));
  // The door's own marker is not somebody's upload — it is the ticket, written into the folder so
  // the person holding it can read their link. Filtered rather than refused: a caller should not
  // have to delete a file the engine put there before they can register their own.
  const staged = (await ctx.listFilesIn(ticketDir))
    .filter((row) => row.name !== TICKET_MARKER_FILE);
  if (staged.length === 0) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'there is nothing in this ticket folder to register', { field: 'ticket_id' });
  }
  if (staged.length > MAX.files_per_ticket) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'this ticket holds more files than one registration carries',
      { field: 'ticket_id', files: staged.length, max: MAX.files_per_ticket });
  }
  for (const row of staged) {
    assertUploadFileName(row.name, { allowed_extensions: door.policy.allowed_extensions, field: 'file' });
  }

  // ---- move, create-only, hash before and after

  // Every name is decided before any byte moves. A refusal halfway through would leave files in a
  // task folder that no observation and no receipt accounts for, which is worse than not starting.
  const takenNames = new Set((await ctx.listFilesIn(outDir)).map((row) => row.name));
  const planned = [];
  for (const row of staged) {
    if (!allowNewVersion && takenNames.has(row.name)) {
      mcpFail(ENGINE_MCP_ERROR_CODES.OUTPUT_EXISTS,
        'a file of that name is already in this task folder; state allow_new_version to add a version',
        { field: 'file', moved: 0 });
    }
    const chosen = allowNewVersion
      ? nextFreeName(row.name, (candidate) => takenNames.has(candidate))
      : { name: row.name, version: 1 };
    takenNames.add(chosen.name);
    planned.push({ row, chosen });
  }

  // One decision for the whole registration, not one per file: the ticket folder and the task
  // folder do not change root halfway through, and a registration that moved some files and copied
  // others would be two stories in one receipt.
  const sameRoot = ctx.sameRoot(ticketDir, outDir);
  const transferKind = sameRoot ? 'move' : 'copy_verify';

  const moved = [];
  for (const { row, chosen } of planned) {
    const target = join(outDir, chosen.name);
    // Both helpers hash before and after and refuse on EEXIST, so the difference below is only
    // what happens to the source afterwards — not how carefully the bytes are checked.
    const result = sameRoot
      ? await ctx.moveCreateOnly(row.path, target, { field: 'register_target' })
      : await ctx.copyCreateOnly(row.path, target, { field: 'register_target' });
    let consumedRef = null;
    if (!sameRoot) {
      // The source is spent, and the engine has no tool that deletes: it goes to the trash folder
      // on its own root, under the ticket id, where a person can find it by the name they know.
      const consumed = join(door.trash_dir, 'consumed', ticketId, chosen.name);
      await ctx.moveCreateOnly(row.path, consumed,
        { field: 'consumed_source', sha256: result.sha256 });
      consumedRef = ctx.doorRef(consumed);
    }
    moved.push({
      name: chosen.name,
      original_name: row.name,
      version: chosen.version,
      bytes: row.bytes,
      // Two hashes rather than one: the source as it sat in the ticket folder, and the destination
      // as it landed. They are equal or nothing was registered — saying both is what makes that
      // checkable from the receipt alone rather than on trust.
      source_sha256: result.source_sha256 ?? result.sha256,
      sha256: result.sha256,
      mtime_iso: row.mtime_iso,
      file_ref: ctx.projectRef(target),
      transfer_kind: transferKind,
      consumed_ref: consumedRef,
    });
  }

  // ---- the observation, by the same rule the walk uses

  const inventory = moved.map((row) => ({
    file_ref: row.file_ref,
    name: row.name,
    ext: row.name.slice(row.name.lastIndexOf('.') + 1).toLowerCase(),
    bytes: row.bytes,
    sha256: row.sha256,
    mtime_iso: row.mtime_iso,
    gate_hint: gate.gate_folder,
    task_folder_hint: task.task_folder,
  }));
  const overlayAliases = [];
  for (const overlay of overlays) overlayAliases.push(...overlayAliasCues(overlay));
  const proposed = buildArtifactObservationCandidates({
    inventory,
    compiled_variants: [variant],
    overlay_aliases: overlayAliases,
    vocabulary: ctx.vocabulary,
    known_at: knownAt,
    rules: { auto_confirm_03_out: true },
  });
  const confirmed = applyConfirmationSheet(proposed.candidates, []);
  const observations = buildArtifactObservationsFromConfirmed({
    confirmed: confirmed.confirmed,
    inventory,
    known_at: knownAt,
  });

  // The observation row itself names no file — evidence is carried as minted references — so the
  // registered row keeps the pointers beside it. That is what makes this ledger answer "which file
  // is the engine calling the BOM" without opening anything.
  const evidenceRefs = confirmed.confirmed.map((row) => row.file_ref);
  for (const observation of observations.artifact_observations) {
    const row = {
      schema_version: 'soulforge.engine_mcp_registered_observation.v0',
      registered_at: knownAt,
      source: 'mcp.file_register',
      ticket_id: ticketId,
      principal_ref: principalRef,
      role: ctx.view?.role ?? null,
      stage_code: stageCode,
      artifact_type_id: token,
      declared_maturity: maturity,
      note,
      evidence_file_refs: evidenceRefs,
      observation,
    };
    await ctx.appendRegisteredObservation(row);
  }
  // Everything the rule did not confirm waits in the same place `observe_register` parks a line:
  // one file, one candidate, `decision: null`, until a person says yes.
  const waiting = [];
  for (const candidate of proposed.candidates) {
    if (candidate.auto_confirmed) continue;
    waiting.push(candidate.file_ref);
    await ctx.appendLine(join(ctx.profile.observations_dir, REGISTERED_CANDIDATES_FILE),
      JSON.stringify({
        schema_version: 'soulforge.engine_mcp_registered_candidate.v0',
        registered_at: knownAt,
        source: 'mcp.file_register',
        stage_code: candidate.stage_code,
        artifact_type_id: candidate.artifact_type_id,
        file_ref: candidate.file_ref,
        maturity: maturity ?? candidate.maturity,
        note,
        ticket_id: ticketId,
        principal_ref: principalRef,
        decision: null,
      }), { field: 'registered_candidates' });
  }

  // ---- the ticket is spent, and the receipt says what moved

  await ctx.appendTicketRow({
    ...ticket,
    status: 'used',
    used_at: knownAt,
    logged_at: knownAt,
    used_by: principalRef,
    files: moved.map((row) => ({ name: row.name, sha256: row.sha256, bytes: row.bytes })),
    registered: { stage_code: stageCode, artifact_type_id: token, files: moved.length },
  });
  await ctx.appendFileReceipt({
    schema_version: 'soulforge.engine_mcp_file_operation.v0',
    logged_at: knownAt,
    tool: name,
    operation: transferKind === 'move' ? 'register_move' : 'register_copy_verify',
    transfer_kind: transferKind,
    source_root: ticketFolderRoot(ticket),
    principal_ref: principalRef,
    role: ctx.view?.role ?? null,
    ticket_id: ticketId,
    stage_code: stageCode,
    artifact_type_id: token,
    task_number: task.task_id,
    target_ref: ctx.projectRef(outDir),
    files: moved.map((row) => ({
      name: row.name,
      source_sha256: row.source_sha256,
      sha256: row.sha256,
      bytes: row.bytes,
      file_ref: row.file_ref,
      consumed_ref: row.consumed_ref,
    })),
    observations: observations.artifact_observations.length,
    awaiting_confirmation: waiting.length,
  });

  const observationState = observations.artifact_observations.length > 0
    ? (waiting.length === 0 ? 'observed' : 'partly_observed') : 'awaiting_confirmation';

  const structured = {
    schema_version: 'soulforge.engine_mcp_file_register.v0',
    ticket_id: ticketId,
    stage_code: stageCode,
    artifact_type_id: token,
    task_number: task.task_id,
    target_folder: ctx.pointer(outDir),
    transfer_kind: transferKind,
    source_root: ticketFolderRoot(ticket),
    observation_state: observationState,
    counts: {
      moved: moved.length,
      observations: observations.artifact_observations.length,
      awaiting_confirmation: waiting.length,
      evidence_files: evidenceRefs.length,
    },
    registered: moved.map((row) => ({
      name: row.name,
      version: row.version,
      bytes: row.bytes,
      source_sha256: row.source_sha256,
      sha256: row.sha256,
      file_ref: row.file_ref,
      transfer_kind: row.transfer_kind,
      consumed_ref: row.consumed_ref,
      target: ctx.pointer(join(outDir, row.name)),
    })),
    note: observationState === 'observed'
      ? '자동 확정 3조건(03_Out · 업무폴더 1:1 · 파일 이름 단서)을 통과해 관측이 되었다.'
      : '이름 단서가 없어 관측이 아니라 확인 대기로 남았다(D37). 사람이 확인해야 판단에 들어간다.',
    transfer_note: transferKind === 'move'
      ? '같은 뿌리라 옮겼다(원본은 남지 않는다).'
      : '다른 뿌리(공유폴더 → 과제면)라 복사하고 해시로 대조한 뒤 원본을 그 공유폴더의 휴지통으로 옮겼다. 지운 것은 없다.',
  };

  const markdown = lines(
    `# 등록 완료 — ${stageCode} / ${token}`,
    table(['옮긴 파일', '관측', '확인 대기', '업무폴더 번호', '옮김 방식'], [[
      moved.length, structured.counts.observations, waiting.length, task.task_id, transferKind,
    ]]),
    heading('파일'),
    table(['이름', '판', '크기', '해시(앞 12)'], moved.map((row) => [
      row.name, row.version, row.bytes, row.sha256.slice(0, 12),
    ])),
    structured.note,
    structured.transfer_note,
    FOOTER,
  );

  return { markdown, structured };
}
