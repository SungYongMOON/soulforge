import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const CUSTOM_ASSET_USAGE_SCHEMA_VERSION = "soulforge.custom_asset_usage.v0";

const ASSET_TYPES = new Set(["workflow", "skill", "party", "automation"]);
const SUCCESS_RESULTS = new Set(["success", "passed", "completed", "accepted"]);
const FAILURE_RESULTS = new Set(["failed", "failure", "error", "rejected"]);
const BLOCKED_RESULTS = new Set(["blocked", "owner_decision_required", "needs_revision"]);
const SECRET_LIKE = /(^|\/)(\.env(?:[./]|$)|credentials?(?:\.json)?(?:\/|$)|secrets?(?:\.json)?(?:\/|$)|tokens?(?:\.json)?(?:\/|$)|cookies?(?:\.json)?(?:\/|$))/i;
const SECRET_TEXT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\b(token|password|passwd|secret|cookie|session|authorization)\s*[:=]\s*["']?[^"',\s)]+/i,
];
const RAW_HTML_PATTERN = /<!doctype html|<html[\s>]|<body[\s>]|<\/body>|<\/html>/i;

export function normalizeAssetUsage(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("asset_usage_must_be_object");
  }
  const assetType = requiredId(value.asset_type ?? value.assetType, "asset_type");
  if (!ASSET_TYPES.has(assetType)) throw new Error(`asset_type_not_allowed:${assetType}`);
  const assetId = requiredId(value.asset_id ?? value.assetId, "asset_id");
  const assetRef = metadataRef(value.asset_ref ?? value.assetRef, "asset_ref", true);
  if (!assetRefMatches(assetType, assetId, assetRef)) {
    throw new Error("asset_ref_does_not_match_asset_type_and_id");
  }

  return {
    schema_version: CUSTOM_ASSET_USAGE_SCHEMA_VERSION,
    asset_type: assetType,
    asset_id: assetId,
    asset_ref: assetRef,
    maintenance_owner: metadataLabel(value.maintenance_owner ?? value.maintenanceOwner, "maintenance_owner", 160),
    baseline_ref: metadataRef(value.baseline_ref ?? value.baselineRef, "baseline_ref"),
    outcome_evidence_ref: metadataRef(value.outcome_evidence_ref ?? value.outcomeEvidenceRef, "outcome_evidence_ref"),
    fallback_ref: metadataRef(value.fallback_ref ?? value.fallbackRef, "fallback_ref"),
    lifecycle_policy_ref: metadataRef(value.lifecycle_policy_ref ?? value.lifecyclePolicyRef, "lifecycle_policy_ref"),
    duration_ms: optionalDuration(value.duration_ms ?? value.durationMs),
    metadata_only: true,
    payload_copied: false,
    retire_or_archive_authority: false,
  };
}

export function summarizeAssetUsage(events = [], { catalog = [], now = new Date(), eventLimit = null, hasMoreEvents = false } = {}) {
  const eventRows = Array.isArray(events) ? events : [];
  const rows = new Map();
  for (const item of Array.isArray(catalog) ? catalog : []) {
    const key = assetKey(item.asset_type, item.asset_id);
    rows.set(key, emptyAssetRow(item));
  }

  let invalidEventCount = 0;
  const metadataObservedAt = new Map();
  for (const event of eventRows) {
    let usage;
    try {
      usage = normalizeAssetUsage(event?.asset_usage);
    } catch {
      if (event?.asset_usage != null) invalidEventCount += 1;
      continue;
    }
    const key = assetKey(usage.asset_type, usage.asset_id);
    const row = rows.get(key) ?? emptyAssetRow({
      asset_type: usage.asset_type,
      asset_id: usage.asset_id,
      asset_ref: usage.asset_ref,
      status: "event_only",
    });
    const occurredAt = normalizedTimestamp(event?.occurred_at ?? event?.date);
    const result = String(event?.result ?? "unknown").trim().toLowerCase() || "unknown";
    row.usage.total_runs += 1;
    if (SUCCESS_RESULTS.has(result)) row.usage.successful_runs += 1;
    else if (FAILURE_RESULTS.has(result)) row.usage.failed_runs += 1;
    else if (BLOCKED_RESULTS.has(result)) row.usage.blocked_runs += 1;
    else row.usage.other_runs += 1;
    if (occurredAt && (!row.usage.last_used_at || occurredAt > row.usage.last_used_at)) {
      row.usage.last_used_at = occurredAt;
    }
    if (SUCCESS_RESULTS.has(result) && occurredAt && (!row.usage.last_success_at || occurredAt > row.usage.last_success_at)) {
      row.usage.last_success_at = occurredAt;
    }
    const ageMs = occurredAt ? now.getTime() - Date.parse(occurredAt) : Number.POSITIVE_INFINITY;
    if (ageMs >= 0 && ageMs <= 30 * 24 * 60 * 60 * 1000) row.usage.runs_last_30_days += 1;
    for (const field of ["maintenance_owner", "baseline_ref", "fallback_ref", "lifecycle_policy_ref"]) {
      setLatestObservedMetadata({ row, key, field, value: usage[field], occurredAt, metadataObservedAt });
    }
    if (SUCCESS_RESULTS.has(result)) {
      setLatestObservedMetadata({ row, key, field: "outcome_evidence_ref", value: usage.outcome_evidence_ref, occurredAt, metadataObservedAt });
    }
    rows.set(key, row);
  }

  const assets = [...rows.values()]
    .map(finalizeAssetRow)
    .sort((left, right) => left.asset_type.localeCompare(right.asset_type) || left.asset_id.localeCompare(right.asset_id));
  const assetsWithUsage = assets.filter((row) => row.usage.total_runs > 0).length;
  const observedTimes = eventRows.map((event) => normalizedTimestamp(event?.occurred_at ?? event?.date)).filter(Boolean).sort();
  const normalizedLimit = normalizeEventLimit(eventLimit);
  return {
    schema_version: "soulforge.custom_asset_usage_report.v0",
    generated_at_utc: now.toISOString(),
    counts: {
      catalog_assets: Array.isArray(catalog) ? catalog.length : 0,
      reported_assets: assets.length,
      assets_with_usage: assetsWithUsage,
      unmeasured_assets: assets.filter((row) => row.usage.total_runs === 0).length,
      invalid_usage_events: invalidEventCount,
    },
    measurement_window: {
      event_limit: normalizedLimit,
      activity_events_scanned: eventRows.length,
      limit_reached: hasMoreEvents === true,
      truncated: hasMoreEvents === true,
      events_without_valid_timestamp: eventRows.length - observedTimes.length,
      oldest_event_at: observedTimes[0] ?? null,
      newest_event_at: observedTimes.at(-1) ?? null,
      usage_counts_scoped_to_scanned_events: true,
    },
    assets,
    boundary: {
      metadata_only: true,
      raw_payload_read: false,
      roi_claim_made: false,
      retire_or_archive_decision_made: false,
      default_route_changed: false,
      claim_ceiling: "observed_usage_metadata",
      usage_counts_scoped_to_measurement_window: true,
    },
  };
}

export async function discoverCustomAssetCatalog(repoRoot = process.cwd()) {
  const root = path.resolve(repoRoot);
  const assets = [];
  const errors = [];
  await discoverIndexedAssets({ root, owner: ".workflow", indexRef: ".workflow/index.yaml", idField: "workflow_id", assetType: "workflow", assets, errors });
  await discoverIndexedAssets({ root, owner: ".party", indexRef: ".party/index.yaml", idField: "party_id", assetType: "party", assets, errors });
  const skillsRoot = path.join(root, ".registry", "skills");
  try {
    for (const entry of await fs.readdir(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const ref = `.registry/skills/${entry.name}/skill.yaml`;
      try {
        const doc = parseYaml(await fs.readFile(path.join(root, ref), "utf8"));
        const assetId = requiredId(doc?.skill_id ?? entry.name, "skill_id");
        assets.push({ asset_type: "skill", asset_id: assetId, asset_ref: ref, status: optionalText(doc?.status, 80) ?? "unknown", catalog_owner: ".registry/skills" });
      } catch (error) {
        errors.push({ ref, error: String(error?.message ?? error) });
        assets.push({ asset_type: "skill", asset_id: entry.name, asset_ref: ref, status: "unparseable", catalog_owner: ".registry/skills" });
      }
    }
  } catch (error) {
    errors.push({ ref: ".registry/skills", error: String(error?.message ?? error) });
  }
  assets.sort((left, right) => left.asset_type.localeCompare(right.asset_type) || left.asset_id.localeCompare(right.asset_id));
  return {
    assets,
    errors,
    discovery: {
      workflow_catalog: ".workflow/index.yaml",
      party_catalog: ".party/index.yaml",
      skill_catalog: ".registry/skills/*/skill.yaml",
      automation_catalog: "event_only_local_or_external",
    },
  };
}

async function discoverIndexedAssets({ root, owner, indexRef, idField, assetType, assets, errors }) {
  try {
    const index = parseYaml(await fs.readFile(path.join(root, indexRef), "utf8"));
    for (const entry of Array.isArray(index?.entries) ? index.entries : []) {
      let assetId;
      let relativeRef;
      try {
        assetId = requiredId(entry?.[idField], idField);
        relativeRef = metadataRef(`${owner}/${entry.path}`, `${assetType}_ref`, true);
      } catch (error) {
        errors.push({ ref: `${owner}/${entry?.path ?? "unknown"}`, error: String(error?.message ?? error) });
        continue;
      }
      try {
        const doc = parseYaml(await fs.readFile(path.join(root, relativeRef), "utf8"));
        assets.push({ asset_type: assetType, asset_id: assetId, asset_ref: relativeRef, status: optionalText(doc?.status, 80) ?? "unknown", catalog_owner: owner });
      } catch (error) {
        errors.push({ ref: relativeRef, error: String(error?.message ?? error) });
        assets.push({ asset_type: assetType, asset_id: assetId, asset_ref: relativeRef, status: "unparseable", catalog_owner: owner });
      }
    }
  } catch (error) {
    errors.push({ ref: indexRef, error: String(error?.message ?? error) });
  }
}

function emptyAssetRow(item) {
  return {
    asset_type: String(item.asset_type),
    asset_id: String(item.asset_id),
    asset_ref: String(item.asset_ref),
    status: item.status ?? "unknown",
    maintenance_owner: item.maintenance_owner ?? null,
    baseline_ref: item.baseline_ref ?? null,
    outcome_evidence_ref: item.outcome_evidence_ref ?? null,
    fallback_ref: item.fallback_ref ?? null,
    lifecycle_policy_ref: item.lifecycle_policy_ref ?? null,
    usage: { total_runs: 0, successful_runs: 0, failed_runs: 0, blocked_runs: 0, other_runs: 0, runs_last_30_days: 0, last_used_at: null, last_success_at: null },
  };
}

function finalizeAssetRow(row) {
  const gaps = [];
  if (row.usage.total_runs === 0) gaps.push("usage_evidence_missing");
  if (!row.maintenance_owner) gaps.push("maintenance_owner_missing");
  if (!row.baseline_ref) gaps.push("general_agent_or_manual_baseline_ref_missing");
  if (!row.fallback_ref) gaps.push("fallback_ref_missing");
  if (!row.lifecycle_policy_ref) gaps.push("lifecycle_policy_ref_missing");
  if (!row.usage.last_success_at || !row.outcome_evidence_ref) gaps.push("successful_outcome_evidence_missing");
  return {
    ...row,
    measurement_gaps: gaps,
    measurement_state: gaps.length ? "insufficient_evidence" : "measured",
    lifecycle_decision: "not_made_by_usage_report",
  };
}

function assetKey(type, id) {
  return `${type}:${id}`;
}

function setLatestObservedMetadata({ row, key, field, value, occurredAt, metadataObservedAt }) {
  if (!value || !occurredAt) return;
  const fieldKey = `${key}\u0000${field}`;
  const observedAt = occurredAt ? Date.parse(occurredAt) : Number.NEGATIVE_INFINITY;
  const previous = metadataObservedAt.get(fieldKey);
  if (previous === undefined || observedAt > previous) {
    row[field] = value;
    metadataObservedAt.set(fieldKey, observedAt);
  }
}

function assetRefMatches(type, id, ref) {
  const prefixes = {
    workflow: `.workflow/${id}/`,
    skill: `.registry/skills/${id}/`,
    party: `.party/${id}/`,
  };
  if (type === "automation") return ref.startsWith("docs/") || ref.startsWith(".workflow/") || ref.startsWith(".party/");
  return ref.startsWith(prefixes[type]);
}

function requiredId(value, field) {
  if (typeof value !== "string") throw new Error(`${field}_must_be_string`);
  const text = value.trim();
  if (!text) throw new Error(`${field}_required`);
  if (text.length > 80) throw new Error(`${field}_too_long`);
  if (!/^[A-Za-z0-9_.-]+$/.test(text)) throw new Error(`${field}_invalid`);
  return text;
}

function optionalText(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function metadataLabel(value, field, maxLength) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${field}_must_be_string`);
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error(`${field}_too_long`);
  rejectSecretOrRawText(text, field);
  return text;
}

function metadataRef(value, field, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`${field}_required`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${field}_must_be_string`);
  const raw = value.trim();
  if (!raw) {
    if (required) throw new Error(`${field}_required`);
    return null;
  }
  const normalized = raw.replaceAll("\\", "/");
  if (normalized.length > 300) throw new Error(`${field}_too_long`);
  rejectSecretOrRawText(normalized, field);
  if (/^[A-Za-z]:/.test(normalized) || normalized.startsWith("/") || normalized.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)) {
    throw new Error(`${field}_must_be_repo_relative`);
  }
  const hashParts = normalized.split("#");
  if (hashParts.length > 2) throw new Error(`${field}_fragment_invalid`);
  const [pathPart, fragment = ""] = hashParts;
  let decodedPath;
  let decodedFragment;
  try {
    decodedPath = decodeURIComponent(pathPart).replaceAll("\\", "/");
    decodedFragment = decodeURIComponent(fragment);
  } catch {
    throw new Error(`${field}_must_be_normalized`);
  }
  rejectSecretOrRawText(`${decodedPath}${decodedFragment ? `#${decodedFragment}` : ""}`, field);
  if (!decodedPath || decodedPath.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${field}_must_be_normalized`);
  }
  if (/^[A-Za-z]:/.test(decodedPath) || decodedPath.startsWith("/") || decodedPath.startsWith("//")) throw new Error(`${field}_must_be_repo_relative`);
  if (fragment && (!decodedFragment || decodedFragment.includes("..") || !/^[\p{L}\p{N}_.-]+$/u.test(decodedFragment))) {
    throw new Error(`${field}_fragment_invalid`);
  }
  if (SECRET_LIKE.test(decodedPath)) throw new Error(`${field}_secret_like_value_blocked`);
  return normalized;
}

function rejectSecretOrRawText(value, field) {
  if (SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(`${field}_secret_like_value_blocked`);
  }
  if (RAW_HTML_PATTERN.test(value)) throw new Error(`${field}_raw_html_blocked`);
}

function normalizeEventLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function optionalDuration(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") throw new Error("duration_ms_must_be_number");
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 7 * 24 * 60 * 60 * 1000) throw new Error("duration_ms_invalid");
  return Math.round(number);
}

function normalizedTimestamp(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
