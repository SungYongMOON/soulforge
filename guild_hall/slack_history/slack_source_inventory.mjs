import { sha256Canonical } from "../shared/project_history_envelope.mjs";

export const SLACK_SOURCE_INVENTORY_SCHEMA_VERSION = "soulforge.slack_source_inventory.query_only.v1";

const WORKSPACE_ID_PATTERN = /^T[A-Z0-9]{2,31}$/u;
const CHANNEL_ID_PATTERN = /^[CGD][A-Z0-9]{2,31}$/u;
const PROJECT_CODE_PATTERN = /^P\d{2}-\d{3}$/u;
const OFFSET_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
const MAX_CHANNELS = 500;
const TOP_LEVEL_FIELDS = Object.freeze([
  "schema_version",
  "observed_at",
  "pagination_complete",
  "workspace_id",
  "channels",
  "history_probe",
]);
const CHANNEL_FIELDS = Object.freeze([
  "channel_id",
  "classification_candidate",
  "project_code_candidate",
  "is_private",
  "is_archived",
  "is_shared",
  "is_ext_shared",
]);
const HISTORY_PROBE_FIELDS = Object.freeze([
  "channel_id",
  "items_observed",
  "more_available",
  "latest_observed_at",
]);

export class SlackSourceInventoryError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "SlackSourceInventoryError";
    this.code = code;
    this.path = path;
  }
}

export function summarizeSlackSourceInventory(input) {
  assertPlainObject(input, "$");
  assertExactKeys(input, TOP_LEVEL_FIELDS, "$");
  if (input.schema_version !== SLACK_SOURCE_INVENTORY_SCHEMA_VERSION) {
    fail("schema_version_invalid", "$.schema_version", "Unexpected query-only inventory schema");
  }
  validateWorkspaceId(input.workspace_id, "$.workspace_id");
  const observedAt = normalizeIso(input.observed_at, "$.observed_at");
  validateBoolean(input.pagination_complete, "$.pagination_complete");
  if (!Array.isArray(input.channels) || input.channels.length > MAX_CHANNELS) {
    fail("channels_invalid", "$.channels", `Expected an array with at most ${MAX_CHANNELS} entries`);
  }

  const seen = new Set();
  const channels = input.channels.map((channel, index) => {
    const path = `$.channels[${index}]`;
    assertPlainObject(channel, path);
    assertExactKeys(channel, CHANNEL_FIELDS, path);
    validateChannelId(channel.channel_id, `${path}.channel_id`);
    if (seen.has(channel.channel_id)) {
      fail("duplicate_channel_id", `${path}.channel_id`, "Channel IDs must be unique");
    }
    seen.add(channel.channel_id);
    if (!["project_name_candidate", "other"].includes(channel.classification_candidate)) {
      fail("classification_candidate_invalid", `${path}.classification_candidate`, "Expected project_name_candidate or other");
    }
    if (channel.classification_candidate === "project_name_candidate") {
      if (typeof channel.project_code_candidate !== "string"
        || !PROJECT_CODE_PATTERN.test(channel.project_code_candidate)) {
        fail("project_code_candidate_invalid", `${path}.project_code_candidate`, "Expected an exact project-code candidate");
      }
    } else if (channel.project_code_candidate !== null) {
      fail("project_code_candidate_forbidden", `${path}.project_code_candidate`, "Other channels cannot carry a project candidate");
    }
    for (const key of ["is_private", "is_archived", "is_shared", "is_ext_shared"]) {
      validateBoolean(channel[key], `${path}.${key}`);
    }
    return { ...channel };
  }).sort((left, right) => left.channel_id.localeCompare(right.channel_id));

  const historyProbe = normalizeHistoryProbe(input.history_probe, seen);
  const projectCandidates = channels
    .filter((channel) => channel.classification_candidate === "project_name_candidate")
    .map((channel) => ({
      channel_id: channel.channel_id,
      project_code_candidate: channel.project_code_candidate,
    }));

  return {
    schema_version: SLACK_SOURCE_INVENTORY_SCHEMA_VERSION,
    mode: "query_only_no_persistence",
    source_kind: "slack_channel_inventory",
    observed_at: observedAt,
    pagination_complete: input.pagination_complete,
    workspace_fingerprint: sha256Canonical({ workspace_id: input.workspace_id }),
    channel_inventory_digest: sha256Canonical(channels),
    visible_channel_count: channels.length,
    project_name_candidate_count: projectCandidates.length,
    other_channel_count: channels.length - projectCandidates.length,
    private_channel_count: channels.filter((channel) => channel.is_private).length,
    archived_channel_count: channels.filter((channel) => channel.is_archived).length,
    shared_channel_count: channels.filter((channel) => channel.is_shared).length,
    slack_connect_candidate_count: channels.filter((channel) => channel.is_ext_shared).length,
    project_candidate_digest: sha256Canonical(projectCandidates),
    history_probe: historyProbe === null
      ? null
      : {
          channel_fingerprint: sha256Canonical({ channel_id: historyProbe.channel_id }),
          items_observed: historyProbe.items_observed,
          more_available: historyProbe.more_available,
          latest_observed_at: historyProbe.latest_observed_at,
        },
    project_binding_authority: "candidate_only_owner_approval_required",
    safety: {
      channel_names_returned: false,
      channel_ids_returned: false,
      project_codes_returned: false,
      message_bodies_returned: false,
      file_payloads_returned: false,
      repository_writes: 0,
      temporary_files_created: 0,
      slack_mutation: false,
    },
    claim_ceiling: "source_availability_metadata_only",
  };
}

function normalizeHistoryProbe(value, channelIds) {
  if (value === null) return null;
  assertPlainObject(value, "$.history_probe");
  assertExactKeys(value, HISTORY_PROBE_FIELDS, "$.history_probe");
  validateChannelId(value.channel_id, "$.history_probe.channel_id");
  if (!channelIds.has(value.channel_id)) {
    fail("history_probe_channel_unknown", "$.history_probe.channel_id", "History probe must reference an observed channel");
  }
  if (!Number.isSafeInteger(value.items_observed) || value.items_observed < 0 || value.items_observed > 100) {
    fail("history_probe_count_invalid", "$.history_probe.items_observed", "Expected an integer from 0 to 100");
  }
  validateBoolean(value.more_available, "$.history_probe.more_available");
  const latest = value.latest_observed_at === null
    ? null
    : normalizeIso(value.latest_observed_at, "$.history_probe.latest_observed_at");
  if ((value.items_observed === 0) !== (latest === null)) {
    fail("history_probe_time_invalid", "$.history_probe", "Zero items require null time and observed items require a time");
  }
  return {
    channel_id: value.channel_id,
    items_observed: value.items_observed,
    more_available: value.more_available,
    latest_observed_at: latest,
  };
}

function assertPlainObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Expected a plain object");
  }
}

function assertExactKeys(value, expected, path) {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    fail("exact_keys_required", path, `Expected exact keys: ${allowed.join(",")}`);
  }
}

function validateWorkspaceId(value, path) {
  if (typeof value !== "string" || !WORKSPACE_ID_PATTERN.test(value)) {
    fail("workspace_id_invalid", path, "Expected a stable Slack workspace ID");
  }
}

function validateChannelId(value, path) {
  if (typeof value !== "string" || !CHANNEL_ID_PATTERN.test(value)) {
    fail("channel_id_invalid", path, "Expected a stable Slack conversation ID");
  }
}

function validateBoolean(value, path) {
  if (typeof value !== "boolean") fail("boolean_required", path, "Expected a boolean");
}

function normalizeIso(value, path) {
  if (typeof value !== "string" || !OFFSET_TIMESTAMP_PATTERN.test(value)) {
    fail("timestamp_invalid", path, "Expected an ISO timestamp with an explicit offset");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail("timestamp_invalid", path, "Expected an ISO timestamp");
  return date.toISOString();
}

function fail(code, path, message) {
  throw new SlackSourceInventoryError(code, path, message);
}
