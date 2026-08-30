import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { assertPostStopState, assertStartHealth, buildProbeEnv, proveStartStop } from "../tools/prove_start_stop.mjs";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const packDigestOf = (entries) => sha256(JSON.stringify(entries.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes }))));
const fixedClock = () => "2026-08-30T12:00:00.000Z";

function tempTarget(label) {
  return mkdtempSync(join(tmpdir(), `soulforge-startstop-${label}-`));
}

test("probe env is neutralized, not inherited: DEV_ERP_* wiped, git context stripped and ceilinged, pins applied", () => {
  const target = tempTarget("env");
  const probeDir = join(target, "runtime_probe");
  const env = buildProbeEnv({
    probeDir,
    targetDir: target,
    baseEnv: {
      SYSTEMROOT: "keep-me",
      DEV_ERP_SOURCE_COMMIT: "a".repeat(64),
      DEV_ERP_CODEX_TASK_BRIDGE: "worker",
      DEV_ERP_MORNING_BRIEF: "1",
      DEV_ERP_LEGACY_MAIL_WRITER_ENABLED: "1",
      GIT_DIR: "somewhere/.git",
      GIT_WORK_TREE: "somewhere",
      GIT_INDEX_FILE: "somewhere/index",
    },
  });
  assert.equal(env.SYSTEMROOT, "keep-me", "unrelated base env passes through");
  for (const key of ["DEV_ERP_SOURCE_COMMIT", "DEV_ERP_MORNING_BRIEF", "DEV_ERP_LEGACY_MAIL_WRITER_ENABLED"]) {
    assert.equal(key in env, false, `${key}: every inherited DEV_ERP_* toggle is wiped (override masking / opt-in smearing)`);
  }
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
    assert.equal(key in env, false, `${key}: a dev shell's git context must not reach the ladder under proof`);
  }
  assert.equal(env.GIT_CEILING_DIRECTORIES, target, "upward git discovery stops at the install target");
  assert.equal(env.DEV_ERP_AUTOSYNC, "0");
  assert.equal(env.DEV_ERP_NO_TLS, "1");
  assert.equal(env.DEV_ERP_CODEX_TASK_BRIDGE, "mock", "the probe can never launch anything external");
  for (const key of ["DEV_ERP_BACKEND_ROOT", "DEV_ERP_CODEX_HOME", "DEV_ERP_CODEX_WORKSPACE_REGISTRY"]) {
    assert.equal(env[key].startsWith(probeDir + sep), true, `${key} must live under the probe dir`);
  }
});

// Minimal installed-pack fixture for the post-stop gate: one packed file
// (server.mjs) with a digest-consistent manifest beside payload/.
function miniInstalledTarget({ serverContent = "boots" } = {}) {
  const target = tempTarget("post");
  const appDir = join(target, "payload", "ui-workspace", "apps", "dev-erp");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, "server.mjs"), serverContent);
  const entries = [{ path: "ui-workspace/apps/dev-erp/server.mjs", sha256: sha256(serverContent), bytes: serverContent.length }];
  writeFileSync(join(target, "pack.manifest.json"), JSON.stringify({
    schema: "soulforge.deployment_pack_manifest.v0",
    pack_id: "hpp_server_pack",
    version: "0.1.0",
    files: entries,
    pack_digest: packDigestOf(entries),
    claim: "pack_build_artifact_not_a_release",
  }, null, 2));
  return {
    target,
    appDir,
    serverPath: join(appDir, "server.mjs"),
    payloadDir: join(target, "payload"),
    digest: packDigestOf(entries),
  };
}

test("the post-stop gate binds the on-disk manifest back to the pre-gate digest: a consistent swap cannot pass", () => {
  const intact = miniInstalledTarget();
  assert.deepEqual(assertPostStopState({
    appDir: intact.appDir, payloadDir: intact.payloadDir, targetDir: intact.target,
    serverPath: intact.serverPath, expectedPackDigest: intact.digest,
  }), { files: 1 });

  // Consistent payload+manifest rewrite: the reader itself verifies green,
  // but its RECOMPUTED digest differs from the pre-gate digest — the swap
  // is refused as an identity change, never re-trusted.
  const swapped = miniInstalledTarget();
  const newContent = "candy";
  writeFileSync(swapped.serverPath, newContent);
  const newEntries = [{ path: "ui-workspace/apps/dev-erp/server.mjs", sha256: sha256(newContent), bytes: newContent.length }];
  writeFileSync(join(swapped.target, "pack.manifest.json"), JSON.stringify({
    schema: "soulforge.deployment_pack_manifest.v0",
    pack_id: "hpp_server_pack",
    version: "0.1.0",
    files: newEntries,
    pack_digest: packDigestOf(newEntries),
    claim: "pack_build_artifact_not_a_release",
  }, null, 2));
  assert.throws(() => assertPostStopState({
    appDir: swapped.appDir, payloadDir: swapped.payloadDir, targetDir: swapped.target,
    serverPath: swapped.serverPath, expectedPackDigest: swapped.digest,
  }), (error) => error.code === "start_stop_identity_changed");

  // A mutated packed file (manifest untouched) maps to payload_mutated.
  const mutated = miniInstalledTarget();
  writeFileSync(mutated.serverPath, "candy");
  assert.throws(() => assertPostStopState({
    appDir: mutated.appDir, payloadDir: mutated.payloadDir, targetDir: mutated.target,
    serverPath: mutated.serverPath, expectedPackDigest: mutated.digest,
  }), (error) => error.code === "start_stop_payload_mutated");

  // An unmanifested extra under payload/ is a mutation too (reverse walk).
  const extra = miniInstalledTarget();
  writeFileSync(join(extra.payloadDir, "ui-workspace", "smuggled.txt"), "x");
  assert.throws(() => assertPostStopState({
    appDir: extra.appDir, payloadDir: extra.payloadDir, targetDir: extra.target,
    serverPath: extra.serverPath, expectedPackDigest: extra.digest,
  }), (error) => error.code === "start_stop_payload_mutated");
});

test("start health binds the served identity to the pack digest: git-shaped or mismatched identities fail", () => {
  const digest = "f".repeat(64);
  assert.deepEqual(assertStartHealth({ attestation: { source_commit: digest } }, digest), { source_commit: digest });
  assert.throws(() => assertStartHealth({ attestation: { source_commit: "a".repeat(40) } }, digest),
    (error) => error.code === "start_identity_not_pack_digest",
    "a 40-hex git identity inside an installed copy is a failure, not an alternative");
  assert.throws(() => assertStartHealth({ attestation: { source_commit: "e".repeat(64) } }, digest),
    (error) => error.code === "start_identity_mismatch");
  assert.throws(() => assertStartHealth({ attestation: {} }, digest),
    (error) => error.code === "start_health_shape_invalid");
  assert.throws(() => assertStartHealth({ source_commit: digest }, digest),
    (error) => error.code === "start_health_shape_invalid",
    "a top-level commit without the attestation envelope is not the contract");
  assert.throws(() => assertStartHealth(null, digest),
    (error) => error.code === "start_health_shape_invalid");
});

test("the prover refuses before any boot: missing payload, missing server, no manifest, tampered target", async () => {
  await assert.rejects(proveStartStop({ targetDir: tempTarget("empty"), clock: fixedClock }),
    (error) => error.code === "start_target_payload_missing");

  const noServer = tempTarget("noServer");
  mkdirSync(join(noServer, "payload", "ui-workspace", "apps", "dev-erp"), { recursive: true });
  await assert.rejects(proveStartStop({ targetDir: noServer, clock: fixedClock }),
    (error) => error.code === "start_target_server_missing");

  const noManifest = tempTarget("noManifest");
  const appDir = join(noManifest, "payload", "ui-workspace", "apps", "dev-erp");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, "server.mjs"), "// stub\n");
  await assert.rejects(proveStartStop({ targetDir: noManifest, clock: fixedClock }),
    (error) => error.code === "start_target_not_an_installed_pack");

  // Tampered target: the manifest's digest is self-consistent (recompute
  // passes) but the on-disk server bytes hash differently — the pre-gate
  // must throw the reader's tamper code before any spawn.
  const tampered = tempTarget("tampered");
  const tamperedApp = join(tampered, "payload", "ui-workspace", "apps", "dev-erp");
  mkdirSync(tamperedApp, { recursive: true });
  writeFileSync(join(tamperedApp, "server.mjs"), "boots");
  const entries = [{ path: "ui-workspace/apps/dev-erp/server.mjs", sha256: sha256("candy"), bytes: 5 }];
  writeFileSync(join(tampered, "pack.manifest.json"), JSON.stringify({
    schema: "soulforge.deployment_pack_manifest.v0",
    pack_id: "hpp_server_pack",
    version: "0.1.0",
    files: entries,
    pack_digest: packDigestOf(entries),
    claim: "pack_build_artifact_not_a_release",
  }, null, 2));
  // A stale green receipt from an earlier passing run must not survive a
  // run that fails at the PRE-gate (the delete happens before every gate).
  writeFileSync(join(tampered, "start_stop.receipt.json"), JSON.stringify({ receipt: "start_stop", ok: true }));
  await assert.rejects(proveStartStop({ targetDir: tampered, clock: fixedClock }),
    (error) => error.code === "pack_source_state_tampered");
  assert.equal(existsSync(join(tampered, "start_stop.receipt.json")), false,
    "a failing run leaves no green receipt behind");

  await assert.rejects(proveStartStop({ targetDir: tempTarget("noClock") }),
    (error) => error.code === "clock_required");
});
