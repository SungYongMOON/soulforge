#!/usr/bin/env node
// Derived local snapshot only. Never performs network collection or changes CORE.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { openStore } from "../src/store.mjs";
import { buildAnalysis, LIMITS } from "../src/analysis/index.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function flag(name, fallback) { const index = args.indexOf(`--${name}`); return index < 0 ? fallback : args[index + 1]; }

async function main() {
  if (args.includes("--help")) { console.log("Usage: node tools/analyze_once.mjs [--data-dir <existing directory>] --as-of <UTC ISO timestamp>\nWrites derived analysis.json only; reads existing CORE; no collection."); return; }
  const dataDir = path.resolve(flag("data-dir", process.env.SONAR_INTEL_DATA_DIR || path.join(appRoot, "data")));
  if (!existsSync(dataDir)) throw new Error("data_directory_missing");
  const started = performance.now();
  const store = await openStore({ dataDir, readOnly: true, maxBytes: LIMITS.bytes });
  try {
    if (store.countItems() > LIMITS.records) throw new Error("record_limit_exceeded");
    const records = store.listItems({ limit: LIMITS.records + 1 });
    const lastRunPath = path.join(dataDir, "last_run.json");
    let lastRun = null;
    if (existsSync(lastRunPath)) { try { lastRun = JSON.parse(readFileSync(lastRunPath, "utf8")); } catch {} }
    const report = buildAnalysis(records, {
      asOf: flag("as-of"), lastRun,
      keywordsConfig: JSON.parse(readFileSync(path.join(appRoot, "config/keywords.json"), "utf8")),
      sourcesConfig: JSON.parse(readFileSync(path.join(appRoot, "config/sources.json"), "utf8")),
    });
    const payload = JSON.stringify(report);
    if (Buffer.byteLength(payload) > LIMITS.bytes) throw new Error("snapshot_byte_limit_exceeded");
    if (performance.now() - started > 5000) throw new Error("analysis_time_limit_exceeded");
    const output = path.join(dataDir, "analysis.json");
    const temporary = path.join(dataDir, `analysis.${process.pid}.tmp`);
    writeFileSync(temporary, payload, { flag: "wx" });
    renameSync(temporary, output);
    console.log(JSON.stringify({ state: report.state, uniqueDocuments: report.scope.uniqueDocuments, corpusDigest: report.corpusDigest, asOf: report.asOf }));
  } finally { store.close(); }
}
main().catch((error) => { console.error(`[analyze_once] ${error.message}`); process.exitCode = 1; });
