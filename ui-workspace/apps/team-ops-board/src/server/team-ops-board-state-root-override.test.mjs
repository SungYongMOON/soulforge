// Proves the SOULFORGE_OWNER_ROOT / SOULFORGE_STATE_ROOT override contract for
// the Board: unset means byte-identical defaults, the state root moves every
// operations binding together, the finer variable wins, and a set-but-invalid
// value refuses instead of falling back to Git or the checkout.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  TEAM_OPS_BOARD_AGENT_RUNTIME_PILOT_URL,
  createScheduledRuntimeEnvironment,
  resolveScheduledRuntimeRoots,
  sanitizeRuntimeFailure,
} from "../../ops/team-ops-board-runtime.mjs";
import { runClaudeQuotaSweep } from "../../ops/ai-usage-producer-companion.mjs";
import { defaultThreadEnrollmentRegistryPath } from "../core/live-thread-enrollment.mjs";
import { defaultThreadResultGateRegistryPath } from "../core/live-thread-result-gate.mjs";
import {
  HERMES_AGENT_RUNTIME_BINDINGS_ENV,
  HERMES_AGENT_RUNTIME_URL_ENV,
} from "./agent-runtime-snapshot-adapter.mjs";
import { resolveAntigravityQuotaCachePath } from "./antigravity-quota-adapter.mjs";
import { defaultLegacyOrganizationCatalogPath } from "./live-organization-catalog-store.mjs";
import { defaultTopologyPointerPath } from "./topology-adapter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The pre-override defaults were `resolve(<module dir>, "..", x5, "guild_hall", "state", ...)`;
// this file sits at the same depth as those modules.
const CHECKOUT_STATE = path.resolve(HERE, "..", "..", "..", "..", "..", "guild_hall", "state");
const SERVE_STATUS = {
  AllowFunnel: { "board.example.ts.net:443": false },
  Web: {
    "board.example.ts.net:443": {
      Handlers: { "/": { Proxy: "http://127.0.0.1:4192" } },
    },
  },
};
const OVERRIDE_INVALID = (error) => error?.code === "soulforge_root_override_invalid";

async function tempDir(t, label) {
  const root = await mkdtemp(path.join(tmpdir(), `board-root-override-${label}-`));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return root;
}

function previousScheduledEnvironment(ownerRoot, operationsRoot) {
  const usageRoot = path.join(operationsRoot, "ai_usage_meter");
  const boardStateRoot = path.join(operationsRoot, "team_ops_board");
  return {
    TEAM_OPS_BOARD_READ_ONLY_PILOT: "1",
    TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH: "1",
    TEAM_OPS_BOARD_ALLOWED_HOSTS: "board.example.ts.net",
    [HERMES_AGENT_RUNTIME_URL_ENV]: TEAM_OPS_BOARD_AGENT_RUNTIME_PILOT_URL,
    [HERMES_AGENT_RUNTIME_BINDINGS_ENV]: path.join(boardStateRoot, "agent_runtime_binding.v1.json"),
    TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY: path.join(boardStateRoot, "thread_visibility.v1.json"),
    TEAM_OPS_BOARD_THREAD_RESULT_GATE_REGISTRY: path.join(boardStateRoot, "thread_result_gate.v1.json"),
    SOULFORGE_AI_USAGE_METER_STATE_ROOT: usageRoot,
    SOULFORGE_AI_USAGE_PROJECT_ROOT: path.resolve(ownerRoot),
    TEAM_OPS_BOARD_LIFECYCLE_SNAPSHOT: path.join(usageRoot, "lifecycle", "current.json"),
    TEAM_OPS_BOARD_LIFECYCLE_DISABLE_CONTROL: path.join(usageRoot, "control", "emergency-disable.v1.json"),
    TEAM_OPS_BOARD_WATCHTOWER_POINTER: path.join(operationsRoot, "watchtower", "binding.pointer.json"),
    TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY: path.join(
      path.resolve(ownerRoot),
      "_workmeta",
      "system",
      "bindings",
      "organization_governance_overlay.v1.json",
    ),
  };
}

test("unset: the scheduled environment is the previous owner-root derivation plus one explicit SOULFORGE_STATE_ROOT", () => {
  const ownerRoot = path.resolve(tmpdir(), "board-owner-root");
  const environment = createScheduledRuntimeEnvironment({ ownerRoot, serveStatus: SERVE_STATUS, baseEnvironment: {} });
  const expected = {
    ...previousScheduledEnvironment(ownerRoot, path.join(path.resolve(ownerRoot), "guild_hall", "state", "operations")),
    SOULFORGE_STATE_ROOT: path.join(path.resolve(ownerRoot), "guild_hall", "state"),
  };
  assert.deepEqual(environment, expected);
  assert.deepEqual(
    createScheduledRuntimeEnvironment({ ownerRoot, stateRoot: null, serveStatus: SERVE_STATUS, baseEnvironment: {} }),
    expected,
  );
});

test("state root: every operations binding moves under it while owner-root surfaces stay on the owner root", () => {
  const ownerRoot = path.resolve(tmpdir(), "board-owner-root");
  const stateRoot = path.resolve(tmpdir(), "board-state-root");
  const environment = createScheduledRuntimeEnvironment({ ownerRoot, stateRoot, serveStatus: SERVE_STATUS, baseEnvironment: {} });
  assert.deepEqual(environment, {
    ...previousScheduledEnvironment(ownerRoot, path.join(stateRoot, "operations")),
    SOULFORGE_STATE_ROOT: stateRoot,
  });
  const ownerState = path.join(path.resolve(ownerRoot), "guild_hall");
  for (const [name, value] of Object.entries(environment)) {
    assert.equal(String(value).startsWith(ownerState), false, `${name} must not stay under the owner root guild_hall subtree`);
  }
  assert.equal(environment.SOULFORGE_AI_USAGE_PROJECT_ROOT, path.resolve(ownerRoot));
  assert.throws(
    () => createScheduledRuntimeEnvironment({ ownerRoot, stateRoot: path.join("relative", "state"), serveStatus: SERVE_STATUS }),
    /owner_root_unavailable/u,
  );
});

test("controller roots: unset uses Git, an override skips Git, the finer variable wins, invalid refuses", async (t) => {
  const gitOwnerRoot = path.resolve(tmpdir(), "board-git-owner");
  let gitCalls = 0;
  const roots = await resolveScheduledRuntimeRoots({ PATH: "x" }, {
    resolveGitOwnerRoot: async () => { gitCalls += 1; return gitOwnerRoot; },
  });
  assert.deepEqual(roots, {
    source: "git",
    ownerRoot: gitOwnerRoot,
    stateRoot: path.join(gitOwnerRoot, "guild_hall", "state"),
  });
  assert.equal(gitCalls, 1);

  const mustNotCallGit = async () => { throw new Error("git must not be consulted under an override"); };
  const stateRoot = await tempDir(t, "state");
  const ownerRoot = await tempDir(t, "owner");
  const codeRoot = path.resolve(tmpdir(), "board-lane-root");
  assert.deepEqual(
    await resolveScheduledRuntimeRoots({ SOULFORGE_STATE_ROOT: stateRoot }, { resolveGitOwnerRoot: mustNotCallGit, codeRoot }),
    { source: "state_root", ownerRoot: codeRoot, stateRoot: path.resolve(stateRoot) },
  );
  assert.deepEqual(
    await resolveScheduledRuntimeRoots(
      { SOULFORGE_STATE_ROOT: stateRoot, SOULFORGE_OWNER_ROOT: ownerRoot },
      { resolveGitOwnerRoot: mustNotCallGit, codeRoot },
    ),
    { source: "state_root", ownerRoot: path.resolve(ownerRoot), stateRoot: path.resolve(stateRoot) },
  );
  assert.deepEqual(
    await resolveScheduledRuntimeRoots({ SOULFORGE_OWNER_ROOT: ownerRoot }, { resolveGitOwnerRoot: mustNotCallGit, codeRoot }),
    {
      source: "owner_root",
      ownerRoot: path.resolve(ownerRoot),
      stateRoot: path.join(path.resolve(ownerRoot), "guild_hall", "state"),
    },
  );

  for (const env of [
    { SOULFORGE_STATE_ROOT: path.join("relative", "state") },
    { SOULFORGE_STATE_ROOT: path.join(stateRoot, "missing") },
    { SOULFORGE_OWNER_ROOT: path.join("relative", "owner") },
    { SOULFORGE_OWNER_ROOT: path.join(ownerRoot, "missing"), SOULFORGE_STATE_ROOT: stateRoot },
    { SOULFORGE_STATE_ROOT: "" },
  ]) {
    await assert.rejects(
      resolveScheduledRuntimeRoots(env, { resolveGitOwnerRoot: mustNotCallGit, codeRoot }),
      (error) => error?.code === "owner_root_override_invalid",
    );
  }
  assert.equal(
    sanitizeRuntimeFailure(Object.assign(new Error("redacted"), { code: "owner_root_override_invalid" })),
    "owner_root_override_invalid",
  );
});

test("default state paths: unset equals the checkout-relative default, override moves them, invalid refuses", async (t) => {
  assert.equal(
    defaultThreadEnrollmentRegistryPath({}),
    path.resolve(CHECKOUT_STATE, "operations", "team_ops_board", "thread_visibility.v1.json"),
  );
  assert.equal(
    defaultThreadResultGateRegistryPath({}),
    path.resolve(CHECKOUT_STATE, "operations", "team_ops_board", "thread_result_gate.v1.json"),
  );
  assert.equal(
    defaultLegacyOrganizationCatalogPath({}),
    path.resolve(CHECKOUT_STATE, "operations", "team_ops_board", "organization_catalog.v1.json"),
  );
  assert.equal(
    defaultTopologyPointerPath({}),
    path.resolve(CHECKOUT_STATE, "operations", "watchtower", "binding.pointer.json"),
  );
  assert.equal(defaultThreadEnrollmentRegistryPath(), defaultThreadEnrollmentRegistryPath(process.env));

  const stateRoot = await tempDir(t, "paths-state");
  const ownerRoot = await tempDir(t, "paths-owner");
  const stateEnv = { SOULFORGE_STATE_ROOT: stateRoot };
  const ownerEnv = { SOULFORGE_OWNER_ROOT: ownerRoot };
  const bothEnv = { ...ownerEnv, ...stateEnv };
  const underState = (...segments) => path.join(path.resolve(stateRoot), "operations", ...segments);
  const underOwner = (...segments) => path.join(path.resolve(ownerRoot), "guild_hall", "state", "operations", ...segments);

  assert.equal(defaultThreadEnrollmentRegistryPath(stateEnv), underState("team_ops_board", "thread_visibility.v1.json"));
  assert.equal(defaultThreadEnrollmentRegistryPath(ownerEnv), underOwner("team_ops_board", "thread_visibility.v1.json"));
  assert.equal(defaultThreadEnrollmentRegistryPath(bothEnv), underState("team_ops_board", "thread_visibility.v1.json"));
  assert.equal(defaultThreadResultGateRegistryPath(stateEnv), underState("team_ops_board", "thread_result_gate.v1.json"));
  assert.equal(defaultThreadResultGateRegistryPath(ownerEnv), underOwner("team_ops_board", "thread_result_gate.v1.json"));
  assert.equal(defaultLegacyOrganizationCatalogPath(stateEnv), underState("team_ops_board", "organization_catalog.v1.json"));
  assert.equal(defaultLegacyOrganizationCatalogPath(ownerEnv), underOwner("team_ops_board", "organization_catalog.v1.json"));
  assert.equal(
    defaultLegacyOrganizationCatalogPath({ ...stateEnv, TEAM_OPS_BOARD_ORGANIZATION_CATALOG: "explicit-catalog" }),
    "explicit-catalog",
  );
  assert.equal(defaultTopologyPointerPath(stateEnv), underState("watchtower", "binding.pointer.json"));
  assert.equal(defaultTopologyPointerPath(ownerEnv), underOwner("watchtower", "binding.pointer.json"));

  for (const resolver of [
    defaultThreadEnrollmentRegistryPath,
    defaultThreadResultGateRegistryPath,
    defaultLegacyOrganizationCatalogPath,
    defaultTopologyPointerPath,
    resolveAntigravityQuotaCachePath,
  ]) {
    assert.throws(() => resolver({ SOULFORGE_STATE_ROOT: path.join("relative", "state") }), OVERRIDE_INVALID);
    assert.throws(() => resolver({ SOULFORGE_OWNER_ROOT: path.join(stateRoot, "missing") }), OVERRIDE_INVALID);
  }
});

test("antigravity quota cache: state root > explicit project root > owner root > null", async (t) => {
  const stateRoot = await tempDir(t, "agy-state");
  const ownerRoot = await tempDir(t, "agy-owner");
  const projectRoot = path.resolve(tmpdir(), "agy-project-root");
  const cacheUnder = (root) => path.join(root, "operations", "team_ops_board", "antigravity_quota.last.json");
  assert.equal(resolveAntigravityQuotaCachePath({}), null);
  assert.equal(resolveAntigravityQuotaCachePath({ SOULFORGE_AI_USAGE_PROJECT_ROOT: path.join("relative", "owner") }), null);
  assert.equal(
    resolveAntigravityQuotaCachePath({ SOULFORGE_AI_USAGE_PROJECT_ROOT: projectRoot }),
    path.join(projectRoot, "guild_hall", "state", "operations", "team_ops_board", "antigravity_quota.last.json"),
  );
  assert.equal(
    resolveAntigravityQuotaCachePath({ SOULFORGE_AI_USAGE_PROJECT_ROOT: projectRoot, SOULFORGE_STATE_ROOT: stateRoot }),
    cacheUnder(path.resolve(stateRoot)),
  );
  assert.equal(
    resolveAntigravityQuotaCachePath({ SOULFORGE_AI_USAGE_PROJECT_ROOT: projectRoot, SOULFORGE_OWNER_ROOT: ownerRoot }),
    cacheUnder(path.join(projectRoot, "guild_hall", "state")),
  );
  assert.equal(
    resolveAntigravityQuotaCachePath({ SOULFORGE_OWNER_ROOT: ownerRoot }),
    cacheUnder(path.join(path.resolve(ownerRoot), "guild_hall", "state")),
  );
});

test("Claude quota sweep binds provider_quota under the operations state root, defaulting to the owner root", async () => {
  const repoRoot = path.resolve(tmpdir(), "quota-repo-root");
  const projectRoot = path.resolve(tmpdir(), "quota-owner-root");
  const calls = [];
  const run = async (file, args) => { calls.push(args); };
  const gatePath = (args) => args[args.indexOf("--gate-path") + 1];
  const receiptPath = (args) => args[args.indexOf("--receipt-path") + 1];

  assert.deepEqual(await runClaudeQuotaSweep({ repoRoot, projectRoot, run }), { status: "observed" });
  const ownerQuota = path.join(projectRoot, "guild_hall", "state", "operations", "provider_quota", "claude");
  assert.equal(gatePath(calls[0]), path.join(ownerQuota, "oauth", "enabled.v1.json"));
  assert.equal(receiptPath(calls[0]), path.join(ownerQuota, "statusline", "provider_quota.receipt.v1.json"));

  const operationsStateRoot = path.resolve(tmpdir(), "quota-state-root", "operations");
  assert.deepEqual(await runClaudeQuotaSweep({ repoRoot, projectRoot, operationsStateRoot, run }), { status: "observed" });
  const movedQuota = path.join(operationsStateRoot, "provider_quota", "claude");
  assert.equal(gatePath(calls[1]), path.join(movedQuota, "oauth", "enabled.v1.json"));
  assert.equal(receiptPath(calls[1]), path.join(movedQuota, "statusline", "provider_quota.receipt.v1.json"));

  assert.deepEqual(
    await runClaudeQuotaSweep({ repoRoot, projectRoot, operationsStateRoot: path.join("relative", "operations"), run }),
    { status: "hold", error_code: "quota_root_unavailable" },
  );
  assert.equal(calls.length, 2);
});
