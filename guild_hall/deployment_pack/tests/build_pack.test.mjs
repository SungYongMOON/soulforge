import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PACK_MANIFEST_SCHEMA,
  buildPack,
  installPack,
  loadPackSpec,
  nodeTestFlags,
  runInstalledSmoke,
  verifyInstalledCopy,
} from "../tools/build_pack.mjs";
import { readPackSourceIdentity } from "../../../ui-workspace/apps/dev-erp/src/pack_source_identity.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REAL_SPEC = join(REPO_ROOT, "guild_hall", "deployment_pack", "packs", "tool_workshop_pack.spec.json");

const fixedClock = () => "2026-08-30T12:00:00.000Z";
const okRunner = (entries, { cwd }) => ({ ok: true, summary: `synthetic ok (${entries.length} entries, cwd=${typeof cwd})` });
const failRunner = () => ({ ok: false, summary: "synthetic failure" });

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), `soulforge-pack-${label}-`));
}

function writeSpec(dir, spec) {
  const specPath = join(dir, "spec.json");
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  return specPath;
}

// A minimal synthetic repo root with a fake workshop file tree.
function syntheticRoot({ fileContent = "export const x = 1;\n" } = {}) {
  const root = tempDir("root");
  mkdirSync(join(root, "guild_hall", "tool_workshop", "src"), { recursive: true });
  mkdirSync(join(root, "guild_hall", "tool_workshop", "tests"), { recursive: true });
  writeFileSync(join(root, "guild_hall", "tool_workshop", "src", "tool_workshop_core.mjs"), fileContent);
  writeFileSync(join(root, "guild_hall", "tool_workshop", "tests", "tool_workshop_core.test.mjs"), "// synthetic test file\n");
  return root;
}

function syntheticSpec(overrides = {}) {
  return {
    schema: "soulforge.deployment_pack_spec.v0",
    pack_id: "tool_workshop_pack",
    version: "0.1.0",
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
    ...overrides,
  };
}

test("deterministic build: identical inputs yield byte-identical manifests and the same pack digest", () => {
  const root = syntheticRoot();
  const specPath = writeSpec(root, syntheticSpec());
  const outA = tempDir("outA");
  const outB = tempDir("outB");
  const first = buildPack(specPath, { rootDir: root, outDir: outA, clock: fixedClock, runner: okRunner });
  const second = buildPack(specPath, { rootDir: root, outDir: outB, clock: fixedClock, runner: okRunner });
  assert.equal(first.manifest.pack_digest, second.manifest.pack_digest);
  const manifestA = readFileSync(join(first.packDir, "pack.manifest.json"), "utf8");
  const manifestB = readFileSync(join(second.packDir, "pack.manifest.json"), "utf8");
  assert.equal(manifestA, manifestB, "manifests are byte-identical (no timestamps inside)");
  assert.equal(manifestA.includes("2026-08-30T12"), false, "no clock value leaks into the manifest");
  assert.equal(first.manifest.schema, PACK_MANIFEST_SCHEMA);
  assert.equal(first.manifest.claim, "pack_build_artifact_not_a_release");
  assert.equal(first.candidate.status, "draft");
  assert.equal(first.candidate.claimed_gate, "contract", "nothing above the contract gate is claimed");
  const buildReceipt = JSON.parse(readFileSync(join(first.packDir, "receipts", "build.receipt.json"), "utf8"));
  assert.equal(buildReceipt.built_at, "2026-08-30T12:00:00.000Z");
});

test("secret material in any packed file refuses the whole build and writes nothing", () => {
  const root = syntheticRoot({ fileContent: "const config = { password: \"hunter2\" };\n" });
  const specPath = writeSpec(root, syntheticSpec());
  const out = tempDir("outSecret");
  assert.throws(() => buildPack(specPath, { rootDir: root, outDir: out, clock: fixedClock, runner: okRunner }),
    (error) => error.code === "pack_contains_secret_material" && !error.message.includes("hunter2"),
    "the refusal names the path, never the content");
  assert.equal(existsSync(join(out, "tool_workshop_pack")), false, "a refused build leaves no artifact");
});

test("spec path shapes fail closed: traversal, absolute, drive-letter, unknown pack, bad semver, foreign role", () => {
  const root = syntheticRoot();
  const cases = [
    [syntheticSpec({ content_roles: { validators: ["../outside/evil.mjs"] } }), "spec_path_invalid"],
    [syntheticSpec({ content_roles: { validators: ["/etc/passwd-like"] } }), "spec_path_invalid"],
    // Concatenated so this tracked source never contains a literal drive path.
    [syntheticSpec({ content_roles: { validators: ["c" + ":/win" + "dows/system32/x"] } }), "spec_path_invalid"],
    [syntheticSpec({ pack_id: "mystery_pack" }), "pack_id_unknown"],
    [syntheticSpec({ version: "1.0" }), "version_not_semver"],
    [syntheticSpec({ content_roles: { customer_libraries: ["guild_hall/tool_workshop/src/tool_workshop_core.mjs"] } }), "spec_role_not_in_pack_boundary"],
  ];
  for (const [spec, expected] of cases) {
    const specPath = writeSpec(tempDir("spec"), spec);
    assert.throws(() => loadPackSpec(specPath), (error) => error.code === expected, expected);
  }
  // customer_libraries is in the pack's must_not_contain, and also simply not
  // in contains — either way the boundary holds.
  const missing = writeSpec(tempDir("spec"), syntheticSpec({
    content_roles: { validators: ["guild_hall/tool_workshop/tests/ghost.test.mjs"] },
  }));
  assert.throws(() => buildPack(missing, { rootDir: root, outDir: tempDir("outMissing"), clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_file_missing");
});

test("a failing unit gate refuses the build before any output exists", () => {
  const root = syntheticRoot();
  const specPath = writeSpec(root, syntheticSpec());
  const out = tempDir("outUnit");
  assert.throws(() => buildPack(specPath, { rootDir: root, outDir: out, clock: fixedClock, runner: failRunner }),
    (error) => error.code === "unit_gate_failed");
  assert.equal(existsSync(join(out, "tool_workshop_pack")), false);
});

test("install verifies every digest; a corrupted installed file is named and fails closed", () => {
  const root = syntheticRoot();
  const specPath = writeSpec(root, syntheticSpec());
  const built = buildPack(specPath, { rootDir: root, outDir: tempDir("outInstall"), clock: fixedClock, runner: okRunner });
  const target = tempDir("target");
  const installed = installPack({ packDir: built.packDir, targetDir: target, clock: fixedClock });
  assert.equal(existsSync(join(target, "install.receipt.json")), true);
  const receipt = JSON.parse(readFileSync(join(target, "install.receipt.json"), "utf8"));
  assert.equal(receipt.ladder_note.startsWith("out_of_ladder_evidence"), true, "install is evidence, never a claimed ladder gate");
  // Corrupt one installed file: verification must name exactly that path.
  const victim = join(installed.payloadTarget, "guild_hall", "tool_workshop", "src", "tool_workshop_core.mjs");
  writeFileSync(victim, "tampered\n");
  const verdict = verifyInstalledCopy(built.manifest, installed.payloadTarget);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.mismatches, ["guild_hall/tool_workshop/src/tool_workshop_core.mjs"]);
  // An UNMANIFESTED extra file is also a failure: bytes under a green
  // receipt must all be accounted for.
  writeFileSync(victim, readFileSync(join(built.packDir, "payload", "guild_hall", "tool_workshop", "src", "tool_workshop_core.mjs")));
  writeFileSync(join(installed.payloadTarget, "guild_hall", "smuggled.mjs"), "// not in the manifest\n");
  const extras = verifyInstalledCopy(built.manifest, installed.payloadTarget);
  assert.equal(extras.ok, false);
  assert.deepEqual(extras.mismatches, ["unmanifested:guild_hall/smuggled.mjs"]);
  // A fresh install from a tampered-at-rest pack dir fails closed AND
  // removes the unverified copy: no receipt-less payload is left behind.
  const packVictim = join(built.packDir, "payload", "guild_hall", "tool_workshop", "src", "tool_workshop_core.mjs");
  writeFileSync(packVictim, "tampered at rest\n");
  const target2 = tempDir("target2");
  assert.throws(() => installPack({ packDir: built.packDir, targetDir: target2, clock: fixedClock }),
    (error) => error.code === "install_integrity_failed");
  assert.equal(existsSync(join(target2, "payload")), false, "a failed install leaves no copied bytes");
});

test("builder and reader agree: an installed pack's attested identity is the built pack_digest, recomputed", () => {
  // Round-trip contract with the git-free attestation reader
  // (ui-workspace/apps/dev-erp/src/pack_source_identity.mjs): the reader
  // recomputes the digest with the builder's exact recipe, so this test
  // pins the two recipes to each other — a recipe drift on either side
  // fails here before it can strand an installed copy.
  const root = syntheticRoot();
  const specPath = writeSpec(root, syntheticSpec());
  const built = buildPack(specPath, { rootDir: root, outDir: tempDir("outIdentity"), clock: fixedClock, runner: okRunner });
  const target = tempDir("targetIdentity");
  installPack({ packDir: built.packDir, targetDir: target, clock: fixedClock });
  const moduleDir = join(target, "payload", "guild_hall", "tool_workshop", "src");
  const identity = readPackSourceIdentity(moduleDir, { verify: "all" });
  assert.equal(identity.pack_digest, built.manifest.pack_digest);
  assert.equal(identity.verified_files, built.manifest.files.length);
  // A digest edited in place (decoupled from the entries) must be refused:
  // the reader recomputes rather than echoes.
  const manifestPath = join(target, "pack.manifest.json");
  const doctored = JSON.parse(readFileSync(manifestPath, "utf8"));
  doctored.pack_digest = "e".repeat(64);
  writeFileSync(manifestPath, JSON.stringify(doctored, null, 2));
  assert.throws(() => readPackSourceIdentity(moduleDir, { verify: "all" }),
    (error) => error.code === "pack_source_manifest_invalid");
});

test("the real team_client_pack spec builds: source pack with shared-module closure, full-suite smoke declared", () => {
  const specPath = join(REPO_ROOT, "guild_hall", "deployment_pack", "packs", "team_client_pack.spec.json");
  const built = buildPack(specPath, { rootDir: REPO_ROOT, outDir: tempDir("outTeamClient"), clock: fixedClock, runner: okRunner });
  assert.equal(built.manifest.pack_id, "team_client_pack");
  // Pinned so growth is a conscious re-emit (the emitter's --check gates it).
  assert.equal(built.manifest.files.length, 214);
  assert.equal(built.manifest.files.some((entry) => entry.path.startsWith("guild_hall/")), true,
    "the Board's cross-root guild_hall imports travel as shared_modules");
  const spec = loadPackSpec(specPath);
  assert.equal(spec.installed_smoke_entries.length, spec.smoke_test_entries.length,
    "the declared installed smoke is the FULL suite");
  assert.deepEqual(spec.installed_smoke_excluded, []);
  assert.equal(spec.test_cwd, "ui-workspace/apps/team-ops-board");
});

test("the real backup_recovery_extension spec builds: module pack with full-suite smoke, feature-OFF only", () => {
  const specPath = join(REPO_ROOT, "guild_hall", "deployment_pack", "packs", "backup_recovery_extension.spec.json");
  const built = buildPack(specPath, { rootDir: REPO_ROOT, outDir: tempDir("outBackupRec"), clock: fixedClock, runner: okRunner });
  assert.equal(built.manifest.pack_id, "backup_recovery_extension");
  // Pinned so growth is a conscious re-emit (the emitter's --check gates it).
  assert.equal(built.manifest.files.length, 54);
  assert.equal(built.candidate.claimed_gate, "contract",
    "capture/restore/acceptance stay unclaimed - the initial gate needs Owner-side human acceptance");
  const spec = loadPackSpec(specPath);
  assert.equal(spec.content_roles.recovery_policy_adapter.includes(
    "guild_hall/backup_controller/linear_lb1_actual_reader.mjs",
  ), true, "the default-OFF actual reader travels with its backup contract");
  assert.equal(spec.content_roles.validators.includes(
    "guild_hall/backup_controller/linear_lb1_actual_reader.test.mjs",
  ), true, "the actual-reader contract stays in the full installed smoke closure");
  assert.equal(spec.content_roles.recovery_policy_adapter.includes(
    "guild_hall/backup_controller/linear_lb1_physical_one_shot.mjs",
  ), true, "the default-inert physical one-shot travels with its exact private binding gate");
  assert.equal(spec.content_roles.validators.includes(
    "guild_hall/backup_controller/linear_lb1_physical_one_shot.test.mjs",
  ), true, "the physical one-shot hostile suite stays in the full installed smoke closure");
  assert.equal(spec.installed_smoke_entries.length, spec.smoke_test_entries.length,
    "the declared installed smoke is the FULL module suite");
  assert.deepEqual(spec.installed_smoke_excluded, []);
});

test("a same-outDir rebuild clears the pack dir: dropped files can never survive as orphans", () => {
  const root = syntheticRoot();
  const extraPath = join(root, "guild_hall", "tool_workshop", "src", "dropped_later.mjs");
  writeFileSync(extraPath, "export const dropped = true;\n");
  const out = tempDir("outRebuild");
  const withExtra = syntheticSpec({
    content_roles: {
      resource_lease_helper: [
        "guild_hall/tool_workshop/src/tool_workshop_core.mjs",
        "guild_hall/tool_workshop/src/dropped_later.mjs",
      ],
      validators: ["guild_hall/tool_workshop/tests/tool_workshop_core.test.mjs"],
    },
  });
  const first = buildPack(writeSpec(tempDir("specA"), withExtra), { rootDir: root, outDir: out, clock: fixedClock, runner: okRunner });
  assert.equal(first.manifest.files.length, 3);
  const second = buildPack(writeSpec(tempDir("specB"), syntheticSpec()), { rootDir: root, outDir: out, clock: fixedClock, runner: okRunner });
  assert.equal(second.manifest.files.length, 2);
  const orphan = join(second.packDir, "payload", "guild_hall", "tool_workshop", "src", "dropped_later.mjs");
  assert.equal(existsSync(orphan), false, "the rebuilt payload holds only manifested files");
  const verdict = verifyInstalledCopy(second.manifest, join(second.packDir, "payload"));
  assert.equal(verdict.ok, true);
  // Canonicality: dot segments are rejected outright.
  for (const bad of ["./guild_hall/x.mjs", "guild_hall/./x.mjs", "guild_hall/.../x.mjs"]) {
    const spec = syntheticSpec({ content_roles: { validators: [bad] } });
    assert.throws(() => loadPackSpec(writeSpec(tempDir("specDot"), spec)),
      (error) => error.code === "spec_path_invalid", bad);
  }
});

test("smoke runs the pack validators inside the installed copy and records out-of-ladder evidence", () => {
  const root = syntheticRoot();
  const specPath = writeSpec(root, syntheticSpec());
  const built = buildPack(specPath, { rootDir: root, outDir: tempDir("outSmoke"), clock: fixedClock, runner: okRunner });
  const target = tempDir("targetSmoke");
  const installed = installPack({ packDir: built.packDir, targetDir: target, clock: fixedClock });
  let smokeCwd = null;
  const spyRunner = (entries, { cwd }) => { smokeCwd = cwd; return { ok: true, summary: "spy ok" }; };
  const smoke = runInstalledSmoke({
    payloadDir: installed.payloadTarget,
    entries: ["guild_hall/tool_workshop/tests/tool_workshop_core.test.mjs"],
    clock: fixedClock, runner: spyRunner,
  });
  assert.equal(smoke.ok, true);
  assert.equal(smokeCwd, installed.payloadTarget, "smoke runs INSIDE the installed copy, not the source tree");
  assert.equal(smoke.ladder_note.startsWith("out_of_ladder_evidence"), true);
  const broken = runInstalledSmoke({ payloadDir: installed.payloadTarget, entries: ["x"], clock: fixedClock, runner: failRunner });
  assert.equal(broken.ok, false);
});

test("end to end against the REAL tracked spec: build, install, and smoke the actual tool_workshop pack", () => {
  const out = tempDir("outReal");
  const target = tempDir("targetReal");
  try {
    const built = buildPack(REAL_SPEC, { rootDir: REPO_ROOT, outDir: out, clock: fixedClock });
    assert.equal(built.manifest.pack_id, "tool_workshop_pack");
    assert.equal(built.manifest.files.length, 4, "core, tests, README, manifest");
    const installed = installPack({ packDir: built.packDir, targetDir: target, clock: fixedClock });
    const spec = loadPackSpec(REAL_SPEC);
    const smoke = runInstalledSmoke({ payloadDir: installed.payloadTarget, entries: spec.smoke_test_entries, clock: fixedClock });
    assert.equal(smoke.ok, true, `the real workshop suite must pass inside the installed copy: ${smoke.summary}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("scan-review pins accept exact reviewed content and rot in neither direction", () => {
  const root = syntheticRoot({ fileContent: "const login = { password: \"hunter2-fixture\" };\n" });
  const coreBytes = readFileSync(join(root, "guild_hall", "tool_workshop", "src", "tool_workshop_core.mjs"));
  const coreSha = createHash("sha256").update(coreBytes).digest("hex");
  const basePins = [{ path: "guild_hall/tool_workshop/src/tool_workshop_core.mjs", sha256: coreSha }];
  // 1) Exact pin: the hit is accepted, and the receipt makes it VISIBLE.
  const okBuild = buildPack(
    writeSpec(tempDir("specPin"), syntheticSpec({ content_scan_reviewed_files: basePins })),
    { rootDir: root, outDir: tempDir("outPin"), clock: fixedClock, runner: okRunner },
  );
  const receipt = JSON.parse(readFileSync(join(okBuild.packDir, "receipts", "build.receipt.json"), "utf8"));
  assert.deepEqual(receipt.content_scan, { reviewed_hit_files: 1, reviewed_pins: 1 });
  // 2) Stale pin: editing the pinned file demands a re-review.
  const staleSpec = syntheticSpec({
    content_scan_reviewed_files: [{ path: basePins[0].path, sha256: "b".repeat(64) }],
  });
  assert.throws(() => buildPack(writeSpec(tempDir("specStale"), staleSpec),
    { rootDir: root, outDir: tempDir("outStale"), clock: fixedClock, runner: okRunner }),
  (error) => error.code === "scan_review_pin_stale");
  // 3) Unused pin: a pin whose file no longer hits must be pruned.
  const cleanRoot = syntheticRoot();
  const cleanBytes = readFileSync(join(cleanRoot, "guild_hall", "tool_workshop", "src", "tool_workshop_core.mjs"));
  const cleanSha = createHash("sha256").update(cleanBytes).digest("hex");
  assert.throws(() => buildPack(
    writeSpec(tempDir("specUnused"), syntheticSpec({
      content_scan_reviewed_files: [{ path: basePins[0].path, sha256: cleanSha }],
    })),
    { rootDir: cleanRoot, outDir: tempDir("outUnused"), clock: fixedClock, runner: okRunner },
  ), (error) => error.code === "scan_review_pin_unused");
  // 4) Unpinned hits still refuse exactly as before.
  assert.throws(() => buildPack(writeSpec(tempDir("specNoPin"), syntheticSpec()),
    { rootDir: root, outDir: tempDir("outNoPin"), clock: fixedClock, runner: okRunner }),
  (error) => error.code === "pack_contains_secret_material");
  // 5) Malformed ledger entries fail at spec load.
  for (const bad of [[{ path: "guild_hall/x.mjs" }], [{ path: "../evil", sha256: "a".repeat(64) }], "not-a-list"]) {
    assert.throws(() => loadPackSpec(writeSpec(tempDir("specBadPin"), syntheticSpec({ content_scan_reviewed_files: bad }))),
      (error) => String(error.code).startsWith("spec_"), JSON.stringify(bad).slice(0, 40));
  }
});

test("the installed-smoke declaration must partition the full smoke set with reasons, no overlap, no silence", () => {
  const entry = "guild_hall/tool_workshop/tests/tool_workshop_core.test.mjs";
  // Runnable subset + exclusion ledger covering the rest -> valid.
  const good = syntheticSpec({
    smoke_test_entries: [entry, "guild_hall/tool_workshop/src/tool_workshop_core.mjs"],
    installed_smoke_entries: [entry],
    installed_smoke_excluded: [{ path: "guild_hall/tool_workshop/src/tool_workshop_core.mjs", reason: "npm_dependency_example" }],
  });
  assert.equal(loadPackSpec(writeSpec(tempDir("specPart"), good)).installed_smoke_excluded.length, 1);
  // A smoke entry in neither list is silent dropping -> refused.
  assert.throws(() => loadPackSpec(writeSpec(tempDir("specPart"), syntheticSpec({
    smoke_test_entries: [entry, "guild_hall/tool_workshop/src/tool_workshop_core.mjs"],
    installed_smoke_entries: [entry],
    installed_smoke_excluded: [],
  }))), (error) => error.code === "spec_installed_smoke_partition_incomplete");
  // The same entry in both lists is contradictory -> refused.
  assert.throws(() => loadPackSpec(writeSpec(tempDir("specPart"), syntheticSpec({
    smoke_test_entries: [entry],
    installed_smoke_entries: [entry],
    installed_smoke_excluded: [{ path: entry, reason: "x_reason" }],
  }))), (error) => error.code === "spec_installed_smoke_overlap");
  // An exclusion without a reason is not a ledger -> refused.
  assert.throws(() => loadPackSpec(writeSpec(tempDir("specPart"), syntheticSpec({
    smoke_test_entries: [entry],
    installed_smoke_entries: [entry],
    installed_smoke_excluded: [{ path: "guild_hall/tool_workshop/src/tool_workshop_core.mjs", reason: "" }],
  }))), (error) => error.code === "spec_installed_smoke_invalid");
});

test("end to end against the REAL tracked hpp_server_pack spec: build, install, and subset-smoke the actual server pack", () => {
  const out = tempDir("outHpp");
  const target = tempDir("targetHpp");
  try {
    const specPath = join(REPO_ROOT, "guild_hall", "deployment_pack", "packs", "hpp_server_pack.spec.json");
    // The unit gate here is a synthetic runner: the REAL full-suite unit and
    // smoke gates ran via the CLI evidence run (receipts in dist/); this
    // repo test proves build/install mechanics on the real pinned file set
    // plus a REAL smoke SUBSET inside the installed copy.
    const built = buildPack(specPath, { rootDir: REPO_ROOT, outDir: out, clock: fixedClock, runner: okRunner });
    assert.equal(built.manifest.pack_id, "hpp_server_pack");
    // The set is the computed import closure PLUS the fs-read data closure
    // PLUS the vendored npm closure (yaml + ajv and its runtime deps under
    // payload-root node_modules) — pinned so growth is a conscious re-emit.
    assert.equal(built.manifest.files.length, 941);
    assert.equal(built.candidate.claimed_gate, "contract");
    assert.equal(built.manifest.files.some((entry) => entry.path.startsWith("guild_hall/")), true,
      "the pack carries the guild_hall modules the server actually imports");
    assert.equal(built.manifest.files.some((entry) => entry.path.startsWith("node_modules/yaml/")), true,
      "the vendored npm closure travels at the payload root");
    // The installed-smoke declaration PARTITIONS the full suite: runnable
    // subset + evidence-backed exclusion ledger, nothing silent.
    const spec = loadPackSpec(specPath);
    assert.equal(spec.installed_smoke_entries.length + spec.installed_smoke_excluded.length, spec.smoke_test_entries.length);
    assert.equal(spec.installed_smoke_excluded.length, 0);
    for (const exclusion of spec.installed_smoke_excluded) {
      assert.match(exclusion.reason, /^requires_git_checkout/, exclusion.path);
    }
    const installed = installPack({ packDir: built.packDir, targetDir: target, clock: fixedClock });
    const smoke = runInstalledSmoke({
      payloadDir: installed.payloadTarget,
      entries: ["test/five_field_capture.test.mjs"],
      testCwd: "ui-workspace/apps/dev-erp",
      clock: fixedClock,
    });
    assert.equal(smoke.ok, true, `real subset smoke inside the installed copy: ${smoke.summary}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("test_concurrency: flag assembly is exact and the spec loader rejects out-of-range values", () => {
  assert.deepEqual(nodeTestFlags(4), ["--test", "--test-concurrency=4"]);
  assert.deepEqual(nodeTestFlags(undefined), ["--test"], "unset concurrency keeps node's default");
  assert.deepEqual(nodeTestFlags(0), ["--test"], "non-positive values never emit a flag");
  for (const bad of [0, 33, 2.5, "4"]) {
    const spec = syntheticSpec({ test_concurrency: bad });
    assert.throws(() => loadPackSpec(writeSpec(tempDir("specConc"), spec)),
      (error) => error.code === "spec_test_concurrency_invalid", String(bad));
  }
  const good = loadPackSpec(writeSpec(tempDir("specConc"), syntheticSpec({ test_concurrency: 4 })));
  assert.equal(good.test_concurrency, 4);
});

test("the hpp spec byte-pins every vendored file, so vendored drift fails --check instead of flowing into a pack", () => {
  const spec = loadPackSpec(join(REPO_ROOT, "guild_hall", "deployment_pack", "packs", "hpp_server_pack.spec.json"));
  const hashes = spec.vendored_file_sha256;
  const vendored = spec.content_roles.vendored_dependencies;
  assert.equal(Object.keys(hashes).length, vendored.length, "one sha per vendored file");
  for (const rel of vendored) {
    assert.match(hashes[rel], /^[a-f0-9]{64}$/, rel);
  }
  const sample = vendored.find((rel) => rel.endsWith("package.json"));
  const digest = createHash("sha256").update(readFileSync(join(REPO_ROOT, ...sample.split("/")))).digest("hex");
  assert.equal(hashes[sample], digest, "recorded sha matches live bytes");
});
