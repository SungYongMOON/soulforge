import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Owner "검사 중" 필터(플랜 18 §12 "ERP 필터 1개") UI 경계 테스트.
// 화면은 read-only 이며 승인·완료·상태변경 호출을 갖지 않는다. 데이터는 cookie /api/reviews/pending 하나만 읽는다.
const APP_SOURCE = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const LEXICON_SOURCE = readFileSync(new URL("../src/lexicon.mjs", import.meta.url), "utf8");

function sourceSlice(from, to) {
  const start = APP_SOURCE.indexOf(from);
  const end = APP_SOURCE.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source slice ${from} -> ${to}`);
  return APP_SOURCE.slice(start, end);
}

const REVIEW_BLOCK = sourceSlice("const REVIEW_ACCEPTED_STATUSES", "// P-18 외부 시트 임베드");

test("검사 중 화면은 승인 대기 nav 아래 가상 뷰로 등록되고 render() 가 dispatch 한다", () => {
  assert.match(APP_SOURCE, /items: \["mod:proposals", "mod:reviews"\]/u);
  assert.match(APP_SOURCE, /"mod:reviews": \{ b: "검사 중", f: "검사 중" \}/u);
  assert.match(APP_SOURCE, /if \(state\.view === "mod:reviews"\) \{[^\n]*return renderPendingReviews\(\); \}/u);
});

test("딥링크는 ?view=mod:reviews 하나만 받고 다른 값은 무시한다(고정 allowlist)", () => {
  const stateInit = sourceSlice("const state = {", "  lex: {},");
  assert.match(stateInit, /new URLSearchParams\(location\.search\)\.get\("view"\) === "mod:reviews" \? "mod:reviews"/u);
  // 임의 view 문자열을 그대로 state.view 로 넣는 경로가 없어야 한다.
  assert.doesNotMatch(stateInit, /view: new URLSearchParams\(location\.search\)\.get\("view"\)\s*\?\?/u);
  assert.doesNotMatch(stateInit, /\.get\("view"\) \|\|/u);
});

test("검사 중 화면은 읽기 한 경로만 쓰고 승인·완료·상태변경 호출이 없다", () => {
  assert.match(REVIEW_BLOCK, /request\("\/api\/reviews\/pending\?days=14&limit=50", \{ acceptedDomainStatuses: \[403, 404\] \}\)/u);
  const fetchedPaths = [...REVIEW_BLOCK.matchAll(/["'`](\/api\/[^"'`?]+)/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(fetchedPaths)], ["/api/reviews/pending"]);
  for (const forbidden of ["post(", "postJsonWithTimeout(", "/api/proposals/approve", "/api/proposals/reject", "/api/items/status", "/api/items/assign", "method: \"POST\"", "method: \"PUT\""]) {
    assert.equal(REVIEW_BLOCK.includes(forbidden), false, `review view must not contain ${forbidden}`);
  }
  // 수락은 기존 사람용 화면으로만 보낸다.
  assert.match(REVIEW_BLOCK, /state\.view = "mod:proposals"; render\(\);/u);
  assert.match(REVIEW_BLOCK, /openItemQuickEdit\(tr\.dataset\.item, tr\.dataset\.proj, tr\.dataset\.title\)/u);
});

test("플래그 OFF(404)·관리자 아님(403)은 연결 오류가 아니라 안내 문구로 렌더한다", () => {
  assert.match(REVIEW_BLOCK, /if \(res\.status === 404\) return \{ state: "flag_off" \};/u);
  assert.match(REVIEW_BLOCK, /if \(res\.status === 403\) return \{ state: "admin_only" \};/u);
  assert.match(REVIEW_BLOCK, /review_pending_flag_off/u);
  assert.match(REVIEW_BLOCK, /review_pending_admin_only/u);
});

test("제출됨·미수락 판정은 할 일 상태 done/archived 기준이고 본인 제출은 표시로 구분한다", () => {
  const helpers = Function(`${sourceSlice("const REVIEW_ACCEPTED_STATUSES", "async function loadPendingReviews")}\nreturn { reviewSessionAccepted };`)();
  assert.equal(helpers.reviewSessionAccepted({ item_status: "done" }), true);
  assert.equal(helpers.reviewSessionAccepted({ item_status: "archived" }), true);
  for (const status of ["open", "doing", "waiting", "blocked", null, undefined]) {
    assert.equal(helpers.reviewSessionAccepted({ item_status: status }), false, String(status));
  }
  assert.match(REVIEW_BLOCK, /const self = !!me && s\.username === me;/u);
  assert.match(REVIEW_BLOCK, /review_pending_self/u);
});

test("본인 제출 행은 할 일 열기 버튼이 비활성화되고 표시 수준일 뿐임을 주석이 밝힌다(m3)", () => {
  assert.match(REVIEW_BLOCK, /<button class="fav-chip review-open-item"\$\{self \? ` disabled title="\$\{esc\(L\.review_pending_self/u);
  assert.match(APP_SOURCE, /표시 수준일 뿐이다 — 실제 강제는 writer 측 규칙으로 후속 작업이다/u);
});

test("4192 딥링크(?view=mod:reviews) 는 적용 뒤 history.replaceState 로 주소창에서 지운다(m12)", () => {
  assert.match(APP_SOURCE, /if \(new URLSearchParams\(location\.search\)\.get\("view"\) === "mod:reviews"\) \{\s*\n\s*try \{ history\.replaceState\(null, "", location\.pathname \+ location\.hash\); \} catch \{ \/\* noop \*\/ \}\s*\n\s*\}/u);
  // 이 정리 코드는 state.view 가 딥링크로 이미 "mod:reviews" 를 읽어 들인 뒤(state 객체 닫힘 이후)에 온다.
  const stateCloseIndex = APP_SOURCE.indexOf("\n};", APP_SOURCE.indexOf("const state = {"));
  const replaceStateIndex = APP_SOURCE.indexOf("history.replaceState(null,");
  assert.ok(stateCloseIndex > 0 && replaceStateIndex > stateCloseIndex, "replaceState must run after state.view is read from the deep link");
});

test("두 모드 사전에 검사 중 라벨이 있고 플래그 안내는 켜는 주체를 명시한다", () => {
  for (const key of ["review_pending_title", "review_pending_hint", "review_pending_flag_off", "review_pending_admin_only", "review_pending_self", "review_pending_open_item", "review_pending_open_proposals"]) {
    assert.equal(LEXICON_SOURCE.split(`${key}:`).length - 1, 2, `${key} must exist in business and fantasy`);
  }
  assert.match(LEXICON_SOURCE, /review_pending_flag_off: "[^"]*DEV_ERP_MCP_REVIEW_READ=1[^"]*Owner\/cutover 세션이 켭니다/u);
});
