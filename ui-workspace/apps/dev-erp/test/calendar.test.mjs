import test from "node:test";
import assert from "node:assert/strict";

import { buildMonthGrid, monthGridRange, shiftMonth } from "../src/calendar.mjs";
import { openStore } from "../src/store.mjs";

// B10 캘린더 — docs/slices/B10-CALENDAR-VIEW.md. 독립 파일(동시 세션 append 충돌 회피).

function seeded() {
  const store = openStore(":memory:");
  store.upsertProject({ id: "P99-001", title: "테스트 과제", data_label: "synthetic" });
  return store;
}

const lastEvent = (store, kind) =>
  store.db.prepare("SELECT * FROM event_log WHERE kind=? ORDER BY id DESC LIMIT 1").get(kind);

test("B10 grid: 일요일 시작 6주 고정 + 경계월(2026-07 은 수요일 시작)", () => {
  const grid = buildMonthGrid("2026-07");
  assert.equal(grid.from, "2026-06-28"); // 2026-07-01(수) 앞 일요일
  assert.equal(grid.to, "2026-08-08");
  assert.equal(grid.weeks.length, 6);
  assert.equal(grid.weeks.every((w) => w.length === 7), true);
  assert.equal(grid.weeks[0][0].date, "2026-06-28");
  assert.equal(grid.weeks[0][0].in_month, false);
  assert.equal(grid.weeks[0][3].date, "2026-07-01");
  assert.equal(grid.weeks[0][3].in_month, true);
  // 2026-02-01 은 일요일 — 그리드 시작이 정확히 1일
  assert.equal(monthGridRange("2026-02").from, "2026-02-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(buildMonthGrid("2026-13"), null);
  assert.equal(buildMonthGrid("nope"), null);
});

test("B10 grid: 마감·일정 버킷팅 — 범위 밖은 조용히 제외, at 시각부는 잘라 버킷", () => {
  const grid = buildMonthGrid("2026-07", {
    items: [
      { id: "i1", due: "2026-07-15" },
      { id: "i2", due: "2026-06-28" },   // 앞달이지만 그리드 안
      { id: "i3", due: "2026-09-01" },   // 그리드 밖 — 제외
      { id: "i4", due: null },            // 무마감 — 제외
    ],
    meetings: [
      { id: "m1", at: "2026-07-15T14:00" },
      { id: "m2", at: "2026-07-15 09:30" },
      { id: "m3", at: null },             // 날짜 없는 일정 — 캘린더 미표시
    ],
  });
  const flat = grid.weeks.flat();
  const jul15 = flat.find((c) => c.date === "2026-07-15");
  assert.deepEqual(jul15.items.map((x) => x.id), ["i1"]);
  assert.deepEqual(jul15.meetings.map((x) => x.id), ["m1", "m2"]);
  assert.deepEqual(flat.find((c) => c.date === "2026-06-28").items.map((x) => x.id), ["i2"]);
  assert.equal(flat.flatMap((c) => c.items).length, 2);
  assert.equal(flat.flatMap((c) => c.meetings).length, 2);
});

test("B10 store: calendarFeed from/to 범위 필터(기존 무인자 호출 하위호환)", () => {
  const store = seeded();
  store.createItem({ project_id: "P99-001", title: "7월 마감", due: "2026-07-10" });
  store.createItem({ project_id: "P99-001", title: "8월 마감", due: "2026-08-10" });
  store.createItem({ project_id: "P99-001", title: "무마감" });
  assert.equal(store.calendarFeed().length, 2); // 하위호환: due 있는 활성 전부
  const ranged = store.calendarFeed({ from: "2026-07-01", to: "2026-07-31" });
  assert.deepEqual(ranged.map((r) => r.title), ["7월 마감"]);
});

test("B10 store: meetings from/to 는 at 보유 일정만 + 소프트삭제 제외", () => {
  const store = seeded();
  const a = store.createMeeting({ title: "7월 회의", at: "2026-07-15T14:00", project_id: "P99-001" });
  store.createMeeting({ title: "8월 회의", at: "2026-08-02" });
  store.createMeeting({ title: "날짜 미정" });
  const july = store.meetings({ from: "2026-07-01", to: "2026-07-31" });
  assert.deepEqual(july.map((m) => m.title), ["7월 회의"]);
  assert.equal(store.meetings().length, 3); // 무범위 조회는 기존과 동일(전부)
  const del = store.deleteMeeting(a.id, { actor_ref: "문성용" });
  assert.equal(del.ok, true);
  assert.equal(store.meetings({ from: "2026-07-01", to: "2026-07-31" }).length, 0);
  assert.equal(store.meetings().length, 2);
  assert.equal(lastEvent(store, "meeting_delete").actor_ref, "문성용");
  assert.equal(store.deleteMeeting(a.id).error, "already_deleted");
  assert.equal(store.deleteMeeting("mtg_none").error, "meeting_not_found");
});

test("B10 store: updateMeeting — 필드 갱신 + from/to 이벤트 + no-op 무이벤트 + at 형식 검증", () => {
  const store = seeded();
  const a = store.createMeeting({ title: "설계 회의", at: "2026-07-15T14:00" });
  const r = store.updateMeeting(a.id, { at: "2026-07-16T14:00" }, { actor_ref: "문성용" });
  assert.equal(r.ok, true);
  assert.equal(r.meeting.at, "2026-07-16T14:00");
  const ev = lastEvent(store, "meeting_edit");
  assert.equal(ev.actor_ref, "문성용");
  assert.match(String(ev.from_val), /2026-07-15/);
  assert.match(String(ev.to_val), /2026-07-16/);
  // no-op(같은 값) — 이벤트 미증가(S8-4 관례)
  const before = store.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='meeting_edit'").get().n;
  const r2 = store.updateMeeting(a.id, { at: "2026-07-16T14:00" });
  assert.equal(r2.unchanged, true);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='meeting_edit'").get().n, before);
  // 제목·검증
  assert.equal(store.updateMeeting(a.id, { title: "  " }).error, "title_required");
  assert.equal(store.updateMeeting(a.id, { at: "내일쯤" }).error, "at_format");
  assert.equal(store.updateMeeting(a.id, {}).error, "no_change");
  assert.equal(store.updateMeeting("mtg_none", { title: "x" }).error, "meeting_not_found");
  // 삭제된 일정은 수정 불가
  store.deleteMeeting(a.id);
  assert.equal(store.updateMeeting(a.id, { title: "고침" }).error, "meeting_not_found");
});

test("B10 app.js 계약: mod:calendar 배선(디스패치·가상NAV·새로고침 유지·미니위젯·CSS)", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
  assert.match(app, /state\.view === "mod:calendar"/u);          // render() 디스패치
  assert.match(app, /"mod:calendar": \{ b: "캘린더"/u);          // VIRTUAL_NAV 라벨쌍
  assert.match(app, /"mod:calendar"\]\.includes\(localStorage/u); // 새로고침 유지 화이트리스트
  assert.match(app, /id: "month_cal", cat: "group_task", ready: true/u); // 위젯 등록
  assert.match(app, /data-cal-jump/u);                            // 위젯→뷰 점프 위임
  const css = readFileSync(new URL("../static/style.css", import.meta.url), "utf8");
  assert.match(css, /\.cal-grid \{ display: grid/u);
});
