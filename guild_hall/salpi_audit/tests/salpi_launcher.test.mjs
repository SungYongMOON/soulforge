import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import * as launcher from '../src/salpi_launcher.mjs';
import { validateSafeProjection } from '../src/safe_projection.mjs';
import { digestOf } from '../../agent_observation/guard_primitives.mjs';
import { buildCanonicalReviewPacket } from '../src/salpi_review.mjs';

const { LAUNCH_HOLD_CODES: L, buildHermesInvocation, isFixedInvocation, planSalpiLaunch, sanitizeLaunchEnv } = launcher;
const AUDITED_AT = '2026-09-18T01:00:00.000Z';
const scratch = [];
after(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });

function projection(overrides = {}) {
  return {
    schema_version: 'soulforge.salpi.safe_projection.v1',
    projection_type: 'mail_pipeline_audit',
    producer: { id: 'salpi_mail_pipeline_projector', version: '0.1.0' },
    observed_at: '2026-09-18T00:59:00.000Z',
    scope_ref: 'mail_pipeline:gmail:0123456789ab',
    status: 'mismatch',
    metrics: { raw_count: 2, event_count: 0, event_count_mail: 0, receipt_new_events: 1, receipt_event_written: 1,
      dedupe_key_count: 1, dedupe_orphan_count: 1, cursor_seen: 1 },
    flags: { dedupe_present: true, receipt_partial: false },
    timestamps: {},
    coverage: { state: 'complete', missing_inputs: [] },
    digests: {},
    locators: ['mail_store:raw', 'mail_store:events', 'mail_receipt:last_run_summary', 'mail_state:dedupe', 'mail_state:cursor'],
    hold_codes: [],
    safety: { raw_payload_copied: false, message_bodies_returned: false, identities_returned: false, absolute_paths_returned: false },
    claim_ceiling: 'metadata_projection_only',
    ...overrides,
  };
}

function layout() {
  const root = mkdtempSync(join(tmpdir(), 'salpi-launch-'));
  scratch.push(root);
  const hermesRoot = join(root, 'hermes');
  const hermesHome = join(hermesRoot, 'profiles', 'dev-assist');
  const devAssistWorkdir = join(root, 'bots', 'DEV_ASSIST');
  const runRoot = join(root, 'salpi-runs');
  for (const dir of [hermesHome, devAssistWorkdir, join(hermesRoot, 'bin')]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(hermesRoot, 'bin', process.platform === 'win32' ? 'hermes.exe' : 'hermes'), '');
  const hermesPython = join(hermesRoot, 'hermes-agent', 'venv', 'python.exe');
  return { root, hermesRoot, hermesHome, devAssistWorkdir, runRoot, hermesPython };
}

// A probe stand-in that answers like the real Hermes probe on a safe profile, with overrides.
function fakeProbe(overrides = {}, capture = {}) {
  return ({ requestFile, env, cwd }) => {
    const request = JSON.parse(readFileSync(requestFile, 'utf8'));
    capture.request = request;
    capture.env = env;
    capture.cwd = cwd;
    const base = {
      schema_version: 'soulforge.salpi.prompt_closure_probe.v1',
      status: 'OK',
      tool_names: ['todo'],
      context_cwd: request.allowed_path_prefixes[1],
      context_cwd_is_git_repo: false,
      env_reintroduced: [],
      default_identity_used: true,
      memory_loaded: false,
      unc_path_count: 0,
      skip_context_files: true,
      probe_prompt_sha256: 'a'.repeat(64),
      prompt_chars: 9550,
      schema_chars: 1520,
      candidate_leaks: request.candidates.map((item) => ({ label: item.label, exists: false, distinct_lines: 0, lines_in_prompt: 0 })),
      email_count: 0,
      secret_count: 0,
      absolute_path_count: 3,
      unexpected_absolute_path_count: 0,
      profile: { openai_runtime: '', coding_instructions_configured: false, environment_hint_configured: false,
        platform_hints_configured: false, interface: '', ephemeral_prompt_configured: false, prefill_configured: false,
        config_hooks_configured: false, mcp_server_count: 0, plugins_enabled: ['soulforge-buzz-media'],
        terminal_cwd_configured: true, coding_context_mode: 'auto' },
    };
    const merged = { ...base, ...overrides };
    if (overrides.profile) merged.profile = { ...base.profile, ...overrides.profile };
    return merged;
  };
}

const plan = (paths, extra = {}) => planSalpiLaunch({
  projection: projection(), auditedAt: AUDITED_AT, env: { PATH: 'x' }, runProbe: fakeProbe(), ...paths, ...extra,
});

describe('salpi launcher dry-run', () => {
  it('passes all six conditions on a safe profile and prints no projection or prompt content', () => {
    const paths = layout();
    const capture = {};
    const result = plan(paths, {
      env: { PATH: 'x', HERMES_KANBAN_TASK: 'task-1', HERMES_YOLO_MODE: '1', TERMINAL_CWD: 'elsewhere' },
      runProbe: fakeProbe({}, capture),
    });
    assert.equal(result.status, 'OK', JSON.stringify(result.hold_codes));
    assert.equal(result.model_called, false);
    assert.deepEqual(Object.values(result.conditions), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
    assert.deepEqual(result.command.argv, ['-p', 'dev-assist', 'chat', '--cli', '--query-file', result.workdir.query_file,
      '-t', 'todo', '--ignore-rules', '-Q']);
    assert.ok(result.command.executable.startsWith(join(paths.hermesRoot, 'bin')));
    assert.deepEqual(result.toolsets, ['todo']);
    assert.deepEqual(result.command.env_removed, ['HERMES_KANBAN_TASK', 'HERMES_YOLO_MODE', 'TERMINAL_CWD']);
    assert.equal('HERMES_KANBAN_TASK' in capture.env, false);
    assert.equal(capture.cwd, result.workdir.run_dir);
    assert.ok(result.workdir.run_dir.startsWith(paths.runRoot));
    assert.equal(result.closure.context_cwd_forced_by_profile, true);
    assert.ok(result.closure.injected_sources.some((item) => item.source === 'profile_soul' && item.injected === false));
    const printed = JSON.stringify(result);
    for (const leaked of ['raw_count', 'receipt_new_events', 'dedupe_orphan_count', 'SAFE_PROJECTION_JSON_BEGIN']) {
      assert.equal(printed.includes(leaked), false, leaked);
    }
    assert.match(result.projection.digest, /^sha256:[0-9a-f]{64}$/u);
  });

  it('writes a query whose embedded projection is exactly the validated projection', () => {
    const result = plan(layout());
    const query = readFileSync(result.workdir.query_file, 'utf8');
    const embedded = query.split('SAFE_PROJECTION_JSON_BEGIN\n')[1].split('\nSAFE_PROJECTION_JSON_END')[0];
    const verdict = validateSafeProjection(JSON.parse(embedded));
    assert.equal(verdict.status, 'OK');
    assert.equal(verdict.digest, result.projection.digest);
  });

  it('hands the model the canonical packet to review and asks only for per-finding answers', () => {
    const result = plan(layout());
    const query = readFileSync(result.workdir.query_file, 'utf8');
    const packet = JSON.parse(query.split('CANONICAL_REVIEW_PACKET_JSON_BEGIN\n')[1].split('\nCANONICAL_REVIEW_PACKET_JSON_END')[0]);
    assert.equal(digestOf(packet), result.review_packet.digest);
    assert.equal(packet.audited_at, AUDITED_AT);
    assert.equal(packet.findings.length, 4);
    assert.equal(result.review_packet.finding_count, 4);
    assert.equal(result.review_packet.canonical_overall, 'HOLD');
    assert.ok(query.includes(`schema_version "soulforge.salpi.review.v1", packet_digest "${result.review_packet.digest}"`));
    assert.ok(query.includes('finding_checks [{finding_id, result}]'));
    assert.equal(query.includes('audit_report.v1'), false);
    assert.equal(query.includes('unknowns[{'), false);
    assert.match(result.post_run, /decideSalpiOutcome/u);
  });

  it('builds the packet with the same previous projection and receipt age the later check uses', () => {
    const previous = projection({ observed_at: '2026-09-18T00:30:00.000Z', metrics: { raw_count: 5, event_count: 0,
      event_count_mail: 0, receipt_new_events: 1, receipt_event_written: 1, dedupe_key_count: 1, dedupe_orphan_count: 1, cursor_seen: 1 } });
    const result = plan(layout(), { previous, maxReceiptAgeSeconds: 60 });
    const expected = buildCanonicalReviewPacket(projection(), { auditedAt: AUDITED_AT, previous, maxReceiptAgeSeconds: 60 });
    assert.equal(result.review_packet.digest, expected.digest);
    assert.notEqual(result.review_packet.digest, plan(layout()).review_packet.digest);
    assert.equal(result.review_packet.finding_count, 5);
  });

  it('rejects a non-UTC audit clock before creating a run dir', () => {
    const paths = layout();
    assert.throws(() => plan(paths, { auditedAt: 'yesterday' }), TypeError);
    assert.equal(existsSync(paths.runRoot), false);
  });

  it('has no execute path', () => {
    assert.deepEqual(Object.keys(launcher).filter((name) => /exec|run(?!Probe)|call|send|invoke/iu.test(name)), []);
  });

  it('never describes a widened or altered command', () => {
    const invocation = buildHermesInvocation('q.txt');
    assert.equal(isFixedInvocation(invocation, 'q.txt'), true);
    const widened = { ...invocation, argv: invocation.argv.map((item) => (item === 'todo' ? 'todo,terminal' : item)) };
    assert.equal(isFixedInvocation(widened, 'q.txt'), false);
    const all = { ...invocation, argv: invocation.argv.map((item) => (item === 'todo' ? 'all' : item)) };
    assert.equal(isFixedInvocation(all, 'q.txt'), false);
    const noRules = { ...invocation, argv: invocation.argv.filter((item) => item !== '--ignore-rules') };
    assert.equal(isFixedInvocation(noRules, 'q.txt'), false);
    assert.equal(Object.isFrozen(invocation.argv), true);
  });

  it('scrubs kanban and override variables case-insensitively', () => {
    const { env, removed } = sanitizeLaunchEnv({ hermes_kanban_task: 'x', HERMES_INFERENCE_MODEL: 'y', KEEP: 'z' });
    assert.deepEqual(Object.keys(env), ['KEEP']);
    assert.deepEqual(removed, ['HERMES_INFERENCE_MODEL', 'hermes_kanban_task']);
  });

  it('holds when a hook exists in the profile hooks directory or in config', () => {
    const paths = layout();
    mkdirSync(join(paths.hermesHome, 'hooks'), { recursive: true });
    writeFileSync(join(paths.hermesHome, 'hooks', 'pre.sh'), 'echo');
    const dirHook = plan(paths);
    assert.equal(dirHook.status, 'HOLD');
    assert.equal(dirHook.conditions.c4_no_hooks, 'HOLD');
    const configHook = plan(layout(), { runProbe: fakeProbe({ profile: { config_hooks_configured: true } }) });
    assert.ok(configHook.hold_codes.includes(L.hooks));
  });

  for (const [name, overrides, code, condition] of [
    ['a raw-capable tool', { tool_names: ['terminal', 'todo'] }, L.rawCapability, 'c2_minimal_toolset'],
    ['an extra harmless tool', { tool_names: ['clarify', 'todo'] }, L.toolset, 'c2_minimal_toolset'],
    ['context files not skipped', { skip_context_files: false }, L.contextFile, 'c6_context_closure_safe'],
    ['an e-mail in the closure', { email_count: 1 }, L.contextPattern, 'c6_context_closure_safe'],
    ['a secret in the closure', { secret_count: 1 }, L.contextPattern, 'c6_context_closure_safe'],
    ['an unexpected absolute path', { unexpected_absolute_path_count: 1 }, L.contextPath, 'c6_context_closure_safe'],
    ['an unexpected context cwd', { context_cwd: ['Z', ':', '\\', 'elsewhere'].join('') }, L.contextCwd, 'c6_context_closure_safe'],
    ['a profile prompt addition', { profile: { ephemeral_prompt_configured: true } }, L.profilePrompt, 'c6_context_closure_safe'],
    ['a prefill file', { profile: { prefill_configured: true } }, L.profilePrompt, 'c6_context_closure_safe'],
    ['an MCP server', { profile: { mcp_server_count: 1 } }, L.mcp, 'c2_minimal_toolset'],
    ['an unknown plugin', { profile: { plugins_enabled: ['soulforge-buzz-media', 'other'] } }, L.plugin, 'c2_minimal_toolset'],
    ['a failed probe', { status: 'HOLD', hold_code: 'SALPI_PROBE_FAILED' }, L.probe, 'c6_context_closure_safe'],
    ['a scrubbed variable brought back by the profile .env', { env_reintroduced: ['HERMES_EPHEMERAL_SYSTEM_PROMPT'] }, L.envReintroduced, 'c3_kanban_blocked'],
    ['kanban brought back by the profile .env', { env_reintroduced: ['HERMES_KANBAN_TASK'] }, L.envReintroduced, 'c3_kanban_blocked'],
    ['the codex app-server runtime', { profile: { openai_runtime: 'codex_app_server' } }, L.runtime, 'c2_minimal_toolset'],
    ['configured coding instructions', { profile: { coding_instructions_configured: true } }, L.profilePrompt, 'c6_context_closure_safe'],
    ['a configured environment hint', { profile: { environment_hint_configured: true } }, L.profilePrompt, 'c6_context_closure_safe'],
    ['configured platform hints', { profile: { platform_hints_configured: true } }, L.profilePrompt, 'c6_context_closure_safe'],
    ['a loaded memory store', { memory_loaded: true }, L.contextFile, 'c6_context_closure_safe'],
    ['a profile identity instead of the default', { default_identity_used: false }, L.contextFile, 'c6_context_closure_safe'],
    ['a git workspace as context cwd', { context_cwd_is_git_repo: true }, L.contextCwd, 'c6_context_closure_safe'],
    ['a UNC path in the closure', { unc_path_count: 1 }, L.contextPath, 'c6_context_closure_safe'],
  ]) {
    it(`holds on ${name}`, () => {
      const result = plan(layout(), { runProbe: fakeProbe(overrides) });
      assert.equal(result.status, 'HOLD');
      assert.ok(result.hold_codes.includes(code), JSON.stringify(result.hold_codes));
      assert.equal(result.conditions[condition], 'HOLD');
    });
  }

  it('holds when a context file line leaked into the prompt', () => {
    const leaking = (args) => {
      const answer = fakeProbe()(args);
      answer.candidate_leaks.find((item) => item.label === 'dev_assist_workdir:AGENTS.md').lines_in_prompt = 3;
      return answer;
    };
    const result = plan(layout(), { runProbe: leaking });
    assert.ok(result.hold_codes.includes(L.contextFile));
    assert.ok(result.closure.injected_sources.some((item) => item.injected === true && item.source.startsWith('dev_assist_workdir')));
  });

  it('refuses a run dir inside the dev-assist job folder or the profile home, before writing anything', () => {
    const paths = layout();
    const inJobs = plan({ ...paths, runRoot: join(paths.devAssistWorkdir, 'JOBS') });
    assert.equal(inJobs.status, 'HOLD');
    assert.equal(inJobs.conditions.c5_salpi_workdir, 'HOLD');
    assert.equal(existsSync(join(paths.devAssistWorkdir, 'JOBS')), false);
    const inProfile = plan({ ...paths, runRoot: join(paths.hermesHome, 'salpi') });
    assert.ok(inProfile.hold_codes.includes(L.workdir));
  });

  it('holds when the pinned hermes executable is missing', () => {
    const paths = layout();
    rmSync(join(paths.hermesRoot, 'bin'), { recursive: true, force: true });
    const result = plan(paths);
    assert.ok(result.hold_codes.includes(L.executable));
    assert.equal(result.conditions.c1_fixed_command, 'HOLD');
  });

  it('refuses another profile, a look-alike profile path and an invalid projection without creating a run dir', () => {
    const paths = layout();
    const other = join(paths.hermesRoot, 'profiles', 'context-memory');
    mkdirSync(other, { recursive: true });
    assert.deepEqual(plan({ ...paths, hermesHome: other }).hold_codes, [L.profile]);
    const lookAlike = join(paths.hermesRoot, 'backup', 'dev-assist');
    mkdirSync(lookAlike, { recursive: true });
    assert.deepEqual(plan({ ...paths, hermesHome: lookAlike }).hold_codes, [L.profile]);
    assert.deepEqual(plan({ ...paths, hermesPython: process.execPath }).hold_codes, [L.profile]);
    const tainted = plan(paths, { projection: { ...projection(), body_text: 'x' } });
    assert.deepEqual(tainted.hold_codes, [L.projection]);
    assert.equal(existsSync(paths.runRoot), false);
  });
});
