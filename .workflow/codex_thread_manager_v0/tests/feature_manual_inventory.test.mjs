import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm, readFile, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FEATURE_MANUAL_INVENTORY_REPORT_SCHEMA,
  scanFeatureManualInventory
} from "../feature_manual_inventory.mjs";

const NOW = Date.now();

function makeWinDrivePath(sub = "Windows") {
  return ["C", ":", "\\", sub].join("");
}

function makeTildePath(sub = "secret_dir") {
  return ["~", sub].join("/");
}

function makeSchemeUrl(host = "example.com", file = "test.md") {
  return ["http", ":", "/", "/", host, "/", file].join("");
}

function makeFileSchemeUrl(pathSegment = "etc_passwd") {
  return ["file", ":", "/", "/", "local", "/", pathSegment].join("");
}

function makeValidFeatureRow(suffix = "1") {
  return {
    feature_id: `feature_module_${suffix}`,
    owner_root: ".workflow/codex_thread_manager_v0",
    owner_readme: ".workflow/codex_thread_manager_v0/README.md",
    operating_manual_ref: ".workflow/codex_thread_manager_v0/README.md#lifecycle-retention",
    validator_ref: "node --test .workflow/codex_thread_manager_v0/tests/lifecycle_retention.test.mjs",
    changelog_ref: "CHANGELOG.md",
    roadmap_ref: "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md",
    last_validation_state: "passed"
  };
}

test("FeatureManualInventory: public scan interface against real repository", async () => {
  const row = makeValidFeatureRow("real");
  const report = await scanFeatureManualInventory([row], { now: NOW });

  assert.equal(report.schema_version, FEATURE_MANUAL_INVENTORY_REPORT_SCHEMA);
  assert.equal(report.report_only, true);
  assert.equal(report.total_features, 1);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].feature_id, "feature_module_real");
  assert.equal(report.rows[0].last_validation_state_source, "declared");
  assert.ok(Array.isArray(report.source_refs));
  assert.ok(report.digest.startsWith("sha256:"));
});

test("FeatureManualInventory: synthetic fixture with complete coverage produces PASS and zero gap codes", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-feature-inventory-test-"));
  try {
    const ownerDir = join(tempDir, "owner_module");
    const ownerReadme = join(ownerDir, "README.md");
    const rootReadme = join(tempDir, "README.md");
    const docOwnership = join(tempDir, "docs", "architecture", "foundation", "DOCUMENT_OWNERSHIP.md");
    const pkgPath = join(tempDir, "package.json");
    const changelogPath = join(tempDir, "CHANGELOG.md");
    const roadmapPath = join(tempDir, "DEVELOPMENT_ROADMAP_V0.md");

    await mkdir(join(tempDir, "docs", "architecture", "foundation"), { recursive: true });
    await mkdir(ownerDir, { recursive: true });

    await writeFile(pkgPath, JSON.stringify({ scripts: { "validate:test": "node --test" } }));
    await writeFile(rootReadme, "# Soulforge Root\nReference to owner_module and feature_synth.");
    await writeFile(docOwnership, "# Document Ownership\nTable of owners:\n- owner_module: owner description");
    await writeFile(ownerReadme, "# Owner Module\n## Section Manual\nFeature coverage details here.");
    await writeFile(changelogPath, "# CHANGELOG\n## 2026-08-21\nFeature feature_synth recorded.");
    await writeFile(roadmapPath, "# Roadmap\nActive feature_synth in current phase.");

    const featureRow = {
      feature_id: "feature_synth",
      owner_root: "owner_module",
      owner_readme: "owner_module/README.md",
      operating_manual_ref: "owner_module/README.md#section-manual",
      validator_ref: "npm run validate:test",
      changelog_ref: "CHANGELOG.md",
      roadmap_ref: "DEVELOPMENT_ROADMAP_V0.md",
      last_validation_state: "passed"
    };

    const report = await scanFeatureManualInventory([featureRow], { repoRoot: tempDir, now: NOW });
    assert.equal(report.status, "PASS");
    assert.equal(report.covered_features, 1);
    assert.equal(report.gap_features, 0);
    assert.equal(report.rows[0].stable_gap_codes.length, 0);
    assert.equal(report.rows[0].next_action, "none");
    assert.equal(report.rows[0].last_validation_state, "passed");
    assert.equal(report.rows[0].last_validation_state_source, "declared");
    assert.equal(report.rows[0].changelog_status, "recorded");
    assert.equal(report.rows[0].roadmap_status, "active");
    assert.equal(report.rows[0].changelog_ref, "CHANGELOG.md");
    assert.equal(report.rows[0].roadmap_ref, "DEVELOPMENT_ROADMAP_V0.md");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: npm script inheritance Object.hasOwn regression (npm run constructor)", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-proto-script-test-"));
  try {
    const pkgPath = join(tempDir, "package.json");
    await writeFile(pkgPath, JSON.stringify({ scripts: { "build": "node index.js" } }));

    const featureRow = {
      feature_id: "feature_proto_script",
      validator_ref: "npm run constructor",
      last_validation_state: "passed"
    };

    const report = await scanFeatureManualInventory([featureRow], { repoRoot: tempDir });
    assert.equal(report.rows[0].last_validation_state, "unvalidated");
    assert.equal(report.rows[0].last_validation_state_source, "scanner_override");
    assert.ok(report.rows[0].stable_gap_codes.includes("missing_validator_ref"));
    assert.equal(report.rows[0].next_action, "HOLD");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: root README coverage uses outputOwnerRoot (unsafe owner_root cannot satisfy root README)", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-sanitized-root-readme-test-"));
  try {
    await writeFile(join(tempDir, "README.md"), `# Soulforge Root\nContains ${makeWinDrivePath("System32")} text.`);

    const featureRow = {
      feature_id: "unmentioned_feature",
      owner_root: makeWinDrivePath("System32")
    };

    const report = await scanFeatureManualInventory([featureRow], { repoRoot: tempDir });
    assert.equal(report.rows[0].owner_root, null);
    assert.ok(report.rows[0].stable_gap_codes.includes("missing_root_readme_coverage"));
    assert.ok(report.rows[0].stable_gap_codes.includes("unsafe_path_detected"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: last_validation_state_source provenance (declared vs absent vs scanner_override)", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-provenance-test-"));
  try {
    const pkgPath = join(tempDir, "package.json");
    await writeFile(pkgPath, JSON.stringify({ scripts: { "test:valid": "node --test" } }));

    // 1. Valid script + declared "passed" => state "passed", source "declared"
    const r1 = await scanFeatureManualInventory([{
      feature_id: "f1",
      validator_ref: "npm run test:valid",
      last_validation_state: "passed"
    }], { repoRoot: tempDir });
    assert.equal(r1.rows[0].last_validation_state, "passed");
    assert.equal(r1.rows[0].last_validation_state_source, "declared");

    // 2. Valid script + no declared state => state "not_run", source "absent"
    const r2 = await scanFeatureManualInventory([{
      feature_id: "f2",
      validator_ref: "npm run test:valid"
    }], { repoRoot: tempDir });
    assert.equal(r2.rows[0].last_validation_state, "not_run");
    assert.equal(r2.rows[0].last_validation_state_source, "absent");

    // 3. Unresolvable script + declared "passed" => state "unvalidated", source "scanner_override"
    const r3 = await scanFeatureManualInventory([{
      feature_id: "f3",
      validator_ref: "npm run missing_script",
      last_validation_state: "passed"
    }], { repoRoot: tempDir });
    assert.equal(r3.rows[0].last_validation_state, "unvalidated");
    assert.equal(r3.rows[0].last_validation_state_source, "scanner_override");

    // 4. Unsafe validator ref + declared "passed" => state "unknown", source "scanner_override"
    const r4 = await scanFeatureManualInventory([{
      feature_id: "f4",
      validator_ref: "npm run test:valid --access-token SECRET",
      last_validation_state: "passed"
    }], { repoRoot: tempDir });
    assert.equal(r4.rows[0].last_validation_state, "unknown");
    assert.equal(r4.rows[0].last_validation_state_source, "scanner_override");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: validator allowlist grammar rejects credentials and unknown flags without leaking", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-allowlist-test-"));
  try {
    const tokenSecret = "SECRET_TOKEN_9999";
    const passSecret = "SECRET_PASS_8888";

    const leakyRows = [
      { feature_id: "f_token", validator_ref: `node --test test.mjs --access-token ${tokenSecret}`, last_validation_state: "passed" },
      { feature_id: "f_pass", validator_ref: `node --test test.mjs --passwd=${passSecret}`, last_validation_state: "passed" },
      { feature_id: "f_short", validator_ref: `node --test test.mjs -p ${passSecret}`, last_validation_state: "passed" },
      { feature_id: "f_unknown", validator_ref: "make check --flag", last_validation_state: "passed" }
    ];

    const report = await scanFeatureManualInventory(leakyRows, { repoRoot: tempDir });
    const jsonStr = JSON.stringify(report);

    assert.equal(jsonStr.includes(tokenSecret), false);
    assert.equal(jsonStr.includes(passSecret), false);

    for (const row of report.rows) {
      assert.equal(row.validator_ref, null);
      assert.equal(row.last_validation_state, "unknown");
      assert.equal(row.last_validation_state_source, "scanner_override");
      assert.ok(row.stable_gap_codes.includes("unsafe_path_detected"));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: unsafe explicit changelog and roadmap refs emit null output without silent fallback", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-explicit-unsafe-refs-test-"));
  try {
    const featureRow = {
      feature_id: "f_unsafe_refs",
      changelog_ref: makeWinDrivePath("System32"),
      roadmap_ref: makeTildePath("secret_roadmap")
    };

    const report = await scanFeatureManualInventory([featureRow], { repoRoot: tempDir });
    assert.equal(report.rows[0].changelog_ref, null);
    assert.equal(report.rows[0].changelog_status, "missing");
    assert.equal(report.rows[0].roadmap_ref, null);
    assert.equal(report.rows[0].roadmap_status, "missing");
    assert.ok(report.rows[0].stable_gap_codes.includes("unsafe_path_detected"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: arbitrary invalid now option falls back safely to deterministic ISO timestamp", async () => {
  const row = makeValidFeatureRow("invalid_now");
  const report = await scanFeatureManualInventory([row], { now: "INVALID_DATE_OBJECT_STRING" });

  assert.equal(report.generated_at, "1970-01-01T00:00:00.000Z");
  assert.ok(report.digest.startsWith("sha256:"));
});

test("FeatureManualInventory: path sanitizer rejects tildes, URI schemes, and control characters without leaking sentinels", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-path-sanitizer-test-"));
  try {
    const tildeSentinel = "secret_tilde_dir_12345";
    const httpSentinel = "example.com";
    const fileSentinel = "etc_passwd_secret";

    const leakyRows = [
      { feature_id: "f_tilde", owner_root: makeTildePath(tildeSentinel) },
      { feature_id: "f_http", owner_readme: makeSchemeUrl(httpSentinel, "guide.md") },
      { feature_id: "f_file", changelog_ref: makeFileSchemeUrl(fileSentinel) }
    ];

    const report = await scanFeatureManualInventory(leakyRows, { repoRoot: tempDir });
    const jsonStr = JSON.stringify(report);

    assert.equal(jsonStr.includes(tildeSentinel), false, "Tilde path sentinel must not leak in JSON");
    assert.equal(jsonStr.includes(httpSentinel), false, "HTTP scheme URL sentinel must not leak in JSON");
    assert.equal(jsonStr.includes(fileSentinel), false, "File scheme URL sentinel must not leak in JSON");

    for (const row of report.rows) {
      assert.equal(row.last_validation_state, "unknown");
      assert.equal(row.next_action, "HOLD");
      assert.ok(row.stable_gap_codes.includes("unsafe_path_detected"));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: top-level owner root matches root README without needing feature ID in root README", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-top-level-owner-test-"));
  try {
    const ownerDir = join(tempDir, ".workflow", "my_deep_workflow");
    await mkdir(ownerDir, { recursive: true });
    await writeFile(join(tempDir, "README.md"), "# Root Map\nDescribes .workflow subsystem.");
    await mkdir(join(tempDir, "docs", "architecture", "foundation"), { recursive: true });
    await writeFile(join(tempDir, "docs", "architecture", "foundation", "DOCUMENT_OWNERSHIP.md"), "# Owners\n- .workflow owner");

    const featureRow = {
      feature_id: "feature_deep_sub_module",
      owner_root: ".workflow/my_deep_workflow",
      owner_readme: ".workflow/my_deep_workflow/README.md"
    };

    await writeFile(join(ownerDir, "README.md"), "# Deep Workflow");
    const report = await scanFeatureManualInventory([featureRow], { repoRoot: tempDir });
    assert.equal(report.rows[0].stable_gap_codes.includes("missing_root_readme_coverage"), false);
    assert.equal(report.rows[0].stable_gap_codes.includes("missing_ownership_registration"), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: missing gap codes exercise for all 11 gap codes independently", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-gap-codes-test-"));
  try {
    const ownerDir = join(tempDir, "owner_exist");
    await mkdir(ownerDir, { recursive: true });

    // 1. missing_owner_root
    const r1 = await scanFeatureManualInventory([{ feature_id: "f1", owner_root: "missing_dir" }], { repoRoot: tempDir });
    assert.ok(r1.rows[0].stable_gap_codes.includes("missing_owner_root"));

    // 2. missing_ownership_registration
    const r2 = await scanFeatureManualInventory([{ feature_id: "f2", owner_root: "owner_exist" }], { repoRoot: tempDir });
    assert.ok(r2.rows[0].stable_gap_codes.includes("missing_ownership_registration"));

    // 3. missing_root_readme_coverage
    const r3 = await scanFeatureManualInventory([{ feature_id: "unmentioned_feature", owner_root: "owner_exist" }], { repoRoot: tempDir });
    assert.ok(r3.rows[0].stable_gap_codes.includes("missing_root_readme_coverage"));

    // 4. missing_owner_readme
    const r4 = await scanFeatureManualInventory([{ feature_id: "f4", owner_readme: "missing_readme.md" }], { repoRoot: tempDir });
    assert.ok(r4.rows[0].stable_gap_codes.includes("missing_owner_readme"));

    // 5. missing_operating_manual
    const r5 = await scanFeatureManualInventory([{ feature_id: "f5", operating_manual_ref: "missing_manual.md" }], { repoRoot: tempDir });
    assert.ok(r5.rows[0].stable_gap_codes.includes("missing_operating_manual"));

    // 6. missing_index_registration
    const r6 = await scanFeatureManualInventory([{ feature_id: "unindexed_wf", owner_root: ".workflow/unindexed_wf" }], { repoRoot: tempDir });
    assert.ok(r6.rows[0].stable_gap_codes.includes("missing_index_registration"));

    // 7. missing_validator_ref
    const r7 = await scanFeatureManualInventory([{ feature_id: "f7", validator_ref: "npm run missing_script" }], { repoRoot: tempDir });
    assert.ok(r7.rows[0].stable_gap_codes.includes("missing_validator_ref"));
    assert.equal(r7.rows[0].last_validation_state, "unvalidated");

    // 8. missing_changelog_ref
    const r8 = await scanFeatureManualInventory([{ feature_id: "f8", changelog_ref: "missing_changelog.md" }], { repoRoot: tempDir });
    assert.ok(r8.rows[0].stable_gap_codes.includes("missing_changelog_ref"));

    // 9. missing_roadmap_ref
    const r9 = await scanFeatureManualInventory([{ feature_id: "f9", roadmap_ref: "missing_roadmap.md" }], { repoRoot: tempDir });
    assert.ok(r9.rows[0].stable_gap_codes.includes("missing_roadmap_ref"));

    // 10. unsafe_path_detected
    const r10 = await scanFeatureManualInventory([{ feature_id: "f10", owner_root: makeWinDrivePath("System32") }], { repoRoot: tempDir });
    assert.ok(r10.rows[0].stable_gap_codes.includes("unsafe_path_detected"));
    assert.equal(r10.rows[0].last_validation_state, "unknown");

    // 11. malformed_feature_row
    const r11 = await scanFeatureManualInventory([null], { repoRoot: tempDir });
    assert.ok(r11.rows[0].stable_gap_codes.includes("malformed_feature_row"));
    assert.equal(r11.rows[0].last_validation_state, "unknown");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: operating_manual_ref multi-# leak is sanitized and rejected", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-multi-hash-test-"));
  try {
    const manualPath = join(tempDir, "manual.md");
    await writeFile(manualPath, "# Manual\n## Section\nContent");

    const sentinel = "SENTINEL_2ND_HASH_SECRET";
    const leakyRef = `manual.md#section#${sentinel}`;

    const report = await scanFeatureManualInventory([{ feature_id: "f_multi_hash", operating_manual_ref: leakyRef }], { repoRoot: tempDir });
    const jsonStr = JSON.stringify(report);

    assert.equal(jsonStr.includes(sentinel), false, "Sentinel after 2nd # must not appear in report JSON");
    assert.equal(report.rows[0].operating_manual_ref, null);
    assert.ok(report.rows[0].stable_gap_codes.includes("unsafe_path_detected"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: regression - docs/users/ relative path is allowed as safe", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-users-path-test-"));
  try {
    const userDocDir = join(tempDir, "docs", "users");
    await mkdir(userDocDir, { recursive: true });
    await writeFile(join(userDocDir, "guide.md"), "# User Guide\nfeature_users_test details");

    const featureRow = {
      feature_id: "feature_users_test",
      owner_root: "docs/users",
      owner_readme: "docs/users/guide.md"
    };

    const report = await scanFeatureManualInventory([featureRow], { repoRoot: tempDir });
    assert.equal(report.rows[0].owner_root, "docs/users");
    assert.equal(report.rows[0].owner_readme, "docs/users/guide.md");
    assert.equal(report.rows[0].stable_gap_codes.includes("unsafe_path_detected"), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: positive bounded status tests for changelog pending and roadmap proposed", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-status-bounded-test-"));
  try {
    const changelogPath = join(tempDir, "CHANGELOG.md");
    const roadmapPath = join(tempDir, "DEVELOPMENT_ROADMAP_V0.md");

    await writeFile(changelogPath, `# CHANGELOG\n\n## 2026-08-21 - Feature Pending\n\n- Revision pending for feature_bounded_status.\n`);
    await writeFile(roadmapPath, `# Roadmap\n\n## Future Phase\nProposed candidate feature_bounded_status in queue.\n`);

    const featureRow = {
      feature_id: "feature_bounded_status",
      changelog_ref: "CHANGELOG.md",
      roadmap_ref: "DEVELOPMENT_ROADMAP_V0.md"
    };

    const report = await scanFeatureManualInventory([featureRow], { repoRoot: tempDir, now: NOW });
    assert.equal(report.rows[0].changelog_status, "pending");
    assert.equal(report.rows[0].roadmap_status, "proposed");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("FeatureManualInventory: duplicate IDs & malformed rows exhibit total sorting and identical digest when reversed", async () => {
  const dupRows = [
    { feature_id: "dup_id", owner_root: "root_a" },
    { feature_id: "dup_id", owner_root: "root_b" },
    null,
    "bad_row"
  ];

  const report1 = await scanFeatureManualInventory(dupRows, { now: NOW });
  const report2 = await scanFeatureManualInventory([...dupRows].reverse(), { now: NOW });

  assert.equal(report1.digest, report2.digest);
  assert.equal(JSON.stringify(report1.rows), JSON.stringify(report2.rows));
});

test("FeatureManualInventory: identical features scanned with different now/generated_at values produce equal digest", async () => {
  const row = makeValidFeatureRow("time_digest");

  const report1 = await scanFeatureManualInventory([row], { now: 1000000 });
  const report2 = await scanFeatureManualInventory([row], { now: 9999999 });

  assert.notEqual(report1.generated_at, report2.generated_at);
  assert.equal(report1.digest, report2.digest);
});

test("FeatureManualInventory: prove scan interface does NOT edit source files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-read-only-test-"));
  try {
    const testFilePath = join(tempDir, "CHANGELOG.md");
    const initialContent = "# CHANGELOG\n## 2026-08-21\nFeature feature_readonly recorded.";
    await writeFile(testFilePath, initialContent, "utf8");

    const statBefore = await stat(testFilePath);

    const featureRow = {
      feature_id: "feature_readonly",
      changelog_ref: "CHANGELOG.md"
    };

    await scanFeatureManualInventory([featureRow], { repoRoot: tempDir, now: NOW });

    const statAfter = await stat(testFilePath);
    const contentAfter = await readFile(testFilePath, "utf8");

    assert.equal(contentAfter, initialContent);
    assert.equal(statAfter.size, statBefore.size);
    assert.equal(statAfter.mtimeMs, statBefore.mtimeMs);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
