import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import { listContractTools } from "../src/contract.mjs";
import { createEngineeringMcpReadFacade } from "../src/facade.mjs";
import {
  JSON_RPC_ERROR,
  PROTOCOL_VERSION,
  createEngineeringMcpStdioServer,
  runEngineeringMcpStdio,
} from "../src/stdio_server.mjs";

const clock = () => "2026-08-31T00:00:00.000Z";
const actor = Object.freeze({ actor_ref: "actor:test", project_scopes: ["project:kvds"] });

function facade(providers = {}, enabled = true) {
  return createEngineeringMcpReadFacade({ enabled, actor, providers, clock });
}

function request(id, method, params) {
  return params === undefined
    ? { jsonrpc: "2.0", id, method }
    : { jsonrpc: "2.0", id, method, params };
}

async function runLines(server, lines) {
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding("utf8");
  let stdout = "";
  output.on("data", (chunk) => { stdout += chunk; });
  const running = runEngineeringMcpStdio({ server, input, output });
  for (const line of lines) input.write(line);
  input.end();
  await running;
  return stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("default OFF exposes no tools, requires no facade, and touches no provider", () => {
  let calls = 0;
  const readFacade = facade({
    "identity.get_capabilities": () => {
      calls += 1;
      return { interface_version: "v0", capabilities: [] };
    },
  });
  const server = createEngineeringMcpStdioServer();

  const init = server.handle(request(1, "initialize", {}));
  const listed = server.handle(request(2, "tools/list"));
  const called = server.handle(request(3, "tools/call", {
    name: "identity.get_capabilities", arguments: {},
  }));

  assert.equal(init.result.protocolVersion, PROTOCOL_VERSION);
  assert.equal(init.result._meta.enabled, false);
  assert.deepEqual(listed.result.tools, []);
  assert.deepEqual(called.result.structuredContent, { ok: false, code: "facade_disabled" });
  assert.equal(calls, 0);
  assert.throws(
    () => createEngineeringMcpStdioServer({ enabled: true }),
    /explicit_facade_binding_required/u,
  );
  assert.equal(typeof readFacade.dispatch, "function");
});

test("tools/list exposes every and only the 21 contract read tools", () => {
  const server = createEngineeringMcpStdioServer({ enabled: true, facade: facade() });
  const result = server.handle(request("list-1", "tools/list", {})).result;
  const expected = listContractTools().filter((tool) => tool.kind === "read").map((tool) => tool.name).sort();
  assert.equal(result.tools.length, 21);
  assert.deepEqual(result.tools.map((tool) => tool.name).sort(), expected);
  assert.equal(result.tools.every((tool) => tool.annotations.readOnlyHint === true), true);
  assert.equal(result.tools.some((tool) => tool.name === "work.start_session"), false);
  assert.equal(result.tools.some((tool) => tool.name === "review.submit_review"), false);
  assert.equal(result._meta.write_tools_enabled, false);
});

test("one exact read call returns MCP content plus the same structured safe result", () => {
  let observedArgs;
  let observedActor;
  const server = createEngineeringMcpStdioServer({
    enabled: true,
    facade: facade({
      "task.get_official": (args, actorContext) => {
        observedArgs = args;
        observedActor = actorContext;
        return {
          task_ref: args.task_ref,
          status: "open",
          assignee_ref: "person:owner",
          priority: "P1",
          due: "2026-09-01",
          source_system: "linear",
        };
      },
    }),
  });
  const response = server.handle(request(7, "tools/call", {
    name: "task.get_official", arguments: { task_ref: "task:kvds-1" },
  }));

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.ok, true);
  assert.equal(response.result.structuredContent.result.task_ref, "task:kvds-1");
  assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
  assert.deepEqual(observedArgs, { task_ref: "task:kvds-1" });
  assert.deepEqual(observedActor, actor);
  assert.equal(Object.isFrozen(observedArgs), true);
});

test("unknown, mutate, missing provider, and provider throw share one outward denial", () => {
  let mutationCalls = 0;
  const readFacade = facade({
    "task.get_official": () => {
      throw new Error(`${["C:", "private", "payload.txt"].join("\\")} credential=do-not-leak`);
    },
    "work.start_session": () => { mutationCalls += 1; return {}; },
  });
  const server = createEngineeringMcpStdioServer({ enabled: true, facade: readFacade });
  const calls = [
    ["unknown.tool", {}],
    ["work.start_session", {
      assignment_id: "assignment:1", assignment_epoch: "epoch:1",
      thread_ref_digest: "digest:1", idempotency_key: "idempotency:1",
    }],
    ["identity.get_capabilities", {}],
    ["task.get_official", { task_ref: "task:1" }],
  ];
  const outcomes = calls.map(([name, args], index) => server.handle(request(index, "tools/call", {
    name, arguments: args,
  })).result.structuredContent);

  assert.deepEqual(outcomes, outcomes.map(() => ({ ok: false, code: "not_available" })));
  assert.equal(mutationCalls, 0);
  assert.equal(JSON.stringify(outcomes).includes("private"), false);
  assert.equal(JSON.stringify(outcomes).includes("credential"), false);
});

test("path/secret-shaped input and protected provider egress fail closed", () => {
  let calls = 0;
  const server = createEngineeringMcpStdioServer({
    enabled: true,
    facade: facade({
      "task.get_official": () => {
        calls += 1;
        return {
          task_ref: "task:1", status: "open", assignee_ref: "person:1", priority: "P2",
          due: "2026-09-01", source_system: "linear",
          nested: { file_path: ["C:", "private", "a"].join("\\") },
        };
      },
    }),
  });
  const inputDenied = server.handle(request(1, "tools/call", {
    name: "task.get_official",
    arguments: { task_ref: ["C:", "private", "task.json"].join("\\") },
  }));
  const egressDenied = server.handle(request(2, "tools/call", {
    name: "task.get_official", arguments: { task_ref: "task:1" },
  }));

  assert.deepEqual(inputDenied.result.structuredContent, { ok: false, code: "request_shape_invalid" });
  assert.deepEqual(egressDenied.result.structuredContent, { ok: false, code: "not_available" });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(egressDenied).includes("file_path"), false);
});

test("oversize facade result becomes the uniform denial", () => {
  const server = createEngineeringMcpStdioServer({
    enabled: true,
    max_call_result_bytes: 256,
    facade: facade({
      "identity.get_capabilities": () => ({
        interface_version: "v0", capabilities: ["x".repeat(400)],
      }),
    }),
  });
  const response = server.handle(request(1, "tools/call", {
    name: "identity.get_capabilities", arguments: {},
  }));
  assert.deepEqual(response.result.structuredContent, { ok: false, code: "not_available" });
  assert.equal(JSON.stringify(response).includes("x".repeat(30)), false);
});

test("an object that is not the exact frozen facade surface cannot be bound", () => {
  assert.throws(
    () => createEngineeringMcpStdioServer({
      enabled: true,
      facade: { dispatch: () => ({ ok: false, code: "invented_code", detail: "leak" }) },
    }),
    /explicit_facade_binding_required/u,
  );
  const facadeSchema = facade().schema;
  assert.throws(
    () => createEngineeringMcpStdioServer({
      enabled: true,
      facade: Object.freeze({
        schema: facadeSchema,
        dispatch: () => ({ ok: false, code: "invented_code", detail: "leak" }),
        readLog: () => [],
        mutate: () => "authority smuggling",
      }),
    }),
    /explicit_facade_binding_required/u,
  );
  assert.throws(
    () => createEngineeringMcpStdioServer({
      enabled: true,
      facade: Object.freeze({
        schema: facadeSchema,
        dispatch: () => ({ ok: false, code: "not_available" }),
        readLog: () => [],
      }),
    }),
    /explicit_facade_binding_required/u,
  );
});

test("async provider results fail closed without leaking or leaving read-only outcomes", () => {
  const server = createEngineeringMcpStdioServer({
    enabled: true,
    facade: facade({
      "identity.get_capabilities": async () => ({
        interface_version: "v0", capabilities: ["should-not-leave"],
      }),
    }),
  });
  const response = server.handle(request(1, "tools/call", {
    name: "identity.get_capabilities", arguments: {},
  }));
  assert.deepEqual(response.result.structuredContent, { ok: false, code: "not_available" });
  assert.equal(JSON.stringify(response).includes("should-not-leave"), false);
});

test("hostile JSON-RPC envelopes are bounded and never reach a provider", () => {
  let calls = 0;
  const server = createEngineeringMcpStdioServer({
    enabled: true,
    max_request_bytes: 256,
    facade: facade({ "identity.get_capabilities": () => { calls += 1; return {}; } }),
  });
  const hostile = [
    null,
    [],
    { jsonrpc: "1.0", id: 1, method: "tools/list" },
    { jsonrpc: "2.0", id: {}, method: "tools/list" },
    request(2, "tools/call", []),
    request(3, "tools/call", { name: "identity.get_capabilities", arguments: [], extra: true }),
    request(4, "x".repeat(300)),
  ];
  for (const message of hostile) {
    const response = server.handle(message);
    assert.equal("error" in response, true);
  }
  assert.equal(calls, 0);
});

test("newline stdio handles parse errors, oversize lines, recovery, and no notifications output", async () => {
  const server = createEngineeringMcpStdioServer({
    enabled: true,
    max_request_bytes: 256,
    facade: facade(),
  });
  const responses = await runLines(server, [
    "{bad json}\n",
    `${"x".repeat(300)}\n`,
    `${JSON.stringify({ jsonrpc: "2.0", method: "ignored-notification" })}\n`,
    `${JSON.stringify(request(9, "tools/list"))}\n`,
  ]);

  assert.equal(responses.length, 3);
  assert.equal(responses[0].error.code, JSON_RPC_ERROR.PARSE_ERROR);
  assert.equal(responses[1].error.code, JSON_RPC_ERROR.INVALID_REQUEST);
  assert.equal(responses[2].id, 9);
  assert.equal(responses[2].result.tools.length, 21);
});

test("unsupported methods and malformed call params return stable JSON-RPC errors", () => {
  const server = createEngineeringMcpStdioServer({ enabled: true, facade: facade() });
  const unknown = server.handle(request("stable-id", "resources/list"));
  const malformed = server.handle(request("call-id", "tools/call", { name: 3, arguments: {} }));
  assert.equal(unknown.id, "stable-id");
  assert.equal(unknown.error.code, JSON_RPC_ERROR.METHOD_NOT_FOUND);
  assert.equal(malformed.id, "call-id");
  assert.equal(malformed.error.code, JSON_RPC_ERROR.INVALID_PARAMS);
});
