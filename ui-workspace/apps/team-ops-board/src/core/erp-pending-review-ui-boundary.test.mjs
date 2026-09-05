import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_PATH = join(SRC_ROOT, "App.tsx");
const CSS_PATH = join(SRC_ROOT, "team-ops.css");
const VITE_CONFIG_PATH = join(dirname(SRC_ROOT), "vite.config.ts");

function panelBlock(source) {
  const block = source.match(/function ErpPendingReviewPanel\(\) \{([\s\S]*?)\n\}\n\nfunction LiveProjectionState/u);
  assert.ok(block, "ErpPendingReviewPanel must be defined right before LiveProjectionState");
  return block[1];
}

test("ERP 승인 대기 패널은 owner 표면에만 붙고 읽기 전용 projection 하나만 가져온다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /import \{ buildErpPendingReviewViewModel \} from "\.\/core\/erp-pending-review-view\.mjs";/u);
  assert.match(source, /surface === "owner" && <ErpPendingReviewPanel/u);
  assert.equal((source.match(/<ErpPendingReviewPanel/gu) ?? []).length, 1, "the panel mounts once, on the owner surface only");
  assert.match(source, /data-testid="erp-pending-review-panel"/u);
  assert.match(source, /usePersistentPanelCollapse\("owner\.erp_pending_reviews"\)/u);
  const block = panelBlock(source);
  assert.match(block, /fetch\("\/erp-pending-reviews\.snapshot\.json\?read_only=1", \{ cache: "no-store", signal: controller\.signal \}\)/u);
  assert.equal((block.match(/fetch\(/gu) ?? []).length, 1);
  assert.match(block, /catch \{[\s\S]*?setErpReviewSnapshot\(null\)/u);
  assert.match(block, /buildErpPendingReviewViewModel\(erpReviewSnapshot\)/u);
});

test("패널은 어떤 쓰기도 하지 않는다: POST·승인·완료·상태변경 호출과 ERP API 직접 호출이 없다", () => {
  const block = panelBlock(readFileSync(APP_PATH, "utf8"));
  for (const forbidden of ["method:", "POST", "PUT", "/api/", "approve", "reject", "status:", "Authorization", "Bearer", "token", "credential"]) {
    assert.equal(block.includes(forbidden), false, `panel must not contain ${forbidden}`);
  }
  // "done" appears only in the human-facing sentence, never as a status value the panel could set.
  assert.equal((block.match(/done/gu) ?? []).length, 1);
  assert.match(block, /Linear done 도 사람이 누릅니다/u);
  // 원문(이름·제목·항목 ID·과제 ID)은 projection에 없고 패널도 읽지 않는다(M1: 건수·상태뿐).
  for (const forbidden of ["summary", "item_title", "itemTitle", "payload", "username", "item_id", "project_id", "proposal_id", "work_session_id", "model.proposals", "model.workSessions"]) {
    assert.equal(block.includes(forbidden), false, `panel must not read ${forbidden}`);
  }
  // 표(개별 항목 목록)는 이 패널에 없다 — 건수 집계뿐이다.
  assert.equal(block.includes("<table"), false, "the Board panel must render counts only, no per-row table");
});

test("링크는 view model 이 검증한 loopback URL 만 쓰고 noopener·noreferrer 로 연다", () => {
  const block = panelBlock(readFileSync(APP_PATH, "utf8"));
  assert.match(block, /<a className="erp-review-open" href=\{model\.linkUrl\} target="_blank" rel="noopener noreferrer">ERP에서 검사 중 열기<\/a>/u);
  assert.equal(block.includes("href=\"http"), false, "no literal ERP URL in the App; the view model owns the safe link");
  assert.match(block, /Main Node 로컬 브라우저에서만 열립니다/u);
});

test("보류 상태는 사유 라벨과 코드를 그대로 보여 주고 영수증이 완료가 아님을 말한다", () => {
  const block = panelBlock(readFileSync(APP_PATH, "utf8"));
  assert.match(block, /읽기 보류: \{model\.holdLabel\} <code>\{model\.holdCode\}<\/code>/u);
  assert.match(block, /제출 영수증은 완료가 아닙니다/u);
  assert.match(block, /Linear done 도 사람이 누릅니다/u);
  assert.match(block, /검사 중인 제출·제안이 없습니다/u);
});

test("폴링은 5분 간격이고 새로 고침은 60초 캐시를 밝히는 명시 버튼이다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /const ERP_PENDING_REVIEW_POLL_INTERVAL_MS = 300_000;/u);
  const block = panelBlock(source);
  assert.match(block, /window\.setInterval\(\(\) => \{ void load\(\); \}, ERP_PENDING_REVIEW_POLL_INTERVAL_MS\)/u);
  assert.match(block, /className="erp-review-refresh"/u);
  // m5: 버튼은 60초 캐시를 그대로 돌려준다는 사실을 문구로 밝힌다(캐시 우회를 구현하는 대신).
  assert.match(block, /다시 읽기 \(최대 60초 캐시\)/u);
});

test("스타일은 포커스 가시성을 갖고 390px 에서도 패널 여백을 유지한다(표는 없다)", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.erp-review-open:focus-visible/u);
  assert.match(css, /\.erp-review-refresh:focus-visible/u);
  assert.match(css, /@media \(max-width: 390px\) \{\n  \.erp-review-surface \{ padding: 0\.75rem; \}/u);
  assert.equal(css.includes(".erp-review-table"), false, "no per-row table styling remains once the panel is counts-only (M1)");
});

test("vite 는 환경 기반 어댑터를 등록하고 값 없이도 링크만 모드로 뜬다", () => {
  const config = readFileSync(VITE_CONFIG_PATH, "utf8");
  assert.match(config, /import \{ createErpPendingReviewAdapterPluginFromEnvironment \} from "\.\/src\/server\/erp-pending-review-adapter\.mjs";/u);
  assert.match(config, /createErpPendingReviewAdapterPluginFromEnvironment\(\),/u);
});
