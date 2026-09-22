// The registrar itself is PowerShell 5.1 and needs a built lane, a real Node
// path and rights to register a scheduled task to actually run end to end --
// out of scope for this repository's cross-platform node test run (its own
// header names the manual check: run it without `-Register` against a built
// lane, read the printed plan digest). What this file checks without
// executing PowerShell is the registrar's own source text -- the same
// structural-regex approach `workspace_ledgers/tests/register_workspace_
// ledgers_task.test.mjs` and the voice nightly test use -- plus a hermetic,
// Windows-gated end-to-end exit-code measurement through the actual hidden
// VBS launcher for every code `night_chain.mjs` can return.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { exitCodeFor } from '../ops/night_chain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRAR_PATH = path.join(HERE, '..', 'ops', 'register-night-chain-task.ps1');
const LAUNCHER_PATH = path.join(HERE, '..', 'ops', 'run-night-chain-hidden.vbs');

async function registrarSource() { return readFile(REGISTRAR_PATH, 'utf8'); }

test('register-night-chain-task.ps1: required parameters, the fixed task name and the default schedule are wired', async () => {
  const registrar = await registrarSource();
  for (const name of ['LaneRoot', 'LaneManifestSha256', 'NodePath', 'NodeSha256', 'ChainConfigPath', 'ChainConfigSha256', 'ReceiptsRoot']) {
    assert.match(registrar, new RegExp(`\\[Parameter\\(Mandatory = \\$true\\)\\]\\[string\\]\\$${name}`), `${name} must be mandatory`);
  }
  assert.match(registrar, /\[string\]\$TaskName = "SoulforgeNightChain"/);
  // 00:30, deliberately distinct from the 00:00 / 03:00 / 05:30 slots of the
  // standalone tasks this chain is meant to replace (see the header).
  assert.match(registrar, /\[string\]\$DailyAt = "00:30"/);
  assert.match(registrar, /if \(\$TaskName -ne "SoulforgeNightChain"\) \{ throw "night chain task name is fixed" \}/);
  assert.match(registrar, /\[CmdletBinding\(SupportsShouldProcess = \$true, ConfirmImpact = "High"\)\]/);
  assert.match(registrar, /\$PSCmdlet\.ShouldProcess\(\$TaskName, "register the hidden daily night chain task"\)/);
});

test('register-night-chain-task.ps1: lane manifest, Node and chain config digests are pinned and asserted; roots are checked disjoint', async () => {
  const registrar = await registrarSource();
  assert.match(registrar, /Value = \$LaneManifestSha256; Label = "lane manifest"/);
  assert.match(registrar, /Value = \$NodeSha256; Label = "Node"/);
  assert.match(registrar, /Value = \$ChainConfigSha256; Label = "chain config"/);
  assert.match(registrar, /if \(\$ActualLaneManifestSha256 -ne \$LaneManifestSha256\) \{ throw/);
  assert.match(registrar, /if \(\$ActualNodeSha256 -ne \$NodeSha256\) \{ throw/);
  assert.match(registrar, /if \(\$ActualChainConfigSha256 -ne \$ChainConfigSha256\) \{ throw/);
  assert.match(registrar, /Assert-DisjointPath -Left \$LaneRoot -Right \$ReceiptsRoot/);
  assert.match(registrar, /Assert-DisjointPath -Left \$LaneRoot -Right \(\[IO\.Path\]::GetDirectoryName\(\$ChainConfigPath\)\)/);
  // The two files a built lane must hold for this task to exist at all.
  assert.match(registrar, /Join-Path \$LaneRoot "guild_hall\\context_engine\\ops\\night_chain\.mjs"/);
  assert.match(registrar, /Join-Path \$LaneRoot "guild_hall\\context_engine\\ops\\run-night-chain-hidden\.vbs"/);
});

test('register-night-chain-task.ps1: the runner argument line carries the chain config pin, the receipts root and the verified Node; --deadline always brings --scheduled-start <-DailyAt>', async () => {
  const registrar = await registrarSource();
  assert.match(registrar, /"--chain-config", \$ChainConfigPath/);
  assert.match(registrar, /"--chain-config-sha256", \$ChainConfigSha256/);
  assert.match(registrar, /"--receipts", \$ReceiptsRoot/);
  assert.match(registrar, /"--node-path", \$NodePath/);
  assert.match(registrar, /\$RunnerArguments \+= @\("--deadline", \$Deadline, "--scheduled-start", \$DailyAt\)/);
  assert.match(registrar, /if \(\$Deadline -and \$Deadline -eq \$DailyAt\) \{\s*\n\s*throw "night chain -Deadline must not equal -DailyAt/);
  // Every flag the registrar emits is one the runner actually accepts (S3:
  // the runner refuses unknown flags, so a drift here would fail every
  // preflight rather than silently pass a flag through).
  const emitted = [...registrar.matchAll(/"(--[a-z-]+)"/g)].map(m => m[1]);
  const accepted = new Set(['--chain-config', '--chain-config-sha256', '--receipts', '--node-path', '--deadline', '--scheduled-start', '--dry']);
  for (const flag of emitted) assert.ok(accepted.has(flag), `registrar emits a flag the runner does not accept: ${flag}`);
});

test('register-night-chain-task.ps1: the --dry preflight captures its exit code first, under a lowered ErrorActionPreference, and gates on it', async () => {
  const registrar = await registrarSource();
  assert.match(registrar, /\$PriorErrorActionPreference = \$ErrorActionPreference/);
  assert.match(registrar, /\$ErrorActionPreference = "Continue"/);
  const lowerIndex = registrar.indexOf('$ErrorActionPreference = "Continue"');
  const callIndex = registrar.indexOf('$PreflightOutput = @(& $NodePath $Entry @RunnerArguments "--dry" 2>&1)');
  const captureIndex = registrar.indexOf('$PreflightExitCode = $LASTEXITCODE');
  const restoreIndex = registrar.indexOf('$ErrorActionPreference = $PriorErrorActionPreference');
  const gateIndex = registrar.indexOf('if ($PreflightExitCode -ne 0) {');
  assert.ok(lowerIndex >= 0 && callIndex > lowerIndex, 'preflight must run after lowering ErrorActionPreference');
  assert.ok(captureIndex > callIndex, '$LASTEXITCODE must be captured right after the call');
  assert.ok(restoreIndex > captureIndex && gateIndex > restoreIndex, 'restore, then gate on the captured code');
  assert.match(registrar, /throw "night chain dry preflight failed \(exit \$PreflightExitCode\)/);
});

test('register-night-chain-task.ps1: daily calendar trigger, PT8H limit, plan-digest gate, XML attestation and rollback-on-failure are wired', async () => {
  const registrar = await registrarSource();
  assert.match(registrar, /\$Trigger = New-ScheduledTaskTrigger -Daily -At \$DailyAtBoundary/);
  assert.match(registrar, /if \(\$DailyAtBoundary -le \(Get-Date\)\) \{ \$DailyAtBoundary = \$DailyAtBoundary\.AddDays\(1\) \}/);
  assert.match(registrar, /-MultipleInstances IgnoreNew -ExecutionTimeLimit \(New-TimeSpan -Hours 8\)/);
  assert.match(registrar, /execution_time_limit = "PT8H"/);
  assert.match(registrar, /LogonType Interactive -RunLevel Limited/);
  assert.match(registrar, /schema_version = "soulforge\.night_chain_task\.plan\.v1"/);
  assert.match(registrar, /chain_config_sha256 = \$ChainConfigSha256/);
  assert.match(registrar, /if \(-not \$ExpectedDryRunDigest -or \$ExpectedDryRunDigest -ne \$PlanDigest\) \{\s*\n\s*throw/);
  assert.match(registrar, /the registered night chain task failed exported XML attestation/);
  assert.match(registrar, /the prior definition was restored or the new task removed/);
  assert.match(registrar, /night chain registration failed and rollback failed; the task was disabled/);
  assert.match(registrar, /replacing the existing night chain task requires its exact SHA-256/);
});

test('register-night-chain-task.ps1: exit-code propagation tail is present and not expanded at registration time', async () => {
  const registrar = await registrarSource();
  assert.match(registrar, /\+ '; if \(\$null -eq \$LASTEXITCODE\) \{ exit 1 \}; exit \$LASTEXITCODE'/);
  const tailLine = registrar.split('\n').find(line => line.includes('if ($null -eq $LASTEXITCODE)'));
  assert.ok(tailLine, 'exit-code tail line not found');
  assert.equal(tailLine.trim().startsWith("+ '"), true, 'the tail must be a single-quoted literal, not interpolated');
  assert.match(registrar, /action_sha256 = Get-Sha256Text -Value \(\$WScriptExe \+ "`n" \+ \$HiddenActionArgumentLine\)/);
});

test('register-night-chain-task.ps1: PowerShell 5.1 compatible (no &&, no ternary), ASCII only, no BOM', async () => {
  const registrar = await registrarSource();
  assert.equal(/&&/u.test(registrar), false, 'PowerShell 5.1 has no && chain operator');
  assert.equal(/\s\?\s/u.test(registrar), false, 'PowerShell 5.1 has no ternary operator');
  assert.notEqual(registrar.codePointAt(0), 0xFEFF, 'no BOM (pure-ASCII file)');
  for (let index = 0; index < registrar.length; index += 1) {
    const code = registrar.codePointAt(index);
    if (code > 127) assert.fail(`non-ASCII character at offset ${index} (code point ${code})`);
  }
});

// ---------------------------------------------------------- launcher source
test('run-night-chain-hidden.vbs: relays argv only, records no lane values of its own', async () => {
  const source = await readFile(LAUNCHER_PATH, 'utf8');
  assert.match(source, /shell\.Run\(command, 0, True\)/);
  assert.match(source, /WScript\.Quit exitCode/);
  assert.match(source, /If arguments\.Count < 2 Then\s*\r?\n\s*WScript\.Quit 64/);
  assert.equal(source.includes('night_chain.mjs'), false, 'the launcher must not name the lane entry -- it only relays argv');
  assert.equal(source.includes('--chain-config'), false, 'the launcher must not carry runner flags');
});

// --------------------------------------------- Windows end-to-end exit code
// Ported from the sibling registrars' own hermetic measurement: drives
// wscript.exe exactly as Task Scheduler would, using the SAME $CommandScript
// construction as the real registrar, for every code night_chain.mjs's own
// `exitCodeFor` can return -- 5 (CONFIG_INVALID), 6 (PARTIAL) and 7
// (NOTHING_TO_RUN) included, since none of the sibling launchers were ever
// measured past 4.
test('night chain launcher: exit-code propagation, measured live through the real hidden VBS launcher',
  { skip: process.platform !== 'win32' }, async t => {
    const { spawnSync } = await import('node:child_process');
    const convertToSingleQuotedLiteral = value => `'${value.replaceAll("'", "''")}'`;
    const convertToTaskArgument = value => {
      if (value.includes('"')) throw new Error('task argument contains an unsupported quote character');
      if (!/\s/.test(value)) return value;
      return `"${value.replace(/(\\+)$/, '$1$1')}"`;
    };
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) { t.skip('no Windows system root in env; nothing to measure'); return; }
    const powershellExe = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const wscriptExe = path.join(systemRoot, 'System32', 'wscript.exe');
    if (!existsSync(powershellExe) || !existsSync(wscriptExe)) { t.skip('not this Windows layout; nothing to measure'); return; }

    const scratch = await mkdtemp(path.join(tmpdir(), 'night-chain-launcher-'));
    const codes = ['OK', 'FAILED', 'LOCK_HELD', 'SKIPPED_PAST_DEADLINE', 'PARTIAL', 'NOTHING_TO_RUN'].map(exitCodeFor).concat([5]);
    const scriptFor = code => path.join(scratch, `exit-${code}.mjs`);
    for (const code of codes) await writeFile(scriptFor(code), `process.exitCode = ${code};\n`);

    const runThrough = (nodePath, entryPath) => {
      const commandScript = `& ${convertToSingleQuotedLiteral(nodePath)} ${convertToSingleQuotedLiteral(entryPath)}`
        + '; if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE';
      const argLine = ['//B', '//NoLogo', LAUNCHER_PATH, powershellExe,
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
        '-Command', commandScript].map(convertToTaskArgument);
      return spawnSync(wscriptExe, argLine, { timeout: 30000, windowsHide: true, encoding: 'utf8', windowsVerbatimArguments: true });
    };

    for (const code of codes) {
      const run = runThrough(process.execPath, scriptFor(code));
      const measured = run.status; // captured before any assertion message touches it
      assert.equal(measured, code, `exit ${code} must reach wscript unchanged`);
    }
    const missing = runThrough(path.join(scratch, 'does-not-exist-node.exe'), scriptFor(0));
    assert.notEqual(missing.status, 0, 'a node launch failure must never propagate as a clean exit 0');
  });
