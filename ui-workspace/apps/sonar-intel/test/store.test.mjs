import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openStore, computeStableId, contentFingerprint } from "../src/store.mjs";

async function sqliteAvailable() {
  try {
    const mod = await import("node:sqlite");
    return typeof mod.DatabaseSync === "function";
  } catch {
    return false;
  }
}

function tmpDataDir() {
  return mkdtempSync(join(tmpdir(), "sonar-intel-store-"));
}

function sampleRecord(overrides = {}) {
  return {
    id: computeStableId("news_google_news", "https://example.test/a"),
    type: "news",
    source: "google_news",
    title: "해군, SAS 시험평가 착수",
    url: "https://example.test/a",
    summary: "요약 텍스트",
    publishedAt: "2026-09-04T01:20:00.000Z",
    fetchedAt: "2026-09-06T00:00:00.000Z",
    keywordsMatched: ["synthetic aperture sonar"],
    meta: { sourceLabel: "방위산업뉴스" },
    ...overrides,
  };
}

// --- pure helpers, backend-independent -------------------------------------

test("computeStableId is deterministic and namespace-sensitive", () => {
  const a1 = computeStableId("news_google_news", "https://example.test/a");
  const a2 = computeStableId("news_google_news", "https://example.test/a");
  const b = computeStableId("news_defense_news", "https://example.test/a");
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
  assert.match(a1, /^news_google_news_[0-9a-f]{24}$/);
});

test("computeStableId rejects empty namespace or key", () => {
  assert.throws(() => computeStableId("", "x"));
  assert.throws(() => computeStableId("ns", ""));
  assert.throws(() => computeStableId("ns", null));
});

test("contentFingerprint is stable for identical content and changes when title changes", () => {
  const a = sampleRecord();
  const aAgain = sampleRecord();
  const changed = sampleRecord({ title: "다른 제목" });
  assert.equal(contentFingerprint(a), contentFingerprint(aAgain));
  assert.notEqual(contentFingerprint(a), contentFingerprint(changed));
});

test("contentFingerprint ignores keyword order", () => {
  const a = sampleRecord({ keywordsMatched: ["x", "y"] });
  const b = sampleRecord({ keywordsMatched: ["y", "x"] });
  assert.equal(contentFingerprint(a), contentFingerprint(b));
});

// --- backend-parametrized behavior ------------------------------------------

const backendsToTest = ["jsonl"];
const hasSqlite = await sqliteAvailable();
if (hasSqlite) backendsToTest.push("sqlite");
// If node:sqlite is unavailable in this runtime, only "jsonl" runs — that IS
// the fallback contract this module promises (see store.mjs header comment),
// so it is not treated as a skipped/failed case.

for (const backend of backendsToTest) {
  test(`[${backend}] upsertItem: insert, no-op duplicate, then real update`, async () => {
    const dataDir = tmpDataDir();
    try {
      const store = await openStore({ dataDir, backend });
      assert.equal(store.backendName, backend);

      const inserted = store.upsertItem(sampleRecord());
      assert.equal(inserted.status, "inserted");

      const duplicate = store.upsertItem(sampleRecord());
      assert.equal(duplicate.status, "duplicate");

      const updated = store.upsertItem(sampleRecord({ title: "제목 수정됨" }));
      assert.equal(updated.status, "updated");

      const stored = store.getItem(sampleRecord().id);
      assert.equal(stored.title, "제목 수정됨");
      assert.equal(stored.erpMapping, null, "erp_mapping stays reserved/null in Goal #1");
      store.close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test(`[${backend}] upsertItem unions keywordsMatched across repeat sightings instead of overwriting`, async () => {
    // Regression: the same article is commonly returned by more than one
    // keyword's Google News query in a single collection run. The second
    // upsert must not erase the first keyword's match.
    const dataDir = tmpDataDir();
    try {
      const store = await openStore({ dataDir, backend });
      const first = store.upsertItem(sampleRecord({ keywordsMatched: ["SVP"] }));
      assert.equal(first.status, "inserted");

      const second = store.upsertItem(sampleRecord({ keywordsMatched: ["hydrophone"] }));
      assert.equal(second.status, "updated", "a genuinely new keyword match is a real update, not a duplicate no-op");

      const stored = store.getItem(sampleRecord().id);
      assert.deepEqual([...stored.keywordsMatched].sort(), ["SVP", "hydrophone"]);

      // Re-sending a keyword that is already recorded, with otherwise identical
      // content, is a true duplicate: no new information, so no write.
      const third = store.upsertItem(sampleRecord({ keywordsMatched: ["SVP"] }));
      assert.equal(third.status, "duplicate");
      store.close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test(`[${backend}] upsertItem rejects a record missing required fields`, async () => {
    const dataDir = tmpDataDir();
    try {
      const store = await openStore({ dataDir, backend });
      assert.throws(() => store.upsertItem({ type: "news", source: "google_news" }));
      assert.throws(() => store.upsertItem({ id: "x", source: "google_news" }));
      store.close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test(`[${backend}] listItems/countItems/summarize filter by type and source`, async () => {
    const dataDir = tmpDataDir();
    try {
      const store = await openStore({ dataDir, backend });
      store.upsertItem(sampleRecord({ id: computeStableId("news_google_news", "u1"), url: "u1", fetchedAt: "2026-09-01T00:00:00.000Z" }));
      store.upsertItem(sampleRecord({ id: computeStableId("news_defense_news", "u2"), source: "defense_news", url: "u2", fetchedAt: "2026-09-02T00:00:00.000Z" }));
      store.upsertItem({
        id: computeStableId("arxiv", "2501.00001"),
        type: "arxiv",
        source: "arxiv",
        title: "A Paper",
        url: "https://arxiv.org/abs/2501.00001",
        fetchedAt: "2026-09-03T00:00:00.000Z",
        keywordsMatched: ["beamforming"],
      });

      assert.equal(store.countItems(), 3);
      assert.equal(store.countItems({ type: "news" }), 2);
      assert.equal(store.countItems({ source: "defense_news" }), 1);

      const newsOnly = store.listItems({ type: "news", limit: 10 });
      assert.equal(newsOnly.length, 2);
      // newest fetchedAt first
      assert.equal(newsOnly[0].source, "defense_news");

      const limited = store.listItems({ limit: 1 });
      assert.equal(limited.length, 1);

      const summary = store.summarize();
      const bySource = Object.fromEntries(summary.map((row) => [`${row.type}:${row.source}`, row.count]));
      assert.equal(bySource["news:google_news"], 1);
      assert.equal(bySource["news:defense_news"], 1);
      assert.equal(bySource["arxiv:arxiv"], 1);

      assert.equal(store.allItems().length, 3);
      store.close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test(`[${backend}] data persists across close + reopen of the same dataDir`, async () => {
    const dataDir = tmpDataDir();
    try {
      const store1 = await openStore({ dataDir, backend });
      store1.upsertItem(sampleRecord());
      store1.close();

      const store2 = await openStore({ dataDir, backend });
      const found = store2.getItem(sampleRecord().id);
      assert.ok(found, "record should survive reopening the store");
      assert.equal(found.title, sampleRecord().title);
      store2.close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
}

test("openStore throws if backend 'sqlite' is forced but unavailable", { skip: hasSqlite }, async () => {
  const dataDir = tmpDataDir();
  try {
    await assert.rejects(() => openStore({ dataDir, backend: "sqlite" }));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
