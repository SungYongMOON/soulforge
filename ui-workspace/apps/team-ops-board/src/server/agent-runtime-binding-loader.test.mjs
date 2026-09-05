import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadAgentRuntimeBindings } from "./agent-runtime-binding-loader.mjs";

const UNCONFIGURED = {
  state: "hold",
  hold_code: "AGENT_RUNTIME_BINDINGS_UNCONFIGURED",
  bindings: [],
};
const INVALID = {
  state: "hold",
  hold_code: "AGENT_RUNTIME_BINDINGS_INVALID",
  bindings: [],
};

function validBinding(overrides = {}) {
  return {
    schema_version: "soulforge.team_ops_board.agent_runtime_bindings.v1",
    metadata_only: true,
    bindings: [{
      bot_id: "synthetic-bot-id",
      agent_id: "synthetic-agent-id",
      display_label: "Synthetic Bot",
      hermes_session_key: "synthetic-durable-key",
    }],
    ...overrides,
  };
}

test("missing configuration and hostile path forms return fixed non-echoing HOLD results", async () => {
  for (const bindingPath of [undefined, null, ""]) {
    assert.deepEqual(await loadAgentRuntimeBindings({ bindingPath }), UNCONFIGURED);
  }

  const marker = "PRIVATE-PATH-MARKER";
  for (const bindingPath of [
    marker,
    `./${marker}.json`,
    `${"file:"}${"//"}/C:/${marker}.json`,
    `http://127.0.0.1/${marker}.json`,
    `${"C:"}\\${marker}\u0000.json`,
    `\\\\server\\share\\${marker}.json`,
    `\\\\?\\${"C:"}\\${marker}.json`,
    `\\\\.\\${"C:"}\\${marker}.json`,
  ]) {
    const result = await loadAgentRuntimeBindings({ bindingPath });
    assert.deepEqual(result, INVALID, bindingPath);
    assert.equal(JSON.stringify(result).includes(marker), false, bindingPath);
  }
});

test("a bounded stable local v1 metadata-only file returns exact Module bindings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-runtime-bindings-"));
  const bindingPath = path.join(directory, "bindings.json");
  try {
    await writeFile(bindingPath, JSON.stringify(validBinding()), "utf8");

    const loaded = await loadAgentRuntimeBindings({ bindingPath });

    assert.deepEqual(loaded, {
      state: "ready",
      hold_code: null,
      bindings: [{
        bot_id: "synthetic-bot-id",
        agent_id: "synthetic-agent-id",
        display_label: "Synthetic Bot",
        hermes_session_key: "synthetic-durable-key",
      }],
    });
    assert.equal(JSON.stringify(loaded).includes(bindingPath), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("duplicate identities plus unknown or raw-bearing keys poison the whole binding file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-runtime-bindings-invalid-"));
  const bindingPath = path.join(directory, "bindings.json");
  const marker = "PRIVATE-BINDING-MARKER";
  const first = validBinding().bindings[0];
  const cases = [
    validBinding({ bindings: [first, { ...first, agent_id: "other-agent", hermes_session_key: "other-key" }] }),
    validBinding({ bindings: [first, { ...first, bot_id: "other-bot", hermes_session_key: "other-key" }] }),
    validBinding({ bindings: [first, { ...first, bot_id: "other-bot", agent_id: "other-agent" }] }),
    validBinding({ bindings: [{ ...first, preview: marker }] }),
    validBinding({ bindings: [{ ...first, future_field: marker }] }),
    { ...validBinding(), raw_payload: marker },
    { ...validBinding(), metadata_only: false },
    { ...validBinding(), schema_version: "future.schema.v2" },
  ];

  try {
    for (const document of cases) {
      await writeFile(bindingPath, JSON.stringify(document), "utf8");
      const loaded = await loadAgentRuntimeBindings({ bindingPath });
      assert.deepEqual(loaded, INVALID);
      assert.equal(JSON.stringify(loaded).includes(marker), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("symlink metadata and a file changed during the stable read both return whole-file HOLD", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-runtime-bindings-race-"));
  const symlinkPath = path.join(directory, "bindings-link.json");
  const racePath = path.join(directory, "bindings-race.json");
  try {
    assert.deepEqual(await loadAgentRuntimeBindings({
      bindingPath: symlinkPath,
      testHooks: {
        lstat: async () => ({
          isFile: () => true,
          isSymbolicLink: () => true,
          nlink: 1,
          size: 128,
          dev: 1,
          ino: 1,
          mtimeMs: 1,
        }),
      },
    }), INVALID);

    await writeFile(racePath, JSON.stringify(validBinding()), "utf8");
    const raced = await loadAgentRuntimeBindings({
      bindingPath: racePath,
      testHooks: {
        beforeRead: async () => {
          await writeFile(racePath, `${JSON.stringify(validBinding())} `, "utf8");
        },
      },
    });
    assert.deepEqual(raced, INVALID);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
