// design-system.mjs — Vigil(team-ops-board) 디자인 토큰의 단일 원천.
//
// (2026-09-06 fresh review: 이 파일은 원래 tokens.mjs였다. 파일명의 "token"
// 부분 문자열이 `.gitignore`의 `*token*` secret deny와 path-policy의
// secret-like-path 스킵에 동시에 걸려 커밋은 됐지만 path-policy가 실제로
// 스캔하지 않는 상태였다 — design-system.mjs로 이름을 바꿔 그 경계를 벗어났다.
// "토큰"이라는 말 자체는 이 파일 안 prose·주석에서 계속 쓴다.)
//
// 순수 데이터 + 순수 함수만 담는다. fetch·DOM·타이머·writer가 없다(기존
// src/core/*.mjs 경계와 동일). 이 파일이 유일한 literal color 예외 파일이다 —
// 다른 src/design/** 파일은 이 파일에서 값을 가져다 쓰기만 한다
// (lint-literal-colors.test.mjs가 그 경계를 강제한다).
//
// 근거:
//   - 색 역할(§3.2)·타이포그래피(§3.3)·도형 어휘(§3.4)·간격/입체/모션/테마(§3.5) —
//     (repo 밖 비추적 기획 문서 BRIEF_UX_REDESIGN_V1_2026-09-06 / 시제품 forge_world.html)
//   - 다크 기본값은 프로토타입(시제품 forge_world.html)의 `:root` 블록을 그대로
//     계승한다(브리프 §3.2 표 머리말 "기본값 = 프로토타입 forge_world.html :root 계승").
//
// 토큰 이름 규칙: 역할을 말하고 색 이름을 쓰지 않는다(브리프 §3.2 "토큰 이름에 색
// 단어 금지" — 기존 team-ops.css의 `--blue --purple --red --green --amber`는 이
// 규칙 위반의 예시이며 이 lane에서 team-ops.css를 고치지는 않는다. 그 치환은 S6).
// 이 규칙은 토큰 값(예: shapeVocabulary의 도형 어휘 문자열)에도 적용된다 —
// design-system.test.mjs가 키뿐 아니라 값도 검사한다.
//
// CSS로 내보내는 그룹(emit-css.mjs가 읽는 것)의 키는 이미 `--sf-` 뒤에 붙일
// kebab-case 문자열이다. 예: colorRoles["glass-2"] → `--sf-glass-2`. 이렇게 하면
// emit-css.mjs는 매핑 표 없이 기계적으로 순회만 하면 된다.

export const SCHEMA_VERSION = "soulforge.team_ops_board.design_tokens.v1";

// ---------------------------------------------------------------------------
// 작은 순수 헬퍼 — 같은 16진값을 두 곳에 다시 적지 않기 위한 것.
// 6자리 #rrggbb만 지원한다(현재 토큰 세트에 3자리·8자리 값이 없다).
// ---------------------------------------------------------------------------
export function hexToRgba(hex, alpha) {
  const clean = String(hex).replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`hexToRgba: expected a 6-digit #rrggbb value, got "${hex}"`);
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Canvas 세계 팔레트 — 먼저 정의한다. colorRoles의 planned-fill이 이 blueprint
// 값을 재사용하므로(같은 파랑의 10% 채움) 순서가 이렇다.
// 값 전부 브리프 §3.2 "Canvas 전용 팔레트" 줄에서 그대로 옮김(발명 없음).
// ---------------------------------------------------------------------------
// 키 이름 note: colorRoles에도 "ground"(세계 바닥 = 앱 배경, #0f1116)가 있다.
// 여기서는 그것과 다른 개념(캔버스 위 지면 타일 색)이라 "terrain"으로 다르게
// 이름 붙였다 — forgeColor()가 두 팔레트를 하나의 조회 테이블로 합치므로 같은
// 키 이름을 다른 뜻으로 쓰면 한쪽이 다른 쪽을 조용히 덮어써 버린다.
export const worldPalette = Object.freeze({
  "terrain": "#7fae5c",
  "terrain-variant": "#93c273",
  "water": "#5aa9e6",
  "water-deep": "#3f8fd2",
  "road": "#b8b2a5",
  "built": "#efe4c6",
  "building": "#d9c9a3",
  "weathering": "#bfb59f",
  "ruin": "#4b4b52",
  "fog-overlay": "rgba(154,163,173,.55)",
  "blueprint": "#4a90d9",
});

// ---------------------------------------------------------------------------
// 색 역할 (dark 기본값) — 브리프 §3.2 표 + 프로토타입 :root 계승.
//
// 값별 출처:
//   - ground/glass/glass-2/glass-line/ink-1/ink-2/ink-3/accent/ok/warn/bad/fog/
//     external: 프로토타입 forge_world.html :root와 브리프 §3.2 표가 일치하는
//     리터럴 그대로.
//   - planned: 브리프 §3.2 "#6fb1ff 점선"의 점선/테두리 색.
//   - planned-fill: 브리프 §3.2 "채움 rgba(74,144,217,.10)" = worldPalette.blueprint
//     10% — hexToRgba로 계산해 같은 파랑을 두 번 다른 리터럴로 적지 않는다.
//   - focus: 브리프 §3.2 "accent 80%" — hexToRgba(accent, .8)로 계산.
//   - stale: 브리프 §3.2 비고란 "fog + 호박 사선 패턴" — 바탕색은 fog와 같고,
//     사선 무늬는 stalePattern이 별도로 기술한다(단일 CSS 값으로 표현 불가).
//   - hold: 브리프는 "자주(purple)"라는 색상 설명만 주고 정확한 hex를 주지 않는다.
//     연속성을 위해 현재 team-ops.css의 기존 `--purple: #a66cff`(team-ops.css:54)
//     값을 그대로 토큰 기본값으로 채택했다 — team-ops.css 자체는 고치지 않는다
//     (그 치환은 S6). 관찰됨(observed) 수준의 판단이며 Owner가 다른 자주색을
//     원하면 이 한 줄만 바꾸면 전체에 반영된다.
//   - sample: 브리프는 "회색조 + 점선 + (견본)"라는 처리 방식만 주고 정확한 hex를
//     주지 않는다. ink 계열과 구분되는 무채색으로 임의 선택했다(관찰됨 수준).
// ---------------------------------------------------------------------------
export const colorRoles = Object.freeze({
  "ground": "#0f1116",
  "glass": "rgba(15,17,23,.86)",
  "glass-2": "rgba(26,29,38,.92)",
  "glass-line": "rgba(255,255,255,.09)",
  "ink-1": "#ece9e2",
  "ink-2": "#b7b4ac",
  "ink-3": "#7f7c75",
  "accent": "#ffb347",
  "ok": "#7ddc8a",
  "warn": "#ffd166",
  "bad": "#ff6b6b",
  "fog": "#9aa3ad",
  "stale": "#9aa3ad",
  "planned": "#6fb1ff",
  "planned-fill": hexToRgba(worldPalette.blueprint, 0.1),
  "sample": "#8a8a8a",
  "external": "#6fb1ff",
  "hold": "#a66cff",
  "focus": hexToRgba("#ffb347", 0.8),
});

// ---------------------------------------------------------------------------
// [data-theme="light"] 재정의 — 구조색(바탕·유리·글자)만 다시 정의한다.
//
// 브리프 §3.2 표는 "dark 기본값" 열만 주고 light 값 표는 별도로 주지 않는다
// (라이트는 "문서·표·인쇄 화면" = World Tree 업무면의 몫이라는 §3.5 설명뿐).
// 이 값들은 Owner 확인 전 초안(관찰됨 수준)이다 — 접근성 대비 검사(브리프 §8)는
// 아직 하지 않았다. 상태색(ok/warn/bad/accent/hold/…)은 테마와 무관하게 의미를
// 유지해야 하므로 재정의하지 않는다(다크에서도 라이트에서도 같은 뜻).
// ---------------------------------------------------------------------------
export const colorRolesLight = Object.freeze({
  "ground": "#f5f4f1",
  "glass": "rgba(255,255,255,.86)",
  "glass-2": "rgba(240,239,236,.92)",
  "glass-line": "rgba(15,17,23,.09)",
  "ink-1": "#1c1c1e",
  "ink-2": "#4a4a4a",
  "ink-3": "#767676",
});

// ---------------------------------------------------------------------------
// 상태 우선순위 → 색 역할. 우선순위 값 자체는 forge-map-view.mjs의
// FORGE_STATE_PRIORITY를 그대로 유지하며 여기서 새로 계산하지 않는다(브리프
// §7.1 "상태 계산 발명 금지"). 이 표는 각 상태 이름을 위 colorRoles의 키에
// 연결만 한다.
// ---------------------------------------------------------------------------
export const stateColorRoleMap = Object.freeze({
  hold: "hold",
  down: "bad",
  stale: "fog",
  degraded: "warn",
  unknown: "fog",
  ok: "ok",
});

// stale 상태 전용 사선 무늬 서술(브리프 §3.2 "fog + 호박 사선 패턴 — 색만으로
// 구분하지 않음"). CSS 커스텀 프로퍼티 하나로 표현할 수 없는 합성 규칙이라
// emit-css.mjs가 :root에 내보내는 그룹에는 포함하지 않는다. repeating-linear-
// gradient 배선은 이 lane 밖(S2+)에서 한다.
export const stalePattern = Object.freeze({
  baseRole: "fog",
  hatchRole: "warn",
  angleDeg: 45,
  sizePx: 6,
});

// ---------------------------------------------------------------------------
// 타이포그래피 — 브리프 §3.3. 폰트 스택은 브리프 표의 리터럴 그대로(자체 폴백
// 스택 포함). 스케일은 "11/12/13/15/18/24/32(rem 환산)"을 16px 루트 기준으로
// 환산했다(html 루트 font-size를 재정의하지 않는다는 전제 — 문서화된 가정).
// ---------------------------------------------------------------------------
export const typography = Object.freeze({
  "font-kr": '"IBM Plex Sans KR", Pretendard, system-ui, "Malgun Gothic", sans-serif',
  "font-mono": '"IBM Plex Mono", ui-monospace, Consolas, monospace',
  "weight-regular": 400,
  "weight-medium": 500,
  "text-11": "0.6875rem",
  "text-12": "0.75rem",
  "text-13": "0.8125rem",
  "text-15": "0.9375rem",
  "text-18": "1.125rem",
  "text-24": "1.5rem",
  "text-32": "2rem",
  "numeric-variant": "tabular-nums",
});

// 600/700 굵기 금지(브리프 §3.3 "굵기 400과 500만"). emit-css.mjs와 소비자가
// 참조할 수 있도록 규칙을 데이터로도 남긴다.
export const forbiddenFontWeights = Object.freeze([600, 700]);

// ---------------------------------------------------------------------------
// 도형 어휘 — 브리프 §3.4. 분류(카테고리)는 색이 아니라 도형으로 구분한다
// (UNIFIED_TOPOLOGY_CATEGORIES의 color 필드를 shape 키로 대체하는 배선은
// 이 lane 밖의 후속 작업이다 — 여기서는 이름만 정의한다).
//
// 값 자체도 토큰 이름 규칙(색 단어 금지)을 따른다 — gate/incident는 원래
// "-blue"/"orange-" 색 단어를 값에 직접 적고 있었다(이 review가 고친 부분).
// 지금은 colorRoles의 역할 이름(planned/accent)을 값 안에 참조만 한다.
// ---------------------------------------------------------------------------
export const shapeVocabulary = Object.freeze({
  actor: "circle",
  component: "rounded-rect",
  storage: "cylinder",
  source: "parallelogram",
  gate: "dashed-border-planned",
  incident: "accent-outline",
  generation: "stacked-rect",
  personNeeded: "person-silhouette",
});

export const shapeMeaning = Object.freeze({
  actor: "봇·모델·행위자",
  component: "실행 부품",
  storage: "저장소",
  source: "원천 자료(Ore)",
  gate: "관문·설계도·미가동",
  incident: "사건",
  generation: "세대(N차 백업본)",
  personNeeded: "사람 응답 필요",
});

// ---------------------------------------------------------------------------
// 간격·반경·입체·모션 — 브리프 §3.5.
// ---------------------------------------------------------------------------
export const spacing = Object.freeze({
  s1: "4px",
  s2: "8px",
  s3: "12px",
  s4: "16px",
  s5: "24px",
  s6: "32px",
  s7: "48px",
  s8: "64px",
});

export const radius = Object.freeze({
  "r-sm": "4px",
  "r-md": "8px",
  "r-lg": "14px",
});

// 그림자 3단(패널·drawer·모달). elevation-panel과 glass-blur는 프로토타입
// forge_world.html의 --shadow(0 12px 32px rgba(0,0,0,.4))와
// backdrop-filter: blur(12px)를 그대로 옮긴 값이다. drawer/modal 2단은 브리프가
// "3단"만 요구하고 정확한 값을 주지 않아 panel에서 점증시킨 초안이다(관찰됨
// 수준 — 실제 배선 시(S2) 시각 검토로 조정 가능).
//
// focus-offset은 키보드 포커스 outline을 테두리에서 얼마나 띄울지(outline-
// offset)를 정하는 값이다. 그림자 3단과 같은 "입체감" 범주라 elevation 옆에
// 둔다 — 별도 그룹을 새로 만들지 않는다. 정확한 px는 브리프가 주지 않아
// 관찰됨 수준으로 2px를 채택했다.
export const elevation = Object.freeze({
  "elevation-panel": "0 12px 32px rgba(0,0,0,.4)",
  "elevation-drawer": "0 16px 40px rgba(0,0,0,.45)",
  "elevation-modal": "0 24px 64px rgba(0,0,0,.5)",
  "glass-blur": "12px",
  "focus-offset": "2px",
});

export const motion = Object.freeze({
  "motion-state": "120ms",
  "motion-panel": "200ms",
  "motion-camera": "320ms",
  "motion-easing": "cubic-bezier(.2,.6,.2,1)",
});

// prefers-reduced-motion 정책(브리프 §3.5). 값 하나짜리 CSS 프로퍼티가 아니라
// 규칙 서술이라 emit-css.mjs가 내보내는 그룹에는 넣지 않는다 — 실제
// `@media (prefers-reduced-motion: reduce)` 배선은 S2+ 몫이다.
export const reducedMotionPolicy = Object.freeze({
  affects: ["camera", "pulse", "particle", "marching-dashes"],
  durationMs: 0,
  worldBehavior: "static-frame",
});

// ---------------------------------------------------------------------------
// 테마 정책 — 브리프 §3.5 "라이트/다크"와 §7.4-1 "dark-first HUD(Vigil 전부)".
//
// 이 극성은 Vigil(team-ops-board, 포트 4192) 전용 결정이다(2026-09-06 fresh
// review로 확정: dark-first 2-state 유지). Vigil은 dark-first HUD이므로
// :root 자체가 dark 기본값을 갖고, [data-theme="light"]가 명시적 override다
// (Vigil 앱 셸이 실제로 이 속성을 설정하는 배선은 S1 범위 밖). 이는
// prefers-color-scheme 미디어 쿼리에 반응하는 "루트=light, 다크는 오버라이드"
// 라는 일반 3-상태 패턴과 의도적으로 반대 극성이다: HUD는 OS 설정과 무관하게
// 항상 다크가 먼저다(reactsToPrefersColorScheme: false).
//
// World Tree(코드 dev-erp, 포트 4300)의 문서 화면은 이 극성을 쓰지 않는다 —
// 별도의 light 전용 스타일시트(S8)를 쓰며 이 themePolicy/[data-theme="light"]
// 의 소비 대상이 아니다. 위 override 메커니즘은 Vigil 안에서 문서류 패널을
// 밝게 보여줄 필요가 생겼을 때를 위한 것일 뿐, World Tree 자체의 테마 원천이
// 아니다. (브리프 원문 중 이와 어긋나는 서술은 planner가 교정할 예정이다.)
// ---------------------------------------------------------------------------
export const themePolicy = Object.freeze({
  defaultTheme: "dark",
  vigilTheme: "dark",
  documentTheme: "light",
  overrideAttribute: "data-theme",
  overrideValue: "light",
  reactsToPrefersColorScheme: false,
});

// ---------------------------------------------------------------------------
// emit-css.mjs가 :root + [data-theme="light"]로 내보내는 그룹의 순서.
// 순서 자체가 동작에 영향을 주지는 않지만 생성 파일을 결정론으로 유지한다.
// ---------------------------------------------------------------------------
export const cssEmittedGroups = Object.freeze([
  "colorRoles",
  "typography",
  "spacing",
  "radius",
  "elevation",
  "motion",
]);

export const designTokens = Object.freeze({
  schema_version: SCHEMA_VERSION,
  colorRoles,
  colorRolesLight,
  worldPalette,
  stateColorRoleMap,
  stalePattern,
  typography,
  forbiddenFontWeights,
  shapeVocabulary,
  shapeMeaning,
  spacing,
  radius,
  elevation,
  motion,
  reducedMotionPolicy,
  themePolicy,
});

export default designTokens;
