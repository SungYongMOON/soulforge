#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  appendActivityEvent,
  defaultActivityRoot,
  MAX_MEASUREMENT_EVENT_READ,
  readRecentActivityEvents,
  refreshLatestContext,
} from "./activity_log.mjs";
import { discoverCustomAssetCatalog, summarizeAssetUsage } from "./asset_usage.mjs";
import {
  defaultPrivateStateRoot,
  syncActivityToPrivateState,
} from "./activity_sync.mjs";
import {
  defaultMailCandidateQueueRoot,
  projectMailCandidatesToActivity,
} from "./mail_candidate_projection.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  const activityRoot = path.resolve(args["activity-root"] ?? defaultActivityRoot(repoRoot));

  if (command === "log") {
    const result = await appendActivityEvent({
      repoRoot,
      activityRoot,
      input: {
        scope: args.scope,
        project_code: args["project-code"] ?? args.project_code,
        action: args.action,
        result: args.result,
        summary: args.summary,
        refs: mergeRefs(args),
        detail_owner: args["detail-owner"],
        next_action: args["next-action"],
        carry_forward: args["carry-forward"],
        actor: args.actor,
        asset_usage: assetUsageFromArgs(args),
      },
    });
    printResult(args, {
      status: "recorded",
      entry_id: result.event.entry_id,
      event: result.event,
      events_path: result.events_path,
      latest_context_path: result.latest_context_path,
    });
    return;
  }

  if (command === "asset-usage-report") {
    const eventLimit = normalizeAssetUsageEventLimit(args.limit);
    const catalog = await discoverCustomAssetCatalog(repoRoot);
    const eventWindow = await readRecentActivityEvents({
      activityRoot,
      limit: eventLimit + 1,
    });
    const hasMoreEvents = eventWindow.length > eventLimit;
    const events = eventWindow.slice(0, eventLimit);
    const report = summarizeAssetUsage(events, { catalog: catalog.assets, eventLimit, hasMoreEvents });
    printResult(args, {
      status: "reported",
      asset_usage_report: report,
      catalog_discovery: catalog.discovery,
      catalog_errors: catalog.errors,
    });
    return;
  }

  if (command === "refresh") {
    const latestContext = await refreshLatestContext({
      activityRoot,
      defaultRecentCount: args["recent-count"],
    });
    printResult(args, {
      status: "refreshed",
      latest_context_path: path.join(activityRoot, "latest_context.json"),
      latest_context: latestContext,
    });
    return;
  }

  if (command === "project-mail-candidates") {
    const result = await projectMailCandidatesToActivity({
      repoRoot,
      activityRoot,
      queueRoot: path.resolve(args["queue-root"] ?? defaultMailCandidateQueueRoot(repoRoot)),
    });
    printResult(args, result);
    return;
  }

  if (command === "sync") {
    const result = await syncActivityToPrivateState({
      repoRoot,
      activityRoot,
      privateStateRoot: path.resolve(args["private-state-root"] ?? defaultPrivateStateRoot(repoRoot)),
      projectMailCandidates: args["skip-mail-candidate-projection"] !== true,
      skipPull: args["skip-pull"] === true,
      skipCommit: args["skip-commit"] === true,
      skipPush: args["skip-push"] === true,
      allowDirty: args["allow-dirty"] === true,
      commitMessage: args["commit-message"],
    });
    printResult(args, result);
    if (result.status !== "completed") {
      process.exitCode = 1;
    }
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const parsedToken = parseFlagToken(token);
    const rawKey = parsedToken.key;
    const inlineValue = parsedToken.value;
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith("--") ? next : true);

    if (inlineValue === undefined && value === next) {
      index += 1;
    }

    if (args[rawKey] === undefined) {
      args[rawKey] = value;
    } else if (Array.isArray(args[rawKey])) {
      args[rawKey].push(value);
    } else {
      args[rawKey] = [args[rawKey], value];
    }
  }

  return args;
}

function parseFlagToken(token) {
  const raw = token.slice(2);
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex === -1) {
    return { key: raw, value: undefined };
  }
  return {
    key: raw.slice(0, separatorIndex),
    value: raw.slice(separatorIndex + 1),
  };
}

function mergeRefs(args) {
  const refs = [];

  for (const key of ["ref", "refs"]) {
    const value = args[key];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      refs.push(...value);
    } else {
      refs.push(value);
    }
  }

  return refs;
}

function assetUsageFromArgs(args) {
  if (!args["asset-type"] && !args.asset_type) return null;
  return {
    asset_type: args["asset-type"] ?? args.asset_type,
    asset_id: args["asset-id"] ?? args.asset_id,
    asset_ref: args["asset-ref"] ?? args.asset_ref,
    maintenance_owner: args["maintenance-owner"] ?? args.maintenance_owner,
    baseline_ref: args["baseline-ref"] ?? args.baseline_ref,
    outcome_evidence_ref: args["outcome-evidence-ref"] ?? args.outcome_evidence_ref,
    fallback_ref: args["fallback-ref"] ?? args.fallback_ref,
    lifecycle_policy_ref: args["lifecycle-policy-ref"] ?? args.lifecycle_policy_ref,
    duration_ms: args["duration-ms"] ?? args.duration_ms,
  };
}

function normalizeAssetUsageEventLimit(value) {
  const publicLimit = MAX_MEASUREMENT_EVENT_READ - 1;
  const parsed = Number.parseInt(value ?? publicLimit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return publicLimit;
  return Math.min(parsed, publicLimit);
}

function printResult(args, payload) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const lines = [`activity ${payload.status}`];
  if (payload.reason) {
    lines.push(`reason: ${payload.reason}`);
  }
  if (payload.entry_id) {
    lines.push(`entry_id: ${payload.entry_id}`);
  }
  if (payload.merge) {
    lines.push(`merged_events: ${payload.merge.merged_event_count}`);
    lines.push(`added_to_local: ${payload.merge.added_to_local}`);
    lines.push(`added_to_private: ${payload.merge.added_to_private}`);
  }
  if (payload.private_state) {
    lines.push(`private_state_changed: ${payload.private_state.changed ? "yes" : "no"}`);
    lines.push(`private_state_pushed: ${payload.private_state.pushed ? "yes" : "no"}`);
  }
  if (payload.projected !== undefined) {
    lines.push(`projected: ${payload.projected}`);
    lines.push(`skipped_unchanged: ${payload.skipped_unchanged ?? 0}`);
  }
  if (payload.mail_candidate_projection) {
    lines.push(`mail_candidate_projected: ${payload.mail_candidate_projection.projected}`);
  }
  if (payload.events_path) {
    lines.push(`events: ${payload.events_path}`);
  }
  if (payload.latest_context_path) {
    lines.push(`latest_context: ${payload.latest_context_path}`);
  }
  if (payload.asset_usage_report) {
    lines.push(`catalog_assets: ${payload.asset_usage_report.counts.catalog_assets}`);
    lines.push(`assets_with_usage: ${payload.asset_usage_report.counts.assets_with_usage}`);
    lines.push(`unmeasured_assets: ${payload.asset_usage_report.counts.unmeasured_assets}`);
    lines.push(`activity_events_scanned: ${payload.asset_usage_report.measurement_window.activity_events_scanned}`);
    lines.push(`measurement_limit_reached: ${payload.asset_usage_report.measurement_window.limit_reached}`);
    lines.push(`catalog_parse_errors: ${payload.catalog_errors?.length ?? 0}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/activity/cli.mjs log --scope <scope> --action <action> --summary <summary> [--project-code <code>] [--result <result>] [--ref <path>] [--carry-forward true] [--next-action <text>] [--asset-type workflow|skill|party|automation --asset-id <id> --asset-ref <repo-ref> --maintenance-owner <owner> --baseline-ref <ref> --outcome-evidence-ref <ref> --fallback-ref <ref> --lifecycle-policy-ref <ref> --duration-ms <n>] [--json]",
      "  node guild_hall/activity/cli.mjs refresh [--recent-count <n>] [--json]",
      "  node guild_hall/activity/cli.mjs asset-usage-report [--limit <n>] [--json]",
      "  node guild_hall/activity/cli.mjs project-mail-candidates [--queue-root <path>] [--json]",
      "  node guild_hall/activity/cli.mjs sync [--private-state-root <path>] [--skip-mail-candidate-projection] [--skip-pull] [--skip-commit] [--skip-push] [--json]",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
