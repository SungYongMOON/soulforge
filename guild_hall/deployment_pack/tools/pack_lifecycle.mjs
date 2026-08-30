// Pack lifecycle — the upgrade/rollback/restore (and backup) legs of the
// hpp initial release gate string "isolated install/start/stop/smoke/
// upgrade/rollback/restore proof". install/start-stop/smoke already leave
// out-of-ladder receipts; this tool completes the remaining legs.
//
// Model: an installed TARGET is { pack.manifest.json, payload/ } plus at
// most ONE retained previous generation { pack.manifest.prev.json,
// payload.prev/ } — the standing rollback path. A BACKUP is a verified
// copy of a target's current generation in its own directory.
//
// Discipline (same family as the builder/installer):
// - verify-before-mutate: every source generation is FULLY verified
//   (digest recomputed with the builder's exact recipe + two-way byte
//   walk) before one byte of the target changes; a refusal leaves the
//   target exactly as found.
// - previous retained: upgrade/rollback swap generations, never destroy
//   the outgoing one (the single older prev generation is cleared to make
//   room — one retained generation is the documented contract).
// - receipts are OUT-OF-LADDER evidence only (no gate is claimed), and a
//   stale same-op receipt is deleted before every gate so no green receipt
//   survives a failing run.
// - upgrade DEMANDS a clean current generation: the retained prev IS the
//   rollback promise, and a corrupt prev would be a false promise.
//   Recovering a damaged target is restorePack's job (from a backup), not
//   upgradePack's.
//
// This is CODE-payload lifecycle inside isolated evidence targets — a
// different plane from guild_hall/backup_controller (Windows scheduled
// tasks + data-surface backup/restore lanes), which stays authoritative
// for runtime data surfaces.

import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { recomputePackDigest, verifyInstalledCopy } from "./build_pack.mjs";

const PACK_MANIFEST_SCHEMA = "soulforge.deployment_pack_manifest.v0";
const SHA256_HEX = /^[a-f0-9]{64}$/;
// Same repo-relative path shape the builder enforces (assertRelPath): a
// crafted manifest must not be able to drive verification reads outside
// the payload dir via traversal-shaped entries.
const REL_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const LADDER_NOTE = "out_of_ladder_evidence: no release ladder gate is claimed";

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

// Read a manifest FILE and validate it the reader's way: shape-checked
// entries and a pack_digest that RECOMPUTES from those entries with the
// builder's recipe — a digest-doctored or entry-rewritten manifest
// refuses here.
export function parseVerifiedManifest(manifestPath, code) {
  if (!existsSync(manifestPath)) fail(code, "manifest_missing");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    fail(code, "manifest_unreadable");
  }
  if (manifest.schema !== PACK_MANIFEST_SCHEMA
    || typeof manifest.pack_digest !== "string"
    || !SHA256_HEX.test(manifest.pack_digest)
    || !Array.isArray(manifest.files)
    || manifest.files.length === 0
    || !manifest.files.every((entry) => entry !== null && typeof entry === "object"
      && typeof entry.path === "string" && REL_PATH.test(entry.path)
      && !entry.path.split("/").some((segment) => /^\.+$/.test(segment))
      && typeof entry.sha256 === "string" && SHA256_HEX.test(entry.sha256)
      && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0)) {
    fail(code, "manifest_invalid");
  }
  if (recomputePackDigest(manifest.files) !== manifest.pack_digest) fail(code, "manifest_digest_mismatch");
  return manifest;
}

export function readVerifiedManifest(dir, code) {
  return parseVerifiedManifest(join(dir, "pack.manifest.json"), code);
}

// Full generation verification: validated manifest + two-way byte walk
// (missing/mismatched AND unmanifested extras) over payloadDir.
function verifyGeneration(dir, payloadDir, code) {
  const manifest = readVerifiedManifest(dir, code);
  const verdict = verifyInstalledCopy(manifest, payloadDir);
  if (!verdict.ok) fail(code, verdict.mismatches.slice(0, 5).join(","));
  return manifest;
}

function writeReceipt(dir, op, body) {
  writeFileSync(join(dir, `${op}.receipt.json`), `${JSON.stringify({
    receipt: op, ok: true, ...body, ladder_note: LADDER_NOTE,
  }, null, 2)}\n`);
}

function clearReceipt(dir, op) {
  rmSync(join(dir, `${op}.receipt.json`), { force: true });
}

// Verified copy of the target's CURRENT generation into backupDir.
export function backupPack({ targetDir, backupDir, clock }) {
  if (typeof clock !== "function") fail("clock_required");
  const manifest = verifyGeneration(targetDir, join(targetDir, "payload"), "backup_source_invalid");
  if (existsSync(join(backupDir, "payload"))) fail("backup_dir_occupied");
  // The stale-receipt clear comes AFTER the refusal gates: an occupied-dir
  // refusal protects an EXISTING backup, and must not destroy that
  // backup's own receipt on the way out.
  clearReceipt(backupDir, "backup");
  mkdirSync(backupDir, { recursive: true });
  cpSync(join(targetDir, "payload"), join(backupDir, "payload"), { recursive: true });
  writeFileSync(join(backupDir, "pack.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const copyVerdict = verifyInstalledCopy(manifest, join(backupDir, "payload"));
  if (!copyVerdict.ok) {
    // A failed copy leaves NO backup-shaped bytes behind.
    rmSync(join(backupDir, "payload"), { recursive: true, force: true });
    rmSync(join(backupDir, "pack.manifest.json"), { force: true });
    fail("backup_copy_failed", copyVerdict.mismatches.slice(0, 5).join(","));
  }
  writeReceipt(backupDir, "backup", {
    pack_digest: manifest.pack_digest, files: manifest.files.length, backed_up_at: clock(),
  });
  return { pack_digest: manifest.pack_digest, files: manifest.files.length };
}

// Stage a source generation as payload.next (verified), then swap it in,
// retaining the outgoing generation as the prev slot. Shared by upgrade
// and restore. The outgoing manifest may be null (restore over a damaged
// target): the payload is still retained aside, but WITHOUT a prev
// manifest, so rollbackPack will refuse it — correct, because rolling
// back to a generation nobody can verify would be a false promise.
function stageAndSwap({ targetDir, sourcePayload, sourceManifest, outgoingManifest, failCode }) {
  const nextDir = join(targetDir, "payload.next");
  rmSync(nextDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourcePayload, nextDir, { recursive: true });
  const staged = verifyInstalledCopy(sourceManifest, nextDir);
  if (!staged.ok) {
    rmSync(nextDir, { recursive: true, force: true });
    fail(failCode, staged.mismatches.slice(0, 5).join(","));
  }
  // Make room: exactly one retained generation.
  rmSync(join(targetDir, "payload.prev"), { recursive: true, force: true });
  rmSync(join(targetDir, "pack.manifest.prev.json"), { force: true });
  if (existsSync(join(targetDir, "payload"))) {
    renameSync(join(targetDir, "payload"), join(targetDir, "payload.prev"));
    if (outgoingManifest !== null) {
      writeFileSync(join(targetDir, "pack.manifest.prev.json"), `${JSON.stringify(outgoingManifest, null, 2)}\n`);
    }
  }
  renameSync(nextDir, join(targetDir, "payload"));
  writeFileSync(join(targetDir, "pack.manifest.json"), `${JSON.stringify(sourceManifest, null, 2)}\n`);
  // Post-swap paranoia: the now-current generation re-verifies in place.
  const post = verifyInstalledCopy(sourceManifest, join(targetDir, "payload"));
  if (!post.ok) fail(failCode, `postswap:${post.mismatches.slice(0, 3).join(",")}`);
}

// Upgrade the target's current generation to the pack in packDir.
export function upgradePack({ packDir, targetDir, clock }) {
  if (typeof clock !== "function") fail("clock_required");
  clearReceipt(targetDir, "upgrade");
  const current = verifyGeneration(targetDir, join(targetDir, "payload"), "upgrade_target_state_invalid");
  const incoming = verifyGeneration(packDir, join(packDir, "payload"), "upgrade_pack_invalid");
  stageAndSwap({
    targetDir,
    sourcePayload: join(packDir, "payload"),
    sourceManifest: incoming,
    outgoingManifest: current,
    failCode: "upgrade_integrity_failed",
  });
  writeReceipt(targetDir, "upgrade", {
    from_digest: current.pack_digest, to_digest: incoming.pack_digest,
    files: incoming.files.length, previous_retained: true, upgraded_at: clock(),
  });
  return { from_digest: current.pack_digest, to_digest: incoming.pack_digest };
}

// Swap the current generation with the retained previous one. The
// previous generation is FULLY verified before the current one is
// touched. The CURRENT generation may be damaged — that is often WHY one
// rolls back — so its manifest is read best-effort: when it verifies, the
// rolled-from generation keeps its manifest in the prev slot (rolling
// forward is just another rollback); when it does not, the payload is
// retained manifest-less and rollbackPack will refuse to roll forward to
// it — a generation nobody can verify is not a rollback promise.
export function rollbackPack({ targetDir, clock }) {
  if (typeof clock !== "function") fail("clock_required");
  clearReceipt(targetDir, "rollback");
  const prevPayload = join(targetDir, "payload.prev");
  const prevManifestPath = join(targetDir, "pack.manifest.prev.json");
  if (!existsSync(prevPayload) || !existsSync(prevManifestPath)) fail("rollback_no_previous");
  // Half-swap residue from a crashed rollback holds the only copy of that
  // run's outgoing generation: refuse with a code instead of renaming over
  // it — recovery is manual inspection or restore from a backup.
  if (existsSync(join(targetDir, "payload.swap"))) fail("rollback_half_swap_residue");
  const prevManifest = parseVerifiedManifest(prevManifestPath, "rollback_previous_invalid");
  const prevVerdict = verifyInstalledCopy(prevManifest, prevPayload);
  if (!prevVerdict.ok) fail("rollback_previous_invalid", prevVerdict.mismatches.slice(0, 5).join(","));
  if (!existsSync(join(targetDir, "payload"))) fail("rollback_target_payload_missing");
  // Best-effort CURRENT verification — manifest AND payload bytes. Only a
  // generation that fully verifies is retained with its manifest (a
  // rollback promise) and stamped verified in the receipt; anything less
  // is retained manifest-less.
  let current = null;
  try {
    const candidate = readVerifiedManifest(targetDir, "rollback_current_unverifiable");
    current = verifyInstalledCopy(candidate, join(targetDir, "payload")).ok ? candidate : null;
  } catch {
    current = null;
  }
  // Swap generations (payload dirs and manifests).
  renameSync(join(targetDir, "payload"), join(targetDir, "payload.swap"));
  renameSync(prevPayload, join(targetDir, "payload"));
  renameSync(join(targetDir, "payload.swap"), prevPayload);
  writeFileSync(join(targetDir, "pack.manifest.json"), `${JSON.stringify(prevManifest, null, 2)}\n`);
  if (current !== null) {
    writeFileSync(prevManifestPath, `${JSON.stringify(current, null, 2)}\n`);
  } else {
    rmSync(prevManifestPath, { force: true });
  }
  const post = verifyInstalledCopy(prevManifest, join(targetDir, "payload"));
  if (!post.ok) fail("rollback_integrity_failed", `postswap:${post.mismatches.slice(0, 3).join(",")}`);
  writeReceipt(targetDir, "rollback", {
    from_digest: current === null ? null : current.pack_digest,
    from_generation_verified: current !== null,
    to_digest: prevManifest.pack_digest,
    files: prevManifest.files.length,
    previous_retained: true, rolled_back_at: clock(),
  });
  return { from_digest: current === null ? null : current.pack_digest, to_digest: prevManifest.pack_digest };
}

// Restore a (possibly damaged) target from a verified backup. The backup
// is fully verified BEFORE the target changes; whatever payload the
// target held is retained aside (with its manifest only if that manifest
// itself still verifies as readable JSON — an unverifiable outgoing
// generation is retained payload-only, which rollbackPack refuses).
export function restorePack({ backupDir, targetDir, clock }) {
  if (typeof clock !== "function") fail("clock_required");
  clearReceipt(targetDir, "restore");
  const backup = verifyGeneration(backupDir, join(backupDir, "payload"), "restore_backup_invalid");
  // Best-effort outgoing verification — manifest AND payload bytes, so the
  // receipt's damaged_previous_retained and the prev-manifest retention
  // both reflect an OBSERVED verification, never an assumed one.
  let outgoing = null;
  try {
    outgoing = verifyGeneration(targetDir, join(targetDir, "payload"), "restore_outgoing_unverifiable");
  } catch {
    outgoing = null;
  }
  stageAndSwap({
    targetDir,
    sourcePayload: join(backupDir, "payload"),
    sourceManifest: backup,
    outgoingManifest: outgoing,
    failCode: "restore_integrity_failed",
  });
  writeReceipt(targetDir, "restore", {
    restored_digest: backup.pack_digest, files: backup.files.length,
    damaged_previous_retained: outgoing === null && existsSync(join(targetDir, "payload.prev")),
    restored_at: clock(),
  });
  return { restored_digest: backup.pack_digest, files: backup.files.length };
}

function cliMain() {
  const [op, ...rest] = process.argv.slice(2);
  const value = (flag) => {
    const index = rest.indexOf(flag);
    const raw = index === -1 ? undefined : rest[index + 1];
    return raw === undefined ? null : resolve(raw);
  };
  const clock = () => new Date().toISOString();
  const usage = () => {
    process.stderr.write("usage: node pack_lifecycle.mjs backup --target <dir> --backup <dir> | upgrade --pack <dir> --target <dir> | rollback --target <dir> | restore --backup <dir> --target <dir>\n");
    process.exit(2);
  };
  try {
    if (op === "backup") {
      const targetDir = value("--target"); const backupDir = value("--backup");
      if (!targetDir || !backupDir) usage();
      const out = backupPack({ targetDir, backupDir, clock });
      process.stdout.write(`backup ok: ${out.files} files pack_digest=${out.pack_digest}\n`);
    } else if (op === "upgrade") {
      const packDir = value("--pack"); const targetDir = value("--target");
      if (!packDir || !targetDir) usage();
      const out = upgradePack({ packDir, targetDir, clock });
      process.stdout.write(`upgrade ok: ${out.from_digest.slice(0, 8)} -> ${out.to_digest.slice(0, 8)} (previous retained)\n`);
    } else if (op === "rollback") {
      const targetDir = value("--target");
      if (!targetDir) usage();
      const out = rollbackPack({ targetDir, clock });
      process.stdout.write(`rollback ok: ${out.from_digest.slice(0, 8)} -> ${out.to_digest.slice(0, 8)}\n`);
    } else if (op === "restore") {
      const backupDir = value("--backup"); const targetDir = value("--target");
      if (!backupDir || !targetDir) usage();
      const out = restorePack({ backupDir, targetDir, clock });
      process.stdout.write(`restore ok: ${out.files} files restored_digest=${out.restored_digest}\n`);
    } else {
      usage();
    }
  } catch (error) {
    // error.message carries code:detail — print it whole for diagnosis.
    process.stderr.write(`${op ?? "lifecycle"} FAILED: ${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cliMain();
}
