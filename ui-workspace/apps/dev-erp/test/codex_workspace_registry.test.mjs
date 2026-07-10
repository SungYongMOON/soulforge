import assert from "node:assert/strict";
import test from "node:test";
import { linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";

import {
  CODEX_WORKSPACE_REGISTRY_SCHEMA,
  WorkspaceRegistryError,
  evaluateWriteGrant,
  loadWorkspaceRegistry,
  parseWorkspaceRegistry,
  parseWorkspaceRegistryJson,
} from "../src/codex_workspace_registry.mjs";

const WINDOWS_DRIVE = ["C", ":"].join("");

function syntheticWindowsPath(...segments) {
  return win32.join(`${WINDOWS_DRIVE}${win32.sep}`, ...segments);
}

function syntheticUncPath(host, share, ...segments) {
  return `${win32.sep.repeat(2)}${host}${win32.sep}${[share, ...segments].join(win32.sep)}`;
}

function syntheticDevicePath(namespace, ...segments) {
  return `${win32.sep.repeat(2)}${namespace}${win32.sep}${segments.join(win32.sep)}`;
}

const LOCAL_ROOT = syntheticWindowsPath("Team", "Approved", "ProjectA");
const SECOND_LOCAL_ROOT = syntheticWindowsPath("Team", "Approved", "ProjectB");
const UNC_ROOT = syntheticUncPath("TEAM-PC", "ApprovedShare", "ProjectB");

function validDocument() {
  return {
    schema: CODEX_WORKSPACE_REGISTRY_SCHEMA,
    machine_id: "erp-runtime-01",
    trust_domain_id: "erp-team-shared",
    workspaces: [
      {
        workspace_id: "team_local",
        label: "Team local project",
        root_kind: "local",
        root: LOCAL_ROOT,
        allowed_project_ids: ["P26-014"],
        allowed_account_ids: ["acct-local"],
        allowed_write_prefixes: ["Output", "Deliverables/Reviewed"],
      },
      {
        workspace_id: "team_unc",
        label: "Team UNC project",
        root_kind: "local",
        root: SECOND_LOCAL_ROOT,
        default_access: "read-only",
        allowed_project_ids: ["P26-015"],
        allowed_account_ids: ["acct-hw"],
        allowed_roles: ["admin"],
      },
    ],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectRegistryError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof WorkspaceRegistryError);
    assert.equal(error.code, code);
    return true;
  });
}

function injectedWindowsFs({ root = LOCAL_ROOT, target = null, realRoot = root, realTarget = target, rootIno = 101 } = {}) {
  const key = (value) => win32.normalize(String(value)).toLowerCase();
  const targetPath = target ?? win32.join(root, "Docs", "Spec.txt");
  const real = new Map([
    [key(root), realRoot],
    [key(targetPath), realTarget ?? targetPath],
  ]);
  return {
    targetPath,
    fs: {
      existsSync: (value) => real.has(key(value)),
      realpathSync: (value) => {
        const found = real.get(key(value));
        if (!found) throw new Error("ENOENT");
        return found;
      },
      statSync: (value) => ({
        isDirectory: () => key(value) === key(realRoot),
        dev: 1,
        ino: key(value) === key(realRoot) ? rootIno : rootIno + 1,
      }),
    },
  };
}

test("registry parses isolated roots but public output never exposes raw roots", () => {
  const registry = parseWorkspaceRegistry(validDocument());
  const descriptor = registry.publicDescriptor();
  const serialized = JSON.stringify(registry);

  assert.equal(descriptor.schema, "dev_erp.codex_workspace_registry.public.v1");
  assert.equal(descriptor.machine_id, "erp-runtime-01");
  assert.match(descriptor.mapping_revision, /^[a-f0-9]{64}$/);
  assert.deepEqual(descriptor.workspaces.map((row) => row.workspace_id), ["team_local", "team_unc"]);
  for (const row of descriptor.workspaces) {
    assert.deepEqual(Object.keys(row).sort(), ["label", "workspace_id"]);
  }
  assert.equal(serialized.includes(LOCAL_ROOT), false);
  assert.equal(serialized.includes(SECOND_LOCAL_ROOT), false);
  assert.equal(serialized.includes("P26-014"), false);
  assert.equal(serialized.includes("acct-hw"), false);
  assert.equal(serialized.includes("admin"), false);

  const changed = validDocument();
  changed.workspaces[0].root = syntheticWindowsPath("Team", "Approved", "ProjectA-v2");
  const changedDescriptor = parseWorkspaceRegistry(changed).publicDescriptor();
  assert.notEqual(changedDescriptor.mapping_revision, descriptor.mapping_revision);
});

test("enabled workspace roots use one local or one UNC share authority", () => {
  const mixed = validDocument();
  mixed.workspaces[1].root_kind = "unc";
  mixed.workspaces[1].root = UNC_ROOT;
  expectRegistryError(() => parseWorkspaceRegistry(mixed), "workspace_root_authority_mixed");

  const sameShare = validDocument();
  sameShare.workspaces[0].root_kind = "unc";
  sameShare.workspaces[0].root = syntheticUncPath("TEAM-PC", "ApprovedShare", "ProjectA");
  sameShare.workspaces[1].root_kind = "unc";
  sameShare.workspaces[1].root = syntheticUncPath("team-pc", "approvedshare", "ProjectB");
  assert.equal(parseWorkspaceRegistry(sameShare).publicDescriptor().workspaces.length, 2);

  const differentShare = clone(sameShare);
  differentShare.workspaces[1].root = syntheticUncPath("TEAM-PC", "OtherShare", "ProjectB");
  expectRegistryError(() => parseWorkspaceRegistry(differentShare), "workspace_unc_namespace_mismatch");

  const disabledDifferentAuthority = validDocument();
  disabledDifferentAuthority.workspaces[1].root_kind = "unc";
  disabledDifferentAuthority.workspaces[1].root = UNC_ROOT;
  disabledDifferentAuthority.workspaces[1].enabled = false;
  assert.equal(parseWorkspaceRegistry(disabledDifferentAuthority).publicDescriptor().workspaces.length, 1);
});

test("registry JSON loader is injectable and JSON errors are sanitized", () => {
  const loaded = loadWorkspaceRegistry("runtime-local.json", {
    readFileSync: (path, encoding) => {
      assert.equal(path, "runtime-local.json");
      assert.equal(encoding, "utf8");
      return JSON.stringify(validDocument());
    },
  });
  assert.equal(loaded.publicDescriptor().workspaces.length, 2);

  const malformedJson = `{raw-root:${syntheticWindowsPath("DoNotEcho")}}`;
  expectRegistryError(() => parseWorkspaceRegistryJson(malformedJson), "invalid_json");
  try {
    parseWorkspaceRegistryJson(malformedJson);
  } catch (error) {
    assert.equal(String(error).includes("DoNotEcho"), false);
  }
});

test("strict schema rejects unknown fields, duplicates, and writable defaults", () => {
  const missingTrustDomain = validDocument();
  delete missingTrustDomain.trust_domain_id;
  expectRegistryError(() => parseWorkspaceRegistry(missingTrustDomain), "trust_domain_id_invalid");

  const wrongSchema = validDocument();
  wrongSchema.schema = "other.v1";
  expectRegistryError(() => parseWorkspaceRegistry(wrongSchema), "registry_schema_invalid");

  const topExtra = { ...validDocument(), raw_root: syntheticWindowsPath("Leak") };
  expectRegistryError(() => parseWorkspaceRegistry(topExtra), "registry_unknown_field");

  const rowExtra = validDocument();
  rowExtra.workspaces[0].cwd = syntheticWindowsPath("Leak");
  expectRegistryError(() => parseWorkspaceRegistry(rowExtra), "workspace_unknown_field");

  for (const label of [
    `Project at ${syntheticWindowsPath("Team", "Secret")}`,
    `경로:${syntheticWindowsPath("Team", "Secret")}`,
    `[${syntheticWindowsPath("Team", "Secret")}]`,
    `Project at ${syntheticUncPath("TEAM-PC", "SecretShare", "Folder")}`,
    `Project at ${["", "home", "team", "secret"].join("/")}`,
  ]) {
    const rawPathLabel = validDocument();
    rawPathLabel.workspaces[0].label = label;
    expectRegistryError(() => parseWorkspaceRegistry(rawPathLabel), "workspace_label_path_forbidden");
  }

  const duplicate = validDocument();
  duplicate.workspaces[1].workspace_id = "team_local";
  expectRegistryError(() => parseWorkspaceRegistry(duplicate), "workspace_duplicate");

  const duplicateRoot = validDocument();
  duplicateRoot.workspaces[1].root_kind = "local";
  duplicateRoot.workspaces[1].root = LOCAL_ROOT.toLowerCase();
  expectRegistryError(() => parseWorkspaceRegistry(duplicateRoot), "workspace_root_overlap");

  const nestedRoot = validDocument();
  nestedRoot.workspaces[1].root_kind = "local";
  nestedRoot.workspaces[1].root = win32.join(LOCAL_ROOT, "NestedProject");
  expectRegistryError(() => parseWorkspaceRegistry(nestedRoot), "workspace_root_overlap");

  const writable = validDocument();
  writable.workspaces[0].default_access = "workspace-write";
  expectRegistryError(() => parseWorkspaceRegistry(writable), "workspace_default_access_invalid");

  const unrestricted = validDocument();
  delete unrestricted.workspaces[0].allowed_account_ids;
  expectRegistryError(() => parseWorkspaceRegistry(unrestricted), "workspace_principal_scope_required");

  const broadRoleOnly = validDocument();
  delete broadRoleOnly.workspaces[0].allowed_account_ids;
  broadRoleOnly.workspaces[0].allowed_roles = ["member"];
  expectRegistryError(() => parseWorkspaceRegistry(broadRoleOnly), "workspace_principal_scope_too_broad");

  const broadRoleWithAccount = validDocument();
  broadRoleWithAccount.workspaces[0].allowed_roles = ["member"];
  expectRegistryError(() => parseWorkspaceRegistry(broadRoleWithAccount), "workspace_principal_scope_too_broad");

  const missingProjects = validDocument();
  delete missingProjects.workspaces[0].allowed_project_ids;
  expectRegistryError(() => parseWorkspaceRegistry(missingProjects), "workspace_allowed_project_ids_invalid");

  for (const allowed_project_ids of [[], "P26-014", ["P26-014", "p26-014"], ["bad id"]]) {
    const invalid = validDocument();
    invalid.workspaces[0].allowed_project_ids = allowed_project_ids;
    expectRegistryError(
      () => parseWorkspaceRegistry(invalid),
      Array.isArray(allowed_project_ids) && allowed_project_ids.length === 2
        ? "workspace_allowed_project_ids_duplicate"
        : "workspace_allowed_project_ids_invalid",
    );
  }

  for (const [field, value, code] of [
    ["allowed_account_ids", [], "workspace_allowed_account_ids_invalid"],
    ["allowed_account_ids", ["acct-a", "ACCT-A"], "workspace_allowed_account_ids_duplicate"],
    ["allowed_account_ids", ["bad account"], "workspace_allowed_account_ids_invalid"],
    ["allowed_roles", [], "workspace_allowed_roles_invalid"],
    ["allowed_roles", ["admin", "ADMIN"], "workspace_allowed_roles_duplicate"],
    ["allowed_roles", ["bad role"], "workspace_allowed_roles_invalid"],
  ]) {
    const invalid = validDocument();
    invalid.workspaces[0][field] = value;
    expectRegistryError(() => parseWorkspaceRegistry(invalid), code);
  }

  for (const [value, code] of [
    ["Output", "workspace_write_prefixes_invalid"],
    [[""], "workspace_write_prefix_invalid"],
    [["../Output"], "workspace_write_prefix_invalid"],
    [["Output", "output"], "workspace_write_prefix_duplicate"],
    [["Output", "Output/Reviewed"], "workspace_write_prefix_overlap"],
  ]) {
    const invalid = validDocument();
    invalid.workspaces[0].allowed_write_prefixes = value;
    expectRegistryError(() => parseWorkspaceRegistry(invalid), code);
  }
});

test("runtime root isolation rejects junction or share aliases across workspaces", () => {
  const registry = parseWorkspaceRegistry(validDocument());
  const key = (value) => win32.normalize(String(value)).toLowerCase();
  const distinctA = syntheticWindowsPath("Canonical", "ProjectA");
  const distinctB = syntheticWindowsPath("Canonical", "ProjectB");
  const distinctFs = {
    realpathSync: (value) => key(value) === key(LOCAL_ROOT) ? distinctA : distinctB,
    statSync: (value) => ({
      isDirectory: () => true,
      dev: 1,
      ino: key(value) === key(distinctA) ? 101 : 202,
    }),
  };
  const distinct = registry.validateRootIsolation({ fs: distinctFs });
  assert.equal(distinct.ok, true);
  assert.match(distinct.revision, /^[a-f0-9]{64}$/);
  assert.equal(registry.rootIsolationRevision, distinct.revision);

  const sameReal = syntheticWindowsPath("Canonical", "SharedAlias");
  const alias = registry.validateRootIsolation({
    fs: {
      realpathSync: () => sameReal,
      statSync: () => ({ isDirectory: () => true, dev: 1, ino: 303 }),
    },
  });
  assert.deepEqual(alias, { ok: false, error: "workspace_root_real_overlap" });
  assert.equal(registry.rootIsolationRevision, null);

  const parent = syntheticWindowsPath("Canonical", "Parent");
  const child = win32.join(parent, "Child");
  let calls = 0;
  const nested = registry.validateRootIsolation({
    fs: {
      realpathSync: () => (++calls === 1 ? parent : child),
      statSync: (value) => ({ isDirectory: () => true, dev: 1, ino: key(value) === key(parent) ? 404 : 505 }),
    },
  });
  assert.deepEqual(nested, { ok: false, error: "workspace_root_real_overlap" });
});

test("runtime root isolation rejects declared path style aliases before cross-workspace access", () => {
  const document = validDocument();
  document.workspaces[0].root = "/Soulforge-erp-codex-hub/ui-workspace/apps";
  document.workspaces[1].root_kind = "local";
  document.workspaces[1].root = syntheticWindowsPath("Soulforge-erp-codex-hub", "ui-workspace", "apps", "dev-erp");
  const registry = parseWorkspaceRegistry(document);
  let calls = 0;
  const result = registry.validateRootIsolation({
    fs: {
      realpathSync: () => (++calls === 1
        ? syntheticWindowsPath("Soulforge-erp-codex-hub", "ui-workspace", "apps")
        : syntheticWindowsPath("Soulforge-erp-codex-hub", "ui-workspace", "apps", "dev-erp")),
      statSync: () => ({ isDirectory: () => true, dev: 1, ino: calls }),
    },
  });
  assert.deepEqual(result, { ok: false, error: "workspace_root_style_mismatch" });
});

test("bounded root isolation accepts only an exact receipt and fails closed on timeout", async () => {
  const registry = parseWorkspaceRegistry(validDocument());
  const revision = "a".repeat(64);
  const treeRevision = "b".repeat(64);
  const forbiddenRoots = [syntheticWindowsPath("Soulforge", "Runtime")];
  const passed = await registry.validateRootIsolationAsync({
    timeoutMs: 100,
    forbiddenRoots,
    probe: async ({ rows, forbidden_roots }) => {
      assert.equal(rows.length, 2);
      assert.deepEqual(Object.keys(rows[0]).sort(), ["root", "style", "workspace_id"]);
      assert.deepEqual(forbidden_roots, forbiddenRoots);
      return {
        ok: true,
        revision,
        tree_revision: treeRevision,
        immutable_tree_revision: treeRevision,
        workspace_count: rows.length,
        forbidden_root_count: forbidden_roots.length,
        scanned_entry_count: 7,
      };
    },
  });
  assert.deepEqual(passed, {
    ok: true,
    revision,
    tree_revision: treeRevision,
    immutable_tree_revision: treeRevision,
    workspace_count: 2,
    forbidden_root_count: 1,
    scanned_entry_count: 7,
  });
  assert.equal(registry.rootIsolationRevision, revision);
  assert.equal(registry.rootTreeRevision, treeRevision);

  const malformed = await registry.validateRootIsolationAsync({
    timeoutMs: 100,
    probe: async () => ({
      ok: true,
      revision,
      tree_revision: treeRevision,
      immutable_tree_revision: treeRevision,
      workspace_count: 2,
      forbidden_root_count: 0,
      scanned_entry_count: 0,
      leaked_path: LOCAL_ROOT,
    }),
  });
  assert.deepEqual(malformed, { ok: false, error: "workspace_root_isolation_protocol_invalid" });
  assert.equal(registry.rootIsolationRevision, null);

  const timedOut = await registry.validateRootIsolationAsync({
    timeoutMs: 5,
    probe: () => new Promise(() => {}),
  });
  assert.deepEqual(timedOut, { ok: false, error: "workspace_root_isolation_timeout" });
});

test("bounded child rejects forbidden overlap, protected entries, junctions, and hardlinks", async () => {
  const parent = mkdtempSync(join(tmpdir(), "workspace-isolation-"));
  const workspace = join(parent, "approved", "project-a");
  const denied = join(parent, "denied");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(denied, { recursive: true });
  writeFileSync(join(workspace, "safe.txt"), "safe", "utf8");
  writeFileSync(join(denied, "outside.txt"), "outside", "utf8");
  const document = validDocument();
  document.workspaces = [{
    workspace_id: "safe_local",
    label: "Safe local project",
    root_kind: "local",
    root: workspace,
    allowed_project_ids: ["P26-014"],
    allowed_account_ids: ["acct-local"],
    allowed_write_prefixes: [],
  }];
  const validate = () => parseWorkspaceRegistry(document).validateRootIsolationAsync({
    timeoutMs: 5000,
    forbiddenRoots: [denied],
  });
  try {
    const safe = await validate();
    assert.equal(safe.ok, true, JSON.stringify(safe));
    assert.equal(safe.forbidden_root_count, 1);
    assert.equal(safe.scanned_entry_count, 1);

    const overlap = await parseWorkspaceRegistry(document).validateRootIsolationAsync({
      timeoutMs: 5000,
      forbiddenRoots: [parent],
    });
    assert.deepEqual(overlap, { ok: false, error: "workspace_root_boundary_overlap" });

    writeFileSync(join(workspace, ".env.local"), "not-read", "utf8");
    assert.deepEqual(await validate(), { ok: false, error: "workspace_tree_protected_entry" });
    rmSync(join(workspace, ".env.local"), { force: true });

    symlinkSync(denied, join(workspace, "linked-denied"), "junction");
    assert.deepEqual(await validate(), { ok: false, error: "workspace_tree_link_unsafe" });
    rmSync(join(workspace, "linked-denied"), { recursive: true, force: true });

    linkSync(join(denied, "outside.txt"), join(workspace, "outside-hardlink.txt"));
    assert.deepEqual(await validate(), { ok: false, error: "workspace_tree_link_unsafe" });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("authorization is project-bound, authentication-required, and optionally principal-scoped", () => {
  const registry = parseWorkspaceRegistry(validDocument());

  assert.deepEqual(
    registry.authorize("team_local", { project_id: "P26-014", authenticated: false }),
    { ok: false, error: "authentication_required" },
  );
  assert.deepEqual(
    registry.authorize("team_local", { project_id: "P26-999", authenticated: true }),
    { ok: false, error: "workspace_project_forbidden", workspace_id: "team_local" },
  );
  assert.deepEqual(
    registry.authorize("team_local", { project_id: "P26-014", account_id: "acct-local", authenticated: true }),
    { ok: true, workspace: { workspace_id: "team_local", label: "Team local project" } },
  );
  assert.equal(registry.authorize("team_unc", {
    project_id: "P26-015", account_id: "acct-hw", authenticated: true,
  }).ok, true);
  assert.equal(registry.authorize("team_unc", {
    project_id: "P26-015", account_id: "acct-other", roles: ["ADMIN"], authenticated: true,
  }).ok, true);
  assert.deepEqual(
    registry.authorize("team_unc", {
      project_id: "P26-015", account_id: "acct-other", roles: ["member"], authenticated: true,
    }),
    { ok: false, error: "workspace_principal_forbidden", workspace_id: "team_unc" },
  );
  assert.deepEqual(registry.authorize("missing", {
    project_id: "P26-014", authenticated: true,
  }), { ok: false, error: "unknown_workspace" });

  const rows = registry.authorizedPublicRows({ project_id: "P26-014", account_id: "acct-local", authenticated: true });
  assert.deepEqual(rows, [{ workspace_id: "team_local", label: "Team local project" }]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["label", "workspace_id"]);
  assert.deepEqual(registry.authorizedPublicRows({ project_id: "P26-014", authenticated: false }), []);

  const context = { project_id: "P26-014", account_id: "acct-local", authenticated: true };
  assert.deepEqual(registry.authorizeWritePrefixes("team_local", ["Output", "Deliverables/Reviewed/final"], context), {
    ok: true,
    relative_write_prefixes: ["Output", "Deliverables/Reviewed/final"],
  });
  assert.deepEqual(registry.authorizeWritePrefixes("team_local", ["Drafts"], context), {
    ok: false,
    error: "workspace_write_prefix_forbidden",
  });
  assert.equal(registry.authorizeWritePrefixes("team_local", ["Output"], {
    project_id: "P26-014", account_id: "someone-else", authenticated: true,
  }).error, "workspace_principal_forbidden");
});

test("device namespaces, filesystem roots, and protected roots are rejected without echoing them", () => {
  const approvedRoot = syntheticWindowsPath("Team", "Approved");
  const blocked = [
    ["local", syntheticWindowsPath(), "workspace_filesystem_root_forbidden"],
    ["unc", syntheticUncPath("server", "share"), "workspace_filesystem_root_forbidden"],
    ["local", syntheticDevicePath("?", syntheticWindowsPath("Team", "Project")), "workspace_device_path_forbidden"],
    ["unc", syntheticDevicePath("?", "UNC", "server", "share", "Project"), "workspace_device_path_forbidden"],
    ["local", syntheticDevicePath(".", "PhysicalDrive0"), "workspace_device_path_forbidden"],
    ["local", `${approvedRoot}${win32.sep}..${win32.sep}Other`, "workspace_root_invalid"],
    ["local", syntheticWindowsPath("Team", "Approved", "NUL"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Users", "owner"), "workspace_root_too_broad"],
    ["local", syntheticWindowsPath("Soulforge"), "workspace_root_too_broad"],
    ["local", syntheticWindowsPath("Team", "Approved", "Project:stream"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Users", "owner", ".codex", "skills"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Team", "Project", ".git"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Team", "Project", "secrets"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Team", "Project", "_workmeta"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Team", "Project", "private-state"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Soulforge", "_workspaces", "system", "dev-erp"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Soulforge", "guild_hall", "state"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Soulforge-runtime", "ui-workspace", "apps", "dev-erp", "data"), "workspace_protected_path_forbidden"],
    ["local", syntheticWindowsPath("Soulforge-runtime", "ui-workspace", "apps", "dev-erp", "data", "tls"), "workspace_protected_path_forbidden"],
  ];

  for (const [rootKind, root, code] of blocked) {
    const document = validDocument();
    document.workspaces = [{
      workspace_id: "blocked", label: "Blocked", root_kind: rootKind, root, allowed_project_ids: ["P26-014"], allowed_roles: ["admin"],
    }];
    try {
      parseWorkspaceRegistry(document);
      assert.fail(`expected rejection for ${rootKind}`);
    } catch (error) {
      assert.ok(error instanceof WorkspaceRegistryError);
      assert.equal(error.code, code);
      assert.equal(String(error).includes(root), false);
    }
  }
});

test("unknown workspace and unavailable probes fail closed; probe timeout is bounded", async () => {
  const registry = parseWorkspaceRegistry(validDocument());
  let calls = 0;
  const unknown = await registry.probe("missing", {
    probe: async () => { calls += 1; return true; },
    timeoutMs: 10,
  });
  assert.deepEqual(unknown, { ok: false, error: "unknown_workspace" });
  assert.equal(calls, 0);

  const offline = await registry.probe("team_unc", {
    probe: async ({ workspace_id, root }) => {
      calls += 1;
      assert.equal(workspace_id, "team_unc");
      assert.equal(root, SECOND_LOCAL_ROOT);
      return false;
    },
    timeoutMs: 20,
  });
  assert.deepEqual(offline, { ok: false, error: "workspace_offline", workspace_id: "team_unc" });

  const timedOut = await registry.probe("team_local", {
    probe: async () => new Promise(() => {}),
    timeoutMs: 5,
  });
  assert.deepEqual(timedOut, { ok: false, error: "probe_timeout", workspace_id: "team_local" });
});

test("path resolution is Windows case-insensitive and blocks traversal and protected subpaths", () => {
  const registry = parseWorkspaceRegistry(validDocument());
  const target = win32.join(LOCAL_ROOT, "Docs", "Spec.txt");
  const realTarget = syntheticWindowsPath("team", "approved", "projecta", "DOCS", "Spec.txt");
  const { fs } = injectedWindowsFs({
    target,
    realRoot: syntheticWindowsPath("TEAM", "APPROVED", "PROJECTA").replace(/^C/, "c"),
    realTarget,
  });

  const resolved = registry.resolvePath("team_local", "Docs/Spec.txt", { fs });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.workspace_id, "team_local");
  assert.equal(resolved.relative_path, "Docs/Spec.txt");
  assert.equal(resolved.path, realTarget);
  assert.equal(resolved.path_style, "windows");

  for (const relativePath of ["../secret.txt", "..\\secret.txt", syntheticWindowsPath("Outside", "secret.txt"), " Docs/Spec.txt", "Docs/Spec.txt ", "Docs/file:stream", ".git/config", ".codex/config.toml", ".env", "NUL", "secrets/token.txt", "ui-workspace/apps/dev-erp/data/dev-erp.db", "data/tls/server.key"]) {
    const denied = registry.resolvePath("team_local", relativePath, { fs });
    assert.equal(denied.ok, false, relativePath);
    assert.ok(["invalid_relative_path", "protected_relative_path"].includes(denied.error), relativePath);
  }

  assert.deepEqual(registry.resolvePath("missing", "Docs/Spec.txt", { fs }), { ok: false, error: "unknown_workspace" });
});

test("realpath containment rejects junction escape", () => {
  const registry = parseWorkspaceRegistry(validDocument());
  const target = win32.join(LOCAL_ROOT, "Docs", "Spec.txt");
  const { fs } = injectedWindowsFs({ target, realRoot: LOCAL_ROOT, realTarget: syntheticWindowsPath("Outside", "Spec.txt") });
  assert.deepEqual(
    registry.resolvePath("team_local", "Docs/Spec.txt", { fs }),
    { ok: false, error: "junction_escape", workspace_id: "team_local" },
  );
});

test("async path resolution is timeout-bounded and rejects junction escape", async () => {
  const registry = parseWorkspaceRegistry(validDocument());
  const escapedFs = {
    realpath: async (value) => win32.normalize(value).toLowerCase() === win32.normalize(LOCAL_ROOT).toLowerCase()
      ? LOCAL_ROOT
      : syntheticWindowsPath("Outside", "Spec.txt"),
    stat: async () => ({ isDirectory: () => true, dev: 1, ino: 101 }),
  };
  assert.deepEqual(
    await registry.resolvePathAsync("team_local", "Docs/Spec.txt", { fs: escapedFs, timeoutMs: 50 }),
    { ok: false, error: "junction_escape", workspace_id: "team_local" },
  );
  assert.deepEqual(
    await registry.resolvePathAsync("team_local", "Docs/Spec.txt", {
      fs: { realpath: async () => new Promise(() => {}), stat: async () => ({ isDirectory: () => true, dev: 1, ino: 101 }) },
      timeoutMs: 5,
    }),
    { ok: false, error: "filesystem_resolution_timeout", workspace_id: "team_local" },
  );
  const successfulFs = {
    realpath: async (value) => win32.normalize(value).toLowerCase() === win32.normalize(LOCAL_ROOT).toLowerCase()
      ? syntheticWindowsPath("Team", "Targets", "A")
      : syntheticWindowsPath("Team", "Targets", "A", "Docs", "Spec.txt"),
    stat: async (value) => ({
      isDirectory: () => true,
      dev: 1,
      ino: win32.normalize(value).toLowerCase().includes("spec.txt") ? 102 : 101,
    }),
  };
  const resolved = await registry.resolvePathAsync("team_local", "Docs/Spec.txt", { fs: successfulFs, timeoutMs: 50 });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.path, syntheticWindowsPath("Team", "Targets", "A", "Docs", "Spec.txt"));
  assert.match(resolved.root_fingerprint, /^[a-f0-9]{64}$/);
});

test("runtime root fingerprint changes when the lexical root junction is retargeted", () => {
  const registry = parseWorkspaceRegistry(validDocument());
  const mappingRevision = registry.mappingRevision;
  const firstFs = injectedWindowsFs({ realRoot: syntheticWindowsPath("Team", "Targets", "A") }).fs;
  const sameTargetDifferentCaseFs = injectedWindowsFs({
    realRoot: syntheticWindowsPath("team", "targets", "a").replace(/^C/, "c"),
  }).fs;
  const remappedFs = injectedWindowsFs({ realRoot: syntheticWindowsPath("Team", "Targets", "B") }).fs;
  const replacedSamePathFs = injectedWindowsFs({ realRoot: syntheticWindowsPath("Team", "Targets", "A"), rootIno: 909 }).fs;

  const first = registry.resolvePath("team_local", "", { fs: firstFs });
  const sameTargetDifferentCase = registry.resolvePath("team_local", "", { fs: sameTargetDifferentCaseFs });
  const remapped = registry.resolvePath("team_local", "", { fs: remappedFs });
  const replacedSamePath = registry.resolvePath("team_local", "", { fs: replacedSamePathFs });
  assert.equal(first.ok, true);
  assert.equal(sameTargetDifferentCase.ok, true);
  assert.equal(remapped.ok, true);
  assert.equal(registry.mappingRevision, mappingRevision);
  assert.match(first.root_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(sameTargetDifferentCase.root_fingerprint, first.root_fingerprint, "Windows canonical root is case-insensitive");
  assert.notEqual(remapped.root_fingerprint, first.root_fingerprint);
  assert.notEqual(replacedSamePath.root_fingerprint, first.root_fingerprint);
});

test("selected workspace revision ignores labels and allowlists but changes with root or trust domain", () => {
  const original = parseWorkspaceRegistry(validDocument());
  const originalResolved = original.resolvePath("team_local", "", { fs: injectedWindowsFs().fs });
  assert.equal(originalResolved.ok, true);
  assert.match(originalResolved.workspace_revision, /^[a-f0-9]{64}$/);

  const unrelated = validDocument();
  unrelated.workspaces[1].label = "Renamed UNC workspace";
  unrelated.workspaces[1].allowed_account_ids = ["acct-other"];
  const unrelatedRegistry = parseWorkspaceRegistry(unrelated);
  const unrelatedResolved = unrelatedRegistry.resolvePath("team_local", "", { fs: injectedWindowsFs().fs });
  assert.equal(unrelatedResolved.workspace_revision, originalResolved.workspace_revision);
  assert.notEqual(unrelatedRegistry.mappingRevision, original.mappingRevision);

  const labelAndAllowlist = validDocument();
  labelAndAllowlist.workspaces[0].label = "Renamed local workspace";
  labelAndAllowlist.workspaces[0].allowed_account_ids = ["acct-new"];
  const labelRegistry = parseWorkspaceRegistry(labelAndAllowlist);
  const labelResolved = labelRegistry.resolvePath("team_local", "", { fs: injectedWindowsFs().fs });
  assert.equal(labelResolved.workspace_revision, originalResolved.workspace_revision);

  const changedWritePolicy = validDocument();
  changedWritePolicy.workspaces[0].allowed_write_prefixes = ["Output/OwnerApproved"];
  const changedWriteRegistry = parseWorkspaceRegistry(changedWritePolicy);
  const changedWriteResolved = changedWriteRegistry.resolvePath("team_local", "", { fs: injectedWindowsFs().fs });
  assert.notEqual(changedWriteResolved.workspace_revision, originalResolved.workspace_revision);
  assert.notEqual(changedWriteRegistry.mappingRevision, original.mappingRevision);

  const changedTrustDomain = validDocument();
  changedTrustDomain.trust_domain_id = "erp-team-replaced";
  const changedTrustRegistry = parseWorkspaceRegistry(changedTrustDomain);
  const changedTrustResolved = changedTrustRegistry.resolvePath("team_local", "", { fs: injectedWindowsFs().fs });
  assert.notEqual(changedTrustResolved.workspace_revision, originalResolved.workspace_revision);

  const changedRoot = validDocument();
  changedRoot.workspaces[0].root = win32.join(LOCAL_ROOT, "Revision2");
  const changedRegistry = parseWorkspaceRegistry(changedRoot);
  const changedFs = injectedWindowsFs({ root: changedRoot.workspaces[0].root }).fs;
  const changedResolved = changedRegistry.resolvePath("team_local", "", { fs: changedFs });
  assert.notEqual(changedResolved.workspace_revision, originalResolved.workspace_revision);
});

function validGrant(overrides = {}) {
  return {
    grant_id: "grant-001",
    workspace_id: "team_local",
    workspace_revision: "a".repeat(64),
    workspace_root_fingerprint: "b".repeat(64),
    project_id: "P26-014",
    item_id: "ITEM-001",
    relative_prefix: "Deliverables/Reviewed",
    approved_by: "Owner.Admin",
    approved_at: "2026-07-10T11:00:00.000Z",
    expires_at: "2026-07-10T13:00:00.000Z",
    revoked: false,
    revoked_at: null,
    ...overrides,
  };
}

function grantContext(overrides = {}) {
  return {
    workspace_id: "team_local",
    workspace_revision: "a".repeat(64),
    workspace_root_fingerprint: "b".repeat(64),
    project_id: "P26-014",
    item_id: "ITEM-001",
    relative_path: "deliverables/reviewed/result.docx",
    path_style: "windows",
    allowed_approvers: ["owner.admin"],
    ...overrides,
  };
}

test("write grants are pure, scoped, expiring, revocable, and downgrade to read-only", () => {
  const now = "2026-07-10T12:00:00.000Z";
  const allowed = evaluateWriteGrant(validGrant(), grantContext(), { now });
  assert.deepEqual(allowed, {
    allowed: true,
    effective_access: "workspace-write",
    grant_id: "grant-001",
    relative_prefix: "Deliverables/Reviewed",
  });

  const cases = [
    [null, grantContext(), "no_write_grant"],
    [validGrant({ expires_at: now }), grantContext(), "grant_expired"],
    [validGrant({ revoked: true }), grantContext(), "grant_revoked"],
    [validGrant({ revoked_at: "2026-07-10T11:30:00.000Z" }), grantContext(), "grant_revoked"],
    [validGrant(), grantContext({ workspace_id: "team_unc" }), "workspace_mismatch"],
    [validGrant(), grantContext({ workspace_revision: "c".repeat(64) }), "workspace_revision_mismatch"],
    [validGrant(), grantContext({ workspace_root_fingerprint: "d".repeat(64) }), "workspace_root_mismatch"],
    [validGrant(), grantContext({ project_id: "P26-999" }), "project_mismatch"],
    [validGrant(), grantContext({ item_id: "ITEM-999" }), "item_mismatch"],
    [validGrant(), grantContext({ relative_path: "Deliverables/Draft/result.docx" }), "prefix_mismatch"],
    [validGrant(), grantContext({ allowed_approvers: ["someone.else"] }), "approver_not_allowed"],
    [validGrant({ approved_at: "2026-07-10T12:30:00.000Z" }), grantContext(), "grant_not_yet_valid"],
    [validGrant({ expires_at: "not-a-date" }), grantContext(), "grant_malformed"],
    [validGrant({ approved_by: " owner.admin" }), grantContext(), "grant_malformed"],
    [validGrant({ revoked_at: "" }), grantContext(), "grant_malformed"],
  ];

  for (const [grant, context, reason] of cases) {
    assert.deepEqual(evaluateWriteGrant(grant, context, { now }), {
      allowed: false,
      effective_access: "read-only",
      reason,
    });
  }

  assert.deepEqual(evaluateWriteGrant(validGrant(), grantContext({ path_style: "posix" }), { now }), {
    allowed: false,
    effective_access: "read-only",
    reason: "prefix_mismatch",
  });
});
