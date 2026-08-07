import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutoEnrollmentDisplayLabel,
  reconcileExactParentThreadAutoEnrollment
} from "./live-thread-auto-enrollment.mjs";
import {
  createEmptyThreadEnrollmentRegistry,
  registerExistingThread
} from "./live-thread-enrollment.mjs";

const AT = "2026-08-06T01:02:03.000Z";
const ENV = {};

function organizationCatalog({ developmentLifecycle = "active" } = {}) {
  return {
    schema_version: "soulforge.team_ops_board.organization_catalog.v1",
    catalog_revision: 1,
    updated_at: AT,
    disabled: false,
    root_display_label: "Synthetic organization",
    companies: [{
      company_id: "synthetic-company",
      display_label: "Synthetic Company",
      ceo_group_id: "org-company-ceo",
      sort_order: 0,
      lifecycle: "active"
    }],
    groups: [{
      organization_group_id: "org-company-ceo",
      company_id: "synthetic-company",
      display_label: "Synthetic CEO",
      parent_group_id: null,
      presentation_role: "ceo",
      sort_order: 0,
      lifecycle: "active"
    }, {
      organization_group_id: "org-development1",
      company_id: "synthetic-company",
      display_label: "Synthetic development group",
      parent_group_id: "org-company-ceo",
      presentation_role: "group_node",
      sort_order: 1,
      lifecycle: developmentLifecycle
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

function registration(threadId, overrides = {}) {
  return {
    threadId,
    organizationGroupId: "org-development1",
    routeId: "route-parent-private",
    workId: "work-parent-private",
    threadKind: "manager",
    displayLabel: "Owner-provided parent TASK",
    relationship: "primary",
    lifecycle: "current",
    ...overrides
  };
}

function register(registry, threadId, overrides = {}) {
  const result = registerExistingThread(registry, registration(threadId, overrides), {
    now: AT,
    env: ENV,
    organizationCatalog: organizationCatalog()
  });
  assert.equal(result.error, null);
  return result.registry;
}

function lineage(threadId, parentThreadId, statusType = "active") {
  return {
    thread_id: threadId,
    parent_thread_id: parentThreadId,
    status_type: statusType
  };
}

test("exact-parent auto-enrollment appends a safe child and ignores all raw-looking candidate fields", () => {
  const parentRegistry = register(createEmptyThreadEnrollmentRegistry({ now: AT }), "parent-current");
  const result = reconcileExactParentThreadAutoEnrollment(parentRegistry, {
    organizationCatalog: organizationCatalog(),
    candidates: [
      lineage("child-exact", "parent-current"),
      lineage("child-idle", "parent-current", "idle"),
      lineage("root-thread", null),
      lineage("child-unlinked", "unknown-parent"),
      {
        ...lineage("child-raw-shape", "parent-current"),
        name: "RAW_THREAD_TITLE_MUST_NOT_BE_USED"
      }
    ],
    now: AT,
    env: ENV
  });

  assert.equal(result.error, null);
  assert.equal(result.changed, true);
  assert.equal(result.summary.enrolled, 2);
  assert.equal(result.summary.root, 1);
  assert.equal(result.summary.unlinked, 1);
  assert.equal(result.summary.malformed, 1);
  assert.equal(result.summary.unsupported_status, 0);
  const parent = result.registry.entries.find((entry) => entry.thread_id === "parent-current");
  const child = result.registry.entries.find((entry) => entry.thread_id === "child-exact");
  assert.equal(parent.route_id, "route-parent-private");
  assert.equal(parent.work_id, "work-parent-private");
  assert.deepEqual(child, {
    thread_id: "child-exact",
    organization_group_id: "org-development1",
    route_id: null,
    work_id: null,
    thread_kind: "task",
    display_label: "자동 발견 TASK · child-exact",
    relationship: "child",
    lifecycle: "current",
    parent_thread_id: "parent-current",
    prior_thread_history_pointer: null,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false,
    enrolled_at: AT,
    updated_at: AT
  });
  assert.equal(buildAutoEnrollmentDisplayLabel("child-exact"), "자동 발견 TASK · child-exact");
  assert.equal(JSON.stringify(child).includes("RAW_THREAD_TITLE_MUST_NOT_BE_USED"), false);
  const idleChild = result.registry.entries.find((entry) => entry.thread_id === "child-idle");
  assert.equal(idleChild.parent_thread_id, "parent-current");
  assert.equal(idleChild.thread_kind, "task");
});

test("auto-enrollment never revives an existing lifecycle and resolves only one exact parent", () => {
  let registry = createEmptyThreadEnrollmentRegistry({ now: AT });
  registry = register(registry, "parent-one");
  registry = register(registry, "parent-two", { lifecycle: "accepted" });
  registry = register(registry, "child-history", {
    lifecycle: "history",
    relationship: "child",
    parentThreadId: "parent-one"
  });
  const historyBefore = registry.entries.find((entry) => entry.thread_id === "child-history");

  const first = reconcileExactParentThreadAutoEnrollment(registry, {
    organizationCatalog: organizationCatalog(),
    candidates: [
      lineage("child-history", "parent-one"),
      lineage("child-conflicted", "parent-one"),
      lineage("child-conflicted", "parent-two"),
      lineage("child-new", "parent-one")
    ],
    now: AT,
    env: ENV
  });
  assert.equal(first.changed, true);
  assert.equal(first.summary.existing, 1);
  assert.equal(first.summary.conflicted, 1);
  assert.deepEqual(first.registry.entries.find((entry) => entry.thread_id === "child-history"), historyBefore);
  assert.equal(first.registry.entries.some((entry) => entry.thread_id === "child-conflicted"), false);
  assert.equal(first.registry.entries.filter((entry) => entry.thread_id === "child-new").length, 1);

  const repeat = reconcileExactParentThreadAutoEnrollment(first.registry, {
    organizationCatalog: organizationCatalog(),
    candidates: [lineage("child-new", "parent-one")],
    now: "2026-08-06T01:03:03.000Z",
    env: ENV
  });
  assert.equal(repeat.error, null);
  assert.equal(repeat.changed, false);
  assert.equal(repeat.registry.registry_revision, first.registry.registry_revision);
  assert.equal(repeat.registry.entries.find((entry) => entry.thread_id === "child-new").lifecycle, "current");
});

test("mixed root or known-ID malformed observations poison the same active child ID while an active-idle race remains enrollable", () => {
  const registry = register(createEmptyThreadEnrollmentRegistry({ now: AT }), "parent-current");
  const result = reconcileExactParentThreadAutoEnrollment(registry, {
    organizationCatalog: organizationCatalog(),
    candidates: [
      lineage("child-active-root", "parent-current"),
      lineage("child-active-root", null),
      lineage("child-active-idle", "parent-current"),
      lineage("child-active-idle", "parent-current", "idle"),
      lineage("child-active-malformed", "parent-current"),
      {
        ...lineage("child-active-malformed", "parent-current"),
        unexpected_raw_field: "must_poison_known_id"
      },
      lineage("child-boundary-unsafe", "parent-current")
    ],
    unsafeThreadIds: ["child-boundary-unsafe", "invalid unsafe id"],
    now: AT,
    env: ENV
  });
  assert.equal(result.error, null);
  assert.equal(result.changed, true);
  assert.equal(result.summary.root, 1);
  assert.equal(result.summary.unsupported_status, 0);
  assert.equal(result.summary.malformed, 2);
  assert.equal(result.summary.unsafe_identity, 3);
  assert.equal(result.registry.registry_revision, registry.registry_revision + 1);
  assert.equal(result.registry.entries.some((entry) => entry.thread_id === "child-active-root"), false);
  assert.equal(result.registry.entries.some((entry) => entry.thread_id === "child-active-idle"), true);
  assert.equal(result.registry.entries.some((entry) => entry.thread_id === "child-active-malformed"), false);
  assert.equal(result.registry.entries.some((entry) => entry.thread_id === "child-boundary-unsafe"), false);
});

test("a partial exact lineage listing holds every new child even when the observed link is valid", () => {
  const registry = register(createEmptyThreadEnrollmentRegistry({ now: AT }), "parent-current");
  const result = reconcileExactParentThreadAutoEnrollment(registry, {
    organizationCatalog: organizationCatalog(),
    candidates: [lineage("child-safe", "parent-current")],
    partial: true,
    now: AT,
    env: ENV
  });
  assert.equal(result.error, "partial_exact_lineage_unsafe");
  assert.equal(result.status, "hold");
  assert.equal(result.changed, false);
  assert.equal(result.registry.entries.length, 1);
  assert.equal(result.registry.entries.some((entry) => entry.thread_id === "child-safe"), false);
});

test("only a current or accepted parent in an active organization can auto-enroll", () => {
  const historicalParent = register(createEmptyThreadEnrollmentRegistry({ now: AT }), "parent-history", { lifecycle: "history" });
  const result = reconcileExactParentThreadAutoEnrollment(historicalParent, {
    organizationCatalog: organizationCatalog(),
    candidates: [lineage("child-of-history", "parent-history")],
    now: AT,
    env: ENV
  });
  assert.equal(result.error, null);
  assert.equal(result.changed, false);
  assert.equal(result.summary.unlinked, 1);

  const inactiveGroup = reconcileExactParentThreadAutoEnrollment(register(createEmptyThreadEnrollmentRegistry({ now: AT }), "parent-inactive-group"), {
    organizationCatalog: organizationCatalog({ developmentLifecycle: "retired" }),
    candidates: [lineage("child-inactive-group", "parent-inactive-group")],
    now: AT,
    env: ENV
  });
  assert.equal(inactiveGroup.changed, false);
  assert.equal(inactiveGroup.summary.inactive_parent_group, 1);

  const disabled = reconcileExactParentThreadAutoEnrollment(register(createEmptyThreadEnrollmentRegistry({ now: AT }), "parent-current"), {
    organizationCatalog: organizationCatalog(),
    candidates: [lineage("child-disabled", "parent-current")],
    now: AT,
    env: { TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED: "true" }
  });
  assert.equal(disabled.error, "live_thread_auto_enrollment_disabled");
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.changed, false);
});
