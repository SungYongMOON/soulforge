// Whole-estate asset-class revision/evidence ledger — pure, refs-only core.
//
// The ledger indexes revisions that remain owned by their existing logical,
// byte, revision, acceptance and backup/restore authorities. It never reads or
// stores bytes, resolves a path, calls a provider, supplies a clock, accepts a
// revision, performs backup/restore, or creates authority. Acceptance, backup
// and restore inputs are separate evidence observations and projections name
// them as evidence, never as effects performed by this module.

export const ASSET_CLASS_REVISION_LEDGER_SCHEMA =
  "soulforge.asset_class_revision_ledger.v0";

export const WHOLE_ESTATE_ASSET_CLASSES = Object.freeze([
  "knowledge",
  "project_assets",
  "artifacts",
  "templates",
  "bom_material",
  "datasets",
  "test_results",
  "engine_rules_profiles",
  "ai_workforce",
]);

export const ASSET_CLASS_LEDGER_HOLD_CODES = Object.freeze({
  UNKNOWN_LEDGER: "ASSET_CLASS_LEDGER_UNKNOWN",
  INPUT_INVALID: "ASSET_CLASS_INPUT_INVALID",
  ASSET_CLASS_INVALID: "ASSET_CLASS_INVALID",
  SCOPE_INVALID: "ASSET_CLASS_SCOPE_INVALID",
  FIELD_INVALID: "ASSET_CLASS_FIELD_INVALID",
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: "ASSET_CLASS_RAW_OR_UNKNOWN_FIELD_FORBIDDEN",
  LOCAL_PATH_VALUE_FORBIDDEN: "ASSET_CLASS_LOCAL_PATH_VALUE_FORBIDDEN",
  SECRET_VALUE_FORBIDDEN: "ASSET_CLASS_SECRET_VALUE_FORBIDDEN",
  ACCESSOR_PROPERTY_FORBIDDEN: "ASSET_CLASS_ACCESSOR_PROPERTY_FORBIDDEN",
  HOSTILE_INPUT_REFUSED: "ASSET_CLASS_HOSTILE_INPUT_REFUSED",
  REVISION_CONFLICT: "ASSET_CLASS_REVISION_CONFLICT",
  REVISION_REF_CONFLICT: "ASSET_CLASS_REVISION_REF_CONFLICT",
  SUPERSESSION_REQUIRED: "ASSET_CLASS_SUPERSESSION_REQUIRED",
  NON_MONOTONIC_REVISION: "ASSET_CLASS_NON_MONOTONIC_REVISION",
  REVISION_TIME_REGRESSION: "ASSET_CLASS_REVISION_TIME_REGRESSION",
  REVISION_UNAVAILABLE: "ASSET_CLASS_REVISION_UNAVAILABLE",
  EVIDENCE_CONFLICT: "ASSET_CLASS_EVIDENCE_CONFLICT",
  ACCEPTANCE_SELF_PROMOTION: "ASSET_CLASS_ACCEPTANCE_SELF_PROMOTION",
  ACCEPTANCE_OWNER_MISMATCH: "ASSET_CLASS_ACCEPTANCE_OWNER_MISMATCH",
  ACCEPTANCE_TIME_INVALID: "ASSET_CLASS_ACCEPTANCE_TIME_INVALID",
  BACKUP_OWNER_MISMATCH: "ASSET_CLASS_BACKUP_OWNER_MISMATCH",
  BACKUP_DIGEST_MISMATCH: "ASSET_CLASS_BACKUP_DIGEST_MISMATCH",
  RESTORE_WITHOUT_BACKUP: "ASSET_CLASS_RESTORE_WITHOUT_BACKUP",
  RESTORE_DIGEST_MISMATCH: "ASSET_CLASS_RESTORE_DIGEST_MISMATCH",
  EVIDENCE_TIME_INVALID: "ASSET_CLASS_EVIDENCE_TIME_INVALID",
});

const H = ASSET_CLASS_LEDGER_HOLD_CODES;
const STATE = new WeakMap();
const REF = /^[a-z][a-z0-9_.:/-]{1,180}$/;
const REVISION_IDENTITY = /^asset_revision:[A-Za-z0-9_.:/~-]{1,900}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SCOPE_KINDS = Object.freeze(["project", "organization"]);
const OWNER_KEYS = Object.freeze([
  "logical", "byte", "revision", "acceptance", "backup_restore",
]);

const REVISION_FIELDS = Object.freeze([
  "asset_class", "asset_id", "scope_kind", "scope_ref",
  "logical_asset_ref", "revision_ref", "revision_seq",
  "supersedes_revision_ref", "content_digest", "owner_refs",
  "source_revision_ref", "custody_receipt_ref", "producer_ref",
  "created_at", "observed_at", "acceptance_state", "acceptance_ref",
  "accepted_by_ref", "backup_generation_ref", "restore_test_ref",
]);

const ACCEPTANCE_FIELDS = Object.freeze([
  "revision_identity", "scope_kind", "scope_ref", "acceptance_state",
  "acceptance_ref", "accepted_by_ref", "accepted_at",
]);

const BACKUP_FIELDS = Object.freeze([
  "revision_identity", "scope_kind", "scope_ref", "backup_generation_ref",
  "backup_receipt_ref", "backup_owner_ref", "content_digest", "backed_up_at",
]);

const RESTORE_FIELDS = Object.freeze([
  "revision_identity", "scope_kind", "scope_ref", "backup_generation_ref",
  "restore_test_ref", "restore_receipt_ref", "backup_owner_ref",
  "readback_digest", "restored_at",
]);

const PROJECT_FIELDS = Object.freeze(["scope_kind", "scope_ref"]);

function hold(holdCode) {
  return Object.freeze({ status: "HOLD", hold_code: holdCode });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function naturalPart(value) {
  return encodeURIComponent(value).replaceAll("%", "~");
}

function assetNaturalKey(record) {
  return [record.asset_class, record.scope_kind, record.scope_ref, record.asset_id]
    .map(naturalPart).join("/");
}

function revisionNaturalIdentity(record) {
  return `asset_revision:${assetNaturalKey(record)}/${naturalPart(record.revision_ref)}`;
}

function absolutePathLeak(value) {
  return typeof value === "string" && (
    /^[A-Za-z]:[\\/]/u.test(value)
    || value.startsWith("\\\\")
    || value.startsWith("//")
    || value.startsWith("/")
    || value.includes("\\")
  );
}

function secretValueLeak(value) {
  return typeof value === "string" && (
    /^(?:bearer|basic)\s+/iu.test(value)
    || /^sk-[A-Za-z0-9_-]{8,}$/u.test(value)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(value)
  );
}

function inspectDataObject(value, allowedKeys, requiredKeys = allowedKeys) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, hold_code: H.INPUT_INVALID };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { ok: false, hold_code: H.INPUT_INVALID };
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      return { ok: false, hold_code: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN };
    }
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        return { ok: false, hold_code: H.ACCESSOR_PROPERTY_FORBIDDEN };
      }
    }
    const allowed = new Set(allowedKeys);
    if (keys.some((key) => !allowed.has(key))) {
      return { ok: false, hold_code: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN };
    }
    const present = new Set(keys);
    if (requiredKeys.some((key) => !present.has(key))) {
      return { ok: false, hold_code: H.INPUT_INVALID };
    }
    const data = {};
    for (const key of keys) {
      const fieldValue = descriptors[key].value;
      if (absolutePathLeak(fieldValue)) {
        return { ok: false, hold_code: H.LOCAL_PATH_VALUE_FORBIDDEN };
      }
      if (secretValueLeak(fieldValue)) {
        return { ok: false, hold_code: H.SECRET_VALUE_FORBIDDEN };
      }
      data[key] = fieldValue;
    }
    return { ok: true, data };
  } catch {
    return { ok: false, hold_code: H.HOSTILE_INPUT_REFUSED };
  }
}

function validRef(value) {
  return typeof value === "string" && REF.test(value) && !absolutePathLeak(value)
    && !secretValueLeak(value);
}

function validDigest(value) {
  return typeof value === "string" && SHA256.test(value);
}

function clock(value) {
  if (typeof value !== "string") return null;
  const matched = ISO.exec(value);
  if (matched === null) return null;
  const calendar = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/u
    .exec(value);
  if (calendar === null) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    fractionText = "0"] = calendar;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return null;
  // Date.parse normalizes some impossible calendars. Only call it after the
  // explicit Gregorian check, using one exact millisecond-normalized UTC
  // spelling so equivalent .1/.10/.100 inputs compare identically.
  const canonical = `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}.${fractionText.padEnd(3, "0")}Z`;
  const parsed = Date.parse(canonical);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateScope(data) {
  return SCOPE_KINDS.includes(data.scope_kind) && validRef(data.scope_ref);
}

function validateOwners(value) {
  const inspected = inspectDataObject(value, OWNER_KEYS);
  if (!inspected.ok) return inspected;
  if (OWNER_KEYS.some((key) => !validRef(inspected.data[key]))) {
    return { ok: false, hold_code: H.FIELD_INVALID };
  }
  return { ok: true, data: deepFreeze({ ...inspected.data }) };
}

function inspectInput(value, fields) {
  return inspectDataObject(value, fields);
}

function scopeKey(scopeKind, scopeRef) {
  return `${naturalPart(scopeKind)}/${naturalPart(scopeRef)}`;
}

function sameScope(record, input) {
  return record.scope_kind === input.scope_kind && record.scope_ref === input.scope_ref;
}

function eventAppend(state, identity, eventKind, payload) {
  const serialized = canonical(payload);
  const prior = state.eventsByIdentity.get(identity);
  if (prior !== undefined) {
    return prior.serialized === serialized
      ? deepFreeze({
        status: "NO_OP",
        event_identity: identity,
        append_seq: prior.event.append_seq,
        event: prior.event,
      })
      : hold(eventKind === "revision" ? H.REVISION_CONFLICT : H.EVIDENCE_CONFLICT);
  }
  const event = deepFreeze({
    append_seq: state.events.length + 1,
    event_kind: eventKind,
    event_identity: identity,
    ...payload,
  });
  state.events.push(event);
  state.eventsByIdentity.set(identity, { serialized, event });
  return deepFreeze({
    status: "APPENDED",
    event_identity: identity,
    append_seq: event.append_seq,
    event,
  });
}

function resolveRevision(state, input) {
  if (!validateScope(input) || typeof input.revision_identity !== "string"
    || !REVISION_IDENTITY.test(input.revision_identity)) return null;
  const record = state.revisions.get(input.revision_identity);
  return record && sameScope(record, input) ? record : null;
}

function revisionEvidence(state, revisionIdentity) {
  return {
    acceptance: state.acceptanceByRevision.get(revisionIdentity) ?? null,
    backups: [...(state.backupsByRevision.get(revisionIdentity) ?? [])]
      .map((identity) => state.eventsByIdentity.get(identity).event),
    restores: [...(state.restoresByRevision.get(revisionIdentity) ?? [])]
      .map((identity) => state.eventsByIdentity.get(identity).event),
  };
}

export function createAssetClassRevisionLedger() {
  const ledger = Object.freeze({ kind: ASSET_CLASS_REVISION_LEDGER_SCHEMA });
  STATE.set(ledger, {
    events: [],
    eventsByIdentity: new Map(),
    revisions: new Map(),
    assets: new Map(),
    revisionRefIndex: new Map(),
    acceptanceByRevision: new Map(),
    acceptanceRefIndex: new Map(),
    backupsByRevision: new Map(),
    backupRefIndex: new Map(),
    restoresByRevision: new Map(),
    restoreRefIndex: new Map(),
  });
  return ledger;
}

export function appendAssetRevisionRecord(ledger, input) {
  const state = STATE.get(ledger);
  if (state === undefined) return hold(H.UNKNOWN_LEDGER);
  const inspected = inspectInput(input, REVISION_FIELDS);
  if (!inspected.ok) return hold(inspected.hold_code);
  const data = inspected.data;
  if (!WHOLE_ESTATE_ASSET_CLASSES.includes(data.asset_class)) {
    return hold(H.ASSET_CLASS_INVALID);
  }
  if (!validateScope(data)) return hold(H.SCOPE_INVALID);
  const owners = validateOwners(data.owner_refs);
  if (!owners.ok) return hold(owners.hold_code);
  if (![data.asset_id, data.logical_asset_ref, data.revision_ref,
    data.source_revision_ref, data.custody_receipt_ref, data.producer_ref]
    .every(validRef)
    || !validDigest(data.content_digest)
    || !Number.isSafeInteger(data.revision_seq) || data.revision_seq < 1
    || (data.supersedes_revision_ref !== null && !validRef(data.supersedes_revision_ref))
    || data.acceptance_state !== "candidate"
    || data.acceptance_ref !== null || data.accepted_by_ref !== null
    || data.backup_generation_ref !== null || data.restore_test_ref !== null) {
    return hold(H.FIELD_INVALID);
  }
  const created = clock(data.created_at);
  const observed = clock(data.observed_at);
  if (created === null || observed === null || observed < created) return hold(H.FIELD_INVALID);

  const record = deepFreeze({ ...data, owner_refs: owners.data });
  const revisionIdentity = revisionNaturalIdentity(record);
  const priorByIdentity = state.eventsByIdentity.get(revisionIdentity);
  if (priorByIdentity !== undefined) {
    const replayPayload = { revision_identity: revisionIdentity, ...record };
    return priorByIdentity.serialized === canonical(replayPayload)
      ? deepFreeze({
        status: "NO_OP",
        event_identity: revisionIdentity,
        append_seq: priorByIdentity.event.append_seq,
        event: priorByIdentity.event,
      })
      : hold(H.REVISION_CONFLICT);
  }

  const assetKey = assetNaturalKey(record);
  const asset = state.assets.get(assetKey);
  if (asset === undefined) {
    if (record.revision_seq !== 1 || record.supersedes_revision_ref !== null) {
      return hold(H.SUPERSESSION_REQUIRED);
    }
  } else {
    const head = state.revisions.get(asset.head_revision_identity);
    if (record.supersedes_revision_ref !== head.revision_ref) {
      return hold(H.SUPERSESSION_REQUIRED);
    }
    if (record.revision_seq <= head.revision_seq) return hold(H.NON_MONOTONIC_REVISION);
    if (created < clock(head.created_at) || observed < clock(head.observed_at)) {
      return hold(H.REVISION_TIME_REGRESSION);
    }
  }

  const revisionRefKey = `${assetKey}/${naturalPart(record.revision_ref)}`;
  if (state.revisionRefIndex.has(revisionRefKey)) return hold(H.REVISION_REF_CONFLICT);
  const result = eventAppend(state, revisionIdentity, "revision", {
    revision_identity: revisionIdentity,
    ...record,
  });
  if (result.status !== "APPENDED") return result;
  state.revisions.set(revisionIdentity, result.event);
  state.revisionRefIndex.set(revisionRefKey, revisionIdentity);
  const identities = asset?.revision_identities ?? [];
  state.assets.set(assetKey, {
    head_revision_identity: revisionIdentity,
    revision_identities: [...identities, revisionIdentity],
  });
  return result;
}

export function appendAssetAcceptanceEvidence(ledger, input) {
  const state = STATE.get(ledger);
  if (state === undefined) return hold(H.UNKNOWN_LEDGER);
  const inspected = inspectInput(input, ACCEPTANCE_FIELDS);
  if (!inspected.ok) return hold(inspected.hold_code);
  const data = inspected.data;
  if (!validateScope(data)) return hold(H.SCOPE_INVALID);
  const revision = resolveRevision(state, data);
  if (revision === null) return hold(H.REVISION_UNAVAILABLE);
  if (data.acceptance_state !== "acceptance_evidence"
    || !validRef(data.acceptance_ref) || !validRef(data.accepted_by_ref)
    || clock(data.accepted_at) === null) return hold(H.FIELD_INVALID);
  if (data.accepted_by_ref !== revision.owner_refs.acceptance) {
    return hold(H.ACCEPTANCE_OWNER_MISMATCH);
  }
  if (data.accepted_by_ref === revision.producer_ref) {
    return hold(H.ACCEPTANCE_SELF_PROMOTION);
  }
  if (clock(data.accepted_at) < clock(revision.observed_at)) {
    return hold(H.ACCEPTANCE_TIME_INVALID);
  }
  const identity = `asset_acceptance:${naturalPart(data.revision_identity)}`;
  const acceptanceRefKey = `${scopeKey(data.scope_kind, data.scope_ref)}/${naturalPart(data.acceptance_ref)}`;
  const priorRefIdentity = state.acceptanceRefIndex.get(acceptanceRefKey);
  if (priorRefIdentity !== undefined && priorRefIdentity !== identity) {
    return hold(H.EVIDENCE_CONFLICT);
  }
  const result = eventAppend(state, identity, "acceptance_evidence", { ...data });
  if (result.status === "APPENDED") {
    state.acceptanceByRevision.set(data.revision_identity, result.event);
    state.acceptanceRefIndex.set(acceptanceRefKey, identity);
  }
  return result;
}

export function appendAssetBackupEvidence(ledger, input) {
  const state = STATE.get(ledger);
  if (state === undefined) return hold(H.UNKNOWN_LEDGER);
  const inspected = inspectInput(input, BACKUP_FIELDS);
  if (!inspected.ok) return hold(inspected.hold_code);
  const data = inspected.data;
  if (!validateScope(data)) return hold(H.SCOPE_INVALID);
  const revision = resolveRevision(state, data);
  if (revision === null) return hold(H.REVISION_UNAVAILABLE);
  if (![data.backup_generation_ref, data.backup_receipt_ref, data.backup_owner_ref]
    .every(validRef) || !validDigest(data.content_digest) || clock(data.backed_up_at) === null) {
    return hold(H.FIELD_INVALID);
  }
  if (data.backup_owner_ref !== revision.owner_refs.backup_restore) {
    return hold(H.BACKUP_OWNER_MISMATCH);
  }
  if (data.content_digest !== revision.content_digest) return hold(H.BACKUP_DIGEST_MISMATCH);
  if (clock(data.backed_up_at) < clock(revision.observed_at)) return hold(H.EVIDENCE_TIME_INVALID);
  const refKey = `${naturalPart(data.scope_kind)}/${naturalPart(data.scope_ref)}/${naturalPart(data.backup_generation_ref)}`;
  const identity = `asset_backup:${naturalPart(data.revision_identity)}/${naturalPart(data.backup_generation_ref)}`;
  const priorRefIdentity = state.backupRefIndex.get(refKey);
  if (priorRefIdentity !== undefined && priorRefIdentity !== identity) return hold(H.EVIDENCE_CONFLICT);
  const result = eventAppend(state, identity, "backup_evidence", { ...data });
  if (result.status === "APPENDED") {
    const identities = state.backupsByRevision.get(data.revision_identity) ?? [];
    identities.push(identity);
    state.backupsByRevision.set(data.revision_identity, identities);
    state.backupRefIndex.set(refKey, identity);
  }
  return result;
}

export function appendAssetRestoreEvidence(ledger, input) {
  const state = STATE.get(ledger);
  if (state === undefined) return hold(H.UNKNOWN_LEDGER);
  const inspected = inspectInput(input, RESTORE_FIELDS);
  if (!inspected.ok) return hold(inspected.hold_code);
  const data = inspected.data;
  if (!validateScope(data)) return hold(H.SCOPE_INVALID);
  const revision = resolveRevision(state, data);
  if (revision === null) return hold(H.REVISION_UNAVAILABLE);
  if (![data.backup_generation_ref, data.restore_test_ref, data.restore_receipt_ref,
    data.backup_owner_ref].every(validRef)
    || !validDigest(data.readback_digest) || clock(data.restored_at) === null) {
    return hold(H.FIELD_INVALID);
  }
  if (data.backup_owner_ref !== revision.owner_refs.backup_restore) {
    return hold(H.BACKUP_OWNER_MISMATCH);
  }
  const backupRefKey = `${naturalPart(data.scope_kind)}/${naturalPart(data.scope_ref)}/${naturalPart(data.backup_generation_ref)}`;
  const backupIdentity = state.backupRefIndex.get(backupRefKey);
  const backup = backupIdentity === undefined ? null : state.eventsByIdentity.get(backupIdentity)?.event;
  if (backup === null || backup === undefined || backup.revision_identity !== data.revision_identity) {
    return hold(H.RESTORE_WITHOUT_BACKUP);
  }
  if (data.readback_digest !== backup.content_digest) return hold(H.RESTORE_DIGEST_MISMATCH);
  if (clock(data.restored_at) < clock(backup.backed_up_at)) return hold(H.EVIDENCE_TIME_INVALID);
  const refKey = `${scopeKey(data.scope_kind, data.scope_ref)}/${naturalPart(data.restore_test_ref)}`;
  const identity = `asset_restore:${naturalPart(data.revision_identity)}/${naturalPart(data.restore_test_ref)}`;
  const priorRefIdentity = state.restoreRefIndex.get(refKey);
  if (priorRefIdentity !== undefined && priorRefIdentity !== identity) return hold(H.EVIDENCE_CONFLICT);
  const result = eventAppend(state, identity, "restore_evidence", { ...data });
  if (result.status === "APPENDED") {
    const identities = state.restoresByRevision.get(data.revision_identity) ?? [];
    identities.push(identity);
    state.restoresByRevision.set(data.revision_identity, identities);
    state.restoreRefIndex.set(refKey, identity);
  }
  return result;
}

function projectedRevision(state, revision, asset) {
  const evidence = revisionEvidence(state, revision.revision_identity);
  const index = asset.revision_identities.indexOf(revision.revision_identity);
  const nextIdentity = index >= 0 && index + 1 < asset.revision_identities.length
    ? asset.revision_identities[index + 1] : null;
  const next = nextIdentity === null ? null : state.revisions.get(nextIdentity);
  return deepFreeze({
    asset_class: revision.asset_class,
    asset_id: revision.asset_id,
    scope_kind: revision.scope_kind,
    scope_ref: revision.scope_ref,
    logical_asset_ref: revision.logical_asset_ref,
    revision_identity: revision.revision_identity,
    revision_ref: revision.revision_ref,
    revision_seq: revision.revision_seq,
    supersedes_revision_ref: revision.supersedes_revision_ref,
    superseded_by_revision_ref: next?.revision_ref ?? null,
    is_head: asset.head_revision_identity === revision.revision_identity,
    content_digest: revision.content_digest,
    owner_refs: revision.owner_refs,
    source_revision_ref: revision.source_revision_ref,
    custody_receipt_ref: revision.custody_receipt_ref,
    producer_ref: revision.producer_ref,
    created_at: revision.created_at,
    observed_at: revision.observed_at,
    acceptance_state: evidence.acceptance === null
      ? "candidate" : "acceptance_evidence_present",
    acceptance_ref: evidence.acceptance?.acceptance_ref ?? null,
    accepted_by_ref: evidence.acceptance?.accepted_by_ref ?? null,
    accepted_at: evidence.acceptance?.accepted_at ?? null,
    backup_state: evidence.backups.length === 0 ? "no_evidence" : "evidence_present",
    backup_generations: evidence.backups.map((event) => ({
      backup_generation_ref: event.backup_generation_ref,
      backup_receipt_ref: event.backup_receipt_ref,
      content_digest: event.content_digest,
      backed_up_at: event.backed_up_at,
    })),
    restore_state: evidence.restores.length === 0 ? "no_evidence" : "evidence_present",
    restore_tests: evidence.restores.map((event) => ({
      backup_generation_ref: event.backup_generation_ref,
      restore_test_ref: event.restore_test_ref,
      restore_receipt_ref: event.restore_receipt_ref,
      readback_digest: event.readback_digest,
      restored_at: event.restored_at,
    })),
    authority_boundary: {
      acceptance_granted: false,
      byte_authority_created: false,
      backup_or_restore_performed: false,
    },
  });
}

export function projectAssetRevisionIndex(ledger, input) {
  const state = STATE.get(ledger);
  if (state === undefined) return hold(H.UNKNOWN_LEDGER);
  const inspected = inspectInput(input, PROJECT_FIELDS);
  if (!inspected.ok) return hold(inspected.hold_code);
  if (!validateScope(inspected.data)) return hold(H.SCOPE_INVALID);
  const rows = [];
  for (const [assetKey, asset] of state.assets) {
    for (const revisionIdentity of asset.revision_identities) {
      const revision = state.revisions.get(revisionIdentity);
      if (sameScope(revision, inspected.data)) rows.push(projectedRevision(state, revision, asset));
    }
  }
  rows.sort((a, b) => (a.asset_class < b.asset_class ? -1 : a.asset_class > b.asset_class ? 1 : 0)
    || (a.asset_id < b.asset_id ? -1 : a.asset_id > b.asset_id ? 1 : 0)
    || a.revision_seq - b.revision_seq);
  return deepFreeze({
    status: "PROJECTED",
    schema: ASSET_CLASS_REVISION_LEDGER_SCHEMA,
    scope_kind: inspected.data.scope_kind,
    scope_ref: inspected.data.scope_ref,
    row_count: rows.length,
    rows,
  });
}

export function projectAssetClassEvidenceRows(ledger, input) {
  const index = projectAssetRevisionIndex(ledger, input);
  if (index.status !== "PROJECTED") return index;
  const rows = WHOLE_ESTATE_ASSET_CLASSES.map((assetClass) => {
    const revisions = index.rows.filter((row) => row.asset_class === assetClass);
    const heads = revisions.filter((row) => row.is_head);
    const complete = heads.filter((row) => row.acceptance_state === "acceptance_evidence_present"
      && row.backup_state === "evidence_present" && row.restore_state === "evidence_present");
    return deepFreeze({
      row_key: `asset.${assetClass}`,
      row_kind: "asset_class",
      asset_class: assetClass,
      scope_kind: index.scope_kind,
      scope_ref: index.scope_ref,
      asset_count: heads.length,
      revision_count: revisions.length,
      acceptance_evidence_count: heads.filter((row) =>
        row.acceptance_state === "acceptance_evidence_present").length,
      backup_evidence_count: heads.filter((row) =>
        row.backup_state === "evidence_present").length,
      restore_evidence_count: heads.filter((row) =>
        row.restore_state === "evidence_present").length,
      evidence_state: heads.length === 0 ? "no_evidence"
        : complete.length === heads.length ? "evidence_complete" : "partial",
      authority_boundary: {
        acceptance_granted: false,
        byte_authority_created: false,
      },
    });
  });
  return deepFreeze({
    status: "PROJECTED",
    schema: ASSET_CLASS_REVISION_LEDGER_SCHEMA,
    projection_kind: "asset_class_revision_evidence_overlay",
    scope_kind: index.scope_kind,
    scope_ref: index.scope_ref,
    rows,
  });
}
