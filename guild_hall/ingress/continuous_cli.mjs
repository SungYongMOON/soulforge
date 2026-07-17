#!/usr/bin/env node
import { runContinuousIngress } from "./continuous_runner.mjs";

function parseArgs(tokens) {
  const result = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith("--")) throw new Error("unexpected_argument");
    const key = token.slice(2);
    if (key === "apply") {
      result.apply = true;
      continue;
    }
    const value = tokens[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing_${key}`);
    result[key] = value;
    i += 1;
  }
  return result;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config) throw new Error("config_required");
  const result = await runContinuousIngress({ bindingPath: args.config, apply: args.apply === true });
  const safe = {
    schema_version: result.schema_version,
    status: result.status,
    node_id: result.node_id,
    run_id: result.run_id || null,
    lease_epoch: result.lease_epoch || null,
    checked_at: result.checked_at || result.completed_at || null,
    voice_enabled: result.voice_enabled ?? Boolean(result.voice),
    queue_count: result.enabled_queue_count ?? result.queues?.length ?? 0,
    error_count: result.errors?.length ?? 0,
    writes_performed: result.writes_performed,
    source_deleted: result.source_deleted ?? false,
    source_overwritten: result.source_overwritten ?? false,
    erp_written: result.erp_written ?? false,
    mcp_written: result.mcp_written ?? false,
    project_promoted: result.project_promoted ?? false,
    mail_fetched: result.mail_fetched ?? false,
    continuous_scheduler_enabled: result.continuous_scheduler_enabled ?? false,
  };
  process.stdout.write(`${JSON.stringify(safe)}\n`);
  if (result.status === "degraded") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error?.code || error?.message || "continuous_ingress_failed" })}\n`);
  process.exitCode = 2;
}
