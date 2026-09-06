#!/usr/bin/env node
// CLI wrapper for export/snapshot.mjs: reads every item currently in the
// store and writes export/sonar_intel_snapshot.{json,csv}. No network, no LLM.
//
// Usage: node tools/export_snapshot.mjs [--data-dir <path>] [--export-dir <path>]

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "../src/store.mjs";
import { writeSnapshot } from "../export/snapshot.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

async function main() {
  const dataDir = path.resolve(flag("data-dir", process.env.SONAR_INTEL_DATA_DIR || path.join(APP_ROOT, "data")));
  const exportDir = path.resolve(flag("export-dir", path.join(APP_ROOT, "export")));
  if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true });

  const store = await openStore({ dataDir });
  const records = store.allItems();
  const { jsonPath, csvPath } = writeSnapshot(records, { exportDir });
  console.log(`[export_snapshot] items=${records.length}`);
  console.log(`[export_snapshot] wrote ${jsonPath}`);
  console.log(`[export_snapshot] wrote ${csvPath}`);
  store.close();
}

main().catch((error) => {
  console.error("[export_snapshot] fatal", error);
  process.exit(1);
});
