import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PACK_MANIFEST_SCHEMA,
  buildPack,
  installPack,
  loadPackSpec,
  nodeSpecEmitter,
  nodeTestFlags,
  nodeTestRunner,
  runInstalledSmoke,
  verifyInstalledCopy,
} from "../tools/build_pack.mjs";
import { PACK_CATALOG } from "../src/deployment_pack_contract.mjs";
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

test("every Pack forbids host reboot and executable reboot surfaces fail closed before write", () => {
  const invalidPolicy = writeSpec(tempDir("specHostPolicy"), syntheticSpec({
    host_effect_policy: {
      reboot: "allowed",
      driver_change: "forbidden",
      system_update: "forbidden",
      service_restart_scope: "pack_services_only",
    },
  }));
  assert.throws(() => loadPackSpec(invalidPolicy), (error) => error.code === "spec_host_effect_policy_invalid");

  const root = syntheticRoot();
  const rebootPath = join(root, "guild_hall", "tool_workshop", "src", "reboot.ps1");
  writeFileSync(rebootPath, "& shutdown.exe /r /t 60\n");
  const specPath = writeSpec(root, syntheticSpec({
    content_roles: {
      resource_lease_helper: ["guild_hall/tool_workshop/src/reboot.ps1"],
      validators: ["guild_hall/tool_workshop/tests/tool_workshop_core.test.mjs"],
    },
  }));
  const out = tempDir("outReboot");
  assert.throws(() => buildPack(specPath, { rootDir: root, outDir: out, clock: fixedClock, runner: okRunner }),
    (error) => error.code === "pack_reboot_surface_forbidden");
  assert.equal(existsSync(join(out, "tool_workshop_pack")), false);
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

test("the real team_client_pack spec builds the Universal Client source set with a full installed smoke", () => {
  const specPath = join(REPO_ROOT, "guild_hall", "deployment_pack", "packs", "team_client_pack.spec.json");
  const built = buildPack(specPath, { rootDir: REPO_ROOT, outDir: tempDir("outTeamClient"), clock: fixedClock, runner: okRunner });
  assert.equal(built.manifest.pack_id, "team_client_pack");
  // Pinned so growth is a conscious re-emit (the emitter's --check gates it).
  assert.equal(built.manifest.files.length, 23);
  assert.equal(built.manifest.version, "0.2.1");
  assert.equal(built.manifest.files.some((entry) => entry.path.startsWith("ui-workspace/apps/soulforge-universal-client/")), true);
  assert.equal(built.manifest.files.some((entry) => entry.path.startsWith("ui-workspace/apps/team-ops-board/")), false,
    "4192 server code does not travel to client seats");
  assert.equal(built.manifest.files.some((entry) => entry.path.endsWith("generated/ingress_mtls_client.bundle.mjs")), true,
    "the installed Client carries a self-contained mTLS/MCP transport bundle");
  assert.equal(built.manifest.host_effect_policy.reboot, "forbidden");
  const spec = loadPackSpec(specPath);
  assert.equal(spec.installed_smoke_entries.length, spec.smoke_test_entries.length,
    "the declared installed smoke is the FULL suite");
  assert.deepEqual(spec.installed_smoke_excluded, []);
  assert.equal(spec.test_cwd, undefined);
});

test("installable packs deliver their operator manuals and cover the current manual catalog", (t) => {
  const catalog = JSON.parse(readFileSync(join(REPO_ROOT, "guild_hall/deployment_pack/manuals/manual_release_catalog.v0.json"), "utf8"));
  const delivered = new Set();
  const missing = [];
  const specs = [];
  for (const packId of ["hpp_server_pack", "team_client_pack", "backup_recovery_extension", "tool_workshop_pack"]) {
    const spec = loadPackSpec(join(REPO_ROOT, "guild_hall/deployment_pack/packs", `${packId}.spec.json`));
    specs.push({packId, spec});
    const files = new Set(Object.values(spec.content_roles).flat());
    for (const file of files) delivered.add(file);
    for (const row of catalog.procedure_mappings.filter(row => row.pack_id === packId)) {
      const manual = `guild_hall/deployment_pack/manuals/${row.semantic_role}.v0.md`;
      if (!files.has(manual)) missing.push(`${packId}:${row.semantic_role}`);
    }
  }
  for (const row of catalog.manuals) {
    const manual = `guild_hall/deployment_pack/manuals/${row.semantic_role}.v0.md`;
    if (!delivered.has(manual)) missing.push(`no_delivery:${row.semantic_role}`);
    assert.equal(`sha256:${createHash("sha256").update(readFileSync(join(REPO_ROOT, manual))).digest("hex")}`, row.content_digest);
  }
  assert.deepEqual([...new Set(missing)], [], "manual refs must resolve to delivered bytes, not just repository files");
  const root = tempDir("manual-delivery");
  t.after(() => rmSync(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}));
  for (const {packId, spec} of specs) {
    // This is a real byte-delivery contract check with synthetic unit results,
    // not a replacement for the independent source/installed execution suites.
    const built = buildPack(join(REPO_ROOT, "guild_hall/deployment_pack/packs", `${packId}.spec.json`),
      {rootDir: REPO_ROOT, outDir: join(root, `${packId}-build`), clock: fixedClock, runner: okRunner});
    const targetDir = join(root, `${packId}-installed`);
    installPack({packDir: built.packDir, targetDir, clock: fixedClock});
    const files = new Set(Object.values(spec.content_roles).flat());
    for (const row of catalog.manuals) {
      const manual = `guild_hall/deployment_pack/manuals/${row.semantic_role}.v0.md`;
      if (!files.has(manual)) continue;
      const installed = readFileSync(join(targetDir, "payload", manual));
      assert.equal(`sha256:${createHash("sha256").update(installed).digest("hex")}`, row.content_digest,
        `${packId}:${row.semantic_role} installed manual bytes`);
    }
  }
});

test("the real backup_recovery_extension spec builds: module pack with full-suite smoke, feature-OFF only", () => {
  const specPath = join(REPO_ROOT, "guild_hall", "deployment_pack", "packs", "backup_recovery_extension.spec.json");
  const built = buildPack(specPath, { rootDir: REPO_ROOT, outDir: tempDir("outBackupRec"), clock: fixedClock, runner: okRunner });
  assert.equal(built.manifest.pack_id, "backup_recovery_extension");
  // The emitter's --check owns closure drift; this test matches its declaration.
  assert.equal(built.manifest.files.length, Object.values(loadPackSpec(specPath).content_roles).flat().length);
  assert.equal(built.candidate.claimed_gate, "contract",
    "capture/restore/acceptance stay unclaimed - the initial gate needs Owner-side human acceptance");
  const spec = loadPackSpec(specPath);
  assert.equal(spec.content_roles.vendored_dependencies.some((path) => path === "node_modules/ajv/package.json"), true,
    "the full installed schema suite resolves its Ajv dependency inside the Pack");
  assert.equal(Object.keys(spec.vendored_file_sha256).length, spec.content_roles.vendored_dependencies.length);
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
  assert.equal(spec.content_roles.recovery_policy_adapter.includes(
    "guild_hall/backup_controller/topology_v2_actual_reader.mjs",
  ), true, "the read-only topology v2 actual reader travels with its pure judge");
  assert.equal(spec.content_roles.validators.includes(
    "guild_hall/backup_controller/topology_v2_actual_reader.test.mjs",
  ), true, "the topology v2 reader suite stays in the full installed smoke closure");
  assert.equal(spec.content_roles.shared_modules.includes(
    "guild_hall/deployment_pack/tools/build_pack.mjs",
  ), false, "the pack builder must not travel inside a feature-OFF read-only pack");
  assert.equal(spec.content_roles.recovery_policy_adapter.includes(
    "guild_hall/backup_controller/linear_lb1_project_index.mjs",
  ), true, "the whole-workspace project index travels with the physical generation writer");
  assert.equal(spec.content_roles.validators.includes(
    "guild_hall/backup_controller/linear_lb1_project_index.test.mjs",
  ), true, "the project partition and no-body-duplication checks stay in installed smoke");
  assert.equal(spec.content_roles.recovery_policy_adapter.includes(
    "guild_hall/backup_controller/linear_lb1_project_index_backfill_cli.mjs",
  ), true, "the explicit exact-digest backfill CLI travels with the recovery pack");
  assert.equal(spec.content_roles.validators.includes(
    "guild_hall/backup_controller/linear_lb1_project_index_backfill.test.mjs",
  ), true, "create-or-verify replay and drift checks stay in installed smoke");
  assert.equal(spec.content_roles.recovery_policy_adapter.includes(
    "guild_hall/backup_controller/preflight_v2.mjs",
  ), true, "the default-OFF target-topology preflight travels with the recovery pack");
  assert.equal(spec.content_roles.validators.includes(
    "guild_hall/backup_controller/preflight_v2.test.mjs",
  ), true, "the target-topology hostile suite stays in installed smoke");
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
    const spec = loadPackSpec(REAL_SPEC);
    const packedPaths = built.manifest.files.map(file => file.path).sort();
    assert.deepEqual(packedPaths, [...new Set(Object.values(spec.content_roles).flat())].sort());
    for (const required of [
      "guild_hall/tool_workshop/src/tool_workshop_durable.mjs",
      "guild_hall/tool_workshop/src/xlsx_tool_child.mjs",
      "ui-workspace/apps/dev-erp/tools/project_history_copy_xlsx.mjs",
      "guild_hall/shared/project_history_envelope.mjs",
    ]) assert.ok(packedPaths.includes(required), `actual writer dependency missing: ${required}`);
    const installed = installPack({ packDir: built.packDir, targetDir: target, clock: fixedClock });
    const smoke = runInstalledSmoke({ payloadDir: installed.payloadTarget, entries: spec.smoke_test_entries, concurrency: spec.test_concurrency, clock: fixedClock });
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
    // This test proves mechanics plus focused installed integration. Full-suite
    // evidence belongs to release_rehearsal.mjs and its actual run receipts.
    const built = buildPack(specPath, { rootDir: REPO_ROOT, outDir: out, clock: fixedClock, runner: okRunner });
    assert.equal(built.manifest.pack_id, "hpp_server_pack");
    // The set is the computed import closure PLUS the fs-read data closure
    // PLUS the vendored npm closure (yaml + ajv and its runtime deps under
    // payload-root node_modules) — pinned so growth is a conscious re-emit.
    const declared = loadPackSpec(specPath);
    assert.equal(built.manifest.files.length, Object.values(declared.content_roles).flat().length);
    assert.equal(built.candidate.claimed_gate, "contract");
    assert.equal(built.manifest.files.some((entry) => entry.path.startsWith("guild_hall/")), true,
      "the pack carries the guild_hall modules the server actually imports");
    assert.equal(built.manifest.files.some((entry) => entry.path.startsWith("node_modules/yaml/")), true,
      "the vendored npm closure travels at the payload root");
    assert.equal(built.manifest.files.some((entry) => entry.path.includes("static/skins/dungeons/") || entry.path.includes("static/skins/main.")), false,
      "owner-local private skin assets never travel in a release");
    assert.equal(built.manifest.files.some((entry) => entry.path.endsWith("static/skins/regions/forest.svg")), true,
      "the tracked public region fallback travels with the installed UI");
    assert.equal(built.manifest.files.some((entry) => entry.path === "guild_hall/workflow_runner/index.mjs"), true,
      "the ERP's computed core import resolves inside the installed Pack");
    assert.equal(built.manifest.files.some((entry) => entry.path === ".workflow/report_authoring_v0/runtime_binding.json"), true,
      "the exact static workflow binding and its declared bundle travel together");
    assert.equal(built.manifest.files.some((entry) => entry.path.endsWith("dev-erp-watchdog.ps1")), true,
      "the service-only watchdog travels after its PC-reboot surface is removed");
    assert.equal(built.manifest.files.some((entry) => entry.path.endsWith("runtime-path-contract.ps1")), true,
      "the shared installed-root and mutable-control-root contract travels with every launcher");
    for (const required of ["guild_hall/dev_worker/feedback_runtime_cli.mjs", "guild_hall/dev_worker/feedback_buzz_bridge.py",
      "guild_hall/secure_work/g2_linear_custody_cli.mjs", "guild_hall/secure_work/execution_authority.mjs",
      "guild_hall/secure_work/src/soulforge_secure_work/adapters.py",
      "guild_hall/dev_worker/FEEDBACK_READBOX.md", "guild_hall/dev_worker/feedback_restore.test.mjs"]) {
      assert.ok(built.manifest.files.some(entry => entry.path === required), `installed feedback closure: ${required}`);
    }
    // The installed-smoke declaration PARTITIONS the full suite: runnable
    // subset + evidence-backed exclusion ledger, nothing silent.
    const spec = loadPackSpec(specPath);
    assert.equal(spec.installed_smoke_entries.length + spec.installed_smoke_excluded.length, spec.smoke_test_entries.length);
    assert.equal(spec.installed_smoke_excluded.length, 0);
    for (const exclusion of spec.installed_smoke_excluded) {
      assert.match(exclusion.reason, /^requires_git_checkout/, exclusion.path);
    }
    const installed = installPack({ packDir: built.packDir, targetDir: target, clock: fixedClock });
    let observedSmoke;
    const smoke = runInstalledSmoke({
      payloadDir: installed.payloadTarget,
      entries: ["test/five_field_capture.test.mjs", "test/workflow_job_core_contract.test.mjs",
        "test/feedback_readbox_server.test.mjs", "test/feedback_recovery.test.mjs",
        "test/secure_work_local_transport_pack.test.mjs"],
      testCwd: "ui-workspace/apps/dev-erp",
      clock: fixedClock,
      runner: (entries, options) => { observedSmoke = nodeTestRunner(entries, options); return observedSmoke; },
    });
    assert.equal(smoke.ok, true, `real subset smoke inside the installed copy: ${smoke.summary}`);
    assert.equal(observedSmoke.counts.skipped, 0, "the actual installed workflow core tests execute instead of skipping");
    console.log(JSON.stringify({ hpp_installed_subset: observedSmoke.counts }));
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

/// The builder binds emitters per pack_id in PACK_CATALOG (never from the
// spec under audit), so the synthetic root carries a tiny but REAL emitter
// at the hpp_server_pack emitter path: it enumerates the fixture tree
// (src/*.mjs, tests/*.test.mjs), pins scan hits with the builder's own
// regex, and prints the spec in --print mode — the same contract the
// tracked emit_*_spec.mjs tools implement.
const CATALOG_EMITTER_REL = "guild_hall/deployment_pack/tools/emit_hpp_spec.mjs";
const SYNTH_APP = "guild_hall/synthetic_server";

function syntheticCatalogSpec(overrides = {}) {
  return syntheticSpec({
    pack_id: "hpp_server_pack",
    content_roles: {
      server_modules: [`${SYNTH_APP}/src/core.mjs`],
      validators: [`${SYNTH_APP}/tests/core.test.mjs`],
    },
    smoke_test_entries: [`${SYNTH_APP}/tests/core.test.mjs`],
    release_notes_ref: "release_notes.hpp_server_pack.v0_1_0",
    install_manual_ref: "manual.install.hpp_server_pack",
    upgrade_manual_ref: "manual.upgrade.hpp_server_pack",
    rollback_manual_ref: "manual.rollback.hpp_server_pack",
    ...overrides,
  });
}

function syntheticCatalogRoot() {
  const root = tempDir("catalogRoot");
  mkdirSync(join(root, ...SYNTH_APP.split("/"), "src"), { recursive: true });
  mkdirSync(join(root, ...SYNTH_APP.split("/"), "tests"), { recursive: true });
  writeFileSync(join(root, ...SYNTH_APP.split("/"), "src", "core.mjs"), "export const core = 1;\n");
  writeFileSync(join(root, ...SYNTH_APP.split("/"), "tests", "core.test.mjs"), "// synthetic test file\n");
  return root;
}

function writeCatalogEmitter(root, script) {
  const emitterPath = join(root, ...CATALOG_EMITTER_REL.split("/"));
  mkdirSync(dirname(emitterPath), { recursive: true });
  if (script !== undefined) {
    writeFileSync(emitterPath, script);
    return;
  }
  const buildPackUrl = pathToFileURL(join(REPO_ROOT, "guild_hall", "deployment_pack", "tools", "build_pack.mjs")).href;
  writeFileSync(emitterPath, [
    'import { createHash } from "node:crypto";',
    'import { readdirSync, readFileSync } from "node:fs";',
    'import { dirname, join, resolve } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    `import { SECRET_MATERIAL } from ${JSON.stringify(buildPackUrl)};`,
    'const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");',
    'const list = (rel, suffix) => readdirSync(join(ROOT, ...rel.split("/"))).filter((n) => n.endsWith(suffix)).sort().map((n) => rel + "/" + n);',
    `const contentRoles = { server_modules: list(${JSON.stringify(`${SYNTH_APP}/src`)}, ".mjs"), validators: list(${JSON.stringify(`${SYNTH_APP}/tests`)}, ".test.mjs") };`,
    "const reviewed = [];",
    "for (const rel of Object.values(contentRoles).flat()) {",
    '  const bytes = readFileSync(join(ROOT, ...rel.split("/")));',
    '  if (SECRET_MATERIAL.test(bytes.toString("utf8"))) reviewed.push({ path: rel, sha256: createHash("sha256").update(bytes).digest("hex") });',
    "}",
    `const spec = ${JSON.stringify(syntheticCatalogSpec())};`,
    "spec.content_roles = contentRoles;",
    "spec.smoke_test_entries = contentRoles.validators;",
    "spec.content_scan_reviewed_files = reviewed;",
    'if (!process.argv.includes("--print")) throw new Error("synthetic emitter only supports --print");',
    'process.stdout.write(JSON.stringify(spec, null, 2) + "\\n");',
    "",
  ].join("\n"));
}

// The real workflow: emit (recording the review), commit the bytes as the
// tracked spec, build from them. Uses the builder's own default emitter
// runner so the child-process contract is exercised for real.
function emitTrackedSpec(root) {
  const result = nodeSpecEmitter(CATALOG_EMITTER_REL, { rootDir: root });
  assert.equal(result.ok, true, result.summary);
  const specPath = join(root, "spec.json");
  writeFileSync(specPath, result.emitted);
  return specPath;
}

const FRESH = { verdict: "matches_live_tree", emitter: CATALOG_EMITTER_REL };

test("fresh-spec preflight: a spec the live tree has moved past refuses the build, names the drift and the emitter, writes nothing", () => {
  const root = syntheticCatalogRoot();
  writeCatalogEmitter(root);
  const specPath = emitTrackedSpec(root);
  // In sync: the build runs and the receipt records that the spec was recomputed.
  const fresh = buildPack(specPath, { rootDir: root, outDir: tempDir("outFresh"), clock: fixedClock, runner: okRunner });
  assert.deepEqual(fresh.specFreshness, FRESH);
  const receipt = JSON.parse(readFileSync(join(fresh.packDir, "receipts", "build.receipt.json"), "utf8"));
  assert.deepEqual(receipt.spec_freshness, FRESH);
  // A file lands in the tree after the last emit — the silent case: the old
  // builder packed the stale list and simply omitted it.
  const lateFile = join(root, ...SYNTH_APP.split("/"), "src", "added_after_emit.mjs");
  writeFileSync(lateFile, "export const late = true;\n");
  const outStale = tempDir("outStale");
  assert.throws(() => buildPack(specPath, { rootDir: root, outDir: outStale, clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_drifted_from_tree" && error.refusal === true
      && error.message.includes(`1 file(s) in the tree but not in the spec: ${SYNTH_APP}/src/added_after_emit.mjs`)
      && error.message.includes(`re-emit: node ${CATALOG_EMITTER_REL}`),
    "the refusal names the drifted path and the emitter to re-run");
  assert.equal(existsSync(join(outStale, "hpp_server_pack")), false, "a refused build leaves no artifact");
  // Re-emit (the documented remedy): the build now carries the new file.
  const reemitted = emitTrackedSpec(root);
  const rebuilt = buildPack(reemitted, { rootDir: root, outDir: tempDir("outReemit"), clock: fixedClock, runner: okRunner });
  assert.equal(rebuilt.manifest.files.length, 3);
  assert.equal(rebuilt.manifest.files.some((entry) => entry.path.endsWith("added_after_emit.mjs")), true);
  // A file removed after the emit is drift in the other direction.
  rmSync(lateFile);
  assert.throws(() => buildPack(reemitted, { rootDir: root, outDir: tempDir("outRemoved"), clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_drifted_from_tree"
      && error.message.includes(`1 file(s) in the spec but not in the tree: ${SYNTH_APP}/src/added_after_emit.mjs`));
  // The 2026-09-06 case: a PINNED file's bytes change after the emit. The
  // preflight names the stale pin up front, before the scan gate would.
  const core = join(root, ...SYNTH_APP.split("/"), "src", "core.mjs");
  writeFileSync(core, "const login = { password: \"hunter2-fixture\" };\n");
  const pinned = emitTrackedSpec(root);
  const pinnedBuild = buildPack(pinned, { rootDir: root, outDir: tempDir("outPinned"), clock: fixedClock, runner: okRunner });
  const pinnedReceipt = JSON.parse(readFileSync(join(pinnedBuild.packDir, "receipts", "build.receipt.json"), "utf8"));
  assert.equal(pinnedReceipt.content_scan.reviewed_hit_files, 1);
  writeFileSync(core, "const login = { password: \"hunter2-fixture\", retries: 3 };\n");
  assert.throws(() => buildPack(pinned, { rootDir: root, outDir: tempDir("outPinStale"), clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_drifted_from_tree"
      && error.message.includes(`1 scan pin(s) stale (pinned bytes changed): ${SYNTH_APP}/src/core.mjs`)
      && !error.message.includes("hunter2"),
    "a stale pin is reported as drift, by path only, never content");
  // A pinned file that stops hitting is ledger rot, named as such.
  writeFileSync(core, "export const core = 2;\n");
  assert.throws(() => buildPack(pinned, { rootDir: root, outDir: tempDir("outPinGone"), clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_drifted_from_tree"
      && error.message.includes(`1 scan pin(s) no longer hit: ${SYNTH_APP}/src/core.mjs`));
});

test("fresh-spec preflight: the binding is the catalog's, never the spec's — no opt-out, no emitter of the spec's choosing", () => {
  // No catalog emitter (the real tool_workshop_pack): builds, and the receipt
  // says the spec was NOT recomputed rather than implying a check.
  const workshopRoot = syntheticRoot();
  const plain = buildPack(writeSpec(tempDir("specPlain"), syntheticSpec()), { rootDir: workshopRoot, outDir: tempDir("outPlain"), clock: fixedClock, runner: okRunner });
  assert.deepEqual(plain.specFreshness, { verdict: "not_recomputed_no_emitter", emitter: null });
  const receipt = JSON.parse(readFileSync(join(plain.packDir, "receipts", "build.receipt.json"), "utf8"));
  assert.equal(receipt.spec_freshness.verdict, "not_recomputed_no_emitter");
  // A catalog-bound pack whose emitter is absent from the tree is refused —
  // nothing in the spec bytes can turn the preflight off.
  const root = syntheticCatalogRoot();
  const outGhost = tempDir("outGhost");
  assert.throws(() => buildPack(writeSpec(tempDir("specGhost"), syntheticCatalogSpec()),
    { rootDir: root, outDir: outGhost, clock: fixedClock, runner: okRunner }),
  (error) => error.code === "spec_emitter_failed" && error.message.includes(`${CATALOG_EMITTER_REL}:emitter_missing`));
  assert.equal(existsSync(join(outGhost, "hpp_server_pack")), false);
  // A spec that names some other script as its emitter is ignored AND drifted:
  // the catalog emitter runs, the spec's script never does.
  writeCatalogEmitter(root);
  const sidecar = join(root, "guild_hall", "sidecar.mjs");
  writeFileSync(sidecar, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(join(root, "side_effect.txt"))}, "ran\\n");\n`);
  const tracked = emitTrackedSpec(root);
  const doctored = { ...JSON.parse(readFileSync(tracked, "utf8")), spec_emitter: "guild_hall/sidecar.mjs" };
  assert.throws(() => buildPack(writeSpec(tempDir("specDoctored"), doctored),
    { rootDir: root, outDir: tempDir("outDoctored"), clock: fixedClock, runner: okRunner }),
  (error) => error.code === "spec_drifted_from_tree" && error.message.includes("other field(s) differ: spec_emitter"));
  assert.equal(existsSync(join(root, "side_effect.txt")), false, "the spec cannot choose what the builder executes");
  // An emitter that trips its own guard: its first stderr line travels, the build stops.
  writeCatalogEmitter(root, 'process.stderr.write("guard tripped: undeclared test files\\nsecond line stays out\\n"); process.exit(1);\n');
  const outBroken = tempDir("outBroken");
  assert.throws(() => buildPack(tracked, { rootDir: root, outDir: outBroken, clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_emitter_failed" && error.message.includes("guard tripped") && !error.message.includes("second line"));
  assert.equal(existsSync(join(outBroken, "hpp_server_pack")), false);
  // An emitter whose output is not a spec object is a broken emitter, not drift.
  writeCatalogEmitter(root, 'process.stdout.write("null\\n");\n');
  assert.throws(() => buildPack(tracked, { rootDir: root, outDir: tempDir("outNull"), clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_emitter_failed" && error.message.includes("not a spec object"));
  // A spec-shaped object with a malformed pin ledger is still a coded refusal.
  writeCatalogEmitter(root, 'process.stdout.write(JSON.stringify({ content_roles: "nope", content_scan_reviewed_files: [null, "x"] }) + "\\n");\n');
  assert.throws(() => buildPack(tracked, { rootDir: root, outDir: tempDir("outMalformed"), clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_drifted_from_tree" && error.refusal === true);
  // A throwing emitter: its Error line travels, not the frame header above it.
  writeCatalogEmitter(root, 'throw new Error("vendored dir missing");\n');
  assert.throws(() => buildPack(tracked, { rootDir: root, outDir: tempDir("outThrow"), clock: fixedClock, runner: okRunner }),
    (error) => error.code === "spec_emitter_failed" && error.message.includes("Error: vendored dir missing") && !error.message.includes("\n"));
  // Injected emitter contract: a non-result is a refusal too.
  assert.throws(() => buildPack(tracked, { rootDir: root, outDir: tempDir("outInj"), clock: fixedClock, runner: okRunner, emitter: () => undefined }),
    (error) => error.code === "spec_emitter_failed" && error.message.includes("emitter_returned_nothing"));
});

test("the catalog binds every emitted pack to a real emitter under the tools dir, and the specs carry no binding of their own", () => {
  for (const entry of PACK_CATALOG) {
    assert.equal(Object.hasOwn(entry, "spec_emitter"), true, `${entry.pack_id}: every catalog row declares its binding (null = hand-maintained)`);
  }
  const bound = PACK_CATALOG.filter((entry) => entry.spec_emitter !== null);
  assert.deepEqual(bound.map((entry) => entry.pack_id).sort(), ["backup_recovery_extension", "hpp_server_pack", "team_client_pack"]);
  for (const entry of bound) {
    assert.match(entry.spec_emitter, /^guild_hall\/deployment_pack\/tools\/emit_[a-z0-9_]+_spec\.mjs$/, entry.pack_id);
    assert.equal(existsSync(join(REPO_ROOT, ...entry.spec_emitter.split("/"))), true, entry.spec_emitter);
    const spec = JSON.parse(readFileSync(join(REPO_ROOT, "guild_hall", "deployment_pack", "packs", `${entry.pack_id}.spec.json`), "utf8"));
    assert.equal(spec.spec_emitter, undefined, `${entry.pack_id}: the spec under audit does not name its auditor`);
  }
});
