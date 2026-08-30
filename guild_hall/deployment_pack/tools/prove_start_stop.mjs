// Isolated start/stop proof for an INSTALLED hpp_server_pack copy.
//
// The hpp initial release gate reads "isolated install/start/stop/smoke/
// upgrade/rollback/restore proof". install and smoke already leave
// out-of-ladder receipts; this tool adds the start/stop leg:
//
//   1. PRE-GATE: full byte verification of the installed copy through the
//      hardened pack reader (every manifest entry hashed, digest RECOMPUTED
//      — a tampered or digest-doctored target refuses before any boot).
//   2. START the packed server from inside payload/ on an EPHEMERAL port,
//      with every writable path redirected under <target>/runtime_probe/
//      (payload stays byte-clean by construction), codex bridge forced to
//      "mock" (nothing external can spawn), TLS off, autosync off.
//   3. HEALTH: poll /api/health until ready and demand the server's own
//      attested source identity be the 64-hex pack digest EQUAL to the
//      pre-gate digest — the env->git->pack ladder proven LIVE server-side
//      (a 40-hex git identity inside an installed copy is a failure).
//   4. STOP: terminate the child, demand observed exit and that the port is
//      actually released.
//   5. POST-GATE: two-way verifyInstalledCopy over the whole payload — the
//      server ran and stopped leaving all packed bytes EXACTLY as installed
//      (any write into payload fails the proof).
//
// Out-of-ladder evidence only: the receipt never claims the start ladder
// gate. The probe process is transient — nothing is registered, scheduled,
// or left running; the ephemeral port can never be the reserved runtime
// port. <target>/runtime_probe/ is cleared per run (probe scratch only —
// receipts and payload are never touched by the clear).
//
//   node guild_hall/deployment_pack/tools/prove_start_stop.mjs --target <installed-target-dir>

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyInstalledCopy } from "./build_pack.mjs";
import { readPackSourceIdentity } from "../../../ui-workspace/apps/dev-erp/src/pack_source_identity.mjs";

const APP_REL = "ui-workspace/apps/dev-erp";
const PACK_DIGEST_HEX = /^[a-f0-9]{64}$/;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

// Every writable surface the server would otherwise place under its app
// directory (inside payload/) is redirected under probeDir, and the codex
// bridge is pinned to "mock" so the probe can never launch anything
// external. The env is NEUTRALIZED, not inherited: every DEV_ERP_* value
// from the calling shell is stripped before the pins are applied — an
// inherited DEV_ERP_SOURCE_COMMIT would short-circuit the env->git->pack
// ladder and mask the very identity this proof observes, and inherited
// opt-ins (morning brief, mail collectors, fixtures, file IO) would smear
// the isolation claim. GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE are stripped
// and GIT_CEILING_DIRECTORIES is pinned to the target so a dev shell's git
// context can never make the installed copy attest a 40-hex git identity:
// the ladder's pack rung is reached deterministically.
export function buildProbeEnv({ probeDir, targetDir = null, baseEnv = {} }) {
  const env = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (key.startsWith("DEV_ERP_")) continue;
    if (key === "GIT_DIR" || key === "GIT_WORK_TREE" || key === "GIT_INDEX_FILE") continue;
    env[key] = value;
  }
  if (targetDir !== null) env.GIT_CEILING_DIRECTORIES = targetDir;
  env.DEV_ERP_AUTOSYNC = "0";
  env.DEV_ERP_NO_TLS = "1";
  env.DEV_ERP_CODEX_TASK_BRIDGE = "mock";
  env.DEV_ERP_BACKEND_ROOT = join(probeDir, "backend");
  env.DEV_ERP_CODEX_HOME = join(probeDir, "codex-home");
  env.DEV_ERP_CODEX_WORKSPACE_REGISTRY = join(probeDir, "codex-workspaces.runtime.json");
  return env;
}

// The started server must attest EXACTLY the installed pack's identity:
// a 64-hex source_commit equal to the pre-gate's recomputed pack digest.
// A 40-hex value here would mean the installed copy answered with a git
// identity — impossible for a genuine installed pack, so it fails.
export function assertStartHealth(health, expectedPackDigest) {
  // /api/health carries the runtime attestation as an `attestation` object
  // whose source_commit is the server's own env->git->pack ladder result.
  const attestation = health !== null && typeof health === "object" ? health.attestation : null;
  if (attestation === null || typeof attestation !== "object" || typeof attestation.source_commit !== "string") {
    fail("start_health_shape_invalid");
  }
  const commit = attestation.source_commit;
  if (!PACK_DIGEST_HEX.test(commit)) fail("start_identity_not_pack_digest");
  if (commit !== expectedPackDigest) fail("start_identity_mismatch");
  return { source_commit: commit };
}

// Post-stop state gate. The sibling pack.manifest.json sits OUTSIDE
// payload/ where the child process could write it, so it is NOT a trusted
// input on its own: the hardened reader is re-run first, and its RECOMPUTED
// digest must equal the PRE-GATE digest — a server that rewrote
// payload+manifest consistently necessarily changes the recomputed digest
// and fails here. Only then is the on-disk manifest (now digest-bound to
// the original entries) used for the reverse unmanifested-extras walk.
export function assertPostStopState({ appDir, payloadDir, targetDir, serverPath, expectedPackDigest }) {
  let postIdentity = null;
  try {
    postIdentity = readPackSourceIdentity(appDir, { verify: "all", selfPath: serverPath });
  } catch (error) {
    fail("start_stop_payload_mutated", error.code ?? "post_verify_failed");
  }
  if (postIdentity === null || postIdentity.pack_digest !== expectedPackDigest) {
    fail("start_stop_identity_changed");
  }
  const manifest = JSON.parse(readFileSync(join(targetDir, "pack.manifest.json"), "utf8"));
  const verdict = verifyInstalledCopy(manifest, payloadDir);
  if (!verdict.ok) fail("start_stop_payload_mutated", verdict.mismatches.slice(0, 5).join(","));
  return { files: postIdentity.verified_files };
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

function canListen(port) {
  return new Promise((resolveFree) => {
    const probe = createServer();
    probe.once("error", () => resolveFree(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolveFree(true)));
  });
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export async function proveStartStop({ targetDir, clock, timeoutMs = 60_000 }) {
  if (typeof clock !== "function") fail("clock_required");
  // A prior run's green receipt must not survive ANY failing run — the
  // delete happens before every gate (pre-gate refusals included), so the
  // receipt exists only when THIS run passed everything. force: no-op when
  // absent.
  rmSync(join(targetDir, "start_stop.receipt.json"), { force: true });
  const payloadDir = join(targetDir, "payload");
  const appDir = join(payloadDir, ...APP_REL.split("/"));
  const serverPath = join(appDir, "server.mjs");
  if (!existsSync(payloadDir)) fail("start_target_payload_missing");
  if (!existsSync(serverPath)) fail("start_target_server_missing");

  // Pre-gate: full byte verification + digest recompute through the same
  // hardened reader the worker boots with (selfPath demands server.mjs
  // itself be manifest-listed). Tamper throws here, before boot.
  const identity = readPackSourceIdentity(appDir, { verify: "all", selfPath: serverPath });
  if (identity === null) fail("start_target_not_an_installed_pack");

  const probeDir = join(targetDir, "runtime_probe");
  rmSync(probeDir, { recursive: true, force: true });
  mkdirSync(probeDir, { recursive: true });

  const port = await freePort();
  const child = spawn(process.execPath, [
    "server.mjs", "--db", join(probeDir, "erp.db"), "--port", String(port),
  ], {
    cwd: appDir,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
    env: buildProbeEnv({ probeDir, targetDir, baseEnv: process.env }),
  });
  let stderrTail = "";
  child.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });
  let exited = false;
  const exitPromise = new Promise((resolveExit) => {
    child.once("exit", () => { exited = true; resolveExit(); });
  });

  try {
    // Start: poll health until the server answers, then bind the answer to
    // the pre-gate identity.
    const deadline = Date.now() + timeoutMs;
    let health = null;
    let lastStatus = null;
    while (health === null) {
      if (exited) fail("start_boot_failed", stderrTail.slice(-300));
      if (Date.now() > deadline) {
        fail("start_health_timeout", lastStatus === null ? "no_http_response" : `last_http_${lastStatus}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        lastStatus = response.status;
        if (response.status === 200) health = await response.json();
      } catch { /* not listening yet */ }
      if (health === null) await sleep(300);
    }
    assertStartHealth(health, identity.pack_digest);

    // Stop: terminate, demand observed exit, demand the port truly freed.
    child.kill();
    await Promise.race([exitPromise, sleep(15_000)]);
    if (!exited) fail("stop_exit_timeout");
    let portReleased = false;
    for (let attempt = 0; attempt < 10 && !portReleased; attempt += 1) {
      portReleased = await canListen(port);
      if (!portReleased) await sleep(300);
    }
    if (!portReleased) fail("stop_port_not_released");

    // Post-gate: the server ran and stopped leaving payload byte-clean —
    // both directions, digest-bound to the pre-gate identity (see
    // assertPostStopState: the sibling manifest alone is not trusted).
    const postState = assertPostStopState({
      appDir, payloadDir, targetDir, serverPath, expectedPackDigest: identity.pack_digest,
    });

    const receipt = {
      receipt: "start_stop",
      ok: true,
      pack_digest: identity.pack_digest,
      verified_files_pre: identity.verified_files,
      health: { source_commit_kind: "pack_digest_64", matches_manifest: true },
      stop: {
        method: "child_kill_terminate",
        exit_observed: true,
        port_released: true,
        // server.mjs installs SIGINT/SIGTERM shutdown handlers; win32
        // child.kill is a hard terminate, so graceful-signal-path evidence
        // is posix-only future work — recorded, not claimed.
        graceful_signal_evidence: "not_claimed_win32_hard_terminate",
      },
      payload_reverified: { ok: true, files: postState.files },
      ran_at: clock(),
      ladder_note: "out_of_ladder_evidence: the start ladder gate is not claimed",
    };
    writeFileSync(join(targetDir, "start_stop.receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } finally {
    if (!exited) {
      try { child.kill(); } catch { /* already gone */ }
    }
  }
}

function cliMain() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--target");
  const rawTarget = index === -1 ? null : args[index + 1];
  if (!rawTarget) {
    process.stderr.write("usage: node prove_start_stop.mjs --target <installed-target-dir>\n");
    process.exit(2);
  }
  // Absolute target: GIT_CEILING_DIRECTORIES entries must be absolute to be
  // honored, so a relative --target would silently disarm the git ceiling.
  const targetDir = resolve(rawTarget);
  proveStartStop({ targetDir, clock: () => new Date().toISOString() })
    .then((receipt) => {
      process.stdout.write(`start/stop proof ok: pack_digest=${receipt.pack_digest} files=${receipt.payload_reverified.files} port_released=${receipt.stop.port_released}\n`);
    })
    .catch((error) => {
      // error.message carries code:detail — print it whole for diagnosis.
      process.stderr.write(`start/stop proof FAILED: ${error.message}\n`);
      process.exit(1);
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cliMain();
}
