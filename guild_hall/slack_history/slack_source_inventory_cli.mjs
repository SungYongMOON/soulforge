#!/usr/bin/env node

import process from "node:process";

import {
  SlackSourceInventoryError,
  summarizeSlackSourceInventory,
} from "./slack_source_inventory.mjs";

if (process.argv.length !== 2) {
  console.error("slack_source_inventory_query_only_accepts_no_arguments");
  process.exit(1);
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
if (!input.trim()) {
  console.error("slack_source_inventory_query_only_requires_stdin");
  process.exit(1);
}

try {
  const result = summarizeSlackSourceInventory(JSON.parse(input));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  if (error instanceof SlackSourceInventoryError) {
    console.error(`slack_source_inventory_query_only_rejected:${error.code}:${error.path}`);
  } else {
    console.error("slack_source_inventory_query_only_failed");
  }
  process.exit(1);
}
