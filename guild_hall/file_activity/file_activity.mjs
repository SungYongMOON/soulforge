import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export const FILE_OBSERVATION_PACKET_SCHEMA = "soulforge.file_observation_packet.v0";
export const FILE_REVISION_STATE_SCHEMA = "soulforge.file_revision_state.v0";
export const FILE_SCAN_CACHE_SCHEMA = "soulforge.file_scan_cache.v1";
export const FILE_RECONCILE_RECEIPT_SCHEMA = "soulforge.file_scan_receipt.v1";
export const FILE_RECONCILE_EVENT_SCHEMA = "soulforge.file_reconcile_event_partition.v1";
export const FILE_REVISION_CHECKPOINT_SCHEMA = "soulforge.file_revision_checkpoint.v1";
export const FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA = "soulforge.file_activity_life_tree_projection.v1";

export const NODE_ROLES = Object.freeze([
  "work_pc",
  "tool_pc",
  "portable_dev_pc",
  "always_on_node",
]);
export const ABSENCE_AUTHORITY_ROLES = Object.freeze(["work_pc"]);
export const FILE_ACTIVITY_STATE_LIMITS = Object.freeze({
  recent_event_summaries: 1000,
  recent_reconciliation_events: 1000,
  scan_receipts: 1000,
  revision_observation_refs: 100,
  coverage_gaps: 1000,
  collision_rows: 1000,
  node_cursors: 10_000,
  logical_files: 100_000,
  revisions: 500_000,
  node_bindings: 500_000,
  per_entry_refs: 1000,
});
export const FILE_ACTIVITY_CACHE_LIMITS = Object.freeze({ entries: 100_000 });
export const FILE_ACTIVITY_CACHE_POLICY = Object.freeze({
  verified_hash_ttl_ms: 24 * 60 * 60 * 1000,
  max_verified_hash_ttl_ms: 24 * 60 * 60 * 1000,
});
export const FILE_ACTIVITY_PROJECTION_LIMITS = Object.freeze({ events: 2000 });
export const FILE_ACTIVITY_RECONCILE_LIMITS = Object.freeze({ packet_batch: 4998 });

const DEFAULT_IMMEDIATE_HASH_BYTES = 64 * 1024 * 1024;
const DEFAULT_SCAN_BYTE_BUDGET = 512 * 1024 * 1024;
const DEFAULT_ABSENCE_THRESHOLD = 2;
const DEFAULT_DELETION_GRACE_MS = 24 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const RETRIABLE_RECEIPT_DISPOSITIONS = new Set([
  "sequence_gap_held",
  "producer_chain_mismatch_no_mutation",
]);

const CADENCE_BY_ROLE = Object.freeze({
  work_pc: Object.freeze({
    active_scan_minutes: 5,
    triggers: Object.freeze(["startup", "resume", "daily_full"]),
  }),
  tool_pc: Object.freeze({
    active_scan_minutes: 10,
    triggers: Object.freeze(["post_export", "daily_full"]),
  }),
  portable_dev_pc: Object.freeze({
    active_scan_minutes: 15,
    triggers: Object.freeze(["startup", "resume", "mount", "daily_full"]),
    battery_aware: true,
  }),
  always_on_node: Object.freeze({
    inbox_reconcile_minutes: 1,
    active_scan_minutes: 5,
    triggers: Object.freeze(["daily_full"]),
    requires_valid_binding: true,
    requires_operational_primary: true,
  }),
});

const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".Trash",
  "_workmeta",
  "private-state",
  "node_modules",
]);

export function cadenceForRole(nodeRole) {
  assertNodeRole(nodeRole);
  return structuredClone(CADENCE_BY_ROLE[nodeRole]);
}

export function classifyCadenceFreshness({ nodeRole, lastIngestedAt, now = new Date().toISOString() }) {
  const cadence = cadenceForRole(nodeRole);
  const cadenceMs = cadence.active_scan_minutes * 60 * 1000;
  const ageMs = Math.max(0, Date.parse(normalizeIso(now, "now")) - Date.parse(normalizeIso(lastIngestedAt, "last_ingested_at")));
  const state = ageMs <= cadenceMs * 2 ? "fresh" : ageMs <= cadenceMs * 6 ? "late" : "stale";
  return {
    state,
    age_ms: ageMs,
    expected_cadence_ms: cadenceMs,
    fresh_through_ms: cadenceMs * 2,
    late_through_ms: cadenceMs * 6,
  };
}

export function buildPathCollisionKeys(relativePath) {
  const raw = toPosixPath(relativePath);
  const nfc = raw.normalize("NFC");
  const casefold = nfc.toLocaleLowerCase("und");
  const crossPlatform = nfc
    .split("/")
    .map((segment) => segment.replace(/[. ]+$/u, "").toLocaleLowerCase("und"))
    .join("/");
  return {
    exact: opaqueKey("exact", raw),
    nfc: opaqueKey("nfc", nfc),
    casefold: opaqueKey("casefold", casefold),
    cross_platform_trailing_dot_space: opaqueKey("cross", crossPlatform),
  };
}

export function pathFingerprintForCollisionKeys(pathCollisionKeys) {
  return stableId("path", pathCollisionKeys.exact);
}

export function observationIdFor(observation) {
  return stableId(
    "obs",
    observation.scan_id,
    observation.node_id,
    observation.path_fingerprint,
    String(observation.size_bytes),
    String(observation.fs_modified_at?.value ?? ""),
    observation.content_id ?? observation.hash_status,
  );
}

export function detectPathCollisions(observations) {
  const collisionTypes = ["exact", "nfc", "casefold", "cross_platform_trailing_dot_space"];
  const rows = [];

  for (const collisionType of collisionTypes) {
    const groups = new Map();
    for (const observation of observations) {
      const key = observation?.path_collision_keys?.[collisionType];
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(observation);
    }

    for (const [collisionKey, grouped] of groups) {
      const distinctExactKeys = new Set(grouped.map((entry) => entry.path_collision_keys.exact));
      if (distinctExactKeys.size < 2) continue;
      const observationIds = grouped.map((entry) => entry.observation_id).sort();
      rows.push({
        collision_id: stableId("collision", collisionType, collisionKey, ...observationIds),
        collision_type: collisionType,
        collision_key: collisionKey,
        observation_ids: observationIds,
        relative_paths: grouped
          .map((entry) => entry.relative_path)
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right)),
        resolution: "conflict_review",
        overwrite_allowed: false,
      });
    }
  }

  return rows.sort((left, right) => left.collision_id.localeCompare(right.collision_id));
}

export async function scanWorkspace(options = {}) {
  const projectCode = normalizeIdentifier(options.projectCode, "project_code");
  const workspaceBindingId = normalizeIdentifier(options.workspaceBindingId, "workspace_binding_id");
  const nodeId = normalizeIdentifier(options.nodeId, "node_id");
  const nodeRole = normalizeIdentifier(options.nodeRole, "node_role");
  assertNodeRole(nodeRole);
  if (options.bindingValid !== true) {
    throw new Error("file_activity_binding_not_confirmed");
  }
  if (nodeRole === "always_on_node" && options.operationalPrimary !== true) {
    throw new Error("file_activity_always_on_scan_requires_operational_primary");
  }

  const observedAt = normalizeIso(options.observedAt ?? new Date().toISOString(), "observed_at");
  const ingestedAt = normalizeIso(options.ingestedAt ?? new Date().toISOString(), "ingested_at");
  const scanId = normalizeScanId(options.scanId ?? makeScanId({ nodeId, observedAt, ingestedAt }));
  const clockAssessment = assessClock(observedAt, ingestedAt);
  const verifiedHashTtlMs = normalizeNonNegativeInteger(
    options.verifiedHashTtlMs,
    FILE_ACTIVITY_CACHE_POLICY.verified_hash_ttl_ms,
    "verified_hash_cache_ttl_ms",
  );
  if (verifiedHashTtlMs < 1 || verifiedHashTtlMs > FILE_ACTIVITY_CACHE_POLICY.max_verified_hash_ttl_ms) {
    throw new Error("file_activity_verified_hash_cache_ttl_ms_invalid");
  }
  const immediateHashBytes = normalizeNonNegativeInteger(
    options.immediateHashBytes,
    DEFAULT_IMMEDIATE_HASH_BYTES,
    "immediate_hash_bytes",
  );
  const byteBudget = normalizeNonNegativeInteger(
    options.byteBudget,
    DEFAULT_SCAN_BYTE_BUDGET,
    "byte_budget",
  );
  const maxEntries = normalizePositiveIntegerOrInfinity(options.maxEntries, Number.POSITIVE_INFINITY, "max_entries");
  let cacheChainState = options.previousCache ? "preserved" : "initialized";
  let previousCache;
  try {
    previousCache = normalizePreviousCache(options.previousCache, {
      projectCode,
      workspaceBindingId,
      nodeId,
      ingestedAt,
      ignoreEntries: options.forceRehash === true,
    });
  } catch (error) {
    if (options.forceRehash !== true) throw error;
    previousCache = normalizePreviousCache(null, {
      projectCode,
      workspaceBindingId,
      nodeId,
      ingestedAt,
      ignoreEntries: true,
    });
    cacheChainState = "reset_requires_rebinding";
  }
  const producerChain = nextProducerChain(previousCache);
  const rootInput = options.rootPath;
  if (!rootInput) throw new Error("file_activity_root_required");
  const resolvedRootInput = path.resolve(rootInput);
  if (isCollectorOwnedPath(resolvedRootInput)) {
    return buildUnavailableScanResult({
      projectCode,
      workspaceBindingId,
      nodeId,
      nodeRole,
      observedAt,
      ingestedAt,
      scanId,
      clockAssessment,
      immediateHashBytes,
      byteBudget,
      previousCache,
      producerChain,
      forceRehash: options.forceRehash === true,
      gapReason: "collector_owned_root_withheld",
      excludedEntryCount: 1,
    });
  }
  if (isSensitivePath(resolvedRootInput)) {
    return buildUnavailableScanResult({
      projectCode,
      workspaceBindingId,
      nodeId,
      nodeRole,
      observedAt,
      ingestedAt,
      scanId,
      clockAssessment,
      immediateHashBytes,
      byteBudget,
      previousCache,
      producerChain,
      forceRehash: options.forceRehash === true,
      gapReason: "sensitive_root_withheld",
      withheldSensitiveCount: 1,
      sensitiveRootWithheld: true,
    });
  }
  const rootPath = await realpath(resolvedRootInput).catch(() => null);
  if (!rootPath) {
    return buildUnavailableScanResult({
      projectCode,
      workspaceBindingId,
      nodeId,
      nodeRole,
      observedAt,
      ingestedAt,
      scanId,
      clockAssessment,
      immediateHashBytes,
      byteBudget,
      previousCache,
      producerChain,
      forceRehash: options.forceRehash === true,
    });
  }
  if (isCollectorOwnedPath(rootPath)) {
    return buildUnavailableScanResult({
      projectCode,
      workspaceBindingId,
      nodeId,
      nodeRole,
      observedAt,
      ingestedAt,
      scanId,
      clockAssessment,
      immediateHashBytes,
      byteBudget,
      previousCache,
      producerChain,
      forceRehash: options.forceRehash === true,
      gapReason: "collector_owned_root_withheld",
      excludedEntryCount: 1,
    });
  }
  if (isSensitivePath(rootPath)) {
    return buildUnavailableScanResult({
      projectCode,
      workspaceBindingId,
      nodeId,
      nodeRole,
      observedAt,
      ingestedAt,
      scanId,
      clockAssessment,
      immediateHashBytes,
      byteBudget,
      previousCache,
      producerChain,
      forceRehash: options.forceRehash === true,
      gapReason: "sensitive_root_withheld",
      withheldSensitiveCount: 1,
      sensitiveRootWithheld: true,
    });
  }
  const rootStat = await lstat(rootPath).catch(() => null);
  if (!rootStat) {
    return buildUnavailableScanResult({
      projectCode,
      workspaceBindingId,
      nodeId,
      nodeRole,
      observedAt,
      ingestedAt,
      scanId,
      clockAssessment,
      immediateHashBytes,
      byteBudget,
      previousCache,
      producerChain,
      forceRehash: options.forceRehash === true,
    });
  }
  if (!rootStat.isDirectory()) throw new Error("file_activity_root_not_directory");
  const cacheEntries = new Map((previousCache?.entries ?? []).map((entry) => [entry.path_fingerprint, entry]));
  const nextCacheEntries = [];
  const observations = [];
  const gapReasons = [];
  const scanErrors = [];
  let hashedBytes = 0;
  let enumeratedCount = 0;
  let excludedCount = 0;
  let withheldCount = 0;
  let queuedHashCount = 0;
  let reusedHashCount = 0;
  let listingLimited = false;

  async function walk(directoryPath, rawDirectoryRelative = "") {
    if (listingLimited) return;
    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      scanErrors.push({
        reason: "directory_read_failed",
        relative_directory: rawDirectoryRelative ? rawDirectoryRelative.normalize("NFC") : ".",
      });
      addUnique(gapReasons, "directory_read_failed");
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (listingLimited) break;
      const rawRelative = rawDirectoryRelative ? path.join(rawDirectoryRelative, entry.name) : entry.name;
      const absoluteEntry = path.join(directoryPath, entry.name);
      const sensitivePath = isSensitivePath(rawRelative);
      let entryStat;
      try {
        entryStat = await lstat(absoluteEntry);
      } catch {
        if (sensitivePath) {
          withheldCount += 1;
          scanErrors.push({ reason: "sensitive_entry_stat_failed" });
        } else {
          scanErrors.push({ reason: "entry_stat_failed", relative_path: toPosixPath(rawRelative).normalize("NFC") });
        }
        addUnique(gapReasons, "entry_stat_failed");
        continue;
      }

      if (sensitivePath) {
        withheldCount += 1;
        continue;
      }
      if (entryStat.isSymbolicLink()) {
        excludedCount += 1;
        continue;
      }
      if (entryStat.isDirectory()) {
        if (
          EXCLUDED_DIRECTORY_NAMES.has(entry.name)
          || isTemporaryName(entry.name)
          || isCollectorOwnedPath(absoluteEntry)
        ) {
          excludedCount += 1;
          continue;
        }
        const containedDirectory = await realpath(absoluteEntry).catch(() => null);
        if (!containedDirectory || !isContainedPath(containedDirectory, rootPath)) {
          addUnique(gapReasons, "directory_containment_failed");
          scanErrors.push({ reason: "directory_containment_failed", relative_directory: toPosixPath(rawRelative).normalize("NFC") });
          continue;
        }
        await walk(containedDirectory, rawRelative);
        continue;
      }
      if (!entryStat.isFile()) {
        excludedCount += 1;
        continue;
      }
      if (isTemporaryName(entry.name)) {
        excludedCount += 1;
        continue;
      }
      if (enumeratedCount >= maxEntries) {
        listingLimited = true;
        addUnique(gapReasons, "entry_budget_exhausted");
        break;
      }
      enumeratedCount += 1;

      const rawPosixRelative = toPosixPath(rawRelative);
      const normalizedRelative = rawPosixRelative.normalize("NFC");
      const pathCollisionKeys = buildPathCollisionKeys(rawPosixRelative);
      const pathFingerprint = pathFingerprintForCollisionKeys(pathCollisionKeys);
      const statTuple = {
        size_bytes: Number(entryStat.size),
        modified_time_ms: entryStat.mtime.getTime(),
        changed_time_ms: entryStat.ctime.getTime(),
      };
      const fsModifiedAt = {
        value: entryStat.mtime.toISOString(),
        trust: "untrusted_hint",
        ordering_authority: false,
      };
      let contentId = null;
      let hashStatus;

      const cached = cacheEntries.get(pathFingerprint);
      if (
        options.forceRehash !== true
        && cached
        && Date.parse(ingestedAt) - Date.parse(cached.verified_at) <= verifiedHashTtlMs
        && cached.stat_tuple?.size_bytes === statTuple.size_bytes
        && cached.stat_tuple?.modified_time_ms === statTuple.modified_time_ms
        && cached.stat_tuple?.changed_time_ms === statTuple.changed_time_ms
        && isExactContentId(cached.content_id)
      ) {
        contentId = cached.content_id;
        hashStatus = "cached_exact";
        reusedHashCount += 1;
      } else if (entryStat.size > immediateHashBytes) {
        hashStatus = "queued_large";
        queuedHashCount += 1;
        addUnique(gapReasons, "large_file_hash_queued");
      } else if (hashedBytes + entryStat.size > byteBudget) {
        hashStatus = "queued_budget";
        queuedHashCount += 1;
        addUnique(gapReasons, "hash_byte_budget_exhausted");
      } else {
        try {
          contentId = await sha256File(absoluteEntry);
          hashedBytes += Number(entryStat.size);
          const postHashStat = await lstat(absoluteEntry);
          const stableAfterHash = (
            postHashStat.isFile()
            && !postHashStat.isSymbolicLink()
            && Number(postHashStat.size) === statTuple.size_bytes
            && postHashStat.mtime.getTime() === statTuple.modified_time_ms
            && postHashStat.ctime.getTime() === statTuple.changed_time_ms
          );
          if (stableAfterHash) {
            hashStatus = "hashed_exact";
          } else {
            contentId = null;
            hashStatus = "queued_unstable";
            queuedHashCount += 1;
            addUnique(gapReasons, "file_changed_during_hash");
          }
        } catch {
          contentId = null;
          hashStatus = "hash_error";
          queuedHashCount += 1;
          addUnique(gapReasons, "file_hash_failed");
        }
      }
      const observation = {
        observation_id: null,
        scan_id: scanId,
        workspace_binding_id: workspaceBindingId,
        node_id: nodeId,
        node_role: nodeRole,
        observed_at: observedAt,
        ingested_at: ingestedAt,
        relative_path: normalizedRelative,
        relative_path_spelling: rawPosixRelative,
        path_fingerprint: pathFingerprint,
        path_collision_keys: pathCollisionKeys,
        entry_kind: "file",
        size_bytes: Number(entryStat.size),
        fs_modified_at: fsModifiedAt,
        content_id: contentId,
        hash_status: hashStatus,
        withheld: false,
        withheld_reason: null,
      };
      observation.observation_id = observationIdFor(observation);
      observations.push(observation);

      if (isExactContentId(contentId)) {
        const reusedCacheEntry = hashStatus === "cached_exact" ? cached : null;
        nextCacheEntries.push({
          path_fingerprint: pathFingerprint,
          relative_path: normalizedRelative,
          relative_path_spelling: rawPosixRelative,
          path_collision_keys: pathCollisionKeys,
          stat_tuple: statTuple,
          content_id: contentId,
          verified_at: reusedCacheEntry?.verified_at ?? ingestedAt,
          provenance: reusedCacheEntry
            ? structuredClone(reusedCacheEntry.provenance)
            : {
                verification_method: "streamed_full_file",
                algorithm: "sha256",
                producer_node_id: nodeId,
                source_scan_id: scanId,
                source_observation_id: observation.observation_id,
                source_packet_digest: null,
              },
        });
      }
    }
  }

  await walk(rootPath);
  observations.sort((left, right) => left.path_fingerprint.localeCompare(right.path_fingerprint));
  nextCacheEntries.sort((left, right) => left.path_fingerprint.localeCompare(right.path_fingerprint));
  const collisions = detectPathCollisions(observations);
  const listingComplete = !listingLimited && !gapReasons.some((reason) => [
    "directory_read_failed",
    "entry_stat_failed",
    "entry_budget_exhausted",
    "directory_containment_failed",
  ].includes(reason));
  const hashComplete = !gapReasons.some((reason) => [
    "large_file_hash_queued",
    "hash_byte_budget_exhausted",
    "file_hash_failed",
    "file_changed_during_hash",
  ].includes(reason));
  const complete = listingComplete && hashComplete;

  const packet = {
    schema_version: FILE_OBSERVATION_PACKET_SCHEMA,
    packet_kind: "file_observation_scan",
    scan_id: scanId,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    node_id: nodeId,
    node_role: nodeRole,
    node_sequence: producerChain.node_sequence,
    prior_scan_id: producerChain.prior_scan_id,
    prior_packet_digest: producerChain.prior_packet_digest,
    observed_at: observedAt,
    ingested_at: ingestedAt,
    temporal_ordering: clockAssessment,
    cadence: cadenceForRole(nodeRole),
    coverage: {
      complete,
      listing_complete: listingComplete,
      hash_complete: hashComplete,
      gap_reasons: gapReasons,
      scan_errors: scanErrors,
    },
    hash_policy: {
      algorithm: "sha256",
      exact_content_id_prefix: "sha256:",
      immediate_hash_max_bytes: immediateHashBytes,
      scan_byte_budget: byteBudget,
      hashed_bytes: hashedBytes,
      weak_or_sample_hash_is_identity: false,
      unchanged_stat_tuple_cache_enabled: true,
      force_rehash: options.forceRehash === true,
    },
    counts: {
      observed_file_count: observations.length,
      exact_content_count: observations.filter((entry) => isExactContentId(entry.content_id)).length,
      cached_exact_count: reusedHashCount,
      queued_hash_count: queuedHashCount,
      withheld_sensitive_count: withheldCount,
      excluded_entry_count: excludedCount,
      collision_count: collisions.length,
    },
    observations,
    collisions,
    boundary: {
      metadata_only_output: true,
      file_contents_stream_hashed: true,
      file_contents_retained: false,
      absolute_paths_in_output: false,
      fs_modified_at_is_untrusted_hint: true,
      creation_time_claimed: false,
      symlinks_or_junctions_followed: false,
      sensitive_files_hashed: false,
      raw_upload_name_is_identity: false,
      activation_state: "candidate_not_scheduled",
      live_scheduler_enabled: false,
      transport_enabled: false,
    },
  };

  if (nextCacheEntries.length > FILE_ACTIVITY_CACHE_LIMITS.entries) {
    throw new Error("file_activity_scan_cache_entries_limit_exceeded");
  }
  const nextCache = {
    schema_version: FILE_SCAN_CACHE_SCHEMA,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    node_id: nodeId,
    updated_at: ingestedAt,
    entries: nextCacheEntries,
  };

  const packetDigest = canonicalPacketDigest(packet);
  for (const entry of nextCache.entries) {
    if (entry.provenance.source_scan_id === scanId && entry.provenance.source_packet_digest === null) {
      entry.provenance.source_packet_digest = packetDigest;
    }
  }
  nextCache.last_node_sequence = producerChain.node_sequence;
  nextCache.next_node_sequence = producerChain.node_sequence + 1;
  nextCache.last_scan_id = scanId;
  nextCache.last_packet_digest = packetDigest;

  return { packet, next_cache: nextCache, cache_chain_state: cacheChainState };
}

export function reconcileObservationPackets(options = {}) {
  return reconcileObservationPacketsInternal(options).state;
}

export function reconcileObservationPacketsWithArtifacts(options = {}) {
  const result = reconcileObservationPacketsInternal(options);
  return {
    state: result.state,
    artifacts: buildReconciliationArtifacts(result),
  };
}

function reconcileObservationPacketsInternal(options = {}) {
  const projectCode = normalizeIdentifier(options.projectCode, "project_code");
  const workspaceBindingId = normalizeIdentifier(options.workspaceBindingId, "workspace_binding_id");
  const reconcilerNodeId = normalizeIdentifier(options.reconcilerNodeId, "reconciler_node_id");
  if (options.bindingValid !== true) {
    throw new Error("file_activity_reconcile_binding_not_confirmed");
  }
  if (options.reconcilerNodeRole !== "always_on_node" || options.operationalPrimary !== true) {
    throw new Error("file_activity_reconcile_requires_operational_primary_always_on_node");
  }
  const absenceThreshold = normalizePositiveIntegerOrInfinity(
    options.absenceThreshold,
    DEFAULT_ABSENCE_THRESHOLD,
    "absence_threshold",
  );
  if (!Number.isFinite(absenceThreshold)) throw new Error("file_activity_absence_threshold_invalid");
  const deletionGraceMs = normalizeNonNegativeInteger(
    options.deletionGraceMs,
    DEFAULT_DELETION_GRACE_MS,
    "deletion_grace_ms",
  );
  const receivedAt = normalizeIso(options.receivedAt ?? new Date().toISOString(), "reconcile_received_at");
  if (!Array.isArray(options.packets ?? []) || (options.packets ?? []).length > FILE_ACTIVITY_RECONCILE_LIMITS.packet_batch) {
    throw new Error("file_activity_reconcile_packet_batch_limit_exceeded");
  }

  const state = normalizePreviousState(options.previousState, {
    projectCode,
    workspaceBindingId,
    reconcilerNodeId,
  });
  const priorObservationIds = new Set(state.observations.map((entry) => entry.observation_id));
  const priorReconciliationEventIds = new Set(state.recent_events.map((entry) => entry.event_id));
  const priorCoverageGapIds = new Set(state.coverage_gaps.map((entry) => entry.gap_id));
  if ((options.packets ?? []).length > 0 && state.updated_at && receivedAt < state.updated_at) {
    throw new Error("file_activity_primary_receipt_clock_regressed");
  }
  const candidatesByScan = new Map();
  for (const sourcePacket of options.packets ?? []) {
    const packet = validatePacket(sourcePacket, { projectCode, workspaceBindingId });
    const packetDigest = digestValidatedPacket(packet);
    const existingReceipt = state.scan_receipts.find((entry) => entry.scan_id === packet.scan_id);
    if (existingReceipt && existingReceipt.packet_digest !== packetDigest) {
      throw new Error("file_activity_scan_digest_conflict");
    }
    const pending = candidatesByScan.get(packet.scan_id);
    if (pending && pending.packet_digest !== packetDigest) {
      throw new Error("file_activity_scan_digest_conflict");
    }
    candidatesByScan.set(packet.scan_id, { packet, packet_digest: packetDigest });
  }

  const candidates = [...candidatesByScan.values()].sort((left, right) => comparePackets(left.packet, right.packet));
  for (const candidate of candidates) {
    const { packet, packet_digest: packetDigest } = candidate;
    let receipt = state.scan_receipts.find((entry) => entry.scan_id === packet.scan_id);
    if (receipt && !RETRIABLE_RECEIPT_DISPOSITIONS.has(receipt.disposition)) continue;
    state.updated_at = laterIso(state.updated_at, receivedAt);
    let cursor = state.node_cursors.find((entry) => entry.node_id === packet.node_id);
    if (!cursor) {
      cursor = {
        node_id: packet.node_id,
        last_sequence: 0,
        last_scan_id: null,
        last_packet_digest: null,
        last_observed_at: null,
        last_ingested_at: null,
        last_received_at: null,
      };
      state.node_cursors.push(cursor);
    }

    if (packet.node_sequence <= cursor.last_sequence) {
      receipt = upsertScanReceipt(state, {
        scan_id: packet.scan_id,
        packet_digest: packetDigest,
        node_id: packet.node_id,
        node_sequence: packet.node_sequence,
        received_at: receivedAt,
        packet_ref: packet.packet_ref,
        disposition: "late_stale_no_mutation",
      });
      appendHeldPacketEvidence(state, packet, "late_or_stale_node_sequence");
      addSequenceGap(state, packet, "late_or_stale_node_sequence", false);
      continue;
    }
    if (packet.node_sequence > cursor.last_sequence + 1) {
      upsertScanReceipt(state, {
        scan_id: packet.scan_id,
        packet_digest: packetDigest,
        node_id: packet.node_id,
        node_sequence: packet.node_sequence,
        received_at: receivedAt,
        packet_ref: packet.packet_ref,
        disposition: "sequence_gap_held",
      });
      appendHeldPacketEvidence(state, packet, "node_sequence_gap");
      addSequenceGap(state, packet, "node_sequence_gap", true, cursor.last_sequence + 1);
      continue;
    }
    const chainMatches = packet.node_sequence === 1
      ? packet.prior_scan_id === null && packet.prior_packet_digest === null
      : packet.prior_scan_id === cursor.last_scan_id && packet.prior_packet_digest === cursor.last_packet_digest;
    if (!chainMatches) {
      upsertScanReceipt(state, {
        scan_id: packet.scan_id,
        packet_digest: packetDigest,
        node_id: packet.node_id,
        node_sequence: packet.node_sequence,
        received_at: receivedAt,
        packet_ref: packet.packet_ref,
        disposition: "producer_chain_mismatch_no_mutation",
      });
      appendHeldPacketEvidence(state, packet, "producer_chain_mismatch");
      addSequenceGap(state, packet, "producer_chain_mismatch", true, cursor.last_sequence + 1);
      continue;
    }
    if (
      (cursor.last_observed_at !== null && packet.observed_at < cursor.last_observed_at)
      || (cursor.last_ingested_at !== null && packet.ingested_at < cursor.last_ingested_at)
    ) {
      throw new Error("file_activity_producer_clock_regressed");
    }

    reducePacketIntoState(state, packet, { absenceThreshold, deletionGraceMs, receivedAt });
    upsertScanReceipt(state, {
      scan_id: packet.scan_id,
      packet_digest: packetDigest,
      node_id: packet.node_id,
      node_sequence: packet.node_sequence,
      received_at: receivedAt,
      packet_ref: packet.packet_ref,
      disposition: "applied",
    });
    cursor.last_sequence = packet.node_sequence;
    cursor.last_scan_id = packet.scan_id;
    cursor.last_packet_digest = packetDigest;
    cursor.last_observed_at = packet.observed_at;
    cursor.last_ingested_at = packet.ingested_at;
    cursor.last_received_at = receivedAt;
    state.updated_at = laterIso(state.updated_at, receivedAt);
  }

  const runCapture = {
    receipt_rows: candidates.map(({ packet, packet_digest: packetDigest }) => {
      const receipt = state.scan_receipts.find((entry) => entry.scan_id === packet.scan_id);
      if (!receipt || receipt.packet_digest !== packetDigest) {
        throw new Error("file_activity_reconcile_receipt_capture_missing");
      }
      return {
        scan_id: receipt.scan_id,
        packet_digest: receipt.packet_digest,
        packet_ref: receipt.packet_ref,
        node_id: receipt.node_id,
        node_role: packet.node_role,
        node_sequence: receipt.node_sequence,
        packet_observed_at: packet.observed_at,
        packet_ingested_at: packet.ingested_at,
        receipt_received_at: receipt.received_at,
        reconciled_at: receivedAt,
        disposition: receipt.disposition,
      };
    }),
    observation_events: state.observations
      .filter((entry) => !priorObservationIds.has(entry.observation_id))
      .map((entry) => structuredClone(entry)),
    reconciliation_events: state.recent_events
      .filter((entry) => !priorReconciliationEventIds.has(entry.event_id))
      .map((entry) => structuredClone(entry)),
    coverage_gaps: state.coverage_gaps
      .filter((entry) => !priorCoverageGapIds.has(entry.gap_id))
      .map((entry) => structuredClone(entry)),
  };
  state.processed_scan_ids = state.scan_receipts.map((entry) => entry.scan_id);
  finalizeRevisionState(state);
  return {
    state,
    runCapture,
    projectCode,
    workspaceBindingId,
    reconcilerNodeId,
    receivedAt,
    validatedPackets: candidates.map((entry) => ({
      packet: entry.packet,
      packet_digest: entry.packet_digest,
    })),
  };
}

export const reduceFileObservationState = reconcileObservationPackets;

export function canonicalPacketDigest(packet) {
  const validated = validatePacket(packet, {
    projectCode: normalizeIdentifier(packet?.project_code, "packet_project_code"),
    workspaceBindingId: normalizeIdentifier(packet?.workspace_binding_id, "packet_workspace_binding_id"),
  });
  return digestValidatedPacket(validated);
}

function digestValidatedPacket(validatedPacket) {
  const { packet_ref: _packetRef, ...digestSurface } = validatedPacket;
  return `sha256:${createHash("sha256").update(canonicalJson(digestSurface), "utf8").digest("hex")}`;
}

export function canonicalRevisionStateDigest(state) {
  return `sha256:${createHash("sha256").update(canonicalJson(state), "utf8").digest("hex")}`;
}

export function durableReceiptIdFor({ projectCode, workspaceBindingId, scanId }) {
  return stableId(
    "receipt",
    normalizeIdentifier(projectCode, "receipt_project_code"),
    normalizeIdentifier(workspaceBindingId, "receipt_workspace_binding_id"),
    normalizeScanId(scanId),
  );
}

export function validateDurableReceiptArtifact(receipt, options = {}) {
  requireExactRecordKeys(receipt, [
    "schema_version",
    "receipt_id",
    "project_code",
    "workspace_binding_id",
    "scan_id",
    "packet_digest",
    "packet_ref",
    "node_id",
    "node_role",
    "node_sequence",
    "packet_observed_at",
    "packet_ingested_at",
    "first_received_at",
    "acceptance",
    "boundary",
  ], "durable_receipt");
  if (receipt.schema_version !== FILE_RECONCILE_RECEIPT_SCHEMA) {
    throw new Error("file_activity_durable_receipt_schema_invalid");
  }
  const projectCode = normalizeIdentifier(options.projectCode, "receipt_project_code");
  const workspaceBindingId = normalizeIdentifier(options.workspaceBindingId, "receipt_workspace_binding_id");
  if (receipt.project_code !== projectCode || receipt.workspace_binding_id !== workspaceBindingId) {
    throw new Error("file_activity_durable_receipt_scope_mismatch");
  }
  const scanId = normalizeScanId(receipt.scan_id);
  const nodeId = normalizeIdentifier(receipt.node_id, "receipt_node_id");
  const nodeRole = String(receipt.node_role ?? "");
  assertNodeRole(nodeRole);
  const sanitized = {
    schema_version: FILE_RECONCILE_RECEIPT_SCHEMA,
    receipt_id: durableReceiptIdFor({ projectCode, workspaceBindingId, scanId }),
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    scan_id: scanId,
    packet_digest: normalizeContentDigest(receipt.packet_digest, "receipt_packet_digest"),
    packet_ref: sanitizePacketRef(receipt.packet_ref, projectCode, nodeId),
    node_id: nodeId,
    node_role: nodeRole,
    node_sequence: requiredPositiveStateInteger(receipt.node_sequence, "receipt_node_sequence"),
    packet_observed_at: normalizeIso(receipt.packet_observed_at, "receipt_packet_observed_at"),
    packet_ingested_at: normalizeIso(receipt.packet_ingested_at, "receipt_packet_ingested_at"),
    first_received_at: normalizeIso(receipt.first_received_at, "receipt_first_received_at"),
    acceptance: receipt.acceptance,
    boundary: receipt.boundary,
  };
  if (receipt.receipt_id !== sanitized.receipt_id || receipt.acceptance !== "digest_registered") {
    throw new Error("file_activity_durable_receipt_identity_invalid");
  }
  requireExactRecordKeys(receipt.boundary, [
    "metadata_only",
    "source_contents_present",
    "absolute_paths_present",
    "raw_payload_present",
    "live_activation",
  ], "durable_receipt_boundary");
  if (
    receipt.boundary.metadata_only !== true
    || receipt.boundary.source_contents_present !== false
    || receipt.boundary.absolute_paths_present !== false
    || receipt.boundary.raw_payload_present !== false
    || receipt.boundary.live_activation !== false
  ) {
    throw new Error("file_activity_durable_receipt_boundary_invalid");
  }
  return {
    ...sanitized,
    boundary: {
      metadata_only: true,
      source_contents_present: false,
      absolute_paths_present: false,
      raw_payload_present: false,
      live_activation: false,
    },
  };
}

export function restoreRevisionStateCheckpoint(checkpoint, options = {}) {
  requireExactRecordKeys(checkpoint, [
    "schema_version",
    "checkpoint_id",
    "project_code",
    "workspace_binding_id",
    "reconciler",
    "through_received_at",
    "state_digest",
    "state",
    "boundary",
  ], "revision_checkpoint");
  if (checkpoint.schema_version !== FILE_REVISION_CHECKPOINT_SCHEMA) {
    throw new Error("file_activity_revision_checkpoint_schema_invalid");
  }
  const projectCode = normalizeIdentifier(options.projectCode, "checkpoint_project_code");
  const workspaceBindingId = normalizeIdentifier(options.workspaceBindingId, "checkpoint_workspace_binding_id");
  const reconcilerNodeId = normalizeIdentifier(options.reconcilerNodeId, "checkpoint_reconciler_node_id");
  if (checkpoint.project_code !== projectCode || checkpoint.workspace_binding_id !== workspaceBindingId) {
    throw new Error("file_activity_revision_checkpoint_scope_mismatch");
  }
  requireExactRecordKeys(checkpoint.reconciler, ["node_id", "node_role", "operational_primary"], "checkpoint_reconciler");
  if (
    checkpoint.reconciler.node_id !== reconcilerNodeId
    || checkpoint.reconciler.node_role !== "always_on_node"
    || checkpoint.reconciler.operational_primary !== true
  ) {
    throw new Error("file_activity_revision_checkpoint_reconciler_mismatch");
  }
  requireExactRecordKeys(checkpoint.boundary, [
    "metadata_only",
    "source_contents_present",
    "absolute_paths_present",
    "raw_payload_present",
    "live_activation",
    "tail_replay_supported",
  ], "checkpoint_boundary");
  if (
    checkpoint.boundary.metadata_only !== true
    || checkpoint.boundary.source_contents_present !== false
    || checkpoint.boundary.absolute_paths_present !== false
    || checkpoint.boundary.raw_payload_present !== false
    || checkpoint.boundary.live_activation !== false
    || checkpoint.boundary.tail_replay_supported !== false
  ) {
    throw new Error("file_activity_revision_checkpoint_boundary_invalid");
  }
  const throughReceivedAt = normalizeNullableStateIso(
    checkpoint.through_received_at,
    "checkpoint_through_received_at",
  );
  const declaredStateDigest = normalizeContentDigest(checkpoint.state_digest, "checkpoint_state_digest");
  if (canonicalRevisionStateDigest(checkpoint.state) !== declaredStateDigest) {
    throw new Error("file_activity_revision_checkpoint_digest_mismatch");
  }
  const expectedCheckpointId = stableId(
    "checkpoint",
    projectCode,
    workspaceBindingId,
    reconcilerNodeId,
    declaredStateDigest,
  );
  if (checkpoint.checkpoint_id !== expectedCheckpointId) {
    throw new Error("file_activity_revision_checkpoint_id_mismatch");
  }
  const state = normalizePreviousState(checkpoint.state, {
    projectCode,
    workspaceBindingId,
    reconcilerNodeId,
  });
  finalizeRevisionState(state);
  if (canonicalRevisionStateDigest(state) !== declaredStateDigest || state.updated_at !== throughReceivedAt) {
    throw new Error("file_activity_revision_checkpoint_state_not_canonical");
  }
  return state;
}

function buildReconciliationArtifacts(result) {
  const {
    state,
    runCapture,
    projectCode,
    workspaceBindingId,
    reconcilerNodeId,
    receivedAt,
    validatedPackets,
  } = result;
  const stateDigest = canonicalRevisionStateDigest(state);
  const checkpointId = stableId(
    "checkpoint",
    projectCode,
    workspaceBindingId,
    reconcilerNodeId,
    stateDigest,
  );
  const packetDigests = validatedPackets.map((entry) => entry.packet_digest).sort();
  const reconcileId = stableId(
    "reconcile",
    projectCode,
    workspaceBindingId,
    reconcilerNodeId,
    receivedAt,
    stateDigest,
    ...packetDigests,
  );
  const month = receivedAt.slice(0, 7);
  const baseRef = `_workmeta/${projectCode}/reports/file_activity`;
  const receiptArtifacts = runCapture.receipt_rows
    .filter((entry) => !RETRIABLE_RECEIPT_DISPOSITIONS.has(entry.disposition))
    .map((entry) => {
    const receiptId = durableReceiptIdFor({
      projectCode,
      workspaceBindingId,
      scanId: entry.scan_id,
    });
    const receiptMonth = entry.packet_ingested_at.slice(0, 7);
    return {
      ref: `${baseRef}/receipts/${receiptMonth}/${receiptId.slice("receipt:".length)}.json`,
      value: {
        schema_version: FILE_RECONCILE_RECEIPT_SCHEMA,
        receipt_id: receiptId,
        project_code: projectCode,
        workspace_binding_id: workspaceBindingId,
        scan_id: entry.scan_id,
        packet_digest: entry.packet_digest,
        packet_ref: entry.packet_ref,
        node_id: entry.node_id,
        node_role: entry.node_role,
        node_sequence: entry.node_sequence,
        packet_observed_at: entry.packet_observed_at,
        packet_ingested_at: entry.packet_ingested_at,
        first_received_at: entry.receipt_received_at,
        acceptance: "digest_registered",
        boundary: {
          metadata_only: true,
          source_contents_present: false,
          absolute_paths_present: false,
          raw_payload_present: false,
          live_activation: false,
        },
      },
    };
    });
  const refs = {
    receipt_refs: receiptArtifacts.map((entry) => entry.ref),
    event_ref: `${baseRef}/events/${month}/${reconcileId.slice("reconcile:".length)}.json`,
    checkpoint_ref: `${baseRef}/checkpoints/${month}/${reconcileId.slice("reconcile:".length)}.json`,
    projection_ref: `${baseRef}/projections/life_tree_events.json`,
  };
  const partitionBoundary = {
    metadata_only: true,
    source_contents_present: false,
    absolute_paths_present: false,
    raw_payload_present: false,
    live_activation: false,
  };
  const runProjectionEvents = buildProjectionEvents({
    observations: runCapture.observation_events,
    reconciliationEvents: runCapture.reconciliation_events,
    state,
    receivedAt,
  });
  const eventPartition = {
    schema_version: FILE_RECONCILE_EVENT_SCHEMA,
    reconcile_id: reconcileId,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    reconciler_node_id: reconcilerNodeId,
    received_at: receivedAt,
    source_packets: validatedPackets.map((entry) => ({
      scan_id: entry.packet.scan_id,
      packet_digest: entry.packet_digest,
      packet_ref: entry.packet.packet_ref,
      node_id: entry.packet.node_id,
      node_role: entry.packet.node_role,
      node_sequence: entry.packet.node_sequence,
      observed_at: entry.packet.observed_at,
      ingested_at: entry.packet.ingested_at,
    })),
    events: runProjectionEvents,
    coverage_gaps: runCapture.coverage_gaps.map((entry) => ({
      gap_id: entry.gap_id,
      scan_id: entry.scan_id,
      node_id: entry.node_id,
      reason: entry.reason,
    })),
    boundary: partitionBoundary,
  };
  const checkpoint = {
    schema_version: FILE_REVISION_CHECKPOINT_SCHEMA,
    checkpoint_id: checkpointId,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    reconciler: structuredClone(state.reconciler),
    through_received_at: state.updated_at,
    state_digest: stateDigest,
    state: structuredClone(state),
    boundary: {
      ...partitionBoundary,
      tail_replay_supported: false,
    },
  };
  const checkpointDigest = `sha256:${createHash("sha256").update(canonicalJson(checkpoint), "utf8").digest("hex")}`;
  const currentProjectionEvents = buildProjectionEvents({
    observations: state.observations,
    reconciliationEvents: state.recent_events,
    state,
    receivedAt,
  });
  const sortedProjectionEvents = currentProjectionEvents.sort(compareProjectionEvents);
  const events = sortedProjectionEvents.slice(-FILE_ACTIVITY_PROJECTION_LIMITS.events);
  const compactionDropped = Object.values(state.compaction).some((value) => value > 0);
  const truncated = compactionDropped || sortedProjectionEvents.length > events.length;
  const gapReasons = [...new Set([
    ...state.coverage_gaps.map((entry) => entry.reason),
    "erp_upload_adapter_unavailable",
    "live_collector_not_activated",
    ...(truncated ? ["event_window_truncated"] : []),
  ])].sort();
  const receivedClocks = events.map((entry) => entry.received_at).filter(Boolean).sort();
  const sourceMonths = [...new Set([
    month,
    ...runCapture.receipt_rows.map((entry) => entry.packet_ingested_at.slice(0, 7)),
    ...receivedClocks.map((value) => value.slice(0, 7)),
  ])].sort();
  const projection = {
    schema_version: FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    generated_at: receivedAt,
    source_checkpoint: {
      checkpoint_id: checkpointId,
      checkpoint_digest: checkpointDigest,
      through_received_at: state.updated_at,
      partition_refs: [...refs.receipt_refs, refs.event_ref, refs.checkpoint_ref].sort(),
    },
    coverage: {
      state: "partial",
      from_received_at: receivedClocks[0] ?? state.updated_at,
      through_received_at: state.updated_at,
      source_months: sourceMonths,
      source_event_count: sortedProjectionEvents.length,
      event_count: events.length,
      truncated,
      gap_reasons: gapReasons,
    },
    boundary: {
      metadata_only: true,
      derived_rebuildable: true,
      absolute_paths_present: false,
      raw_payload_present: false,
      live_activation: false,
    },
    events,
  };
  return {
    reconcile_id: reconcileId,
    refs,
    receipt_artifacts: receiptArtifacts,
    event_partition: eventPartition,
    checkpoint,
    projection,
  };
}

function buildProjectionEvents({ observations, reconciliationEvents, state, receivedAt }) {
  const receiptByScan = new Map(state.scan_receipts.map((entry) => [entry.scan_id, entry]));
  const revisionById = new Map(state.revisions.map((entry) => [entry.revision_id, entry]));
  const events = [];
  for (const observation of observations) {
    const receipt = receiptByScan.get(observation.scan_id);
    const revision = observation.revision_id ? revisionById.get(observation.revision_id) : null;
    const identityClaim = observation.identity_claim ?? "unavailable";
    const temporalOrdering = observation.temporal_ordering ?? assessClock(
      observation.observed_at,
      observation.ingested_at,
    ).state;
    const observationReceivedAt = receipt?.received_at ?? receivedAt;
    const clockChangeInterval = temporalOrdering === "clock_skew_receipt_order_warning"
      ? { after: observationReceivedAt, before: observationReceivedAt, basis: "receipt_order_only_clock_skew" }
      : temporalOrdering === "clock_skew_blocked_exact_order"
        ? { after: observationReceivedAt, before: observationReceivedAt, basis: "exact_order_blocked_clock_skew" }
        : null;
    events.push({
      source_event_id: observation.observation_id,
      source_kind: "scanner_observation",
      event_kind: observation.event_kind,
      logical_file_id: observation.logical_file_id ?? null,
      revision_id: observation.revision_id ?? null,
      node_id: observation.node_id,
      node_role: observation.node_role,
      scan_id: observation.scan_id,
      packet_digest: receipt?.packet_digest ?? null,
      observation_id: observation.observation_id,
      observed_at: observation.observed_at,
      ingested_at: observation.ingested_at,
      received_at: observationReceivedAt,
      change_interval: clockChangeInterval,
      identity_claim: identityClaim,
      identity_basis: observation.identity_basis ?? null,
      uncertainty: projectionUncertainty(observation.event_kind, identityClaim),
      content_id: revision?.content_id ?? observation.content_id ?? null,
      size_bytes: revision?.size_bytes ?? observation.size_bytes ?? null,
      erp_upload_event_ref: null,
      evidence_refs: [
        observation.scan_id,
        observation.observation_id,
        receipt?.packet_digest ?? null,
      ].filter(Boolean).sort(),
      access: { visibility: "admins", account_refs: [] },
    });
  }
  for (const event of reconciliationEvents) {
    const receipt = receiptByScan.get(event.scan_id);
    events.push({
      source_event_id: event.event_id,
      source_kind: "reconciler_transition",
      event_kind: event.event_kind,
      logical_file_id: event.logical_file_id,
      revision_id: null,
      node_id: event.node_id,
      node_role: event.node_role,
      scan_id: event.scan_id,
      packet_digest: receipt?.packet_digest ?? null,
      observation_id: null,
      observed_at: event.observed_at,
      ingested_at: event.ingested_at,
      received_at: event.received_at,
      change_interval: structuredClone(event.change_interval),
      identity_claim: "unavailable",
      identity_basis: null,
      uncertainty: projectionUncertainty(event.event_kind, "unavailable"),
      content_id: null,
      size_bytes: null,
      erp_upload_event_ref: null,
      evidence_refs: [
        event.scan_id,
        event.event_id,
        event.node_binding_id ?? null,
        receipt?.packet_digest ?? null,
      ].filter(Boolean).sort(),
      access: { visibility: "admins", account_refs: [] },
    });
  }
  return events.sort(compareProjectionEvents);
}

function projectionUncertainty(eventKind, identityClaim) {
  if (eventKind === "delete" || eventKind === "restore") return "confirmed";
  if (identityClaim === "uncertain") return "review_needed";
  if (
    identityClaim === "unavailable"
    || eventKind === "hash_pending"
    || eventKind === "held_packet_evidence"
    || eventKind === "missing_candidate"
  ) return "partial";
  return "confirmed";
}

function compareProjectionEvents(left, right) {
  const leftTime = left.received_at ?? left.ingested_at ?? left.observed_at ?? "";
  const rightTime = right.received_at ?? right.ingested_at ?? right.observed_at ?? "";
  return leftTime.localeCompare(rightTime) || left.source_event_id.localeCompare(right.source_event_id);
}

function upsertScanReceipt(state, value) {
  const existing = state.scan_receipts.find((entry) => entry.scan_id === value.scan_id);
  if (existing) {
    if (existing.packet_digest !== value.packet_digest) throw new Error("file_activity_scan_digest_conflict");
    Object.assign(existing, value);
    return existing;
  }
  const receipt = structuredClone(value);
  state.scan_receipts.push(receipt);
  return receipt;
}

function appendHeldPacketEvidence(state, packet, reason) {
  for (const observation of packet.observations) {
    state.observations.push({
      ...structuredClone(observation),
      temporal_ordering: packet.temporal_ordering.state,
      event_kind: "held_packet_evidence",
      identity_claim: "unavailable",
      identity_basis: reason,
      logical_file_id: null,
      revision_id: null,
    });
  }
}

function addSequenceGap(state, packet, reason, retryAllowed, expectedSequence = null) {
  state.coverage_gaps.push({
    gap_id: stableId("gap", packet.scan_id, reason),
    scan_id: packet.scan_id,
    node_id: packet.node_id,
    reason,
    node_sequence: packet.node_sequence,
    expected_node_sequence: expectedSequence,
    state_mutation_allowed: false,
    retry_allowed: retryAllowed,
  });
}

function reducePacketIntoState(state, packet, policy) {
  const observedPathFingerprints = new Set(packet.observations.map((entry) => entry.path_fingerprint));
  const exactContentByPath = new Map(
    packet.observations
      .filter((entry) => isExactContentId(entry.content_id))
      .map((entry) => [entry.path_fingerprint, entry.content_id]),
  );
  const mappedByObservation = new Map();

  if (packet.temporal_ordering.warning) {
    state.coverage_gaps.push({
      gap_id: stableId("gap", packet.scan_id, packet.temporal_ordering.state),
      scan_id: packet.scan_id,
      node_id: packet.node_id,
      reason: packet.temporal_ordering.state,
      exact_temporal_ordering_blocked: packet.temporal_ordering.exact_temporal_ordering_blocked,
    });
  }
  if (!packet.coverage.complete) {
    state.coverage_gaps.push({
      gap_id: stableId("gap", packet.scan_id, ...packet.coverage.gap_reasons),
      scan_id: packet.scan_id,
      node_id: packet.node_id,
      reason: "scan_incomplete",
      gap_reasons: [...packet.coverage.gap_reasons],
      absence_inference_allowed: false,
    });
  }

  for (const observation of [...packet.observations].sort((left, right) => left.path_fingerprint.localeCompare(right.path_fingerprint))) {
    const mapped = mapObservation(state, packet, observation, observedPathFingerprints, exactContentByPath, policy);
    state.observations.push(mapped);
    mappedByObservation.set(observation.observation_id, mapped);
  }

  for (const collision of packet.collisions ?? []) {
    const logicalFileIds = [...new Set(
      collision.observation_ids
        .map((observationId) => mappedByObservation.get(observationId)?.logical_file_id)
        .filter(Boolean),
    )].sort();
    const row = {
      ...structuredClone(collision),
      scan_id: packet.scan_id,
      node_id: packet.node_id,
      logical_file_ids: logicalFileIds,
      conflict: true,
    };
    state.collisions.push(row);
    for (const logicalFileId of logicalFileIds) {
      const logical = findLogical(state, logicalFileId);
      addUnique(logical.conflict_reasons, `path_collision:${collision.collision_type}`);
    }
  }

  if (packet.coverage.complete && ABSENCE_AUTHORITY_ROLES.includes(packet.node_role)) {
    for (const binding of state.node_bindings) {
      if (binding.node_id !== packet.node_id) continue;
      if (observedPathFingerprints.has(binding.path_fingerprint)) continue;
      binding.absence_count += 1;
      binding.first_absent_received_at ??= policy.receivedAt;
      binding.last_absent_received_at = policy.receivedAt;
      appendReconciliationEvent(state, {
        eventKind: "missing_candidate",
        packet,
        receivedAt: policy.receivedAt,
        logicalFileId: binding.logical_file_id,
        nodeBindingId: binding.node_binding_id,
        suffix: String(binding.absence_count),
        changeInterval: {
          after: binding.last_observed_at,
          before: packet.observed_at,
          basis: "bounded_by_node_observations",
        },
        details: { absence_count: binding.absence_count },
      });
    }
    applyDeletionPolicy(state, packet, policy);
  }
}

function mapObservation(state, packet, observation, observedPathFingerprints, exactContentByPath, policy) {
  const base = {
    ...structuredClone(observation),
    temporal_ordering: packet.temporal_ordering.state,
    event_kind: null,
    identity_claim: "unavailable",
    identity_basis: null,
    logical_file_id: null,
    revision_id: null,
  };

  if (!isExactContentId(observation.content_id)) {
    base.event_kind = observation.withheld ? "withheld_sensitive" : "hash_pending";
    return base;
  }

  let binding = state.node_bindings.find(
    (entry) => entry.node_id === packet.node_id && entry.path_fingerprint === observation.path_fingerprint,
  );
  let logical = binding ? findLogical(state, binding.logical_file_id) : null;
  let eventKind = "observed";
  const ambiguousIdentityCandidateIds = [];

  if (!logical) {
    const samePathCandidates = uniqueLogicalCandidates(
      state,
      state.node_bindings.filter(
        (entry) => (
          entry.node_id !== packet.node_id
          && entry.path_collision_keys?.exact === observation.path_collision_keys.exact
        ),
      ),
    ).filter((entry) => entry.status === "active");
    if (samePathCandidates.length === 1) {
      logical = samePathCandidates[0];
      eventKind = "joined_shared_path";
    } else if (samePathCandidates.length > 1) {
      for (const candidate of samePathCandidates) addUnique(ambiguousIdentityCandidateIds, candidate.logical_file_id);
    }
  }

  if (!logical && ambiguousIdentityCandidateIds.length === 0 && packet.coverage.listing_complete) {
    const renameCandidates = state.node_bindings.filter((entry) => (
      entry.node_id === packet.node_id
      && entry.content_id === observation.content_id
      && !observedPathFingerprints.has(entry.path_fingerprint)
      && findLogical(state, entry.logical_file_id).status === "active"
    ));
    if (renameCandidates.length === 1) {
      binding = renameCandidates[0];
      logical = findLogical(state, binding.logical_file_id);
      eventKind = "rename";
    } else if (renameCandidates.length > 1) {
      for (const candidate of renameCandidates) addUnique(ambiguousIdentityCandidateIds, candidate.logical_file_id);
    }
  }

  if (!logical) {
    const copySources = state.node_bindings.filter((entry) => (
      entry.node_id === packet.node_id
      && entry.content_id === observation.content_id
      && observedPathFingerprints.has(entry.path_fingerprint)
      && exactContentByPath.get(entry.path_fingerprint) === observation.content_id
    ));
    if (copySources.length > 1 || ambiguousIdentityCandidateIds.length > 0) {
      for (const candidate of copySources) addUnique(ambiguousIdentityCandidateIds, candidate.logical_file_id);
    }
    const ambiguousIdentity = ambiguousIdentityCandidateIds.length > 0;
    const copiedFromLogicalFileId = !ambiguousIdentity && copySources.length === 1
      ? copySources[0].logical_file_id
      : null;
    logical = createLogicalFile(state, observation, copiedFromLogicalFileId);
    const revision = createOrReuseRevision(state, logical, observation, [], "first_observation");
    logical.current_revision_ids = [revision.revision_id];
    binding = createNodeBinding(state, packet, observation, logical, revision);
    eventKind = ambiguousIdentity
      ? "ambiguous_same_content_identity"
      : copySources.length === 1 ? "copy" : "file_first_observed";
    if (ambiguousIdentity) {
      logical.identity_state = "uncertain";
      addUnique(logical.conflict_reasons, "ambiguous_same_content_identity");
    }
    logical.status = "active";
    return {
      ...finishMappedObservation(base, eventKind, logical, revision),
      identity_candidate_logical_file_ids: [...ambiguousIdentityCandidateIds].sort(),
    };
  }

  if (logical.status === "deleted_after_confirmed_absence") {
    const deletedAt = logical.deleted_at ?? null;
    appendReconciliationEvent(state, {
      eventKind: "restore",
      packet,
      receivedAt: policy.receivedAt,
      logicalFileId: logical.logical_file_id,
      nodeBindingId: binding?.node_binding_id ?? null,
      suffix: observation.observation_id,
      changeInterval: {
        after: deletedAt,
        before: policy.receivedAt,
        basis: "bounded_by_delete_receipt_and_primary_receipt",
      },
      details: { node_observed_at: packet.observed_at },
    });
    delete logical.deleted_at;
    delete logical.deletion_basis;
  }
  logical.status = "active";
  let revision;
  if (binding && eventKind === "rename") {
    revision = findRevision(state, binding.revision_id);
    updateNodeBinding(binding, packet, observation, revision);
  } else if (!binding) {
    revision = logical.current_revision_ids
      .map((revisionId) => findRevision(state, revisionId))
      .find((entry) => entry.content_id === observation.content_id)
      ?? state.revisions.find(
        (entry) => entry.logical_file_id === logical.logical_file_id && entry.content_id === observation.content_id,
      );
    if (!revision) {
      revision = createOrReuseRevision(state, logical, observation, [], "unknown_first_node_lineage");
      addUnique(logical.current_revision_ids, revision.revision_id);
      addUnique(logical.conflict_reasons, "unknown_cross_node_lineage");
      eventKind = "cross_node_revision_unordered";
    }
    binding = createNodeBinding(state, packet, observation, logical, revision);
  } else if (binding.content_id === observation.content_id) {
    revision = findRevision(state, binding.revision_id);
    const priorModifiedAt = binding.fs_modified_at?.value ?? null;
    const currentModifiedAt = observation.fs_modified_at?.value ?? null;
    eventKind = priorModifiedAt !== currentModifiedAt || binding.size_bytes !== observation.size_bytes
      ? "touch"
      : "observed";
    updateNodeBinding(binding, packet, observation, revision);
  } else {
    const parentRevisionIds = binding.revision_id ? [binding.revision_id] : [];
    revision = createOrReuseRevision(state, logical, observation, parentRevisionIds, "node_previous_revision");
    logical.current_revision_ids = logical.current_revision_ids.filter((revisionId) => !parentRevisionIds.includes(revisionId));
    addUnique(logical.current_revision_ids, revision.revision_id);
    eventKind = "content_revision";
    updateNodeBinding(binding, packet, observation, revision);
  }

  binding.absence_count = 0;
  binding.first_absent_received_at = null;
  binding.last_absent_received_at = null;
  return finishMappedObservation(base, eventKind, logical, revision);
}

function finishMappedObservation(base, eventKind, logical, revision) {
  revision.observation_count ??= revision.observation_ids.length;
  if (!revision.observation_ids.includes(base.observation_id)) {
    revision.observation_count += 1;
    revision.observation_ids.push(base.observation_id);
  }
  revision.source_scan_ids ??= [];
  addUnique(revision.source_scan_ids, base.scan_id);
  revision.last_observed_at = laterIso(revision.last_observed_at, base.observed_at);
  revision.last_ingested_at = laterIso(revision.last_ingested_at, base.ingested_at);
  return {
    ...base,
    event_kind: eventKind,
    ...identityResolutionForEvent(eventKind),
    logical_file_id: logical.logical_file_id,
    revision_id: revision.revision_id,
  };
}

function identityResolutionForEvent(eventKind) {
  const byEvent = {
    file_first_observed: ["assigned", "first_exact_content_observation"],
    observed: ["observed", "same_node_path_and_exact_content"],
    touch: ["observed", "same_exact_content_with_changed_stat_hint"],
    content_revision: ["observed", "same_node_path_with_changed_exact_content"],
    rename: ["inferred", "unique_same_node_same_content_move_in_complete_listing"],
    copy: ["inferred", "same_node_source_path_retained_with_same_exact_content"],
    joined_shared_path: ["inferred", "cross_node_exact_path_with_existing_logical_file"],
    cross_node_revision_unordered: ["uncertain", "new_node_content_without_known_parent_revision"],
    ambiguous_same_content_identity: ["uncertain", "multiple_same_content_identity_candidates"],
    stale_observation: ["observed", "known_historical_revision_seen_on_node"],
  };
  const [identityClaim, identityBasis] = byEvent[eventKind] ?? ["uncertain", "unclassified_identity_resolution"];
  return { identity_claim: identityClaim, identity_basis: identityBasis };
}

function createLogicalFile(state, observation, copiedFromLogicalFileId) {
  const logical = {
    logical_file_id: stableId("lf", state.workspace_binding_id, observation.observation_id),
    workspace_binding_id: state.workspace_binding_id,
    first_observed_at: observation.observed_at,
    first_ingested_at: observation.ingested_at,
    status: "active",
    current_revision_ids: [],
    copied_from_logical_file_id: copiedFromLogicalFileId,
    conflict: false,
    conflict_reasons: [],
    identity_state: "assigned",
  };
  state.logical_files.push(logical);
  return logical;
}

function createOrReuseRevision(state, logical, observation, parentRevisionIds, parentBasis) {
  const parents = [...new Set(parentRevisionIds)].sort();
  const revisionId = stableId(
    "rev",
    logical.logical_file_id,
    observation.content_id,
    String(observation.size_bytes),
    ...parents,
  );
  let revision = state.revisions.find((entry) => entry.revision_id === revisionId);
  if (!revision) {
    revision = {
      revision_id: revisionId,
      logical_file_id: logical.logical_file_id,
      content_id: observation.content_id,
      size_bytes: observation.size_bytes,
      parent_revision_ids: parents,
      parent_basis: parentBasis,
      first_observed_at: observation.observed_at,
      first_ingested_at: observation.ingested_at,
      last_observed_at: observation.observed_at,
      last_ingested_at: observation.ingested_at,
      observation_ids: [],
      observation_count: 0,
      source_scan_ids: [],
      state: "head",
    };
    state.revisions.push(revision);
  }
  return revision;
}

function createNodeBinding(state, packet, observation, logical, revision) {
  const binding = {
    node_binding_id: stableId("node-file", packet.node_id, logical.logical_file_id),
    node_id: packet.node_id,
    node_role: packet.node_role,
    logical_file_id: logical.logical_file_id,
    revision_id: revision.revision_id,
    content_id: observation.content_id,
    path_fingerprint: observation.path_fingerprint,
    relative_path: observation.relative_path,
    relative_path_spelling: observation.relative_path_spelling,
    path_collision_keys: structuredClone(observation.path_collision_keys),
    size_bytes: observation.size_bytes,
    fs_modified_at: structuredClone(observation.fs_modified_at),
    last_observed_at: observation.observed_at,
    last_ingested_at: observation.ingested_at,
    absence_count: 0,
    first_absent_received_at: null,
    last_absent_received_at: null,
  };
  state.node_bindings.push(binding);
  return binding;
}

function updateNodeBinding(binding, packet, observation, revision) {
  binding.node_role = packet.node_role;
  binding.revision_id = revision.revision_id;
  binding.content_id = observation.content_id;
  binding.path_fingerprint = observation.path_fingerprint;
  binding.relative_path = observation.relative_path;
  binding.relative_path_spelling = observation.relative_path_spelling;
  binding.path_collision_keys = structuredClone(observation.path_collision_keys);
  binding.size_bytes = observation.size_bytes;
  binding.fs_modified_at = structuredClone(observation.fs_modified_at);
  binding.last_observed_at = observation.observed_at;
  binding.last_ingested_at = observation.ingested_at;
  binding.absence_count = 0;
  binding.first_absent_received_at = null;
  binding.last_absent_received_at = null;
}

function applyDeletionPolicy(state, packet, { absenceThreshold, deletionGraceMs, receivedAt }) {
  const nowIso = receivedAt;
  const nowMs = Date.parse(nowIso);
  for (const logical of state.logical_files) {
    const bindings = state.node_bindings.filter((entry) => (
      entry.logical_file_id === logical.logical_file_id
      && ABSENCE_AUTHORITY_ROLES.includes(entry.node_role)
    ));
    if (bindings.length === 0) continue;
    const safelyAbsent = bindings.every((binding) => (
      binding.absence_count >= absenceThreshold
      && binding.first_absent_received_at
      && nowMs - Date.parse(binding.first_absent_received_at) >= deletionGraceMs
    ));
    if (safelyAbsent && logical.status !== "deleted_after_confirmed_absence") {
      logical.status = "deleted_after_confirmed_absence";
      logical.deleted_at = nowIso;
      logical.deletion_basis = {
        complete_scan_absence_threshold: absenceThreshold,
        grace_ms: deletionGraceMs,
        node_binding_count: bindings.length,
        authority_roles: [...ABSENCE_AUTHORITY_ROLES],
      };
      appendReconciliationEvent(state, {
        eventKind: "delete",
        packet,
        receivedAt,
        logicalFileId: logical.logical_file_id,
        nodeBindingId: null,
        suffix: nowIso,
        changeInterval: {
          after: bindings.map((binding) => binding.first_absent_received_at).filter(Boolean).sort()[0] ?? null,
          before: receivedAt,
          basis: "confirmed_absence_receipt_threshold",
        },
        details: {
          authoritative_binding_count: bindings.length,
          absence_threshold: absenceThreshold,
        },
      });
    }
  }
}

function appendReconciliationEvent(state, {
  eventKind,
  packet,
  receivedAt,
  logicalFileId,
  nodeBindingId,
  suffix,
  changeInterval,
  details,
}) {
  const eventId = stableId("file-event", eventKind, packet.scan_id, logicalFileId, nodeBindingId ?? "", suffix ?? "");
  if (state.recent_events.some((entry) => entry.event_id === eventId)) return;
  state.recent_events.push({
    event_id: eventId,
    event_kind: eventKind,
    scan_id: packet.scan_id,
    packet_ref: packet.packet_ref,
    node_id: packet.node_id,
    node_role: packet.node_role,
    node_sequence: packet.node_sequence,
    observed_at: packet.observed_at,
    ingested_at: packet.ingested_at,
    received_at: receivedAt,
    logical_file_id: logicalFileId,
    node_binding_id: nodeBindingId,
    change_interval: changeInterval,
    details,
  });
}

function finalizeRevisionState(state) {
  applyGlobalPathCollisions(state);
  enforceRevisionStateGraphCeilings(state);
  state.compaction ??= {
    recent_event_summaries_dropped_total: 0,
    recent_reconciliation_events_dropped_total: 0,
    scan_receipts_dropped_total: 0,
    revision_observation_refs_dropped_total: 0,
    coverage_gaps_dropped_total: 0,
    collision_rows_dropped_total: 0,
  };
  const receipts = dedupeBy(state.scan_receipts, "scan_id").sort((left, right) => (
    left.received_at.localeCompare(right.received_at)
    || left.node_id.localeCompare(right.node_id)
    || left.node_sequence - right.node_sequence
  ));
  const receiptDropCount = Math.max(0, receipts.length - FILE_ACTIVITY_STATE_LIMITS.scan_receipts);
  state.compaction.scan_receipts_dropped_total += receiptDropCount;
  state.scan_receipts = receipts.slice(-FILE_ACTIVITY_STATE_LIMITS.scan_receipts);
  state.processed_scan_ids = state.scan_receipts.map((entry) => entry.scan_id).sort();
  state.node_cursors = dedupeBy(state.node_cursors, "node_id").sort((left, right) => left.node_id.localeCompare(right.node_id));
  const coverageGaps = dedupeBy(state.coverage_gaps, "gap_id").sort((left, right) => left.gap_id.localeCompare(right.gap_id));
  const coverageGapDropCount = Math.max(0, coverageGaps.length - FILE_ACTIVITY_STATE_LIMITS.coverage_gaps);
  state.compaction.coverage_gaps_dropped_total += coverageGapDropCount;
  state.coverage_gaps = coverageGaps.slice(-FILE_ACTIVITY_STATE_LIMITS.coverage_gaps);
  const collisions = dedupeBy(state.collisions, "collision_id").sort((left, right) => left.collision_id.localeCompare(right.collision_id));
  const collisionDropCount = Math.max(0, collisions.length - FILE_ACTIVITY_STATE_LIMITS.collision_rows);
  state.compaction.collision_rows_dropped_total += collisionDropCount;
  state.collisions = collisions.slice(-FILE_ACTIVITY_STATE_LIMITS.collision_rows);
  const recentEvents = dedupeBy(state.observations, "observation_id")
    .map((entry) => toRecentEventSummary(entry))
    .sort(compareObservations);
  const recentDropCount = Math.max(0, recentEvents.length - FILE_ACTIVITY_STATE_LIMITS.recent_event_summaries);
  state.compaction.recent_event_summaries_dropped_total += recentDropCount;
  state.observations = recentEvents.slice(-FILE_ACTIVITY_STATE_LIMITS.recent_event_summaries);
  const reconciliationEvents = dedupeBy(state.recent_events, "event_id").sort((left, right) => (
    left.received_at.localeCompare(right.received_at) || left.event_id.localeCompare(right.event_id)
  ));
  const reconciliationEventDropCount = Math.max(
    0,
    reconciliationEvents.length - FILE_ACTIVITY_STATE_LIMITS.recent_reconciliation_events,
  );
  state.compaction.recent_reconciliation_events_dropped_total += reconciliationEventDropCount;
  state.recent_events = reconciliationEvents.slice(-FILE_ACTIVITY_STATE_LIMITS.recent_reconciliation_events);
  state.node_bindings.sort((left, right) => left.node_binding_id.localeCompare(right.node_binding_id));
  state.revisions.sort((left, right) => left.revision_id.localeCompare(right.revision_id));
  state.logical_files.sort((left, right) => left.logical_file_id.localeCompare(right.logical_file_id));

  for (const logical of state.logical_files) {
    logical.current_revision_ids = [...new Set(logical.current_revision_ids)].sort();
    logical.conflict_reasons = [...new Set(logical.conflict_reasons)].sort();
    if (logical.current_revision_ids.length > 1) addUnique(logical.conflict_reasons, "concurrent_revision_heads");
    logical.conflict_reasons.sort();
    logical.conflict = logical.conflict_reasons.length > 0;
  }
  const headIds = new Set(state.logical_files.flatMap((logical) => logical.current_revision_ids));
  for (const revision of state.revisions) {
    const observationIds = [...new Set(revision.observation_ids)];
    const sourceScanIds = [...new Set(revision.source_scan_ids ?? [])];
    const revisionDropCount = Math.max(0, observationIds.length - FILE_ACTIVITY_STATE_LIMITS.revision_observation_refs);
    state.compaction.revision_observation_refs_dropped_total += revisionDropCount;
    revision.observation_ids = observationIds.slice(-FILE_ACTIVITY_STATE_LIMITS.revision_observation_refs);
    revision.source_scan_ids = sourceScanIds.slice(-FILE_ACTIVITY_STATE_LIMITS.revision_observation_refs);
    revision.state = headIds.has(revision.revision_id) ? "head" : "superseded";
  }
  state.counts = {
    processed_scan_count: state.processed_scan_ids.length,
    applied_scan_count: state.scan_receipts.filter((entry) => entry.disposition === "applied").length,
    held_or_stale_scan_count: state.scan_receipts.filter((entry) => entry.disposition !== "applied").length,
    observation_count: state.observations.length,
    retained_recent_event_summary_count: state.observations.length,
    retained_reconciliation_event_count: state.recent_events.length,
    retained_scan_receipt_count: state.scan_receipts.length,
    logical_file_count: state.logical_files.length,
    active_logical_file_count: state.logical_files.filter((entry) => entry.status === "active").length,
    deleted_logical_file_count: state.logical_files.filter((entry) => entry.status === "deleted_after_confirmed_absence").length,
    revision_count: state.revisions.length,
    conflict_logical_file_count: state.logical_files.filter((entry) => entry.conflict).length,
    collision_count: state.collisions.length,
    coverage_gap_count: state.coverage_gaps.length,
  };
  const graphFields = ["node_cursors", "logical_files", "revisions", "node_bindings"];
  state.storage_bounds = {
    strategy: "bounded_current_projection_with_immutable_checkpoint",
    lineage_graph_compaction_enabled: false,
    checkpoint_rebuild_supported: true,
    hard_limits: Object.fromEntries(graphFields.map((field) => [field, FILE_ACTIVITY_STATE_LIMITS[field]])),
    current_counts: Object.fromEntries(graphFields.map((field) => [field, state[field].length])),
    remaining_capacity: Object.fromEntries(graphFields.map((field) => [
      field,
      FILE_ACTIVITY_STATE_LIMITS[field] - state[field].length,
    ])),
    blocker_codes: Object.fromEntries(graphFields.map((field) => [
      field,
      `file_activity_revision_state_${field}_limit_exceeded`,
    ])),
    blocked_fields: graphFields.filter((field) => state[field].length >= FILE_ACTIVITY_STATE_LIMITS[field]),
  };
}

function toRecentEventSummary(observation) {
  return {
    observation_id: observation.observation_id,
    scan_id: observation.scan_id,
    node_id: observation.node_id,
    node_role: observation.node_role,
    observed_at: observation.observed_at,
    ingested_at: observation.ingested_at,
    temporal_ordering: observation.temporal_ordering,
    relative_path: observation.relative_path,
    event_kind: observation.event_kind,
    identity_claim: observation.identity_claim,
    identity_basis: observation.identity_basis,
    identity_candidate_logical_file_ids: observation.identity_candidate_logical_file_ids ?? [],
    logical_file_id: observation.logical_file_id,
    revision_id: observation.revision_id,
  };
}

function enforceRevisionStateGraphCeilings(state) {
  for (const field of ["node_cursors", "logical_files", "revisions", "node_bindings"]) {
    if (state[field].length > FILE_ACTIVITY_STATE_LIMITS[field]) {
      throw new Error(`file_activity_revision_state_${field}_limit_exceeded`);
    }
  }
}

function applyGlobalPathCollisions(state) {
  const activeLogicalIds = new Set(
    state.logical_files.filter((entry) => entry.status === "active").map((entry) => entry.logical_file_id),
  );
  const candidates = state.node_bindings
    .filter((binding) => activeLogicalIds.has(binding.logical_file_id))
    .map((binding) => ({
      observation_id: binding.node_binding_id,
      relative_path: binding.relative_path,
      path_collision_keys: binding.path_collision_keys,
      logical_file_id: binding.logical_file_id,
    }));
  for (const collision of detectPathCollisions(candidates)) {
    const candidateIds = new Set(collision.observation_ids);
    const logicalFileIds = [...new Set(
      candidates
        .filter((candidate) => candidateIds.has(candidate.observation_id))
        .map((candidate) => candidate.logical_file_id),
    )].sort();
    const row = {
      ...collision,
      collision_id: stableId("collision", "global", collision.collision_id),
      scope: "global_active_node_bindings",
      logical_file_ids: logicalFileIds,
      conflict: true,
    };
    state.collisions.push(row);
    for (const logicalFileId of logicalFileIds) {
      addUnique(findLogical(state, logicalFileId).conflict_reasons, `path_collision:${collision.collision_type}`);
    }
  }
}

const PREVIOUS_STATE_DISPOSITIONS = new Set([
  "applied",
  "late_stale_no_mutation",
  "sequence_gap_held",
  "producer_chain_mismatch_no_mutation",
]);
const PREVIOUS_STATE_EVENT_KINDS = new Set([
  "file_first_observed",
  "observed",
  "touch",
  "content_revision",
  "rename",
  "copy",
  "joined_shared_path",
  "cross_node_revision_unordered",
  "ambiguous_same_content_identity",
  "stale_observation",
  "hash_pending",
  "held_packet_evidence",
]);
const PREVIOUS_STATE_IDENTITY_CLAIMS = new Set([
  "assigned",
  "observed",
  "inferred",
  "uncertain",
  "unavailable",
]);
const PREVIOUS_STATE_RECONCILIATION_EVENT_KINDS = new Set([
  "missing_candidate",
  "delete",
  "restore",
]);
const PREVIOUS_STATE_CHANGE_INTERVAL_BASES = new Set([
  "bounded_by_node_observations",
  "confirmed_absence_receipt_threshold",
  "bounded_by_delete_receipt_and_primary_receipt",
]);
const PREVIOUS_STATE_COLLISION_TYPES = new Set([
  "exact",
  "nfc",
  "casefold",
  "cross_platform_trailing_dot_space",
]);
const PREVIOUS_STATE_COMPACTION_FIELDS = [
  "recent_event_summaries_dropped_total",
  "recent_reconciliation_events_dropped_total",
  "scan_receipts_dropped_total",
  "revision_observation_refs_dropped_total",
  "coverage_gaps_dropped_total",
  "collision_rows_dropped_total",
];

function revisionStateBoundary() {
  return {
    metadata_only: true,
    absolute_paths_present: false,
    source_contents_present: false,
    last_write_wins_resolution: false,
    erp_input_upload_is_separate_adapter: true,
    absence_authority_roles: [...ABSENCE_AUTHORITY_ROLES],
    live_scheduler_enabled: false,
    transport_enabled: false,
    monthly_partition_artifacts_supported: true,
    immutable_checkpoint_rebuild_supported: true,
    checkpoint_tail_replay_supported: false,
    lineage_graph_compaction_enabled: false,
  };
}

function emptyRevisionState(context) {
  return {
    schema_version: FILE_REVISION_STATE_SCHEMA,
    project_code: context.projectCode,
    workspace_binding_id: context.workspaceBindingId,
    reconciler: {
      node_id: context.reconcilerNodeId,
      node_role: "always_on_node",
      operational_primary: true,
    },
    updated_at: null,
    processed_scan_ids: [],
    scan_receipts: [],
    node_cursors: [],
    observations: [],
    recent_events: [],
    logical_files: [],
    revisions: [],
    node_bindings: [],
    collisions: [],
    coverage_gaps: [],
    compaction: Object.fromEntries(PREVIOUS_STATE_COMPACTION_FIELDS.map((field) => [field, 0])),
    counts: {},
    storage_bounds: {},
    boundary: revisionStateBoundary(),
  };
}

function normalizePreviousState(previousState, context) {
  if (!previousState) return emptyRevisionState(context);
  if (!isPlainRecord(previousState) || previousState.schema_version !== FILE_REVISION_STATE_SCHEMA) {
    throw new Error("file_activity_previous_state_schema_invalid");
  }
  if (
    previousState.project_code !== context.projectCode
    || previousState.workspace_binding_id !== context.workspaceBindingId
  ) {
    throw new Error("file_activity_previous_state_scope_mismatch");
  }
  if (
    !isPlainRecord(previousState.reconciler)
    || previousState.reconciler.node_id !== context.reconcilerNodeId
    || previousState.reconciler.node_role !== "always_on_node"
    || previousState.reconciler.operational_primary !== true
  ) {
    throw new Error("file_activity_reconciler_identity_mismatch");
  }

  // Reconstruct every persisted surface from an explicit allowlist. Unknown
  // top-level and nested keys are intentionally not copied into the next state.
  const state = emptyRevisionState(context);
  state.updated_at = normalizeNullableStateIso(previousState.updated_at, "previous_state_updated_at");
  state.scan_receipts = boundedPreviousRows(
    previousState.scan_receipts ?? [],
    "scan_receipts",
    FILE_ACTIVITY_STATE_LIMITS.scan_receipts,
  ).map((entry) => sanitizePreviousScanReceipt(entry, context));
  state.node_cursors = boundedPreviousRows(
    previousState.node_cursors ?? [],
    "node_cursors",
    FILE_ACTIVITY_STATE_LIMITS.node_cursors,
  ).map(sanitizePreviousNodeCursor);
  state.observations = boundedPreviousRows(
    previousState.observations ?? [],
    "observations",
    FILE_ACTIVITY_STATE_LIMITS.recent_event_summaries,
  ).map(sanitizePreviousObservationSummary);
  state.recent_events = boundedPreviousRows(
    previousState.recent_events ?? [],
    "recent_events",
    FILE_ACTIVITY_STATE_LIMITS.recent_reconciliation_events,
  ).map((entry) => sanitizePreviousReconciliationEvent(entry, context));
  state.logical_files = boundedPreviousRows(
    previousState.logical_files ?? [],
    "logical_files",
    FILE_ACTIVITY_STATE_LIMITS.logical_files,
  ).map((entry) => sanitizePreviousLogicalFile(entry, context));
  state.revisions = boundedPreviousRows(
    previousState.revisions ?? [],
    "revisions",
    FILE_ACTIVITY_STATE_LIMITS.revisions,
  ).map(sanitizePreviousRevision);
  state.node_bindings = boundedPreviousRows(
    previousState.node_bindings ?? [],
    "node_bindings",
    FILE_ACTIVITY_STATE_LIMITS.node_bindings,
  ).map(sanitizePreviousNodeBinding);
  state.collisions = boundedPreviousRows(
    previousState.collisions ?? [],
    "collisions",
    FILE_ACTIVITY_STATE_LIMITS.collision_rows,
  ).map(sanitizePreviousCollision);
  state.coverage_gaps = boundedPreviousRows(
    previousState.coverage_gaps ?? [],
    "coverage_gaps",
    FILE_ACTIVITY_STATE_LIMITS.coverage_gaps,
  ).map(sanitizePreviousCoverageGap);
  state.compaction = sanitizePreviousCompaction(previousState.compaction);
  state.processed_scan_ids = state.scan_receipts.map((entry) => entry.scan_id).sort();
  validatePreviousStateGraph(state);
  return state;
}

function boundedPreviousRows(value, field, max) {
  if (!Array.isArray(value)) throw new Error(`file_activity_previous_state_${field}_invalid`);
  if (value.length > max) throw new Error(`file_activity_previous_state_${field}_limit_exceeded`);
  return value;
}

function sanitizePreviousScanReceipt(value, context) {
  requirePlainStateRecord(value, "scan_receipt");
  const nodeId = normalizeIdentifier(value.node_id, "previous_state_receipt_node_id");
  const disposition = String(value.disposition ?? "");
  if (!PREVIOUS_STATE_DISPOSITIONS.has(disposition)) {
    throw new Error("file_activity_previous_state_receipt_disposition_invalid");
  }
  const nodeSequence = requiredPositiveStateInteger(value.node_sequence, "receipt_node_sequence");
  return {
    scan_id: normalizeScanId(value.scan_id),
    packet_digest: normalizeContentDigest(value.packet_digest, "previous_state_receipt_packet_digest"),
    node_id: nodeId,
    node_sequence: nodeSequence,
    received_at: normalizeIso(value.received_at, "previous_state_receipt_received_at"),
    packet_ref: sanitizePacketRef(value.packet_ref, context.projectCode, nodeId),
    disposition,
  };
}

function sanitizePreviousNodeCursor(value) {
  requirePlainStateRecord(value, "node_cursor");
  const lastSequence = requiredNonNegativeInteger(value.last_sequence, "previous_state_cursor_last_sequence");
  const lastScanId = value.last_scan_id === null ? null : normalizeScanId(value.last_scan_id);
  const lastPacketDigest = value.last_packet_digest === null
    ? null
    : normalizeContentDigest(value.last_packet_digest, "previous_state_cursor_packet_digest");
  const lastObservedAt = normalizeNullableStateIso(value.last_observed_at, "previous_state_cursor_observed_at");
  const lastIngestedAt = normalizeNullableStateIso(value.last_ingested_at, "previous_state_cursor_ingested_at");
  const lastReceivedAt = normalizeNullableStateIso(value.last_received_at, "previous_state_cursor_received_at");
  if (
    (lastSequence === 0 && (lastScanId !== null || lastPacketDigest !== null || lastReceivedAt !== null))
    || (lastSequence > 0 && (lastScanId === null || lastPacketDigest === null || lastReceivedAt === null))
    || ((lastObservedAt === null) !== (lastIngestedAt === null))
  ) {
    throw new Error("file_activity_previous_state_cursor_chain_invalid");
  }
  return {
    node_id: normalizeIdentifier(value.node_id, "previous_state_cursor_node_id"),
    last_sequence: lastSequence,
    last_scan_id: lastScanId,
    last_packet_digest: lastPacketDigest,
    last_observed_at: lastObservedAt,
    last_ingested_at: lastIngestedAt,
    last_received_at: lastReceivedAt,
  };
}

function sanitizePreviousObservationSummary(value) {
  requirePlainStateRecord(value, "observation");
  const eventKind = String(value.event_kind ?? "");
  if (!PREVIOUS_STATE_EVENT_KINDS.has(eventKind)) {
    throw new Error("file_activity_previous_state_observation_event_kind_invalid");
  }
  const identityClaim = String(value.identity_claim ?? "");
  if (!PREVIOUS_STATE_IDENTITY_CLAIMS.has(identityClaim)) {
    throw new Error("file_activity_previous_state_observation_identity_claim_invalid");
  }
  const nodeRole = String(value.node_role ?? "");
  assertNodeRole(nodeRole);
  const observedAt = normalizeIso(value.observed_at, "previous_state_observation_observed_at");
  const ingestedAt = normalizeIso(value.ingested_at, "previous_state_observation_ingested_at");
  const temporalOrdering = assessClock(observedAt, ingestedAt).state;
  if (value.temporal_ordering !== undefined && value.temporal_ordering !== temporalOrdering) {
    throw new Error("file_activity_previous_state_observation_temporal_ordering_invalid");
  }
  const relativePath = sanitizeRelativePath(value.relative_path);
  if (isSensitivePath(relativePath)) {
    throw new Error("file_activity_previous_state_observation_sensitive_path_blocked");
  }
  return {
    observation_id: normalizeStateId(value.observation_id, "obs", "observation_id"),
    scan_id: normalizeScanId(value.scan_id),
    node_id: normalizeIdentifier(value.node_id, "previous_state_observation_node_id"),
    node_role: nodeRole,
    observed_at: observedAt,
    ingested_at: ingestedAt,
    temporal_ordering: temporalOrdering,
    relative_path: relativePath,
    event_kind: eventKind,
    identity_claim: identityClaim,
    identity_basis: normalizeNullableStateToken(value.identity_basis, "observation_identity_basis"),
    identity_candidate_logical_file_ids: sanitizeStateIdArray(
      value.identity_candidate_logical_file_ids ?? [],
      "lf",
      "observation_identity_candidates",
    ),
    logical_file_id: normalizeNullableStateId(value.logical_file_id, "lf", "observation_logical_file_id"),
    revision_id: normalizeNullableStateId(value.revision_id, "rev", "observation_revision_id"),
  };
}

function sanitizePreviousReconciliationEvent(value, context) {
  requirePlainStateRecord(value, "recent_event");
  const eventKind = String(value.event_kind ?? "");
  if (!PREVIOUS_STATE_RECONCILIATION_EVENT_KINDS.has(eventKind)) {
    throw new Error("file_activity_previous_state_recent_event_kind_invalid");
  }
  const nodeId = normalizeIdentifier(value.node_id, "previous_state_recent_event_node_id");
  const nodeRole = String(value.node_role ?? "");
  assertNodeRole(nodeRole);
  const changeInterval = sanitizePreviousChangeInterval(value.change_interval);
  const details = sanitizePreviousReconciliationDetails(eventKind, value.details);
  return {
    event_id: normalizeStateId(value.event_id, "file-event", "recent_event_id"),
    event_kind: eventKind,
    scan_id: normalizeScanId(value.scan_id),
    packet_ref: sanitizePacketRef(value.packet_ref, context.projectCode, nodeId),
    node_id: nodeId,
    node_role: nodeRole,
    node_sequence: requiredPositiveStateInteger(value.node_sequence, "recent_event_node_sequence"),
    observed_at: normalizeIso(value.observed_at, "previous_state_recent_event_observed_at"),
    ingested_at: normalizeIso(value.ingested_at, "previous_state_recent_event_ingested_at"),
    received_at: normalizeIso(value.received_at, "previous_state_recent_event_received_at"),
    logical_file_id: normalizeStateId(value.logical_file_id, "lf", "recent_event_logical_file_id"),
    node_binding_id: normalizeNullableStateId(value.node_binding_id, "node-file", "recent_event_node_binding_id"),
    change_interval: changeInterval,
    details,
  };
}

function sanitizePreviousChangeInterval(value) {
  requirePlainStateRecord(value, "change_interval");
  const basis = String(value.basis ?? "");
  if (!PREVIOUS_STATE_CHANGE_INTERVAL_BASES.has(basis)) {
    throw new Error("file_activity_previous_state_change_interval_basis_invalid");
  }
  const after = normalizeNullableStateIso(value.after, "previous_state_change_interval_after");
  const before = normalizeIso(value.before, "previous_state_change_interval_before");
  if (after && after > before) throw new Error("file_activity_previous_state_change_interval_order_invalid");
  return { after, before, basis };
}

function sanitizePreviousReconciliationDetails(eventKind, value) {
  requirePlainStateRecord(value, "recent_event_details");
  if (eventKind === "missing_candidate") {
    return { absence_count: requiredPositiveStateInteger(value.absence_count, "recent_event_absence_count") };
  }
  if (eventKind === "restore") {
    return { node_observed_at: normalizeIso(value.node_observed_at, "previous_state_restore_observed_at") };
  }
  return {
    authoritative_binding_count: requiredPositiveStateInteger(
      value.authoritative_binding_count,
      "recent_event_authoritative_binding_count",
    ),
    absence_threshold: requiredPositiveStateInteger(value.absence_threshold, "recent_event_absence_threshold"),
  };
}

function sanitizePreviousLogicalFile(value, context) {
  requirePlainStateRecord(value, "logical_file");
  if (value.workspace_binding_id !== context.workspaceBindingId) {
    throw new Error("file_activity_previous_state_logical_file_scope_mismatch");
  }
  const status = String(value.status ?? "");
  if (!new Set(["active", "deleted_after_confirmed_absence"]).has(status)) {
    throw new Error("file_activity_previous_state_logical_file_status_invalid");
  }
  const identityState = String(value.identity_state ?? "");
  if (!new Set(["assigned", "uncertain"]).has(identityState)) {
    throw new Error("file_activity_previous_state_logical_file_identity_invalid");
  }
  const conflictReasons = sanitizeStateTokenArray(value.conflict_reasons, "logical_file_conflict_reasons");
  if (value.conflict !== (conflictReasons.length > 0)) {
    throw new Error("file_activity_previous_state_logical_file_conflict_invalid");
  }
  const logical = {
    logical_file_id: normalizeStateId(value.logical_file_id, "lf", "logical_file_id"),
    workspace_binding_id: context.workspaceBindingId,
    first_observed_at: normalizeIso(value.first_observed_at, "previous_state_logical_first_observed_at"),
    first_ingested_at: normalizeIso(value.first_ingested_at, "previous_state_logical_first_ingested_at"),
    status,
    current_revision_ids: sanitizeStateIdArray(value.current_revision_ids, "rev", "logical_file_current_revisions"),
    copied_from_logical_file_id: normalizeNullableStateId(
      value.copied_from_logical_file_id,
      "lf",
      "logical_file_copied_from",
    ),
    conflict: value.conflict,
    conflict_reasons: conflictReasons,
    identity_state: identityState,
  };
  if (status === "deleted_after_confirmed_absence") {
    requirePlainStateRecord(value.deletion_basis, "logical_file_deletion_basis");
    const authorityRoles = value.deletion_basis.authority_roles;
    if (!Array.isArray(authorityRoles) || authorityRoles.length !== 1 || authorityRoles[0] !== "work_pc") {
      throw new Error("file_activity_previous_state_deletion_authority_invalid");
    }
    logical.deleted_at = normalizeIso(value.deleted_at, "previous_state_logical_deleted_at");
    logical.deletion_basis = {
      complete_scan_absence_threshold: requiredPositiveStateInteger(
        value.deletion_basis.complete_scan_absence_threshold,
        "deletion_absence_threshold",
      ),
      grace_ms: requiredNonNegativeInteger(value.deletion_basis.grace_ms, "previous_state_deletion_grace_ms"),
      node_binding_count: requiredPositiveStateInteger(
        value.deletion_basis.node_binding_count,
        "deletion_node_binding_count",
      ),
      authority_roles: [...ABSENCE_AUTHORITY_ROLES],
    };
  }
  return logical;
}

function sanitizePreviousRevision(value) {
  requirePlainStateRecord(value, "revision");
  const logicalFileId = normalizeStateId(value.logical_file_id, "lf", "revision_logical_file_id");
  const contentId = normalizeContentDigest(value.content_id, "previous_state_revision_content_id");
  const sizeBytes = requiredNonNegativeInteger(value.size_bytes, "previous_state_revision_size_bytes");
  const parents = sanitizeStateIdArray(value.parent_revision_ids, "rev", "revision_parent_ids");
  const revisionId = normalizeStateId(value.revision_id, "rev", "revision_id");
  if (revisionId !== stableId("rev", logicalFileId, contentId, String(sizeBytes), ...parents)) {
    throw new Error("file_activity_previous_state_revision_id_mismatch");
  }
  const state = String(value.state ?? "");
  if (!new Set(["head", "superseded"]).has(state)) {
    throw new Error("file_activity_previous_state_revision_status_invalid");
  }
  const observationIds = sanitizeStateIdArray(
    value.observation_ids,
    "obs",
    "revision_observation_ids",
    FILE_ACTIVITY_STATE_LIMITS.revision_observation_refs,
  );
  const sourceScanIds = sanitizeScanIdArray(
    value.source_scan_ids ?? [],
    "revision_source_scan_ids",
    FILE_ACTIVITY_STATE_LIMITS.revision_observation_refs,
  );
  const observationCount = requiredNonNegativeInteger(
    value.observation_count,
    "previous_state_revision_observation_count",
  );
  if (observationCount < observationIds.length) {
    throw new Error("file_activity_previous_state_revision_observation_count_invalid");
  }
  return {
    revision_id: revisionId,
    logical_file_id: logicalFileId,
    content_id: contentId,
    size_bytes: sizeBytes,
    parent_revision_ids: parents,
    parent_basis: normalizeStateToken(value.parent_basis, "revision_parent_basis"),
    first_observed_at: normalizeIso(value.first_observed_at, "previous_state_revision_first_observed_at"),
    first_ingested_at: normalizeIso(value.first_ingested_at, "previous_state_revision_first_ingested_at"),
    last_observed_at: normalizeIso(value.last_observed_at, "previous_state_revision_last_observed_at"),
    last_ingested_at: normalizeIso(value.last_ingested_at, "previous_state_revision_last_ingested_at"),
    observation_ids: observationIds,
    observation_count: observationCount,
    source_scan_ids: sourceScanIds,
    state,
  };
}

function sanitizePreviousNodeBinding(value) {
  requirePlainStateRecord(value, "node_binding");
  const nodeId = normalizeIdentifier(value.node_id, "previous_state_binding_node_id");
  const logicalFileId = normalizeStateId(value.logical_file_id, "lf", "binding_logical_file_id");
  const nodeBindingId = normalizeStateId(value.node_binding_id, "node-file", "node_binding_id");
  if (nodeBindingId !== stableId("node-file", nodeId, logicalFileId)) {
    throw new Error("file_activity_previous_state_node_binding_id_mismatch");
  }
  const nodeRole = String(value.node_role ?? "");
  assertNodeRole(nodeRole);
  const relativePathSpelling = sanitizeRelativePathSpelling(value.relative_path_spelling);
  const relativePath = sanitizeRelativePath(value.relative_path);
  if (relativePath !== relativePathSpelling.normalize("NFC") || isSensitivePath(relativePathSpelling)) {
    throw new Error("file_activity_previous_state_binding_path_invalid");
  }
  const pathCollisionKeys = sanitizeCollisionKeys(value.path_collision_keys);
  const canonicalKeys = buildPathCollisionKeys(relativePathSpelling);
  for (const field of ["exact", "nfc", "casefold", "cross_platform_trailing_dot_space"]) {
    if (pathCollisionKeys[field] !== canonicalKeys[field]) {
      throw new Error("file_activity_previous_state_binding_collision_key_mismatch");
    }
  }
  const pathFingerprint = normalizeStateId(value.path_fingerprint, "path", "binding_path_fingerprint");
  if (pathFingerprint !== pathFingerprintForCollisionKeys(pathCollisionKeys)) {
    throw new Error("file_activity_previous_state_binding_path_fingerprint_mismatch");
  }
  requirePlainStateRecord(value.fs_modified_at, "binding_fs_modified_at");
  if (value.fs_modified_at.trust !== "untrusted_hint" || value.fs_modified_at.ordering_authority !== false) {
    throw new Error("file_activity_previous_state_binding_fs_modified_invalid");
  }
  const absenceCount = requiredNonNegativeInteger(value.absence_count, "previous_state_binding_absence_count");
  const firstAbsent = normalizeNullableStateIso(
    value.first_absent_received_at,
    "previous_state_binding_first_absent_received_at",
  );
  const lastAbsent = normalizeNullableStateIso(
    value.last_absent_received_at,
    "previous_state_binding_last_absent_received_at",
  );
  if (
    (absenceCount === 0 && (firstAbsent !== null || lastAbsent !== null))
    || (absenceCount > 0 && (firstAbsent === null || lastAbsent === null || firstAbsent > lastAbsent))
  ) {
    throw new Error("file_activity_previous_state_binding_absence_invalid");
  }
  return {
    node_binding_id: nodeBindingId,
    node_id: nodeId,
    node_role: nodeRole,
    logical_file_id: logicalFileId,
    revision_id: normalizeStateId(value.revision_id, "rev", "binding_revision_id"),
    content_id: normalizeContentDigest(value.content_id, "previous_state_binding_content_id"),
    path_fingerprint: pathFingerprint,
    relative_path: relativePath,
    relative_path_spelling: relativePathSpelling,
    path_collision_keys: pathCollisionKeys,
    size_bytes: requiredNonNegativeInteger(value.size_bytes, "previous_state_binding_size_bytes"),
    fs_modified_at: {
      value: normalizeIso(value.fs_modified_at.value, "previous_state_binding_fs_modified_at"),
      trust: "untrusted_hint",
      ordering_authority: false,
    },
    last_observed_at: normalizeIso(value.last_observed_at, "previous_state_binding_last_observed_at"),
    last_ingested_at: normalizeIso(value.last_ingested_at, "previous_state_binding_last_ingested_at"),
    absence_count: absenceCount,
    first_absent_received_at: firstAbsent,
    last_absent_received_at: lastAbsent,
  };
}

function sanitizePreviousCollision(value) {
  requirePlainStateRecord(value, "collision");
  const collisionType = String(value.collision_type ?? "");
  if (!PREVIOUS_STATE_COLLISION_TYPES.has(collisionType)) {
    throw new Error("file_activity_previous_state_collision_type_invalid");
  }
  const expectedPrefix = {
    exact: "exact",
    nfc: "nfc",
    casefold: "casefold",
    cross_platform_trailing_dot_space: "cross",
  }[collisionType];
  const collisionKey = String(value.collision_key ?? "");
  if (!new RegExp(`^${expectedPrefix}:[a-f0-9]{64}$`, "u").test(collisionKey)) {
    throw new Error("file_activity_previous_state_collision_key_invalid");
  }
  if (value.resolution !== "conflict_review" || value.overwrite_allowed !== false || value.conflict !== true) {
    throw new Error("file_activity_previous_state_collision_contract_invalid");
  }
  const scope = value.scope === undefined ? null : String(value.scope);
  if (scope !== null && scope !== "global_active_node_bindings") {
    throw new Error("file_activity_previous_state_collision_scope_invalid");
  }
  const relativePaths = sanitizeRelativePathArray(value.relative_paths, "collision_relative_paths");
  const collisionKeyField = collisionType;
  if (relativePaths.some((relativePath) => buildPathCollisionKeys(relativePath)[collisionKeyField] !== collisionKey)) {
    throw new Error("file_activity_previous_state_collision_path_key_mismatch");
  }
  const collision = {
    collision_id: normalizeStateId(value.collision_id, "collision", "collision_id"),
    collision_type: collisionType,
    collision_key: collisionKey,
    observation_ids: sanitizeStateIdArray(
      value.observation_ids,
      scope ? "node-file" : "obs",
      "collision_observation_ids",
    ),
    relative_paths: relativePaths,
    resolution: "conflict_review",
    overwrite_allowed: false,
    logical_file_ids: sanitizeStateIdArray(value.logical_file_ids, "lf", "collision_logical_file_ids"),
    conflict: true,
  };
  if (scope) {
    collision.scope = scope;
  } else {
    collision.scan_id = normalizeScanId(value.scan_id);
    collision.node_id = normalizeIdentifier(value.node_id, "previous_state_collision_node_id");
  }
  return collision;
}

function sanitizePreviousCoverageGap(value) {
  requirePlainStateRecord(value, "coverage_gap");
  const gap = {
    gap_id: normalizeStateId(value.gap_id, "gap", "coverage_gap_id"),
    scan_id: normalizeScanId(value.scan_id),
    node_id: normalizeIdentifier(value.node_id, "previous_state_gap_node_id"),
    reason: normalizeStateToken(value.reason, "coverage_gap_reason"),
  };
  if (value.gap_reasons !== undefined) {
    gap.gap_reasons = sanitizeStateTokenArray(value.gap_reasons, "coverage_gap_reasons", 100);
  }
  for (const field of [
    "exact_temporal_ordering_blocked",
    "absence_inference_allowed",
    "state_mutation_allowed",
    "retry_allowed",
  ]) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== "boolean") throw new Error(`file_activity_previous_state_gap_${field}_invalid`);
      gap[field] = value[field];
    }
  }
  for (const field of ["node_sequence", "expected_node_sequence"]) {
    if (value[field] !== undefined && value[field] !== null) {
      gap[field] = requiredPositiveStateInteger(value[field], `coverage_gap_${field}`);
    } else if (field === "expected_node_sequence" && value[field] === null) {
      gap[field] = null;
    }
  }
  return gap;
}

function sanitizePreviousCompaction(value) {
  if (value === undefined || value === null) {
    return Object.fromEntries(PREVIOUS_STATE_COMPACTION_FIELDS.map((field) => [field, 0]));
  }
  requirePlainStateRecord(value, "compaction");
  return Object.fromEntries(PREVIOUS_STATE_COMPACTION_FIELDS.map((field) => [
    field,
    requiredNonNegativeInteger(value[field] ?? 0, `previous_state_compaction_${field}`),
  ]));
}

function validatePreviousStateGraph(state) {
  requireUniqueStateRows(state.scan_receipts, "scan_id", "scan_receipts");
  requireUniqueStateRows(state.node_cursors, "node_id", "node_cursors");
  requireUniqueStateRows(state.observations, "observation_id", "observations");
  requireUniqueStateRows(state.recent_events, "event_id", "recent_events");
  requireUniqueStateRows(state.logical_files, "logical_file_id", "logical_files");
  requireUniqueStateRows(state.revisions, "revision_id", "revisions");
  requireUniqueStateRows(state.node_bindings, "node_binding_id", "node_bindings");
  requireUniqueStateRows(state.collisions, "collision_id", "collisions");
  requireUniqueStateRows(state.coverage_gaps, "gap_id", "coverage_gaps");

  const logicalById = new Map(state.logical_files.map((entry) => [entry.logical_file_id, entry]));
  const revisionById = new Map(state.revisions.map((entry) => [entry.revision_id, entry]));
  const bindingById = new Map(state.node_bindings.map((entry) => [entry.node_binding_id, entry]));
  const bindingPathKeys = new Set();
  for (const revision of state.revisions) {
    if (!logicalById.has(revision.logical_file_id)) throw new Error("file_activity_previous_state_revision_logical_missing");
    for (const parentId of revision.parent_revision_ids) {
      const parent = revisionById.get(parentId);
      if (!parent || parent.logical_file_id !== revision.logical_file_id || parentId === revision.revision_id) {
        throw new Error("file_activity_previous_state_revision_parent_invalid");
      }
    }
  }
  for (const logical of state.logical_files) {
    if (
      logical.copied_from_logical_file_id
      && (!logicalById.has(logical.copied_from_logical_file_id)
        || logical.copied_from_logical_file_id === logical.logical_file_id)
    ) {
      throw new Error("file_activity_previous_state_logical_copy_ref_invalid");
    }
    for (const revisionId of logical.current_revision_ids) {
      if (revisionById.get(revisionId)?.logical_file_id !== logical.logical_file_id) {
        throw new Error("file_activity_previous_state_logical_head_invalid");
      }
    }
  }
  for (const binding of state.node_bindings) {
    const revision = revisionById.get(binding.revision_id);
    if (
      !logicalById.has(binding.logical_file_id)
      || !revision
      || revision.logical_file_id !== binding.logical_file_id
      || revision.content_id !== binding.content_id
      || revision.size_bytes !== binding.size_bytes
    ) {
      throw new Error("file_activity_previous_state_binding_revision_invalid");
    }
    const pathKey = `${binding.node_id}|${binding.path_fingerprint}`;
    if (bindingPathKeys.has(pathKey)) throw new Error("file_activity_previous_state_binding_path_duplicate");
    bindingPathKeys.add(pathKey);
  }
  for (const observation of state.observations) {
    if (observation.logical_file_id && !logicalById.has(observation.logical_file_id)) {
      throw new Error("file_activity_previous_state_observation_logical_missing");
    }
    if (observation.revision_id) {
      const revision = revisionById.get(observation.revision_id);
      if (!revision || revision.logical_file_id !== observation.logical_file_id) {
        throw new Error("file_activity_previous_state_observation_revision_invalid");
      }
    }
    for (const candidateId of observation.identity_candidate_logical_file_ids) {
      if (!logicalById.has(candidateId)) throw new Error("file_activity_previous_state_observation_candidate_missing");
    }
  }
  for (const event of state.recent_events) {
    if (!logicalById.has(event.logical_file_id)) throw new Error("file_activity_previous_state_event_logical_missing");
    if (event.node_binding_id && !bindingById.has(event.node_binding_id)) {
      throw new Error("file_activity_previous_state_event_binding_missing");
    }
  }
  for (const collision of state.collisions) {
    if (collision.logical_file_ids.some((logicalFileId) => !logicalById.has(logicalFileId))) {
      throw new Error("file_activity_previous_state_collision_logical_missing");
    }
  }
  if (state.scan_receipts.length > 0 && !state.updated_at) {
    throw new Error("file_activity_previous_state_updated_at_missing");
  }
}

function requirePlainStateRecord(value, field) {
  if (!isPlainRecord(value)) throw new Error(`file_activity_previous_state_${field}_invalid`);
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function normalizeStateId(value, prefix, field) {
  const normalized = String(value ?? "");
  if (!new RegExp(`^${prefix}:[a-f0-9]{64}$`, "u").test(normalized)) {
    throw new Error(`file_activity_previous_state_${field}_invalid`);
  }
  return normalized;
}

function normalizeNullableStateId(value, prefix, field) {
  return value === null || value === undefined ? null : normalizeStateId(value, prefix, field);
}

function normalizeStateToken(value, field) {
  const normalized = String(value ?? "").normalize("NFC");
  if (!/^[a-z0-9][a-z0-9._:-]{0,255}$/u.test(normalized)) {
    throw new Error(`file_activity_previous_state_${field}_invalid`);
  }
  return normalized;
}

function normalizeNullableStateToken(value, field) {
  return value === null || value === undefined ? null : normalizeStateToken(value, field);
}

function normalizeNullableStateIso(value, field) {
  return value === null || value === undefined ? null : normalizeIso(value, field);
}

function requiredPositiveStateInteger(value, field) {
  const result = requiredNonNegativeInteger(value, `previous_state_${field}`);
  if (result < 1) throw new Error(`file_activity_previous_state_${field}_invalid`);
  return result;
}

function sanitizeStateIdArray(value, prefix, field, max = FILE_ACTIVITY_STATE_LIMITS.per_entry_refs) {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`file_activity_previous_state_${field}_invalid`);
  }
  const result = value.map((entry) => normalizeStateId(entry, prefix, field));
  if (new Set(result).size !== result.length) throw new Error(`file_activity_previous_state_${field}_duplicate`);
  return result;
}

function sanitizeUnionStateIdArray(value, prefixes, field) {
  if (!Array.isArray(value) || value.length > FILE_ACTIVITY_STATE_LIMITS.per_entry_refs) {
    throw new Error(`file_activity_previous_state_${field}_invalid`);
  }
  const result = value.map((entry) => {
    for (const prefix of prefixes) {
      if (new RegExp(`^${prefix}:[a-f0-9]{64}$`, "u").test(String(entry ?? ""))) return String(entry);
    }
    throw new Error(`file_activity_previous_state_${field}_invalid`);
  });
  if (new Set(result).size !== result.length) throw new Error(`file_activity_previous_state_${field}_duplicate`);
  return result;
}

function sanitizeScanIdArray(value, field, max) {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`file_activity_previous_state_${field}_invalid`);
  }
  const result = value.map(normalizeScanId);
  if (new Set(result).size !== result.length) throw new Error(`file_activity_previous_state_${field}_duplicate`);
  return result;
}

function sanitizeStateTokenArray(value, field, max = FILE_ACTIVITY_STATE_LIMITS.per_entry_refs) {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`file_activity_previous_state_${field}_invalid`);
  }
  const result = value.map((entry) => normalizeStateToken(entry, field));
  if (new Set(result).size !== result.length) throw new Error(`file_activity_previous_state_${field}_duplicate`);
  return result;
}

function sanitizeRelativePathArray(value, field) {
  if (!Array.isArray(value) || value.length > FILE_ACTIVITY_STATE_LIMITS.per_entry_refs) {
    throw new Error(`file_activity_previous_state_${field}_invalid`);
  }
  const result = value.map((entry) => {
    const relativePath = sanitizeRelativePath(entry);
    if (isSensitivePath(relativePath)) {
      throw new Error(`file_activity_previous_state_${field}_sensitive_path_blocked`);
    }
    return relativePath;
  });
  return result;
}

function requireUniqueStateRows(rows, key, field) {
  if (new Set(rows.map((entry) => entry[key])).size !== rows.length) {
    throw new Error(`file_activity_previous_state_${field}_duplicate`);
  }
}

function buildUnavailableScanResult({
  projectCode,
  workspaceBindingId,
  nodeId,
  nodeRole,
  observedAt,
  ingestedAt,
  scanId,
  clockAssessment,
  immediateHashBytes,
  byteBudget,
  previousCache,
  producerChain,
  forceRehash,
  gapReason = "workspace_root_unavailable",
  withheldSensitiveCount = 0,
  sensitiveRootWithheld = false,
  excludedEntryCount = 0,
}) {
  const packet = {
    schema_version: FILE_OBSERVATION_PACKET_SCHEMA,
    packet_kind: "file_observation_scan",
    scan_id: scanId,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    node_id: nodeId,
    node_role: nodeRole,
    node_sequence: producerChain.node_sequence,
    prior_scan_id: producerChain.prior_scan_id,
    prior_packet_digest: producerChain.prior_packet_digest,
    observed_at: observedAt,
    ingested_at: ingestedAt,
    temporal_ordering: clockAssessment,
    cadence: cadenceForRole(nodeRole),
    coverage: {
      complete: false,
      listing_complete: false,
      hash_complete: false,
      gap_reasons: [gapReason],
      scan_errors: [{ reason: gapReason }],
    },
    hash_policy: {
      algorithm: "sha256",
      exact_content_id_prefix: "sha256:",
      immediate_hash_max_bytes: immediateHashBytes,
      scan_byte_budget: byteBudget,
      hashed_bytes: 0,
      weak_or_sample_hash_is_identity: false,
      unchanged_stat_tuple_cache_enabled: true,
      force_rehash: forceRehash,
    },
    counts: {
      observed_file_count: 0,
      exact_content_count: 0,
      cached_exact_count: 0,
      queued_hash_count: 0,
      withheld_sensitive_count: withheldSensitiveCount,
      excluded_entry_count: excludedEntryCount,
      collision_count: 0,
    },
    observations: [],
    collisions: [],
    boundary: {
      metadata_only_output: true,
      file_contents_stream_hashed: false,
      file_contents_retained: false,
      absolute_paths_in_output: false,
      fs_modified_at_is_untrusted_hint: true,
      creation_time_claimed: false,
      symlinks_or_junctions_followed: false,
      sensitive_files_hashed: false,
      raw_upload_name_is_identity: false,
      activation_state: "candidate_not_scheduled",
      live_scheduler_enabled: false,
      transport_enabled: false,
      sensitive_root_withheld: sensitiveRootWithheld,
    },
  };
  const nextCache = previousCache
    ? structuredClone(previousCache)
    : {
        schema_version: FILE_SCAN_CACHE_SCHEMA,
        project_code: projectCode,
        workspace_binding_id: workspaceBindingId,
        node_id: nodeId,
        updated_at: null,
        entries: [],
      };
  const packetDigest = canonicalPacketDigest(packet);
  nextCache.updated_at = ingestedAt;
  nextCache.last_node_sequence = producerChain.node_sequence;
  nextCache.next_node_sequence = producerChain.node_sequence + 1;
  nextCache.last_scan_id = scanId;
  nextCache.last_packet_digest = packetDigest;
  return { packet, next_cache: nextCache };
}

function nextProducerChain(previousCache) {
  if (!previousCache) {
    return {
      node_sequence: 1,
      prior_scan_id: null,
      prior_packet_digest: null,
    };
  }
  return {
    node_sequence: previousCache.next_node_sequence,
    prior_scan_id: previousCache.last_scan_id,
    prior_packet_digest: previousCache.last_packet_digest,
  };
}

function normalizePreviousCache(previousCache, context) {
  if (!previousCache) return null;
  requireExactRecordKeys(previousCache, [
    "schema_version",
    "project_code",
    "workspace_binding_id",
    "node_id",
    "updated_at",
    "entries",
    "last_node_sequence",
    "next_node_sequence",
    "last_scan_id",
    "last_packet_digest",
  ], "scan_cache");
  if (
    previousCache.schema_version !== FILE_SCAN_CACHE_SCHEMA
    || previousCache.project_code !== context.projectCode
    || previousCache.workspace_binding_id !== context.workspaceBindingId
    || previousCache.node_id !== context.nodeId
  ) {
    throw new Error("file_activity_scan_cache_scope_mismatch");
  }
  const lastSequence = normalizeNonNegativeInteger(previousCache.last_node_sequence, 0, "cache_last_node_sequence");
  const nextSequence = normalizeNonNegativeInteger(previousCache.next_node_sequence, 0, "cache_next_node_sequence");
  const lastScanId = normalizeScanId(previousCache.last_scan_id);
  const lastPacketDigest = normalizeContentDigest(previousCache.last_packet_digest, "cache_last_packet_digest");
  if (
    lastSequence < 1
    || nextSequence !== lastSequence + 1
    || !lastScanId
    || !lastPacketDigest
  ) {
      throw new Error("file_activity_scan_cache_chain_invalid");
  }
  const updatedAt = normalizeIso(previousCache.updated_at, "cache_updated_at");
  if (updatedAt > context.ingestedAt) {
    throw new Error("file_activity_scan_cache_clock_regressed");
  }
  if (!Array.isArray(previousCache.entries) || previousCache.entries.length > FILE_ACTIVITY_CACHE_LIMITS.entries) {
    if (context.ignoreEntries !== true) throw new Error("file_activity_scan_cache_entries_invalid");
  }
  const entries = context.ignoreEntries === true
    ? []
    : previousCache.entries.map((entry) => sanitizePreviousCacheEntry(entry, {
      cacheUpdatedAt: updatedAt,
      scanIngestedAt: context.ingestedAt,
      nodeId: context.nodeId,
      lastScanId,
      lastPacketDigest,
    }));
  if (new Set(entries.map((entry) => entry.path_fingerprint)).size !== entries.length) {
    throw new Error("file_activity_scan_cache_entry_duplicate");
  }
  entries.sort((left, right) => left.path_fingerprint.localeCompare(right.path_fingerprint));
  return {
    schema_version: FILE_SCAN_CACHE_SCHEMA,
    project_code: context.projectCode,
    workspace_binding_id: context.workspaceBindingId,
    node_id: context.nodeId,
    updated_at: updatedAt,
    entries,
    last_node_sequence: lastSequence,
    next_node_sequence: nextSequence,
    last_scan_id: lastScanId,
    last_packet_digest: lastPacketDigest,
  };
}

function sanitizePreviousCacheEntry(value, context) {
  requireExactRecordKeys(value, [
    "path_fingerprint",
    "relative_path",
    "relative_path_spelling",
    "path_collision_keys",
    "stat_tuple",
    "content_id",
    "verified_at",
    "provenance",
  ], "scan_cache_entry");
  const relativePathSpelling = sanitizeRelativePathSpelling(value.relative_path_spelling);
  const relativePath = sanitizeRelativePath(value.relative_path);
  if (relativePath !== relativePathSpelling.normalize("NFC") || isSensitivePath(relativePathSpelling)) {
    throw new Error("file_activity_scan_cache_path_spelling_mismatch");
  }
  requireExactRecordKeys(value.path_collision_keys, [
    "exact",
    "nfc",
    "casefold",
    "cross_platform_trailing_dot_space",
  ], "scan_cache_collision_keys");
  const pathCollisionKeys = sanitizeCollisionKeys(value.path_collision_keys);
  const recomputedKeys = buildPathCollisionKeys(relativePathSpelling);
  for (const field of ["exact", "nfc", "casefold", "cross_platform_trailing_dot_space"]) {
    if (pathCollisionKeys[field] !== recomputedKeys[field]) {
      throw new Error("file_activity_scan_cache_collision_key_mismatch");
    }
  }
  const pathFingerprint = normalizeStateId(value.path_fingerprint, "path", "cache_path_fingerprint");
  if (pathFingerprint !== pathFingerprintForCollisionKeys(pathCollisionKeys)) {
    throw new Error("file_activity_scan_cache_path_fingerprint_mismatch");
  }
  requireExactRecordKeys(value.stat_tuple, [
    "size_bytes",
    "modified_time_ms",
    "changed_time_ms",
  ], "scan_cache_stat_tuple");
  const statTuple = {
    size_bytes: requiredNonNegativeInteger(value.stat_tuple.size_bytes, "cache_stat_size_bytes"),
    modified_time_ms: requiredSafeInteger(value.stat_tuple.modified_time_ms, "cache_stat_modified_time_ms"),
    changed_time_ms: requiredSafeInteger(value.stat_tuple.changed_time_ms, "cache_stat_changed_time_ms"),
  };
  const verifiedAt = normalizeIso(value.verified_at, "cache_verified_at");
  if (verifiedAt > context.scanIngestedAt) {
    throw new Error("file_activity_scan_cache_verified_at_future");
  }
  if (verifiedAt > context.cacheUpdatedAt) {
    throw new Error("file_activity_scan_cache_verified_at_invalid");
  }
  requireExactRecordKeys(value.provenance, [
    "verification_method",
    "algorithm",
    "producer_node_id",
    "source_scan_id",
    "source_observation_id",
    "source_packet_digest",
  ], "scan_cache_provenance");
  if (
    value.provenance.verification_method !== "streamed_full_file"
    || value.provenance.algorithm !== "sha256"
    || value.provenance.producer_node_id !== context.nodeId
  ) {
    throw new Error("file_activity_scan_cache_provenance_invalid");
  }
  const sourceScanId = normalizeScanId(value.provenance.source_scan_id);
  const sourceObservationId = normalizeStateId(
    value.provenance.source_observation_id,
    "obs",
    "cache_source_observation_id",
  );
  const sourcePacketDigest = normalizeContentDigest(
    value.provenance.source_packet_digest,
    "cache_source_packet_digest",
  );
  const contentId = normalizeContentDigest(value.content_id, "cache_content_id");
  const expectedObservationId = observationIdFor({
    scan_id: sourceScanId,
    node_id: context.nodeId,
    path_fingerprint: pathFingerprint,
    size_bytes: statTuple.size_bytes,
    fs_modified_at: { value: new Date(statTuple.modified_time_ms).toISOString() },
    content_id: contentId,
    hash_status: "hashed_exact",
  });
  if (
    sourceObservationId !== expectedObservationId
    || (sourceScanId === context.lastScanId && sourcePacketDigest !== context.lastPacketDigest)
  ) {
    throw new Error("file_activity_scan_cache_provenance_relationship_invalid");
  }
  return {
    path_fingerprint: pathFingerprint,
    relative_path: relativePath,
    relative_path_spelling: relativePathSpelling,
    path_collision_keys: pathCollisionKeys,
    stat_tuple: statTuple,
    content_id: contentId,
    verified_at: verifiedAt,
    provenance: {
      verification_method: "streamed_full_file",
      algorithm: "sha256",
      producer_node_id: context.nodeId,
      source_scan_id: sourceScanId,
      source_observation_id: sourceObservationId,
      source_packet_digest: sourcePacketDigest,
    },
  };
}

function requireExactRecordKeys(value, expectedKeys, field) {
  if (!isPlainRecord(value)) throw new Error(`file_activity_${field}_shape_invalid`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`file_activity_${field}_unknown_or_missing_field`);
  }
}

function validatePacket(packet, context) {
  if (packet?.schema_version !== FILE_OBSERVATION_PACKET_SCHEMA) {
    throw new Error("file_activity_packet_schema_invalid");
  }
  if (packet.project_code !== context.projectCode || packet.workspace_binding_id !== context.workspaceBindingId) {
    throw new Error("file_activity_packet_scope_mismatch");
  }
  assertNodeRole(packet.node_role);
  const nodeId = normalizeIdentifier(packet.node_id, "packet_node_id");
  const scanId = normalizeScanId(packet.scan_id);
  const nodeSequence = normalizeNonNegativeInteger(packet.node_sequence, 0, "packet_node_sequence");
  if (nodeSequence < 1) throw new Error("file_activity_packet_node_sequence_invalid");
  const priorScanId = packet.prior_scan_id === null ? null : normalizeScanId(packet.prior_scan_id);
  const priorPacketDigest = packet.prior_packet_digest === null
    ? null
    : normalizeContentDigest(packet.prior_packet_digest, "prior_packet_digest");
  if (
    (nodeSequence === 1 && (priorScanId !== null || priorPacketDigest !== null))
    || (nodeSequence > 1 && (priorScanId === null || priorPacketDigest === null))
  ) {
    throw new Error("file_activity_packet_producer_chain_invalid");
  }
  const observedAt = normalizeIso(packet.observed_at, "packet_observed_at");
  const ingestedAt = normalizeIso(packet.ingested_at, "packet_ingested_at");
  if (!Array.isArray(packet.observations) || !packet.coverage) {
    throw new Error("file_activity_packet_shape_invalid");
  }
  const listingComplete = packet.coverage.listing_complete === true;
  const hashComplete = packet.coverage.hash_complete === true;
  const complete = packet.coverage.complete === true;
  const gapReasons = Array.isArray(packet.coverage.gap_reasons)
    ? packet.coverage.gap_reasons.map((reason) => normalizeGapReason(reason))
    : [];
  if (complete && (!listingComplete || !hashComplete || gapReasons.length > 0)) {
    throw new Error("file_activity_packet_coverage_invalid");
  }
  if (!complete && gapReasons.length === 0) {
    throw new Error("file_activity_packet_coverage_invalid");
  }
  const seenObservationIds = new Set();
  const seenPathFingerprints = new Set();
  const observations = packet.observations.map((observation) => {
    if (
      !/^obs:[a-f0-9]{64}$/u.test(String(observation?.observation_id ?? ""))
      || !/^path:[a-f0-9]{64}$/u.test(String(observation?.path_fingerprint ?? ""))
      || observation.node_id !== nodeId
      || observation.node_role !== packet.node_role
      || observation.scan_id !== scanId
      || observation.workspace_binding_id !== context.workspaceBindingId
      || observation.observed_at !== observedAt
      || observation.ingested_at !== ingestedAt
      || observation.entry_kind !== "file"
    ) {
      throw new Error("file_activity_observation_shape_invalid");
    }
    if (seenObservationIds.has(observation.observation_id) || seenPathFingerprints.has(observation.path_fingerprint)) {
      throw new Error("file_activity_observation_duplicate_invalid");
    }
    seenObservationIds.add(observation.observation_id);
    seenPathFingerprints.add(observation.path_fingerprint);
    if (observation.withheld === true || observation.hash_status === "withheld_sensitive") {
      throw new Error("file_activity_sensitive_observation_row_blocked");
    }
    if (observation.content_id && !isExactContentId(observation.content_id)) {
      throw new Error("file_activity_weak_content_identity_blocked");
    }
    const relativePathSpelling = sanitizeRelativePathSpelling(observation.relative_path_spelling);
    const relativePath = sanitizeRelativePath(observation.relative_path);
    if (relativePath !== relativePathSpelling.normalize("NFC")) {
      throw new Error("file_activity_relative_path_spelling_mismatch");
    }
    if (isSensitivePath(relativePathSpelling)) {
      throw new Error("file_activity_sensitive_observation_row_blocked");
    }
    const pathCollisionKeys = sanitizeCollisionKeys(observation.path_collision_keys);
    const recomputedKeys = buildPathCollisionKeys(relativePathSpelling);
    for (const field of ["exact", "nfc", "casefold", "cross_platform_trailing_dot_space"]) {
      if (pathCollisionKeys[field] !== recomputedKeys[field]) {
        throw new Error("file_activity_collision_key_mismatch");
      }
    }
    if (observation.path_fingerprint !== pathFingerprintForCollisionKeys(pathCollisionKeys)) {
      throw new Error("file_activity_path_fingerprint_mismatch");
    }
    if (observation.size_bytes === undefined) {
      throw new Error("file_activity_packet_size_bytes_invalid");
    }
    const sizeBytes = observation.size_bytes === null
      ? null
      : normalizeNonNegativeInteger(observation.size_bytes, 0, "packet_size_bytes");
    const hashStatus = normalizeHashStatus(observation.hash_status);
    const exactStatus = hashStatus === "hashed_exact" || hashStatus === "cached_exact";
    if (exactStatus !== isExactContentId(observation.content_id)) {
      throw new Error("file_activity_observation_hash_state_invalid");
    }
    if (exactStatus && sizeBytes === null) {
      throw new Error("file_activity_exact_hash_size_required");
    }
    let fsModifiedAt = null;
    if (observation.fs_modified_at !== null && observation.fs_modified_at !== undefined) {
      if (observation.fs_modified_at.trust !== "untrusted_hint" || observation.fs_modified_at.ordering_authority !== false) {
        throw new Error("file_activity_fs_modified_hint_contract_invalid");
      }
      fsModifiedAt = {
        value: normalizeIso(observation.fs_modified_at.value, "packet_fs_modified_at"),
        trust: "untrusted_hint",
        ordering_authority: false,
      };
    }
    if (!fsModifiedAt) throw new Error("file_activity_fs_modified_hint_required");
    const sanitized = {
      observation_id: String(observation.observation_id),
      scan_id: scanId,
      workspace_binding_id: context.workspaceBindingId,
      node_id: nodeId,
      node_role: packet.node_role,
      observed_at: observedAt,
      ingested_at: ingestedAt,
      relative_path: relativePath,
      relative_path_spelling: relativePathSpelling,
      path_fingerprint: String(observation.path_fingerprint),
      path_collision_keys: pathCollisionKeys,
      entry_kind: "file",
      size_bytes: sizeBytes,
      fs_modified_at: fsModifiedAt,
      content_id: observation.content_id ?? null,
      hash_status: hashStatus,
      withheld: false,
      withheld_reason: null,
    };
    if (sanitized.observation_id !== observationIdFor(sanitized)) {
      throw new Error("file_activity_observation_id_mismatch");
    }
    return sanitized;
  });
  const collisions = detectPathCollisions(observations);
  const counts = sanitizePacketCounts(packet.counts, observations, collisions);
  const hashPolicy = sanitizeHashPolicy(packet.hash_policy);
  const packetRef = sanitizePacketRef(packet.packet_ref, context.projectCode, nodeId);
  return {
    schema_version: FILE_OBSERVATION_PACKET_SCHEMA,
    packet_kind: "file_observation_scan",
    packet_ref: packetRef,
    scan_id: scanId,
    project_code: context.projectCode,
    workspace_binding_id: context.workspaceBindingId,
    node_id: nodeId,
    node_role: packet.node_role,
    node_sequence: nodeSequence,
    prior_scan_id: priorScanId,
    prior_packet_digest: priorPacketDigest,
    observed_at: observedAt,
    ingested_at: ingestedAt,
    temporal_ordering: assessClock(observedAt, ingestedAt),
    coverage: {
      complete,
      listing_complete: listingComplete,
      hash_complete: hashComplete,
      gap_reasons: gapReasons,
    },
    hash_policy: hashPolicy,
    counts,
    observations,
    collisions,
  };
}

function sanitizePacketCounts(value, observations, collisions) {
  const withheldSensitiveCount = requiredNonNegativeInteger(value?.withheld_sensitive_count, "packet_withheld_count");
  const excludedEntryCount = requiredNonNegativeInteger(value?.excluded_entry_count, "packet_excluded_count");
  return {
    observed_file_count: observations.length,
    exact_content_count: observations.filter((entry) => isExactContentId(entry.content_id)).length,
    cached_exact_count: observations.filter((entry) => entry.hash_status === "cached_exact").length,
    queued_hash_count: observations.filter((entry) => [
      "queued_large",
      "queued_budget",
      "queued_unstable",
      "hash_error",
    ].includes(entry.hash_status)).length,
    withheld_sensitive_count: withheldSensitiveCount,
    excluded_entry_count: excludedEntryCount,
    collision_count: collisions.length,
  };
}

function sanitizeHashPolicy(value) {
  if (
    value?.algorithm !== "sha256"
    || value?.exact_content_id_prefix !== "sha256:"
    || value?.weak_or_sample_hash_is_identity !== false
    || value?.unchanged_stat_tuple_cache_enabled !== true
    || typeof value?.force_rehash !== "boolean"
  ) {
    throw new Error("file_activity_hash_policy_invalid");
  }
  return {
    algorithm: "sha256",
    exact_content_id_prefix: "sha256:",
    immediate_hash_max_bytes: requiredNonNegativeInteger(value.immediate_hash_max_bytes, "packet_immediate_hash_max_bytes"),
    scan_byte_budget: requiredNonNegativeInteger(value.scan_byte_budget, "packet_scan_byte_budget"),
    hashed_bytes: requiredNonNegativeInteger(value.hashed_bytes, "packet_hashed_bytes"),
    weak_or_sample_hash_is_identity: false,
    unchanged_stat_tuple_cache_enabled: true,
    force_rehash: value.force_rehash,
  };
}

function sanitizePacketRef(value, projectCode, nodeId) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).normalize("NFC");
  const prefix = `_workmeta/${projectCode}/reports/file_activity/observations/${nodeId}/`;
  if (
    !normalized.startsWith(prefix)
    || normalized.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(normalized)
    || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
    || !normalized.endsWith(".json")
  ) {
    throw new Error("file_activity_packet_ref_invalid");
  }
  return normalized;
}

function sanitizeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("file_activity_relative_path_invalid");
  }
  const normalized = value.normalize("NFC");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/")
    || normalized.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(normalized)
    || /^[A-Za-z]:/u.test(normalized)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || value !== normalized
  ) {
    throw new Error("file_activity_relative_path_invalid");
  }
  return normalized;
}

function sanitizeRelativePathSpelling(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("file_activity_relative_path_spelling_invalid");
  }
  const segments = value.split("/");
  if (
    value.startsWith("/")
    || value.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(value)
    || /^[A-Za-z]:/u.test(value)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("file_activity_relative_path_spelling_invalid");
  }
  return value;
}

function sanitizeCollisionKeys(value) {
  const expected = {
    exact: "exact",
    nfc: "nfc",
    casefold: "casefold",
    cross_platform_trailing_dot_space: "cross",
  };
  const result = {};
  for (const [field, prefix] of Object.entries(expected)) {
    const candidate = String(value?.[field] ?? "");
    if (!new RegExp(`^${prefix}:[a-f0-9]{64}$`, "u").test(candidate)) {
      throw new Error("file_activity_collision_key_invalid");
    }
    result[field] = candidate;
  }
  return result;
}

function normalizeHashStatus(value) {
  const allowed = new Set([
    "hashed_exact",
    "cached_exact",
    "queued_large",
    "queued_budget",
    "queued_unstable",
    "hash_error",
  ]);
  if (!allowed.has(value)) throw new Error("file_activity_hash_status_invalid");
  return value;
}

function normalizeGapReason(value) {
  const normalized = String(value ?? "").normalize("NFC");
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(normalized)) {
    throw new Error("file_activity_gap_reason_invalid");
  }
  return normalized;
}

function assessClock(observedAt, ingestedAt) {
  const skewMs = Math.abs(Date.parse(ingestedAt) - Date.parse(observedAt));
  if (skewMs > FIFTEEN_MINUTES_MS) {
    return {
      state: "clock_skew_blocked_exact_order",
      clock_skew_ms: skewMs,
      warning: true,
      ordering_basis: "ingested_at_receipt_order",
      ordering_at: ingestedAt,
      exact_temporal_ordering_blocked: true,
    };
  }
  if (skewMs > FIVE_MINUTES_MS) {
    return {
      state: "clock_skew_receipt_order_warning",
      clock_skew_ms: skewMs,
      warning: true,
      ordering_basis: "ingested_at_receipt_order",
      ordering_at: ingestedAt,
      exact_temporal_ordering_blocked: false,
    };
  }
  return {
    state: "observed_order_within_clock_tolerance",
    clock_skew_ms: skewMs,
    warning: false,
    ordering_basis: "observed_at",
    ordering_at: observedAt,
    exact_temporal_ordering_blocked: false,
  };
}

function comparePackets(left, right) {
  if (left.node_id === right.node_id && left.node_sequence !== right.node_sequence) {
    return left.node_sequence - right.node_sequence;
  }
  const time = left.temporal_ordering.ordering_at.localeCompare(right.temporal_ordering.ordering_at);
  return time || left.scan_id.localeCompare(right.scan_id);
}

function compareObservations(left, right) {
  const time = left.ingested_at.localeCompare(right.ingested_at);
  return time || left.observation_id.localeCompare(right.observation_id);
}

function uniqueLogicalCandidates(state, bindings) {
  const ids = [...new Set(bindings.map((entry) => entry.logical_file_id))];
  return ids.map((logicalFileId) => findLogical(state, logicalFileId));
}

function findLogical(state, logicalFileId) {
  const logical = state.logical_files.find((entry) => entry.logical_file_id === logicalFileId);
  if (!logical) throw new Error("file_activity_logical_file_missing");
  return logical;
}

function findRevision(state, revisionId) {
  const revision = state.revisions.find((entry) => entry.revision_id === revisionId);
  if (!revision) throw new Error("file_activity_revision_missing");
  return revision;
}

function laterIso(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left.localeCompare(right) >= 0 ? left : right;
}

function isSensitivePath(relativePath) {
  return toPosixPath(relativePath).split("/").some((segment) => isSensitivePathSegment(segment));
}

function isCollectorOwnedPath(candidatePath) {
  const segments = path.resolve(candidatePath)
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => segment.normalize("NFC"));
  if (segments.some((segment) => segment === "_workmeta" || segment === "private-state")) return true;
  const collectorSegments = ["guild_hall", "state", "local", "file_activity"];
  for (let index = 0; index <= segments.length - collectorSegments.length; index += 1) {
    if (collectorSegments.every((segment, offset) => segments[index + offset] === segment)) return true;
  }
  return false;
}

function isSensitivePathSegment(name) {
  const normalized = name.normalize("NFC").toLocaleLowerCase("und");
  return (
    normalized === ".env"
    || normalized.startsWith(".env.")
    || normalized === ".envrc"
    || normalized === ".npmrc"
    || normalized === ".pypirc"
    || normalized === ".ssh"
    || normalized === "id_rsa"
    || normalized === "id_ed25519"
    || /^(credentials?|tokens?|secrets?|cookies?|sessions?)([._-].*)?$/u.test(normalized)
    || /\.(pem|key|p12|pfx)$/u.test(normalized)
  );
}

function isTemporaryName(name) {
  const normalized = name.normalize("NFC").toLocaleLowerCase("und");
  return (
    normalized.startsWith("~$")
    || normalized.endsWith("~")
    || /\.(tmp|temp|part|partial|crdownload|download|swp|swo)$/u.test(normalized)
  );
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) throw new Error("file_activity_hash_target_not_regular_file");
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) hash.update(chunk);
    return `sha256:${hash.digest("hex")}`;
  } finally {
    await handle.close().catch(() => {});
  }
}

function stableId(prefix, ...parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    const normalized = String(part ?? "").normalize("NFC");
    hash.update(String(Buffer.byteLength(normalized, "utf8")));
    hash.update(":");
    hash.update(normalized);
    hash.update("|");
  }
  return `${prefix}:${hash.digest("hex")}`;
}

function opaqueKey(kind, value) {
  return `${kind}:${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
}

function makeScanId({ nodeId, observedAt, ingestedAt }) {
  return `scan:${createHash("sha256")
    .update(`${nodeId}|${observedAt}|${ingestedAt}|${randomBytes(12).toString("hex")}`)
    .digest("hex")}`;
}

function normalizeScanId(value) {
  const normalized = String(value ?? "").normalize("NFC");
  if (!/^scan:[a-f0-9]{64}$/u.test(normalized)) {
    throw new Error("file_activity_scan_id_invalid");
  }
  return normalized;
}

function normalizeIdentifier(value, field) {
  const normalized = String(value ?? "").normalize("NFC");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(normalized)) {
    throw new Error(`file_activity_${field}_invalid`);
  }
  return normalized;
}

function assertNodeRole(nodeRole) {
  if (!NODE_ROLES.includes(nodeRole)) throw new Error("file_activity_node_role_invalid");
}

function normalizeIso(value, field) {
  const raw = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(raw)) {
    throw new Error(`file_activity_${field}_invalid`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== raw) {
    throw new Error(`file_activity_${field}_invalid`);
  }
  return raw;
}

function normalizeContentDigest(value, field) {
  const normalized = String(value ?? "");
  if (!/^sha256:[a-f0-9]{64}$/u.test(normalized)) {
    throw new Error(`file_activity_${field}_invalid`);
  }
  return normalized;
}

function normalizeNonNegativeInteger(value, fallback, field) {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`file_activity_${field}_invalid`);
  return number;
}

function requiredNonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`file_activity_${field}_invalid`);
  }
  return value;
}

function requiredSafeInteger(value, field) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`file_activity_${field}_invalid`);
  }
  return value;
}

function normalizePositiveIntegerOrInfinity(value, fallback, field) {
  if (value === undefined || value === null) return fallback;
  if (value === Number.POSITIVE_INFINITY) return value;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`file_activity_${field}_invalid`);
  return number;
}

function isExactContentId(value) {
  return /^sha256:[a-f0-9]{64}$/u.test(String(value ?? ""));
}

function toPosixPath(value) {
  return String(value).split(path.sep).join("/");
}

function isContainedPath(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function addUnique(array, value) {
  if (!array.includes(value)) array.push(value);
}

function dedupeBy(rows, key) {
  const map = new Map();
  for (const row of rows) map.set(row[key], row);
  return [...map.values()];
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
