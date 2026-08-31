import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPack, installPack, recomputePackDigest } from "../tools/build_pack.mjs";
import { backupPack, parseVerifiedManifest, restorePack, rollbackPack, upgradePack } from "../tools/pack_lifecycle.mjs";

const fixedClock = () => "2026-08-30T12:00:00.000Z";
const okRunner = (entries) => ({ ok: true, summary: `synthetic ok (${entries.length})` });

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), `soulforge-lifecycle-${label}-`));
}

const CORE_REL = ["guild_hall", "tool_workshop", "src", "tool_workshop_core.mjs"];

// Build a synthetic pack whose single source file carries `content`.
function builtPack(content) {
  const root = tempDir("root");
  mkdirSync(join(root, "guild_hall", "tool_workshop", "src"), { recursive: true });
  mkdirSync(join(root, "guild_hall", "tool_workshop", "tests"), { recursive: true });
  writeFileSync(join(root, ...CORE_REL), content);
  writeFileSync(join(root, "guild_hall", "tool_workshop", "tests", "tool_workshop_core.test.mjs"), "// synthetic test file\n");
  const specPath = join(root, "spec.json");
  writeFileSync(specPath, JSON.stringify({
    schema: "soulforge.deployment_pack_spec.v0",
    pack_id: "tool_workshop_pack",
    version: "0.1.0",
    host_effect_policy: {
      reboot: "forbidden",
      driver_change: "forbidden",
      system_update: "forbidden",
      service_restart_scope: "pack_services_only",
    },
    content_roles: {
      resource_lease_helper: ["guild_hall/tool_workshop/src/tool_workshop_core.mjs"],
      validators: ["guild_hall/tool_workshop/tests/tool_workshop_core.test.mjs"],
    },
    smoke_test_entries: ["guild_hall/tool_workshop/tests/tool_workshop_core.test.mjs"],
    release_notes_ref: "release_notes.tool_workshop_pack.v0_1_0",
    install_manual_ref: "manual.install.tool_workshop_pack",
    upgrade_manual_ref: "manual.upgrade.tool_workshop_pack",
    rollback_manual_ref: "manual.rollback.tool_workshop_pack",
    support_owner_ref: "owner.platform_support",
    secret_refs: [],
  }, null, 2));
  return buildPack(specPath, { rootDir: root, outDir: tempDir("out"), clock: fixedClock, runner: okRunner });
}

function installedTarget(built) {
  const target = tempDir("target");
  installPack({ packDir: built.packDir, targetDir: target, clock: fixedClock });
  return target;
}

const V1 = "export const x = 1;\n";
const V2 = "export const x = 2;\n";
const coreOf = (target) => readFileSync(join(target, "payload", ...CORE_REL), "utf8");

test("recomputePackDigest is the manifest's own digest: the exported recipe matches what the builder stamps", () => {
  const built = builtPack(V1);
  assert.equal(recomputePackDigest(built.manifest.files), built.manifest.pack_digest);
});

test("backup copies a verified current generation; occupied dirs and corrupt sources refuse", () => {
  const built = builtPack(V1);
  const target = installedTarget(built);
  const backupDir = tempDir("backup");
  const out = backupPack({ targetDir: target, backupDir, clock: fixedClock });
  assert.equal(out.pack_digest, built.manifest.pack_digest);
  const receipt = JSON.parse(readFileSync(join(backupDir, "backup.receipt.json"), "utf8"));
  assert.equal(receipt.ok, true);
  assert.equal(receipt.ladder_note.startsWith("out_of_ladder_evidence"), true);
  assert.throws(() => backupPack({ targetDir: target, backupDir, clock: fixedClock }),
    (error) => error.code === "backup_dir_occupied");
  // The occupied refusal protects an EXISTING backup: its receipt survives.
  assert.equal(JSON.parse(readFileSync(join(backupDir, "backup.receipt.json"), "utf8")).ok, true,
    "a refused backup leaves the existing backup's receipt untouched");
  writeFileSync(join(target, "payload", ...CORE_REL), "corrupted\n");
  assert.throws(() => backupPack({ targetDir: target, backupDir: tempDir("backup2"), clock: fixedClock }),
    (error) => error.code === "backup_source_invalid");
});

test("upgrade swaps generations verify-first and retains the previous; refusals leave the payload untouched", () => {
  const v1 = builtPack(V1);
  const v2 = builtPack(V2);
  assert.notEqual(v1.manifest.pack_digest, v2.manifest.pack_digest);
  const target = installedTarget(v1);
  const out = upgradePack({ packDir: v2.packDir, targetDir: target, clock: fixedClock });
  assert.deepEqual(out, { from_digest: v1.manifest.pack_digest, to_digest: v2.manifest.pack_digest });
  assert.equal(coreOf(target), V2, "current generation is the incoming pack");
  assert.equal(readFileSync(join(target, "payload.prev", ...CORE_REL), "utf8"), V1, "outgoing generation retained");
  const prevManifest = JSON.parse(readFileSync(join(target, "pack.manifest.prev.json"), "utf8"));
  assert.equal(prevManifest.pack_digest, v1.manifest.pack_digest);
  assert.equal(JSON.parse(readFileSync(join(target, "upgrade.receipt.json"), "utf8")).previous_retained, true);

  // A corrupt incoming pack refuses BEFORE any mutation — and the stale
  // green receipt from the successful upgrade does not survive the
  // failing run.
  writeFileSync(join(v1.packDir, "payload", ...CORE_REL), "tampered pack\n");
  assert.throws(() => upgradePack({ packDir: v1.packDir, targetDir: target, clock: fixedClock }),
    (error) => error.code === "upgrade_pack_invalid");
  assert.equal(coreOf(target), V2, "refusal left the current generation untouched");
  assert.equal(existsSync(join(target, "upgrade.receipt.json")), false, "no green receipt survives a failing run");

  // A corrupt CURRENT generation refuses upgrade: the retained prev is the
  // rollback promise, and a corrupt outgoing generation would poison it.
  const damaged = installedTarget(builtPack(V1));
  writeFileSync(join(damaged, "payload", ...CORE_REL), "damaged\n");
  assert.throws(() => upgradePack({ packDir: v2.packDir, targetDir: damaged, clock: fixedClock }),
    (error) => error.code === "upgrade_target_state_invalid");
  assert.throws(() => upgradePack({ packDir: v2.packDir, targetDir: tempDir("empty"), clock: fixedClock }),
    (error) => error.code === "upgrade_target_state_invalid");
});

test("rollback returns to the verified previous generation, and rolling forward is another rollback", () => {
  const v1 = builtPack(V1);
  const v2 = builtPack(V2);
  const target = installedTarget(v1);
  upgradePack({ packDir: v2.packDir, targetDir: target, clock: fixedClock });

  const back = rollbackPack({ targetDir: target, clock: fixedClock });
  assert.deepEqual(back, { from_digest: v2.manifest.pack_digest, to_digest: v1.manifest.pack_digest });
  assert.equal(coreOf(target), V1);
  const forward = rollbackPack({ targetDir: target, clock: fixedClock });
  assert.equal(forward.to_digest, v2.manifest.pack_digest);
  assert.equal(coreOf(target), V2);

  assert.throws(() => rollbackPack({ targetDir: installedTarget(builtPack(V1)), clock: fixedClock }),
    (error) => error.code === "rollback_no_previous");

  // A corrupted previous generation refuses BEFORE the current is touched.
  writeFileSync(join(target, "payload.prev", ...CORE_REL), "rotten prev\n");
  assert.throws(() => rollbackPack({ targetDir: target, clock: fixedClock }),
    (error) => error.code === "rollback_previous_invalid");
  assert.equal(coreOf(target), V2, "refusal left the current generation untouched");
});

test("rollback from a damaged current works, retains it manifest-less, and refuses rolling forward to it", () => {
  const v1 = builtPack(V1);
  const v2 = builtPack(V2);
  const target = installedTarget(v1);
  upgradePack({ packDir: v2.packDir, targetDir: target, clock: fixedClock });
  // Damage the CURRENT manifest (the usual reason to roll back): rollback
  // must still work — the damaged generation is retained payload-only.
  writeFileSync(join(target, "pack.manifest.json"), "{ not json");
  const back = rollbackPack({ targetDir: target, clock: fixedClock });
  assert.equal(back.from_digest, null);
  assert.equal(back.to_digest, v1.manifest.pack_digest);
  assert.equal(coreOf(target), V1);
  const receipt = JSON.parse(readFileSync(join(target, "rollback.receipt.json"), "utf8"));
  assert.equal(receipt.from_generation_verified, false);
  assert.equal(existsSync(join(target, "pack.manifest.prev.json")), false,
    "an unverifiable generation is never presented as a rollback promise");
  assert.throws(() => rollbackPack({ targetDir: target, clock: fixedClock }),
    (error) => error.code === "rollback_no_previous");
});

test("from_generation_verified is an OBSERVED verification: a rotten current payload with an intact manifest is retained manifest-less", () => {
  const v1 = builtPack(V1);
  const v2 = builtPack(V2);
  const target = installedTarget(v1);
  upgradePack({ packDir: v2.packDir, targetDir: target, clock: fixedClock });
  // Manifest stays valid; PAYLOAD bytes rot — the receipt must not stamp a
  // verification nobody performed, and the rotten generation must not be
  // presented as a rollback promise.
  writeFileSync(join(target, "payload", ...CORE_REL), "rotten current\n");
  const back = rollbackPack({ targetDir: target, clock: fixedClock });
  assert.equal(back.from_digest, null);
  assert.equal(coreOf(target), V1);
  const receipt = JSON.parse(readFileSync(join(target, "rollback.receipt.json"), "utf8"));
  assert.equal(receipt.from_generation_verified, false);
  assert.equal(existsSync(join(target, "pack.manifest.prev.json")), false);
  assert.throws(() => rollbackPack({ targetDir: target, clock: fixedClock }),
    (error) => error.code === "rollback_no_previous");
});

test("half-states fail closed with codes: missing payload and half-swap residue refuse before any rename", () => {
  const v1 = builtPack(V1);
  const v2 = builtPack(V2);
  const target = installedTarget(v1);
  upgradePack({ packDir: v2.packDir, targetDir: target, clock: fixedClock });
  mkdirSync(join(target, "payload.swap"));
  assert.throws(() => rollbackPack({ targetDir: target, clock: fixedClock }),
    (error) => error.code === "rollback_half_swap_residue");
  assert.equal(coreOf(target), V2, "the residue refusal touched nothing");

  const missing = installedTarget(builtPack(V1));
  upgradePack({ packDir: v2.packDir, targetDir: missing, clock: fixedClock });
  rmSync(join(missing, "payload"), { recursive: true, force: true });
  assert.throws(() => rollbackPack({ targetDir: missing, clock: fixedClock }),
    (error) => error.code === "rollback_target_payload_missing");
});

test("traversal-shaped manifest entries are invalid even when self-consistent: no reads outside the payload", () => {
  const dir = tempDir("traversal");
  const entries = [{ path: "../escape.mjs", sha256: "a".repeat(64), bytes: 5 }];
  writeFileSync(join(dir, "pack.manifest.json"), JSON.stringify({
    schema: "soulforge.deployment_pack_manifest.v0",
    pack_id: "hpp_server_pack",
    version: "0.1.0",
    files: entries,
    pack_digest: recomputePackDigest(entries),
    claim: "pack_build_artifact_not_a_release",
  }, null, 2));
  assert.throws(() => parseVerifiedManifest(join(dir, "pack.manifest.json"), "probe_code"),
    (error) => error.code === "probe_code" && error.message.includes("manifest_invalid"));
});

test("restore rebuilds a damaged target from a verified backup; a corrupt backup refuses untouched", () => {
  const v1 = builtPack(V1);
  const target = installedTarget(v1);
  const backupDir = tempDir("backup");
  backupPack({ targetDir: target, backupDir, clock: fixedClock });

  // Damage both the payload and the manifest, then restore.
  writeFileSync(join(target, "payload", ...CORE_REL), "damaged beyond use\n");
  writeFileSync(join(target, "pack.manifest.json"), "{ not json");
  const out = restorePack({ backupDir, targetDir: target, clock: fixedClock });
  assert.equal(out.restored_digest, v1.manifest.pack_digest);
  assert.equal(coreOf(target), V1);
  const receipt = JSON.parse(readFileSync(join(target, "restore.receipt.json"), "utf8"));
  assert.equal(receipt.damaged_previous_retained, true);
  assert.equal(existsSync(join(target, "pack.manifest.prev.json")), false);

  // A corrupt backup refuses before the target changes.
  writeFileSync(join(backupDir, "payload", ...CORE_REL), "rotten backup\n");
  writeFileSync(join(target, "payload", ...CORE_REL), "current to protect\n");
  assert.throws(() => restorePack({ backupDir, targetDir: target, clock: fixedClock }),
    (error) => error.code === "restore_backup_invalid");
  assert.equal(coreOf(target), "current to protect\n", "refusal left the target untouched");
});
