import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { removePet, syncPet, verifyPet } from "./sync_codex_pet.mjs";

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(new URL("./sync_codex_pet.mjs", import.meta.url));

const validManifest = {
  id: "moru",
  displayName: "Moru",
  description: "A synthetic test pet.",
  spriteVersionNumber: 2,
  spritesheetPath: "spritesheet.webp",
};

async function createFixture(t, codexHomeName = "codex-home") {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-pet-sync-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const repoRoot = path.join(root, "repo");
  const sourceDir = path.join(repoRoot, ".registry", "docs", "operations", "codex_pets", "moru");
  const codexHome = path.join(root, codexHomeName);
  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, "pet.json"), `${JSON.stringify(validManifest, null, 2)}\n`);
  await writeFile(path.join(sourceDir, "spritesheet.webp"), Buffer.from("synthetic-webp-payload"));

  return {
    repoRoot,
    codexHome,
    sourceDir,
    targetDir: path.join(codexHome, "pets", "moru"),
  };
}

test("fresh sync installs and verifies the exact package", async (t) => {
  const fixture = await createFixture(t);
  const result = await syncPet("moru", fixture);

  assert.equal(result.status, "synced");
  assert.equal(
    await readFile(path.join(fixture.targetDir, "pet.json"), "utf8"),
    await readFile(path.join(fixture.sourceDir, "pet.json"), "utf8"),
  );
  assert.equal((await verifyPet("moru", fixture)).status, "verified");
});

test("repeat sync is an idempotent no-op", async (t) => {
  const fixture = await createFixture(t);
  await syncPet("moru", fixture);
  const before = await readFile(path.join(fixture.targetDir, "spritesheet.webp"));

  const result = await syncPet("moru", fixture);

  assert.equal(result.status, "unchanged");
  assert.deepEqual(await readFile(path.join(fixture.targetDir, "spritesheet.webp")), before);
});

test("verify detects tampering and sync repairs it", async (t) => {
  const fixture = await createFixture(t);
  await syncPet("moru", fixture);
  await writeFile(path.join(fixture.targetDir, "spritesheet.webp"), "tampered");

  await assert.rejects(verifyPet("moru", fixture), /hash mismatch: spritesheet\.webp/);
  assert.equal((await syncPet("moru", fixture)).status, "updated");
  assert.equal((await verifyPet("moru", fixture)).status, "verified");
});

test("invalid and traversal pet ids are rejected", async (t) => {
  const fixture = await createFixture(t);

  await assert.rejects(syncPet("../moru", fixture), /invalid pet id/);
  await assert.rejects(syncPet("Moru", fixture), /invalid pet id/);
  await assert.rejects(syncPet("moru/other", fixture), /invalid pet id/);
});

test("manifest contract is enforced before installation", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(
    path.join(fixture.sourceDir, "pet.json"),
    `${JSON.stringify({ ...validManifest, spriteVersionNumber: 1 }, null, 2)}\n`,
  );

  await assert.rejects(syncPet("moru", fixture), /spriteVersionNumber must be 2/);
  await assert.rejects(access(fixture.targetDir));
});

test("remove refuses a mismatched manifest id", async (t) => {
  const fixture = await createFixture(t);
  await syncPet("moru", fixture);
  await writeFile(
    path.join(fixture.targetDir, "pet.json"),
    `${JSON.stringify({ ...validManifest, id: "other" }, null, 2)}\n`,
  );

  await assert.rejects(removePet("moru", fixture), /id must match moru/);
  await access(fixture.targetDir);
});

test("remove refuses unexpected files and removes an exact matching package", async (t) => {
  const fixture = await createFixture(t);
  await syncPet("moru", fixture);
  const unexpected = path.join(fixture.targetDir, "notes.txt");
  await writeFile(unexpected, "keep me");

  await assert.rejects(removePet("moru", fixture), /must contain exactly/);
  await access(unexpected);
  await rm(unexpected);

  assert.equal((await removePet("moru", fixture)).status, "removed");
  await assert.rejects(access(fixture.targetDir));
});

test("CODEX_HOME fallback supports paths with spaces", async (t) => {
  const fixture = await createFixture(t, "Codex Home With Spaces");
  const fixtureScript = path.join(
    fixture.repoRoot,
    ".registry",
    "docs",
    "operations",
    "scripts",
    "sync_codex_pet.mjs",
  );
  await mkdir(path.dirname(fixtureScript), { recursive: true });
  await copyFile(scriptPath, fixtureScript);

  const env = { ...process.env, CODEX_HOME: fixture.codexHome };
  const syncResult = await execFile(process.execPath, [fixtureScript, "sync", "moru"], { env });
  const verifyResult = await execFile(process.execPath, [fixtureScript, "verify", "moru"], { env });

  assert.match(syncResult.stdout, /^synced moru -> /);
  assert.match(verifyResult.stdout, /^verified moru -> /);
  await access(path.join(fixture.targetDir, "pet.json"));
});
