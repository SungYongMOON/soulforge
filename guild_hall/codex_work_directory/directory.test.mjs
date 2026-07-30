import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  renderDirectory,
  resolveRoute,
  validateBindings,
  validateCatalog
} from "./directory.mjs";

const branch = (branch_id, display_name) => ({
  branch_id,
  display_name,
  parent_branch_id: null,
  navigation_authority: "none"
});

const route = (route_id, branch_id, overrides = {}) => ({
  route_id,
  branch_id,
  display_name: route_id,
  scope: {
    kind: branch_id === "projects" ? "project" : "function",
    responsibility_terms: [`${route_id}_RESPONSIBILITY`]
  },
  aliases: [`${route_id}_ALIAS`],
  project_code: branch_id === "projects" ? `${route_id}_CODE` : null,
  owner_role: `${route_id}_OWNER`,
  manager_route_id: null,
  escalation_route_id: null,
  request_examples: [`${route_id}_REQUEST`],
  do_not_route: [],
  lifecycle: { state: "active" },
  capability_classes: ["synthetic_coordination", "synthetic_execution"],
  ...overrides
});

function catalogFixture() {
  const routes = [
    route("SYNTHETIC_COMMON_A", "common", {
      aliases: ["SYNTHETIC_AMBIGUOUS"],
      do_not_route: [{
        term: "SYNTHETIC_PROHIBITED",
        reason: "SYNTHETIC_OUT_OF_SCOPE"
      }]
    }),
    route("SYNTHETIC_COMMON_B", "common", {
      aliases: ["SYNTHETIC_AMBIGUOUS"]
    })
  ];
  for (let index = 1; index <= 8; index += 1) {
    routes.push(route(`SYNTHETIC_PROJECT_${index}`, "projects"));
  }
  routes.push(route("SYNTHETIC_AX_ROOT", "ax_development"));
  for (let index = 1; index <= 5; index += 1) {
    routes.push(route(`SYNTHETIC_AX_OWNER_${index}`, "ax_development", {
      manager_route_id: "SYNTHETIC_AX_ROOT"
    }));
  }
  routes.push(
    route("SYNTHETIC_STALE", "system_development", {
      lifecycle: { state: "stale" }
    }),
    route("SYNTHETIC_RETIRED", "erp_development", {
      lifecycle: { state: "retired" }
    }),
    route("SYNTHETIC_SUCCESSOR", "system_development"),
    route("SYNTHETIC_ROLLOVER", "system_development", {
      lifecycle: {
        state: "rollover_pending",
        successor_route_id: "SYNTHETIC_SUCCESSOR"
      }
    })
  );
  return {
    schema_version: "soulforge.codex_work_route_catalog.v1",
    catalog_revision: "SYNTHETIC_REVISION_1",
    navigation_authority: "none",
    branches: [
      branch("common", "COMMON"),
      branch("projects", "PROJECTS"),
      branch("ax_development", "AX DEVELOPMENT"),
      branch("erp_development", "ERP DEVELOPMENT"),
      branch("system_development", "SYSTEM DEVELOPMENT")
    ],
    routes
  };
}

const bindingRef = (binding_id, capability_class = "synthetic_execution") => ({
  binding_id,
  capability_class,
  provider_identifier: "SYNTHETIC_PROVIDER",
  resource_identifier: `${binding_id}_RESOURCE`
});

function bindingFixture(
  route_id = "SYNTHETIC_PROJECT_1",
  bridge_state = "active",
  binding_state = "active"
) {
  return {
    schema_version: "soulforge.codex_work_live_bindings.v1",
    catalog_schema_version: "soulforge.codex_work_route_catalog.v1",
    catalog_revision: "SYNTHETIC_REVISION_1",
    bindings: [{
      route_id,
      durable_coordination_binding: {
        ...bindingRef("SYNTHETIC_COORDINATION", "synthetic_coordination"),
        resource_title: "SYNTHETIC_COORDINATION_TITLE",
        host_identifier: "SYNTHETIC_HOST",
        thread_identifier: "SYNTHETIC_THREAD"
      },
      preferred_execution_surface: bindingRef("SYNTHETIC_SURFACE"),
      runtime_agent: bindingRef("SYNTHETIC_AGENT"),
      runtime_session: bindingRef("SYNTHETIC_SESSION"),
      worktree_binding: bindingRef("SYNTHETIC_WORKTREE"),
      fallback_bindings: [bindingRef("SYNTHETIC_FALLBACK")],
      validator_bindings: [bindingRef("SYNTHETIC_VALIDATOR", "synthetic_validation")],
      observed_status: "SYNTHETIC_OBSERVED_STATUS",
      verified_at_kst: "2099-01-01T00:00:00+09:00",
      source_kind: "synthetic_manual_observation",
      binding_state,
      prior_resource_history_pointer: binding_state === "rollover_pending"
        ? "SYNTHETIC_PRIOR_RESOURCE"
        : null,
      prior_thread_history_pointer: null,
      bridge_state,
      execution_ready: bridge_state === "active" && binding_state === "active"
    }]
  };
}

test("catalog and binding fixtures satisfy schemas and root invariants", async () => {
  assert.deepEqual((await validateCatalog(catalogFixture())).errors, []);
  assert.deepEqual((await validateBindings(bindingFixture(), catalogFixture())).errors, []);
});

test("branch labels are fixed and project code may remain unresolved", async () => {
  const catalog = catalogFixture();
  assert.deepEqual(
    catalog.branches.map((item) => item.display_name),
    ["COMMON", "PROJECTS", "AX DEVELOPMENT", "ERP DEVELOPMENT", "SYSTEM DEVELOPMENT"]
  );
  catalog.routes.find((item) => item.route_id === "SYNTHETIC_PROJECT_1").project_code = null;
  assert.equal((await validateCatalog(catalog)).valid, true);
  assert.equal(resolveRoute({
    catalog,
    project_code: "SYNTHETIC_UNRESOLVED_CODE",
    canon_confirmed: true
  }).state, "UNKNOWN");
  assert.equal(resolveRoute({
    catalog,
    query: "SYNTHETIC_UNRESOLVED_CODE"
  }).state, "UNKNOWN");
});

test("eight stable project routes resolve exactly without guessing", () => {
  const catalog = catalogFixture();
  for (let index = 1; index <= 8; index += 1) {
    const answer = resolveRoute({
      catalog,
      route_id: `SYNTHETIC_PROJECT_${index}`
    });
    assert.equal(answer.state, "EXACT");
    assert.equal(answer.dispatch_performed, false);
  }
});

test("normalization, exact alias ambiguity, unknown, and do_not_route are deterministic", () => {
  const catalog = catalogFixture();
  assert.equal(resolveRoute({
    catalog,
    query: "  synthetic_project_1_alias  "
  }).state, "EXACT");
  assert.equal(resolveRoute({ catalog, query: "SYNTHETIC_AMBIGUOUS" }).state, "AMBIGUOUS");
  assert.equal(resolveRoute({ catalog, query: "SYNTHETIC_UNKNOWN" }).state, "UNKNOWN");
  const prohibited = resolveRoute({ catalog, query: "SYNTHETIC_PROHIBITED" });
  assert.equal(prohibited.state, "UNKNOWN");
  assert.equal(prohibited.excluded[0].reason, "SYNTHETIC_OUT_OF_SCOPE");
});

test("stale, retired, and rollover states redact local runtime", () => {
  const catalog = catalogFixture();
  for (const [route_id, state] of [
    ["SYNTHETIC_STALE", "STALE"],
    ["SYNTHETIC_RETIRED", "RETIRED"],
    ["SYNTHETIC_ROLLOVER", "ROLLOVER_PENDING"]
  ]) {
    const answer = resolveRoute({ catalog, route_id, bindings: bindingFixture(route_id) });
    assert.equal(answer.state, state);
    assert.equal(answer.runtime_binding, null);
    assert.equal(answer.execution_ready, false);
  }
});

test("project_code requires explicit canon confirmation", () => {
  const catalog = catalogFixture();
  assert.equal(resolveRoute({
    catalog,
    project_code: "SYNTHETIC_PROJECT_1_CODE"
  }).state, "UNKNOWN");
  assert.equal(resolveRoute({
    catalog,
    project_code: "SYNTHETIC_PROJECT_1_CODE",
    canon_confirmed: true
  }).state, "EXACT");
  assert.equal(resolveRoute({
    catalog,
    query: "SYNTHETIC_PROJECT_1_CODE"
  }).state, "UNKNOWN");
});

test("duplicate route binding is rejected", async () => {
  const bindings = bindingFixture();
  bindings.bindings.push(structuredClone(bindings.bindings[0]));
  const validation = await validateBindings(bindings, catalogFixture());
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.keyword === "uniqueRouteBinding"));
});

test("planned, pilot, and blocked bridges cannot be execution ready", async () => {
  for (const state of ["planned", "pilot", "blocked"]) {
    const bindings = bindingFixture("SYNTHETIC_PROJECT_1", state);
    assert.equal(bindings.bindings[0].execution_ready, false);
    assert.equal((await validateBindings(bindings, catalogFixture())).valid, true);
    const answer = resolveRoute({
      catalog: catalogFixture(),
      bindings,
      route_id: "SYNTHETIC_PROJECT_1"
    });
    assert.equal(answer.execution_ready, false);
  }
});

test("non-active binding states fail closed and redact runtime observations", async () => {
  for (const [binding_state, expected] of [
    ["stale", "STALE"],
    ["rollover_pending", "ROLLOVER_PENDING"],
    ["retired", "RETIRED"],
    ["unknown", "UNKNOWN"]
  ]) {
    const bindings = bindingFixture("SYNTHETIC_PROJECT_1", "active", binding_state);
    assert.equal((await validateBindings(bindings, catalogFixture())).valid, true);
    const answer = resolveRoute({
      catalog: catalogFixture(),
      bindings,
      route_id: "SYNTHETIC_PROJECT_1"
    });
    assert.equal(answer.state, expected);
    assert.equal(answer.runtime_binding, null);
    assert.equal(answer.execution_ready, false);
  }
});

test("local observation metadata and exact coordination identifiers are retained", async () => {
  const bindings = bindingFixture();
  const item = bindings.bindings[0];
  assert.equal(item.observed_status, "SYNTHETIC_OBSERVED_STATUS");
  assert.equal(item.verified_at_kst, "2099-01-01T00:00:00+09:00");
  assert.equal(item.source_kind, "synthetic_manual_observation");
  assert.equal(item.durable_coordination_binding.resource_title, "SYNTHETIC_COORDINATION_TITLE");
  assert.equal(item.durable_coordination_binding.host_identifier, "SYNTHETIC_HOST");
  assert.equal(item.durable_coordination_binding.resource_identifier, "SYNTHETIC_COORDINATION_RESOURCE");
  assert.equal((await validateBindings(bindings, catalogFixture())).valid, true);
});

test("fallback is not promoted and validator must be independent", async () => {
  const bindings = bindingFixture();
  const answer = resolveRoute({
    catalog: catalogFixture(),
    bindings,
    route_id: "SYNTHETIC_PROJECT_1"
  });
  assert.equal(answer.runtime_binding.preferred_execution_surface.binding_id, "SYNTHETIC_SURFACE");
  assert.equal(answer.runtime_binding.fallback_bindings[0].binding_id, "SYNTHETIC_FALLBACK");

  bindings.bindings[0].validator_bindings[0] =
    structuredClone(bindings.bindings[0].fallback_bindings[0]);
  const validation = await validateBindings(bindings, catalogFixture());
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.keyword === "validatorIndependence"));
});

test("validator refs without optional resource identity remain independent", async () => {
  const bindings = bindingFixture();
  for (const ref of [
    bindings.bindings[0].preferred_execution_surface,
    bindings.bindings[0].validator_bindings[0]
  ]) {
    delete ref.provider_identifier;
    delete ref.resource_identifier;
  }
  assert.notEqual(
    bindings.bindings[0].preferred_execution_surface.binding_id,
    bindings.bindings[0].validator_bindings[0].binding_id
  );
  assert.equal((await validateBindings(bindings, catalogFixture())).valid, true);
});

test("manager and escalation relations cannot cross unsafe branch boundaries", async () => {
  const crossManager = catalogFixture();
  crossManager.routes.find((item) => item.route_id === "SYNTHETIC_COMMON_B").manager_route_id =
    "SYNTHETIC_PROJECT_1";
  const managerValidation = await validateCatalog(crossManager);
  assert.equal(managerValidation.valid, false);
  assert.ok(managerValidation.errors.some((error) => error.keyword === "sameBranchManager"));
  assert.ok(managerValidation.errors.some((error) => error.keyword === "projectSiblingLeaf"));

  const unsafeEscalation = catalogFixture();
  unsafeEscalation.routes.find((item) => item.route_id === "SYNTHETIC_PROJECT_1").escalation_route_id =
    "SYNTHETIC_AX_ROOT";
  const escalationValidation = await validateCatalog(unsafeEscalation);
  assert.equal(escalationValidation.valid, false);
  assert.ok(escalationValidation.errors.some((error) => error.keyword === "commonReclassification"));

  const commonEscalation = catalogFixture();
  commonEscalation.routes.find((item) => item.route_id === "SYNTHETIC_PROJECT_1").escalation_route_id =
    "SYNTHETIC_COMMON_A";
  assert.equal((await validateCatalog(commonEscalation)).valid, true);
});

test("three projections preserve sibling projects and AX-only hierarchy", () => {
  const catalog = catalogFixture();
  const overview = renderDirectory(catalog, "overview");
  const projects = renderDirectory(catalog, "projects");
  const ax = renderDirectory(catalog, "ax");
  assert.equal((overview.match(/^-/gmu) ?? []).length, 5);
  assert.ok(projects.includes("SYNTHETIC\\_COMMON\\_A"));
  assert.ok(projects.includes("SYNTHETIC\\_PROJECT\\_8"));
  assert.ok(!projects.includes("SYNTHETIC\\_AX\\_ROOT"));
  assert.ok(ax.includes("SYNTHETIC\\_AX\\_ROOT"));
  assert.ok(ax.includes("  - SYNTHETIC\\_AX\\_OWNER\\_5"));
  assert.ok(!ax.includes("SYNTHETIC\\_PROJECT\\_1"));
});

test("v1 remains a five-branch domain directory without cross-branch CEO parent routes", async () => {
  const contract = await readFile(
    new URL("../../docs/architecture/guild_hall/DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md", import.meta.url),
    "utf8"
  );
  assert.match(contract, /HOLD\/non-routable/u);
  assert.match(contract, /manager_route_id/u);
  assert.match(contract, /사람 관련 결정·인사·예산·구매·발주·외부 약속·전송·기준선·최종 수락/u);
  const catalog = catalogFixture();
  assert.equal(catalog.branches.length, 5);
  assert.equal((await validateCatalog(catalog)).valid, true);
  const forbiddenCeoParent = catalogFixture();
  forbiddenCeoParent.routes.find((item) => item.route_id === "SYNTHETIC_PROJECT_1").manager_route_id =
    "SYNTHETIC_COMMON_A";
  const rejected = await validateCatalog(forbiddenCeoParent);
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.length > 0);
});

test("public files contain no concrete provider brand, UUID, or absolute local path", async () => {
  const files = [
    "README.md",
    "schema/route_catalog.v1.schema.json",
    "schema/live_bindings.v1.schema.json",
    "directory.mjs",
    "cli.mjs",
    "directory.test.mjs",
    "../../docs/architecture/guild_hall/DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md"
  ];
  const providerBrandPattern = new RegExp(
    `\\b(?:${["or", "ca"].join("")}|${["ki", "mi"].join("")})\\b`,
    "iu"
  );
  for (const file of files) {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(text, providerBrandPattern);
    assert.doesNotMatch(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu);
    assert.doesNotMatch(text, /[A-Za-z]:[\\/](?![\\/])/u);
  }
});

test("CLI subprocess validates without writing or dispatching", async () => {
  const directory = await mkdtemp(join(tmpdir(), "SYNTHETIC_DIRECTORY_"));
  const catalogPath = join(directory, "SYNTHETIC_CATALOG.json");
  await writeFile(catalogPath, JSON.stringify(catalogFixture()), "utf8");
  const before = await readdir(directory);
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const output = execFileSync(process.execPath, [
    cliPath,
    "validate-catalog",
    "--catalog",
    catalogPath
  ], { encoding: "utf8" });
  const after = await readdir(directory);
  assert.deepEqual(after, before);
  const result = JSON.parse(output);
  assert.equal(result.side_effect_performed, false);
  assert.equal(result.dispatch_performed, false);
});

test("CLI rejects multiple selectors without writing or dispatching", async () => {
  const directory = await mkdtemp(join(tmpdir(), "SYNTHETIC_DIRECTORY_"));
  const catalogPath = join(directory, "SYNTHETIC_CATALOG.json");
  await writeFile(catalogPath, JSON.stringify(catalogFixture()), "utf8");
  const before = await readdir(directory);
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [
    cliPath,
    "resolve",
    "--catalog",
    catalogPath,
    "--query",
    "SYNTHETIC_PROJECT_1_ALIAS",
    "--route-id",
    "SYNTHETIC_PROJECT_1"
  ], { encoding: "utf8", stdio: "pipe" }));
  assert.deepEqual(await readdir(directory), before);
});
