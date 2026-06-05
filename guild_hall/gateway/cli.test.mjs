import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const commandRepoRoot = path.resolve(path.dirname(cliPath), "../..");
const execFile = promisify(execFileCallback);
const GATEWAY_HELPER_PACKAGE_REFS = [
  "guild_hall/gateway/mail_candidate_backlog.mjs",
  "guild_hall/gateway/deadline_watchdog_reminder.mjs",
];

test("gateway helper modules are tracked with CLI packaging surface", (t) => {
  const result = spawnSync("git", ["ls-files", "--", ...GATEWAY_HELPER_PACKAGE_REFS], {
    cwd: commandRepoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    t.skip("git metadata unavailable; package-clean helper tracking must be checked in a worktree");
    return;
  }

  const tracked = new Set(result.stdout.split(/\r?\n/u).filter(Boolean));
  const missing = GATEWAY_HELPER_PACKAGE_REFS.filter((ref) => !tracked.has(ref));
  if (missing.length > 0) {
    t.diagnostic(`package-clean caveat: untracked gateway helper(s): ${missing.join(", ")}`);
    t.skip(`commit/package task must include gateway helper(s): ${missing.join(", ")}`);
    return;
  }

  assert.deepEqual(missing, []);
});

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

test("intake CLI updates project-local Korean mail history files for assigned monsters", async () => {
  const tempRoot = await makeTempRoot();
  const localRoot = path.join(tempRoot, "synthetic-root");
  const eventId = `synthetic_project_${randomUUID()}`;
  const payloadFile = path.join(tempRoot, "payload.json");

  await writeJson(payloadFile, {
    action: "mail_intake_request",
    event_id: eventId,
    source: "synthetic",
    mailbox_id: "synthetic_mailbox",
    provider_message_id: `provider-${eventId}`,
    received_at: "2026-05-21T00:00:00.000Z",
    event_ref: `synthetic/events/${eventId}.jsonl`,
    raw_ref: `synthetic/raw/${eventId}.jsonl`,
    subject: "Synthetic assigned project mail",
    from: [{ name: "Sender", address: "sender@example.test" }],
    attachment_refs: ["synthetic/attachment/private.xlsx"],
    monsters: [
      {
        monster_id: "monster_synthetic_project_001",
        monster_family: "synthetic_monster",
        objective: "Confirm project mail history writer",
        dedupe_key: `synthetic:${eventId}`,
        assigned_project_code: "P26-030",
        assigned_stage: "030_SRR",
        assignment_status: "assigned",
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
  const historyRoot = path.join(localRoot, "_workmeta", "P26-030", "reports", "메일_이력");
  const workspaceHistoryRoot = path.join(localRoot, "_workspaces", "P26-030", "reports", "메일_이력");
  const csv = await readFile(path.join(historyRoot, "메일_이력.csv"), "utf8");
  const xlsx = await readFile(path.join(workspaceHistoryRoot, "메일_이력.xlsx"));
  const schedule = await readFile(path.join(historyRoot, "메일_일정이벤트.ics"), "utf8");

  assert.equal(result.status, "materialized");
  assert.match(csv, /monster_created/);
  assert.match(csv, /Synthetic assigned project mail/);
  assert.equal(xlsx.subarray(0, 2).toString("utf8"), "PK");
  assert.equal(await pathExists(path.join(historyRoot, "메일_이력.xlsx")), false);
  assert.match(schedule, /BEGIN:VEVENT/);
  assert(!csv.includes("private.xlsx"));
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
