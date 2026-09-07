// Candidate-only Pack rehearsal. All installed generations, damaged fixtures,
// test homes and receipts belong to one newly-created, non-operational root.
// This is code-payload evidence; it cannot accept a physical seat or runtime DR.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPack, installPack, loadPackSpec, nodeTestRunner, recomputePackDigest, runInstalledSmoke, verifyInstalledCopy } from "./build_pack.mjs";
import { backupPack, parseVerifiedManifest, restorePack, rollbackPack, upgradePack } from "./pack_lifecycle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const RELEASE_PACKS = Object.freeze(["hpp_server_pack", "team_client_pack", "backup_recovery_extension"]);
const EMITTERS = { hpp_server_pack: "emit_hpp_spec.mjs", team_client_pack: "emit_team_client_spec.mjs", backup_recovery_extension: "emit_backup_recovery_spec.mjs" };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
function fail(code) { throw Object.assign(new Error(code), { code }); }
const within = (root, path) => { const rel = relative(root, path); return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel); };

function assertNoLinks(path) {
  if (lstatSync(path).isSymbolicLink()) fail("rehearsal_link_refused");
  if (lstatSync(path).isDirectory()) for (const name of readdirSync(path)) assertNoLinks(join(path, name));
}

export function createReleaseWorkspace({ rootDir = ROOT, workDir = null } = {}) {
  const target = resolve(workDir ?? join(tmpdir(), "soulforge-release-rehearsal-"));
  if (target === resolve(rootDir) || within(resolve(rootDir), target)
    || /(?:^|[\\/])(?:install|source-lanes|private-state|_workspaces|_workmeta)(?:[\\/]|$)/i.test(target)) fail("rehearsal_workdir_unsafe");
  if (workDir !== null && existsSync(target)) fail("rehearsal_workdir_not_fresh");
  // Never follow a caller-supplied junction into an existing runtime tree.
  let ancestor = dirname(target);
  while (true) {
    if (!existsSync(ancestor) || lstatSync(ancestor).isSymbolicLink()) fail("rehearsal_parent_unsafe");
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (workDir === null) return mkdtempSync(target);
  mkdirSync(target);
  return target;
}

export function buildReleaseTestEnv(workDir) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(PATH|SystemRoot|WINDIR|ComSpec|PATHEXT|OS|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(key)) env[key] = value;
  }
  // Windows native known-folder APIs derive AppData from USERPROFILE and may
  // return an empty LocalApplicationData path if that directory is absent.
  // Merely setting LOCALAPPDATA to a sibling is insufficient for PowerShell;
  // an empty native path makes its module cache relative to the payload cwd.
  const roaming = join(workDir, "home", "AppData", "Roaming");
  const local = join(workDir, "home", "AppData", "Local");
  for (const child of [roaming, local, ...["tmp", "state", "owner", "codex"].map((name) => join(workDir, name))]) mkdirSync(child, { recursive: true });
  Object.assign(env, {
    HOME: join(workDir, "home"), USERPROFILE: join(workDir, "home"), APPDATA: roaming, LOCALAPPDATA: local,
    TMP: join(workDir, "tmp"), TEMP: join(workDir, "tmp"), TMPDIR: join(workDir, "tmp"),
    SOULFORGE_STATE_ROOT: join(workDir, "state"), SOULFORGE_OWNER_ROOT: join(workDir, "owner"), CODEX_HOME: join(workDir, "codex"),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(workDir, "home", ".gitconfig"), CI: "1",
  });
  return env;
}

export function releaseSmokeVerdict(run, excluded = []) {
  const c = run?.counts;
  if (!run?.ok) return { ok: false, reason: run?.error_code ?? "test_process_failed" };
  if (!c || ["tests", "pass", "fail", "cancelled", "skipped", "todo"].some((key) => !Number.isSafeInteger(c[key]))) return { ok: false, reason: "test_totals_unobserved" };
  if (c.tests === 0 || c.fail || c.cancelled || c.todo || c.tests !== c.pass + c.skipped) return { ok: false, reason: "test_totals_not_complete" };
  if (c.skipped || excluded.length) return { ok: false, reason: "unsupported_declared_smoke_coverage" };
  return { ok: true, reason: null };
}

// Readback recomputes both the manifest identity and every actual file hash.
export function verifyReleaseGeneration(targetDir, previous = false) {
  const payload = join(targetDir, previous ? "payload.prev" : "payload");
  assertNoLinks(payload);
  const manifestPath = join(targetDir, previous ? "pack.manifest.prev.json" : "pack.manifest.json");
  assertNoLinks(manifestPath);
  const manifest = parseVerifiedManifest(manifestPath, "rehearsal_manifest_invalid");
  const verdict = verifyInstalledCopy(manifest, payload);
  if (!verdict.ok) throw Object.assign(new Error("rehearsal_generation_mismatch"), { code: "rehearsal_generation_mismatch", mismatches: verdict.mismatches });
  return { pack_digest: manifest.pack_digest, files: manifest.files.length, manifest_sha256: sha(readFileSync(manifestPath)) };
}

export function exerciseReleaseLifecycle({ packDir, workDir, clock }) {
  const targetDir = join(workDir, "lifecycle-target");
  const priorDir = join(workDir, "synthetic-prior");
  const backupDir = join(workDir, "backup");
  for (const path of [packDir, targetDir, priorDir, backupDir]) {
    if (!within(workDir, path)) fail("rehearsal_lifecycle_path_escapes");
  }
  assertNoLinks(workDir);
  if ([targetDir, priorDir, backupDir].some(existsSync)) fail("rehearsal_lifecycle_target_not_fresh");
  const current = verifyReleaseGeneration(packDir);
  // A distinct, explicitly synthetic previous generation exercises actual
  // byte transitions without inventing a historical release or editing source.
  mkdirSync(priorDir);
  cpSync(join(packDir, "payload"), join(priorDir, "payload"), { recursive: true });
  const priorManifest = JSON.parse(readFileSync(join(packDir, "pack.manifest.json"), "utf8"));
  const file = priorManifest.files.find((entry) => /\.mjs$/.test(entry.path));
  if (!file) fail("rehearsal_fixture_source_missing");
  const fixturePath = join(priorDir, "payload", ...file.path.split("/"));
  const fixtureBytes = Buffer.concat([readFileSync(fixturePath), Buffer.from("\n// Isolated previous-generation lifecycle fixture.\n")]);
  writeFileSync(fixturePath, fixtureBytes);
  file.sha256 = sha(fixtureBytes); file.bytes = fixtureBytes.length;
  priorManifest.pack_digest = recomputePackDigest(priorManifest.files);
  writeJson(join(priorDir, "pack.manifest.json"), priorManifest);
  // Do not copy candidate/build receipts: those describe the original bytes.
  writeJson(join(priorDir, "release.candidate.json"), { status: "synthetic_fixture_only", derived_from_digest: current.pack_digest });
  writeJson(join(priorDir, "fixture.receipt.json"), { kind: "synthetic_previous_generation", derived_from_digest: current.pack_digest, changed_path: file.path, changed_sha256: file.sha256 });
  const prior = verifyReleaseGeneration(priorDir);
  if (prior.pack_digest === current.pack_digest) fail("rehearsal_generations_not_distinct");
  installPack({ packDir: priorDir, targetDir, clock });
  backupPack({ targetDir, backupDir, clock });
  const backup = verifyReleaseGeneration(backupDir);
  upgradePack({ packDir, targetDir, clock });
  const upgraded = verifyReleaseGeneration(targetDir);
  const retainedAfterUpgrade = verifyReleaseGeneration(targetDir, true);
  if (upgraded.pack_digest !== current.pack_digest || retainedAfterUpgrade.pack_digest !== prior.pack_digest) fail("rehearsal_upgrade_readback_failed");
  rollbackPack({ targetDir, clock });
  const rolledBack = verifyReleaseGeneration(targetDir);
  const retainedAfterRollback = verifyReleaseGeneration(targetDir, true);
  if (rolledBack.pack_digest !== prior.pack_digest || retainedAfterRollback.pack_digest !== current.pack_digest) fail("rehearsal_rollback_readback_failed");
  writeFileSync(join(targetDir, "payload", ...file.path.split("/")), "deliberately damaged isolated fixture\n");
  writeFileSync(join(targetDir, "pack.manifest.json"), "invalid isolated fixture\n");
  restorePack({ targetDir, backupDir, clock });
  const restored = verifyReleaseGeneration(targetDir);
  if (restored.pack_digest !== backup.pack_digest || existsSync(join(targetDir, "pack.manifest.prev.json"))) fail("rehearsal_restore_readback_failed");
  if (verifyReleaseGeneration(packDir).pack_digest !== current.pack_digest || verifyReleaseGeneration(backupDir).pack_digest !== backup.pack_digest) fail("rehearsal_source_mutated");
  const damagedRetained = readFileSync(join(targetDir, "payload.prev", ...file.path.split("/")), "utf8") === "deliberately damaged isolated fixture\n";
  if (!damagedRetained) fail("rehearsal_damaged_previous_missing");
  return { ok: true, baseline_kind: "synthetic_previous_from_current_candidate", current, prior, backup, upgraded, retained_after_upgrade: retainedAfterUpgrade, rolled_back: rolledBack, retained_after_rollback: retainedAfterRollback, restored, damaged_previous_retained_without_manifest: true };
}

export async function runReleaseRehearsal({ rootDir = ROOT, workDir = null, packIds = RELEASE_PACKS, clock = () => new Date().toISOString(), onProgress = () => {} } = {}) {
  if (!packIds.length || new Set(packIds).size !== packIds.length || packIds.some((id) => !RELEASE_PACKS.includes(id))) fail("rehearsal_pack_selection_invalid");
  const workspace = createReleaseWorkspace({ rootDir, workDir });
  const env = buildReleaseTestEnv(workspace);
  const git = (args) => spawnSync("git", args, { cwd: rootDir, encoding: "utf8", windowsHide: true });
  const head = git(["rev-parse", "HEAD"]);
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
  const receipt = {
    receipt: "isolated_pack_release_rehearsal", release_state: "candidate", ok: false, started_at: clock(),
    source: { commit: head.status === 0 ? head.stdout.trim() : null, working_tree_dirty: dirty.status === 0 ? dirty.stdout.length > 0 : null },
    platform: process.platform, node_version: process.version, packs: [],
    authority: { release_promoted: false, operational_lane_touched: false, physical_acceptance: "not_executed", manual_exercises: "not_executed", runtime_data_restore: "not_executed" },
    isolation: { writes: "fresh_rehearsal_root_and_test_temp_roots", process_environment: "allowlisted_os_values_and_isolated_homes", outside_filesystem_observation: "not_claimed" },
    ladder_note: "out_of_ladder_evidence: candidate rehearsal cannot replace physical or Human acceptance",
  };
  const receiptPath = join(workspace, "release-rehearsal.receipt.json");
  writeJson(receiptPath, receipt);
  for (const packId of packIds) {
    const result = { pack_id: packId, ok: false, stages: {} };
    receipt.packs.push(result);
    const packRoot = join(workspace, packId); mkdirSync(packRoot);
    try {
      const specPath = join(rootDir, "guild_hall/deployment_pack/packs", `${packId}.spec.json`);
      const spec = loadPackSpec(specPath);
      result.spec = { path: relative(rootDir, specPath).split(sep).join("/"), sha256: sha(readFileSync(specPath)), files: Object.values(spec.content_roles).flat().length, source_smoke_entries: spec.smoke_test_entries.length, installed_smoke_entries: (spec.installed_smoke_entries ?? spec.smoke_test_entries).length, exclusions: spec.installed_smoke_excluded ?? [] };
      onProgress(`${packId}: checking current spec`);
      const checked = spawnSync(process.execPath, [join(rootDir, "guild_hall/deployment_pack/tools", EMITTERS[packId]), "--check"], { cwd: rootDir, env, encoding: "utf8", windowsHide: true, timeout: 60_000 });
      result.stages.spec_current = { ok: checked.status === 0, exit_code: checked.status };
      writeFileSync(join(packRoot, "spec-check.log"), `${checked.stdout ?? ""}${checked.stderr ?? ""}`);
      if (checked.status !== 0) fail("rehearsal_spec_not_current");
      const observedRunner = (phase) => (entries, options) => {
        onProgress(`${packId}: ${phase} (${entries.length} entries)`);
        const run = nodeTestRunner(entries, { ...options, env: { ...env, ...(phase === "installed_smoke" ? { GIT_CEILING_DIRECTORIES: workspace } : {}) } });
        writeFileSync(join(packRoot, `${phase}.tap`), run.stdout);
        writeFileSync(join(packRoot, `${phase}.stderr.log`), run.stderr);
        const { stdout, stderr, ...summary } = run;
        result.stages[phase] = { ...summary, entries: [...entries], coverage: releaseSmokeVerdict(run, phase === "installed_smoke" ? result.spec.exclusions : []) };
        writeJson(receiptPath, receipt);
        return run;
      };
      const built = buildPack(specPath, { rootDir, outDir: join(packRoot, "build"), clock, runner: observedRunner("source_unit") });
      result.candidate = { pack_digest: built.manifest.pack_digest, files: built.manifest.files.length, status: built.candidate.status, claimed_gate: built.candidate.claimed_gate, manifest_sha256: sha(readFileSync(join(built.packDir, "pack.manifest.json"))) };
      if (result.candidate.files !== result.spec.files || result.spec.sha256 !== sha(readFileSync(specPath)) || built.manifest.files.some((file) => sha(readFileSync(join(rootDir, ...file.path.split("/")))) !== file.sha256)) fail("rehearsal_source_changed_during_build");
      const targetDir = join(packRoot, "installed");
      installPack({ packDir: built.packDir, targetDir, clock });
      result.stages.install = { ok: true, ...verifyReleaseGeneration(targetDir) };
      runInstalledSmoke({ payloadDir: join(targetDir, "payload"), entries: spec.installed_smoke_entries ?? spec.smoke_test_entries, testCwd: spec.test_cwd, concurrency: spec.test_concurrency, clock, runner: observedRunner("installed_smoke") });
      try {
        result.stages.installed_payload_readback = { ok: true, ...verifyReleaseGeneration(targetDir) };
      } catch (error) {
        result.stages.installed_payload_readback = { ok: false, error_code: error.code ?? "installed_payload_readback_failed", mismatches: error.mismatches ?? [] };
      }
      if (packId === "hpp_server_pack") {
        onProgress(`${packId}: loopback start/stop`);
        // Preserve smoke pollution as failed evidence. The independent process
        // proof starts from a fresh install of the same verified build digest.
        const startTarget = join(packRoot, "start-stop-installed");
        installPack({ packDir: built.packDir, targetDir: startTarget, clock });
        // proveStartStop owns its child environment. Temporarily pass only
        // allowlisted OS values and the same isolated home/state roots.
        const probe = spawnSync(process.execPath, [join(rootDir, "guild_hall/deployment_pack/tools/prove_start_stop.mjs"), "--target", startTarget], { cwd: packRoot, env, encoding: "utf8", windowsHide: true, timeout: 120_000 });
        writeFileSync(join(packRoot, "start-stop.log"), `${probe.stdout ?? ""}${probe.stderr ?? ""}`);
        result.stages.start_stop = probe.status === 0 ? { ...JSON.parse(readFileSync(join(startTarget, "start_stop.receipt.json"), "utf8")), target_kind: "independent_clean_install_from_same_candidate" } : { ok: false, exit_code: probe.status, error_code: probe.error?.code ?? "start_stop_failed" };
      }
      onProgress(`${packId}: backup, upgrade, rollback and damaged-target restore`);
      result.stages.lifecycle = exerciseReleaseLifecycle({ packDir: built.packDir, workDir: packRoot, clock });
      result.ok = result.stages.source_unit.coverage.ok && result.stages.installed_smoke.coverage.ok && result.stages.installed_payload_readback.ok && (packId !== "hpp_server_pack" || result.stages.start_stop.ok === true);
      if (!result.ok) result.failure = "incomplete_or_unsupported_rehearsal_evidence";
    } catch (error) { result.failure = error.code ?? "rehearsal_failed"; }
    writeJson(receiptPath, receipt);
  }
  receipt.ok = receipt.packs.every((pack) => pack.ok);
  receipt.completed_at = clock();
  writeJson(receiptPath, receipt);
  return { ok: receipt.ok, workDir: workspace, receiptPath, receipt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write("usage: node release_rehearsal.mjs [--work-dir <nonexistent-directory>] [--pack hpp_server_pack|team_client_pack|backup_recovery_extension]\nDefault: all three current specs, real source and installed suites, candidate-only receipts in a retained temporary directory. A skipped test or file exclusion makes the rehearsal fail.\n");
  } else {
    let workDir = null; const packIds = [];
    try {
      for (let index = 0; index < args.length; index += 2) {
        if (!args[index + 1] || !["--work-dir", "--pack"].includes(args[index])) fail("rehearsal_arguments_invalid");
        if (args[index] === "--work-dir") { if (workDir !== null) fail("rehearsal_arguments_invalid"); workDir = args[index + 1]; }
        else packIds.push(args[index + 1]);
      }
      const out = await runReleaseRehearsal({ workDir, ...(packIds.length ? { packIds } : {}), onProgress: (message) => process.stdout.write(`${message}\n`) });
      process.stdout.write(`${out.ok ? "PASS" : "HOLD"}: ${out.receiptPath}\n`);
      process.exitCode = out.ok ? 0 : 1;
    } catch (error) { process.stderr.write(`${error.code ?? "rehearsal_failed"}\n`); process.exitCode = 1; }
  }
}
