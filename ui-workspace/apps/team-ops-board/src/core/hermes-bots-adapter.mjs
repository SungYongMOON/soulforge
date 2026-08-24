// Provider-neutral Agent Runtime projection -> fixed Board identity roster.
// Runtime display labels and raw/unknown fields never participate in identity matching.

import { buildHermesBotPanelViewModel } from "./hermes-bot-panel.mjs";

const SCHEMA_VERSION = "soulforge.agent_runtime_read_projection.v1";
const SOURCE_KIND = "agent_runtime_gateway_active_sessions";
const OBSERVED_STATES = new Set(["working", "starting", "waiting", "idle"]);
const ENVELOPE_FIELDS = new Set([
  "schema_version",
  "read_only",
  "refresh_state",
  "observed_at",
  "source",
  "evidence_counts",
  "bots",
  "hold_code",
]);
const BOT_FIELDS = new Set([
  "bot_id",
  "agent_id",
  "display_label",
  "hermes",
  "state",
  "model",
  "provider",
  "usage",
  "heartbeat",
  "result",
  "hold_code",
]);
const ROSTER_FIELDS = new Set(["botId", "botName"]);
const KIND_VALUE_FIELDS = new Set(["kind", "value"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, fields) {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function safeLabel(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0
    && trimmed.length <= 200
    && !/[\u0000-\u001f\u007f]/u.test(trimmed)
    ? trimmed
    : null;
}

function safeRoster(roster) {
  if (!isPlainObject(roster) || !Array.isArray(roster.bots)) return [];
  const rows = [];
  for (const entry of roster.bots) {
    if (!isPlainObject(entry) || !hasExactKeys(entry, ROSTER_FIELDS)) return [];
    const botName = safeLabel(entry.botName);
    const botId = entry.botId === null ? null : safeLabel(entry.botId);
    if (botName === null || (entry.botId !== null && botId === null)) return [];
    rows.push({ botId, botName });
  }
  return rows;
}

function unknownRecord(identity) {
  return {
    botName: identity.botName,
    state: undefined,
    goalLabel: null,
    stageLabel: null,
    model: null,
    provider: null,
    directUsage: undefined,
    lastHeartbeatAtMs: null,
    resultStatus: "unknown",
  };
}

function exactKind(value, kind) {
  return isPlainObject(value)
    && hasExactKeys(value, new Set(["kind"]))
    && value.kind === kind;
}

function validHermesIdentity(value) {
  return isPlainObject(value)
    && hasExactKeys(value, new Set(["durable_session_key", "live_session_id"]))
    && (value.durable_session_key === null || safeLabel(value.durable_session_key) !== null)
    && (value.live_session_id === null || safeLabel(value.live_session_id) !== null);
}

function normalizeRuntimeRow(row, identity) {
  if (!isPlainObject(row) || !hasExactKeys(row, BOT_FIELDS)) return unknownRecord(identity);
  if (
    safeLabel(row.bot_id) === null
    || safeLabel(row.agent_id) === null
    || safeLabel(row.display_label) === null
    || !validHermesIdentity(row.hermes)
    || !exactKind(row.usage, "unavailable")
    || !exactKind(row.heartbeat, "unknown")
    || !exactKind(row.result, "unknown")
  ) {
    return unknownRecord(identity);
  }

  const stateObserved = isPlainObject(row.state)
    && hasExactKeys(row.state, KIND_VALUE_FIELDS)
    && row.state.kind === "observed"
    && OBSERVED_STATES.has(row.state.value)
    && row.hold_code === null;
  const stateUnknown = isPlainObject(row.state)
    && hasExactKeys(row.state, KIND_VALUE_FIELDS)
    && row.state.kind === "unknown"
    && row.state.value === null
    && (row.hold_code === null || safeLabel(row.hold_code) !== null);
  if (!stateObserved && !stateUnknown) return unknownRecord(identity);

  const unknownModel = isPlainObject(row.model)
    && hasExactKeys(row.model, KIND_VALUE_FIELDS)
    && row.model.kind === "unknown"
    && row.model.value === null;
  const providerModel = isPlainObject(row.model)
    && hasExactKeys(row.model, KIND_VALUE_FIELDS)
    && row.model.kind === "provider_reported"
    && safeLabel(row.model.value) !== null;
  if (!unknownModel && !providerModel) return unknownRecord(identity);
  if (
    !isPlainObject(row.provider)
    || !hasExactKeys(row.provider, KIND_VALUE_FIELDS)
    || row.provider.kind !== "unknown"
    || row.provider.value !== null
  ) {
    return unknownRecord(identity);
  }

  if (!stateObserved) return unknownRecord(identity);
  return {
    botName: identity.botName,
    state: row.state.value,
    goalLabel: null,
    stageLabel: null,
    model: providerModel ? row.model.value : null,
    provider: null,
    directUsage: undefined,
    lastHeartbeatAtMs: null,
    resultStatus: "unknown",
  };
}

function validReadySnapshot(snapshot) {
  return isPlainObject(snapshot)
    && hasExactKeys(snapshot, ENVELOPE_FIELDS)
    && snapshot.schema_version === SCHEMA_VERSION
    && snapshot.read_only === 1
    && snapshot.refresh_state === "ready"
    && typeof snapshot.observed_at === "string"
    && Number.isFinite(Date.parse(snapshot.observed_at))
    && isPlainObject(snapshot.source)
    && hasExactKeys(snapshot.source, new Set(["kind"]))
    && snapshot.source.kind === SOURCE_KIND
    && isPlainObject(snapshot.evidence_counts)
    && Array.isArray(snapshot.bots)
    && snapshot.hold_code === null;
}

export function projectHermesBotsSnapshot(snapshot, roster) {
  const identities = safeRoster(roster);
  if (identities.length === 0) return [];

  let records = identities.map(unknownRecord);
  if (validReadySnapshot(snapshot)) {
    const byId = new Map();
    let duplicate = false;
    for (const row of snapshot.bots) {
      if (!isPlainObject(row) || safeLabel(row.bot_id) === null || byId.has(row.bot_id)) {
        duplicate = true;
        break;
      }
      byId.set(row.bot_id, row);
    }
    if (!duplicate) {
      records = identities.map((identity) => {
        if (identity.botId === null) return unknownRecord(identity);
        const runtimeRow = byId.get(identity.botId);
        return runtimeRow === undefined ? unknownRecord(identity) : normalizeRuntimeRow(runtimeRow, identity);
      });
    }
  }

  const generatedAtMs = validReadySnapshot(snapshot) ? Date.parse(snapshot.observed_at) : undefined;
  const viewModel = buildHermesBotPanelViewModel({
    ...(generatedAtMs === undefined ? {} : { nowMs: generatedAtMs }),
    bots: records,
  });
  return Array.isArray(viewModel.rows) ? viewModel.rows : [];
}
