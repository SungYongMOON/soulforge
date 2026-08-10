import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");
const CSS_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "team-ops.css");

test("normal Board UI is wired to the live exact-ID projection, not synthetic inbox data", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /liveThreadProjectionRequest/u);
  assert.match(source, /selectLiveThreadView/u);
  for (const forbidden of ["owner-inbox", "buildOwnerInboxFixture", "provider-visual", "fixtureMode", "synthetic"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not drive the normal UI`);
  }
});

test("normal Board UI uses the safe owner display label for card and detail titles", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /<strong>\{thread\.display_label\}<\/strong>/u);
  assert.match(source, /<h2 id="live-thread-detail-title">\{thread\.display_label\}<\/h2>/u);
  assert.match(source, /live-card-secondary/u);
  assert.equal(source.includes("thread.name"), false);
  assert.equal(source.includes("thread.title"), false);
});

test("Owner, organization, and work/history surfaces are explicit and raw idle never becomes Owner attention", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /data-testid="owner-overview-tab"/u);
  assert.match(source, /data-testid="organization-tree-tab"/u);
  assert.match(source, /data-testid="work-history-tab"/u);
  assert.match(source, /<OrganizationHierarchy/u);
  assert.match(source, /parent_thread_id/u);
  assert.match(source, /liveThreadResultStateLabel/u);
  assert.equal(source.includes("idle_result_check"), false);
  assert.equal(source.includes("결과 확인 필요"), false);
});

test("organization tree has keyboard-operable exact-ID controls and narrow-safe styling", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /data-testid=\{`tree-toggle-\$\{node\.thread_id\}`\}/u);
  assert.match(source, /aria-expanded=\{expanded\}/u);
  assert.match(source, /data-testid=\{`organization-thread-\$\{node\.thread_id\}`\}/u);
  assert.match(css, /\.live-thread-tree\s*\{/u);
  assert.match(css, /\.live-tree-toggle\s*\{/u);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.live-thread-tree \.live-thread-tree/u);
});

test("live search owns its input column and cancels the legacy mobile grid row", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.live-thread-search\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/su);
  assert.match(css, /\.live-board-controls \.live-thread-search\s*\{\s*grid-row:\s*auto;/su);
});

test("AI usage breakdown rows stay top-aligned when sibling tables have different lengths", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.ai-usage-grid > section\s*\{[^}]*align-content:\s*start;/su);
});

test("mobile detail restores focus by exact logical thread before using a stable control", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /data-live-thread-id=\{thread\.thread_id\}/u);
  assert.match(source, /node\.dataset\.liveThreadId === restoreThreadId/u);
  assert.match(source, /data-live-focus-fallback/u);
  assert.match(source, /\[triggerRef\.current, logicalTrigger, stableControl\]\.find\(canRestoreFocus\)/u);
  assert.match(source, /isFocusRestoreCandidate/u);
});
