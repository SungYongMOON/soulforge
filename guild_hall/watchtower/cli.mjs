#!/usr/bin/env node
// watchtower CLI — W1: probe(판정·스냅샷) 전용. 복구/알림은 W2에서 별도 게이트로 추가한다.
// 사용:
//   node guild_hall/watchtower/cli.mjs probe --binding <path> [--json] [--no-write]
//   node guild_hall/watchtower/cli.mjs init-binding --output <path>
// exit: 0=정상 판정 완료(내용과 무관), 2=down 노드 존재, 1=실행 실패

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_POINTER_PATH = resolve(
  MODULE_ROOT,
  "..",
  "state",
  "operations",
  "watchtower",
  "binding.pointer.json",
);

import {
  composeTopologyHealth,
  assertSnapshotPathFree,
  writeTopologyHealthSnapshot,
  validateWatchtowerBinding,
  WATCHTOWER_BINDING_SCHEMA_VERSION,
} from "./watchtower.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        index += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

const EXAMPLE_BINDING = {
  schema_version: WATCHTOWER_BINDING_SCHEMA_VERSION,
  state_root: "<LOCAL_STATE_ROOT>/watchtower",
  probes: {
    ingress_supervisor: {
      kind: "jsonl_tail",
      path: "<LOCAL_CONTROL_ROOT>/ingress/state/continuous-supervisor-heartbeats.jsonl",
      timestamp_field: "observed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 1200,
      grace_seconds: 1200,
      resident_task: "Soulforge-Continuous-Five-Lane-Ingress",
    },
    voice_label_worker: {
      kind: "json_file",
      path: "<LOCAL_CONTROL_ROOT>/voice-label/health.json",
      timestamp_field: "last_completed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 1200,
      grace_seconds: 1800,
      resident_task: "Soulforge-HPP-Voice-ASR-Label",
    },
    local_activity: {
      kind: "json_file",
      path: "<LOCAL_CONTROL_ROOT>/local-activity/health.json",
      expected_schema_version: "soulforge.hpp_local_activity_health.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status"],
      required_string_fields: ["status"],
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "completed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 2400,
      grace_seconds: 1800,
      missing_is_unmonitored: true,
      scheduled_task: "Soulforge-HPP-All-Project-Local-Activity",
    },
    store_mail_events: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/state/health/store_mail_events.json",
      expected_schema_version: "soulforge.ingress.store_validity.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status", "validation_scope", "validation_digest", "validated_count"],
      required_string_fields: ["status", "validation_scope"],
      expected_field_values: { lane: "store_mail_events", validation_scope: "mail_event_tail_set_validity" },
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "completed_at", status_field: "status", ok_values: ["ok"],
      period_seconds: 1200, grace_seconds: 1200, missing_is_unmonitored: true,
      resident_task: "Soulforge-Continuous-Five-Lane-Ingress",
    },
    store_activity_outbox: {
      kind: "json_file",
      path: "<LOCAL_CONTROL_ROOT>/local-activity/store_activity_outbox.json",
      expected_schema_version: "soulforge.hpp_activity_outbox_store_validity.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status", "validation_scope", "validation_digest", "validated_count"],
      required_string_fields: ["status", "validation_scope"],
      expected_field_values: { lane: "store_activity_outbox", validation_scope: "local_activity_current_packet_index_validity" },
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "completed_at", status_field: "status", ok_values: ["ok"],
      period_seconds: 2400, grace_seconds: 1800, missing_is_unmonitored: true,
      scheduled_task: "Soulforge-HPP-All-Project-Local-Activity",
    },
    store_voice_custody: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/state/health/store_voice_custody.json",
      expected_schema_version: "soulforge.ingress.store_validity.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status", "validation_scope", "validation_digest", "validated_count"],
      required_string_fields: ["status", "validation_scope"],
      expected_field_values: { lane: "store_voice_custody", validation_scope: "voice_custody_current_history_file_size_receipt_validity" },
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "completed_at", status_field: "status", ok_values: ["ok"],
      period_seconds: 1200, grace_seconds: 1200, missing_is_unmonitored: true,
      resident_task: "Soulforge-Continuous-Five-Lane-Ingress",
    },
    store_slack_custody: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/slack_batch/health/store_slack_custody.json",
      expected_schema_version: "soulforge.slack_history.store_validity.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status", "validation_scope", "validation_digest", "validated_count"],
      required_string_fields: ["status", "validation_scope"],
      expected_field_values: { lane: "store_slack_custody", validation_scope: "slack_custody_state_index_validity" },
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "completed_at", status_field: "status", ok_values: ["ok"],
      period_seconds: 43200, grace_seconds: 7200, missing_is_unmonitored: true,
      scheduled_task: "Soulforge-HPP-Slack-Batch",
    },
    usage_codex_collector: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/ai_usage_meter/producer_health/codex.json",
      timestamp_field: "last_success_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 300,
      grace_seconds: 600,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    usage_claude_collector: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/ai_usage_meter/producer_health/claude.json",
      timestamp_field: "last_success_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 300,
      grace_seconds: 600,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    usage_meter: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/ai_usage_meter/producer_health/meter.json",
      timestamp_field: "last_success_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 300,
      grace_seconds: 600,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    store_usage_ledger: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/ai_usage_meter/producer_health/store_usage_ledger.json",
      expected_schema_version: "soulforge.ai_usage_producer_heartbeat.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status"],
      required_string_fields: ["status"],
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "last_success_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 300,
      grace_seconds: 600,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    gate_five_field: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/operations/watchtower/external_evidence/gate_five_field.json",
      expected_schema_version: "soulforge.watchtower.external_evidence.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status", "validation_scope", "validation_digest", "validated_count"],
      required_string_fields: ["status", "validation_scope"],
      expected_field_values: { lane: "gate_five_field", validation_scope: "five_field_ledger_set_integrity" },
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "last_success_at", status_field: "status", ok_values: ["ok"],
      period_seconds: 300, grace_seconds: 600, missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    store_workmeta: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/operations/watchtower/external_evidence/store_workmeta.json",
      expected_schema_version: "soulforge.watchtower.external_evidence.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status", "validation_scope", "validation_digest", "validated_count"],
      required_string_fields: ["status", "validation_scope"],
      expected_field_values: { lane: "store_workmeta", validation_scope: "workmeta_metadata_payload_policy_validity" },
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "last_success_at", status_field: "status", ok_values: ["ok"],
      period_seconds: 300, grace_seconds: 600, missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    watchtower_self: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/operations/watchtower/external_evidence/watchtower_self.json",
      expected_schema_version: "soulforge.watchtower.external_evidence.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status", "validation_scope", "validation_digest", "validated_count"],
      required_string_fields: ["status", "validation_scope"],
      expected_field_values: { lane: "watchtower_self", validation_scope: "watchtower_cli_snapshot_contract_validity" },
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "last_success_at", status_field: "status", ok_values: ["ok"],
      period_seconds: 300, grace_seconds: 600, missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    consumer_board: {
      kind: "json_file",
      path: "<LOCAL_RUNTIME_ROOT>/team-ops-board-runtime/runtime.v1.json",
      expected_schema_version: "soulforge.team_ops_board.runtime.v1",
      required_fields: ["heartbeat_at", "state"],
      required_string_fields: ["heartbeat_at", "state"],
      required_timestamp_fields: ["heartbeat_at"],
      timestamp_field: "heartbeat_at",
      status_field: "state",
      ok_values: ["ready"],
      period_seconds: 60,
      grace_seconds: 120,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
  },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (command === "init-binding") {
    if (typeof args.output !== "string") throw new Error("--output <path> is required");
    await writeFile(args.output, JSON.stringify(EXAMPLE_BINDING, null, 2), { flag: "wx" });
    process.stdout.write(JSON.stringify({ ok: true, output: "written" }) + "\n");
    return 0;
  }

  if (command !== "probe") {
    throw new Error("usage: probe [--binding <path>|--pointer <path>] [--json] [--no-write] | init-binding --output <path>");
  }
  let bindingPath = typeof args.binding === "string" ? args.binding : null;
  if (bindingPath === null) {
    const pointerPath = typeof args.pointer === "string" ? args.pointer : DEFAULT_POINTER_PATH;
    const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
    if (pointer === null || typeof pointer !== "object" || typeof pointer.binding_path !== "string") {
      throw new Error("binding pointer is invalid");
    }
    bindingPath = pointer.binding_path;
  }

  const binding = validateWatchtowerBinding(JSON.parse(await readFile(bindingPath, "utf8")));
  const snapshot = await composeTopologyHealth(binding);
  assertSnapshotPathFree(snapshot, binding);
  if (args["no-write"] !== true) await writeTopologyHealthSnapshot(binding, snapshot);

  if (args.json === true) {
    process.stdout.write(JSON.stringify(snapshot) + "\n");
  } else {
    const counts = Object.entries(snapshot.summary)
      .map(([state, count]) => `${state}=${count}`)
      .join(" ");
    process.stdout.write(`watchtower probe: ${counts} observed_at=${snapshot.observed_at}\n`);
  }
  return snapshot.summary.down > 0 ? 2 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(JSON.stringify({ ok: false, error: String(error && error.message || error) }) + "\n");
    process.exit(1);
  },
);
