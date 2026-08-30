// Pack source identity — git-free source attestation for INSTALLED copies.
//
// A dev checkout attests its source state with git (commit + clean tree).
// An installed pack has no git, but it has something equally exact: the
// pack manifest the installer delivered beside payload/ (per-file sha256 +
// pack_digest). This module locates that manifest by walking UP from a
// module's own directory to the `payload` root, verifies real file bytes
// against the manifest, and returns the pack_digest (64-hex) as the source
// identity. Consumers overload the existing source_commit field: LENGTH is
// the discriminator — 40 hex = git commit, 64 hex = pack digest — and every
// consumer regex documents both.
//
// Fail-closed: a manifest-listed file that is missing or hash-mismatched is
// TAMPER (there is no legitimate "dirty" installed pack) and throws; a tree
// with no pack manifest returns null so callers fall through to their own
// unavailability handling.
//
// Trust model (honest residual): the manifest is UNSIGNED. The attested
// digest is therefore RECOMPUTED here from the manifest's own file entries
// with the builder's exact recipe and compared to the stored pack_digest,
// so the digest is a function of the verified bytes and any consistent
// payload+entry rewrite necessarily CHANGES it. What catches a changed
// digest is an EXTERNAL pin (DEV_ERP_SOURCE_COMMIT, a release record, the
// build-side receipts); without such a pin, trust reduces to the delivery
// channel. This is tamper-evidence against corruption and unsophisticated
// edits — weaker in kind than git history — and git wins wherever git
// exists: the upward walk refuses pack identity for any tree governed by a
// .git ancestor, so a checkout whose git binary is broken stays on its
// original fail-closed path instead of degrading onto a plantable manifest.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const PACK_MANIFEST_SCHEMA = "soulforge.deployment_pack_manifest.v0";
const MAX_WALK_UP = 16;
const SHA256_HEX = /^[a-f0-9]{64}$/;
// Same repo-relative path shape the builder enforces: a crafted manifest
// must not drive verification reads outside the payload dir via
// traversal-shaped entries.
const REL_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

// Case-fold absolute paths on win32 so entry matching cannot spuriously
// miss on drive-letter casing. Folding only affects WHICH entry is chosen;
// the chosen entry is still byte-verified, so this is availability, never
// integrity.
function normalizeFsPath(value) {
  const absolute = resolve(String(value));
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

// Find the enclosing installed-pack layout: an ancestor directory named
// `payload` whose PARENT carries pack.manifest.json. Returns null when the
// module does not live inside an installed pack — and also when any
// ancestor at or below the candidate payload root carries .git (dir or
// worktree file): git governs that tree, so pack identity must refuse
// rather than let a broken git binary degrade onto a manifest somebody
// could plant above a checkout.
export function locateInstalledPack(startDir) {
  let current = startDir;
  for (let step = 0; step < MAX_WALK_UP; step += 1) {
    if (existsSync(join(current, ".git"))) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    if (basename(current) === "payload" && existsSync(join(parent, "pack.manifest.json"))) {
      return { payloadRoot: current, manifestPath: join(parent, "pack.manifest.json") };
    }
    current = parent;
  }
  return null;
}

// Read + verify the installed pack's identity.
//   verify: "all"  — hash every manifest-listed file (the worker's boot
//                    proof: its whole installed source is byte-exact); an
//                    optional selfPath additionally demands the CALLER's
//                    own module be among the verified entries — a manifest
//                    that simply omits the caller's code cannot attest it;
//           "self" — hash only selfPath (cheap single-file check for
//                    consumers like the ERP server).
export function readPackSourceIdentity(startDir, { verify = "all", selfPath = null } = {}) {
  const located = locateInstalledPack(startDir);
  if (located === null) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(located.manifestPath, "utf8"));
  } catch {
    fail("pack_source_manifest_unreadable");
  }
  if (manifest.schema !== PACK_MANIFEST_SCHEMA
    || typeof manifest.pack_digest !== "string"
    || !SHA256_HEX.test(manifest.pack_digest)
    || !Array.isArray(manifest.files)
    // An empty file list would verify NOTHING while still yielding a clean
    // identity: floor it — a source identity must cover at least one file.
    || manifest.files.length === 0
    || !manifest.files.every((entry) => entry !== null && typeof entry === "object"
      && typeof entry.path === "string" && REL_PATH.test(entry.path)
      && !entry.path.split("/").some((segment) => /^\.+$/.test(segment))
      && typeof entry.sha256 === "string" && SHA256_HEX.test(entry.sha256)
      && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0)) {
    fail("pack_source_manifest_invalid");
  }
  // The attested digest is RECOMPUTED from the manifest's own entries with
  // the builder's exact recipe (build_pack.mjs prepare(): path-sorted
  // entries, {path, sha256, bytes}, compact JSON, sha256) and must equal
  // the stored pack_digest. Without this the digest would be an echoed
  // free field that a payload+entry rewrite could hold constant; with it,
  // such a rewrite changes the digest, which an external pin catches.
  const recomputed = createHash("sha256")
    .update(JSON.stringify(manifest.files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))), "utf8")
    .digest("hex");
  if (recomputed !== manifest.pack_digest) fail("pack_source_manifest_invalid");
  const entryAbsolute = (entry) => join(located.payloadRoot, ...entry.path.split("/"));
  const verifyEntry = (entry) => {
    const target = entryAbsolute(entry);
    if (!existsSync(target)) fail("pack_source_state_tampered");
    const bytes = readFileSync(target);
    if (bytes.length !== entry.bytes
      || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      fail("pack_source_state_tampered");
    }
  };
  // Exact resolved-path equality (never suffix matching): the entry chosen
  // is precisely the manifest row for THIS file.
  const matchesSelf = (entry, normalizedSelf) => normalizeFsPath(entryAbsolute(entry)) === normalizedSelf;
  let verifiedFiles = 0;
  if (verify === "all") {
    for (const entry of manifest.files) {
      verifyEntry(entry);
      verifiedFiles += 1;
    }
    if (selfPath !== null) {
      if (typeof selfPath !== "string" || selfPath.length === 0) fail("pack_source_self_path_required");
      const normalizedSelf = normalizeFsPath(selfPath);
      if (!manifest.files.some((entry) => matchesSelf(entry, normalizedSelf))) {
        fail("pack_source_self_not_in_manifest");
      }
    }
  } else if (verify === "self") {
    if (typeof selfPath !== "string" || selfPath.length === 0) fail("pack_source_self_path_required");
    const normalizedSelf = normalizeFsPath(selfPath);
    const entry = manifest.files.find((candidate) => matchesSelf(candidate, normalizedSelf));
    if (!entry) fail("pack_source_self_not_in_manifest");
    verifyEntry(entry);
    verifiedFiles = 1;
  } else {
    fail("pack_source_verify_mode_invalid");
  }
  return Object.freeze({
    payload_root: located.payloadRoot,
    pack_id: manifest.pack_id,
    pack_version: manifest.version,
    pack_digest: manifest.pack_digest,
    verified_files: verifiedFiles,
  });
}
