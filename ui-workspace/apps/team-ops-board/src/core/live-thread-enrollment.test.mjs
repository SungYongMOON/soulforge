import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  archiveThreadEnrollmentHistory,
  createEmptyThreadEnrollmentRegistry,
  readThreadEnrollmentRegistry,
  registerExistingThread,
  retireThreadEnrollment,
  rolloverThreadEnrollment,
  validateThreadEnrollmentRegistry,
  writeThreadEnrollmentRegistryAtomic
} from "./live-thread-enrollment.mjs";

const AT = "2026-08-04T01:02:03.000Z";
const ENV = {};
const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "live-thread-enrollment-cli.mjs");

function registration(threadId, overrides = {}) {
  return {
    threadId,
    organizationGroupId: "org-development1",
    routeId: "route-board",
    workId: "work-board",
    threadKind: "task",
    displayLabel: "Board TASK",
    relationship: "primary",
    lifecycle: "current",
    ...overrides
  };
}

function organizationCatalog(groupId = "org-development1") {
  return {
    schema_version: "soulforge.team_ops_board.organization_catalog.v1",
    catalog_revision: 1,
    updated_at: AT,
    disabled: false,
    root_display_label: "Synthetic organization",
    companies: [{
      company_id: "synthetic-company",
      display_label: "Synthetic Company",
      ceo_group_id: groupId,
      sort_order: 0,
      lifecycle: "active"
    }],
    groups: [{
      organization_group_id: groupId,
      company_id: "synthetic-company",
      display_label: "Synthetic CEO",
      parent_group_id: null,
      presentation_role: "ceo",
      sort_order: 0,
      lifecycle: "active"
    }],
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

function organizationGovernanceSource(groupId = "org-development1") {
  return {
    schema_version: "soulforge.organization_governance_overlay.v1",
    catalog_revision: 1,
    effective_at: AT,
    updated_at: AT,
    authority_state: "validated_private",
    disabled: false,
    root_display_label: "Synthetic organization",
    organizations: [{
      organization_id: groupId,
      parent_organization_id: null,
      organization_kind: "company",
      display_label: "Synthetic Company",
      display_order: 0,
      lifecycle: "active",
      member_branch_ids: ["common"],
      owner_authority_ref: "owner-approved:organization-governance-v1",
      identity_state: "legacy_projection",
      mapping_authority: "owner_seeded",
      legacy_projection_ref: `owner-seeded:${groupId}`
    }],
    role_bindings: [{
      role_binding_id: `${groupId}:company_ceo`,
      organization_id: groupId,
      role_code: "company_ceo",
      position_code: null,
      rank: 0,
      display_order: 0,
      stable_route_id: null,
      display_label: "CEO",
      lifecycle: "active"
    }],
    metadata_only: true
  };
}

test("exact registration is idempotent and conflicting metadata is rejected", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const first = registerExistingThread(empty, registration("thread-001"), { now: AT, env: ENV });
  assert.equal(first.error, null);
  assert.equal(first.changed, true);
  assert.equal(first.registry.entries.length, 1);
  const repeat = registerExistingThread(first.registry, registration("thread-001"), { now: "2026-08-04T01:03:03.000Z", env: ENV });
  assert.equal(repeat.error, null);
  assert.equal(repeat.changed, false);
  assert.equal(repeat.registry.registry_revision, first.registry.registry_revision);
  const conflict = registerExistingThread(first.registry, registration("thread-001", { routeId: "route-other" }), { now: AT, env: ENV });
  assert.equal(conflict.error, "thread_id_conflict");
});

test("enrollment forces metadata-only false raw flags and validates them", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const rejected = registerExistingThread(empty, registration("thread-raw", { raw_preview: true }), { now: AT, env: ENV });
  assert.equal(rejected.error, "invalid_enrollment_entry");
  const accepted = registerExistingThread(empty, registration("thread-safe", { raw_preview: false, raw_turns: false }), { now: AT, env: ENV });
  assert.equal(accepted.entry.metadata_only, true);
  assert.equal(accepted.entry.raw_preview, false);
  assert.equal(accepted.entry.raw_turns, false);
  const invalidRegistry = {
    ...accepted.registry,
    entries: [{ ...accepted.entry, raw_messages: true }]
  };
  assert.equal(validateThreadEnrollmentRegistry(invalidRegistry).valid, false);
});

test("available organization catalog rejects an unassigned enrollment group and makes validate fail closed", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const catalog = organizationCatalog();
  const accepted = registerExistingThread(
    empty,
    registration("thread-catalog-known"),
    { now: AT, env: ENV, organizationCatalog: catalog }
  );
  assert.equal(accepted.error, null);
  const unknown = registerExistingThread(
    accepted.registry,
    registration("thread-catalog-unknown", { organizationGroupId: "unassigned-future-group" }),
    { now: AT, env: ENV, organizationCatalog: catalog }
  );
  assert.equal(unknown.error, "organization_group_not_active");
  const mismatchedRegistry = {
    ...accepted.registry,
    entries: accepted.registry.entries.map((entry) => ({ ...entry, organization_group_id: "unassigned-future-group" }))
  };
  const validation = validateThreadEnrollmentRegistry(mismatchedRegistry, { organizationCatalog: catalog });
  assert.equal(validation.valid, false);
  assert.equal(validation.error, "enrollment_organization_group_unassigned");
  assert.deepEqual(validation.organization.unknown_group_ids, ["unassigned-future-group"]);
});

test("owner display labels normalize Korean text and reject unsafe values", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const fullWidthKoreanLabel = "\uFF23\uFF25\uFF2F\u3000\u2014\u3000\uAC1C\uBC1C1 \uCC45\uC784 TASK";
  const normalizedKoreanLabel = "CEO \u2014 \uAC1C\uBC1C1 \uCC45\uC784 TASK";
  const accepted = registerExistingThread(
    empty,
    registration("thread-korean-label", { displayLabel: fullWidthKoreanLabel }),
    { now: AT, env: ENV }
  );
  assert.equal(accepted.error, null);
  assert.equal(accepted.entry.display_label, normalizedKoreanLabel);

  const localAbsoluteLabel = ["C:", "private", "worktree"].join("\\");
  for (const displayLabel of ["https://example.test/private", "file:private", "C:relative-path", localAbsoluteLabel, "owner\nTASK", "x".repeat(121)]) {
    const rejected = registerExistingThread(empty, registration(`thread-unsafe-${displayLabel.length}`, { displayLabel }), { now: AT, env: ENV });
    assert.equal(rejected.error, "invalid_enrollment_entry");
  }

  const unsafeRegistry = {
    ...accepted.registry,
    entries: [{ ...accepted.entry, display_label: "//server/private" }]
  };
  assert.equal(validateThreadEnrollmentRegistry(unsafeRegistry).valid, false);
});

test("rollover promotes exact pending enrollment and preserves the prior record as history", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const oldCurrent = registerExistingThread(empty, registration("thread-old"), { now: AT, env: ENV }).registry;
  const pending = registerExistingThread(
    oldCurrent,
    registration("thread-new", {
      lifecycle: "pending",
      threadKind: "continuation",
      relationship: "continuation",
      parentThreadId: null,
      priorThreadHistoryPointer: "history:thread-old"
    }),
    { now: "2026-08-04T01:03:03.000Z", env: ENV }
  ).registry;
  const rollover = rolloverThreadEnrollment(pending, {
    priorThreadId: "thread-old",
    threadId: "thread-new",
    nextLifecycle: "current"
  }, { now: "2026-08-04T01:04:03.000Z", env: ENV });
  assert.equal(rollover.error, null);
  assert.equal(rollover.registry.entries.find((entry) => entry.thread_id === "thread-old").lifecycle, "history");
  assert.equal(rollover.registry.entries.find((entry) => entry.thread_id === "thread-new").lifecycle, "current");
  const retired = retireThreadEnrollment(rollover.registry, "thread-new", { now: "2026-08-04T01:05:03.000Z", env: ENV });
  assert.equal(retired.entry.lifecycle, "retired");
  const history = archiveThreadEnrollmentHistory(retired.registry, "thread-new", { now: "2026-08-04T01:06:03.000Z", env: ENV });
  assert.equal(history.entry.lifecycle, "history");
});

test("rollover honors an explicit root null and an explicit reparented child", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const withOldRoot = registerExistingThread(empty, registration("manager-old", { threadKind: "manager" }), { now: AT, env: ENV }).registry;
  const rootRollover = rolloverThreadEnrollment(withOldRoot, {
    priorThreadId: "manager-old",
    threadId: "manager-new",
    parentThreadId: null,
    nextLifecycle: "current"
  }, { now: "2026-08-04T01:04:03.000Z", env: ENV });
  assert.equal(rootRollover.error, null);
  assert.equal(rootRollover.entry.parent_thread_id, null);

  const withOldChild = registerExistingThread(rootRollover.registry, registration("responsibility-old", {
    threadKind: "manager",
    relationship: "child",
    parentThreadId: "manager-new"
  }), { now: "2026-08-04T01:05:03.000Z", env: ENV }).registry;
  const childRollover = rolloverThreadEnrollment(withOldChild, {
    priorThreadId: "responsibility-old",
    threadId: "responsibility-new",
    parentThreadId: "manager-new",
    nextLifecycle: "current"
  }, { now: "2026-08-04T01:06:03.000Z", env: ENV });
  assert.equal(childRollover.error, null);
  assert.equal(childRollover.entry.parent_thread_id, "manager-new");
});

test("rollover keeps the stable role position and reparents active direct children", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const withRoot = registerExistingThread(
    empty,
    registration("manager-old", { threadKind: "manager", parentThreadId: null }),
    { now: AT, env: ENV }
  ).registry;
  const withCurrentChild = registerExistingThread(
    withRoot,
    registration("task-current", { parentThreadId: "manager-old", relationship: "child" }),
    { now: "2026-08-04T01:01:03.000Z", env: ENV }
  ).registry;
  const withPendingChild = registerExistingThread(
    withCurrentChild,
    registration("task-pending", { parentThreadId: "manager-old", relationship: "child", lifecycle: "pending" }),
    { now: "2026-08-04T01:02:03.000Z", env: ENV }
  ).registry;
  const withHistoryChild = registerExistingThread(
    withPendingChild,
    registration("task-history", { parentThreadId: "manager-old", relationship: "child", lifecycle: "current" }),
    { now: "2026-08-04T01:03:03.000Z", env: ENV }
  ).registry;
  const historyChild = archiveThreadEnrollmentHistory(withHistoryChild, "task-history", {
    now: "2026-08-04T01:04:03.000Z",
    env: ENV
  }).registry;

  const rollover = rolloverThreadEnrollment(historyChild, {
    priorThreadId: "manager-old",
    threadId: "manager-new",
    nextLifecycle: "current"
  }, { now: "2026-08-04T01:05:03.000Z", env: ENV });

  assert.equal(rollover.error, null);
  assert.equal(rollover.entry.parent_thread_id, null);
  assert.equal(rollover.registry.entries.find((entry) => entry.thread_id === "task-current").parent_thread_id, "manager-new");
  assert.equal(rollover.registry.entries.find((entry) => entry.thread_id === "task-pending").parent_thread_id, "manager-new");
  assert.equal(rollover.registry.entries.find((entry) => entry.thread_id === "task-history").parent_thread_id, "manager-old");
});

test("rollover repairs an exact completed rollover that is missing its history pointer", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT });
  const withOld = registerExistingThread(empty, registration("manager-old", { threadKind: "manager" }), { now: AT, env: ENV }).registry;
  const withPendingTarget = registerExistingThread(withOld, registration("manager-new", {
    lifecycle: "pending",
    threadKind: "manager",
    parentThreadId: null
  }), { now: "2026-08-04T01:03:03.000Z", env: ENV }).registry;
  const incomplete = {
    ...withPendingTarget,
    entries: withPendingTarget.entries.map((entry) => {
      if (entry.thread_id === "manager-old") return { ...entry, lifecycle: "history" };
      if (entry.thread_id === "manager-new") return { ...entry, lifecycle: "current" };
      return entry;
    })
  };
  const repaired = rolloverThreadEnrollment(incomplete, {
    priorThreadId: "manager-old",
    threadId: "manager-new",
    parentThreadId: null,
    nextLifecycle: "current"
  }, { now: "2026-08-04T01:04:03.000Z", env: ENV });
  assert.equal(repaired.error, null);
  assert.equal(repaired.changed, true);
  assert.equal(repaired.entry.prior_thread_history_pointer, "history:manager-old");
  assert.equal(repaired.prior.lifecycle, "history");
});

test("atomic writer replaces a temp registry without leaving temporary files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-thread-enrollment-"));
  try {
    const path = join(directory, "thread_visibility.v1.json");
    const registry = registerExistingThread(
      createEmptyThreadEnrollmentRegistry({ now: AT }),
      registration("thread-atomic", { displayLabel: "\uC6B4\uC601 \uCD1D\uAD04 TASK" }),
      { now: AT, env: ENV }
    ).registry;
    await writeThreadEnrollmentRegistryAtomic(path, registry, { env: ENV });
    const loaded = await readThreadEnrollmentRegistry(path);
    assert.equal(loaded.status, "available");
    assert.equal(loaded.registry.entries[0].thread_id, "thread-atomic");
    assert.equal(loaded.registry.entries[0].display_label, "\uC6B4\uC601 \uCD1D\uAD04 TASK");
    const files = await readdir(directory);
    assert.deepEqual(files, ["thread_visibility.v1.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("enrollment CLI accepts only a safe owner-provided display label", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-thread-enrollment-cli-"));
  try {
    const path = join(directory, "thread_visibility.v1.json");
    const env = { ...process.env, TEAM_OPS_BOARD_LIVE_THREADS_DISABLED: "0" };
    delete env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY;
    env.TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY = join(directory, "missing-organization_governance_overlay.v1.json");
    const args = [
      CLI_PATH,
      "register-existing",
      "--registry", path,
      "--thread-id", "thread-cli-label",
      "--organization-group-id", "org-development1",
      "--thread-kind", "task",
      "--display-label", "Owner release TASK",
      "--relationship", "primary"
    ];
    const accepted = spawnSync(process.execPath, args, { encoding: "utf8", env });
    assert.equal(accepted.status, 0, accepted.stderr);
    const loaded = await readThreadEnrollmentRegistry(path);
    assert.equal(loaded.registry.entries[0].display_label, "Owner release TASK");

    const rejected = spawnSync(process.execPath, [
      CLI_PATH,
      "register-existing",
      "--registry", path,
      "--thread-id", "thread-cli-unsafe",
      "--organization-group-id", "org-development1",
      "--thread-kind", "task",
      "--display-label", "https://example.test/private",
      "--relationship", "primary"
    ], { encoding: "utf8", env });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /invalid_enrollment_entry/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("enrollment CLI validates an available governance-projected group before it writes local registration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-thread-enrollment-catalog-cli-"));
  try {
    const registryPath = join(directory, "thread_visibility.v1.json");
    const catalogPath = join(directory, "organization_governance_overlay.v1.json");
    await writeFile(catalogPath, `${JSON.stringify(organizationGovernanceSource(), null, 2)}\n`, "utf8");
    const env = { ...process.env, TEAM_OPS_BOARD_LIVE_THREADS_DISABLED: "0" };
    delete env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY;
    const common = [
      CLI_PATH,
      "register-existing",
      "--registry", registryPath,
      "--organization-catalog", catalogPath,
      "--thread-kind", "task",
      "--display-label", "Catalog checked TASK",
      "--relationship", "primary"
    ];
    const accepted = spawnSync(process.execPath, [
      ...common,
      "--thread-id", "thread-catalog-cli",
      "--organization-group-id", "org-development1"
    ], { encoding: "utf8", env });
    assert.equal(accepted.status, 0, accepted.stderr);
    const rejected = spawnSync(process.execPath, [
      ...common,
      "--thread-id", "thread-catalog-cli-unknown",
      "--organization-group-id", "unassigned-future-group"
    ], { encoding: "utf8", env });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /organization_group_not_active/u);
    const loaded = await readThreadEnrollmentRegistry(registryPath);
    assert.equal(loaded.registry.entries.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("emergency environment and registry configuration disable enrollment mutation", () => {
  const empty = createEmptyThreadEnrollmentRegistry({ now: AT, disabled: true });
  const configBlocked = registerExistingThread(empty, registration("thread-config-blocked"), { now: AT, env: ENV });
  assert.equal(configBlocked.error, "live_thread_enrollment_disabled");
  const envBlocked = registerExistingThread(
    createEmptyThreadEnrollmentRegistry({ now: AT }),
    registration("thread-env-blocked"),
    { now: AT, env: { TEAM_OPS_BOARD_LIVE_THREADS_DISABLED: "1" } }
  );
  assert.equal(envBlocked.error, "live_thread_enrollment_disabled");
});
