import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_PATH = join(SRC_ROOT, "App.tsx");
const CSS_PATH = join(SRC_ROOT, "team-ops.css");
const HARNESS_PATH = join(SRC_ROOT, "core", "hermes-bot-harness.mjs");

test("Hermes Bot 패널은 P1 동결 계약 어댑터를 owner 표면에 연결한다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /import \{ projectHermesBotsSnapshot \} from "\.\/core\/hermes-bots-adapter\.mjs";/u);
  assert.match(source, /function HermesBotPanel/u);
  assert.match(source, /surface === "owner" && <HermesBotPanel/u);
  assert.match(source, /data-testid="hermes-bot-panel"/u);
  assert.match(source, /usePersistentPanelCollapse\("owner\.hermes_bots"\)/u);
});

test("첫 화면 카드는 식별 로스터 3개뿐이며 관측되지 않은 상태를 만들지 않는다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const rosterMatch = source.match(/const HERMES_BOT_IDENTITY_ROSTER = Object\.freeze\(\{([\s\S]*?)\n\}\);/u);
  assert.ok(rosterMatch, "HERMES_BOT_IDENTITY_ROSTER 상수가 있어야 한다");
  const rosterBlock = rosterMatch[1];
  for (const name of ["제품 총괄", "Ox 제작자", "Ox 검토자"]) {
    assert.match(rosterBlock, new RegExp(`\\{ botName: "${name}" \\}`, "u"));
  }
  // 로스터는 식별 메타데이터만 운반한다. 상태·사용량·본문 계열 필드가 없어야 한다.
  for (const forbidden of ["state:", "directUsage", "lastHeartbeatAtMs", "resultStatus", "openTargetSessionId", "promptText", "reasoning", "transcript", "system_prompt", "content"]) {
    assert.equal(rosterBlock.includes(forbidden), false, `roster must not carry ${forbidden}`);
  }
});

test("카드는 상태·Goal·stage·model/provider·heartbeat·usage·result를 한국어로 표시한다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /import \{ formatUsage as formatHermesBotUsage, formatHeartbeat as formatHermesBotHeartbeat \} from "\.\/core\/hermes-bot-harness\.mjs";/u);
  assert.match(source, /\{row\.stateLabel \?\? "보류\(HOLD\)"\}/u);
  for (const label of ["목표", "단계", "모델", "공급자", "결과"]) {
    assert.match(source, new RegExp(`<dt>${label}</dt>`, "u"));
  }
  assert.match(source, /formatHermesBotUsage\(row\.usage\)/u);
  assert.match(source, /formatHermesBotHeartbeat\(row\.heartbeat\)/u);
  assert.match(source, /결과 확인 가능/u);
  assert.match(source, /결과 없음/u);
  assert.match(source, /결과 알 수 없음/u);
  assert.match(source, /표시 보류/u);
});

test("hermes://open은 지원될 때만 Desktop action이고 모바일에서는 미지원을 정직하게 표시한다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /row\.open\.supported/u);
  assert.match(source, /Desktop에서 대화 열기/u);
  assert.match(source, /열기 경로 없음/u);
  assert.match(source, /모바일에서는 열기 미지원/u);
  // 세션 id는 계약이 검증한 값만 쓴다. App에 literal deep link를 만들지 않는다.
  assert.equal(source.includes('href="hermes://'), false);
  // ≤390px에서는 Desktop 링크를 숨기고 미지원 문구만 남긴다(콘텐츠 보존 규칙은 base css 소유).
  const mobileBlock = css.match(/@media \(max-width: 390px\) \{([\s\S]*?)\n\}/u);
  assert.ok(mobileBlock, "390px 미디어 쿼리 블록이 있어야 한다");
  assert.match(mobileBlock[1], /\.hermes-bot-open-actions \.hermes-bot-open \{ display: none; \}/u);
  assert.match(mobileBlock[1], /\.hermes-bot-open-actions \.hermes-bot-open-mobile-note \{ display: inline; \}/u);
});

test("390px에서 카드 격자는 단일 열이고 포커스 가능성을 유지한다", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.hermes-bot-grid \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(280px, 1fr\)\)/u);
  assert.match(css, /\.hermes-bot-open:focus-visible/u);
  const mobileBlock = css.match(/@media \(max-width: 390px\) \{([\s\S]*?)\n\}/u);
  assert.match(mobileBlock[1], /\.hermes-bot-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/u);
});

test("Board는 P1 harness의 한국어 포맷터를 재사용하고 raw 필드를 읽지 않는다", () => {
  const harnessSource = readFileSync(HARNESS_PATH, "utf8");
  const appSource = readFileSync(APP_PATH, "utf8");
  assert.match(harnessSource, /export function formatUsage/u);
  assert.match(harnessSource, /export function formatHeartbeat/u);
  for (const banned of ["promptText", "system_prompt"]) {
    assert.equal(appSource.includes(banned), false, `App must not reference ${banned}`);
  }
});
