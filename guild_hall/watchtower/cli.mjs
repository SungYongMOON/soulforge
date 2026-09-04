#!/usr/bin/env node
// watchtower CLI — W1: probe(판정·스냅샷) 전용. 복구/알림은 W2에서 별도 게이트로 추가한다.
// 사용:
//   node guild_hall/watchtower/cli.mjs probe --binding <path> [--json] [--no-write]
//   node guild_hall/watchtower/cli.mjs init-binding --output <path>
// exit: 0=정상 판정 완료(내용과 무관), 2=down 노드 존재, 1=실행 실패

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

// The Board's usage-producer companion (ui-workspace/apps/team-ops-board/ops/
// ai-usage-producer-companion.mjs, DEFAULT_USAGE_PRODUCER_INTERVAL_MS) sweeps
// every 300s and single-flights: an in-flight sweep silently skips one
// overlapping tick (startUsageProducerCompanion), so the gap between two sweep
// attempts can double to 600s. A healthy full sweep has been observed
// completing in 312741ms; rounding that up to a 360s margin covers normal
// timing variance in when these five lanes' own heartbeats land inside a
// sweep. 960s (600s skipped-tick tolerance + 360s duration margin) is the
// smallest bounded period that keeps a normal healthy cycle - including one
// skipped tick - green (it clears the ~388-500s ages already observed in
// production), while grace_seconds stays the existing 600s fail-closed buffer
// for a genuinely missed multi-cycle sweep (stale beyond period+grace =
// 1560s / 26 min).
export const USAGE_PRODUCER_HEALTH_PERIOD_SECONDS = 960;

export const EXAMPLE_BINDING = {
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
    mail_forwarder: {
      kind: "jsonl_tail",
      path: "<LOCAL_MAIL_FORWARDER_ROOT>/events.jsonl",
      timestamp_field: "observed_at",
      status_field: "collector_status",
      ok_values: ["ok"],
      activity_field: "retry_state",
      activity_values: ["clear", "retrying", "held"],
      activity_count_field: "tracked_failure_count",
      activity_next_at_field: "next_attempt_at",
      period_seconds: 600,
      grace_seconds: 600,
      scheduled_task: "Soulforge-Hiworks-Gmail-Forwarder",
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
      timestamp_field: "completed_at",
      status_field: "status",
      ok_values: ["ok"],
      activity_field: "retry_state",
      activity_values: ["clear", "retrying", "held"],
      activity_count_field: "backlog_count",
      activity_next_at_field: "next_attempt_at",
      period_seconds: USAGE_PRODUCER_HEALTH_PERIOD_SECONDS,
      grace_seconds: 600,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    usage_claude_collector: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/ai_usage_meter/producer_health/claude.json",
      timestamp_field: "completed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: USAGE_PRODUCER_HEALTH_PERIOD_SECONDS,
      grace_seconds: 600,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    usage_antigravity_collector: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/ai_usage_meter/producer_health/antigravity.json",
      timestamp_field: "completed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: USAGE_PRODUCER_HEALTH_PERIOD_SECONDS,
      grace_seconds: 600,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    usage_meter: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/ai_usage_meter/producer_health/meter.json",
      timestamp_field: "completed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: USAGE_PRODUCER_HEALTH_PERIOD_SECONDS,
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
      timestamp_field: "completed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: USAGE_PRODUCER_HEALTH_PERIOD_SECONDS,
      grace_seconds: 600,
      missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    codex_retention_report: {
      kind: "json_file",
      path: "<LOCAL_ACTIVITY_ROOT>/reports/codex_retention/current.json",
      expected_schema_version: "soulforge.codex_thread_manager.codex_retention_automation_report.v1",
      timestamp_field: "generated_at",
      status_field: "status",
      ok_values: ["PASS", "HOLD"],
      period_seconds: 86400,
      grace_seconds: 3600,
      missing_is_unmonitored: true,
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
      timestamp_field: "completed_at", status_field: "status", ok_values: ["ok"],
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
      timestamp_field: "completed_at", status_field: "status", ok_values: ["ok"],
      period_seconds: 300, grace_seconds: 600, missing_is_unmonitored: true,
      resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1",
    },
    // D: 이관 후 신설된 수집·백업 lane (2026-09-02~03).
    //
    // 수집 lane 은 실행마다 `<state_root>/receipts/<run_id>.json` 을 하나 만든다.
    // 변화가 없어 custody 가 늘지 않는 회차도 영수증은 쓰이므로, 영수증 디렉터리의
    // 최신 mtime 이 그 lane 의 하트비트다. 별도 emitter 를 만들 필요가 없다.
    // custody 디렉터리를 대신 보면 안 된다 - 조용한 15분은 정상이므로 거짓 경보가 된다.
    linear_collect: {
      kind: "dir_latest_mtime",
      path: "<LOCAL_LINEAR_COLLECT_STATE_ROOT>/receipts",
      period_seconds: 900,
      grace_seconds: 900,
      missing_is_unmonitored: true,
      scheduled_task: "Soulforge-HPP-Linear-Collect",
    },
    buzz_collect: {
      kind: "dir_latest_mtime",
      path: "<LOCAL_BUZZ_COLLECT_STATE_ROOT>/receipts",
      period_seconds: 900,
      grace_seconds: 900,
      missing_is_unmonitored: true,
      scheduled_task: "Soulforge-HPP-Buzz-Collect",
    },
    // 백업 job 은 Soulforge 밖의 controller 가 소유하므로 읽을 하트비트 파일이 없다.
    // 예약작업의 마지막 실행 결과를 직접 조회하는 편이 정확하고, 새 계약을 만들지 않는다.
    // 일 1회 job 이므로 창은 24시간 + 6시간 유예로 둔다.
    backup_buzz_server: {
      kind: "schtask",
      task_name: "<LOCAL_BUZZ_SERVER_BACKUP_TASK>",
      operation_mode: "scheduled",
      period_seconds: 86400,
      grace_seconds: 21600,
    },
    backup_agent_runtime: {
      kind: "schtask",
      task_name: "<LOCAL_AGENT_RUNTIME_BACKUP_TASK>",
      operation_mode: "scheduled",
      period_seconds: 86400,
      grace_seconds: 21600,
    },
    // store_linear_custody / store_buzz_custody / store_backup_generations 는
    // 일부러 비워 둔다. 다른 store probe 는 lane 이 쓰는 store-validity 파일
    // (`soulforge.<lane>.store_validity.v1`: attempted_at·completed_at·status·
    // validation_scope·validation_digest·validated_count)을 읽는데, 이 세 lane 은
    // 아직 그 파일을 만들지 않는다. 없는 파일을 가리키는 probe 를 넣는 것보다
    // 선언된 unmonitored_reason 을 그대로 보이는 편이 정직하다. emitter 가 생기면
    // 위 store_slack_custody 와 같은 모양으로 채운다.
    watchtower_self: {
      kind: "json_file",
      path: "<LOCAL_STATE_ROOT>/operations/watchtower/external_evidence/watchtower_self.json",
      expected_schema_version: "soulforge.watchtower.external_evidence.v1",
      required_fields: ["attempted_at", "completed_at", "last_success_at", "status", "validation_scope", "validation_digest", "validated_count"],
      required_string_fields: ["status", "validation_scope"],
      expected_field_values: { lane: "watchtower_self", validation_scope: "watchtower_cli_snapshot_contract_validity" },
      required_timestamp_fields: ["attempted_at", "completed_at"],
      nullable_timestamp_fields: ["last_success_at"],
      timestamp_field: "completed_at", status_field: "status", ok_values: ["ok"],
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

if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || fileURLToPath(import.meta.url) === resolve(process.argv[1]))) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(JSON.stringify({ ok: false, error: String(error && error.message || error) }) + "\n");
      process.exit(1);
    },
  );
}
