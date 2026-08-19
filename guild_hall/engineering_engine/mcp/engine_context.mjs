// Everything the MCP tools are allowed to touch, for one project, in one object.
//
// The tools carry no logic (design 9.1A: "MCP 도구는 로직을 갖지 않고 기존 순수 함수·runner를 그대로
// 부른다"). So they also carry no file access of their own: a handler asks this context for the
// compiled rules, the observations, the assessments, and gets back exactly what the profile named.
// A path a caller invented never reaches `readFile` — the only paths this module resolves come out
// of the validated profile, and the two tools that do accept a caller path (`observe_confirm`'s
// sheet, `observe_scan`'s output name) run it through the same root check first.
//
// One context serves one project. A server that serves several holds several of these, keyed by
// project code (부록 B, 최소 변경 6번), and nothing here is shared between them.
//
// Four things this layer owns that the tools must not re-implement:
//
//   * the cache, whose keys are built by `kernel/mcp_contract.mjs` out of the project code and a
//     generation counter, so an entry from another project or from before a write structurally
//     cannot be served (계약 lane_1d §6);
//   * the path budget, applied to every write target on every plane rather than only inside
//     `_workmeta` (부록 B, 최소 변경 3번);
//   * the per-project write lock, which refuses rather than queues (계약 lane_1d §4.3);
//   * the access view, which says who is calling and which class of material they may be shown.
//
// This is the layer allowed to read the disk and the clock. The pure functions it calls are not.

import { appendFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

import { compileStageRules } from '../stage_rules/stage_rule_compiler.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../stage_rules/artifact_vocabulary.mjs';
import { engineStageCodeForGate } from '../observation/artifact_observation_candidates.mjs';
import { assertCacheEntryServesRequest, cacheKey } from '../kernel/mcp_contract.mjs';
import { validateWorkmetaWriteTarget } from '../../validate/workmeta_payload_policy.mjs';
import { classifyPath } from '../../validate/path_length_policy.mjs';
import {
  DEFAULT_ACCESS_TABLE_V0, resolveAccessView, viewSeesCapability, viewSeesClass,
} from './access_table.mjs';
import {
  assertPathUnderRoots, hasControlCharacter, isPathUnder, repoPointer, validateProjectProfile,
} from './project_profile.mjs';

export const ENGINE_MCP_ERROR_CODES = Object.freeze({
  ARGUMENTS_INVALID: 'ENGINE_MCP_ARGUMENTS_INVALID',
  INPUT_UNREADABLE: 'ENGINE_MCP_INPUT_UNREADABLE',
  INPUT_NOT_JSON: 'ENGINE_MCP_INPUT_NOT_JSON',
  STAGE_UNKNOWN: 'ENGINE_MCP_STAGE_UNKNOWN',
  RUN_UNKNOWN: 'ENGINE_MCP_RUN_UNKNOWN',
  CARD_NOT_FOUND: 'ENGINE_MCP_CARD_NOT_FOUND',
  OUTPUT_EXISTS: 'ENGINE_MCP_OUTPUT_EXISTS',
  WORKMETA_POLICY_REFUSED: 'ENGINE_MCP_WORKMETA_POLICY_REFUSED',
  PATH_BUDGET_EXCEEDED: 'ENGINE_MCP_PATH_BUDGET_EXCEEDED',
  PROFILE_FIELD_MISSING: 'ENGINE_MCP_PROFILE_FIELD_MISSING',
  WRITE_TOOLS_DISABLED: 'WRITE_TOOLS_DISABLED',
  RUNNER_REFUSED: 'ENGINE_MCP_RUNNER_REFUSED',
  LANE_BUSY: 'SE_MCP_LANE_BUSY',
});

export class EngineMcpError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'EngineMcpError';
    this.code = code;
    this.detail = detail;
  }
}

export const mcpFail = (code, message, detail = {}) => {
  throw new EngineMcpError(code, message, detail);
};

const SAFE_DIR_NAME = /^[a-z0-9][a-z0-9_]{2,59}$/u;
const STAGE_CODE = /^[0-9]{3}_[A-Za-z0-9_]{1,32}$/u;
// A run id names a directory that other directories are created under, so it is the segment the
// path budget is most sensitive to: a *new* one is capped at twenty-four characters (부록 B,
// 최소 변경 3번). Reading keeps the older, looser shape — runs that already exist on disk were
// named before the cap, and refusing to read them would lose the record rather than protect it.
const RUN_ID_READ = SAFE_DIR_NAME;
const RUN_ID_NEW = /^[a-z0-9][a-z0-9_]{2,23}$/u;
const CONFIRMED_PREFIX = 'confirmed_observations_';

export const REGISTERED_CANDIDATES_FILE = 'registered_candidates.jsonl';
export const TOOL_CALL_RECEIPT_FILE = 'mcp_tool_calls.jsonl';
export const RUNS_INDEX_FILE = 'runs_index.jsonl';

/** Where a per-project write lock lives, and what it is. */
export const WRITE_LOCK_DIR = 'locks';
export const WRITE_LOCK_SCHEMA_VERSION = 'soulforge.engine_mcp_write_lock.v0';
export const STALE_LOCK_MINUTES = 30;

/** The revision the cache keys bind to, so a code change cannot serve entries built before it. */
export const MCP_MODULE_BINDING_REVISION = 'soulforge.engine_mcp_door.v0';

/**
 * A short string a caller supplied.
 *
 * The profile module has the same check, but it fails with a *profile* code, and a caller who
 * mistyped an argument should not be told their project profile is invalid. Same rule, right code.
 */
export function assertArgumentString(value, field, max = 64) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'this argument must be a short non-empty string', { field, max });
  }
  if (hasControlCharacter(value)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'this argument carries a control character', { field });
  }
  return value;
}

/** A safe folder or run name: lowercase, underscore, no separator, no dot, no climb. */
export function assertSafeName(value, field, pattern = SAFE_DIR_NAME) {
  assertArgumentString(value, field, 64);
  if (!pattern.test(value)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'a name must be lowercase letters, digits and underscores', { field });
  }
  return value;
}

export function assertStageCodeShape(value, field = 'stage_code') {
  assertArgumentString(value, field, 64);
  if (!STAGE_CODE.test(value)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'a stage code looks like 120_CDR', { field });
  }
  return value;
}

/** An existing run, named before or after the cap. */
export const assertRunId = (value, field = 'run_id') => assertSafeName(value, field, RUN_ID_READ);

/** A run about to be created: short, because directories are made under it. */
export const assertNewRunId = (value, field = 'revision_label') =>
  assertSafeName(value, field, RUN_ID_NEW);

/** `2026-08-18T13:00:00.000Z` becomes `20260818T130000Z` — a name a filesystem accepts. */
export const compactInstant = (instant) => String(instant)
  .replace(/[-:]/gu, '')
  .replace(/\.[0-9]+Z$/u, 'Z');

export function assertInstant(value, field = 'known_at') {
  assertArgumentString(value, field, 64);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/u.test(value)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'an instant must be a UTC ISO-8601 timestamp', { field });
  }
  return value;
}

/** The view a context falls back to when nobody said who is calling: the public class only. */
export const anonymousView = (projectCode = null) => resolveAccessView({
  table: DEFAULT_ACCESS_TABLE_V0, principal: null, project_code: projectCode,
});

/**
 * Builds the context one server process uses for one project.
 *
 * @param options `{ profile_path | profile, repo_root, engine_root, write_enabled,
 *   engine_version, view?, shared? }`
 *
 * `view` is the caller's access standing (9.1F). It defaults to the anonymous view — the public
 * rule class and nothing else — because a context built without one has, by construction, nobody
 * to attribute an answer to. The server always supplies the real view.
 */
export async function createEngineContext(options) {
  const { profile_path: profilePath, repo_root: repoRoot, engine_root: engineRoot } = options;
  const profile = options.profile ?? validateProjectProfile(
    await readJsonAt(profilePath, 'project_profile'), { repo_root: repoRoot });

  const cache = new Map();
  let generation = 0;

  const context = {
    profile,
    repo_root: repoRoot,
    engine_root: engineRoot,
    engine_version: options.engine_version,
    write_enabled: options.write_enabled === true,
    view: options.view ?? anonymousView(profile.project_code),
    shared: options.shared ?? null,
    vocabulary: ARTIFACT_VOCABULARY_V0,
    pointer: (absolute) => repoPointer(repoRoot, absolute),
    now: () => new Date().toISOString(),
  };

  /**
   * Cache identity comes from the contract module rather than from a string this file invents:
   * the project code, the generation, and the binding revisions are inside the key, so an entry
   * belonging to another project or to a state before the last write cannot be looked up at all.
   */
  const cacheRequest = (operation, query) => ({
    project_binding_ref: profile.project_code,
    accepted_context_generation: generation,
    engine_binding_revision: String(options.engine_version ?? '0.0.0'),
    module_binding_revision: MCP_MODULE_BINDING_REVISION,
    operation,
    query,
  });

  const cached = async (operation, produce, query = {}) => {
    const request = cacheRequest(operation, query);
    const key = cacheKey(request);
    const entry = cache.get(key);
    if (entry !== undefined) {
      // The key already contains both, so this can only fail if the key material and the stored
      // entry ever drift apart. It is asserted rather than assumed because that is the failure
      // this whole scheme exists to make impossible.
      assertCacheEntryServesRequest(entry, request);
      return entry.value;
    }
    const value = await produce();
    cache.set(key, { ...request, value });
    return value;
  };

  /**
   * Everything derived from project material is dropped after a write.
   *
   * The bug this closes is older than multi-project (부록 B): confirming observations and then
   * judging in the same session used to judge against the observations loaded before the
   * confirmation. Bumping the generation makes every stale entry unreachable, and clearing the
   * map means the memory goes with it.
   */
  context.invalidateAfterWrite = (reason = 'write') => {
    generation += 1;
    cache.clear();
    context.cache_generation = generation;
    context.last_invalidation = reason;
    return generation;
  };
  context.cache_generation = generation;
  context.last_invalidation = null;
  context.cacheStats = () => ({ generation, entries: cache.size });

  context.readJson = (absolute, label) => readJsonAt(absolute, label);
  context.readJsonIfPresent = (absolute, label) => readJsonIfPresent(absolute, label);

  context.loadVariant = () => cached('load_variant', () =>
    readJsonAt(profile.compiled_variant, 'compiled_variant'));

  context.loadOverlayFiles = () => cached('load_overlay_files', async () => {
    const rows = [];
    for (const path of profile.overlays) {
      rows.push({ file_name: basename(path), overlay: await readJsonAt(path, 'overlay') });
    }
    return rows;
  });

  // Two overlays (a prime-contract one and a project one) are handed to the compiler as one, with
  // their op lists concatenated in profile order. That is the shape 05장 §5.1 states.
  context.loadOverlay = () => cached('load_overlay', async () => {
    const files = await context.loadOverlayFiles();
    if (files.length === 0) return null;
    const ops = files.flatMap((row) => row.overlay.ops ?? []);
    return {
      schema_version: files[0].overlay.schema_version,
      extends: files[0].overlay.extends,
      ops,
    };
  });

  context.loadBinding = () => cached('load_binding', async () => (profile.project_binding === null
    ? profile.project_binding_inline
    : readJsonAt(profile.project_binding, 'project_binding')));

  context.loadBasePacket = () => cached('load_base_packet', () =>
    readJsonAt(profile.base_packet, 'base_packet'));

  context.loadBaseLaunch = () => cached('load_base_launch', async () => {
    if (profile.base_launch === null) {
      mcpFail(ENGINE_MCP_ERROR_CODES.PROFILE_FIELD_MISSING,
        'this profile states no base launch, so no launch can be written', { field: 'base_launch' });
    }
    return readJsonAt(profile.base_launch, 'base_launch');
  });

  /** Every engine stage the compiled variant carries a gate for, in gate order. */
  context.stageCodes = () => cached('stage_codes', async () => {
    const variant = await context.loadVariant();
    const codes = [];
    for (const gate of variant.gates ?? []) {
      const stageCode = engineStageCodeForGate(gate.code);
      if (stageCode !== null) codes.push(stageCode);
    }
    return codes;
  });

  context.assertKnownStage = async (stageCode) => {
    assertStageCodeShape(stageCode);
    const known = await context.stageCodes();
    if (!known.includes(stageCode)) {
      mcpFail(ENGINE_MCP_ERROR_CODES.STAGE_UNKNOWN,
        'this project profile carries no such stage', { stage_code: stageCode, known });
    }
    return stageCode;
  };

  // The query material is written as one string rather than an array: the canonical serialiser the
  // cache key is built from refuses an array that declares no order rule, and "these stages, in
  // this order" is exactly one value here.
  context.compile = (stageCodes) => cached('compile', async () =>
    compileStageRules({
      compiled_variant: await context.loadVariant(),
      overlay: await context.loadOverlay(),
      project_binding: await context.loadBinding(),
      target_stage_codes: [...stageCodes],
      overlay_conditions: [...profile.overlay_conditions],
    }), { stage_codes: [...stageCodes].sort().join(',') });

  /**
   * The observations the project has, newest confirmation winning.
   *
   * An automatic walk and an Owner confirmation can disagree about the same token; D37 says the
   * Owner's answer is the one that counts, and the receipt says which files spoke.
   */
  context.loadObservations = () => cached('load_observations', async () => {
    const auto = await readJsonIfPresent(
      join(profile.observations_dir, 'artifact_observations_auto.json'), 'artifact_observations_auto');
    const confirmedName = await latestConfirmedName(profile.observations_dir);
    const confirmed = confirmedName === null ? null
      : await readJsonIfPresent(join(profile.observations_dir, confirmedName), 'confirmed_observations');

    const byToken = new Map();
    const take = (file, source) => {
      for (const row of file?.artifact_observations ?? []) {
        if (typeof row?.artifact_type_id !== 'string') continue;
        byToken.set(row.artifact_type_id, { row, source });
      }
    };
    take(auto, 'auto');
    take(confirmed, 'confirmed');

    const rows = [...byToken.values()].map((entry) => entry.row);
    return {
      rows,
      work_order: rows.map((row) => ({
        artifact_type_id: row.artifact_type_id, presence_state: row.presence_state,
      })),
      sources: {
        auto_file: auto === null ? null : 'artifact_observations_auto.json',
        confirmed_file: confirmedName,
        auto_rows: auto?.artifact_observations?.length ?? 0,
        confirmed_rows: confirmed?.artifact_observations?.length ?? 0,
        merged_rows: rows.length,
      },
    };
  });

  /** Run folders under the profile's runs root that actually carry an assessment. */
  context.listRuns = async () => {
    let entries;
    try {
      entries = await readdir(profile.runs_root, { withFileTypes: true });
    } catch {
      return [];
    }
    const runs = [];
    for (const entry of entries.sort((left, right) => (left.name < right.name ? -1 : 1))) {
      if (!entry.isDirectory() || entry.name === WRITE_LOCK_DIR) continue;
      let receipts;
      try {
        receipts = await readdir(join(profile.runs_root, entry.name, 'receipts'));
      } catch {
        continue;
      }
      const stages = receipts
        .filter((name) => name.startsWith('assessment_stdout_') && name.endsWith('.json'))
        .map((name) => name.slice('assessment_stdout_'.length, -'.json'.length))
        .sort();
      if (stages.length > 0) runs.push({ run_id: entry.name, stage_codes: stages });
    }
    return runs;
  };

  context.latestRunFor = async (stageCode) => {
    const runs = await context.listRuns();
    const matching = runs.filter((run) => run.stage_codes.includes(stageCode));
    return matching.length === 0 ? null : matching[matching.length - 1].run_id;
  };

  context.lastJudgeRunAt = () => lastJudgeRunAtFor(profile);

  context.readAssessment = async (runId, stageCode) => {
    assertRunId(runId);
    assertStageCodeShape(stageCode);
    const path = join(profile.runs_root, runId, 'receipts', `assessment_stdout_${stageCode}.json`);
    if (!isPathUnder(path, profile.runs_root)) {
      mcpFail(ENGINE_MCP_ERROR_CODES.RUN_UNKNOWN, 'a run lies outside the runs root', {});
    }
    const found = await readJsonIfPresent(path, 'assessment_stdout');
    if (found === null) {
      mcpFail(ENGINE_MCP_ERROR_CODES.RUN_UNKNOWN,
        'this run carries no assessment for that stage', { run_id: runId, stage_code: stageCode });
    }
    return found;
  };

  /** A caller-supplied path is only ever accepted relative to a directory the profile named. */
  context.assertUnderObservations = (candidate, field) => {
    const absolute = assertPathUnderRoots(candidate, field, profile.roots, ['project']);
    if (!isPathUnder(absolute, profile.observations_dir)) {
      mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
        'this path lies outside the observations directory the profile names', { field });
    }
    return absolute;
  };

  context.requireWrite = (toolName) => {
    if (context.write_enabled !== true) {
      mcpFail(ENGINE_MCP_ERROR_CODES.WRITE_TOOLS_DISABLED,
        'write tools are off; set SOULFORGE_ENGINE_MCP_WRITE=on to enable them',
        { tool: toolName });
    }
  };

  /** What this caller may be shown, asked as a question rather than read as a field. */
  context.canSeeClass = (dataClass) => viewSeesClass(context.view, dataClass);
  context.canSeeCapability = (capability) => context.view.all_capabilities === true
    || viewSeesCapability(context.view, capability);

  /** Same policy the repository's own guard applies, applied before the write rather than after. */
  context.assertWritableTarget = (absolute, kind = 'file', field = 'write_target') => {
    const report = validateWorkmetaWriteTarget({
      repoRoot, targetPath: absolute, targetKind: kind,
    });
    if (!report.ok) {
      mcpFail(ENGINE_MCP_ERROR_CODES.WORKMETA_POLICY_REFUSED,
        'the metadata plane refuses this write target',
        { field, violations: report.violations.map((row) => row.id) });
    }
    return absolute;
  };

  /**
   * The path budget, on every plane.
   *
   * `validateWorkmetaWriteTarget` returns `applies: false` for a target outside `_workmeta`, which
   * is right for the payload rules and wrong for the budget: a run folder written into the project
   * plane fits on the same Windows filesystem as everything else (Owner 2026-08-18, long paths
   * stay off). So the budget is checked here for every target, and the error names the field
   * rather than printing the path.
   */
  context.assertPathBudget = (absolute, kind = 'file', field = 'write_target') => {
    const pointer = repoPointer(repoRoot, absolute);
    if (pointer === null) {
      mcpFail(ENGINE_MCP_ERROR_CODES.PATH_BUDGET_EXCEEDED,
        'a write target lies outside the repository root', { field });
    }
    const report = classifyPath(pointer, { kind });
    if (!report.ok) {
      mcpFail(ENGINE_MCP_ERROR_CODES.PATH_BUDGET_EXCEEDED,
        'this write target does not fit the path budget',
        { field, kind, violations: report.violations.map((row) => row.id) });
    }
    return absolute;
  };

  const assertWritable = (absolute, kind, field) => {
    context.assertPathBudget(absolute, kind, field);
    context.assertWritableTarget(absolute, kind, field);
    return absolute;
  };

  context.writeCreateOnly = async (absolute, text, { field = 'write_target' } = {}) => {
    assertWritable(dirname(absolute), 'directory', `${field}.directory`);
    assertWritable(absolute, 'file', field);
    await mkdir(dirname(absolute), { recursive: true });
    try {
      await writeFile(absolute, text, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        mcpFail(ENGINE_MCP_ERROR_CODES.OUTPUT_EXISTS,
          'an output already exists and is not overwritten', { field });
      }
      throw error;
    }
    context.invalidateAfterWrite(field);
    return absolute;
  };

  /**
   * @param options `{ field, invalidate }` — the receipt writer passes `invalidate: false`,
   * because a line about a call is not a change to the project material the caches hold.
   */
  context.appendLine = async (absolute, line,
    { field = 'append_target', invalidate = true } = {}) => {
    assertWritable(dirname(absolute), 'directory', `${field}.directory`);
    assertWritable(absolute, 'file', field);
    await mkdir(dirname(absolute), { recursive: true });
    await appendFile(absolute, `${line}\n`, 'utf8');
    if (invalidate) context.invalidateAfterWrite(field);
    return absolute;
  };

  // ------------------------------------------------------------ the write lock

  const lockPathFor = (toolName) =>
    join(profile.runs_root, WRITE_LOCK_DIR, `${assertSafeName(toolName, 'tool')}.lock.json`);

  /**
   * One holder at a time per project and tool; a second attempt is refused, not queued
   * (계약 `contracts/lane_1d_mcp_concurrency_v0.md` §4.3).
   *
   * A lock older than `STALE_LOCK_MINUTES` is reported as stale in the refusal and still refuses.
   * Deleting somebody else's lock because it looks old is how two runs end up writing the same
   * folder; the person told about it can remove the file, and the engine does not.
   */
  context.acquireWriteLock = async (toolName) => {
    const path = lockPathFor(toolName);
    const lockId = randomUUID();
    const acquiredAt = context.now();
    const body = {
      schema_version: WRITE_LOCK_SCHEMA_VERSION,
      lock_id: lockId,
      tool: toolName,
      project_code: profile.project_code,
      principal_ref: context.view?.principal_ref ?? null,
      acquired_at: acquiredAt,
      pid: typeof process === 'undefined' ? null : process.pid,
    };
    assertWritable(dirname(path), 'directory', 'write_lock.directory');
    assertWritable(path, 'file', 'write_lock');
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const held = await readJsonIfPresent(path, 'write_lock').catch(() => null);
      const heldSince = typeof held?.acquired_at === 'string' ? held.acquired_at : null;
      const ageMinutes = heldSince === null ? null
        : Math.floor((Date.now() - Date.parse(heldSince)) / 60000);
      mcpFail(ENGINE_MCP_ERROR_CODES.LANE_BUSY,
        'this project lane is busy; the call is refused rather than queued', {
          tool: toolName,
          project_code: profile.project_code,
          held_since: heldSince,
          age_minutes: ageMinutes,
          stale: ageMinutes !== null && ageMinutes >= STALE_LOCK_MINUTES,
          stale_after_minutes: STALE_LOCK_MINUTES,
          note: 'a stale lock is reported, never removed by the engine',
        });
    }
    return { path, lock_id: lockId, tool: toolName, acquired_at: acquiredAt };
  };

  /** Releases a lock this context holds, and only that one. */
  context.releaseWriteLock = async (handle) => {
    if (handle === null || handle === undefined) return false;
    const held = await readJsonIfPresent(handle.path, 'write_lock').catch(() => null);
    if (held?.lock_id !== handle.lock_id) return false;
    try {
      await unlink(handle.path);
    } catch {
      return false;
    }
    return true;
  };

  context.withWriteLock = async (toolName, run) => {
    const handle = await context.acquireWriteLock(toolName);
    try {
      return await run();
    } finally {
      await context.releaseWriteLock(handle);
    }
  };

  return context;
}

// ---------------------------------------------------------------- file helpers

export async function readJsonAt(absolute, label) {
  let text;
  try {
    text = await readFile(absolute, 'utf8');
  } catch (error) {
    mcpFail(ENGINE_MCP_ERROR_CODES.INPUT_UNREADABLE, 'an input file could not be read',
      { label, code: error?.code ?? null });
  }
  try {
    return JSON.parse(text);
  } catch {
    mcpFail(ENGINE_MCP_ERROR_CODES.INPUT_NOT_JSON, 'an input file is not JSON', { label });
  }
  return null;
}

export async function readJsonIfPresent(absolute, label) {
  try {
    return JSON.parse(await readFile(absolute, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      mcpFail(ENGINE_MCP_ERROR_CODES.INPUT_NOT_JSON, 'an input file is not JSON', { label });
    }
    mcpFail(ENGINE_MCP_ERROR_CODES.INPUT_UNREADABLE, 'an input file could not be read',
      { label, code: error?.code ?? null });
  }
  return null;
}

export async function readTextIfPresent(absolute) {
  try {
    return await readFile(absolute, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * When a project was last judged, from its run index if it has one.
 *
 * The index is the file 부록 B lists as change 8 and it does not exist yet; walking every run
 * folder to answer a listing question is exactly the cost that change avoids, so the honest answer
 * while the index is absent is `null` rather than an expensive guess.
 */
export async function lastJudgeRunAtFor(profile) {
  const text = await readTextIfPresent(join(profile.runs_root, RUNS_INDEX_FILE));
  if (text === null) return null;
  const rows = text.split('\n').filter((line) => line.trim().length > 0);
  if (rows.length === 0) return null;
  try {
    const last = JSON.parse(rows[rows.length - 1]);
    return typeof last?.logged_at === 'string' ? last.logged_at : null;
  } catch {
    return null;
  }
}

export async function latestConfirmedName(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return null;
  }
  const confirmed = names
    .filter((name) => name.startsWith(CONFIRMED_PREFIX) && name.endsWith('.json'))
    .sort();
  return confirmed.length === 0 ? null : confirmed[confirmed.length - 1];
}
