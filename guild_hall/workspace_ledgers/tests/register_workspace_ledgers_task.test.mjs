// The registrar itself is PowerShell 5.1 and needs a built lane, a real Node
// path and elevated-enough rights to register a scheduled task to actually
// run end to end -- out of scope for this repository's cross-platform node
// test run (see `ops/register-workspace-ledgers-task.ps1`'s own header for
// the manual check: run it without `-Register` against a built lane and real
// paths, read the printed plan digest). What this file checks without
// executing PowerShell is the registrar's own source text -- the same
// structural-regex approach the sibling voice/graph-sync registrar tests use
// -- plus a real, hermetic, Windows-gated end-to-end exit-code measurement
// through the actual hidden VBS launcher.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRAR_PATH = path.join(HERE, '..', 'ops', 'register-workspace-ledgers-task.ps1');
const LAUNCHER_PATH = path.join(HERE, '..', 'ops', 'run-workspace-ledgers-hidden.vbs');

async function registrarSource() { return readFile(REGISTRAR_PATH, 'utf8'); }

test('register-workspace-ledgers-task.ps1: required parameters and the fixed task name/default schedule are wired', async () => {
  const registrar = await registrarSource();
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$LaneRoot/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$LaneManifestSha256/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$NodePath/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$NodeSha256/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$WorkspacesRoot/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$WorkmetaRoot/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$OrgConfigPath/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$OrgConfigSha256/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$HiworksEventsPath/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$GmailSentEventsPath/);
  assert.match(registrar, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$ReceiptsRoot/);
  assert.match(registrar, /\[string\]\$TaskName = "SoulforgeWorkspaceLedgers"/);
  assert.match(registrar, /\[string\]\$DailyAt = "05:30"/);
  assert.match(registrar, /if \(\$TaskName -ne "SoulforgeWorkspaceLedgers"\) \{ throw "workspace ledgers daily task name is fixed" \}/);
});

test('register-workspace-ledgers-task.ps1: digests are pinned and asserted, and roots are checked disjoint', async () => {
  const registrar = await registrarSource();
  // Lane manifest, Node, and the org config are each hashed and compared
  // against the caller-supplied digest before anything else happens.
  assert.match(registrar, /Value = \$LaneManifestSha256; Label = "lane manifest"/);
  assert.match(registrar, /Value = \$NodeSha256; Label = "Node"/);
  assert.match(registrar, /Value = \$OrgConfigSha256; Label = "org config"/);
  assert.match(registrar, /if \(\$ActualLaneManifestSha256 -ne \$LaneManifestSha256\) \{ throw/);
  assert.match(registrar, /if \(\$ActualNodeSha256 -ne \$NodeSha256\) \{ throw/);
  assert.match(registrar, /if \(\$ActualOrgConfigSha256 -ne \$OrgConfigSha256\) \{ throw/);

  // The lane root must never overlap the receipts root or either data root,
  // and the receipts root must never overlap the workspaces/workmeta roots
  // either -- a receipt/lock write must never land inside the plane it read.
  assert.match(registrar, /Assert-DisjointPath -Left \$LaneRoot -Right \$ReceiptsRoot/);
  assert.match(registrar, /Assert-DisjointPath -Left \$LaneRoot -Right \$WorkspacesRoot/);
  assert.match(registrar, /Assert-DisjointPath -Left \$LaneRoot -Right \$WorkmetaRoot/);
  assert.match(registrar, /Assert-DisjointPath -Left \$ReceiptsRoot -Right \$WorkspacesRoot/);
  assert.match(registrar, /Assert-DisjointPath -Left \$ReceiptsRoot -Right \$WorkmetaRoot/);
});

test('register-workspace-ledgers-task.ps1: the daily-runner argument line passes --org-config-sha256 and never allowDegradedOwnerTables', async () => {
  const registrar = await registrarSource();
  assert.match(registrar, /"--workspaces-root", \$WorkspacesRoot/);
  assert.match(registrar, /"--workmeta-root", \$WorkmetaRoot/);
  assert.match(registrar, /"--org-config", \$OrgConfigPath/);
  assert.match(registrar, /"--org-config-sha256", \$OrgConfigSha256/);
  assert.match(registrar, /"--hiworks-events", \$HiworksEventsPath/);
  assert.match(registrar, /"--gmail-sent-events", \$GmailSentEventsPath/);
  assert.match(registrar, /"--receipts", \$ReceiptsRoot/);
  assert.equal(registrar.includes('allow-degraded-owner-tables'), false,
    'the registrar must never pass --allow-degraded-owner-tables through to the daily runner');
  // Preflight: the entry point run once with --dry, gating registration on exit 0.
  assert.match(registrar, /& \$NodePath \$Entry @DailyArguments "--dry" 2>&1/);
  assert.match(registrar, /if \(\$LASTEXITCODE -ne 0\) \{\s*\n\s*throw "workspace ledgers daily dry preflight failed/);
});

test('register-workspace-ledgers-task.ps1: daily calendar trigger, plan-digest gate, and rollback-on-failure are wired', async () => {
  const registrar = await registrarSource();
  assert.match(registrar, /\$Trigger = New-ScheduledTaskTrigger -Daily -At \$DailyAtBoundary/);
  assert.match(registrar, /-MultipleInstances IgnoreNew/);
  assert.match(registrar, /LogonType Interactive -RunLevel Limited/);
  assert.match(registrar, /if \(-not \$ExpectedDryRunDigest -or \$ExpectedDryRunDigest -ne \$PlanDigest\) \{\s*\n\s*throw/);
  assert.match(registrar, /the registered workspace ledgers daily task failed exported XML attestation/);
  assert.match(registrar, /the prior definition was restored or the new task removed/);
});

test('register-workspace-ledgers-task.ps1: exit-code propagation tail is present and not expanded at registration time', async () => {
  const registrar = await registrarSource();
  // The exact same R1/R1a-ported fragment the voice registrar's own test
  // pins: `&` alone does not propagate a native command's exit code through
  // `powershell.exe -Command`, and a bare `exit $LASTEXITCODE` reports a
  // node *launch* failure (missing/renamed node.exe) as a clean exit 0
  // because `&` never even sets `$LASTEXITCODE` when nothing ran.
  assert.match(registrar,
    /\+ '; if \(\$null -eq \$LASTEXITCODE\) \{ exit 1 \}; exit \$LASTEXITCODE'/);
  // The fragment is a single-quoted (unexpanded) PowerShell literal in the
  // SOURCE text -- it must reach the generated $CommandScript verbatim, not
  // as an already-interpolated value computed at registrar-authoring time.
  // (No `$(...)`/double-quote interpolation wraps this specific literal.)
  const tailLine = registrar.split('\n').find(line => line.includes('if ($null -eq $LASTEXITCODE)'));
  assert.ok(tailLine, 'exit-code tail line not found');
  assert.equal(tailLine.trim().startsWith("+ '"), true, 'the tail must be a single-quoted literal, not interpolated');
  assert.match(registrar, /action_sha256 = Get-Sha256Text -Value \(\$WScriptExe \+ "`n" \+ \$HiddenActionArgumentLine\)/);
});

test('register-workspace-ledgers-task.ps1: PowerShell 5.1 compatible (no &&, no ternary) and ASCII only', async () => {
  const registrar = await registrarSource();
  assert.equal(/&&/u.test(registrar), false, 'PowerShell 5.1 has no && chain operator');
  assert.equal(/\?[^:]*:/u.test(registrar) && /\s\?\s/u.test(registrar), false, 'PowerShell 5.1 has no ternary operator');
  // ASCII only (the brief's own requirement) -- every character code point
  // must be below 128.
  for (let index = 0; index < registrar.length; index += 1) {
    const code = registrar.codePointAt(index);
    if (code > 127) assert.fail(`non-ASCII character at offset ${index} (code point ${code})`);
  }
});

// ---------------------------------------------------------- launcher source
test('run-workspace-ledgers-hidden.vbs: relays argv only, records no lane values of its own', async () => {
  const source = await readFile(LAUNCHER_PATH, 'utf8');
  assert.match(source, /shell\.Run\(command, 0, True\)/);
  assert.match(source, /WScript\.Quit exitCode/);
  assert.equal(source.includes('workspace_ledgers'), false, 'the launcher must not name the lane -- it only relays argv');
});

// --------------------------------------------- Windows end-to-end exit code
// R1-shaped (ported from the voice registrar's own hermetic measurement):
// drives wscript.exe exactly as Task Scheduler would, using the SAME
// $CommandScript construction as the real registrar (mirrored here in JS so
// this test measures the actual mechanism, not just a source regex).
test('workspace ledgers daily launcher: exit-code propagation, measured live through the real hidden VBS launcher',
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
    if (!existsSync(powershellExe) || !existsSync(wscriptExe)) {
      t.skip('not this Windows layout; nothing to measure'); return;
    }

    const scratch = await mkdtemp(path.join(tmpdir(), 'wl-launcher-'));
    const scriptFor = code => path.join(scratch, `exit-${code}.mjs`);
    await writeFile(scriptFor(0), 'process.exitCode = 0;\n');
    await writeFile(scriptFor(2), 'process.exitCode = 2;\n');
    await writeFile(scriptFor(3), 'process.exitCode = 3;\n');
    await writeFile(scriptFor(4), 'process.exitCode = 4;\n');

    const runThrough = (nodePath, entryPath) => {
      const commandScript = `& ${convertToSingleQuotedLiteral(nodePath)} ${convertToSingleQuotedLiteral(entryPath)}`
        + '; if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE';
      const argLine = ['//B', '//NoLogo', LAUNCHER_PATH, powershellExe,
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
        '-Command', commandScript].map(convertToTaskArgument);
      return spawnSync(wscriptExe, argLine,
        { timeout: 30000, windowsHide: true, encoding: 'utf8', windowsVerbatimArguments: true });
    };

    const nodePath = process.execPath; // this same test's own node.exe -- real, always present
    assert.equal(runThrough(nodePath, scriptFor(0)).status, 0);
    assert.equal(runThrough(nodePath, scriptFor(2)).status, 2);
    assert.equal(runThrough(nodePath, scriptFor(3)).status, 3);
    assert.equal(runThrough(nodePath, scriptFor(4)).status, 4);

    const missing = runThrough(path.join(scratch, 'does-not-exist-node.exe'), scriptFor(0));
    assert.notEqual(missing.status, 0, 'a node launch failure must never propagate as a clean exit 0');
  });
