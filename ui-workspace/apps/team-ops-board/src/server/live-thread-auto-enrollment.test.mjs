import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEmptyThreadEnrollmentRegistry,
  readThreadEnrollmentRegistry,
  registerExistingThread,
  writeThreadEnrollmentRegistryAtomic
} from "../core/live-thread-enrollment.mjs";
import {
  collectExactParentThreadLineage,
  createLiveThreadAutoEnrollmentReconciler,
  reconcileAndPersistLiveThreadAutoEnrollment
} from "./live-thread-auto-enrollment.mjs";

const AT = "2026-08-06T01:02:03.000Z";
const NOW = Date.parse(AT);
const ENV = {};

function organizationCatalog() {
  return {
    schema_version: "soulforge.team_ops_board.organization_catalog.v1",
    catalog_revision: 1,
    updated_at: AT,
    disabled: false,
    root_display_label: "Synthetic organization",
    companies: [{
      company_id: "synthetic-company",
      display_label: "Synthetic Company",
      ceo_group_id: "org-system",
      sort_order: 0,
      lifecycle: "active"
    }],
    groups: [{
      organization_group_id: "org-system",
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

async function writeParentRegistry(path) {
  const registered = registerExistingThread(createEmptyThreadEnrollmentRegistry({ now: AT }), {
    threadId: "parent-current",
    organizationGroupId: "org-system",
    routeId: "route-parent",
    workId: "work-parent",
    threadKind: "manager",
    displayLabel: "Owner-provided parent",
    relationship: "primary",
    lifecycle: "current"
  }, { now: AT, env: ENV, organizationCatalog: organizationCatalog() });
  assert.equal(registered.error, null);
  await writeThreadEnrollmentRegistryAtomic(path, registered.registry, { env: ENV });
}

test("app-server lineage collector retains only exact identifiers and status type", () => {
  const collected = collectExactParentThreadLineage([{
    id: "child-exact",
    parentThreadId: "parent-current",
    status: { type: "active" },
    name: "RAW_TITLE_MUST_NOT_REACH_RECONCILER",
    cwd: "RAW_CWD_MUST_NOT_REACH_RECONCILER",
    messages: ["RAW_MESSAGE_MUST_NOT_REACH_RECONCILER"]
  }, {
    id: "child-exact",
    parentThreadId: "parent-current",
    status: { type: "malformed status" }
  }, {
    id: "invalid id",
    parentThreadId: "parent-current",
    status: { type: "malformed status" }
  }]);
  assert.deepEqual(collected, {
    candidates: [{
      thread_id: "child-exact",
      parent_thread_id: "parent-current",
      status_type: "active"
    }],
    malformed_count: 2,
    unsafe_thread_ids: ["child-exact"]
  });
  assert.equal(JSON.stringify(collected).includes("RAW_TITLE_MUST_NOT_REACH_RECONCILER"), false);
  assert.equal(JSON.stringify(collected).includes("RAW_CWD_MUST_NOT_REACH_RECONCILER"), false);
  assert.equal(JSON.stringify(collected).includes("RAW_MESSAGE_MUST_NOT_REACH_RECONCILER"), false);
});

test("local auto-enrollment is append-only, debounced, and leaves write failures held", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-enrollment-"));
  try {
    const registryPath = join(directory, "thread_visibility.v1.json");
    await writeParentRegistry(registryPath);
    let clock = NOW;
    const reconciler = createLiveThreadAutoEnrollmentReconciler({
      registryPath,
      env: ENV,
      now: () => clock,
      debounceMs: 30_000
    });
    const first = await reconciler.reconcile({
      organizationCatalog: organizationCatalog(),
      candidates: [{
        thread_id: "child-exact",
        parent_thread_id: "parent-current",
        status_type: "active"
      }, {
        thread_id: "child-idle-exact",
        parent_thread_id: "parent-current",
        status_type: "idle"
      }]
    });
    assert.equal(first.status, "available");
    assert.equal(first.changed, true);
    const loaded = await readThreadEnrollmentRegistry(registryPath);
    const child = loaded.registry.entries.find((entry) => entry.thread_id === "child-exact");
    assert.equal(child.organization_group_id, "org-system");
    assert.equal(child.route_id, null);
    assert.equal(child.work_id, null);
    assert.equal(child.parent_thread_id, "parent-current");
    const idleChild = loaded.registry.entries.find((entry) => entry.thread_id === "child-idle-exact");
    assert.equal(idleChild.parent_thread_id, "parent-current");

    clock += 10_000;
    const debounced = await reconciler.reconcile({
      organizationCatalog: organizationCatalog(),
      candidates: [{
        thread_id: "child-later",
        parent_thread_id: "parent-current",
        status_type: "active"
      }]
    });
    assert.equal(debounced.status, "debounced");
    assert.equal(debounced.changed, false);
    assert.equal((await readThreadEnrollmentRegistry(registryPath)).registry.entries.some((entry) => entry.thread_id === "child-later"), false);

    const failed = await reconcileAndPersistLiveThreadAutoEnrollment({
      registryPath,
      organizationCatalog: organizationCatalog(),
      candidates: [{
        thread_id: "child-write-failure",
        parent_thread_id: "parent-current",
        status_type: "active"
      }],
      now: NOW,
      env: ENV,
      writeEnrollmentRegistry: async () => {
        throw new Error("synthetic write failure");
      }
    });
    assert.equal(failed.status, "hold");
    assert.equal(failed.error, "live_thread_auto_enrollment_write_failed");
    assert.equal((await readThreadEnrollmentRegistry(registryPath)).registry.entries.some((entry) => entry.thread_id === "child-write-failure"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the reconciler waits for a local atomic writer instead of returning before a later mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-enrollment-await-write-"));
  try {
    const registryPath = join(directory, "thread_visibility.v1.json");
    await writeParentRegistry(registryPath);
    const loaded = await readThreadEnrollmentRegistry(registryPath);
    let releaseWrite;
    let writeStarted = false;
    const writeGate = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    const reconciler = createLiveThreadAutoEnrollmentReconciler({
      registryPath,
      env: ENV,
      now: () => NOW,
      reconcileAndPersist: (options) => reconcileAndPersistLiveThreadAutoEnrollment({
        ...options,
        readEnrollmentRegistry: async () => loaded,
        writeEnrollmentRegistry: async (path, registry, optionsForWrite) => {
          writeStarted = true;
          await writeGate;
          return writeThreadEnrollmentRegistryAtomic(path, registry, optionsForWrite);
        }
      })
    });
    const pending = reconciler.reconcile({
      organizationCatalog: organizationCatalog(),
      candidates: [{
        thread_id: "child-awaited-write",
        parent_thread_id: "parent-current",
        status_type: "active"
      }]
    });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(writeStarted, true);
    assert.equal(settled, false);
    assert.equal((await readThreadEnrollmentRegistry(registryPath)).registry.entries.some((entry) => entry.thread_id === "child-awaited-write"), false);

    releaseWrite();
    const result = await pending;
    assert.equal(result.status, "available");
    assert.equal(result.changed, true);
    assert.equal((await readThreadEnrollmentRegistry(registryPath)).registry.entries.some((entry) => entry.thread_id === "child-awaited-write"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("emergency auto-enrollment disable prevents the registry writer from running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-enrollment-disabled-"));
  try {
    const registryPath = join(directory, "thread_visibility.v1.json");
    await writeParentRegistry(registryPath);
    let writes = 0;
    const result = await reconcileAndPersistLiveThreadAutoEnrollment({
      registryPath,
      organizationCatalog: organizationCatalog(),
      candidates: [{
        thread_id: "child-disabled",
        parent_thread_id: "parent-current",
        status_type: "active"
      }],
      now: NOW,
      env: { TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED: "on" },
      writeEnrollmentRegistry: async () => {
        writes += 1;
      }
    });
    assert.equal(result.status, "disabled");
    assert.equal(result.changed, false);
    assert.equal(writes, 0);
    assert.equal((await readThreadEnrollmentRegistry(registryPath)).registry.entries.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
