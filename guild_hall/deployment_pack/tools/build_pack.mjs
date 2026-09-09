// Pack builder — the first executable step of plan-12's release discipline.
//
// Builds ONE pack from a tracked spec into an untracked dist/ directory, and
// proves exactly what it can prove: the build/unit/contract gates. The
// emitted release candidate claims `contract` and nothing higher — the
// integration/e2e/package/full dependency-audit/start gates remain unclaimed,
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
// - fresh-spec preflight: a pack whose PACK_CATALOG entry names an emitter
//   (`spec_emitter`) is recomputed from the live tree through that emitter
//   before any other gate runs; a tracked spec the tree has moved past (file
//   set, scan pins, vendored hashes) refuses the build
//   (spec_drifted_from_tree) instead of quietly packing a stale file list.
// - the secret scan decodes bytes as UTF-8 and is therefore TEXT-ONLY: for a
//   future pack carrying binary payloads it is best-effort, not proof.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { recomputePackDigest } from "../../shared/pack_digest_recipe.mjs";
import { PACK_CATALOG, validatePackReleaseManifest } from "../src/deployment_pack_contract.mjs";
import { createPackSbom, readSbomFile, SBOM_LIMITS, SBOM_POLICY } from "../src/pack_sbom.mjs";
import { assertGenerationWriteTarget, readPackGeneration, verifyGenerationPayload, writeGenerationMetadata, writeSbomArtifacts } from "../src/pack_sbom_artifact.mjs";

export const PACK_SPEC_SCHEMA = "soulforge.deployment_pack_spec.v0";
export const PACK_MANIFEST_SCHEMA = "soulforge.deployment_pack_manifest.v0";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
// Repo-relative POSIX path: no absolute, no drive letter, no traversal.
const REL_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
export const SECRET_MATERIAL = /password|passwd|api[_-]?key|token_value|secret_value|private[_ ]key|BEGIN [A-Z ]+KEY/i;
const REBOOT_EXECUTION_SURFACE = /(?:shutdown(?:\.exe)?\s+\/r\b|Restart-Computer\b|InitiateSystemShutdown)/i;
const HOST_EFFECT_POLICY_FIELDS = ["reboot", "driver_change", "system_update", "service_restart_scope"];

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  // Marks a deliberate refusal (as opposed to a Node system error, which
  // also carries a .code): the CLI prints refusals without a stack.
  error.refusal = true;
  throw error;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// The canonical pack-digest recipe now lives in guild_hall/shared so a
// reader can recompute a pack digest without importing this builder. It is
// re-exported here because lifecycle tooling and the attestation round-trip
// test already reach for it through the builder.
export { recomputePackDigest };

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
  if (!raw.host_effect_policy || typeof raw.host_effect_policy !== "object" || Array.isArray(raw.host_effect_policy)
    || Object.keys(raw.host_effect_policy).sort().join(",") !== [...HOST_EFFECT_POLICY_FIELDS].sort().join(",")
    || raw.host_effect_policy.reboot !== "forbidden"
    || raw.host_effect_policy.driver_change !== "forbidden"
    || raw.host_effect_policy.system_update !== "forbidden"
    || raw.host_effect_policy.service_restart_scope !== "pack_services_only") {
    fail("spec_host_effect_policy_invalid");
  }
  if (!raw.content_roles || typeof raw.content_roles !== "object") fail("spec_roles_missing");
  for (const [role, files] of Object.entries(raw.content_roles)) {
    if (!pack.contains.includes(role)) fail("spec_role_not_in_pack_boundary", role);
    if (!Array.isArray(files) || files.length === 0) fail("spec_role_files_missing", role);
    for (const file of files) assertRelPath(file, `content_roles.${role}`);
  }
  if (!Array.isArray(raw.smoke_test_entries) || raw.smoke_test_entries.length === 0) fail("spec_smoke_entries_missing");
  for (const entry of raw.smoke_test_entries) assertRelPath(entry, "smoke_test_entries");
  // Optional test concurrency: suites engineered for a bounded parallelism
  // (dev-erp runs at 4 — its tests bind ports and temp DBs) declare it;
  // node's default (per-CPU) can collide them on wide machines.
  if (raw.test_concurrency !== undefined
    && !(Number.isSafeInteger(raw.test_concurrency) && raw.test_concurrency > 0 && raw.test_concurrency <= 32)) {
    fail("spec_test_concurrency_invalid");
  }
  // Optional test working directory, relative to the repo root at unit time
  // and to the installed payload at smoke time. Suites that assume their
  // app directory as cwd (dev-erp) declare it; entries are relative to it.
  if (raw.test_cwd !== undefined) assertRelPath(raw.test_cwd, "test_cwd");
  // Optional installed-copy smoke DECLARATION: when a suite cannot fully run
  // in a clean installed copy (parent node_modules dependencies, git-checkout
  // attestation, external tooling), the spec declares the runnable subset
  // AND an exclusion ledger with a reason per excluded entry. Exclusions are
  // visible data, never silence: every excluded entry must name a reason,
  // and entries may not appear in both lists.
  if (raw.installed_smoke_entries !== undefined) {
    if (!Array.isArray(raw.installed_smoke_entries) || raw.installed_smoke_entries.length === 0) {
      fail("spec_installed_smoke_invalid");
    }
    for (const entry of raw.installed_smoke_entries) assertRelPath(entry, "installed_smoke_entries");
    if (!Array.isArray(raw.installed_smoke_excluded)) fail("spec_installed_smoke_exclusions_missing");
    const included = new Set(raw.installed_smoke_entries);
    for (const exclusion of raw.installed_smoke_excluded) {
      if (!exclusion || typeof exclusion !== "object") fail("spec_installed_smoke_invalid");
      assertRelPath(exclusion.path, "installed_smoke_excluded.path");
      if (typeof exclusion.reason !== "string" || exclusion.reason.length === 0 || exclusion.reason.length > 200) {
        fail("spec_installed_smoke_invalid", exclusion.path);
      }
      if (included.has(exclusion.path)) fail("spec_installed_smoke_overlap", exclusion.path);
    }
    // The declaration must PARTITION the full smoke set: nothing dropped
    // silently between the two lists.
    const declared = new Set([...raw.installed_smoke_entries, ...raw.installed_smoke_excluded.map((entry) => entry.path)]);
    for (const entry of raw.smoke_test_entries) {
      if (!declared.has(entry)) fail("spec_installed_smoke_partition_incomplete", entry);
    }
  }
  // Optional pinned scan-review ledger: each entry accepts secret-REGEX hits
  // inside ONE exact file content (path + sha256). Reviewed means a human/
  // reviewer confirmed the hits are identifiers or synthetic fixtures, not
  // material. Any edit to a pinned file invalidates the pin (stale), and a
  // pin whose file no longer hits at all must be pruned (unused) — the
  // ledger can never silently rot in either direction.
  if (raw.content_scan_reviewed_files !== undefined) {
    if (!Array.isArray(raw.content_scan_reviewed_files)) fail("spec_scan_review_invalid");
    const seenPins = new Set();
    for (const entry of raw.content_scan_reviewed_files) {
      if (!entry || typeof entry !== "object") fail("spec_scan_review_invalid");
      assertRelPath(entry.path, "content_scan_reviewed_files.path");
      if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
        fail("spec_scan_review_invalid", entry.path);
      }
      if (seenPins.has(entry.path)) fail("spec_scan_review_duplicate", entry.path);
      seenPins.add(entry.path);
    }
  }
  return raw;
}

// Default gate runner: a real `node --test` child process. Tests inject a
// synthetic runner instead; the CLI uses this one.
export function nodeTestFlags(concurrency) {
  const flags = ["--test"];
  if (Number.isSafeInteger(concurrency) && concurrency > 0) flags.push(`--test-concurrency=${concurrency}`);
  return flags;
}

export function nodeTestRunner(entries, { cwd, concurrency, env, timeoutMs = 600_000 }) {
  const childEnv = { ...(env ?? process.env) };
  // A caller running under node --test otherwise forces the child into the
  // internal serialized reporter protocol despite --test-reporter=tap.
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [...nodeTestFlags(concurrency), "--test-reporter=tap", ...entries], {
    cwd, env: childEnv, encoding: "utf8", windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const counts = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const matches = [...stdout.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, "gm"))];
    counts[key] = matches.length ? Number(matches.at(-1)[1]) : null;
  }
  return {
    ok: result.status === 0,
    summary: `node --test exited ${result.status}`,
    exit_code: result.status, signal: result.signal, error_code: result.error?.code ?? null,
    counts, stdout, stderr: result.stderr ?? "",
    skipped_tests: stdout.split(/\r?\n/).filter((line) => /^\s*(?:not )?ok\b.*# SKIP\b/i.test(line)).map((line) => line.trim()),
  };
}

/// Default spec recompute for the fresh-spec preflight: run the pack's
// emitter (emit_*_spec.mjs, bound per pack_id in PACK_CATALOG) as a child
// process in --print mode — it emits the spec it would write for the live
// tree to stdout and, by the emitter contract, writes nothing. A child
// process rather than an import because the emitters are top-level scripts
// that themselves import SECRET_MATERIAL from this module. Tests inject a
// synthetic emitter instead; the CLI uses this one.
export function nodeSpecEmitter(emitterRelPath, { rootDir }) {
  const emitterPath = resolve(rootDir, ...emitterRelPath.split("/"));
  if (!existsSync(emitterPath)) return { ok: false, emitted: null, summary: "emitter_missing" };
  const result = spawnSync(process.execPath, [emitterPath, "--print"], {
    cwd: rootDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: 60_000,
  });
  if (result.error || result.status !== 0) {
    // One stderr line only, capped: an emitter's own guard message is one
    // line, and anything longer (a stack, a parser echo) could carry file
    // content into the refusal — paths only, never content. A throwing
    // emitter dumps a frame header first, so prefer its "Error:" line.
    const lines = (result.stderr ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const line = lines.find((candidate) => /^\w*(?:Error|Exception)\b/.test(candidate)) ?? lines[0] ?? "";
    const detail = result.error ? result.error.message : line.slice(0, 200);
    return { ok: false, emitted: null, summary: `emitter exited ${result.status}${detail ? `: ${detail}` : ""}` };
  }
  return { ok: true, emitted: result.stdout, summary: "emitter exited 0" };
}

const DRIFT_SAMPLE = 3;

// Human-readable drift summary: WHAT moved between the tracked spec and the
// recomputed one (both parsed), so the operator knows what to re-review
// before re-emitting (emitting records a review of the scan hits — it must
// never be blind). Paths, counts and field names only, never content.
function describeSpecDrift(tracked, emitted) {
  const sample = (list) => (list.length <= DRIFT_SAMPLE
    ? list.join(", ")
    : `${list.slice(0, DRIFT_SAMPLE).join(", ")} +${list.length - DRIFT_SAMPLE} more`);
  // Tolerant readers: the emitted object is untrusted shape-wise, and this
  // function only describes a refusal that has already been decided.
  const rolesIn = (spec) => (spec.content_roles && typeof spec.content_roles === "object" && !Array.isArray(spec.content_roles)
    ? spec.content_roles : {});
  const listOf = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
  const filesOf = (spec) => new Set(Object.values(rolesIn(spec)).flatMap(listOf));
  const rolesOf = (spec) => JSON.stringify(Object.keys(rolesIn(spec)).sort()
    .map((role) => [role, listOf(rolesIn(spec)[role]).sort()]));
  const pinsOf = (spec) => new Map((Array.isArray(spec.content_scan_reviewed_files) ? spec.content_scan_reviewed_files : [])
    .filter((entry) => entry && typeof entry === "object" && typeof entry.path === "string")
    .map((entry) => [entry.path, entry.sha256]));
  const trackedFiles = filesOf(tracked);
  const emittedFiles = filesOf(emitted);
  const trackedPins = pinsOf(tracked);
  const emittedPins = pinsOf(emitted);
  const added = [...emittedFiles].filter((path) => !trackedFiles.has(path)).sort();
  const removed = [...trackedFiles].filter((path) => !emittedFiles.has(path)).sort();
  const stale = [...emittedPins].filter(([path, sha]) => trackedPins.has(path) && trackedPins.get(path) !== sha).map(([path]) => path).sort();
  const unpinned = [...emittedPins.keys()].filter((path) => !trackedPins.has(path)).sort();
  const gone = [...trackedPins.keys()].filter((path) => !emittedPins.has(path)).sort();
  const trackedVendored = tracked.vendored_file_sha256 ?? {};
  const vendoredChanged = Object.entries(emitted.vendored_file_sha256 ?? {}).filter(([path, sha]) => trackedVendored[path] !== sha).length;
  const structural = new Set(["content_roles", "content_scan_reviewed_files", "vendored_file_sha256"]);
  const otherKeys = [...new Set([...Object.keys(tracked), ...Object.keys(emitted)])]
    .filter((key) => !structural.has(key) && JSON.stringify(tracked[key]) !== JSON.stringify(emitted[key])).sort();
  const parts = [];
  if (added.length) parts.push(`${added.length} file(s) in the tree but not in the spec: ${sample(added)}`);
  if (removed.length) parts.push(`${removed.length} file(s) in the spec but not in the tree: ${sample(removed)}`);
  if (!added.length && !removed.length && rolesOf(tracked) !== rolesOf(emitted)) {
    parts.push("content_roles assignment differs (same files, different roles)");
  }
  if (stale.length) parts.push(`${stale.length} scan pin(s) stale (pinned bytes changed): ${sample(stale)}`);
  if (unpinned.length) parts.push(`${unpinned.length} new scan hit(s) not yet pinned: ${sample(unpinned)}`);
  if (gone.length) parts.push(`${gone.length} scan pin(s) no longer hit: ${sample(gone)}`);
  if (vendoredChanged) parts.push(`${vendoredChanged} vendored file hash(es) changed`);
  if (otherKeys.length) parts.push(`other field(s) differ: ${otherKeys.join(", ")}`);
  if (parts.length === 0) parts.push("byte difference outside the compared fields (key order, line endings or whitespace)");
  return `spec drifted from the live tree: ${parts.join("; ")}`;
}

// Phase 0 (no writes by this builder): a pack whose catalog entry names an
// emitter must build from EXACTLY what that emitter emits for the live tree
// now — the same byte comparison the emitters' own --check performs, run
// here so a build can never quietly pack a stale file list (files added
// after the last emit would be omitted, new tests would never run, vendored
// byte pins would be bypassed). The binding lives in PACK_CATALOG, not in
// the spec: the artifact under audit cannot name (or drop) its own auditor.
// A pack whose catalog row binds spec_emitter: null is hand-maintained —
// nothing to recompute against — and the receipt says so instead of
// implying a check that never happened; every row must declare the key.
function assertSpecFresh(spec, specPath, { rootDir, emitter }) {
  const pack = PACK_CATALOG.find((entry) => entry.pack_id === spec.pack_id);
  if (!pack) fail("pack_id_unknown", String(spec.pack_id));
  const emitterRel = pack.spec_emitter;
  if (emitterRel === null || emitterRel === undefined) return { verdict: "not_recomputed_no_emitter", emitter: null };
  const result = emitter(emitterRel, { rootDir });
  if (!result || result.ok !== true || typeof result.emitted !== "string") {
    fail("spec_emitter_failed", `${emitterRel}:${result ? result.summary : "emitter_returned_nothing"}`);
  }
  let emittedSpec = null;
  try {
    emittedSpec = JSON.parse(result.emitted);
  } catch {
    emittedSpec = null;
  }
  if (!emittedSpec || typeof emittedSpec !== "object" || Array.isArray(emittedSpec)) {
    fail("spec_emitter_failed", `${emitterRel}:emitter output is not a spec object`);
  }
  const tracked = readFileSync(specPath, "utf8");
  if (tracked !== result.emitted) {
    let description;
    try {
      description = describeSpecDrift(spec, emittedSpec);
    } catch {
      // The refusal is already decided; a describer crash must not turn it
      // into an uncoded exception.
      description = "spec drifted from the live tree: emitter output has an unexpected shape";
    }
    fail("spec_drifted_from_tree", `${description} -- re-review the scan hits, then re-emit: node ${emitterRel}`);
  }
  return { verdict: "matches_live_tree", emitter: emitterRel };
}

// Phase 1 (pure, no writes): resolve + scan + hash every file, run the unit
// gate on the SOURCE tree, and assemble the deterministic manifest.
function prepare(spec, { rootDir, runner }) {
  const files = [];
  const seen = new Set();
  const reviewedPins = new Map();
  for (const entry of spec.content_scan_reviewed_files ?? []) {
    reviewedPins.set(entry.path, entry.sha256);
  }
  const consumedPins = new Set();
  let reviewedHitFiles = 0;
  for (const [role, rolePaths] of Object.entries(spec.content_roles)) {
    for (const relPath of rolePaths) {
      if (seen.has(relPath)) fail("spec_duplicate_file", relPath);
      seen.add(relPath);
      const absolute = resolve(rootDir, relPath);
      if (!absolute.startsWith(resolve(rootDir) + sep)) fail("spec_path_escapes_root", relPath);
      if (!existsSync(absolute)) fail("spec_file_missing", relPath);
      const bytes = readSbomFile(absolute, SBOM_LIMITS.file);
      const digest = sha256(bytes);
      if (spec.host_effect_policy.reboot === "forbidden"
        && /\.(?:ps1|bat|cmd|vbs|mjs|js)$/i.test(relPath)
        && !/(?:^|\/)(?:test|tests)(?:\/|$)/i.test(relPath)
        && REBOOT_EXECUTION_SURFACE.test(bytes.toString("utf8"))) {
        fail("pack_reboot_surface_forbidden", relPath);
      }
      // must-not-contain, enforced on CONTENT: any secret-material shape in
      // any packed file refuses the whole build — unless the spec carries an
      // exact reviewed pin for THIS content. The receipt names paths only,
      // never matching content.
      if (SECRET_MATERIAL.test(bytes.toString("utf8"))) {
        const pinned = reviewedPins.get(relPath);
        if (pinned === undefined) fail("pack_contains_secret_material", relPath);
        if (pinned !== digest) fail("scan_review_pin_stale", relPath);
        consumedPins.add(relPath);
        reviewedHitFiles += 1;
      }
      files.push({ path: relPath, role, sha256: digest, bytes: bytes.length, content: bytes });
    }
  }
  // A pin whose file is absent from the pack or no longer hits is ledger
  // rot: prune it deliberately, never carry it silently.
  for (const pinPath of reviewedPins.keys()) {
    if (!consumedPins.has(pinPath)) fail("scan_review_pin_unused", pinPath);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const digestInput = files.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes }));
  const packDigest = recomputePackDigest(digestInput);

  const unitCwd = spec.test_cwd ? join(rootDir, ...spec.test_cwd.split("/")) : rootDir;
  const unit = runner(spec.smoke_test_entries, { cwd: unitCwd, concurrency: spec.test_concurrency });
  if (!unit || unit.ok !== true) fail("unit_gate_failed", unit ? unit.summary : "runner_returned_nothing");

  const manifest = {
    schema: PACK_MANIFEST_SCHEMA,
    pack_id: spec.pack_id,
    version: spec.version,
    files: digestInput,
    content_roles: Object.fromEntries(Object.entries(spec.content_roles).map(([role, rolePaths]) => [role, [...rolePaths].sort()])),
    host_effect_policy: { ...spec.host_effect_policy },
    pack_digest: packDigest,
    sbom_policy: SBOM_POLICY,
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
    host_effect_policy: { ...spec.host_effect_policy },
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

  return {
    files, manifest, candidate, unitSummary: unit.summary,
    scan: { reviewed_hit_files: reviewedHitFiles, reviewed_pins: reviewedPins.size },
  };
}

export function buildPack(specPath, { rootDir, outDir, clock, runner = nodeTestRunner, emitter = nodeSpecEmitter }) {
  if (typeof clock !== "function") fail("clock_required");
  const spec = loadPackSpec(specPath);
  const specFreshness = assertSpecFresh(spec, specPath, { rootDir, emitter });
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
  const manifestBytes = Buffer.from(stableJson(prepared.manifest));
  writeFileSync(join(packDir, "pack.manifest.json"), manifestBytes);
  // Completed copied payload, exact manifest bytes, no alternate metadata root.
  // Sidecars are outside payload/, preserving the existing pack digest recipe.
  const sbom = createPackSbom({ manifestBytes, expectedManifestSha256: sha256(manifestBytes), payloadRoot: resolve(payloadDir) });
  writeSbomArtifacts(packDir, sbom);
  writeFileSync(join(packDir, "release.candidate.json"), stableJson(prepared.candidate));
  writeFileSync(join(receiptsDir, "build.receipt.json"), stableJson({
    receipt: "build", pack_digest: prepared.manifest.pack_digest,
    manifest_sha256: sha256(manifestBytes), sbom_sha256: sbom.evidence.sbom_sha256,
    sbom: sbom.evidence,
    file_count: prepared.files.length,
    // The scan-review ledger is VISIBLE in the receipt: how many packed
    // files carry secret-regex hits accepted under exact reviewed pins.
    content_scan: prepared.scan,
    // Whether this spec was recomputed from the live tree before building: a
    // hand-maintained spec is marked NOT recomputed rather than passing silently.
    spec_freshness: specFreshness,
    built_at: clock(),
  }));
  writeFileSync(join(receiptsDir, "unit.receipt.json"), stableJson({
    receipt: "unit", summary: prepared.unitSummary, ran_at: clock(),
  }));
  writeFileSync(join(receiptsDir, "contract.receipt.json"), stableJson({
    receipt: "contract", verdict: "ok", claimed_gate: "contract", checked_at: clock(),
  }));
  return { packDir, manifest: prepared.manifest, candidate: prepared.candidate, sbom: sbom.evidence, specFreshness };
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
  assertGenerationWriteTarget(targetDir);
  // A failed reattempt must not leave the previous operation's green receipt.
  rmSync(join(targetDir, "install.receipt.json"), { force: true });
  // Refuse a stripped/mixed/tampered source before copying any bytes.
  let generation;
  try { generation = readPackGeneration({ packDir }); }
  catch (error) {
    if (error.code === "sbom_payload_integrity" || error.code === "sbom_payload_file_set") fail("install_integrity_failed", error.code);
    throw error;
  }
  const { manifest } = generation;
  const payloadTarget = join(targetDir, "payload");
  cpSync(join(packDir, "payload"), payloadTarget, { recursive: true });
  // The manifest travels INTO the installed target (beside payload/): it is
  // the installed copy's source identity, and git-free source attestation
  // (pack_source_identity) self-verifies against exactly this file.
  const verdict = verifyInstalledCopy(manifest, payloadTarget);
  if (!verdict.ok) {
    // A failed install leaves NO copied bytes behind: an unverified payload
    // without a receipt would invite being mistaken for an install.
    rmSync(payloadTarget, { recursive: true, force: true });
    fail("install_integrity_failed", verdict.mismatches.join(","));
  }
  const sbom = verifyGenerationPayload(generation, resolve(payloadTarget));
  writeGenerationMetadata(targetDir, generation);
  writeFileSync(join(targetDir, "install.receipt.json"), `${JSON.stringify({
    receipt: "install", pack_digest: manifest.pack_digest,
    manifest_sha256: sbom.manifest_sha256, sbom_sha256: sbom.sbom_sha256, sbom,
    verified_files: manifest.files.length, installed_at: clock(),
    ladder_note: "out_of_ladder_evidence: file SBOM verification does not claim the full dependency-audit sbom gate or any higher release gate",
  }, null, 2)}\n`);
  return { payloadTarget, manifest };
}

// Isolated smoke: run the pack's own validators INSIDE the installed copy.
// Same out-of-ladder status as install — evidence, not a claimed gate.
// testCwd (the spec's test_cwd) is resolved against the installed payload.
export function runInstalledSmoke({ payloadDir, entries, testCwd, concurrency, clock, runner = nodeTestRunner }) {
  if (typeof clock !== "function") fail("clock_required");
  const cwd = testCwd ? join(payloadDir, ...testCwd.split("/")) : payloadDir;
  const result = runner(entries, { cwd, concurrency });
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
  let built;
  try {
    built = buildPack(specPath, { rootDir, outDir, clock });
  } catch (error) {
    // Deliberate refusals carry a code: print the reason without a stack so
    // the operator reads what to do (spec_drifted_from_tree names the drift
    // and the emitter to re-run), then exit non-zero.
    if (!error || error.refusal !== true) throw error;
    process.stderr.write(`build refused: ${error.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`built ${built.manifest.pack_id}@${built.manifest.version} pack_digest=${built.manifest.pack_digest} spec_freshness=${built.specFreshness.verdict}\n`);
  const installTarget = value("--install-verify");
  if (installTarget) {
    const installed = installPack({ packDir: built.packDir, targetDir: installTarget, clock });
    process.stdout.write(`installed+verified ${installed.manifest.files.length} files at ${installed.payloadTarget}\n`);
    if (args.includes("--smoke")) {
      const spec = loadPackSpec(specPath);
      // The installed-copy smoke runs the DECLARED runnable subset when one
      // exists; the exclusion ledger travels into the receipt so a green
      // smoke can never silently mean "the excluded part passed too".
      const smokeEntries = spec.installed_smoke_entries ?? spec.smoke_test_entries;
      const excluded = spec.installed_smoke_excluded ?? [];
      const smoke = runInstalledSmoke({ payloadDir: installed.payloadTarget, entries: smokeEntries, testCwd: spec.test_cwd, concurrency: spec.test_concurrency, clock });
      writeFileSync(join(installTarget, "smoke.receipt.json"), `${JSON.stringify({
        receipt: "smoke", ...smoke,
        entries_run: smokeEntries.length,
        excluded_count: excluded.length,
        excluded: excluded,
      }, null, 2)}\n`);
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
