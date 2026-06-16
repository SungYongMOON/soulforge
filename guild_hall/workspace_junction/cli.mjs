#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { auditWorkspaceJunctions } from "./audit.mjs";
import { inventoryWorkspaceSystem, writeWorkspaceSystemReport } from "./system_inventory.mjs";

async function main() {
  const [command = "audit", ...rest] = process.argv.slice(2);
  if (!["audit", "inventory-system", "report-system"].includes(command)) {
    process.stderr.write(`unknown command: ${command}\n`);
    process.exitCode = 2;
    return;
  }

  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  if (command === "inventory-system") {
    const result = inventoryWorkspaceSystem({
      repoRoot,
      bindingRef: args.binding ?? "_workmeta/system/bindings/workspace_junctions.yaml",
      sourceRootRef: args["source-root"] ?? "_workspaces/system",
      maxDepth: args["max-depth"],
      maxEntries: args["max-entries"],
    });

    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(formatInventoryText(result));
    }

    if (args.strict && result.status !== "passed") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "report-system") {
    const result = writeWorkspaceSystemReport({
      repoRoot,
      bindingRef: args.binding ?? "_workmeta/system/bindings/workspace_junctions.yaml",
      sourceRootRef: args["source-root"] ?? "_workspaces/system",
      maxDepth: args["max-depth"],
      maxEntries: args["max-entries"],
      nodeId: args["node-id"],
      nodeIdentityRef: args["node-identity"] ?? "guild_hall/state/local/node_identity.yaml",
      reportRootRef: args["report-root"] ?? "_workmeta/system/reports/workspace_system_inventory",
    });

    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(formatReportText(result));
    }

    if (args.strict && result.status !== "passed") {
      process.exitCode = 1;
    }
    return;
  }

  const result = auditWorkspaceJunctions({
    repoRoot,
    bindingRef: args.binding ?? "_workmeta/system/bindings/workspace_junctions.yaml",
    workspaceRootRef: args["workspace-root"] ?? "_workspaces",
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(result));
  }

  if (result.status !== "passed") {
    process.exitCode = 1;
  }
}

function formatText(result) {
  const lines = [
    `workspace_junction_audit: ${result.status}`,
    `reason: ${result.reason}`,
    `binding: ${result.binding_ref}`,
    `declared_active: ${result.declared_active_count ?? 0}`,
    `checked: ${result.checked_count ?? 0}`,
    `root_consistency: ${result.root_consistency ?? "unknown"}`,
    `problems: ${result.problems.length}`,
    `extras: ${result.extras.length}`,
  ];

  for (const row of result.problems) {
    lines.push(
      `- ${row.workspace_alias}: ${row.observed_local_state}; action=${row.action}; expected=${row.expected_target_suffix ?? ""}; actual_tail=${row.actual_target_tail ?? ""}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatInventoryText(result) {
  const lines = [
    `workspace_system_inventory: ${result.status}`,
    `reason: ${result.reason}`,
    `source_root: ${result.source_root_ref}`,
    `binding_state: ${result.binding_state}`,
    `observed_local_state: ${result.observed_local_state}`,
    `migration_status: ${result.migration_status}`,
    `scan_complete: ${result.counts.scan_complete}`,
    `scan_limited: ${result.counts.scan_limited_count}`,
    `top_level_entries: ${result.counts.top_level_entry_count}`,
    `blockers: ${result.counts.blocker_count}`,
  ];

  for (const row of result.rows) {
    lines.push(
      `- ${row.relative_path}: class=${row.class}; action=${row.proposed_action}; owner_check=${row.needs_owner_check}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatReportText(result) {
  return `${[
    `workspace_system_report: ${result.status}`,
    `reason: ${result.reason}`,
    `node_id: ${result.node_id}`,
    `source_root: ${result.source_root_ref}`,
    `report: ${result.report_ref}`,
    `json: ${result.report_files.json_ref}`,
    `markdown: ${result.report_files.markdown_ref}`,
    `csv: ${result.report_files.csv_ref}`,
    `scan_complete: ${result.summary.scan_complete}`,
    `scan_limited: ${result.summary.scan_limited_count}`,
    `top_level_entries: ${result.summary.top_level_entry_count}`,
    `blockers: ${result.summary.blocker_count}`,
  ].join("\n")}\n`;
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const raw = token.slice(2);
    const separatorIndex = raw.indexOf("=");
    const key = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 1);
    const next = argv[index + 1];

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
      continue;
    }
    args[key] = true;
  }

  return args;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
