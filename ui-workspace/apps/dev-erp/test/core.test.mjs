import assert from "node:assert/strict";
import test from "node:test";

import { openStore } from "../src/store.mjs";
import { loadFixture } from "../src/fixture.mjs";
import { ingestNormalized, mapSoulforgeSnapshot } from "../src/adapter.mjs";
import { getLexicon, LEXICON } from "../src/lexicon.mjs";
import { crossSearch } from "../src/search.mjs";

function freshStore() {
  return openStore(":memory:");
}

test("store: 스키마 3구역 생성과 fixture 적재 (TEST-001)", () => {
  const store = freshStore();
  const counts = loadFixture(store);
  assert.equal(counts.projects, 3);
  assert.equal(counts.items, 30);
  assert.equal(counts.mail, 50);
  assert.equal(counts.artifacts, 30);
  assert.ok(counts.events >= 1, "ingest 이벤트가 남아야 함");
});

test("store: summary 가 프로젝트별 카운트를 만든다 (UI-001)", () => {
  const store = freshStore();
  loadFixture(store);
  const today = new Date().toISOString().slice(0, 10);
  const summary = store.summary(today);
  assert.equal(summary.length, 3);
  const prjA = summary.find((p) => p.id === "PRJ-A");
  assert.ok(prjA.open > 0);
  assert.ok(prjA.boss_open >= 1, "보스(단계 종료) 항목이 카운트되어야 함");
});

test("event_log: 라벨링 우선 원칙 — used_refs/data_label/actor_kind (INFRA-003)", () => {
  const store = freshStore();
  store.appendEvent({
    actor_ref: "p-kim", actor_kind: "human", item_ref: "IT-001", kind: "status",
    from: "open", to: "done", intervention_count: 0,
    used_refs: [".registry/skills/evidence_sift", "knowledge:cable_label_rule"],
    data_label: "real", note: "test"
  });
  const [event] = store.recentEvents(1);
  assert.equal(event.actor_kind, "human");
  assert.deepEqual(event.used_refs, [".registry/skills/evidence_sift", "knowledge:cable_label_rule"]);
  assert.equal(event.data_label, "real");
});

test("adapter: 정규화 ingest 와 불량 행 보고 (INFRA-002)", () => {
  const store = freshStore();
  const report = ingestNormalized(store, {
    projects: [{ id: "P1", title: "테스트" }, { title: "id 없음" }],
    items: [{ id: "I1", project_id: "P1", title: "할 일" }, { id: "I2" }],
    mail: [{ id: "M1", at: "2026-06-12T00:00:00Z", subject: "제목" }]
  }, { label: "real", source: "unit_test" });
  assert.equal(report.projects, 1);
  assert.equal(report.items, 1);
  assert.equal(report.mail, 1);
  assert.equal(report.skipped.length, 2);
  const [event] = store.recentEvents(1);
  assert.equal(event.kind, "ingest");
  assert.equal(event.data_label, "real");
});

test("adapter: soulforge snapshot 보수적 매핑 (INFRA-002)", () => {
  const mapped = mapSoulforgeSnapshot({
    operation_board: {
      sections: {
        dungeon_map: { rows: [{ project_code: "P00-TEST", title: "샘플 던전", health: "watch" }] },
        mission_board: { rows: [{ mission_id: "m1", project_code: "P00-TEST", title: "샘플 미션", readiness_status: "blocked" }] }
      }
    }
  });
  assert.equal(mapped.projects.length, 1);
  assert.equal(mapped.items.length, 1);
  assert.equal(mapped.items[0].status, "blocked");
});

test("lexicon: business/fantasy 키 완전 일치 (INFRA-004, TEST-003)", () => {
  const bKeys = Object.keys(LEXICON.business).sort();
  const fKeys = Object.keys(LEXICON.fantasy).sort();
  assert.deepEqual(bKeys, fKeys, "두 모드의 라벨 키가 1:1 이어야 화면이 안 깨진다");
  assert.equal(getLexicon("unknown_mode").app_title, LEXICON.business.app_title);
});

test("search: 검색 1회로 3종 묶기 (UI-005)", () => {
  const store = freshStore();
  loadFixture(store);
  const result = crossSearch(store, "PRJ-A");
  assert.ok(result.items.length > 0);
  assert.ok(result.mail.length > 0);
  assert.ok(result.artifacts.length > 0);
  const empty = crossSearch(store, "");
  assert.equal(empty.items.length, 0);
});

test("mail: 기본 90일 범위와 원문 미저장 (UI-003)", () => {
  const store = freshStore();
  loadFixture(store);
  const mail = store.mail({ days: 90 });
  assert.ok(mail.length > 0);
  for (const m of mail.slice(0, 5)) {
    assert.ok(m.subject && m.pointer_ref, "제목/포인터만 있고");
    assert.equal(m.body, undefined, "본문 컬럼 자체가 없어야 함");
  }
});

test("P1b: purgeSynthetic 은 synthetic 만 지우고 real 은 보존 + meta 마커", () => {
  const store = freshStore();
  loadFixture(store);
  ingestNormalized(store, {
    projects: [{ id: "P99-REAL", title: "실프로젝트" }],
    mail: [{ id: "RM1", at: "2026-06-12T00:00:00+09:00", subject: "실메일 제목" }]
  }, { label: "real", source: "p1b_test" });

  const removed = store.purgeSynthetic();
  assert.ok(removed > 100, "합성 행들이 제거되어야 함");
  const counts = store.counts();
  assert.equal(counts.projects, 1);
  assert.equal(counts.mail, 1);
  assert.equal(store.db.prepare("SELECT COUNT(*) c FROM core_project WHERE data_label='real'").get().c, 1);

  store.setMeta("real_ingest_mtime", "12345");
  assert.equal(store.getMeta("real_ingest_mtime"), "12345");
  store.setMeta("real_ingest_mtime", "67890");
  assert.equal(store.getMeta("real_ingest_mtime"), "67890");
});

test("run11: 수동 라벨 CRUD + 메일 라벨 필터 (Gmail식)", () => {
  const store = freshStore();
  loadFixture(store);
  const dup = store.createLabel("  ", "#fff");
  assert.equal(dup.error, "label_name_required");
  const a = store.createLabel("긴급", "#b3372f");
  assert.ok(a.label.id);
  assert.equal(store.createLabel("긴급", "#000").error, "label_exists");

  const [m1, m2] = store.mail({ days: 0 }).slice(0, 2);
  assert.deepEqual(m1.label_ids, []);
  assert.equal(store.setMailLabel(m1.id, a.label.id, true).ok, true);
  assert.equal(store.setMailLabel("no-such", a.label.id, true).error, "mail_not_found");

  const filtered = store.mail({ days: 0, label_id: a.label.id });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, m1.id);
  assert.deepEqual(filtered[0].label_ids, [a.label.id]);

  store.setMailLabel(m1.id, a.label.id, false);
  assert.equal(store.mail({ days: 0, label_id: a.label.id }).length, 0);

  const q = store.mail({ days: 0, q: m2.subject.slice(0, 6) });
  assert.ok(q.some((m) => m.id === m2.id));
});

test("run13: 가이드 산출물 CRUD + 스텝 진행 상태", async () => {
  const { guideTemplates, SE_STAGES, ARTIFACT_FLOW } = await import("../src/guide.mjs");
  const store = freshStore();
  loadFixture(store);
  const proj = store.summary("2026-06-12", "2026-06-18")[0].id;

  // 템플릿: 양 모드 모두 8단계 + 7스텝, 파리티
  for (const mode of ["business", "fantasy"]) {
    const t = guideTemplates(mode);
    assert.equal(t.stages.length, SE_STAGES.length);
    assert.equal(t.flow.length, ARTIFACT_FLOW.length);
    assert.ok(t.stages.every((s) => s.name && s.code));
    assert.ok(t.flow.every((s) => s.name && s.hint));
  }
  // Out(final) 이 quality 앞, snapshot 이 첫 스텝 — "폴더 순서 = 업무 순서"
  const keys = ARTIFACT_FLOW.map((s) => s.key);
  assert.equal(keys[0], "snapshot");
  assert.ok(keys.indexOf("final") === keys.length - 2 && keys.at(-1) === "quality");

  // 산출물 추가: 검증 + 중복 거부
  assert.equal(store.addGuideArtifact(proj, "030", "  ").error, "artifact_name_required");
  assert.equal(store.addGuideArtifact("no-such", "030", "SSRS").error, "project_not_found");
  assert.equal(store.addGuideArtifact(proj, "030", "체계요구사항명세서(SSRS)").ok, true);
  assert.equal(store.addGuideArtifact(proj, "030", "체계요구사항명세서(SSRS)").error, "artifact_exists");

  // 스텝 체크/해제 + 상태 맵
  let [art] = store.guideState(proj);
  assert.equal(art.stage_code, "030");
  assert.deepEqual(art.steps, {});
  assert.equal(store.setGuideStep(art.id, "snapshot", true).ok, true);
  assert.equal(store.setGuideStep(999999, "snapshot", true).error, "artifact_not_found");
  [art] = store.guideState(proj);
  assert.ok(art.steps.snapshot.done_at);
  store.setGuideStep(art.id, "snapshot", false);
  [art] = store.guideState(proj);
  assert.equal(art.steps.snapshot, undefined);
});

test("run16: P2a 할일 쓰기 — 생성/검증/가이드 연결", () => {
  const store = freshStore();
  loadFixture(store);
  const proj = store.summary("2026-06-12", "2026-06-18")[0].id;

  assert.equal(store.createItem({ project_id: proj, title: " " }).error, "title_required");
  assert.equal(store.createItem({ project_id: "no-such", title: "x" }).error, "project_not_found");
  assert.equal(store.createItem({ project_id: proj, title: "x", due: "6/13" }).error, "due_format");
  assert.equal(store.createItem({ project_id: proj, title: "x", guide_artifact_id: 999 }).error, "guide_artifact_not_found");

  const r = store.createItem({ project_id: proj, title: "방열판 견적 요청", assignee_ref: "u1", due: "2026-06-20", created_by: "owner" });
  assert.equal(r.ok, true);
  assert.equal(r.item.status, "open");
  assert.equal(r.item.data_label, "real");
  assert.equal(r.item.created_by, "owner");

  // 가이드 산출물 연결 (+ 타 과제 산출물 거부)
  store.addGuideArtifact(proj, "030", "SSRS");
  const [art] = store.guideState(proj);
  const linked = store.createItem({ project_id: proj, title: "SSRS 초안", guide_artifact_id: art.id, guide_step_key: "draft" });
  assert.equal(linked.ok, true);
  const rows = store.items({ project: proj, q: "SSRS 초안" });
  assert.equal(rows[0].guide_artifact_name, "SSRS");
  assert.equal(rows[0].guide_stage_code, "030");
  const other = store.summary("2026-06-12", "2026-06-18")[1].id;
  assert.equal(store.createItem({ project_id: other, title: "y", guide_artifact_id: art.id }).error, "guide_artifact_project_mismatch");
});

test("run16: P2a 상태 전이 + 담당 지정 + project_ref 이벤트 필터", () => {
  const store = freshStore();
  loadFixture(store);
  const proj = store.summary("2026-06-12", "2026-06-18")[0].id;
  const { item } = store.createItem({ project_id: proj, title: "테스트 할일" });

  assert.equal(store.setItemStatus(item.id, "weird").error, "bad_status");
  assert.equal(store.setItemStatus("no-such", "doing").error, "item_not_found");
  const s1 = store.setItemStatus(item.id, "doing");
  assert.deepEqual([s1.ok, s1.from, s1.project_id], [true, "open", proj]);
  const s2 = store.setItemStatus(item.id, "done");
  assert.equal(s2.from, "doing");

  const a1 = store.setItemAssignee(item.id, "u2");
  assert.equal(a1.ok, true);
  assert.equal(store.setItemAssignee("no-such", "u2").error, "item_not_found");

  // project_ref 차원: 과제별 이력 필터
  store.appendEvent({ kind: "item_status", item_ref: item.id, from: "open", to: "doing", project_ref: proj, data_label: "real" });
  store.appendEvent({ kind: "item_status", item_ref: "zzz", from: "open", to: "doing", project_ref: "OTHER", data_label: "real" });
  const filtered = store.recentEvents(50, proj);
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every((e) => e.project_ref === proj));
});

test("run16: 메일→할일 승격 (메타만, 중복 거부)", () => {
  const store = freshStore();
  loadFixture(store);
  const [m] = store.mail({ days: 0 });
  const r = store.promoteMail(m.id, "owner");
  assert.equal(r.ok, true);
  assert.equal(r.item.title, m.subject);          // 제목 메타만 복사
  assert.equal(r.item.origin, "mail");
  assert.equal(r.item.origin_mail_id, m.id);
  assert.equal(r.item.project_id, m.project_id);
  const dup = store.promoteMail(m.id, "owner");
  assert.equal(dup.error, "already_promoted");
  assert.equal(dup.item_id, r.item.id);
  assert.equal(store.promoteMail("no-such", "owner").error, "mail_not_found");
  // 본문 필드 자체가 스키마에 없음 — 승격 항목 컬럼 확인
  const cols = store.db.prepare("PRAGMA table_info(core_item)").all().map((c) => c.name);
  assert.ok(cols.includes("origin_mail_id") && cols.includes("created_by"));
  assert.ok(!cols.includes("body"));
});

test("run17: 메일 과제 분류(재배정) — 단건/묶음/할일 동행 이동/출몰 생성", () => {
  const store = freshStore();
  loadFixture(store);
  const projects = store.summary("2026-06-12", "2026-06-18");
  const [pa, pb] = [projects[0].id, projects[1].id];
  const mails = store.mail({ days: 0 }).slice(0, 3);

  // 단건 검증
  assert.equal(store.setMailProject("no-such", pa).error, "mail_not_found");
  assert.equal(store.setMailProject(mails[0].id, "no-such").error, "project_not_found");
  const mv = store.setMailProject(mails[0].id, pb === mails[0].project_id ? pa : pb);
  assert.equal(mv.ok, true);
  assert.equal(mv.from, mails[0].project_id);

  // 승격된 메일 재배정 → 연결 할일 동행 이동 (단일 진실)
  const pr = store.promoteMail(mails[1].id, "owner");
  assert.equal(pr.ok, true);
  const target = mails[1].project_id === pa ? pb : pa;
  const mv2 = store.setMailProject(mails[1].id, target);
  assert.equal(mv2.item_moved, pr.item.id);
  assert.equal(store.db.prepare("SELECT project_id FROM core_item WHERE id=?").get(pr.item.id).project_id, target);

  // 묶음 + make_items: 미승격분만 생성, 승격분은 이동만 (중복 0)
  // 대상은 두 메일의 현재 과제와 다른 곳으로 (unchanged 회피)
  const cur1 = target;
  const cur2 = store.db.prepare("SELECT project_id FROM core_mail WHERE id=?").get(mails[2].id).project_id;
  const batchTarget = projects.map((x) => x.id).find((id) => id !== cur1 && id !== cur2);
  const batch = store.assignMails([mails[1].id, mails[2].id], batchTarget, { make_items: true, created_by: "owner" });
  assert.equal(batch.ok, true);
  const r1 = batch.results.find((x) => x.mail_id === mails[1].id);
  const r2 = batch.results.find((x) => x.mail_id === mails[2].id);
  assert.equal(r1.item_moved, pr.item.id);      // 기존 할일 이동
  assert.equal(r1.item_created, null);           // 중복 생성 없음
  assert.ok(r2.item_created);                    // 새 출몰
  const created = store.db.prepare("SELECT * FROM core_item WHERE id=?").get(r2.item_created);
  assert.deepEqual([created.project_id, created.origin, created.status], [batchTarget, "mail", "open"]);

  assert.equal(store.assignMails([], pa).error, "mail_ids_required");
  assert.equal(store.assignMails([mails[0].id], "no-such").error, "project_not_found");
});

test("B5: 라벨 감사기 — 커버리지 집계 + 결손 주입 검출", async () => {
  const { audit, auditSince } = await import("../tools/label_audit.mjs");
  const good = (id, kind) => ({ id, kind, actor_ref: "owner", used_refs: '["items"]', data_label: "real", project_ref: "P1" });
  // 전부 정상
  const clean = audit([good(1, "item_create"), good(2, "mail_assign")]);
  assert.equal(clean.coverage.used_refs, 1);
  assert.equal(clean.coverage.project_ref, 1);
  assert.equal(clean.coverage.data_label, 1);
  // 결손 주입: refs 빈 배열 / project_ref null / data_label null / 깨진 JSON
  const dirty = audit([
    good(1, "a"),
    { id: 2, kind: "b", actor_ref: "x", used_refs: "[]", data_label: "real", project_ref: null },
    { id: 3, kind: "c", actor_ref: null, used_refs: "not-json", data_label: null, project_ref: "P1" }
  ]);
  assert.equal(dirty.used_refs_present, 1);
  assert.equal(dirty.offenders.no_used_refs.length, 2);
  assert.deepEqual(dirty.offenders.no_project_ref, [2]);
  assert.deepEqual(dirty.offenders.no_data_label, [3]);
  assert.ok(dirty.coverage.used_refs < 0.4);
  // 도입 시점 이후만 따로 (id > 2)
  const recent = auditSince([good(1, "a"), good(3, "b"), { id: 4, kind: "c", used_refs: "[]", data_label: "real", project_ref: null }], 2);
  assert.equal(recent.total, 2);
  assert.equal(recent.offenders.no_used_refs.length, 1);
  // 빈 입력 안전
  assert.equal(audit([]).coverage.used_refs, 1);
});

// ---------- P2b: 계정·세션·권한·레이아웃 (TEST-P2b) ----------
import { hashPassword, verifyPassword } from "../src/store.mjs";

test("P2b: 비밀번호 해시 roundtrip (평문 미저장)", () => {
  const h = hashPassword("s3cret!");
  assert.ok(h.startsWith("scrypt$"), "scrypt 형식");
  assert.ok(!h.includes("s3cret"), "평문이 들어가면 안 됨");
  assert.equal(verifyPassword("s3cret!", h), true);
  assert.equal(verifyPassword("wrong", h), false);
});

test("P2b: 계정 생성·로그인·세션 검증/만료/삭제", () => {
  const store = freshStore();
  assert.equal(store.accountCount(), 0, "기본 익명(계정 0)");
  const r = store.createAccount({ username: "owner", password: "pw123", roles: [] });
  assert.ok(r.ok && r.id);
  assert.equal(store.createAccount({ username: "owner", password: "x" }).error, "username_taken");
  assert.equal(store.verifyLogin("owner", "pw123").username, "owner");
  assert.equal(store.verifyLogin("owner", "bad"), null);
  const tok = store.createSession(r.id);
  assert.equal(store.sessionAccount(tok).id, r.id);
  // 만료 세션
  const expTok = store.createSession(r.id, -1);
  assert.equal(store.sessionAccount(expTok), null, "만료 세션은 무효");
  store.deleteSession(tok);
  assert.equal(store.sessionAccount(tok), null, "삭제 후 무효(logout)");
});

test("P2b: RBAC visible-but-locked 권한 합집합", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "u", password: "p" }).id;
  store.upsertRole("member", "팀원");
  store.assignRole(a, "member");
  store.setPermission("member", "mod:gates", true, false);  // 보이되 잠김
  store.setPermission("member", "view:items", true, true);
  const perms = Object.fromEntries(store.permsFor(a).map((x) => [x.resource, x]));
  assert.equal(perms["mod:gates"].visible, true);
  assert.equal(perms["mod:gates"].access, false, "잠김");
  assert.equal(perms["view:items"].access, true);
});

test("P2b: 계정별 레이아웃 저장/로드 roundtrip", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "u2", password: "p" }).id;
  assert.equal(store.getLayout(a), null, "초기 없음 → 기본 사용");
  const layout = [{ id: "projects", x: 0, y: 0, w: 12, h: 12 }, { id: "kpi", x: 0, y: 12, w: 3, h: 7 }];
  store.setLayout(a, layout);
  assert.deepEqual(store.getLayout(a), layout, "저장→로드 동일(logout 내성)");
});

// ---------- P2b 엣지케이스 하드닝 (Run1 자율) ----------
test("P2b 엣지: 세션 토큰 빈값/오염/만료정리", () => {
  const store = freshStore();
  assert.equal(store.sessionAccount(null), null);
  assert.equal(store.sessionAccount(""), null);
  assert.equal(store.sessionAccount("nonexistent-token"), null);
  const a = store.createAccount({ username: "e1", password: "p" }).id;
  store.createSession(a, -1);           // 이미 만료
  const live = store.createSession(a);  // 유효
  const purged = store.purgeExpiredSessions();
  assert.ok(purged.removed >= 1, "만료 세션 정리");
  assert.equal(store.sessionAccount(live).id, a, "유효 세션은 보존");
});

test("P2b 엣지: 로그인 빈 입력·없는 사용자 안전", () => {
  const store = freshStore();
  assert.equal(store.verifyLogin("", ""), null);
  assert.equal(store.verifyLogin("ghost", "x"), null);
  assert.equal(store.createAccount({ username: "", password: "p" }).error, "username_password_required");
  assert.equal(store.createAccount({ username: "u", password: "" }).error, "username_password_required");
});

test("P2b 엣지: 레이아웃 비배열/오염 방어", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "e2", password: "p" }).id;
  store.setLayout(a, { not: "array" });          // 비배열 → []
  assert.deepEqual(store.getLayout(a), []);
  store.setLayout(a, null);                       // null → []
  assert.deepEqual(store.getLayout(a), []);
  // 오염 JSON 직접 주입 → getLayout null
  store.db.prepare("UPDATE user_dashboard_layout SET layout_json='{bad' WHERE account_id=?").run(a);
  assert.equal(store.getLayout(a), null);
});

test("P2b 엣지: 권한 다중역할 union(하나라도 access면 허용)", () => {
  const store = freshStore();
  const a = store.createAccount({ username: "e3", password: "p" }).id;
  store.upsertRole("r_deny"); store.upsertRole("r_allow");
  store.assignRole(a, "r_deny"); store.assignRole(a, "r_allow");
  store.setPermission("r_deny", "mod:gates", true, false);
  store.setPermission("r_allow", "mod:gates", true, true);
  const p = store.permsFor(a).find((x) => x.resource === "mod:gates");
  assert.equal(p.access, true, "한 역할이라도 access면 union=허용");
  assert.equal(store.permsFor("no-such-account").length, 0, "역할 없으면 빈 권한");
});

// ---------- 회의록 메타 구조 (Run2 자율) ----------
test("회의록: 생성·목록·수동 액션아이템 링크 (원문/자동추출 없음)", () => {
  const store = freshStore();
  loadFixture(store);
  const projId = store.summary("2026-06-13", "2026-06-20")[0].id;
  assert.equal(store.createMeeting({ title: "" }).error, "title_required");
  const m = store.createMeeting({ title: "주간 회의", project_id: projId, at: "2026-06-13", attendees: "owner,팀원", summary_pointer: "_workmeta/.../notes.md" });
  assert.ok(m.ok && m.id);
  const list = store.meetings({});
  assert.ok(list.find((x) => x.id === m.id), "목록에 포함");
  assert.equal(store.meetings({ project: projId }).length >= 1, true);
  // 액션아이템: 기존 할일 수동 링크
  const item = store.createItem({ project_id: projId, title: "회의 후속 작업", created_by: "owner" });
  assert.equal(store.linkActionItem("no-mtg", item.item.id).error, "meeting_not_found");
  assert.equal(store.linkActionItem(m.id, "no-item").error, "item_not_found");
  assert.ok(store.linkActionItem(m.id, item.item.id).ok);
  const acts = store.meetingActions(m.id);
  assert.equal(acts.length, 1);
  assert.equal(acts[0].title, "회의 후속 작업");
});

// ---------- 산출물 진행률 집계 (자율 main slice) ----------
test("guideSummary: 합성 가이드 시드 → 진행률 다양", () => {
  const store = freshStore();
  loadFixture(store);
  const sum = store.guideSummary();
  assert.ok(sum.length >= 3, "프로젝트별 가이드 집계");
  const a = sum.find((x) => x.project_id === "PRJ-A");
  assert.ok(a && a.artifacts === 2, "PRJ-A 산출물 2");
  assert.equal(a.steps_total, 14, "2 산출물 × 7 스텝");
  assert.equal(a.steps_done, 10, "7+3 done");
  assert.equal(a.pct, Math.round(10 / 14 * 100));
  const c = sum.find((x) => x.project_id === "PRJ-C");
  assert.equal(c.pct, 0, "PRJ-C 0%");
});

// ---------- A1/A2: 게이트 판정·강제 ----------
test("게이트: 판정(passable/reasons) + 기본 hard 강제", () => {
  const store = freshStore();
  loadFixture(store);
  const gates = store.gates({ project: "PRJ-A" });
  const s1 = gates.find((g) => g.id === "PRJ-A-S1");
  const s2 = gates.find((g) => g.id === "PRJ-A-S2");
  assert.equal(s1.status, "cleared");
  assert.equal(s1.passable, true, "cleared 스테이지는 통과 가능");
  assert.ok(s2.open_items > 0, "S2에 미완 할일 존재");
  assert.equal(s2.passable, false, "미완/차단 있으면 통과 불가");
  assert.ok(s2.reasons.some((r) => r.code === "open_items"), "사유에 open_items");
  // 기본 모드 = hard
  assert.equal(store.gateMode(), "hard");
  const blocked = store.clearStage("PRJ-A-S2");
  assert.equal(blocked.error, "gate_blocked", "hard 모드 미충족 통과 차단");
  // force 통과
  const forced = store.clearStage("PRJ-A-S2", { force: true });
  assert.equal(forced.ok, true);
  assert.equal(forced.forced, true);
});

test("게이트: soft 모드 전환 시 경고 후 통과 허용 + 이미 통과 처리", () => {
  const store = freshStore();
  loadFixture(store);
  assert.equal(store.setGateMode("soft").mode, "soft");
  const r = store.clearStage("PRJ-B-S2"); // 미충족이지만 soft → 통과
  assert.equal(r.ok, true);
  assert.equal(r.forced, true, "soft 통과는 forced 플래그");
  assert.equal(store.clearStage("PRJ-B-S1").already, true, "이미 cleared");
  assert.equal(store.clearStage("no-such").error, "stage_not_found");
  assert.equal(store.setGateMode("hard").mode, "hard", "되돌리기 가능");
});

// ---------- A6: 보스 HP(잔여) 계산 ----------
test("게이트 보스 HP: 잔여 = 미완+차단+미완절차, cleared면 통과", () => {
  const store = freshStore();
  loadFixture(store);
  const s2 = store.gates({ project: "PRJ-A" }).find((g) => g.id === "PRJ-A-S2");
  assert.equal(s2.remaining, s2.open_items + s2.blocked_items + (s2.steps_total - s2.steps_done));
  assert.ok(s2.remaining > 0, "미충족이면 보스 HP > 0");
  const s1 = store.gates({ project: "PRJ-A" }).find((g) => g.id === "PRJ-A-S1");
  assert.equal(s1.passable, true);
});

// ---------- A3: LLM 어댑터(메타/요약, 외부전송 0) ----------
import { buildMetaContext, contextToText, runLlm } from "../src/llm.mjs";

test("LLM 컨텍스트: 메타/요약만 — 원문/본문 필드 없음", () => {
  const store = freshStore();
  loadFixture(store);
  const ctx = buildMetaContext(store, { days: 90 });
  assert.equal(ctx.kind, "meta_summary_only");
  assert.ok(ctx.projects.length >= 1);
  // 메일 메타에 본문/첨부 필드가 없어야 함(원문 미포함 가드)
  for (const m of ctx.recent_mail_meta) {
    assert.deepEqual(Object.keys(m).sort(), ["at", "dir", "subject"]);
    assert.ok(!("body" in m) && !("raw" in m) && !("attachment" in m));
  }
  assert.ok(contextToText(ctx).includes("원문 미포함"));
});

test("LLM 어댑터: stub=외부전송0, codex_cli=미가용 폴백 + llm_call 이벤트", async () => {
  const store = freshStore();
  loadFixture(store);
  const ctx = buildMetaContext(store, {});
  const r1 = await runLlm({ provider: "stub", user: "현황 요약", context: ctx }, { store });
  assert.equal(r1.external, false);
  assert.ok(r1.text.includes("질문: 현황 요약"));
  const r2 = await runLlm({ provider: "codex_cli", user: "x", context: ctx }, { store });
  assert.equal(r2.external, true);
  assert.equal(r2.delivered, false, "sandbox는 외부 미수행(폴백)");
  const calls = store.recentEvents(10, null).filter((e) => e.kind === "llm_call");
  assert.ok(calls.length >= 2, "llm_call 이벤트 기록");
});
