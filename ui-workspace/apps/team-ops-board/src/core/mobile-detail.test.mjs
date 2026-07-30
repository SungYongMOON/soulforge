import test from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_DETAIL_MAX_WIDTH,
  MOBILE_DETAIL_MEDIA_QUERY,
  isFocusRestoreCandidate,
  isMobileDetailViewport,
  pickFocusRestoreIndex,
  resolveMobileDialogKey
} from "./mobile-detail.mjs";

test("mobile detail: CSS breakpoint와 dialog 결정 경계가 760px로 고정된다", () => {
  assert.equal(MOBILE_DETAIL_MAX_WIDTH, 760);
  assert.equal(MOBILE_DETAIL_MEDIA_QUERY, "(max-width: 760px)");
  assert.equal(isMobileDetailViewport(390), true);
  assert.equal(isMobileDetailViewport(760), true);
  assert.equal(isMobileDetailViewport(761), false);
  assert.equal(isMobileDetailViewport(1024), false);
});

test("mobile detail: Tab과 Shift+Tab은 dialog 경계에서 순환한다", () => {
  assert.deepEqual(
    resolveMobileDialogKey({ key: "Tab", activeIndex: 2, focusableCount: 3 }),
    { action: "focus", index: 0 }
  );
  assert.deepEqual(
    resolveMobileDialogKey({ key: "Tab", shiftKey: true, activeIndex: 0, focusableCount: 3 }),
    { action: "focus", index: 2 }
  );
  assert.deepEqual(
    resolveMobileDialogKey({ key: "Tab", activeIndex: 1, focusableCount: 3 }),
    { action: "native" }
  );
  assert.deepEqual(
    resolveMobileDialogKey({ key: "Tab", activeIndex: -1, focusableCount: 3 }),
    { action: "focus", index: 0 }
  );
});

test("mobile detail: 단일 focus target 순환과 Escape 닫기가 결정적이다", () => {
  assert.deepEqual(
    resolveMobileDialogKey({ key: "Tab", activeIndex: 0, focusableCount: 1 }),
    { action: "focus", index: 0 }
  );
  assert.deepEqual(
    resolveMobileDialogKey({ key: "Tab", shiftKey: true, activeIndex: 0, focusableCount: 1 }),
    { action: "focus", index: 0 }
  );
  assert.deepEqual(
    resolveMobileDialogKey({ key: "Escape", activeIndex: 0, focusableCount: 1 }),
    { action: "close" }
  );
});

test("mobile detail: detached trigger와 비활성 target은 focus 복원 후보가 아니다", () => {
  assert.equal(
    isFocusRestoreCandidate({ exists: true, isConnected: false }),
    false
  );
  assert.equal(
    isFocusRestoreCandidate({ exists: true, isConnected: true, disabled: true }),
    false
  );
  assert.equal(
    isFocusRestoreCandidate({ exists: true, isConnected: true, hidden: true }),
    false
  );
  assert.equal(
    isFocusRestoreCandidate({ exists: true, isConnected: true, inert: true }),
    false
  );
});

test("mobile detail: detached trigger 뒤 logical task와 stable control 순으로 복원한다", () => {
  assert.equal(
    pickFocusRestoreIndex([
      { exists: true, isConnected: false },
      { exists: true, isConnected: true },
      { exists: true, isConnected: true }
    ]),
    1
  );
  assert.equal(
    pickFocusRestoreIndex([
      { exists: false, isConnected: false },
      { exists: false, isConnected: false },
      { exists: true, isConnected: true }
    ]),
    2
  );
  assert.equal(
    pickFocusRestoreIndex([
      { exists: true, isConnected: false },
      { exists: true, isConnected: true, hidden: true }
    ]),
    -1
  );
});
