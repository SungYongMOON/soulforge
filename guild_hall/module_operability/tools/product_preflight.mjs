// Product-composition aggregate preflight (PC1-PC3, check-only).
//
// Usage:
//   node guild_hall/module_operability/tools/product_preflight.mjs
//   node guild_hall/module_operability/tools/product_preflight.mjs --json
//
// Exit 0 means only that the three no-move manifests and the classification
// catalog exactly match the currently discovered enrolled Module set.  It is
// not a source-move, Pack, deployment, or product-release approval.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { runProductPreflight } from "../src/product_composition_check.mjs";

function printHuman(receipt) {
  process.stdout.write("Soulforge product-composition preflight\n");
  process.stdout.write(`products: ${receipt.product_count}\n`);
  process.stdout.write(`modules: ${receipt.module_count} (shared: ${receipt.shared_module_count})\n`);
  process.stdout.write(`unresolved interfaces: ${receipt.unresolved_interface_count}\n`);
  for (const problem of receipt.problems) process.stdout.write(`VIOLATION ${problem}\n`);
  process.stdout.write(`ok: ${receipt.ok ? "yes" : "no"} (violations: ${receipt.problems.length})\n`);
}

function cliMain() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  if (args.some((arg) => arg !== "--json" && arg !== "--help")) {
    process.stderr.write("usage: node guild_hall/module_operability/tools/product_preflight.mjs [--json]\n");
    process.exit(2);
  }
  if (args.includes("--help")) {
    process.stdout.write("usage: node guild_hall/module_operability/tools/product_preflight.mjs [--json]\n");
    process.exit(0);
  }
  const receipt = runProductPreflight();
  if (json) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else printHuman(receipt);
  process.exit(receipt.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cliMain();
}
