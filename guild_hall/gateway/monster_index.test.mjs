import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";

import { loadMonsterIndex, syncMonsterIndexInbox } from "./monster_index.mjs";

test("loadMonsterIndex rebuilds manifest from monsters.json", async () => {
  const intakeRoot = await createIntakeRoot();

  await writeInboxMonsters(intakeRoot, "inbox_a", [
    { monster_id: "monster_a", dedupe_key: "dedupe_a", updated_at: "2026-03-29T10:00:00.000Z" },
  ]);
  await writeInboxMonsters(intakeRoot, "inbox_b", [
    { monster_id: "monster_b_old", dedupe_key: "same_key", updated_at: "2026-03-29T09:00:00.000Z" },
    { monster_id: "monster_b_new", dedupe_key: "same_key", updated_at: "2026-03-29T11:00:00.000Z" },
  ]);

  const index = await loadMonsterIndex(intakeRoot);

  assert.equal(index.byId.get("monster_a")?.inbox_id, "inbox_a");
  assert.equal(index.byId.get("monster_b_new")?.inbox_id, "inbox_b");
  assert.equal(index.byDedupeKey.get("same_key")?.monster_id, "monster_b_new");

  const manifest = await readManifest(intakeRoot);
  assert.equal(manifest.version, "soulforge.gateway.monster_index.v1");
  assert.equal(manifest.entries.length, 3);
});

test("loadMonsterIndex rebuilds when monsters.json changes after manifest creation", async () => {
  const intakeRoot = await createIntakeRoot();

  await writeInboxMonsters(intakeRoot, "inbox_a", [
    { monster_id: "monster_before", dedupe_key: "dedupe_before", updated_at: "2026-03-29T10:00:00.000Z" },
  ]);

  await loadMonsterIndex(intakeRoot);
  await writeInboxMonsters(intakeRoot, "inbox_a", [
    { monster_id: "monster_after", dedupe_key: "dedupe_after", updated_at: "2026-03-29T12:00:00.000Z" },
  ]);

  const rebuilt = await loadMonsterIndex(intakeRoot);

  assert.equal(rebuilt.byId.has("monster_before"), false);
  assert.equal(rebuilt.byId.get("monster_after")?.inbox_id, "inbox_a");
  assert.equal(rebuilt.byDedupeKey.get("dedupe_after")?.monster_id, "monster_after");
});

test("syncMonsterIndexInbox updates manifest for incremental inbox writes", async () => {
  const intakeRoot = await createIntakeRoot();

  await writeInboxMonsters(intakeRoot, "inbox_a", [
    { monster_id: "monster_a", dedupe_key: "dedupe_a", updated_at: "2026-03-29T10:00:00.000Z" },
  ]);
  await loadMonsterIndex(intakeRoot);

  const inboxBMonsters = [
    { monster_id: "monster_b", dedupe_key: "dedupe_b", updated_at: "2026-03-29T13:00:00.000Z" },
  ];
  await writeInboxMonsters(intakeRoot, "inbox_b", inboxBMonsters);
  await syncMonsterIndexInbox(intakeRoot, "inbox_b", inboxBMonsters);

  const index = await loadMonsterIndex(intakeRoot);
  assert.equal(index.byId.get("monster_b")?.inbox_id, "inbox_b");
  assert.equal(index.byDedupeKey.get("dedupe_b")?.monster_id, "monster_b");

  const manifest = await readManifest(intakeRoot);
  assert.equal(manifest.inboxes.inbox_b.monster_count, 1);
});

async function createIntakeRoot() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-gateway-index-"));
  const intakeRoot = path.join(tempRoot, "intake_inbox");
  await mkdir(intakeRoot, { recursive: true });
  return intakeRoot;
}

async function writeInboxMonsters(intakeRoot, inboxId, monsters) {
  const inboxDir = path.join(intakeRoot, inboxId);
  await mkdir(inboxDir, { recursive: true });
  await writeFile(path.join(inboxDir, "monsters.json"), `${JSON.stringify({ monsters }, null, 2)}\n`, "utf8");
}

async function readManifest(intakeRoot) {
  const raw = await readFile(path.join(intakeRoot, "_index", "monster_index.json"), "utf8");
  return JSON.parse(raw);
}
