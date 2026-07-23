import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SLACK_SOURCE_INVENTORY_SCHEMA_VERSION,
  SlackSourceInventoryError,
  summarizeSlackSourceInventory,
} from "./slack_source_inventory.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(moduleDirectory, "slack_source_inventory_cli.mjs");
const schemaPath = path.join(moduleDirectory, "slack_source_inventory.schema.json");
const fixturePath = path.join(moduleDirectory, "fixtures", "synthetic_slack_source_inventory.json");
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default;
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const fixtureDocument = JSON.parse(await readFile(fixturePath, "utf8"));

function fixture() {
  return JSON.parse(JSON.stringify(fixtureDocument));
}

test("Slack source inventory schema validates the public synthetic fixture", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
  const validate = ajv.compile(schema);
  assert.equal(validate(fixtureDocument), true, JSON.stringify(validate.errors));
  assert.equal(fixtureDocument.schema_version, SLACK_SOURCE_INVENTORY_SCHEMA_VERSION);
});

test("Slack source inventory returns redacted query-only aggregate", () => {
  const result = summarizeSlackSourceInventory(fixture());
  const serialized = JSON.stringify(result);

  assert.equal(result.mode, "query_only_no_persistence");
  assert.equal(result.visible_channel_count, 2);
  assert.equal(result.project_name_candidate_count, 1);
  assert.equal(result.other_channel_count, 1);
  assert.equal(result.history_probe.items_observed, 1);
  assert.equal(result.project_binding_authority, "candidate_only_owner_approval_required");
  assert.equal(result.safety.repository_writes, 0);
  assert.equal(result.safety.slack_mutation, false);
  assert.doesNotMatch(serialized, /T00000001|C00000001|C00000002|P26-014/u);
});

test("Slack source inventory rejects raw, secret, message, and display metadata fields", () => {
  for (const [scope, key, value] of [
    ["top", "token", "xoxb-synthetic"],
    ["top", "messages", []],
    ["channel", "channel_name", "proj-p26-014"],
    ["channel", "topic", "synthetic topic"],
    ["channel", "purpose", "synthetic purpose"],
    ["channel", "files", []],
    ["probe", "message_body", "synthetic text"],
  ]) {
    const input = fixture();
    if (scope === "top") input[key] = value;
    if (scope === "channel") input.channels[0][key] = value;
    if (scope === "probe") input.history_probe[key] = value;
    assert.throws(
      () => summarizeSlackSourceInventory(input),
      (error) => error instanceof SlackSourceInventoryError && error.code === "exact_keys_required",
    );
  }
});

test("Slack source inventory fails closed on duplicates, invalid candidates, and invalid history probes", () => {
  const duplicate = fixture();
  duplicate.channels[1].channel_id = duplicate.channels[0].channel_id;
  assert.throws(() => summarizeSlackSourceInventory(duplicate), /duplicate_channel_id/u);

  const invalidProject = fixture();
  invalidProject.channels[0].project_code_candidate = "not-a-project";
  assert.throws(() => summarizeSlackSourceInventory(invalidProject), /project_code_candidate_invalid/u);

  const otherWithProject = fixture();
  otherWithProject.channels[1].project_code_candidate = "P26-014";
  assert.throws(() => summarizeSlackSourceInventory(otherWithProject), /project_code_candidate_forbidden/u);

  const unknownProbe = fixture();
  unknownProbe.history_probe.channel_id = "C00000009";
  assert.throws(() => summarizeSlackSourceInventory(unknownProbe), /history_probe_channel_unknown/u);

  const badTime = fixture();
  badTime.history_probe.items_observed = 0;
  assert.throws(() => summarizeSlackSourceInventory(badTime), /history_probe_time_invalid/u);

  const implicitTimeZone = fixture();
  implicitTimeZone.observed_at = "2026-07-23T10:30:00";
  assert.throws(() => summarizeSlackSourceInventory(implicitTimeZone), /timestamp_invalid/u);
});

test("Slack source inventory CLI is stdin-only and leaves its working directory unchanged", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "soulforge-slack-source-inventory-"));
  const before = await snapshotTree(cwd);
  const result = spawnSync(process.execPath, [cliPath], {
    cwd,
    input: JSON.stringify(fixture()),
    encoding: "utf8",
    windowsHide: true,
  });
  const after = await snapshotTree(cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(after, before);
  const output = JSON.parse(result.stdout);
  assert.equal(output.visible_channel_count, 2);
  assert.equal(output.safety.temporary_files_created, 0);

  const withArg = spawnSync(process.execPath, [cliPath, "--output-file", "x"], {
    cwd,
    input: JSON.stringify(fixture()),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.notEqual(withArg.status, 0);
  assert.match(withArg.stderr, /accepts_no_arguments/u);

  const malformedSentinel = "PRIVATE-MESSAGE-SENTINEL";
  const malformed = spawnSync(process.execPath, [cliPath], {
    cwd,
    input: `{\"schema_version\":\"${malformedSentinel}`,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.notEqual(malformed.status, 0);
  assert.doesNotMatch(malformed.stderr, new RegExp(malformedSentinel, "u"));
  assert.match(malformed.stderr, /query_only_failed/u);
});

async function snapshotTree(root) {
  const entries = [];
  for (const name of (await readdir(root)).sort()) {
    const info = await stat(path.join(root, name));
    entries.push(`${name}:${info.size}:${Math.trunc(info.mtimeMs)}`);
  }
  return entries;
}
