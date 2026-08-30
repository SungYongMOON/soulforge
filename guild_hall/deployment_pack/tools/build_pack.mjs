// Pack builder — the first executable step of plan-12's release discipline.
//
// Builds ONE pack from a tracked spec into an untracked dist/ directory, and
// proves exactly what it can prove: the build/unit/contract gates. The
// emitted release candidate claims `contract` and nothing higher — the
// integration/e2e/package/sbom/start gates are not defined for a pack yet,
// so install/smoke runs are recorded as OUT-OF-LADDER receipts, never as
// claimed gates. "A release is not a folder or artifact existing" stays
// true: this tool produces a draft candidate, receipts, and bytes — no
// release, no ring promotion, no publication, no service, no registration.
//
// Discipline:
// - validate-before-write: every input file is resolved, shape-checked,
//   secret-scanned, and hashed, and the unit gate has PASSED, before one
//   output byte is written.
// - deterministic: pack.manifest.json carries no timestamps; identical
//   inputs yield byte-identical manifests and the same pack_digest.
//   Timestamps live only in receipts (injected clock).
// - fail-closed: a secret-material match, a path outside the repo shape, a
//   missing file, or a failing unit run refuses the whole build.
// - the secret scan decodes bytes as UTF-8 and is therefore TEXT-ONLY: for a
//   future pack carrying binary payloads it is best-effort, not proof.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PACK_CATALOG, validatePackReleaseManifest } from "../src/deployment_pack_contract.mjs";

export const PACK_SPEC_SCHEMA = "soulforge.deployment_pack_spec.v0";
export const PACK_MANIFEST_SCHEMA = "soulforge.deployment_pack_manifest.v0";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
// Repo-relative POSIX path: no absolute, no drive letter, no traversal.
const REL_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const SECRET_MATERIAL = /password|passwd|api[_-]?key|token_value|secret_value|private[_ ]key|BEGIN [A-Z ]+KEY/i;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertRelPath(value, field) {
  // All-dot segments ("..", ".", "...") are rejected for canonicality:
  // "./a" and "a" must never count as two distinct files.
  if (typeof value !== "string" || !REL_PATH.test(value)
    || value.split("/").some((segment) => /^\.+$/.test(segment))) {
    fail("spec_path_invalid", `${field}:${String(value)}`);
  }
  return value;
}

export function loadPackSpec(specPath) {
  const raw = JSON.parse(readFileSync(specPath, "utf8"));
  if (raw.schema !== PACK_SPEC_SCHEMA) fail("spec_schema_invalid", String(raw.schema));
  const pack = PACK_CATALOG.find((entry) => entry.pack_id === raw.pack_id);
  if (!pack) fail("pack_id_unknown", String(raw.pack_id));
  if (typeof raw.version !== "string" || !SEMVER.test(raw.version)) fail("version_not_semver", String(raw.version));
  if (!raw.content_roles || typeof raw.content_roles !== "object") fail("spec_roles_missing");
  for (const [role, files] of Object.entries(raw.content_roles)) {
    if (!pack.contains.includes(role)) fail("spec_role_not_in_pack_boundary", role);
    if (!Array.isArray(files) || files.length === 0) fail("spec_role_files_missing", role);
    for (const file of files) assertRelPath(file, `content_roles.${role}`);
  }
  if (!Array.isArray(raw.smoke_test_entries) || raw.smoke_test_entries.length === 0) fail("spec_smoke_entries_missing");
  for (const entry of raw.smoke_test_entries) assertRelPath(entry, "smoke_test_entries");
  return raw;
}

// Default gate runner: a real `node --test` child process. Tests inject a
// synthetic runner instead; the CLI uses this one.
export function nodeTestRunner(entries, { cwd }) {
  const result = spawnSync(process.execPath, ["--test", ...entries], { cwd, encoding: "utf8" });
  return {
    ok: result.status === 0,
    summary: `node --test exited ${result.status}`,
  };
}

// Phase 1 (pure, no writes): resolve + scan + hash every file, run the unit
// gate on the SOURCE tree, and assemble the deterministic manifest.
function prepare(spec, { rootDir, runner }) {
  const files = [];
  const seen = new Set();
  for (const [role, rolePaths] of Object.entries(spec.content_roles)) {
    for (const relPath of rolePaths) {
      if (seen.has(relPath)) fail("spec_duplicate_file", relPath);
      seen.add(relPath);
      const absolute = resolve(rootDir, relPath);
      if (!absolute.startsWith(resolve(rootDir) + sep)) fail("spec_path_escapes_root", relPath);
      if (!existsSync(absolute)) fail("spec_file_missing", relPath);
      const bytes = readFileSync(absolute);
      // must-not-contain, enforced on CONTENT: any secret-material shape in
      // any packed file refuses the whole build. The receipt names the path
      // only, never the matching content.
      if (SECRET_MATERIAL.test(bytes.toString("utf8"))) fail("pack_contains_secret_material", relPath);
      files.push({ path: relPath, role, sha256: sha256(bytes), bytes: bytes.length, content: bytes });
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const digestInput = files.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes }));
  const packDigest = sha256(Buffer.from(JSON.stringify(digestInput), "utf8"));

  const unit = runner(spec.smoke_test_entries, { cwd: rootDir });
  if (!unit || unit.ok !== true) fail("unit_gate_failed", unit ? unit.summary : "runner_returned_nothing");

  const manifest = {
    schema: PACK_MANIFEST_SCHEMA,
    pack_id: spec.pack_id,
    version: spec.version,
    files: digestInput,
    content_roles: Object.fromEntries(Object.entries(spec.content_roles).map(([role, rolePaths]) => [role, [...rolePaths].sort()])),
    pack_digest: packDigest,
    claim: "pack_build_artifact_not_a_release",
  };

  const evidenceSuffix = packDigest.slice(0, 8);
  const candidate = {
    pack_id: spec.pack_id,
    version: spec.version,
    status: "draft",
    contents: Object.keys(spec.content_roles).sort(),
    config_refs: [],
    secret_refs: Array.isArray(spec.secret_refs) ? spec.secret_refs : [],
    release_notes_ref: spec.release_notes_ref,
    install_manual_ref: spec.install_manual_ref,
    upgrade_manual_ref: spec.upgrade_manual_ref,
    rollback_manual_ref: spec.rollback_manual_ref,
    support_owner_ref: spec.support_owner_ref,
    claimed_gate: "contract",
    gate_evidence: {
      build: `evidence.build.${evidenceSuffix}`,
      unit: `evidence.unit.${evidenceSuffix}`,
      contract: `evidence.contract.${evidenceSuffix}`,
    },
  };
  const verdict = validatePackReleaseManifest(candidate);
  if (!verdict.ok) fail("contract_gate_failed", verdict.problems.join(","));

  return { files, manifest, candidate, unitSummary: unit.summary };
}

export function buildPack(specPath, { rootDir, outDir, clock, runner = nodeTestRunner }) {
  if (typeof clock !== "function") fail("clock_required");
  const spec = loadPackSpec(specPath);
  const prepared = prepare(spec, { rootDir, runner });

  // Phase 2: only after every gate passed, write the artifact. The pack dir
  // is cleared first so a same-outDir rebuild can never leave stale orphan
  // files under the new manifest.
  const packDir = join(outDir, spec.pack_id, spec.version);
  rmSync(packDir, { recursive: true, force: true });
  const payloadDir = join(packDir, "payload");
  const receiptsDir = join(packDir, "receipts");
  mkdirSync(payloadDir, { recursive: true });
  mkdirSync(receiptsDir, { recursive: true });
  for (const file of prepared.files) {
    const target = join(payloadDir, ...file.path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(join(packDir, "pack.manifest.json"), stableJson(prepared.manifest));
  writeFileSync(join(packDir, "release.candidate.json"), stableJson(prepared.candidate));
  writeFileSync(join(receiptsDir, "build.receipt.json"), stableJson({
    receipt: "build", pack_digest: prepared.manifest.pack_digest,
    file_count: prepared.files.length, built_at: clock(),
  }));
  writeFileSync(join(receiptsDir, "unit.receipt.json"), stableJson({
    receipt: "unit", summary: prepared.unitSummary, ran_at: clock(),
  }));
  writeFileSync(join(receiptsDir, "contract.receipt.json"), stableJson({
    receipt: "contract", verdict: "ok", claimed_gate: "contract", checked_at: clock(),
  }));
  return { packDir, manifest: prepared.manifest, candidate: prepared.candidate };
}

// Integrity check of an installed copy against the manifest — BOTH ways.
// Every manifested file must match its digest, and every file actually
// present must be manifested: unmanifested bytes under a green receipt are
// exactly the quiet lie this tool exists to prevent. Reports paths only.
export function verifyInstalledCopy(manifest, installedPayloadDir) {
  const mismatches = [];
  const manifested = new Set(manifest.files.map((entry) => entry.path));
  for (const entry of manifest.files) {
    const target = join(installedPayloadDir, ...entry.path.split("/"));
    if (!existsSync(target)) {
      mismatches.push(entry.path);
      continue;
    }
    const bytes = readFileSync(target);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) mismatches.push(entry.path);
  }
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      const child = join(dir, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (statSync(child).isDirectory()) walk(child, relative);
      else if (!manifested.has(relative)) mismatches.push(`unmanifested:${relative}`);
    }
  };
  if (existsSync(installedPayloadDir)) walk(installedPayloadDir, "");
  return { ok: mismatches.length === 0, mismatches };
}

// Isolated install: copy the payload, verify every digest, leave a receipt.
// OUT-OF-LADDER evidence: nothing here claims the install ladder gate.
export function installPack({ packDir, targetDir, clock }) {
  if (typeof clock !== "function") fail("clock_required");
  const manifest = JSON.parse(readFileSync(join(packDir, "pack.manifest.json"), "utf8"));
  const payloadTarget = join(targetDir, "payload");
  cpSync(join(packDir, "payload"), payloadTarget, { recursive: true });
  const verdict = verifyInstalledCopy(manifest, payloadTarget);
  if (!verdict.ok) {
    // A failed install leaves NO copied bytes behind: an unverified payload
    // without a receipt would invite being mistaken for an install.
    rmSync(payloadTarget, { recursive: true, force: true });
    fail("install_integrity_failed", verdict.mismatches.join(","));
  }
  writeFileSync(join(targetDir, "install.receipt.json"), `${JSON.stringify({
    receipt: "install", pack_digest: manifest.pack_digest,
    verified_files: manifest.files.length, installed_at: clock(),
    ladder_note: "out_of_ladder_evidence: the install ladder gate is not claimed (integration/e2e/package/sbom/start gates are not defined for this pack yet)",
  }, null, 2)}\n`);
  return { payloadTarget, manifest };
}

// Isolated smoke: run the pack's own validators INSIDE the installed copy.
// Same out-of-ladder status as install — evidence, not a claimed gate.
export function runInstalledSmoke({ payloadDir, entries, clock, runner = nodeTestRunner }) {
  if (typeof clock !== "function") fail("clock_required");
  const result = runner(entries, { cwd: payloadDir });
  return {
    ok: result?.ok === true,
    summary: result ? result.summary : "runner_returned_nothing",
    ran_at: clock(),
    ladder_note: "out_of_ladder_evidence: the smoke ladder gate is not claimed",
  };
}

function cliMain() {
  const args = process.argv.slice(2);
  const value = (flag) => {
    const index = args.indexOf(flag);
    return index === -1 ? null : args[index + 1];
  };
  const specPath = value("--spec");
  const outDir = value("--out");
  if (!specPath || !outDir) {
    process.stderr.write("usage: node build_pack.mjs --spec <spec.json> --out <dist-dir> [--install-verify <target-dir> [--smoke]]\n");
    process.exit(2);
  }
  if (args.includes("--smoke") && !value("--install-verify")) {
    process.stderr.write("--smoke requires --install-verify <target-dir>: smoke runs INSIDE an installed copy\n");
    process.exit(2);
  }
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const clock = () => new Date().toISOString();
  const built = buildPack(specPath, { rootDir, outDir, clock });
  process.stdout.write(`built ${built.manifest.pack_id}@${built.manifest.version} pack_digest=${built.manifest.pack_digest}\n`);
  const installTarget = value("--install-verify");
  if (installTarget) {
    const installed = installPack({ packDir: built.packDir, targetDir: installTarget, clock });
    process.stdout.write(`installed+verified ${installed.manifest.files.length} files at ${installed.payloadTarget}\n`);
    if (args.includes("--smoke")) {
      const spec = loadPackSpec(specPath);
      const smoke = runInstalledSmoke({ payloadDir: installed.payloadTarget, entries: spec.smoke_test_entries, clock });
      writeFileSync(join(installTarget, "smoke.receipt.json"), `${JSON.stringify({ receipt: "smoke", ...smoke }, null, 2)}\n`);
      if (!smoke.ok) {
        process.stderr.write("smoke FAILED in installed copy\n");
        process.exit(1);
      }
      process.stdout.write("smoke passed in installed copy\n");
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cliMain();
}
