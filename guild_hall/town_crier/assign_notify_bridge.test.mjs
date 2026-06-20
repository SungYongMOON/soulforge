import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectAssignNotifications, buildAssignText, runAssignNotifyBridge } from "./assign_notify_bridge.mjs";

function seedDevErp(db) {
  db.exec("CREATE TABLE core_item(id TEXT PRIMARY KEY, title TEXT)");
  db.exec("CREATE TABLE event_log(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, actor_ref TEXT, kind TEXT, item_ref TEXT, from_val TEXT, to_val TEXT, project_ref TEXT)");
  db.prepare("INSERT INTO core_item(id,title) VALUES('itm1','도면 검토'),('itm2','BOM 정리')").run();
  const ins = (kind, item, to, proj) => db.prepare("INSERT INTO event_log(at,actor_ref,kind,item_ref,to_val,project_ref) VALUES('t','a',?,?,?,?)").run(kind, item, to, proj);
  ins("item_assign", "itm1", "문성용", "P26-014");   // 실제 배정
  ins("item_status", "itm1", "done", "P26-014");       // 다른 kind → 제외
  ins("item_assign", "itm2", "", "P26-014");            // 미배정(공란) → 제외
  ins("item_assign", "itm2", "김개발", "P26-030");     // 실제 배정
}

test("ASSIGN-NOTIFY: item_assign(배정)만 수집 — 미배정·타kind 제외 + 텍스트", () => {
  const db = new DatabaseSync(":memory:");
  seedDevErp(db);
  const notes = collectAssignNotifications(db, 0, 50);
  assert.equal(notes.length, 2, "to_val 있는 item_assign 2건만(item_status·미배정 제외)");
  assert.match(notes[0].text, /새 배정.*문성용.*P26-014.*도면 검토/);
  assert.match(notes[1].text, /김개발.*P26-030.*BOM 정리/);
  db.close();
});

test("ASSIGN-NOTIFY: watermark 이후만(중복 알림 방지)", () => {
  const db = new DatabaseSync(":memory:");
  seedDevErp(db);
  const all = collectAssignNotifications(db, 0, 50);
  const after = collectAssignNotifications(db, all[0].id, 50);
  assert.equal(after.length, 1, "첫 건 이후로는 1건만");
  db.close();
});

test("ASSIGN-NOTIFY: buildAssignText 프로젝트 없는 경우도 안전", () => {
  assert.match(buildAssignText({ to_val: "이대표", title: "예산 검토", project_ref: null }), /이대표.*예산 검토/);
});

test("ASSIGN-NOTIFY: dry-run 은 발화 안 하고(텍스트만) watermark 안 옮김", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "assign-notify-"));
  try {
    const dbPath = path.join(dir, "dev-erp.db");
    const db = new DatabaseSync(dbPath);
    seedDevErp(db);
    db.close();
    const res = await runAssignNotifyBridge(dir, { dbPath, stateFile: path.join(dir, "state.json"), apply: false });
    assert.equal(res.ok, true);
    assert.equal(res.scanned, 2);
    assert.equal(res.applied, false);
    assert.equal(res.results[0].emit, "dry-run");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
