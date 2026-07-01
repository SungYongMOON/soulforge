import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openStore } from "../src/store.mjs";
import {
  applyMailProjectRouteBackfill,
  planMailProjectRouteBackfill,
} from "../tools/mail_project_route_backfill.mjs";

function makeRuntime() {
  const root = mkdtempSync(join(tmpdir(), "sf-mail-route-backfill-"));
  const workmetaRoot = join(root, "_workmeta");
  const bindingPath = join(workmetaRoot, "system", "bindings", "mail_project_router.yaml");
  mkdirSync(join(workmetaRoot, "system", "bindings"), { recursive: true });
  return {
    root,
    workmetaRoot,
    bindingPath,
    dbPath: join(root, "dev-erp.db"),
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function seedStore(dbPath) {
  const store = openStore(dbPath);
  store.upsertProject({ id: "P00-000_INBOX", title: "Inbox", class: "inbox", data_label: "real" });
  store.upsertProject({ id: "P24-049", title: "P24-049 저주파SAS", class: "active", data_label: "real" });
  store.upsertMail({
    id: "mail-sas-001",
    project_id: "P00-000_INBOX",
    at: "2026-06-23T16:01:00+09:00",
    direction: "in",
    subject: "[군집] 확인요청 - 무인잠수정 저주파 SAS 과제 논문/특허 계획",
    counterpart: "Owner <owner@example.test>",
    data_label: "real",
  });
  store.upsertMail({
    id: "mail-admin-001",
    project_id: "P00-000_INBOX",
    at: "2026-06-23T17:00:00+09:00",
    direction: "in",
    subject: "근태표",
    counterpart: "Admin <admin@example.test>",
    data_label: "real",
  });
  store.db.close();
}

function writeBinding(bindingPath) {
  writeFileSync(bindingPath, [
    "schema_version: test.mail_project_router.v0",
    "default_project_code: P00-000_INBOX",
    "rules:",
    "  - rule_id: P24_049_LIG_SAS_TEST",
    "    project_code: P24-049",
    "    stage: project_inbox_original_collection",
    "    match_policy:",
    "      subject_any:",
    "        - 저주파 SAS",
    "        - LIGSAS",
    "    confidence_if_matched: exact",
    "    next_action_if_matched: promote_for_private_filing",
    "",
  ].join("\n"), "utf8");
}

test("plans exact P24-049 route backfill from P00 by subject metadata", async () => {
  const rt = makeRuntime();
  try {
    writeBinding(rt.bindingPath);
    seedStore(rt.dbPath);
    const report = await planMailProjectRouteBackfill({
      dbPath: rt.dbPath,
      repoRoot: rt.root,
      bindingFile: rt.bindingPath,
      fromProject: "P00-000_INBOX",
      targetProject: "P24-049",
      includeHint: false,
      privateDeep: false,
      includeHidden: false,
      limit: 0,
      apply: false,
    });
    assert.equal(report.scanned, 2);
    assert.equal(report.matched, 1);
    assert.equal(report.matches[0].mail_id, "mail-sas-001");
    assert.equal(report.matches[0].to_project, "P24-049");
    assert.deepEqual(report.by_project, { "P24-049": 1 });
  } finally {
    rt.cleanup();
  }
});

test("applies route backfill and leaves unrelated P00 mail untouched", async () => {
  const rt = makeRuntime();
  try {
    writeBinding(rt.bindingPath);
    seedStore(rt.dbPath);
    const report = await applyMailProjectRouteBackfill({
      dbPath: rt.dbPath,
      repoRoot: rt.root,
      bindingFile: rt.bindingPath,
      fromProject: "P00-000_INBOX",
      targetProject: "P24-049",
      includeHint: false,
      privateDeep: false,
      includeHidden: false,
      limit: 0,
      apply: true,
    });
    assert.equal(report.moved, 1);
    const store = openStore(rt.dbPath);
    try {
      assert.equal(store.db.prepare("SELECT project_id FROM core_mail WHERE id=?").get("mail-sas-001").project_id, "P24-049");
      assert.equal(store.db.prepare("SELECT project_id FROM core_mail WHERE id=?").get("mail-admin-001").project_id, "P00-000_INBOX");
    } finally {
      store.db.close();
    }
  } finally {
    rt.cleanup();
  }
});

test("plans route backfill from runtime root using sibling Soulforge binding", async () => {
  const parent = mkdtempSync(join(tmpdir(), "sf-mail-route-backfill-sibling-"));
  const sourceRoot = join(parent, "Soulforge");
  const runtimeRoot = join(parent, "Soulforge-runtime");
  const bindingPath = join(sourceRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");
  const dbPath = join(parent, "dev-erp.db");
  try {
    mkdirSync(join(sourceRoot, "_workmeta", "system", "bindings"), { recursive: true });
    mkdirSync(runtimeRoot, { recursive: true });
    writeBinding(bindingPath);
    seedStore(dbPath);
    const report = await planMailProjectRouteBackfill({
      dbPath,
      repoRoot: runtimeRoot,
      bindingFile: null,
      fromProject: "P00-000_INBOX",
      targetProject: "P24-049",
      includeHint: false,
      privateDeep: false,
      includeHidden: false,
      limit: 0,
      apply: false,
    });
    assert.equal(report.matched, 1);
    assert.equal(report.matches[0].to_project, "P24-049");
  } finally {
    if (existsSync(parent)) rmSync(parent, { recursive: true, force: true });
  }
});
