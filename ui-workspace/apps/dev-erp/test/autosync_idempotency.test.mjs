import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { importTaskLedgerFile, readTaskLedgerRows, startAutosyncPoll } from "../src/autosync.mjs";
import { openStore } from "../src/store.mjs";

const TASK_HEADER = "﻿할일키,스키마버전,기록일,프로젝트코드,할일명,담당자,업무유형,상태,마감일,SE단계,연결유형,연결대상,완료기준,출처,관련메일이력키,관련메일소스ID,산출물참조,관련몬스터ID,다음액션,비고,원문복사여부\n";

function createTaskLedger(root, title) {
  const dir = join(root, "_workmeta", "P26-014", "reports", "할일_장부");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "할일_장부.csv");
  writeFileSync(file, TASK_HEADER
    + `mailtask:idempotent,v0,,P26-014,${title},kim,review,unclassified,,030_SRR,,,확인 완료,mail,mailcsv:idempotent,mail-src-idempotent,,,,검토,아니오\n`);
  return file;
}

async function waitFor(predicate, message, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(message);
}

test("autosync conflict representation is stable until relevant source content changes", () => {
  const root = mkdtempSync(join(tmpdir(), "autosync-idempotent-"));
  const store = openStore(":memory:");
  try {
    store.upsertProject({ id: "P26-014", title: "K", data_label: "real" });
    const file = createTaskLedger(root, "원본 제목");
    assert.equal(importTaskLedgerFile(store, file).imported, 1);

    store.db.prepare("UPDATE core_item SET status='open' WHERE id='mailtask:idempotent'").run();
    assert.equal(importTaskLedgerFile(store, file).conflicts, 1);

    const fixedTime = new Date("2026-07-13T00:00:00.000Z");
    utimesSync(file, fixedTime, fixedTime);
    const stableFile = readFileSync(file, "utf8");
    const stableMtime = statSync(file).mtimeMs;
    const stableLedgerHash = readTaskLedgerRows(file)[0].sync_hash;
    const stableDb = store.db.prepare(
      "SELECT title,status,sync_state,sync_error,sync_hash,sync_at FROM core_item WHERE id='mailtask:idempotent'"
    ).get();

    assert.equal(importTaskLedgerFile(store, file).conflicts, 1);
    assert.equal(readFileSync(file, "utf8"), stableFile, "unchanged conflict must not rewrite the ledger");
    assert.equal(statSync(file).mtimeMs, stableMtime, "unchanged conflict must preserve ledger mtime");
    assert.deepEqual(store.db.prepare(
      "SELECT title,status,sync_state,sync_error,sync_hash,sync_at FROM core_item WHERE id='mailtask:idempotent'"
    ).get(), stableDb, "unchanged conflict must not churn DB sync metadata");

    writeFileSync(file, stableFile.replace("원본 제목", "장부 변경 제목"));
    assert.equal(importTaskLedgerFile(store, file).conflicts, 1);
    const changedRow = readTaskLedgerRows(file)[0];
    assert.equal(changedRow.title, "장부 변경 제목");
    assert.notEqual(changedRow.sync_hash, stableLedgerHash);
    const afterChangeDb = store.db.prepare(
      "SELECT title,status,sync_state,sync_error,sync_hash,sync_at FROM core_item WHERE id='mailtask:idempotent'"
    ).get();
    assert.equal(afterChangeDb.title, "원본 제목", "source conflict must not decide authority");
    assert.equal(afterChangeDb.status, "open");

    const secondFixedTime = new Date("2026-07-13T00:00:01.000Z");
    utimesSync(file, secondFixedTime, secondFixedTime);
    const changedFile = readFileSync(file, "utf8");
    const changedMtime = statSync(file).mtimeMs;
    assert.equal(importTaskLedgerFile(store, file).conflicts, 1);
    assert.equal(readFileSync(file, "utf8"), changedFile, "changed source gets one stable conflict representation");
    assert.equal(statSync(file).mtimeMs, changedMtime);
    assert.deepEqual(store.db.prepare(
      "SELECT title,status,sync_state,sync_error,sync_hash,sync_at FROM core_item WHERE id='mailtask:idempotent'"
    ).get(), afterChangeDb);
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed imports remain retryable without rewriting an unchanged error representation", () => {
  const root = mkdtempSync(join(tmpdir(), "autosync-error-"));
  let attempts = 0;
  try {
    const file = createTaskLedger(root, "실패 재시도");
    const store = {
      db: { prepare: () => ({ get: () => undefined }) },
      ingestTaskItem: () => {
        attempts++;
        return { error: "synthetic_ingest_failure" };
      },
    };
    assert.equal(importTaskLedgerFile(store, file).errors, 1);
    const fixedTime = new Date("2026-07-13T00:00:02.000Z");
    utimesSync(file, fixedTime, fixedTime);
    const stableErrorFile = readFileSync(file, "utf8");
    const stableErrorMtime = statSync(file).mtimeMs;

    assert.equal(importTaskLedgerFile(store, file).errors, 1);
    assert.equal(attempts, 2, "failed handling must be retried");
    assert.equal(readFileSync(file, "utf8"), stableErrorFile);
    assert.equal(statSync(file).mtimeMs, stableErrorMtime);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("autosync poll retries a failed unchanged file and consumes its own successful rewrite", async () => {
  const root = mkdtempSync(join(tmpdir(), "autosync-seen-"));
  const store = openStore(":memory:");
  const realDb = store.db;
  let selected = 0;
  let ingested = 0;
  let handle;
  try {
    store.upsertProject({ id: "P26-014", title: "K", data_label: "real" });
    const file = createTaskLedger(root, "폴링 원본");
    const realPrepare = realDb.prepare.bind(realDb);
    store.db = new Proxy(realDb, {
      get(target, property) {
        if (property === "prepare") {
          return (sql) => {
            if (sql === "SELECT * FROM core_item WHERE id=?") {
              selected++;
              if (selected === 1) throw new Error("synthetic first-pass failure");
            }
            return realPrepare(sql);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const realIngest = store.ingestTaskItem.bind(store);
    store.ingestTaskItem = (row) => {
      ingested++;
      return realIngest(row);
    };

    handle = startAutosyncPoll(store, { root, intervalMs: 20 });
    await waitFor(() => ingested === 1, "failed first pass was incorrectly marked seen");
    await delay(80);
    assert.equal(ingested, 1, "successful self-rewrite must not trigger another import");

    const selectionsBeforeChange = selected;
    writeFileSync(file, readFileSync(file, "utf8").replace("폴링 원본", "폴링 변경"));
    await waitFor(() => readTaskLedgerRows(file)[0]?.sync_state === "conflict", "changed source was not handled");
    await delay(80);
    assert.equal(selected, selectionsBeforeChange + 1, "changed source must trigger exactly one new handling pass");
    assert.equal(realPrepare("SELECT title FROM core_item WHERE id='mailtask:idempotent'").get().title, "폴링 원본");
  } finally {
    if (handle) clearInterval(handle);
    realDb.close();
    rmSync(root, { recursive: true, force: true });
  }
});
