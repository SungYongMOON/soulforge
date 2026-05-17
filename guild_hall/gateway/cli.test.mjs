import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const commandRepoRoot = path.resolve(path.dirname(cliPath), "../..");
const execFile = promisify(execFileCallback);

test("intake CLI writes synthetic state under explicit local root without copied command surface", async () => {
  const tempRoot = await makeTempRoot();
  const localRoot = path.join(tempRoot, "synthetic-root");
  const eventId = `synthetic_pilot_${randomUUID()}`;
  const inboxId = eventId;
  const payloadFile = path.join(tempRoot, "payload.json");

  await writeJson(payloadFile, {
    action: "mail_intake_request",
    event_id: eventId,
    source: "synthetic",
    mailbox_id: "synthetic_mailbox",
    provider_message_id: `provider-${eventId}`,
    received_at: "2026-05-17T00:00:00.000Z",
    event_ref: `synthetic/events/${eventId}.jsonl`,
    raw_ref: `synthetic/raw/${eventId}.jsonl`,
    subject: "Synthetic pilot",
    monsters: [
      {
        monster_family: "synthetic_monster",
        objective: "Confirm isolated gateway intake",
        dedupe_key: `synthetic:${eventId}`,
      },
    ],
  });

  const { stdout } = await execFile(process.execPath, [
    cliPath,
    "intake",
    "--payload-file",
    payloadFile,
    "--local-root",
    localRoot,
  ]);

  const result = JSON.parse(stdout);
  const localInboxDir = path.join(localRoot, "guild_hall", "state", "gateway", "intake_inbox", inboxId);
  const commandInboxDir = path.join(commandRepoRoot, "guild_hall", "state", "gateway", "intake_inbox", inboxId);
  const inbox = JSON.parse(await readFile(path.join(localInboxDir, "inbox.json"), "utf8"));
  const monsters = JSON.parse(await readFile(path.join(localInboxDir, "monsters.json"), "utf8"));

  assert.equal(result.status, "materialized");
  assert.equal(result.workspace_intake_inbox_ref, `guild_hall/state/gateway/intake_inbox/${inboxId}`);
  assert.equal(inbox.workspace_intake_inbox_id, inboxId);
  assert.equal(monsters.monsters.length, 1);
  assert.equal(await pathExists(path.join(localRoot, "guild_hall", "gateway", "cli.mjs")), false);
  assert.equal(await pathExists(path.join(localRoot, "guild_hall", "state", "gateway", "bindings", "notify_policy.yaml")), true);
  assert.equal(await pathExists(commandInboxDir), false);
});

test("intake CLI rejects filesystem root as an explicit local root", async () => {
  await assert.rejects(
    execFile(process.execPath, [cliPath, "intake", "--local-root", path.parse(process.cwd()).root]),
    (error) => {
      assert.match(error.stderr, /--local-root must not be the filesystem root/);
      return true;
    },
  );
});

test("intake CLI rejects a local root flag without a value", async () => {
  await assert.rejects(
    execFile(process.execPath, [cliPath, "intake", "--local-root"]),
    (error) => {
      assert.match(error.stderr, /missing required flag: --local-root/);
      return true;
    },
  );
});

async function makeTempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-gateway-cli-"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
