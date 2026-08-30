import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PACK_MANIFEST_SCHEMA,
  buildPack,
  installPack,
  loadPackSpec,
  runInstalledSmoke,
  verifyInstalledCopy,
} from "../tools/build_pack.mjs";

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
