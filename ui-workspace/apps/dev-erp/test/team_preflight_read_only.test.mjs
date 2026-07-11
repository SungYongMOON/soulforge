import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { openStore } from "../src/store.mjs";
import { buildTeamHostPreflight, openTeamPreflightStore } from "../tools/team_preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const TOOL = join(APP, "tools", "team_preflight.mjs");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("team preflight CLI never repairs or migrates the inspected SQLite schema", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-team-preflight-ro-"));
  try {
    const dbPath = join(root, "legacy.db");
    const store = openStore(dbPath);
    store.db.exec("DROP TABLE codex_turn_audit");
    store.db.close();

    const execution = spawnSync(process.execPath, [
      TOOL,
      "--db", dbPath,
      "--root", root,
      "--register", join(root, "missing-team-mailboxes.json"),
      "--target-members", "1",
      "--skip-env-file-check",
    ], {
      cwd: APP,
      encoding: "utf8",
      windowsHide: true,
    });

    assert.equal(execution.status, 2, execution.stderr || execution.stdout);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='codex_turn_audit'").get();
      assert.equal(row.n, 0, "diagnostic CLI must not recreate a missing table");
    } finally {
      db.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("team preflight store rejects writes and preserves a current SQLite database", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-team-preflight-current-ro-"));
  try {
    const dbPath = join(root, "current.db");
    const seed = openStore(dbPath);
    seed.db.close();
    const before = { hash: sha256(dbPath), size: statSync(dbPath).size, mtime: statSync(dbPath).mtimeMs };

    const store = openTeamPreflightStore(dbPath);
    try {
      assert.throws(() => store.db.exec("CREATE TABLE forbidden_write(id TEXT)"), /read.?only/i);
      const result = buildTeamHostPreflight(store, {
        root,
        targetMembers: 1,
        registerPath: join(root, "missing-team-mailboxes.json"),
        requireEnvFiles: false,
        today: "2026-07-12",
      });
      assert.equal(result.configuration_ready, false);
    } finally {
      store.db.close();
    }

    const after = { hash: sha256(dbPath), size: statSync(dbPath).size, mtime: statSync(dbPath).mtimeMs };
    assert.deepEqual(after, before, "readiness inspection must preserve the main SQLite file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("team preflight CLI fails closed on an incompatible schema without repairing it", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-team-preflight-schema-ro-"));
  try {
    const dbPath = join(root, "legacy-schema.db");
    const store = openStore(dbPath);
    store.db.exec("DROP INDEX IF EXISTS idx_account_email");
    store.db.exec("DROP INDEX IF EXISTS idx_account_email_unique");
    store.db.exec("ALTER TABLE core_account DROP COLUMN email");
    store.db.close();

    const execution = spawnSync(process.execPath, [
      TOOL,
      "--db", dbPath,
      "--root", root,
      "--register", join(root, "missing-team-mailboxes.json"),
      "--target-members", "1",
      "--skip-env-file-check",
    ], {
      cwd: APP,
      encoding: "utf8",
      windowsHide: true,
    });

    assert.equal(execution.status, 2, execution.stderr || execution.stdout);
    assert.match(execution.stderr, /^\[team-preflight\] db_schema_unready\s*$/m);
    assert.equal(execution.stderr.includes(dbPath), false, "schema failure must not echo the DB path");
    const check = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const columns = check.prepare("PRAGMA table_info(core_account)").all().map((row) => row.name);
      assert.equal(columns.includes("email"), false, "diagnostic CLI must not add the missing column");
    } finally {
      check.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
