// The night chain runner: config/lane digest gating, step sequencing,
// success_rule freshness, deadline/lock/on_failure semantics, --dry/--only/
// --from, timeouts and redaction. Every lane a step points at here is a tiny
// REAL synthetic .mjs script written to `os.tmpdir()` and run as a real child
// process (node:test never injects a scripted `spawnStep` in place of the
// real one) -- this exercises the actual `node <entry> <args>` path, not a
// stand-in for it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  NIGHT_CHAIN_CONFIG_SCHEMA, computeStaleLockMs, evaluateSuccessRule, loadChainConfig,
  nextDeadlineInstant, redactHostPathsLocal, runChain, runNightChainCli, verifyStepLanes,
} from '../ops/night_chain.mjs';

const sha256 = buffer => `sha256:${createHash('sha256').update(buffer).digest('hex')}`;

/** One synthetic "lane": a tmp directory holding one entry .mjs and a
 * LANE_MANIFEST.sha256 that actually hashes to it (the same file/verification
 * shape every real built lane has), plus its own receipts dir. */
function makeLane(label, scriptBody) {
  const laneRoot = mkdtempSync(path.join(os.tmpdir(), `night-chain-lane-${label}-`));
  const entry = 'entry.mjs';
  writeFileSync(path.join(laneRoot, entry), scriptBody);
  const manifestBytes = Buffer.from(`${sha256(readFileSync(path.join(laneRoot, entry))).slice(7)} *./${entry}\n`);
  writeFileSync(path.join(laneRoot, 'LANE_MANIFEST.sha256'), manifestBytes);
  const receiptsDir = mkdtempSync(path.join(os.tmpdir(), `night-chain-lane-receipts-${label}-`));
  return { laneRoot, entry, manifestSha256: sha256(manifestBytes), receiptsDir };
}

/** Writes a chain config file (the `{ steps: [...] }` object shape this
 * runner accepts) and returns its path plus its own sha256. */
function writeConfig(dir, steps) {
  const config = { schema_version: NIGHT_CHAIN_CONFIG_SCHEMA, steps };
  const bytes = Buffer.from(JSON.stringify(config));
  const configPath = path.join(dir, 'config.json');
  writeFileSync(configPath, bytes);
  return { configPath, configSha256: sha256(bytes) };
}

function stepOf(lane, id, overrides = {}) {
  return {
    id, lane_root: lane.laneRoot, entry: lane.entry, args: [],
    receipts_dir: lane.receiptsDir, success_rule: null, on_failure: 'stop',
    timeout_minutes: 1, lane_manifest_sha256: lane.manifestSha256, ...overrides,
  };
}

const SUCCEED_SCRIPT = 'process.exitCode = 0;';
const FAIL_SCRIPT = 'process.exitCode = 2;';
/** Writes `daily-<now>.json` with `{ status: "ok" }` into the directory it is
 * given as `process.argv[2]`, then exits 0 -- used for `success_rule` tests. */
const SUCCEED_WITH_RECEIPT_SCRIPT = `
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'daily-' + Date.now() + '.json'), JSON.stringify({ status: 'ok' }));
process.exitCode = 0;
`;

test('happy path: every step succeeds -> overall OK', async () => {
  const laneA = makeLane('happy-a', SUCCEED_SCRIPT);
  const laneB = makeLane('happy-b', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-happy-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(laneA, 'a'), stepOf(laneB, 'b')]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.receipt.steps.map(s => s.status), ['OK', 'OK']);
  assert.equal(result.receipt.not_started.length, 0);
});

test('step 2 fails with on_failure stop -> FAILED, later steps never started, receipt records where', async () => {
  const laneA = makeLane('stop-a', SUCCEED_SCRIPT);
  const laneB = makeLane('stop-b', FAIL_SCRIPT);
  const laneC = makeLane('stop-c', SUCCEED_SCRIPT);
  const laneD = makeLane('stop-d', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-stop-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts,
    [stepOf(laneA, 'a'), stepOf(laneB, 'b'), stepOf(laneC, 'c'), stepOf(laneD, 'd')]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.status, 'FAILED');
  assert.deepEqual(result.receipt.steps.map(s => s.id), ['a', 'b']);
  assert.equal(result.receipt.steps[1].status, 'FAILED');
  assert.equal(result.receipt.stopped_at_step, 'b');
  assert.deepEqual(result.receipt.not_started, ['c', 'd']);
});

test('on_failure continue: a failing step does not block later steps', async () => {
  const laneA = makeLane('cont-a', FAIL_SCRIPT);
  const laneB = makeLane('cont-b', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-cont-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts,
    [stepOf(laneA, 'a', { on_failure: 'continue' }), stepOf(laneB, 'b')]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.status, 'FAILED'); // a real failure happened, even though the chain did not stop
  assert.deepEqual(result.receipt.steps.map(s => s.status), ['FAILED', 'OK']);
  assert.equal(result.receipt.not_started.length, 0);
});

test('success_rule: a receipt written BEFORE the step started is not this step\'s success signal', async () => {
  const lane = makeLane('stale', SUCCEED_SCRIPT); // exits 0 but writes nothing itself
  writeFileSync(path.join(lane.receiptsDir, 'daily-0.json'), JSON.stringify({ status: 'ok' })); // pre-seeded, stale
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-staler-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1', {
    success_rule: { receipt_glob: 'daily-*.json', json_path: 'status', allowed_values: ['ok'] } })]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.receipt.steps[0].status, 'FAILED', 'a stale pre-existing receipt must not count as success');
  assert.equal(result.receipt.steps[0].receipt_found, false);
  assert.equal(result.receipt.steps[0].reason, 'night_chain_step_receipt_not_matched');
});

test('success_rule: a fresh receipt written by the step itself does count', async () => {
  const lane = makeLane('fresh', SUCCEED_WITH_RECEIPT_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-fresh-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1', {
    args: [lane.receiptsDir],
    success_rule: { receipt_glob: 'daily-*.json', json_path: 'status', allowed_values: ['ok'] } })]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.steps[0].receipt_found, true);
});

test('deadline reached between two steps -> PARTIAL, remaining listed by id', async () => {
  const laneA = makeLane('partial-a', SUCCEED_SCRIPT);
  const laneB = makeLane('partial-b', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-partial-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(laneA, 'a'), stepOf(laneB, 'b')]);
  const nowIso = '2025-12-31T15:00:00.000Z'; // 2026-01-01T00:00 KST
  let calls = 0;
  const clock = () => { calls += 1; return calls <= 1 ? nowIso : '2025-12-31T15:10:00.000Z'; }; // past 00:05 KST from the 2nd check on
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts,
    deadline: '00:05', scheduledStart: '00:00', now: nowIso, clock });
  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(result.receipt.not_started, ['b']);
  assert.equal(result.receipt.steps[0].status, 'OK');
});

test('deadline already past before anything could start -> SKIPPED_PAST_DEADLINE, nothing ran', async () => {
  const lane = makeLane('skip-deadline', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-skip-deadline-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  const nowIso = '2025-12-31T15:10:00.000Z'; // 2026-01-01T00:10 KST, already past a 00:05 deadline anchored to 00:00
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts,
    deadline: '00:05', scheduledStart: '00:00', now: nowIso, clock: () => nowIso });
  assert.equal(result.status, 'SKIPPED_PAST_DEADLINE');
  assert.equal(result.receipt.steps.length, 0);
  const { result: cliResult } = await runNightChainCli(
    ['--chain-config', configPath, '--chain-config-sha256', configSha256, '--receipts',
      mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-skip-deadline-cli-')),
      '--deadline', '00:05', '--scheduled-start', '00:00'],
    { now: nowIso, clock: () => nowIso });
  assert.equal(cliResult.status, 'SKIPPED_PAST_DEADLINE');
});

test('lock already held (fresh) -> LOCK_HELD, nothing run', async () => {
  const lane = makeLane('lock-fresh', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-lockfresh-'));
  writeFileSync(path.join(chainReceipts, 'night_chain.lock'),
    JSON.stringify({ pid: 999999, started_at: new Date().toISOString() }), { flag: 'wx' });
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.status, 'LOCK_HELD');
  assert.deepEqual(result.steps, []);
  // the fresh lock file itself must be left exactly as found
  const lockAfter = JSON.parse(readFileSync(path.join(chainReceipts, 'night_chain.lock'), 'utf8'));
  assert.equal(lockAfter.pid, 999999);
});

test('stale lock is reclaimed; run proceeds; receipt notes the reclaim', async () => {
  const lane = makeLane('lock-stale', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-lockstale-'));
  const ancientStart = new Date(Date.now() - 999_999_999).toISOString();
  writeFileSync(path.join(chainReceipts, 'night_chain.lock'), JSON.stringify({ pid: 123, started_at: ancientStart }), { flag: 'wx' });
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.lock.reclaimed_stale, true);
  assert.equal(result.receipt.lock.previous_lock_age_ms > 0, true);
});

test('--dry writes nothing: no lock, no receipt', async () => {
  const lane = makeLane('dry', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-dry-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  const beforeFiles = readdirSync(chainReceipts).sort();
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, dry: true, now: new Date().toISOString() });
  assert.equal(result.status, 'DRY');
  const afterFiles = readdirSync(chainReceipts).sort();
  assert.deepEqual(afterFiles, beforeFiles, 'a dry run must add no file to the chain receipts dir');
});

test('--dry reports a disabled step as skipped and every step\'s lane digest check', async () => {
  const laneOn = makeLane('dry-on', SUCCEED_SCRIPT);
  const laneOff = makeLane('dry-off', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-dryplan-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts,
    [stepOf(laneOn, 'on'), stepOf(laneOff, 'off', { enabled: false })]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, dry: true, now: new Date().toISOString() });
  assert.equal(result.steps.find(s => s.id === 'off').enabled, false);
  assert.equal(result.steps.find(s => s.id === 'off').lane_manifest_ok, null, 'a disabled step is not checked, and says so');
  assert.equal(result.steps.find(s => s.id === 'on').lane_manifest_ok, true);
});

test('a disabled step whose lane does not exist yet (a placeholder) never blocks the chain', async () => {
  const laneOn = makeLane('placeholder-on', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-placeholder-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [
    stepOf(laneOn, 'on'),
    { id: 'future', lane_root: path.join(os.tmpdir(), 'night-chain-does-not-exist-anywhere'), entry: 'nope.mjs', args: [],
      receipts_dir: path.join(os.tmpdir(), 'night-chain-does-not-exist-receipts'), success_rule: null, on_failure: 'continue',
      timeout_minutes: 1, enabled: false, lane_manifest_sha256: `sha256:${'0'.repeat(64)}` },
  ]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.receipt.steps.map(s => s.status), ['OK', 'SKIPPED_DISABLED']);
});

test('bad --chain-config-sha256 (does not match the file) refuses; nothing runs', async () => {
  const lane = makeLane('badcfg', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-badcfg-'));
  const { configPath } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  await assert.rejects(
    runChain({ configPath, expectedConfigSha256: `sha256:${'0'.repeat(64)}`, receiptsDir: chainReceipts, now: new Date().toISOString() }),
    error => error.code === 'night_chain_config_sha256_mismatch');
  assert.deepEqual(readdirSync(chainReceipts).filter(f => f !== 'config.json'), []);
});

test('bad step lane_manifest_sha256 (does not match that lane\'s actual LANE_MANIFEST.sha256) refuses; nothing runs', async () => {
  const lane = makeLane('badlane', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-badlane-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts,
    [stepOf(lane, 's1', { lane_manifest_sha256: `sha256:${'1'.repeat(64)}` })]);
  await assert.rejects(
    runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() }),
    error => error.code === 'night_chain_lane_manifest_sha256_mismatch');
  assert.deepEqual(readdirSync(chainReceipts).filter(f => f !== 'config.json'), []);
});

test('lane digests are checked for EVERY enabled step before step 1 runs, even under --only', async () => {
  const laneGood = makeLane('everyonly-good', SUCCEED_SCRIPT);
  const laneBad = makeLane('everyonly-bad', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-everyonly-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [
    stepOf(laneGood, 'good'),
    stepOf(laneBad, 'bad', { lane_manifest_sha256: `sha256:${'2'.repeat(64)}` }),
  ]);
  await assert.rejects(
    runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, only: 'good', now: new Date().toISOString() }),
    error => error.code === 'night_chain_lane_manifest_sha256_mismatch');
});

test('--only <id> runs just that step', async () => {
  const laneA = makeLane('only-a', SUCCEED_SCRIPT);
  const laneB = makeLane('only-b', FAIL_SCRIPT); // would fail the chain if it ran
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-only-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(laneA, 'a'), stepOf(laneB, 'b')]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, only: 'a', now: new Date().toISOString() });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.receipt.steps.map(s => s.id), ['a']);
});

test('--only naming an unknown step id refuses', async () => {
  const lane = makeLane('only-unknown', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-onlyunknown-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  await assert.rejects(
    runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, only: 'nope', now: new Date().toISOString() }),
    error => error.code === 'night_chain_only_step_unknown');
});

test('--only naming a disabled step refuses rather than silently running or no-oping', async () => {
  const lane = makeLane('only-disabled', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-onlydisabled-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 'off', { enabled: false })]);
  await assert.rejects(
    runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, only: 'off', now: new Date().toISOString() }),
    error => error.code === 'night_chain_only_step_disabled');
});

test('--from <id> runs that step and everything after it', async () => {
  const laneA = makeLane('from-a', FAIL_SCRIPT); // out of scope; would fail the chain if it ran
  const laneB = makeLane('from-b', SUCCEED_SCRIPT);
  const laneC = makeLane('from-c', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-from-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(laneA, 'a'), stepOf(laneB, 'b'), stepOf(laneC, 'c')]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, from: 'b', now: new Date().toISOString() });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.receipt.steps.map(s => s.id), ['b', 'c']);
});

test('--only and --from together are refused', async () => {
  const lane = makeLane('conflict', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-conflict-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  await assert.rejects(
    runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, only: 's1', from: 's1', now: new Date().toISOString() }),
    error => error.code === 'night_chain_only_and_from_conflict');
});

test('a step with enabled: false is skipped and never executed, in a plain run', async () => {
  const laneOff = makeLane('disabled-plain', FAIL_SCRIPT); // would fail the chain if it were ever run
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-disabledplain-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(laneOff, 'off', { enabled: false })]);
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.steps[0].status, 'SKIPPED_DISABLED');
});

test('a step whose child exceeds timeout_minutes is killed and recorded timed_out', async () => {
  const lane = makeLane('timeout', 'await new Promise(resolve => setTimeout(resolve, 15000));');
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-timeout-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1', { timeout_minutes: 0.01 })]);
  const startedAt = Date.now();
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString() });
  const elapsedMs = Date.now() - startedAt;
  assert.equal(result.receipt.steps[0].timed_out, true);
  assert.equal(result.receipt.steps[0].status, 'FAILED');
  assert.ok(elapsedMs < 14000, `expected the kill to cut this well short of the natural 15s runtime, took ${elapsedMs}ms`);
});

test('redaction: a synthetic lane writing a host-local path to stderr has it redacted in the relayed log lines', async () => {
  const redactScript = [
    "const hostPath = 'C:' + String.fromCharCode(92) + 'Users' + String.fromCharCode(92) + 'owner' + String.fromCharCode(92) + 'secret' + String.fromCharCode(92) + 'file.txt';",
    "process.stderr.write('failed at ' + hostPath + String.fromCharCode(10));",
    'process.exitCode = 0;',
  ].join('\n');
  const lane = makeLane('redact', redactScript);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-redact-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  const lines = [];
  await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir: chainReceipts, now: new Date().toISOString(), log: line => lines.push(line) });
  const relayed = lines.find(line => line.includes('failed at'));
  assert.ok(relayed, 'expected the step\'s stderr line to be relayed');
  assert.ok(!relayed.includes('owner'), `host path segment leaked into a relayed log line: ${relayed}`);
  assert.ok(!relayed.includes('secret'), `host path segment leaked into a relayed log line: ${relayed}`);
});

test('redactHostPathsLocal: unit coverage for all three path shapes', () => {
  assert.equal(redactHostPathsLocal('open "C:\\Users\\owner\\secret\\file.txt" failed'), 'open "file.txt" failed');
  assert.equal(redactHostPathsLocal('at \\\\host\\share\\owner\\secret.txt'), 'at secret.txt');
  assert.equal(redactHostPathsLocal('read /home/owner/private/notes.md now'), 'read notes.md now');
  assert.equal(redactHostPathsLocal(42), 42);
});

test('evaluateSuccessRule: null success_rule means the exit code alone decides', () => {
  const result = evaluateSuccessRule({ receiptsDir: os.tmpdir(), successRule: null, sinceMs: Date.now() });
  assert.equal(result.checked, false);
  assert.equal(result.success, true);
});

test('evaluateSuccessRule: a glob reaching into a per-project subdirectory (estate_graph_sync.mjs\'s own shape)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'night-chain-glob-'));
  const projectDir = path.join(dir, 'P26-014');
  writeFileSync(path.join(dir, 'P26-014.json.placeholder'), 'x'); // decoy: must not match `*/*.json`
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(path.join(projectDir, `${Date.now()}.json`), JSON.stringify({ status: 'OK' }));
  const result = evaluateSuccessRule({ receiptsDir: dir, successRule: { receipt_glob: '*/*.json', json_path: 'status', allowed_values: ['OK'] }, sinceMs: 0 });
  assert.equal(result.success, true);
  assert.equal(result.receipt_path.startsWith('P26-014/'), true);
});

test('computeStaleLockMs sums every step\'s own timeout_minutes plus the documented margin', () => {
  const ms = computeStaleLockMs([{ timeout_minutes: 10 }, { timeout_minutes: 20 }]);
  assert.equal(ms, (10 + 20) * 60 * 1000 + 30 * 60 * 1000);
});

test('nextDeadlineInstant: same semantics as voice_conversation_list_nightly.mjs\'s own function', () => {
  // 00:00 start (Seoul) + 04:00 deadline stops the same morning at 04:00 KST, i.e. 19:00Z the day before.
  assert.equal(nextDeadlineInstant('2026-01-01T00:00:00.000+09:00', '04:00'), '2025-12-31T19:00:00.000Z');
  // Equal deadline/scheduled-start is refused (would silently grant a 24h runway).
  assert.throws(() => nextDeadlineInstant('2026-01-01T00:00:00.000+09:00', '00:00', '00:00'),
    error => error.code === 'night_chain_deadline_equals_scheduled_start');
});

test('loadChainConfig rejects a config with duplicate step ids', () => {
  const lane = makeLane('dupe', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-dupe-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1'), stepOf(lane, 's1')]);
  assert.throws(() => loadChainConfig({ configPath, expectedConfigSha256: configSha256 }),
    error => error.code === 'night_chain_config_step_id_duplicate');
});

test('loadChainConfig rejects a step entry that escapes its own lane_root', () => {
  const lane = makeLane('traversal', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-traversal-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1', { entry: '../../etc/passwd' })]);
  assert.throws(() => loadChainConfig({ configPath, expectedConfigSha256: configSha256 }),
    error => error.code === 'night_chain_step_entry_traversal');
});

test('verifyStepLanes rejects a step entry that does not exist under its lane_root', () => {
  const lane = makeLane('missing-entry', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-missingentry-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1', { entry: 'nope.mjs' })]);
  const { steps } = loadChainConfig({ configPath, expectedConfigSha256: configSha256 });
  assert.throws(() => verifyStepLanes(steps), error => error.code === 'night_chain_step_entry_missing');
});

test('runNightChainCli: end-to-end happy path through the argv surface', async () => {
  const lane = makeLane('cli-happy', SUCCEED_SCRIPT);
  const chainReceipts = mkdtempSync(path.join(os.tmpdir(), 'night-chain-receipts-clihappy-'));
  const { configPath, configSha256 } = writeConfig(chainReceipts, [stepOf(lane, 's1')]);
  const { result } = await runNightChainCli(
    ['--chain-config', configPath, '--chain-config-sha256', configSha256, '--receipts', chainReceipts]);
  assert.equal(result.status, 'OK');
});
