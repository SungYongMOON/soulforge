// Everything the MCP tools are allowed to touch, in one object.
//
// The tools carry no logic (design 9.1A: "MCP 도구는 로직을 갖지 않고 기존 순수 함수·runner를 그대로
// 부른다"). So they also carry no file access of their own: a handler asks this context for the
// compiled rules, the observations, the assessments, and gets back exactly what the profile named.
// A path a caller invented never reaches `readFile` — the only paths this module resolves come out
// of the validated profile, and the two tools that do accept a caller path (`observe_confirm`'s
// sheet, `observe_scan`'s output name) run it through the same root check first.
//
// This is the layer allowed to read the disk and the clock. The pure functions it calls are not.

import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { compileStageRules } from '../stage_rules/stage_rule_compiler.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../stage_rules/artifact_vocabulary.mjs';
import { engineStageCodeForGate } from '../observation/artifact_observation_candidates.mjs';
import { validateWorkmetaWriteTarget } from '../../validate/workmeta_payload_policy.mjs';
import {
  assertPathUnderRoots, assertSafeString, isPathUnder, repoPointer, validateProjectProfile,
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
  PROFILE_FIELD_MISSING: 'ENGINE_MCP_PROFILE_FIELD_MISSING',
  WRITE_TOOLS_DISABLED: 'WRITE_TOOLS_DISABLED',
  RUNNER_REFUSED: 'ENGINE_MCP_RUNNER_REFUSED',
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
const RUN_ID = /^[a-z0-9][a-z0-9_]{2,59}$/u;
const CONFIRMED_PREFIX = 'confirmed_observations_';

export const REGISTERED_CANDIDATES_FILE = 'registered_candidates.jsonl';
export const TOOL_CALL_RECEIPT_FILE = 'mcp_tool_calls.jsonl';

/** A safe folder or run name: lowercase, underscore, no separator, no dot, no climb. */
export function assertSafeName(value, field, pattern = SAFE_DIR_NAME) {
  assertSafeString(value, field, 64);
  if (!pattern.test(value)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'a name must be lowercase letters, digits and underscores', { field });
  }
  return value;
}

export function assertStageCodeShape(value, field = 'stage_code') {
  assertSafeString(value, field, 64);
  if (!STAGE_CODE.test(value)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'a stage code looks like 120_CDR', { field });
  }
  return value;
}

export const assertRunId = (value, field = 'run_id') => assertSafeName(value, field, RUN_ID);

/** `2026-08-18T13:00:00.000Z` becomes `20260818T130000Z` — a name a filesystem accepts. */
export const compactInstant = (instant) => String(instant)
  .replace(/[-:]/gu, '')
  .replace(/\.[0-9]+Z$/u, 'Z');

export function assertInstant(value, field = 'known_at') {
  assertSafeString(value, field, 64);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/u.test(value)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'an instant must be a UTC ISO-8601 timestamp', { field });
  }
  return value;
}

/**
 * Builds the context one server process uses for one profile.
 *
 * @param options `{ profile_path, repo_root, engine_root, write_enabled, engine_version }`
 */
export async function createEngineContext(options) {
  const { profile_path: profilePath, repo_root: repoRoot, engine_root: engineRoot } = options;
  const raw = await readJsonAt(profilePath, 'project_profile');
  const profile = validateProjectProfile(raw, { repo_root: repoRoot });

  const cache = new Map();
  const context = {
    profile,
    repo_root: repoRoot,
    engine_root: engineRoot,
    engine_version: options.engine_version,
    write_enabled: options.write_enabled === true,
    vocabulary: ARTIFACT_VOCABULARY_V0,
    pointer: (absolute) => repoPointer(repoRoot, absolute),
    now: () => new Date().toISOString(),
  };

  const cached = async (key, produce) => {
    if (!cache.has(key)) cache.set(key, await produce());
    return cache.get(key);
  };

  context.readJson = (absolute, label) => readJsonAt(absolute, label);
  context.readJsonIfPresent = (absolute, label) => readJsonIfPresent(absolute, label);

  context.loadVariant = () => cached('variant', () =>
    readJsonAt(profile.compiled_variant, 'compiled_variant'));

  context.loadOverlayFiles = () => cached('overlay_files', async () => {
    const rows = [];
    for (const path of profile.overlays) {
      rows.push({ file_name: basename(path), overlay: await readJsonAt(path, 'overlay') });
    }
    return rows;
  });

  // Two overlays (a prime-contract one and a project one) are handed to the compiler as one, with
  // their op lists concatenated in profile order. That is the shape 05장 §5.1 states.
  context.loadOverlay = () => cached('overlay', async () => {
    const files = await context.loadOverlayFiles();
    if (files.length === 0) return null;
    const ops = files.flatMap((row) => row.overlay.ops ?? []);
    return {
      schema_version: files[0].overlay.schema_version,
      extends: files[0].overlay.extends,
      ops,
    };
  });

  context.loadBinding = () => cached('binding', async () => (profile.project_binding === null
    ? profile.project_binding_inline
    : readJsonAt(profile.project_binding, 'project_binding')));

  context.loadBasePacket = () => cached('base_packet', () =>
    readJsonAt(profile.base_packet, 'base_packet'));

  context.loadBaseLaunch = () => cached('base_launch', async () => {
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

  context.compile = (stageCodes) => cached(`compile:${[...stageCodes].sort().join(',')}`, async () =>
    compileStageRules({
      compiled_variant: await context.loadVariant(),
      overlay: await context.loadOverlay(),
      project_binding: await context.loadBinding(),
      target_stage_codes: [...stageCodes],
      overlay_conditions: [...profile.overlay_conditions],
    }));

  /**
   * The observations the project has, newest confirmation winning.
   *
   * An automatic walk and an Owner confirmation can disagree about the same token; D37 says the
   * Owner's answer is the one that counts, and the receipt says which files spoke.
   */
  context.loadObservations = () => cached('observations', async () => {
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
      if (!entry.isDirectory()) continue;
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

  /** Same policy the repository's own guard applies, applied before the write rather than after. */
  context.assertWritableTarget = (absolute, kind = 'file') => {
    const report = validateWorkmetaWriteTarget({
      repoRoot, targetPath: absolute, targetKind: kind,
    });
    if (!report.ok) {
      mcpFail(ENGINE_MCP_ERROR_CODES.WORKMETA_POLICY_REFUSED,
        'the metadata plane refuses this write target',
        { violations: report.violations.map((row) => row.id) });
    }
    return absolute;
  };

  context.writeCreateOnly = async (absolute, text) => {
    context.assertWritableTarget(dirname(absolute), 'directory');
    context.assertWritableTarget(absolute, 'file');
    await mkdir(dirname(absolute), { recursive: true });
    try {
      await writeFile(absolute, text, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        mcpFail(ENGINE_MCP_ERROR_CODES.OUTPUT_EXISTS,
          'an output already exists and is not overwritten', { path: context.pointer(absolute) });
      }
      throw error;
    }
    return absolute;
  };

  context.appendLine = async (absolute, line) => {
    context.assertWritableTarget(dirname(absolute), 'directory');
    context.assertWritableTarget(absolute, 'file');
    await mkdir(dirname(absolute), { recursive: true });
    await appendFile(absolute, `${line}\n`, 'utf8');
    return absolute;
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
