#!/usr/bin/env node
// CLI wrapper for export/snapshot.mjs: reads every item currently in the
// store and writes export/sonar_intel_snapshot.{json,csv}. No network, no LLM.
//
// Usage: node tools/export_snapshot.mjs [--data-dir <path>] [--export-dir <path>]

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { openStore } from "../src/store.mjs";
import { writeSnapshot } from "../export/snapshot.mjs";
import { resolveDataDirectory, externalDirectory, cliFlag } from "../src/runtime_paths.mjs";

const args = process.argv.slice(2);

async function main() {
  if (args.includes("--help")) { console.log("Usage: node tools/export_snapshot.mjs --data-dir <existing external directory> [--export-dir <external directory>]\nRead-only CORE; export defaults to data-dir/export."); return; }
  const dataDir = resolveDataDirectory(args, process.env, { required: true });
  const exportDir = externalDirectory(cliFlag(args, "export-dir", path.join(dataDir, "export")));

  const store = await openStore({ dataDir, readOnly: true });
  try {
  const records = store.allItems();
  // Validate export rights before creating an output directory.
  const { buildJsonSnapshot } = await import("../export/snapshot.mjs");
  buildJsonSnapshot(records);
  if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true });
  const { jsonPath, csvPath } = writeSnapshot(records, { exportDir });
  console.log(`[export_snapshot] items=${records.length}`);
  console.log(`[export_snapshot] wrote ${jsonPath}`);
  console.log(`[export_snapshot] wrote ${csvPath}`);
  } finally { store.close(); }
}

main().catch((error) => {
  console.error("[export_snapshot] fatal", error.code ?? error.message);
  process.exit(1);
});
