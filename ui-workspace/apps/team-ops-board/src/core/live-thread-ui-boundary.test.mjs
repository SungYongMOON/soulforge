import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");

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
