import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildActivityEvent } from "./activity_log.mjs";
import {
  discoverCustomAssetCatalog,
  normalizeAssetUsage,
  summarizeAssetUsage,
} from "./asset_usage.mjs";

function tempRoot(t) {
  const root = path.join(tmpdir(), `sf-asset-usage-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("asset usage event: canonical ref와 측정 포인터를 metadata-only activity row에 보존", () => {
  const event = buildActivityEvent({
    scope: "asset_usage",
    project_code: "system",
    action: "workflow_run",
    result: "success",
    summary: "synthetic workflow smoke passed",
    asset_usage: {
      asset_type: "workflow",
      asset_id: "example_v0",
      asset_ref: ".workflow/example_v0/workflow.yaml",
      maintenance_owner: ".workflow",
      baseline_ref: "docs/architecture/workspace/examples/example_fixture.json",
      outcome_evidence_ref: "guild_hall/state/operations/example_receipt.json",
      fallback_ref: ".workflow/example_fallback_v0/workflow.yaml",
      lifecycle_policy_ref: "docs/architecture/guild_hall/CUSTOM_ASSET_USAGE_LIFECYCLE_V0.md",
      duration_ms: 1250,
    },
  }, {
    repoRoot: process.cwd(),
    identity: { node_id: "test-node", node_role: "dev_worker_pc" },
    now: new Date("2026-07-10T00:00:00Z"),
  });

  assert.equal(event.asset_usage.schema_version, "soulforge.custom_asset_usage.v0");
  assert.equal(event.asset_usage.asset_type, "workflow");
  assert.equal(event.asset_usage.asset_id, "example_v0");
  assert.equal(event.asset_usage.duration_ms, 1250);
  assert.equal(event.sensitive_content_included, false);
});

test("asset usage event: absolute ref와 asset type/ref 불일치를 거부", () => {
  const windowsAbsoluteRef = ["C:", "private", "example", "workflow.yaml"].join("/");
  assert.throws(() => normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: windowsAbsoluteRef,
  }), /asset_ref_must_be_repo_relative/);
  assert.throws(() => normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".party/example_v0/party.yaml",
  }), /asset_ref_does_not_match_asset_type_and_id/);
  assert.throws(() => normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    maintenance_owner: "token=abc1234567890",
  }), /maintenance_owner_secret_like_value_blocked/);
  assert.throws(() => normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    baseline_ref: "docs/example.md#token=abc1234567890",
  }), /baseline_ref_secret_like_value_blocked/);
  assert.throws(() => normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    maintenance_owner: { token: "synthetic" },
  }), /maintenance_owner_must_be_string/);
  assert.throws(() => normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    baseline_ref: { ref: "docs/baseline.md" },
  }), /baseline_ref_must_be_string/);
  for (const unsafeRef of [
    "docs/.env/token.txt",
    "docs/credentials/runtime.json",
    "docs/%2e%2e/private.json",
    `docs/example.md#${["C:", "private", "file"].join("/")}`,
  ]) {
    assert.throws(() => normalizeAssetUsage({
      asset_type: "workflow",
      asset_id: "example_v0",
      asset_ref: ".workflow/example_v0/workflow.yaml",
      baseline_ref: unsafeRef,
    }), /baseline_ref_(?:secret_like_value_blocked|must_be_normalized|fragment_invalid)/);
  }
});

test("asset usage report: 사용량·최근 성공·owner/fallback/evidence 누락을 분리하고 retire 결정을 만들지 않음", () => {
  const complete = normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    maintenance_owner: ".workflow",
    baseline_ref: "docs/architecture/workspace/examples/example_fixture.json",
    outcome_evidence_ref: "guild_hall/state/operations/example_receipt.json",
    fallback_ref: ".workflow/example_fallback_v0/workflow.yaml",
    lifecycle_policy_ref: "docs/architecture/guild_hall/CUSTOM_ASSET_USAGE_LIFECYCLE_V0.md",
  });
  const incomplete = normalizeAssetUsage({
    asset_type: "skill",
    asset_id: "evidence_sift",
    asset_ref: ".registry/skills/evidence_sift/skill.yaml",
  });
  const events = [
    { occurred_at: "2026-07-01T00:00:00Z", result: "success", asset_usage: complete },
    { occurred_at: "2026-07-09T00:00:00Z", result: "success", asset_usage: complete },
    { occurred_at: "2026-07-08T00:00:00Z", result: "failed", asset_usage: incomplete },
  ];
  const catalog = [
    { asset_type: "workflow", asset_id: "example_v0", asset_ref: ".workflow/example_v0/workflow.yaml", status: "active" },
    { asset_type: "skill", asset_id: "evidence_sift", asset_ref: ".registry/skills/evidence_sift/skill.yaml", status: "active" },
    { asset_type: "party", asset_id: "unused_cell", asset_ref: ".party/unused_cell/party.yaml", status: "active" },
  ];

  const report = summarizeAssetUsage(events, { catalog, now: new Date("2026-07-10T00:00:00Z") });
  assert.equal(report.counts.catalog_assets, 3);
  assert.equal(report.counts.assets_with_usage, 2);
  assert.equal(report.counts.unmeasured_assets, 1);
  assert.equal(report.measurement_window.activity_events_scanned, 3);
  const workflow = report.assets.find((row) => row.asset_id === "example_v0");
  assert.equal(workflow.usage.total_runs, 2);
  assert.equal(workflow.usage.last_success_at, "2026-07-09T00:00:00.000Z");
  assert.deepEqual(workflow.measurement_gaps, []);
  const skill = report.assets.find((row) => row.asset_id === "evidence_sift");
  assert.ok(skill.measurement_gaps.includes("maintenance_owner_missing"));
  assert.ok(skill.measurement_gaps.includes("fallback_ref_missing"));
  assert.ok(skill.measurement_gaps.includes("successful_outcome_evidence_missing"));
  assert.equal(report.boundary.retire_or_archive_decision_made, false);
  assert.equal(report.boundary.roi_claim_made, false);
});

test("asset usage report: 최신 timestamp의 owner/fallback과 성공 evidence를 보존", () => {
  const newer = normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    maintenance_owner: "NEW_OWNER",
    outcome_evidence_ref: "guild_hall/state/operations/new_success.json",
    fallback_ref: ".workflow/new_fallback_v0/workflow.yaml",
  });
  const older = normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    maintenance_owner: "OLD_OWNER",
    outcome_evidence_ref: "guild_hall/state/operations/old_failure.json",
    fallback_ref: ".workflow/old_fallback_v0/workflow.yaml",
  });
  const report = summarizeAssetUsage([
    { occurred_at: "2026-07-09T00:00:00Z", result: "success", asset_usage: newer },
    { occurred_at: "2026-07-01T00:00:00Z", result: "failed", asset_usage: older },
  ], { now: new Date("2026-07-10T00:00:00Z"), eventLimit: 5000 });

  const row = report.assets[0];
  assert.equal(row.maintenance_owner, "NEW_OWNER");
  assert.equal(row.fallback_ref, ".workflow/new_fallback_v0/workflow.yaml");
  assert.equal(row.outcome_evidence_ref, "guild_hall/state/operations/new_success.json");
  assert.equal(report.measurement_window.event_limit, 5000);
  assert.equal(report.measurement_window.limit_reached, false);
});

test("asset usage report: lookahead가 있을 때만 measurement window truncation을 확정", () => {
  const usage = normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
  });
  const events = Array.from({ length: 250 }, (_, index) => ({
    occurred_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    result: "success",
    asset_usage: usage,
  }));
  const exact = summarizeAssetUsage(events, { eventLimit: 250, hasMoreEvents: false });
  const truncated = summarizeAssetUsage(events, { eventLimit: 250, hasMoreEvents: true });
  assert.equal(exact.measurement_window.limit_reached, false);
  assert.equal(exact.measurement_window.truncated, false);
  assert.equal(truncated.measurement_window.limit_reached, true);
  assert.equal(truncated.measurement_window.truncated, true);
});

test("asset usage report: failure evidence를 successful outcome evidence로 승격하지 않음", () => {
  const successWithoutEvidence = normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    maintenance_owner: "workflow_owner",
    baseline_ref: "docs/baseline.md",
    fallback_ref: ".workflow/fallback_v0/workflow.yaml",
    lifecycle_policy_ref: "docs/lifecycle.md",
  });
  const failureWithEvidence = normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    outcome_evidence_ref: "guild_hall/state/operations/failure_receipt.json",
  });
  const report = summarizeAssetUsage([
    { occurred_at: "2026-07-09T00:00:00Z", result: "success", asset_usage: successWithoutEvidence },
    { occurred_at: "2026-07-08T00:00:00Z", result: "failed", asset_usage: failureWithEvidence },
  ], { now: new Date("2026-07-10T00:00:00Z") });

  const row = report.assets[0];
  assert.equal(row.outcome_evidence_ref, null);
  assert.ok(row.measurement_gaps.includes("successful_outcome_evidence_missing"));
  assert.equal(row.measurement_state, "insufficient_evidence");
});

test("asset usage report: timestamp 없는 metadata는 최신 evidence gap을 채우지 않음", () => {
  const usage = normalizeAssetUsage({
    asset_type: "workflow",
    asset_id: "example_v0",
    asset_ref: ".workflow/example_v0/workflow.yaml",
    maintenance_owner: "owner_without_time",
    baseline_ref: "docs/baseline.md",
    outcome_evidence_ref: "docs/success.md",
    fallback_ref: ".workflow/fallback_v0/workflow.yaml",
    lifecycle_policy_ref: "docs/lifecycle.md",
  });
  const report = summarizeAssetUsage([
    { occurred_at: "not-a-time", result: "success", asset_usage: usage },
  ], { now: new Date("2026-07-10T00:00:00Z") });

  const row = report.assets[0];
  assert.equal(row.maintenance_owner, null);
  assert.equal(row.outcome_evidence_ref, null);
  assert.ok(row.measurement_gaps.includes("maintenance_owner_missing"));
  assert.ok(row.measurement_gaps.includes("successful_outcome_evidence_missing"));
  assert.equal(report.measurement_window.events_without_valid_timestamp, 1);
});

test("asset catalog discovery: workflow/party/skill 정본을 목록화하고 local automation은 미발견으로 명시", async (t) => {
  const root = tempRoot(t);
  await mkdir(path.join(root, ".workflow", "example_v0"), { recursive: true });
  await mkdir(path.join(root, ".party", "example_cell"), { recursive: true });
  await mkdir(path.join(root, ".registry", "skills", "example_skill"), { recursive: true });
  await writeFile(path.join(root, ".workflow", "index.yaml"), "entries:\n  - workflow_id: example_v0\n    path: example_v0/workflow.yaml\n", "utf8");
  await writeFile(path.join(root, ".workflow", "example_v0", "workflow.yaml"), "workflow_id: example_v0\nstatus: active\n", "utf8");
  await writeFile(path.join(root, ".party", "index.yaml"), "entries:\n  - party_id: example_cell\n    path: example_cell/party.yaml\n", "utf8");
  await writeFile(path.join(root, ".party", "example_cell", "party.yaml"), "party_id: example_cell\nstatus: active\n", "utf8");
  await writeFile(path.join(root, ".registry", "skills", "example_skill", "skill.yaml"), "skill_id: example_skill\nstatus: active\n", "utf8");

  const catalog = await discoverCustomAssetCatalog(root);
  assert.deepEqual(catalog.assets.map((row) => `${row.asset_type}:${row.asset_id}`), [
    "party:example_cell",
    "skill:example_skill",
    "workflow:example_v0",
  ]);
  assert.equal(catalog.discovery.automation_catalog, "event_only_local_or_external");
});
