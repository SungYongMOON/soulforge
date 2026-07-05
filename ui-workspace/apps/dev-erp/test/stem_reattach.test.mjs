import test from "node:test";
import assert from "node:assert/strict";

import { openStore } from "../src/store.mjs";

// B6 줄기 조작면(드래그 재부착) store 계약 — docs/slices/B6-STEM-REATTACH-API.md.
// 원칙: 링크 1개 변경 + 이벤트(from/to, 되돌리기 근거) + 멱등 no-op. 독립 파일(동시 세션 append 충돌 회피).

function seeded() {
  const store = openStore(":memory:");
  store.upsertProject({ id: "P99-001", title: "테스트 과제", data_label: "synthetic" });
  store.db.prepare(
    "INSERT INTO core_item(id, project_id, title, status, anchor_stage_code, data_label) VALUES (?,?,?,?,?,?)"
  ).run("itm_stem_1", "P99-001", "필터계수 전달", "open", "110", "synthetic");
  return store;
}

const lastEvent = (store, kind) =>
  store.db.prepare("SELECT * FROM event_log WHERE kind=? ORDER BY id DESC LIMIT 1").get(kind);

test("B6 reanchor: 골격 가지 이동은 링크 변경 + from/to 이벤트 + 멱등 no-op", () => {
  const store = seeded();
  const r = store.reanchorItem("itm_stem_1", { anchor_stage_code: "120" }, { actor_ref: "문성용" });
  assert.equal(r.ok, true);
  assert.equal(r.item.anchor_stage_code, "120");
  const ev = lastEvent(store, "item_reanchor");
  assert.ok(ev, "item_reanchor 이벤트가 있어야 함");
  assert.equal(ev.actor_ref, "문성용");
  assert.match(String(ev.from_val), /110/);
  assert.match(String(ev.to_val), /120/);
  // 같은 목적지 재호출 = no-op(이벤트 미증가)
  const before = store.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='item_reanchor'").get().n;
  const r2 = store.reanchorItem("itm_stem_1", { anchor_stage_code: "120" });
  assert.equal(r2.unchanged, true);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='item_reanchor'").get().n, before);
  // 유효성: 잘못된 link_kind / 없는 item / anchor 필드 전무
  assert.equal(store.reanchorItem("itm_stem_1", { link_kind: "nope" }).error, "link_kind_invalid");
  assert.equal(store.reanchorItem("itm_none", { anchor_stage_code: "120" }).error, "item_not_found");
  assert.equal(store.reanchorItem("itm_stem_1", {}).error, "anchor_required");
});

test("B6 occurrence: 출생 회차 링크 기록 + 형식 검증 + 멱등", () => {
  const store = seeded();
  const r = store.setItemOriginOccurrence("itm_stem_1", { series_key: "series-abc", occurrence_key: "2026-07-05" });
  assert.equal(r.ok, true);
  assert.equal(r.item.origin_occurrence_ref, "series:series-abc#2026-07-05");
  const ev = lastEvent(store, "item_occurrence_set");
  assert.equal(ev.to_val, "series:series-abc#2026-07-05");
  const r2 = store.setItemOriginOccurrence("itm_stem_1", { series_key: "series-abc", occurrence_key: "2026-07-05" });
  assert.equal(r2.unchanged, true);
  assert.equal(store.setItemOriginOccurrence("itm_stem_1", { series_key: "", occurrence_key: "2026-07-05" }).error, "occurrence_invalid");
  assert.equal(store.setItemOriginOccurrence("itm_stem_1", { series_key: "s", occurrence_key: "다음주" }).error, "occurrence_invalid");
});

test("B6 mail reattach: 교정 이벤트(from=기존 귀속) + 빈 소스만 채움 + 멱등", () => {
  const store = seeded();
  store.ingestMail({ id: "P99-001:HK-9", project_code: "P99-001", at: "2026-07-05T09:00:00+09:00", subject: "필터계수 회신" });
  // 기존 귀속: itm_old 가 이 메일에서 태어난 할일
  store.db.prepare(
    "INSERT INTO core_item(id, project_id, title, status, origin_mail_id, source_mail_ref, data_label) VALUES (?,?,?,?,?,?,?)"
  ).run("itm_old", "P99-001", "구 귀속", "open", "P99-001:HK-9", "P99-001:HK-9", "synthetic");
  const r = store.reattachMail("P99-001:HK-9", "itm_stem_1", { actor_ref: "문성용" });
  assert.equal(r.ok, true);
  assert.equal(r.previous_item, "itm_old");
  const ev = lastEvent(store, "mail_reattach");
  assert.equal(ev.from_val, "itm_old");
  assert.equal(ev.to_val, "itm_stem_1");
  assert.equal(ev.actor_kind, "human");
  // 대상 할일의 source_mail_ref 는 비어 있었으므로 채워짐
  assert.equal(r.item.source_mail_ref, "P99-001:HK-9");
  // 이미 귀속된 대상으로 재호출 = no-op 아님(origin_mail_id 기준) — itm_old 로 되돌리면 unchanged
  const back = store.reattachMail("P99-001:HK-9", "itm_old");
  assert.equal(back.unchanged, true);
  // 검증: 없는 메일/할일
  assert.equal(store.reattachMail("P99-001:none", "itm_stem_1").error, "mail_not_found");
  assert.equal(store.reattachMail("P99-001:HK-9", "itm_none").error, "item_not_found");
});
