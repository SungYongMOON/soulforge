import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// external review 2026-09-05, key EXT-08 (unguarded localStorage JSON.parse) repro:
// app.js 최상위 `const state = {...}` 초기화는 여러 개의
// `JSON.parse(localStorage.getItem(...) || fallback)` 를 try/catch 없이 바로 평가한다.
// app.js 는 <script type="module"> 로 로드되므로(static/index.html), 이 초기화 문 중
// 하나라도 throw 하면 모듈 평가 전체가 중단되어 화면이 완전히 뜨지 않는다(부팅 실패).
// 브라우저 없이: 실제 app.js 텍스트에서 해당 블록만 발췌해 모의 localStorage 로 실행한다.
const APP_SOURCE = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");

function sourceSlice(from, to) {
  const start = APP_SOURCE.indexOf(from);
  const end = APP_SOURCE.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source slice ${from} -> ${to}`);
  return APP_SOURCE.slice(start, end + to.length);
}

function makeLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

// 괄호 균형 기반 슬라이스: 시작 마커 뒤 첫 "{" 부터 depth 를 세어 그 짝이 되는 "}" 까지 자른다
// (문자열·템플릿 리터럴·라인 주석 내부의 중괄호는 무시하므로 그 안에 홑 중괄호가 있어도 안전
// 하다). 줄 수나 리터럴 "\n};" 문자열 매치가 아니라 실제 괄호 짝으로 끝을 잡으므로 블록 내부
// 코드가 base/HEAD 사이에 달라져도 항상 옳은 위치에서 자른다. 시작 마커 자체가 없으면(base
// 에는 safeLocalJSON 이 아예 없음) null 을 돌려준다 — 이건 에러가 아니라 "이 리비전엔 이
// 슬라이스가 없다"는 정상 신호다.
function sliceBalancedBlock(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return null;
  const openBrace = source.indexOf("{", start);
  assert.ok(openBrace >= 0, `no opening brace after marker: ${startMarker}`);
  let depth = 0;
  let stringChar = null;
  let i = openBrace;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (stringChar) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === stringChar) stringChar = null;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = (nl < 0 ? source.length : nl) - 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { stringChar = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) { i += 1; break; }
    }
  }
  assert.equal(depth, 0, `unbalanced braces while slicing from marker: ${startMarker}`);
  let end = i;
  if (source[end] === ";") end += 1;
  return source.slice(start, end);
}

// state 초기화는 safeLocalJSON 과 localStorage 만 있으면 평가 가능하다 — VERSION_FALLBACK 은
// 단순 참조 대입이라 값 자체는 이 테스트에 무관. safeLocalJSON 슬라이스는 이 리비전에 실제로
// 있을 때만 붙인다: base(이 fix 이전)에는 그 함수가 아예 없고, state 슬라이스는 원문 그대로
// (그때는 순수 JSON.parse 호출) 평가되어 손상값에 실제로 throw 해야 결함 재현이 된다. 리터럴
// 함수명으로 슬라이스 존재 자체를 요구하면 base 에서 "헬퍼 부재"라는 엉뚱한 사유로 실패한다.
function loadState(localStorage, { warn = () => {} } = {}) {
  const helperSource = sliceBalancedBlock(APP_SOURCE, "function safeLocalJSON(key, fallback") ?? "";
  const stateSource = sliceBalancedBlock(APP_SOURCE, "const state = {");
  assert.ok(stateSource, "source slice: const state = {...}; not found");
  const fn = new Function(
    "localStorage", "VERSION_FALLBACK", "console",
    `${helperSource}\n${stateSource}\nreturn state;`,
  );
  return fn(localStorage, {}, { warn });
}

const CORRUPT_CASES = [
  ["dev_erp_navfold", "not json {{{", "malformed JSON"],
  ["dev_erp_navfold", "42", "valid JSON but non-iterable (wrong type for new Set())"],
  ["dev_erp_pins", "not json [[[", "malformed JSON"],
  ["dev_erp_pins", "\"a string\"", "valid JSON but wrong type (not an array)"],
  ["dev_erp_chat_dock", "{not valid", "malformed JSON"],
  ["dev_erp_chat_dock", "[1,2,3]", "valid JSON but wrong type (array, not a plain object)"],
  ["dev_erp_task_codex_dock", "{not valid", "malformed JSON"],
  ["dev_erp_task_codex_options", "undefined", "malformed JSON (bare word)"],
];

test("corrupted per-key localStorage values no longer crash app.js boot (external review 2026-09-05, key EXT-08)", () => {
  for (const [key, value, label] of CORRUPT_CASES) {
    const warnings = [];
    const state = loadState(makeLocalStorage({ [key]: value }), { warn: (...args) => warnings.push(args) });
    assert.ok(state && typeof state === "object", `${key}=${value} (${label}) must still produce a usable state object`);
    assert.ok(warnings.length >= 1, `${key}=${value} (${label}) logs at least one fallback warning instead of throwing`);
  }
});

test("corrupted values fall back to the correct empty default per key, not just \"no throw\"", () => {
  assert.deepEqual([...loadState(makeLocalStorage({ dev_erp_navfold: "{{{" })).navFold], []);
  assert.deepEqual([...loadState(makeLocalStorage({ dev_erp_navfold: "42" })).navFold], []);
  assert.deepEqual(loadState(makeLocalStorage({ dev_erp_pins: "[[[" })).pins, []);
  assert.deepEqual(loadState(makeLocalStorage({ dev_erp_pins: "\"x\"" })).pins, []);
  assert.deepEqual(loadState(makeLocalStorage({ dev_erp_chat_dock: "{bad" })).chatDock, {});
  assert.deepEqual(loadState(makeLocalStorage({ dev_erp_chat_dock: "[1]" })).chatDock, {});
  assert.deepEqual(loadState(makeLocalStorage({ dev_erp_task_codex_dock: "{bad" })).taskCodexDock, {});
  assert.deepEqual(loadState(makeLocalStorage({ dev_erp_task_codex_options: "nope" })).taskCodexOptions, {});
});

test("clean/absent localStorage keeps existing defaults exactly (no behavior change on the happy path)", () => {
  const state = loadState(makeLocalStorage({}));
  assert.deepEqual([...state.navFold], []);
  assert.deepEqual(state.pins, []);
  assert.deepEqual(state.chatDock, {});
  assert.deepEqual(state.taskCodexDock, {});
  assert.deepEqual(state.taskCodexOptions, {});

  const preset = loadState(makeLocalStorage({
    dev_erp_navfold: JSON.stringify(["a", "b"]),
    dev_erp_pins: JSON.stringify(["view:items"]),
    dev_erp_chat_dock: JSON.stringify({ x: 10 }),
  }));
  assert.deepEqual([...preset.navFold], ["a", "b"]);
  assert.deepEqual(preset.pins, ["view:items"]);
  assert.deepEqual(preset.chatDock, { x: 10 });
});

test("the dashLayout() saved-layout read (external review 2026-09-05, key EXT-08; formerly line ~1930) no longer throws on malformed JSON", () => {
  const helperSource = sourceSlice("function safeLocalJSON(key, fallback", "\n}");
  const readSource = sourceSlice('const saved = safeLocalJSON("dev_erp_widgets"', ");");
  const run = (localStorage) => new Function(
    "localStorage",
    `${helperSource}\n${readSource}\nreturn saved;`,
  )(localStorage);

  assert.equal(run(makeLocalStorage({})), null, "absent key falls back to null (existing default branch)");
  assert.equal(run(makeLocalStorage({ dev_erp_widgets: "{{{ not json" })), null, "malformed JSON no longer throws — falls back to null");
  assert.equal(run(makeLocalStorage({ dev_erp_widgets: "42" })), null, "non-array valid JSON also falls back to null (matches the existing Array.isArray guard downstream)");
  assert.deepEqual(run(makeLocalStorage({ dev_erp_widgets: JSON.stringify([{ id: "mine", x: 0, y: 0, w: 1, h: 1 }]) })),
    [{ id: "mine", x: 0, y: 0, w: 1, h: 1 }], "a well-formed saved layout still passes through unchanged");
});

test("the four call sites that already had try/catch before this fix are unchanged (restoreChatLog, savedSlots, taskCodexSeenStore)", () => {
  // 회귀 방지: 이 네 곳은 이미 보호돼 있었다 — 이번 fix 의 대상이 아니며 동작이 바뀌면 안 된다.
  const restoreChatLogSrc = sourceSlice("function restoreChatLog() {", "\n}");
  assert.match(restoreChatLogSrc, /try\s*\{/, "restoreChatLog already wraps JSON.parse in try/catch");
  const savedSlotsSrc = sourceSlice("function savedSlots() {", "\n}");
  assert.match(savedSlotsSrc, /try\s*\{\s*a\s*=\s*JSON\.parse/, "savedSlots already wraps its primary JSON.parse in try/catch");
  const taskCodexSeenStoreSrc = sourceSlice("function taskCodexSeenStore() {", "\n}");
  assert.match(taskCodexSeenStoreSrc, /try\s*\{/, "taskCodexSeenStore already wraps JSON.parse in try/catch");
});
