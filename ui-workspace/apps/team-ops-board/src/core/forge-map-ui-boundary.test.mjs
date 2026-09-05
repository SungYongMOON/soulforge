import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_PATH = join(SRC_ROOT, "App.tsx");
const CSS_PATH = join(SRC_ROOT, "team-ops.css");
const VITE_CONFIG_PATH = join(dirname(SRC_ROOT), "vite.config.ts");

function appSource() {
  return readFileSync(APP_PATH, "utf8");
}

// 대장간 표면의 코드 블록만 잘라 낸다. 경계 주장은 이 범위 안에서만 검사한다.
function forgeSurfaceBlock(source) {
  const start = source.indexOf("const FORGE_MAP_POLL_INTERVAL_MS");
  assert.notEqual(start, -1, "forge surface block must exist");
  const end = source.indexOf("function SystemStatStrip(", start);
  assert.notEqual(end, -1, "forge surface block must sit right before SystemStatStrip");
  return source.slice(start, end);
}

test("대장간이 첫 탭이고 기본 진입 표면이다", () => {
  const source = appSource();
  assert.match(source, /type BoardSurface = "forge" \| "owner"/u);
  assert.match(source, /useState<BoardSurface>\("forge"\)/u);
  assert.match(source, /data-testid="forge-map-tab"/u);
  // 대장간 단추가 실시간 현황 단추보다 먼저 나온다.
  assert.equal(source.indexOf("forge-map-tab") < source.indexOf("owner-overview-tab"), true);
  assert.match(source, /surface === "forge" && \(\n\s+<ForgeMapSurface/u);
  assert.equal((source.match(/<ForgeMapSurface/gu) ?? []).length, 1, "표면은 한 번만 붙는다");
});

test("에이전트 조직도와 Codex 스레드 판은 첫 화면이 아니라 기존 탭에 그대로 남는다", () => {
  const source = appSource();
  assert.match(source, /surface === "organization" && \(\n\s+<OrganizationWorkspace/u);
  assert.match(source, /surface === "owner" && <HermesBotPanel/u);
  const block = forgeSurfaceBlock(source);
  for (const forbidden of ["OrganizationWorkspace", "HermesBotPanel", "RealtimeDashboard", "LiveThreadCard", "thread_id"]) {
    assert.equal(block.includes(forbidden), false, `첫 화면에 ${forbidden} 이 오면 안 된다`);
  }
});

test("표면은 순수 view-model 을 쓰고 상태 계산을 스스로 발명하지 않는다", () => {
  const source = appSource();
  assert.match(source, /import \{ FORGE_STATE_LABELS, buildForgeMapViewModel, clampForgeText, estimateForgeTextWidth \} from "\.\/core\/forge-map-view\.mjs";/u);
  const block = forgeSurfaceBlock(source);
  assert.match(block, /buildForgeMapViewModel\(\{ topology: topologyProjection, tongs, secureWork, scheduledTasks \}\)/u);
  // 토큰 합계와 호스트 자원은 기존 계산 함수를 그대로 쓴다.
  assert.match(block, /buildHostStatsViewModel\(hostStats\)/u);
  assert.match(block, /fleetTokenLabel\(windows\.calendar_day\?\.totals\?\.total_tokens\)/u);
  assert.match(block, /fleetTokenLabel\(windows\.calendar_week\?\.totals\?\.total_tokens\)/u);
  // fleetCreditValue 는 fleetCreditLabel 안의 같은 계산을 그대로 꺼내 쓰는
  // 값-only 헬퍼다(문자열 replace 로 접두사를 벗기던 자리를 대체) — 새 산식이
  // 아니라 기존 계산의 재노출이므로 이 자리에서 허용한다.
  assert.match(block, /fleetCreditValue\(/u);
  assert.match(block, /buildErpPendingReviewViewModel\(pendingReviews\)/u);
  assert.equal(block.includes("FLEET_TOKEN_PROVIDERS"), true, "제공자 목록도 기존 상수를 쓴다");
});

test("읽기 전용이다: 첫 화면에 writer 동사·자격증명·비GET 호출이 없다", () => {
  const block = forgeSurfaceBlock(appSource());
  for (const forbidden of [
    "method:", "POST", "PUT", "PATCH", "DELETE", "body:",
    "Authorization", "Bearer", "credential", "password", "secret",
    "approve", "restart", "repair", "execute", "localStorage", "sessionStorage",
  ]) {
    assert.equal(block.includes(forbidden), false, `읽기 전용 표면에 ${forbidden} 이 있으면 안 된다`);
  }
});

test("가져오는 것은 loopback 스냅샷 GET 다섯 개뿐이다", () => {
  const block = forgeSurfaceBlock(appSource());
  const paths = [...block.matchAll(/forgeFetchJson\("([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(paths, [
    "/tongs.snapshot.json",
    "/secure-work.snapshot.json",
    "/scheduled-tasks.snapshot.json",
    "/storage-map.snapshot.json",
    "/erp-pending-reviews.snapshot.json?read_only=1",
  ]);
  assert.equal((block.match(/fetch\(/gu) ?? []).length, 1, "fetch 는 공용 헬퍼 한 곳에서만 부른다");
  assert.match(block, /const FORGE_MAP_POLL_INTERVAL_MS = 60_000;/u);
  assert.match(block, /window\.setInterval\(\(\) => \{ void load\(\); \}, FORGE_MAP_POLL_INTERVAL_MS\)/u);
});

test("호스트 경로·명령행은 화면 문구에도 코드에도 없다", () => {
  const block = forgeSurfaceBlock(appSource());
  // path-policy: 검사 대상 문자열도 소스에 리터럴로 두지 않고 이어 붙인다.
  const sep = String.fromCharCode(92);
  const probes = [`C:${sep}`, `D:${sep}`, "/Users" + "/", "/mnt" + "/", "schtasks", "Task To Run", "guild_hall/state", "AppData"];
  for (const forbidden of probes) {
    assert.equal(block.includes(forbidden), false, `화면 코드에 ${forbidden} 이 있으면 안 된다`);
  }
  assert.match(block, /명령행과 경로는 이 화면에 오지 않으며/u);
});

test("증거 없음은 회색으로 남고 초록으로 올라가지 않는다는 것이 화면에 적혀 있다", () => {
  const block = forgeSurfaceBlock(appSource());
  assert.match(block, /회색은 “괜찮다”가 아니라 “이 화면이 아직 못 본다”입니다/u);
  assert.match(block, /“전부 정상”이라는 뜻은 아닙니다/u);
  assert.match(block, /미측정\(0이라는 뜻이 아닙니다\)/u);
  assert.match(block, /unknown 입니다/u);
});

test("상자 안 글자는 그리기 전에 잘려 옆 부품을 덮지 않는다", () => {
  const block = forgeSurfaceBlock(appSource());
  assert.match(block, /const textWidth = box\.width - 28;/u);
  assert.match(block, /clampForgeText\(component\.meaning, textWidth, 11\)/u);
  assert.match(block, /clampForgeText\(detail, textWidth, 10\.5\)/u);
  // 식별자는 자르는 대신, 안 들어가면 아예 그리지 않는다(전체 값은 inspector 에 있다).
  assert.match(block, /estimateForgeTextWidth\(component\.identifier, 10\) <= identifierWidth &&/u);
});

test("부품 상자는 키보드로 고를 수 있고 이름표를 갖는다", () => {
  const block = forgeSurfaceBlock(appSource());
  assert.match(block, /role="button"\n\s+tabIndex=\{0\}\n\s+aria-pressed=\{isSelected\}/u);
  assert.match(block, /aria-label=\{`\$\{component\.name\} · \$\{component\.stateLabel\} · \$\{detail\}`\}/u);
  assert.match(block, /if \(event\.key !== "Enter" && event\.key !== " "\) return;/u);
  assert.match(block, /aria-label="대장간 부품 지도/u);
  assert.match(block, /aria-live="polite"/u);
});

test("이동 단추는 기존 탭으로만 보내고 그 자리에서 무엇도 바꾸지 않는다", () => {
  const source = appSource();
  assert.match(source, /onOpenSystemSurface=\{\(\) => setSurface\("system"\)\}/u);
  const block = forgeSurfaceBlock(source);
  assert.match(block, /시스템 토폴로지에서 노드 보기/u);
  assert.equal(block.includes("<a "), false, "첫 화면은 바깥 링크를 열지 않는다");
});

test("스타일은 상태색·포커스·좁은 화면·밝은 테마를 모두 갖는다", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  for (const token of ["--forge-ok", "--forge-degraded", "--forge-stale", "--forge-down", "--forge-unknown", "--forge-hold"]) {
    assert.equal(css.includes(`${token}:`), true, `${token} 토큰이 있어야 한다`);
  }
  assert.match(css, /@media \(prefers-color-scheme: light\) \{\n {2}\.forge-surface \{/u);
  assert.match(css, /\.forge-node:focus-visible \.forge-node-box/u);
  assert.match(css, /\.forge-attention-list button:focus-visible/u);
  assert.match(css, /\.forge-inspector-link:focus-visible/u);
  assert.match(css, /\.forge-surface \{[^}]*font-variant-numeric: tabular-nums;/su);
  assert.match(css, /@media \(max-width: 390px\) \{\n {2}\.forge-headline \{ padding: 0\.7rem 0\.75rem; \}/u);
  // 넓은 표와 지도는 자기 안에서 가로 스크롤한다.
  assert.match(css, /\.forge-bellows-scroll \{ overflow-x: auto; \}/u);
  assert.match(css, /\.forge-map-figure \{[^}]*overflow-x: auto;/su);
});

test("vite 는 세 어댑터를 등록하고 상태 파일 경로는 state root 에서 파생한다", () => {
  const config = readFileSync(VITE_CONFIG_PATH, "utf8");
  assert.match(config, /import \{ createScheduledTasksAdapterPlugin \} from "\.\/src\/server\/scheduled-tasks-adapter\.mjs";/u);
  assert.match(config, /import \{ createSecureWorkStatusAdapterPlugin \} from "\.\/src\/server\/secure-work-status-adapter\.mjs";/u);
  assert.match(config, /import \{ createTongsHeartbeatAdapterPlugin \} from "\.\/src\/server\/tongs-heartbeat-adapter\.mjs";/u);
  assert.match(config, /createScheduledTasksAdapterPlugin\(\),/u);
  assert.match(config, /createSecureWorkStatusAdapterPlugin\(\{ statusPath: secureWorkStatusPath \}\)/u);
  assert.match(config, /createTongsHeartbeatAdapterPlugin\(\{ heartbeatPath: tongsHeartbeatPath \}\)/u);
  assert.match(config, /const secureWorkStatusPath = path\.join\(operationsRoot, "secure_work", "status\.json"\);/u);
  assert.match(config, /const tongsHeartbeatPath = path\.join\(operationsRoot, "tongs", "heartbeat\.json"\);/u);
});
