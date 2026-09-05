import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// F08 repro: app.js 최상위 `const state = {...}` 초기화는 여러 개의
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

// state 초기화는 safeLocalJSON(정의는 이 슬라이스 앞부분에 포함) 과 localStorage 만 있으면
// 평가 가능하다 — VERSION_FALLBACK 은 단순 참조 대입이라 값 자체는 이 테스트에 무관.
function loadState(localStorage, { warn = () => {} } = {}) {
  const helperSource = sourceSlice("function safeLocalJSON(key, fallback", "\n}");
  const stateSource = sourceSlice("const state = {", "\n};");
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

test("corrupted per-key localStorage values no longer crash app.js boot (F08)", () => {
  for (const [key, value, label] of CORRUPT_CASES) {
    const warnings = [];
    const state = loadState(makeLocalStorage({ [key]: value }), { warn: (...args) => warnings.push(args) });
    assert.ok(state && typeof state === "object", `${key}=${value} (${label}) must still produce a usable state object`);
    assert.equal(warnings.length, 1, `${key}=${value} (${label}) logs exactly one fallback warning instead of throwing`);
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

test("the dashLayout() saved-layout read (F08, formerly line ~1930) no longer throws on malformed JSON", () => {
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
