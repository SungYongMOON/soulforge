import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, linkSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { recomputePackDigest } from "../../shared/pack_digest_recipe.mjs";
import { createPackSbom, verifyPackSbom, sha256, encodeSbomJson, SBOM_LIMITS, SBOM_POLICY } from "../src/pack_sbom.mjs";
import { validateCycloneDx16 } from "../src/pack_sbom_schema.mjs";
import { readPackGeneration, writeSbomArtifacts } from "../src/pack_sbom_artifact.mjs";
import { packSbomMain } from "../tools/pack_sbom.mjs";
import { buildPack, installPack } from "../tools/build_pack.mjs";
import { backupPack, upgradePack, rollbackPack, restorePack } from "../tools/pack_lifecycle.mjs";
import { readPackSourceIdentity } from "../../../ui-workspace/apps/dev-erp/src/pack_source_identity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const clock = () => "2026-09-08T00:00:00.000Z";
const temp = () => mkdtempSync(join(tmpdir(), "soulforge-sbom-"));
const descriptor = (extra = {}) => ({ name: "synthetic-app", version: "1.2.3", license: "MIT", dependencies: { alpha: "^1.0.0", beta: "~2.0.0" }, ...extra });
function fixture(values = { "app/main.mjs": "export const x = 1;\n", "app/package.json": JSON.stringify(descriptor()) }) {
  const packDir = temp(), payloadRoot = join(packDir, "payload");
  mkdirSync(payloadRoot);
  const files = Object.entries(values).sort(([a], [b]) => a < b ? -1 : 1).map(([path, content]) => {
    const bytes = Buffer.from(content), full = join(payloadRoot, path);
    mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, bytes);
    return { path, sha256: sha256(bytes), bytes: bytes.length };
  });
  const manifest = { schema: "soulforge.deployment_pack_manifest.v0", pack_id: "team_client_pack", version: "0.2.0", files,
    pack_digest: recomputePackDigest(files), sbom_policy: SBOM_POLICY, claim: "pack_build_artifact_not_a_release" };
  return seal({ packDir, payloadRoot, manifest });
}
function seal(f) {
  f.manifest.pack_digest = recomputePackDigest(f.manifest.files);
  f.manifestBytes = encodeSbomJson(f.manifest); f.expectedManifestSha256 = sha256(f.manifestBytes);
  writeFileSync(join(f.packDir, "pack.manifest.json"), f.manifestBytes);
  return f;
}
function generated(f = fixture()) { const result = createPackSbom(f); writeSbomArtifacts(f.packDir, result); return { ...f, ...result }; }
const rejects = (fn, code) => assert.throws(fn, (error) => error.code === code, code);

test("same manifest and verified payload deterministically produce full file evidence and declared-only descriptors", () => {
  const f = fixture(), first = createPackSbom(f), second = createPackSbom(f);
  assert.deepEqual(first.bytes, second.bytes);
  const bom = JSON.parse(first.bytes);
  assert.equal(bom.components.length, 3);
  assert.equal(bom.dependencies, undefined);
  assert.equal(first.evidence.files, 2);
  assert.equal(first.evidence.npm_descriptors, 1);
  assert.equal(first.evidence.payload_integrity, "VERIFIED");
  assert.equal(first.evidence.runtime_dependency_graph, "UNKNOWN");
  assert.equal(first.evidence.vulnerability_scan, "NOT_RUN");
  assert.equal(first.evidence.license_approval, "NOT_RUN");
  assert.equal(first.evidence.release_acceptance, "NOT_GRANTED");
  assert.equal(first.evidence.authenticity, "NOT_VERIFIED");
  assert.equal(first.bytes.includes(Buffer.from(f.payloadRoot)), false);
  assert.equal(verifyPackSbom({ ...f, sbomBytes: first.bytes }).evidence.sbom_sha256, sha256(first.bytes));
  const changed = JSON.parse(first.bytes); changed.components.pop();
  rejects(() => verifyPackSbom({ ...f, sbomBytes: encodeSbomJson(changed) }), "sbom_bytes_mismatch");
});

test("a required exact manifest pin and actual root cannot be replaced by a descriptor-only root", () => {
  const f = fixture();
  rejects(() => createPackSbom({ ...f, expectedManifestSha256: "0".repeat(64) }), "sbom_manifest_pin_invalid");
  rejects(() => createPackSbom({ ...f, payloadRoot: undefined }), "sbom_root_required");
  const other = fixture({ "app/package.json": JSON.stringify(descriptor({ version: "9.9.9" })) });
  rejects(() => createPackSbom({ ...f, payloadRoot: other.payloadRoot }), "sbom_payload_file_set");
});

for (const mode of ["missing", "extra", "tamper", "length"]) test(`full payload rejects ${mode}`, () => {
  const f = fixture(), path = join(f.payloadRoot, "app/main.mjs");
  if (mode === "missing") rmSync(path);
  if (mode === "extra") writeFileSync(join(f.payloadRoot, "unexpected"), "unlisted");
  if (mode === "tamper") writeFileSync(path, "export const x = 2;\n");
  if (mode === "length") { f.manifest.files[0].bytes += 1; seal(f); }
  rejects(() => createPackSbom(f), ["missing", "extra"].includes(mode) ? "sbom_payload_file_set" : "sbom_payload_integrity");
});

test("manifest digest, duplicate/case aliases, path traversal, Windows aliases and unknown policy refuse", () => {
  const f = fixture(); f.manifest.pack_digest = "0".repeat(64);
  f.manifestBytes = encodeSbomJson(f.manifest); f.expectedManifestSha256 = sha256(f.manifestBytes);
  rejects(() => createPackSbom(f), "sbom_pack_digest_invalid");
  for (const bad of ["../escape", "/absolute", "a/../b", "app./x", "app/NUL", "app/CON.json", "a\\b", "a:stream"]) {
    const f = fixture(); f.manifest.files[0].path = bad; seal(f);
    rejects(() => createPackSbom(f), "sbom_path_invalid");
  }
  const alias = fixture(); alias.manifest.files.push({ ...alias.manifest.files[0], path: "APP/MAIN.MJS" }); seal(alias);
  rejects(() => createPackSbom(alias), "sbom_path_alias");
  const unknown = fixture(); unknown.manifest.sbom_policy = "unknown_future_policy"; seal(unknown);
  rejects(() => createPackSbom(unknown), "sbom_manifest_invalid");
});

test("manifest/file/descriptor byte limits refuse without allocating the declared payload", () => {
  const f = fixture(); f.manifest.files[0].bytes = SBOM_LIMITS.file + 1; seal(f);
  rejects(() => createPackSbom(f), "sbom_limit_exceeded");
  const d = fixture(); d.manifest.files[1].bytes = SBOM_LIMITS.descriptor + 1; seal(d);
  rejects(() => createPackSbom(d), "sbom_limit_exceeded");
  const bytes = Buffer.alloc(SBOM_LIMITS.manifest + 1, 32);
  rejects(() => createPackSbom({ ...f, manifestBytes: bytes, expectedManifestSha256: sha256(bytes) }), "sbom_limit_exceeded");
});

test("root and descendant junctions are refused before following them; hard-linked files also refuse", () => {
  const f = fixture(), alias = join(temp(), "alias");
  symlinkSync(f.payloadRoot, alias, process.platform === "win32" ? "junction" : "dir");
  rejects(() => createPackSbom({ ...f, payloadRoot: alias }), "sbom_link_refused");
  const g = fixture(), outside = temp();
  symlinkSync(outside, join(g.payloadRoot, "linked"), process.platform === "win32" ? "junction" : "dir");
  rejects(() => createPackSbom(g), "sbom_link_refused");
  const h = fixture(); linkSync(join(h.payloadRoot, "app/main.mjs"), join(temp(), "hard-copy"));
  rejects(() => createPackSbom(h), "sbom_file_kind_invalid");
});

test("observed identity/content changes during read refuse", () => {
  const f = fixture(), original = fs.readSync;
  let changed = false;
  fs.readSync = (...args) => {
    const count = original(...args);
    if (!changed) { changed = true; writeFileSync(join(f.payloadRoot, "app/main.mjs"), "changed during read\n"); }
    return count;
  };
  syncBuiltinESMExports();
  try { rejects(() => createPackSbom(f), "sbom_read_changed"); }
  finally { fs.readSync = original; syncBuiltinESMExports(); }
});

test("descriptors must be matching payload bytes with bounded valid identities and declared metadata", () => {
  for (const extra of [{ name: "" }, { version: "../version" }]) {
    const f = fixture({ "package.json": JSON.stringify(descriptor(extra)) });
    rejects(() => createPackSbom(f), "sbom_descriptor_identity_invalid");
  }
  for (const dependencies of [[], { alpha: {} }, { alpha: "file:" + "/private/local" }, { alpha: "https://synthetic:example@example.invalid/a" }, { alpha: "https://example.invalid/a?q=synthetic" }]) {
    const f = fixture({ "package.json": JSON.stringify(descriptor({ dependencies })) });
    rejects(() => createPackSbom(f), "sbom_descriptor_metadata_invalid");
  }
  const absoluteLicense = fixture({ "package.json": JSON.stringify(descriptor({ license: "SEE LICENSE IN " + "/private/license" })) });
  rejects(() => createPackSbom(absoluteLicense), "sbom_descriptor_metadata_invalid");
  const f = fixture({ "package.json": JSON.stringify(descriptor({ dependencies: { alpha: "https://example.invalid/public.tgz" }, ignoredLocalPath: join(temp(), "excluded") })) });
  const bom = JSON.parse(createPackSbom(f).bytes);
  assert.equal(JSON.stringify(bom).includes("ignoredLocalPath"), false);
  const d = fixture(); writeFileSync(join(d.payloadRoot, "app/package.json"), JSON.stringify(descriptor({ version: "9.9.9" })));
  rejects(() => createPackSbom(d), "sbom_payload_integrity");
});

test("official local schema checks hash shape, extra properties, exact version and refuses exercised formats", () => {
  const bom = JSON.parse(createPackSbom(fixture()).bytes);
  const badHash = structuredClone(bom); badHash.components[0].hashes[0].content = "bad";
  rejects(() => validateCycloneDx16(badHash), "sbom_schema_invalid");
  rejects(() => validateCycloneDx16({ ...bom, injected: true }), "sbom_schema_invalid");
  rejects(() => validateCycloneDx16({ ...bom, specVersion: "9.9" }), "sbom_version_invalid");
  const dated = structuredClone(bom); dated.metadata.timestamp = "2026-09-08T00:00:00Z";
  rejects(() => validateCycloneDx16(dated), "sbom_format_unsupported");
});

test("SPDX and JSF relative references validate offline; no signature cryptography is claimed", () => {
  const base = { bomFormat: "CycloneDX", specVersion: "1.6", version: 1 };
  const valid = { ...base, components: [{ type: "library", name: "synthetic", licenses: [{ license: { id: "MIT" } }] }] };
  assert.equal(validateCycloneDx16(valid).network, "NOT_USED");
  const invalid = structuredClone(valid); invalid.components[0].licenses[0].license.id = "NOT_AN_SPDX_ID";
  rejects(() => validateCycloneDx16(invalid), "sbom_schema_invalid");
  assert.equal(validateCycloneDx16({ ...base, signature: { signers: [] } }).schema_validation, "PASS");
  rejects(() => validateCycloneDx16({ ...base, signature: { signers: [{ value: "synthetic" }] } }), "sbom_schema_invalid");
});

test("generation and verification never invoke network or resolve declared dependency URLs", () => {
  const originalFetch = globalThis.fetch;
  const methods = [[http, "request"], [https, "request"], [net, "connect"], [tls, "connect"], [dns, "lookup"]];
  const saved = methods.map(([object, key]) => [object, key, object[key]]);
  let attempts = 0;
  const deny = () => { attempts += 1; throw new Error("unexpected_network_attempt"); };
  try {
    globalThis.fetch = deny;
    for (const [object, key] of methods) object[key] = deny;
    syncBuiltinESMExports();
    const f = fixture({ "package.json": JSON.stringify(descriptor({ dependencies: { alpha: "https://example.invalid/public.tgz" } })) });
    const result = createPackSbom(f);
    assert.equal(verifyPackSbom({ ...f, sbomBytes: result.bytes }).evidence.schema_validation, "PASS");
    assert.equal(attempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [object, key, value] of saved) object[key] = value;
    syncBuiltinESMExports();
  }
});

test("missing or tampered fixed schemas/license fail without a fallback retrieval", () => {
  const dir = temp(), moduleDir = join(dir, "src"), vendor = join(dir, "vendor/cyclonedx-1.6");
  mkdirSync(moduleDir); cpSync(join(ROOT, "guild_hall/deployment_pack/vendor/cyclonedx-1.6"), vendor, { recursive: true });
  const modulePath = join(moduleDir, "pack_sbom_schema.mjs"); cpSync(join(ROOT, "guild_hall/deployment_pack/src/pack_sbom_schema.mjs"), modulePath);
  const code = `import(${JSON.stringify(pathToFileURL(modulePath).href)}).then(m=>{try {m.validateCycloneDx16({bomFormat:'CycloneDX',specVersion:'1.6'});process.exitCode=2} catch(e){console.log(e.code);process.exitCode=e.code==='sbom_schema_pin_invalid'?0:3}})`;
  for (const name of ["bom-1.6.schema.json", "spdx.schema.json", "jsf-0.82.schema.json", "LICENSE"]) {
    const path = join(vendor, name), original = readFileSync(path);
    for (const operation of ["missing", "tampered"]) {
      if (operation === "missing") rmSync(path); else writeFileSync(path, "tampered\n");
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: dir, env: { ...process.env, NODE_PATH: join(ROOT, "node_modules") }, encoding: "utf8", windowsHide: true });
      assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout.trim(), "sbom_schema_pin_invalid");
      writeFileSync(path, original);
    }
  }
});

test("CLI defaults to check, pins the manifest, and creates only new/exact output files", () => {
  const f = fixture();
  const args = ["--pack", f.packDir, "--manifest-sha256", f.expectedManifestSha256];
  rejects(() => packSbomMain(args), "sbom_artifact_required");
  assert.equal(existsSync(join(f.packDir, "pack.sbom.cdx.json")), false);
  assert.equal(JSON.parse(packSbomMain([...args, "--create"])).status, "VERIFIED");
  const original = readFileSync(join(f.packDir, "pack.sbom.cdx.json"));
  assert.equal(JSON.parse(packSbomMain(args)).sbom_sha256, sha256(original));
  packSbomMain([...args, "--create"]);
  rejects(() => packSbomMain(["--pack", f.packDir, "--manifest-sha256", "0".repeat(64)]), "sbom_manifest_pin_invalid");
  writeFileSync(join(f.packDir, "pack.sbom.cdx.json"), "keep these bytes\n");
  rejects(() => packSbomMain([...args, "--create"]), "sbom_output_exists_different");
  assert.equal(readFileSync(join(f.packDir, "pack.sbom.cdx.json"), "utf8"), "keep these bytes\n");
});

test("new-generation sidecar strip/mismatch and receipt tampering cannot become a legacy success", () => {
  for (const mode of ["sbom", "both", "receipt", "foreign"]) {
    const f = generated();
    if (mode === "sbom" || mode === "both") rmSync(join(f.packDir, "pack.sbom.cdx.json"));
    if (mode === "both") rmSync(join(f.packDir, "pack.sbom.receipt.json"));
    if (mode === "receipt") writeFileSync(join(f.packDir, "pack.sbom.receipt.json"), "{}\n");
    if (mode === "foreign") writeFileSync(join(f.packDir, "pack.sbom.cdx.json"), generated(fixture({ "other.mjs": "other" })).bytes);
    rejects(() => readPackGeneration({ packDir: f.packDir }), mode === "receipt" ? "sbom_receipt_mismatch" : mode === "foreign" ? "sbom_bytes_mismatch" : "sbom_artifact_required");
    const target = temp();
    assert.throws(() => installPack({ packDir: f.packDir, targetDir: target, clock }));
    assert.deepEqual(fs.readdirSync(target), []);
  }
});

test("install refuses linked destination trees and clears a stale success after a source refusal", () => {
  const f = generated(), target = temp(), outside = temp();
  symlinkSync(outside, join(target, "payload"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => installPack({ packDir: f.packDir, targetDir: target, clock }));
  assert.deepEqual(fs.readdirSync(outside), []);
  const clean = temp(); installPack({ packDir: f.packDir, targetDir: clean, clock });
  rmSync(join(f.packDir, "pack.sbom.cdx.json"));
  rejects(() => installPack({ packDir: f.packDir, targetDir: clean, clock }), "sbom_artifact_required");
  assert.equal(existsSync(join(clean, "install.receipt.json")), false);
});

test("legacy absence is explicit NOT_VERIFIED and remains absent through install/backup/restore", () => {
  const f = fixture(); delete f.manifest.sbom_policy; seal(f);
  assert.equal(readPackGeneration({ packDir: f.packDir }).evidence.status, "NOT_VERIFIED");
  const target = temp(), backup = temp(); installPack({ packDir: f.packDir, targetDir: target, clock });
  backupPack({ targetDir: target, backupDir: backup, clock });
  writeFileSync(join(target, "payload/app/main.mjs"), "damaged");
  restorePack({ targetDir: target, backupDir: backup, clock });
  for (const dir of [target, backup]) {
    assert.equal(readPackGeneration({ packDir: dir }).evidence.status, "NOT_VERIFIED");
    assert.equal(existsSync(join(dir, "pack.sbom.cdx.json")), false);
  }
});

test("undeclared legacy manifests remain NOT_VERIFIED with matching sidecars; invalid sidecars still refuse", () => {
  const f = fixture(); delete f.manifest.sbom_policy; seal(f);
  const result = generated(f), args = ["--pack", f.packDir, "--manifest-sha256", f.expectedManifestSha256];
  assert.equal(result.evidence.status, "NOT_VERIFIED");
  assert.equal(result.evidence.reason, "legacy_sbom_policy_absent");
  assert.equal(verifyPackSbom({ ...f, sbomBytes: result.bytes }).evidence.status, "NOT_VERIFIED");
  assert.equal(readPackGeneration({ packDir: f.packDir }).evidence.status, "NOT_VERIFIED");
  assert.equal(JSON.parse(packSbomMain(args)).status, "NOT_VERIFIED");
  assert.deepEqual(readFileSync(join(f.packDir, "pack.manifest.json")), f.manifestBytes);
  const falselyVerified = JSON.parse(result.receiptBytes); falselyVerified.status = "VERIFIED";
  writeFileSync(join(f.packDir, "pack.sbom.receipt.json"), encodeSbomJson(falselyVerified));
  rejects(() => readPackGeneration({ packDir: f.packDir }), "sbom_receipt_mismatch");
  writeFileSync(join(f.packDir, "pack.sbom.receipt.json"), result.receiptBytes);
  const incomplete = JSON.parse(result.bytes); incomplete.components.pop();
  writeFileSync(join(f.packDir, "pack.sbom.cdx.json"), encodeSbomJson(incomplete));
  rejects(() => readPackGeneration({ packDir: f.packDir }), "sbom_bytes_mismatch");
});

test("CLI create refuses an undeclared legacy manifest without editing any input or sidecars", () => {
  for (const withSidecars of [false, true]) {
    const f = fixture(); delete f.manifest.sbom_policy; seal(f);
    const before = withSidecars ? generated(f) : null;
    rejects(() => packSbomMain(["--pack", f.packDir, "--manifest-sha256", f.expectedManifestSha256, "--create"]), "sbom_policy_required");
    assert.deepEqual(readFileSync(join(f.packDir, "pack.manifest.json")), f.manifestBytes);
    assert.equal(existsSync(join(f.packDir, "pack.sbom.cdx.json")), withSidecars);
    assert.equal(existsSync(join(f.packDir, "pack.sbom.receipt.json")), withSidecars);
    if (before) {
      assert.deepEqual(readFileSync(join(f.packDir, "pack.sbom.cdx.json")), before.bytes);
      assert.deepEqual(readFileSync(join(f.packDir, "pack.sbom.receipt.json")), before.receiptBytes);
    }
  }
});

test("legacy sidecars keep NOT_VERIFIED across install, backup, upgrade, rollback and restore", () => {
  const f = fixture(); delete f.manifest.sbom_policy; seal(f); generated(f);
  const current = generated(), target = temp(), backup = temp();
  installPack({ packDir: f.packDir, targetDir: target, clock });
  assert.equal(readPackGeneration({ packDir: target }).evidence.status, "NOT_VERIFIED");
  backupPack({ targetDir: target, backupDir: backup, clock });
  assert.equal(readPackGeneration({ packDir: backup }).evidence.status, "NOT_VERIFIED");
  upgradePack({ packDir: current.packDir, targetDir: target, clock });
  assert.equal(readPackGeneration({ packDir: target }).evidence.status, "VERIFIED");
  assert.equal(readPackGeneration({ packDir: target, previous: true }).evidence.status, "NOT_VERIFIED");
  rollbackPack({ targetDir: target, clock });
  assert.equal(readPackGeneration({ packDir: target }).evidence.status, "NOT_VERIFIED");
  restorePack({ targetDir: target, backupDir: backup, clock });
  assert.equal(readPackGeneration({ packDir: target }).evidence.status, "NOT_VERIFIED");
});

test("install/upgrade/rollback/restore retain exact manifest+SBOM generations and reject stripped retained/backup evidence", () => {
  const a = generated(), b = generated(fixture({ "app/main.mjs": "export const x = 2;\n", "app/package.json": JSON.stringify(descriptor()) }));
  const target = temp(), backup = temp(); installPack({ packDir: a.packDir, targetDir: target, clock });
  backupPack({ targetDir: target, backupDir: backup, clock });
  const check = (dir, expected, previous = false) => {
    const read = readPackGeneration({ packDir: dir, previous });
    assert.deepEqual(read.manifestBytes, expected.manifestBytes); assert.deepEqual(read.sbomBytes, expected.bytes); assert.equal(read.evidence.status, "VERIFIED");
  };
  upgradePack({ packDir: b.packDir, targetDir: target, clock }); check(target, b); check(target, a, true);
  rollbackPack({ targetDir: target, clock }); check(target, a); check(target, b, true);
  rmSync(join(target, "pack.sbom.prev.cdx.json"));
  rejects(() => rollbackPack({ targetDir: target, clock }), "rollback_previous_invalid"); check(target, a);
  writeFileSync(join(target, "pack.sbom.receipt.json"), "damaged");
  restorePack({ targetDir: target, backupDir: backup, clock }); check(target, a);
  assert.equal(existsSync(join(target, "pack.manifest.prev.json")), false);
  assert.equal(existsSync(join(target, "pack.sbom.prev.cdx.json")), false);
  rmSync(join(backup, "pack.sbom.cdx.json")); rmSync(join(backup, "pack.sbom.receipt.json"));
  rejects(() => restorePack({ targetDir: target, backupDir: backup, clock }), "restore_backup_invalid"); check(target, a);
});

test("real builder records digest-bound SBOM and remains compatible with the v0 installed source identity reader", () => {
  const root = temp(), source = "app/main.mjs", entry = "app/check.test.mjs";
  mkdirSync(join(root, "app"));
  writeFileSync(join(root, source), "export const x = 1;\n");
  writeFileSync(join(root, entry), "import test from 'node:test';import assert from 'node:assert/strict';import {x} from './main.mjs';test('fixture',()=>assert.equal(x,1));\n");
  const spec = { schema: "soulforge.deployment_pack_spec.v0", pack_id: "tool_workshop_pack", version: "0.1.0",
    content_roles: { resource_lease_helper: [source], validators: [entry] }, smoke_test_entries: [entry],
    host_effect_policy: { reboot: "forbidden", driver_change: "forbidden", system_update: "forbidden", service_restart_scope: "pack_services_only" },
    release_notes_ref: "notes.synthetic", install_manual_ref: "manual.synthetic", upgrade_manual_ref: "manual.synthetic", rollback_manual_ref: "manual.synthetic", support_owner_ref: "owner.synthetic", secret_refs: [] };
  const specPath = join(root, "spec.json"); writeFileSync(specPath, JSON.stringify(spec));
  const built = buildPack(specPath, { rootDir: root, outDir: temp(), clock });
  const generation = readPackGeneration({ packDir: built.packDir });
  const receipt = JSON.parse(readFileSync(join(built.packDir, "receipts/build.receipt.json")));
  assert.equal(receipt.manifest_sha256, sha256(generation.manifestBytes));
  assert.equal(receipt.sbom_sha256, sha256(generation.sbomBytes));
  assert.equal(built.manifest.sbom_policy, SBOM_POLICY);
  assert.equal(built.manifest.pack_digest, recomputePackDigest(built.manifest.files));
  assert.equal(built.candidate.claimed_gate, "contract");
  const target = temp(); installPack({ packDir: built.packDir, targetDir: target, clock });
  const identity = readPackSourceIdentity(join(target, "payload/app"), { verify: "all" });
  assert.equal(identity.pack_digest, built.manifest.pack_digest);
});
