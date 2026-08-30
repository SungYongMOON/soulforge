import test from "node:test";
import assert from "node:assert/strict";

import {
  FACADE_SCHEMA,
  FACADE_DISABLED_CODE,
  REQUEST_SHAPE_INVALID_CODE,
  createEngineeringMcpReadFacade,
} from "../src/facade.mjs";
import { UNIFORM_DENIAL_CODE } from "../src/contract.mjs";

// Deterministic synthetic clock — every timestamp is asserted, none observed.
function makeClock() {
  let tick = 0;
  return () => `2026-08-30T09:00:0${(tick += 1) % 10}.000Z`;
}

const ACTOR = Object.freeze({
  actor_ref: "actor.team_member.a1",
  project_scopes: Object.freeze(["project.p26_014"]),
});

function facadeWith(overrides = {}) {
  return createEngineeringMcpReadFacade({
    enabled: true,
    actor: ACTOR,
    providers: {},
    clock: makeClock(),
    ...overrides,
  });
}

test("the facade is OFF unless enabled is exactly boolean true; no provider is ever consulted", () => {
  let called = 0;
  const providers = { "identity.get_capabilities": () => { called += 1; return {}; } };
  for (const enabled of [undefined, false, 1, "true", null]) {
    const facade = createEngineeringMcpReadFacade({ enabled, actor: ACTOR, providers, clock: makeClock() });
    const verdict = facade.dispatch({ tool: "identity.get_capabilities", args: {} });
    assert.deepEqual(verdict, { ok: false, code: FACADE_DISABLED_CODE }, String(enabled));
  }
  assert.equal(called, 0, "a disabled facade must never reach a provider");
});

test("an enabled facade serves a contract read tool and returns a frozen copy, not the provider's object", () => {
  const providerOwned = { interface_version: "engineering_mcp.v0", capabilities: ["identity.read"] };
  const facade = facadeWith({ providers: { "identity.get_capabilities": () => providerOwned } });
  const verdict = facade.dispatch({ tool: "identity.get_capabilities", args: {} });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.tool, "identity.get_capabilities");
  assert.deepEqual(verdict.result, providerOwned);
  assert.notEqual(verdict.result, providerOwned, "egress must be a copy");
  assert.equal(Object.isFrozen(verdict), true);
  assert.equal(Object.isFrozen(verdict.result), true);
  assert.equal(Object.isFrozen(verdict.result.capabilities), true);
  assert.equal(Object.isFrozen(providerOwned), false, "the provider's own object must not be frozen in place");
  const entries = facade.readLog();
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(entries[0]).sort(), ["at", "outcome", "seq", "tool"], "log entries carry no args or payloads");
  assert.equal(entries[0].outcome, "dispatch_ok");
});

test("mutate tools, unknown tools, and missing providers are indistinguishable to the client", () => {
  const facade = facadeWith({ providers: {} });
  const mutate = facade.dispatch({ tool: "work.start_session", args: { assignment_id: "a1", assignment_epoch: 1, thread_ref_digest: "d1", idempotency_key: "k1" } });
  const unknown = facade.dispatch({ tool: "task.delete_everything", args: {} });
  const noProvider = facade.dispatch({ tool: "task.get_official", args: { task_ref: "task.t1" } });
  // A tool literally named like the internal malformed-request label must be
  // an ordinary unknown tool, not a distinguishable fifth outcome.
  const sentinelProbe = facade.dispatch({ tool: "(malformed)", args: {} });
  for (const verdict of [mutate, unknown, noProvider, sentinelProbe]) {
    assert.deepEqual(verdict, { ok: false, code: UNIFORM_DENIAL_CODE });
  }
  const outcomes = facade.readLog().map((entry) => entry.outcome);
  assert.deepEqual(outcomes, ["denied_mutate_tool", "denied_unknown_tool", "denied_no_provider", "denied_unknown_tool"], "the log keeps the precise causes the client never sees");
});

test("a throwing provider and a healthy denial look identical outward; the log records provider_error", () => {
  const facade = facadeWith({
    providers: {
      "task.get_official": () => { throw new Error("db exploded: secret detail"); },
    },
  });
  const verdict = facade.dispatch({ tool: "task.get_official", args: { task_ref: "task.t1" } });
  assert.deepEqual(verdict, { ok: false, code: UNIFORM_DENIAL_CODE });
  assert.equal(facade.readLog()[0].outcome, "provider_error");
  assert.equal(JSON.stringify(facade.readLog()).includes("exploded"), false, "provider failure detail must not leak into the log");
});

test("egress guard: undeclared fields, forbidden field names (even nested), and non-JSON results are all denied", () => {
  const facade = facadeWith({
    providers: {
      "identity.get_capabilities": () => ({ interface_version: "v0", capabilities: [], extra_note: "x" }),
      "ops.get_health_projection": () => ({ panels: [{ state: "ok", token_value: "leak-me" }] }),
      "task.get_official": () => {
        const cyclic = { task_ref: "task.t1", status: "open", assignee_ref: "a", priority: "p1", due: "d", source_system: "linear" };
        cyclic.status = cyclic;
        return cyclic;
      },
    },
  });
  const undeclared = facade.dispatch({ tool: "identity.get_capabilities", args: {} });
  const forbidden = facade.dispatch({ tool: "ops.get_health_projection", args: { scope: "watchtower" } });
  const cyclic = facade.dispatch({ tool: "task.get_official", args: { task_ref: "task.t1" } });
  for (const verdict of [undeclared, forbidden, cyclic]) {
    assert.deepEqual(verdict, { ok: false, code: UNIFORM_DENIAL_CODE });
  }
  assert.deepEqual(facade.readLog().map((entry) => entry.outcome),
    ["egress_unexpected_field", "egress_forbidden_field", "egress_shape_invalid"]);
});

test("explicit-scope tools deny out-of-scope project refs before any provider runs", () => {
  let called = 0;
  const facade = facadeWith({
    providers: {
      "context.get_accepted_generation": () => { called += 1; return { generation_ref: "gen.g1", manifest_digest: "d", accepted_at: "t" }; },
    },
  });
  const foreign = facade.dispatch({ tool: "context.get_accepted_generation", args: { project_ref: "project.p23_037", generation_ref: "gen.g1" } });
  assert.deepEqual(foreign, { ok: false, code: UNIFORM_DENIAL_CODE });
  assert.equal(called, 0, "an out-of-scope call must never reach the provider");
  const inScope = facade.dispatch({ tool: "context.get_accepted_generation", args: { project_ref: "project.p26_014", generation_ref: "gen.g1" } });
  assert.equal(inScope.ok, true);
  assert.equal(called, 1);
  assert.deepEqual(facade.readLog().map((entry) => entry.outcome), ["denied_scope", "dispatch_ok"]);
});

test("request shape is validated before provider or scope logic: unknown keys, non-primitive values, missing required fields", () => {
  let called = 0;
  const facade = facadeWith({
    providers: { "task.get_official": () => { called += 1; return { task_ref: "task.t1", status: "open", assignee_ref: "a", priority: "p", due: "d", source_system: "linear" }; } },
  });
  const unknownKey = facade.dispatch({ tool: "task.get_official", args: { task_ref: "task.t1", surprise: "x" } });
  const objectValue = facade.dispatch({ tool: "task.get_official", args: { task_ref: { $ne: null } } });
  const missingRequired = facade.dispatch({ tool: "task.get_official", args: {} });
  for (const verdict of [unknownKey, objectValue, missingRequired]) {
    assert.deepEqual(verdict, { ok: false, code: REQUEST_SHAPE_INVALID_CODE });
  }
  assert.equal(called, 0);
  // Non-finite numbers are not servable arguments.
  const nanFacade = facadeWith({ providers: { "ops.get_health_projection": () => ({ panels: [] }) } });
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(nanFacade.dispatch({ tool: "task.list_assigned", args: { limit: bad } }),
      { ok: false, code: REQUEST_SHAPE_INVALID_CODE }, String(bad));
  }
  // Pagination fields stay optional: list tools work without limit/cursor.
  const listFacade = facadeWith({ providers: { "task.list_assigned": () => ({ assignments: [], next_cursor: "" }) } });
  assert.equal(listFacade.dispatch({ tool: "task.list_assigned", args: {} }).ok, true);
});

test("providers receive frozen args and the frozen actor context, exactly", () => {
  let seen = null;
  const facade = facadeWith({
    providers: {
      "task.get_official": (args, context) => {
        seen = { args, context };
        return { task_ref: args.task_ref, status: "open", assignee_ref: "a", priority: "p", due: "d", source_system: "linear" };
      },
    },
  });
  assert.equal(facade.dispatch({ tool: "task.get_official", args: { task_ref: "task.t1" } }).ok, true);
  assert.deepEqual(seen.args, { task_ref: "task.t1" });
  assert.equal(Object.isFrozen(seen.args), true);
  assert.deepEqual(Object.keys(seen.context).sort(), ["actor_ref", "project_scopes"]);
  assert.equal(seen.context.actor_ref, "actor.team_member.a1");
  assert.deepEqual([...seen.context.project_scopes], ["project.p26_014"]);
  assert.equal(Object.isFrozen(seen.context), true);
  assert.equal(Object.isFrozen(seen.context.project_scopes), true);
});

test("the log never stores attacker-chosen tool strings verbatim, even while disabled", () => {
  const disabled = createEngineeringMcpReadFacade({ enabled: false, actor: ACTOR, providers: {}, clock: makeClock() });
  const huge = "x".repeat(1_000_000);
  disabled.dispatch({ tool: huge, args: {} });
  disabled.dispatch({ tool: "line1\nline2 nulé", args: {} });
  disabled.dispatch({ tool: "", args: {} });
  const [bigEntry, controlEntry, emptyEntry] = disabled.readLog();
  assert.equal(bigEntry.tool.length <= 90, true, "logged label must be clamped");
  assert.equal(bigEntry.tool.endsWith("(+trunc)"), true);
  assert.equal(controlEntry.tool, "line1?line2?nul?", "control chars and non-ASCII are replaced");
  assert.equal(emptyEntry.tool, "(empty)");
  const enabledFacade = facadeWith({ providers: {} });
  enabledFacade.dispatch({ tool: 42, args: {} });
  assert.equal(enabledFacade.readLog()[0].tool, "(malformed)");
  assert.equal(enabledFacade.readLog()[0].outcome, "denied_shape");
});

test("the log is append-only, frozen, and monotonically sequenced; construction fails closed on bad config", () => {
  const facade = facadeWith({ providers: { "identity.get_device_policy": () => ({ device_ref: "dev.d1", release_range: "r", posture_state: "ok" }) } });
  facade.dispatch({ tool: "identity.get_device_policy", args: {} });
  facade.dispatch({ tool: "nope.nope", args: {} });
  const entries = facade.readLog();
  assert.deepEqual(entries.map((entry) => entry.seq), [1, 2]);
  assert.equal(Object.isFrozen(entries), true);
  assert.equal(Object.isFrozen(entries[0]), true);
  assert.throws(() => entries.push({}), TypeError);
  assert.equal(FACADE_SCHEMA, "soulforge.engineering_mcp_read_facade.v0");

  assert.throws(() => createEngineeringMcpReadFacade(null), (error) => error.code === "config_shape_invalid");
  assert.throws(() => facadeWith({ clock: "not-a-function" }), (error) => error.code === "config_clock_invalid");
  assert.throws(() => facadeWith({ actor: { actor_ref: "Actor.UPPER", project_scopes: [] } }), (error) => error.code === "config_actor_invalid");
  assert.throws(() => facadeWith({ actor: { actor_ref: "actor.a1", project_scopes: ["OK-not-a-ref!"] } }), (error) => error.code === "config_actor_scopes_invalid");
  assert.throws(() => facadeWith({ providers: null }), (error) => error.code === "config_providers_invalid");
});
