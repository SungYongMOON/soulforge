#!/usr/bin/env node
import { runContinuousIngress } from "./continuous_runner.mjs";

function parseArgs(tokens) {
  const result = {};
  const seen = new Set();
  const valueKeys = new Set(["config", "config-digest"]);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith("--")) throw new Error("unexpected_argument");
    const key = token.slice(2);
    if (key !== "apply" && !valueKeys.has(key)) throw new Error("unexpected_argument");
    if (seen.has(key)) throw new Error("duplicate_argument");
    seen.add(key);
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
  if (args.apply === true && !args["config-digest"]) {
    throw new Error("continuous_binding_digest_required");
  }
  const result = await runContinuousIngress({
    bindingPath: args.config,
    bindingDigest: args["config-digest"],
    apply: args.apply === true,
  });
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
    config_digest: result.config_digest ?? null,
  };
  if (Object.hasOwn(result, "writer_authority_epoch")) {
    Object.assign(safe, {
      writer_authority_epoch: result.writer_authority_epoch ?? null,
      writer_authority_digest: result.writer_authority_digest ?? null,
      writer_authority_node_id: result.writer_authority_node_id ?? null,
      writer_authority_mode: result.writer_authority_mode ?? null,
      mail_status: result.mail?.status ?? (result.mail_enabled === false ? "disabled" : null),
      mailboxes_enabled: result.mail?.mailboxes_enabled ?? 0,
      mailboxes_run: result.mail?.mailboxes_run ?? 0,
      mail_total_events: result.mail?.total_events ?? 0,
      mail_total_new_events: result.mail?.total_new_events ?? 0,
      mail_total_duplicates: result.mail?.total_duplicates ?? 0,
      mail_write_count_known: result.mail?.write_count_known ?? true,
      mail_error_codes: Array.isArray(result.mail?.error_codes) ? result.mail.error_codes : [],
      writes_performed_lower_bound: result.writes_performed_lower_bound ?? result.writes_performed ?? 0,
      writes_performed_exact: result.writes_performed_exact ?? true,
    });
  }
  process.stdout.write(`${JSON.stringify(safe)}\n`);
  if (result.status === "degraded") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error?.code || error?.message || "continuous_ingress_failed" })}\n`);
  process.exitCode = 2;
}
