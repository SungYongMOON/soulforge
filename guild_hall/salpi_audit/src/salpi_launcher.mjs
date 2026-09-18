// Salpi launcher, dry-run only.
//
// It prepares one salpi audit run on the existing `dev-assist` Hermes profile with the toolset
// narrowed to `todo` for that single invocation, and proves the run is safe BEFORE anything is
// sent to a model:
//
//   C1 the command is fixed: <hermes root>/bin/hermes.exe -p dev-assist chat --cli --query-file <f>
//      -t todo --ignore-rules -Q, compared against an independent literal
//   C2 the rendered tool surface is exactly ["todo"] (no terminal/file/code/browser/computer/delegation)
//   C3 kanban auto-injection and the other override env vars are removed from the child env, and
//      the profile .env does not bring any of them back
//   C4 any hook (hooks dir entry or config `hooks`) is a HOLD
//   C5 the run uses its own salpi work dir, never the dev-assist job folder or the profile home
//   C6 the automatically injected context closure carries no profile/context-file text, e-mail,
//      secret or unexpected absolute path (rendered by Hermes' own code in hermes_probe/)
//
// There is deliberately no execute path in this module. The plan prints the final command,
// toolset, work dir, injected-source list and digests, never the projection or prompt contents.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasLocalPath, hasSecret } from '../../agent_observation/guard_primitives.mjs';
import {
  AUDIT_CLAIM_CEILING, AUDIT_REPORT_SCHEMA_VERSION, AUTHORITY_KEYS, FINDING_CATALOG, MAIL_CHECKLIST_ID,
  STATUSES, UNKNOWN_REASONS,
} from './salpi_audit.mjs';
import { validateSafeProjection } from './safe_projection.mjs';

export const LAUNCH_PLAN_SCHEMA_VERSION = 'soulforge.salpi.launch_plan.v1';
export const SALPI_HERMES_PROFILE = 'dev-assist';
export const SALPI_TOOLSETS = Object.freeze(['todo']);
export const QUERY_FILE_NAME = 'salpi_query.txt';
export const PROBE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'hermes_probe', 'prompt_closure_probe.py');

// Tool names that can reach raw data, run code or act elsewhere. The surface must be exactly
// SALPI_TOOLSETS' tools; this list is a second, independent check.
const RAW_CAPABLE_TOOL = /^(?:terminal|process|read_file|write_file|patch|search_files|execute_code|browser_.*|computer_use|delegate_task|web_search|web_extract|vision_analyze|image_generate|skill_view|skills_list|skill_manage|memory|session_search|cronjob|kanban_.*|send_message|messaging.*|mcp_.*|lcm_.*)$/u;
const EXPECTED_TOOL_NAMES = Object.freeze(['todo']);

// Removed from the child environment. Kanban would re-add its toolset; the rest could widen the
// toolset, swap the model or surface, move the context cwd, accept hooks or inject prompt text.
export const SCRUBBED_ENV = Object.freeze([
  'HERMES_KANBAN_TASK', 'HERMES_DELEGATED_CHILD_CONTEXT', 'HERMES_INFERENCE_MODEL', 'HERMES_INFERENCE_PROVIDER',
  'TERMINAL_CWD', 'HERMES_EPHEMERAL_SYSTEM_PROMPT', 'HERMES_PREFILL_MESSAGES_FILE', 'HERMES_IGNORE_RULES',
  'HERMES_IGNORE_USER_CONFIG', 'HERMES_HOME', 'HERMES_YOLO_MODE', 'HERMES_TUI_TOOLSETS', 'HERMES_ENVIRONMENT_HINT',
  'HERMES_TUI', 'HERMES_PLATFORM', 'HERMES_SESSION_PLATFORM', 'TERMINAL_ENV', 'HERMES_ACCEPT_HOOKS', 'HERMES_KANBAN_BOARD',
]);

// The command, written out independently of buildHermesInvocation so C1 is a real comparison.
const FIXED_ARGV_TEMPLATE = Object.freeze(['-p', 'dev-assist', 'chat', '--cli', '--query-file', '<QUERY_FILE>',
  '-t', 'todo', '--ignore-rules', '-Q']);

// Plugins known to register only a messaging platform adapter (no tools, hooks or prompt sections).
export const PLATFORM_ONLY_PLUGINS = Object.freeze(['soulforge-buzz-media']);

export const LAUNCH_HOLD_CODES = Object.freeze({
  projection: 'SALPI_LAUNCH_PROJECTION_REJECTED',
  profile: 'SALPI_LAUNCH_PROFILE_UNEXPECTED',
  workdir: 'SALPI_LAUNCH_WORKDIR_UNSAFE',
  command: 'SALPI_LAUNCH_COMMAND_NOT_FIXED',
  hooks: 'SALPI_LAUNCH_HOOK_PRESENT',
  probe: 'SALPI_LAUNCH_PROBE_FAILED',
  toolset: 'SALPI_LAUNCH_TOOLSET_NOT_MINIMAL',
  rawCapability: 'SALPI_LAUNCH_RAW_CAPABILITY_PRESENT',
  contextFile: 'SALPI_LAUNCH_CONTEXT_FILE_INJECTED',
  contextPattern: 'SALPI_LAUNCH_CONTEXT_PRIVATE_PATTERN',
  contextPath: 'SALPI_LAUNCH_CONTEXT_UNEXPECTED_PATH',
  contextCwd: 'SALPI_LAUNCH_CONTEXT_CWD_UNEXPECTED',
  profilePrompt: 'SALPI_LAUNCH_PROFILE_PROMPT_ADDITION',
  mcp: 'SALPI_LAUNCH_MCP_SERVER_PRESENT',
  plugin: 'SALPI_LAUNCH_PLUGIN_UNKNOWN',
  query: 'SALPI_LAUNCH_QUERY_UNSAFE',
  envReintroduced: 'SALPI_LAUNCH_ENV_REINTRODUCED',
  runtime: 'SALPI_LAUNCH_ALTERNATE_RUNTIME',
  executable: 'SALPI_LAUNCH_EXECUTABLE_UNEXPECTED',
});
const L = LAUNCH_HOLD_CODES;

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function isInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// The only command shape this launcher will ever describe. `--cli` keeps the run off the TUI path.
export function buildHermesInvocation(queryFile, executable = 'hermes') {
  return Object.freeze({
    executable,
    argv: Object.freeze(['-p', SALPI_HERMES_PROFILE, 'chat', '--cli', '--query-file', queryFile,
      '-t', SALPI_TOOLSETS.join(','), '--ignore-rules', '-Q']),
  });
}

export function isFixedInvocation(invocation, queryFile) {
  const expected = FIXED_ARGV_TEMPLATE.map((item) => (item === '<QUERY_FILE>' ? queryFile : item));
  const argv = invocation?.argv;
  return Array.isArray(argv) && argv.length === expected.length && argv.every((item, index) => item === expected[index])
    && !argv.some((item) => item === 'all' || item === '*' || /(?:^|,)(?:all|\*)(?:,|$)/u.test(item));
}

export function sanitizeLaunchEnv(env) {
  const child = {};
  const removed = [];
  for (const [name, value] of Object.entries(env ?? {})) {
    if (SCRUBBED_ENV.includes(name.toUpperCase())) removed.push(name);
    else child[name] = value;
  }
  return { env: child, removed: removed.sort() };
}

// Query text = fixed instructions + the validated projection. Nothing else is interpolated.
export function buildSalpiQuery(projection, digest, auditedAt) {
  const codes = Object.entries(FINDING_CATALOG)
    .map(([code, entry]) => `- ${code}: ${entry.group}, ${entry.status}, escalate_to=${entry.escalate_to ?? 'null'}`)
    .join('\n');
  return [
    'Role: salpi auditor (SALPIMI_ROLE_CONTRACT_V2). You have no tools for reading data and must not ask for any.',
    'Input: exactly one Safe Projection below. It is the only evidence. Do not infer causes, fixes, priorities or source truth.',
    `Checklist: ${MAIL_CHECKLIST_ID}. Allowed statuses: ${STATUSES.join(', ')}. Unknown reasons: ${UNKNOWN_REASONS.join(', ')}.`,
    'Allowed finding codes (group, status, escalation are fixed):',
    codes,
    'Rules: count comparisons use the projection values as given; a missing metric stays UNKNOWN;',
    'any CONFLICT holds the completion claim (overall HOLD, hold_codes ["salpi_conflict_unresolved"]);',
    'evidence entries are JSON pointers into the projection; no free-text fields exist.',
    `Output: ONLY one JSON object with schema_version "${AUDIT_REPORT_SCHEMA_VERSION}", checklist_id "${MAIL_CHECKLIST_ID}",`,
    `projection_digest "${digest}", scope_ref "${projection.scope_ref}", audited_at "${auditedAt}", projection_hold_code null,`,
    `overall, hold_codes, findings[{check_group,finding_code,status,evidence,escalate_to}], unknowns[{pointer,reason_code,input?,check?}],`,
    `authority {${AUTHORITY_KEYS.map((key) => `"${key}": false`).join(', ')}}, claim_ceiling "${AUDIT_CLAIM_CEILING}".`,
    'SAFE_PROJECTION_JSON_BEGIN',
    JSON.stringify(projection),
    'SAFE_PROJECTION_JSON_END',
    '',
  ].join('\n');
}

function defaultProbeRunner({ python, requestFile, cwd, env }) {
  const result = spawnSync(python, [PROBE_SCRIPT, requestFile], { cwd, env, encoding: 'utf8', timeout: 180_000, windowsHide: true });
  const line = (result.stdout ?? '').trim().split(/\r?\n/u).pop() ?? '';
  try {
    return JSON.parse(line);
  } catch {
    return { status: 'HOLD', hold_code: 'SALPI_PROBE_OUTPUT_UNREADABLE' };
  }
}

function hookEntries(hermesHome) {
  const dir = join(hermesHome, 'hooks');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).length;
}

// options: { projection, hermesHome, hermesRoot, hermesPython, runRoot, devAssistWorkdir, auditedAt,
//            env?, runProbe?, userHome? }
export function planSalpiLaunch(options) {
  const holds = new Set();
  const conditions = { c1_fixed_command: 'PASS', c2_minimal_toolset: 'PASS', c3_kanban_blocked: 'PASS',
    c4_no_hooks: 'PASS', c5_salpi_workdir: 'PASS', c6_context_closure_safe: 'PASS' };
  const fail = (condition, code) => { conditions[condition] = 'HOLD'; holds.add(code); };
  const plan = {
    schema_version: LAUNCH_PLAN_SCHEMA_VERSION,
    mode: 'dry_run',
    model_called: false,
    status: 'HOLD',
    hold_codes: [],
  };

  const verdict = validateSafeProjection(options.projection);
  if (verdict.status !== 'OK') {
    plan.hold_codes = [L.projection];
    plan.projection_hold_code = verdict.hold_code;
    return plan;
  }
  const projection = verdict.value;
  const { hermesHome, hermesRoot, hermesPython, runRoot, devAssistWorkdir, auditedAt } = options;
  for (const value of [hermesHome, hermesRoot, hermesPython, runRoot, devAssistWorkdir]) {
    if (typeof value !== 'string' || !isAbsolute(value)) throw new TypeError('absolute hermesHome, hermesRoot, hermesPython, runRoot and devAssistWorkdir are required');
  }
  if (typeof auditedAt !== 'string') throw new TypeError('auditedAt is required');
  // `-p dev-assist` always resolves to <root>/profiles/dev-assist, so that exact path is the only one probed.
  // The probe interpreter must belong to the same Hermes install the pinned executable launches.
  if (resolve(hermesHome).toLowerCase() !== resolve(hermesRoot, 'profiles', SALPI_HERMES_PROFILE).toLowerCase()
    || !isInside(hermesPython, hermesRoot)) {
    plan.hold_codes = [L.profile];
    return plan;
  }

  // C5: a dedicated run dir outside the profile home, the dev-assist job folder and the Hermes root.
  const runDir = join(runRoot, `salpi-run-${verdict.digest.slice('sha256:'.length, 'sha256:'.length + 12)}`);
  for (const forbidden of [hermesHome, hermesRoot, devAssistWorkdir]) {
    if (isInside(runDir, forbidden) || isInside(forbidden, runDir)) fail('c5_salpi_workdir', L.workdir);
  }
  if (conditions.c5_salpi_workdir === 'HOLD') {
    plan.hold_codes = [...holds];
    plan.conditions = conditions;
    return plan;
  }
  mkdirSync(runDir, { recursive: true });
  for (const name of ['AGENTS.md', 'AGENTS.override.md', 'agents.md', 'CLAUDE.md', '.hermes.md', 'HERMES.md', '.cursorrules']) {
    if (existsSync(join(runDir, name))) fail('c5_salpi_workdir', L.workdir);
  }

  // Query: fixed template + validated projection, scanned before anything is written.
  const query = buildSalpiQuery(projection, verdict.digest, auditedAt);
  if (hasLocalPath(query) || hasSecret(query) || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(query)) {
    fail('c6_context_closure_safe', L.query);
    plan.hold_codes = [...holds];
    plan.conditions = conditions;
    return plan;
  }
  const queryFile = join(runDir, QUERY_FILE_NAME);
  writeFileSync(queryFile, query, 'utf8');

  // C1: the pinned executable next to the probed install, and the literal argv.
  const executable = join(hermesRoot, 'bin', process.platform === 'win32' ? 'hermes.exe' : 'hermes');
  if (!existsSync(executable)) fail('c1_fixed_command', L.executable);
  const invocation = buildHermesInvocation(queryFile, executable);
  if (!isFixedInvocation(invocation, queryFile)) fail('c1_fixed_command', L.command);

  // C3
  const { env: childEnv, removed } = sanitizeLaunchEnv(options.env ?? process.env);

  // C4 (directory part; the config part comes from the probe)
  const hookDirEntries = hookEntries(hermesHome);
  if (hookDirEntries > 0) fail('c4_no_hooks', L.hooks);

  // C2 + C6: render the closure with Hermes' own code, no model call.
  const userHome = options.userHome ?? homedir();
  const candidates = [
    ['profile_soul', join(hermesHome, 'SOUL.md')],
    ['profile_user_memory', join(hermesHome, 'memories', 'USER.md')],
    ['profile_memory', join(hermesHome, 'memories', 'MEMORY.md')],
    ['hermes_common', join(hermesRoot, 'HERMES.common.md')],
    ['root_profile_soul', join(hermesRoot, 'SOUL.md')],
    ...['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.hermes.md', 'HERMES.md'].map((name) => [`dev_assist_workdir:${name}`, join(devAssistWorkdir, name)]),
  ].map(([label, path]) => ({ label, path }));
  const requestFile = join(runDir, 'probe_request.json');
  writeFileSync(requestFile, JSON.stringify({
    hermes_home: hermesHome,
    toolsets: [...SALPI_TOOLSETS],
    candidates,
    allowed_path_exact: [userHome],
    allowed_path_prefixes: [hermesRoot, devAssistWorkdir, runDir],
  }), 'utf8');
  const probe = (options.runProbe ?? defaultProbeRunner)({ python: hermesPython, requestFile, cwd: runDir, env: childEnv });

  const closure = { probe_status: probe?.status ?? 'HOLD' };
  if (probe?.status !== 'OK') {
    fail('c6_context_closure_safe', L.probe);
    closure.probe_hold_code = typeof probe?.hold_code === 'string' ? probe.hold_code : 'SALPI_PROBE_OUTPUT_UNREADABLE';
  } else {
    const toolNames = Array.isArray(probe.tool_names) ? probe.tool_names : [];
    if (toolNames.length !== EXPECTED_TOOL_NAMES.length || toolNames.some((name, i) => name !== EXPECTED_TOOL_NAMES[i])) {
      fail('c2_minimal_toolset', L.toolset);
    }
    if (toolNames.some((name) => RAW_CAPABLE_TOOL.test(name))) fail('c2_minimal_toolset', L.rawCapability);
    if (probe.skip_context_files !== true || probe.memory_loaded !== false || probe.default_identity_used !== true) {
      fail('c6_context_closure_safe', L.contextFile);
    }
    if (!Array.isArray(probe.env_reintroduced) || probe.env_reintroduced.length > 0) fail('c3_kanban_blocked', L.envReintroduced);
    if (probe.context_cwd_is_git_repo !== false) fail('c6_context_closure_safe', L.contextCwd);
    if (probe.unc_path_count !== 0) fail('c6_context_closure_safe', L.contextPath);
    const leaks = Array.isArray(probe.candidate_leaks) ? probe.candidate_leaks : [];
    if (leaks.length !== candidates.length || leaks.some((item) => item.lines_in_prompt !== 0)) fail('c6_context_closure_safe', L.contextFile);
    if (probe.email_count !== 0 || probe.secret_count !== 0) fail('c6_context_closure_safe', L.contextPattern);
    if (probe.unexpected_absolute_path_count !== 0) fail('c6_context_closure_safe', L.contextPath);
    const contextCwd = String(probe.context_cwd ?? '');
    const cwdOk = contextCwd !== '' && [devAssistWorkdir, runDir].some((dir) => resolve(contextCwd).toLowerCase() === resolve(dir).toLowerCase());
    if (!cwdOk) fail('c6_context_closure_safe', L.contextCwd);
    const facts = probe.profile ?? {};
    if (facts.config_hooks_configured !== false) fail('c4_no_hooks', L.hooks);
    if (facts.ephemeral_prompt_configured !== false || facts.prefill_configured !== false
      || facts.coding_instructions_configured !== false || facts.environment_hint_configured !== false
      || facts.platform_hints_configured !== false) fail('c6_context_closure_safe', L.profilePrompt);
    // model.openai_runtime: codex_app_server hands the turn to a subprocess with its own shell and file tools.
    if (facts.openai_runtime !== '') fail('c2_minimal_toolset', L.runtime);
    if (facts.mcp_server_count !== 0) fail('c2_minimal_toolset', L.mcp);
    if (!Array.isArray(facts.plugins_enabled) || facts.plugins_enabled.some((name) => !PLATFORM_ONLY_PLUGINS.includes(name))) {
      fail('c2_minimal_toolset', L.plugin);
    }
    Object.assign(closure, {
      tool_names: toolNames,
      // Digest of the probe's rendering. The real run adds model-keyed static text, so this is not
      // the real prompt's digest.
      probe_prompt_sha256: probe.probe_prompt_sha256,
      env_reintroduced: probe.env_reintroduced,
      memory_loaded: probe.memory_loaded,
      default_identity_used: probe.default_identity_used,
      context_cwd_is_git_repo: probe.context_cwd_is_git_repo,
      prompt_chars: probe.prompt_chars,
      schema_chars: probe.schema_chars,
      email_count: probe.email_count,
      secret_count: probe.secret_count,
      absolute_path_count: probe.absolute_path_count,
      unexpected_absolute_path_count: probe.unexpected_absolute_path_count,
      injected_sources: [
        ...leaks.map((item) => ({ source: item.label, exists: item.exists, injected: item.lines_in_prompt !== 0 })),
        { source: 'hermes_default_identity', exists: true, injected: true, content: 'static_hermes_text' },
        { source: 'environment_hints', exists: true, injected: true, content: 'os_user_home_path_and_context_cwd_path' },
        { source: 'coding_workspace_snapshot', exists: true, injected: facts.coding_context_mode !== 'off',
          content: 'context_cwd_root_path_and_marker_file_names' },
      ],
      profile_facts: facts,
      context_cwd: contextCwd,
      context_cwd_forced_by_profile: facts.terminal_cwd_configured === true
        && resolve(contextCwd).toLowerCase() !== resolve(runDir).toLowerCase(),
    });
  }

  plan.status = holds.size === 0 ? 'OK' : 'HOLD';
  plan.hold_codes = [...holds].sort();
  plan.conditions = conditions;
  plan.command = { executable: invocation.executable, argv: [...invocation.argv], cwd: runDir, env_removed: removed };
  plan.toolsets = [...SALPI_TOOLSETS];
  plan.workdir = { run_dir: runDir, process_cwd: runDir, query_file: queryFile };
  plan.hooks = { hooks_dir_entries: hookDirEntries, config_hooks_configured: probe?.profile?.config_hooks_configured ?? null };
  plan.closure = closure;
  plan.projection = { digest: verdict.digest, scope_ref: projection.scope_ref };
  plan.query = { sha256: `sha256:${sha256(query)}`, chars: query.length };
  plan.post_run = 'validateSalpiAuditReport(report, projection, { auditedAt }) must return OK before any report is used';
  return plan;
}
