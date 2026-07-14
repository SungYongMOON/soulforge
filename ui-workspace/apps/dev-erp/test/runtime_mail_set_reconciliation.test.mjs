import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  createMailSetReconciliation,
  verifyMailSetReconciliation,
} from "../src/runtime_mail_set_reconciliation.mjs";

function fixture(root) {
  const data = join(root, "data");
  const backups = join(root, "logs", "release-meta-backups");
  mkdirSync(data, { recursive: true });
  mkdirSync(backups, { recursive: true });
  const dbPath = join(data, "dev-erp.db");
  const metaPath = join(data, "real_meta.json");
  const receiptPath = join(data, "real_meta.mail-set-reconciliation.json");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE core_mail (id TEXT PRIMARY KEY);");
  db.prepare("INSERT INTO meta(key,value) VALUES('schema_version','dev_erp.v1')").run();
  db.prepare("INSERT INTO core_mail(id) VALUES(?),(?)").run("mail-common", "mail-db-only");
  db.close();
  writeFileSync(metaPath, `${JSON.stringify({
    projects: [],
    mail: [
      { id: "mail-common", private_body_sentinel: "DO_NOT_COPY_BODY" },
      { id: "mail-meta-only", private_body_sentinel: "DO_NOT_COPY_BODY" },
    ],
  })}\n`);
  return { backups, dbPath, metaPath, receiptPath };
}

test("mail-set reconciliation writes only hashes/counts after a byte-exact backup", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-mail-reconcile-"));
  try {
    const paths = fixture(root);
    const commit = "a".repeat(40);
    const dry = createMailSetReconciliation({ ...paths, sourceCommit: commit });
    assert.equal(dry.applied, false);
    assert.equal(dry.drift.meta_only_count, 1);
    assert.equal(dry.drift.db_only_count, 1);

    const applied = createMailSetReconciliation({ ...paths, sourceCommit: commit, backupRoot: paths.backups, apply: true });
    assert.equal(applied.applied, true);
    const receiptText = readFileSync(paths.receiptPath, "utf8");
    assert.equal(receiptText.includes("mail-common"), false);
    assert.equal(receiptText.includes("mail-db-only"), false);
    assert.equal(receiptText.includes("DO_NOT_COPY_BODY"), false);
    assert.deepEqual(verifyMailSetReconciliation({ ...paths, expectedCommit: commit }), {
      ok: true,
      schema: "dev_erp.mail_set_reconciliation.v1",
      authority_mode: "runtime_db_authoritative_no_real_meta",
      source_commit_match: true,
      backup_verified: true,
      source_mail_count: 2,
      runtime_mail_count: 2,
      meta_only_count: 1,
      db_only_count: 1,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mail-set reconciliation fails closed after DB or backup drift", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-mail-reconcile-drift-"));
  try {
    const paths = fixture(root);
    const commit = "b".repeat(40);
    const applied = createMailSetReconciliation({ ...paths, sourceCommit: commit, backupRoot: paths.backups, apply: true });
    const db = new DatabaseSync(paths.dbPath);
    db.prepare("INSERT INTO core_mail(id) VALUES(?)").run("mail-late");
    db.close();
    assert.equal(verifyMailSetReconciliation({ ...paths, expectedCommit: commit }).error, "runtime_db_mismatch");

    const fresh = fixture(join(root, "fresh"));
    const second = createMailSetReconciliation({ ...fresh, sourceCommit: commit, backupRoot: fresh.backups, apply: true });
    writeFileSync(second.backup_path, "tampered\n");
    assert.equal(verifyMailSetReconciliation({ ...fresh, expectedCommit: commit }).error, "backup_mismatch");
    assert.ok(applied.receipt_path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
