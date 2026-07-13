import { createHash } from "node:crypto";

export const IDENTITY_GENERATION_PROFILE_ID =
  "soulforge.identity_basis.cjson_nfc_utf8.v1";

const SHA256_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ASCII_OBJECT_KEY_PATTERN = /^[\x20-\x7e]+$/u;
const ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/u;
const RFC3339_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/u;

const ID_PREFIX_BY_KIND = Object.freeze({
  source: "src_",
  source_revision: "sr_",
  extraction_run: "exr_",
  evidence_locator: "loc_",
  rag_index: "ridx_",
  rag_chunk: "rch_",
});

function fail(message, code = "INVALID_IDENTITY_BASIS") {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must be a plain object`);
  }
  return value;
}

function assertKnownFields(value, allowedFields, requiredFields, label) {
  assertPlainObject(value, label);
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail(`${label} has unknown field(s): ${unknown.sort().join(", ")}`);
  }
  const missing = requiredFields.filter(
    (key) => !Object.hasOwn(value, key) || value[key] === undefined,
  );
  if (missing.length > 0) {
    fail(`${label} is missing required field(s): ${missing.join(", ")}`);
  }
}

function normalizeCanonicalValue(value, stack = new WeakSet(), label = "value") {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.normalize("NFC");
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      fail(`${label} must be a safe integer; floats and non-finite numbers are forbidden`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object" || value === undefined) {
    fail(`${label} contains an unsupported canonical JSON value`);
  }
  if (stack.has(value)) {
    fail(`${label} contains a cycle`);
  }
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        normalizeCanonicalValue(entry, stack, `${label}[${index}]`),
      );
    }
    assertPlainObject(value, label);
    const keys = Object.keys(value);
    for (const key of keys) {
      if (!ASCII_OBJECT_KEY_PATTERN.test(key)) {
        fail(`${label} object keys must be printable ASCII`);
      }
      if (value[key] === undefined) {
        fail(`${label}.${key} must not be undefined`);
      }
    }
    const result = {};
    for (const key of keys.sort()) {
      result[key] = normalizeCanonicalValue(value[key], stack, `${label}.${key}`);
    }
    return result;
  } finally {
    stack.delete(value);
  }
}

export function canonicalizeIdentityValue(value) {
  return normalizeCanonicalValue(value);
}

export function serializeCanonicalIdentity(value) {
  return JSON.stringify(normalizeCanonicalValue(value));
}

export function canonicalIdentityBytes(value) {
  return Buffer.from(serializeCanonicalIdentity(value), "utf8");
}

export function normalizeSemanticSet(values) {
  if (!Array.isArray(values)) {
    fail("semantic set must be an array");
  }
  const byCanonicalBytes = new Map();
  for (const value of values) {
    const normalized = normalizeCanonicalValue(value);
    const canonical = JSON.stringify(normalized);
    if (!byCanonicalBytes.has(canonical)) {
      byCanonicalBytes.set(canonical, normalized);
    }
  }
  return [...byCanonicalBytes.entries()]
    .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map(([, normalized]) => normalized);
}

function normalizeOpaqueId(value, label) {
  if (typeof value !== "string") {
    fail(`${label} must be a string`);
  }
  const normalized = value.normalize("NFC");
  if (
    normalized.length === 0 ||
    normalized !== normalized.trim() ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    fail(`${label} must be a non-empty opaque ID without surrounding whitespace or control characters`);
  }
  return normalized;
}

function normalizeKind(value, label) {
  const normalized = normalizeOpaqueId(value, label);
  if (!ENTITY_TYPE_PATTERN.test(normalized)) {
    fail(`${label} must match ${ENTITY_TYPE_PATTERN}`);
  }
  return normalized;
}

function normalizeSha256Id(value, label) {
  const normalized = normalizeOpaqueId(value, label);
  if (!SHA256_ID_PATTERN.test(normalized)) {
    fail(`${label} must be sha256:<64 lowercase hex>`);
  }
  return normalized;
}

export function validateTypedRef(value) {
  assertKnownFields(
    value,
    ["entity_type", "owner_surface", "entity_id"],
    ["entity_type", "owner_surface", "entity_id"],
    "typed ref",
  );
  return {
    entity_id: normalizeOpaqueId(value.entity_id, "typed ref.entity_id"),
    entity_type: normalizeKind(value.entity_type, "typed ref.entity_type"),
    owner_surface: normalizeOpaqueId(value.owner_surface, "typed ref.owner_surface"),
  };
}

function normalizeTypedRefSet(values, label) {
  if (!Array.isArray(values)) {
    fail(`${label} must be an array`);
  }
  return normalizeSemanticSet(values.map((value) => validateTypedRef(value)));
}

export function normalizeIdentityTimestamp(value) {
  if (typeof value !== "string") {
    fail("identity timestamp must be a string");
  }
  const match = RFC3339_UTC_PATTERN.exec(value);
  if (!match) {
    fail("identity timestamp must be strict UTC RFC3339 with uppercase Z");
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = ""] =
    match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number);
  if (year === 0 || hour > 23 || minute > 59 || second > 59) {
    fail("identity timestamp contains an out-of-range date or time component");
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    fail("identity timestamp contains an invalid calendar date");
  }
  const canonicalFraction = fraction.replace(/0+$/u, "");
  return `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}${
    canonicalFraction ? `.${canonicalFraction}` : ""
  }Z`;
}

function normalizeOptionalTimestamp(value, label) {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    return normalizeIdentityTimestamp(value);
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}

export function normalizeRepoRelativePath(value) {
  if (typeof value !== "string") {
    fail("repo-relative path must be a string");
  }
  const normalized = value.normalize("NFC").replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/u.test(normalized)
  ) {
    fail("repo-relative path must not be empty, absolute, UNC, or drive-qualified");
  }
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        /[\u0000-\u001f\u007f]/u.test(segment),
    )
  ) {
    fail("repo-relative path must not contain empty, dot, dot-dot, or control-character segments");
  }
  return segments.join("/");
}

export function hashRawContentBytes(value) {
  if (!(value instanceof Uint8Array)) {
    fail("raw content hash input must be Uint8Array bytes, not text");
  }
  const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digestCanonical(canonical) {
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function buildGeneratedIdentity(idKind, fields) {
  const identityBasis = normalizeCanonicalValue({
    id_generation_profile_id: IDENTITY_GENERATION_PROFILE_ID,
    id_kind: idKind,
    ...fields,
  });
  const identityCanonical = JSON.stringify(identityBasis);
  const identityDigest = digestCanonical(identityCanonical);
  const prefix = ID_PREFIX_BY_KIND[idKind];
  if (!prefix) {
    fail(`unsupported generated identity kind: ${idKind}`);
  }
  return {
    id: `${prefix}${identityDigest.slice("sha256:".length, "sha256:".length + 32)}`,
    id_generation_profile_id: IDENTITY_GENERATION_PROFILE_ID,
    id_kind: idKind,
    identity_basis: identityBasis,
    identity_canonical: identityCanonical,
    identity_digest: identityDigest,
  };
}

export function buildSourceIdentity(input) {
  assertKnownFields(
    input,
    ["owner_ref", "source_kind", "source_key", "issuer_namespace"],
    ["owner_ref", "source_kind", "source_key"],
    "source identity input",
  );
  return buildGeneratedIdentity("source", {
    issuer_namespace:
      input.issuer_namespace === undefined || input.issuer_namespace === null
        ? null
        : normalizeOpaqueId(input.issuer_namespace, "issuer_namespace"),
    owner_ref: validateTypedRef(input.owner_ref),
    source_key: normalizeOpaqueId(input.source_key, "source_key"),
    source_kind: normalizeKind(input.source_kind, "source_kind"),
  });
}

export function buildSourceRevisionIdentity(input) {
  assertKnownFields(
    input,
    [
      "source_id",
      "occurrence_key",
      "content_id",
      "canonicalization_profile_id",
      "published_at",
      "effective_from",
      "effective_to",
      "applicability_refs",
    ],
    ["source_id", "occurrence_key", "content_id", "canonicalization_profile_id"],
    "source revision identity input",
  );
  const effectiveFrom = normalizeOptionalTimestamp(input.effective_from, "effective_from");
  const effectiveTo = normalizeOptionalTimestamp(input.effective_to, "effective_to");
  if (
    effectiveFrom !== null
    && effectiveTo !== null
    && Date.parse(effectiveFrom) > Date.parse(effectiveTo)
  ) {
    fail("effective_from must not be later than effective_to");
  }
  return buildGeneratedIdentity("source_revision", {
    applicability_refs: normalizeTypedRefSet(
      input.applicability_refs ?? [],
      "applicability_refs",
    ),
    canonicalization_profile_id: normalizeOpaqueId(
      input.canonicalization_profile_id,
      "canonicalization_profile_id",
    ),
    content_id: normalizeSha256Id(input.content_id, "content_id"),
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    occurrence_key: normalizeOpaqueId(input.occurrence_key, "occurrence_key"),
    published_at: normalizeOptionalTimestamp(input.published_at, "published_at"),
    source_id: normalizeOpaqueId(input.source_id, "source_id"),
  });
}

export function buildExtractionRunIdentity(input) {
  assertKnownFields(
    input,
    ["source_revision_id", "extractor_profile_id", "run_key", "started_at", "input_refs"],
    ["source_revision_id", "extractor_profile_id", "run_key", "started_at"],
    "extraction run identity input",
  );
  return buildGeneratedIdentity("extraction_run", {
    extractor_profile_id: normalizeOpaqueId(
      input.extractor_profile_id,
      "extractor_profile_id",
    ),
    input_refs: normalizeTypedRefSet(input.input_refs ?? [], "input_refs"),
    run_key: normalizeOpaqueId(input.run_key, "run_key"),
    source_revision_id: normalizeOpaqueId(input.source_revision_id, "source_revision_id"),
    started_at: normalizeIdentityTimestamp(input.started_at),
  });
}

export function buildEvidenceLocatorIdentity(input) {
  assertKnownFields(
    input,
    ["source_revision_id", "locator_kind", "locator", "coordinate_profile_id"],
    ["source_revision_id", "locator_kind", "locator"],
    "evidence locator identity input",
  );
  return buildGeneratedIdentity("evidence_locator", {
    coordinate_profile_id:
      input.coordinate_profile_id === undefined || input.coordinate_profile_id === null
        ? null
        : normalizeOpaqueId(input.coordinate_profile_id, "coordinate_profile_id"),
    locator: normalizeCanonicalValue(input.locator),
    locator_kind: normalizeKind(input.locator_kind, "locator_kind"),
    source_revision_id: normalizeOpaqueId(input.source_revision_id, "source_revision_id"),
  });
}

export function buildRagIndexIdentity(input) {
  assertKnownFields(
    input,
    [
      "scope_ref",
      "source_revision_ids",
      "parser_profile_id",
      "chunk_profile_id",
      "acl_profile_id",
      "embedding_profile_id",
    ],
    [
      "scope_ref",
      "source_revision_ids",
      "parser_profile_id",
      "chunk_profile_id",
      "acl_profile_id",
    ],
    "RAG index identity input",
  );
  if (!Array.isArray(input.source_revision_ids)) {
    fail("source_revision_ids must be an array");
  }
  return buildGeneratedIdentity("rag_index", {
    acl_profile_id: normalizeOpaqueId(input.acl_profile_id, "acl_profile_id"),
    chunk_profile_id: normalizeOpaqueId(input.chunk_profile_id, "chunk_profile_id"),
    embedding_profile_id:
      input.embedding_profile_id === undefined || input.embedding_profile_id === null
        ? null
        : normalizeOpaqueId(input.embedding_profile_id, "embedding_profile_id"),
    parser_profile_id: normalizeOpaqueId(input.parser_profile_id, "parser_profile_id"),
    scope_ref: validateTypedRef(input.scope_ref),
    source_revision_ids: normalizeSemanticSet(
      input.source_revision_ids.map((value) =>
        normalizeOpaqueId(value, "source_revision_ids[]"),
      ),
    ),
  });
}

export function buildRagChunkIdentity(input) {
  assertKnownFields(
    input,
    [
      "source_revision_id",
      "chunk_profile_id",
      "evidence_locator_id",
      "chunk_content_id",
      "context_refs",
    ],
    [
      "source_revision_id",
      "chunk_profile_id",
      "evidence_locator_id",
      "chunk_content_id",
    ],
    "RAG chunk identity input",
  );
  return buildGeneratedIdentity("rag_chunk", {
    chunk_content_id: normalizeSha256Id(input.chunk_content_id, "chunk_content_id"),
    chunk_profile_id: normalizeOpaqueId(input.chunk_profile_id, "chunk_profile_id"),
    context_refs: normalizeTypedRefSet(input.context_refs ?? [], "context_refs"),
    evidence_locator_id: normalizeOpaqueId(
      input.evidence_locator_id,
      "evidence_locator_id",
    ),
    source_revision_id: normalizeOpaqueId(input.source_revision_id, "source_revision_id"),
  });
}

function validateIdentityArtifact(value, label) {
  assertPlainObject(value, label);
  const id = normalizeOpaqueId(value.id, `${label}.id`);
  const identityDigest = normalizeSha256Id(
    value.identity_digest,
    `${label}.identity_digest`,
  );
  if (typeof value.identity_canonical !== "string") {
    fail(`${label}.identity_canonical must be a string`);
  }
  const canonicalFromBasis = serializeCanonicalIdentity(value.identity_basis);
  if (canonicalFromBasis !== value.identity_canonical) {
    fail(`${label} canonical text does not match its full identity_basis`);
  }
  const computedDigest = digestCanonical(value.identity_canonical);
  if (computedDigest !== identityDigest) {
    fail(`${label} digest does not match its full canonical basis`);
  }
  return { id, identityCanonical: value.identity_canonical, identityDigest };
}

export function verifyIdentityCollision(existing, candidate, options = {}) {
  assertKnownFields(options, ["scope_ref"], [], "collision options");
  const scopeRef =
    options.scope_ref === undefined || options.scope_ref === null
      ? null
      : validateTypedRef(options.scope_ref);
  const left = validateIdentityArtifact(existing, "existing identity");
  const right = validateIdentityArtifact(candidate, "candidate identity");
  const scopeCanonical = serializeCanonicalIdentity(scopeRef);
  if (left.id !== right.id) {
    return { decision: "distinct", scope_canonical: scopeCanonical };
  }
  if (
    left.identityDigest === right.identityDigest &&
    left.identityCanonical === right.identityCanonical
  ) {
    return {
      decision: "idempotent_noop",
      identity_digest: right.identityDigest,
      scope_canonical: scopeCanonical,
      scoped_id: right.id,
    };
  }
  const error = new Error(
    `identity collision in ${scopeCanonical}: ${right.id} has a different full basis`,
  );
  error.code = "IDENTITY_COLLISION";
  throw error;
}

export function preserveOwnerIssuedIdentity(input) {
  assertKnownFields(input, ["owner_ref", "aliases"], ["owner_ref"], "owner-issued identity");
  const ownerRef = validateTypedRef(input.owner_ref);
  const ownerCanonical = serializeCanonicalIdentity(ownerRef);
  const aliases = normalizeTypedRefSet(input.aliases ?? [], "aliases").filter(
    (alias) => serializeCanonicalIdentity(alias) !== ownerCanonical,
  );
  if (aliases.some((alias) => alias.entity_type !== ownerRef.entity_type)) {
    fail("owner-issued aliases must keep the primary entity_type");
  }
  return {
    aliases,
    id: ownerRef.entity_id,
    owner_issued: true,
    typed_ref: ownerRef,
  };
}
