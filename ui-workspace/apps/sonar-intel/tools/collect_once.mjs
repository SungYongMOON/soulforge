#!/usr/bin/env node
// One-shot collection run across every enabled source in config/sources.json.
// Goal #1 does not register a scheduled task (AGENTS.md execution rule for this
// bounded task) — this script is the manual/on-demand entry point that a future
// scheduler would call. It never touches the ERP or any Soulforge lane; it only
// fetches public RSS/arXiv endpoints and writes to this app's own data/ store.
//
// Usage: node tools/collect_once.mjs [--data-dir <path>] [--max-results 50]
//
// Console output is deliberately English/ASCII-only (this repo's Windows
// console defaults to cp949 and mangles non-ASCII stdout); the Korean-context
// summary lives in data/last_run.json (UTF-8 file), not in printed text.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "../src/store.mjs";
import { collectAllNews } from "../src/collectors/news_rss.mjs";
import { collectArxiv } from "../src/collectors/arxiv.mjs";
import { SOURCE_IDS, sourceContract, digest } from "../src/collectors/source_contract.mjs";
import { collectionError } from "../src/collectors/diagnostics.mjs";
import { collectPapers } from "../src/collectors/papers.mjs";
import { openBudgetJournal } from "../src/collectors/budget_journal.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

function loadJsonConfig(fileName) {
  return JSON.parse(readFileSync(path.join(APP_ROOT, "config", fileName), "utf8"));
}

function tallyNews(perFeed) {
  const bySource = new Map();
  for (const row of perFeed) {
    const key = row.feedId;
    const entry = bySource.get(key) ?? { id: key, fetched: 0, errors: [] };
    entry.fetched += row.fetched;
    if (row.error) entry.errors.push({ keyword: row.keyword, error: row.error });
    bySource.set(key, entry);
  }
  return [...bySource.values()];
}

async function main() {
  const dataDir = path.resolve(flag("data-dir", process.env.SONAR_INTEL_DATA_DIR || path.join(APP_ROOT, "data")));
  const maxResults = Number(flag("max-results", 50));
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const sourcesConfig = loadJsonConfig("sources.json");
  const keywordsConfig = loadJsonConfig("keywords.json");
  const store = await openStore({ dataDir });
  console.log(`[collect_once] store backend: ${store.backendName}`);

  const startedAt = new Date().toISOString();
  const sourceReports = [];
  const totals = { fetched: 0, stored: 0, deduped: 0 };

  function applyRecords(sourceId, records) {
    let stored = 0;
    let deduped = 0;
    for (const record of records) {
      const result = store.upsertItem(record);
      if (result.status === "duplicate") deduped += 1;
      else stored += 1;
    }
    totals.fetched += records.length;
    totals.stored += stored;
    totals.deduped += deduped;
    return { stored, deduped };
  }

  // --- news_rss ---------------------------------------------------------
  try {
    const { records, perFeed } = await collectAllNews({ sourcesConfig, keywordsConfig });
    const perFeedTallies = tallyNews(perFeed);
    const { stored, deduped } = applyRecords("news_rss", records);
    console.log(`[collect_once] news_rss: fetched=${records.length} stored=${stored} deduped=${deduped}`);
    for (const feed of perFeedTallies) {
      console.log(`[collect_once]   feed=${feed.id} fetched=${feed.fetched} errors=${feed.errors.length}`);
    }
    sourceReports.push({ id: "news_rss", fetched: records.length, stored, deduped, feeds: perFeedTallies });
  } catch (error) {
    console.error(`[collect_once] news_rss FAILED: ${collectionError(error)}`);
    sourceReports.push({ id: "news_rss", fetched: 0, stored: 0, deduped: 0, error: collectionError(error) });
  }

  // --- arxiv --------------------------------------------------------------
  try {
    const { records, searchQuery, url } = await collectArxiv({ sourcesConfig, keywordsConfig, maxResults });
    const { stored, deduped } = applyRecords("arxiv", records);
    console.log(`[collect_once] arxiv: fetched=${records.length} stored=${stored} deduped=${deduped}`);
    sourceReports.push({ id: "arxiv", fetched: records.length, stored, deduped, queryDigest: searchQuery ? digest(searchQuery) : null });
  } catch (error) {
    console.error(`[collect_once] arxiv FAILED: ${collectionError(error)}`);
    sourceReports.push({ id: "arxiv", fetched: 0, stored: 0, deduped: 0, error: collectionError(error) });
  }

  // New sources have no implicit account, credential or allowance defaults.
  // KIPRIS/EPO remain explicitly unimplemented; paper clients fail closed until
  // an exact authorization plus durable budget observation is supplied.
  for (const source of SOURCE_IDS) {
    let budget;
    try {
      const config = sourcesConfig[source] ?? {};
      const contract = sourceContract(source, config);
      if (contract.executable && config.budgetObservation) budget = openBudgetJournal(path.join(dataDir, `budget-${source}.json`), config.budgetObservation);
      const query = (keywordsConfig.categories ?? []).flatMap((category) => category.terms ?? []).slice(0, 8).join(" ");
      const { receipt } = await collectPapers({ source, config, query, budget, store });
      sourceReports.push({ id: source, ...receipt });
      totals.fetched += receipt.fetched ?? 0; totals.stored += receipt.stored ?? 0; totals.deduped += receipt.deduped ?? 0;
    } catch { sourceReports.push({ id: source, state: "collection_failed", error: "source_setup_failed", fetched: null, stored: null, deduped: null }); }
    finally { budget?.close(); }
  }

  const finishedAt = new Date().toISOString();
  const summary = { schema: "soulforge.sonar_intel.collection_run.v1", startedAt, finishedAt, totals, sources: sourceReports };
  writeFileSync(path.join(dataDir, "last_run.json"), JSON.stringify(summary, null, 2), "utf8");

  console.log(`[collect_once] totals: fetched=${totals.fetched} stored=${totals.stored} deduped=${totals.deduped}`);
  console.log(`[collect_once] wrote ${path.join(dataDir, "last_run.json")}`);

  store.close();
}

main().catch((error) => {
  console.error("[collect_once] fatal", collectionError(error));
  process.exit(1);
});
