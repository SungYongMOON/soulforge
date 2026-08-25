// Public-safe source inventory and direct-derivation boundary for E01. This module never fetches,
// stores, or emits source bodies. A catalog row is routing evidence only until a separately pinned
// direct record passes the narrow admission function below.
import types from 'node:util/types';
import { isDeepStrictEqual } from 'node:util';

import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { isWellFormedRef } from '../../../core/validators/identity.mjs';
import { QUALITY_READINESS_SOURCE_PACKET_REF } from '../rules/quality_readiness_rules.mjs';
import canonicalInventory from '../contracts/quality_readiness_public_source_inventory_candidate_v1.json' with { type: 'json' };
import canonicalMatrix from '../contracts/quality_readiness_source_family_matrix_candidate_v1.json' with { type: 'json' };

export const QUALITY_READINESS_SOURCE_CORPUS_SCHEMA = 'soulforge.quality_readiness.source_direct_corpus.v0';
export const QUALITY_READINESS_DIRECT_SOURCE_SCHEMA = 'soulforge.quality_readiness.direct_source_record.v0';
export const QUALITY_READINESS_SOURCE_CODES = Object.freeze({
  INVENTORY_INVALID: 'QUALITY_READINESS_SOURCE_INVENTORY_INVALID',
  CORPUS_INVALID: 'QUALITY_READINESS_SOURCE_CORPUS_INVALID',
  DIRECT_RECORD_INVALID: 'QUALITY_READINESS_DIRECT_RECORD_INVALID',
  PUBLIC_BOUNDARY: 'QUALITY_READINESS_SOURCE_PUBLIC_BOUNDARY',
});

const INVENTORY_KEYS = Object.freeze([
  'schema_version', 'status', 'source_count', 'claim_ceiling', 'source_authority_created',
  'generated_from', 'fields_excluded', 'sources',
]);
const INVENTORY_SOURCE_KEYS = Object.freeze([
  'source_id', 'title', 'publisher', 'official_url', 'status', 'source_file_count', 'extractor_statuses',
]);
const MATRIX_SOURCE_KEYS = Object.freeze([
  'source_id', 'family_id', 'disposition', 'disposition_reason', 'proof_subset_overlap',
  'body_access_state', 'extraction_review_state', 'common_engine_relevance',
  'candidate_quality_domains', 'research_batch', 'direct_body_confirmation_required', 'unresolved_or_hold',
]);
const DIRECT_INPUT_KEYS = Object.freeze([
  'source_id', 'authority_family', 'official_url', 'metadata_revision_ref', 'body_revision_ref',
  'status_receipt_ref', 'exact_locator', 'access_class', 'applicability_ceiling',
]);
const DIRECT_OUTPUT_KEYS = Object.freeze([
  'schema_version', 'source_id', 'authority_family', 'official_url', 'exact_locator',
  'metadata_revision_ref', 'body_revision_ref', 'status_receipt_ref', 'access_class',
  'direct_source_state', 'applicability_ceiling', 'claim_ceiling', 'source_adoption',
  'rule_acceptance', 'effects', 'record_sha256', 'direct_derivation_ref',
]);
const REF_KEYS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const SHA256_ID = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_body', 'source_text', 'source_bodies', 'chunks', 'local_paths',
  'private_path', 'absolute_path', 'payload', 'project_payload', 'secret', 'credential', 'password',
]);
const FORBIDDEN_TEXT = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
]);
const PROOF_SUBSET = Object.freeze({
  mil_std_1916_acceptance_product: 'S1-MIL-STD-1916',
  far_part_46_quality_assurance: 'S2-FAR-46',
  nasa_std_8739_6_workmanship_implementation: 'S3-NASA-STD-8739.6B',
});
const CONTROLLED_DEPENDENCY_TOKENS = new Set(['paid', 'controlled', 'internal', 'customer', 'lig']);

function fail(code, message) {
  throw new ContractError(code, message);
}

function exactKeys(value, keys, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object`);
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    fail(code, `${label} has an unexpected key set`);
  }
}

function copyPlain(value, label, depth = 0, ancestors = new Set()) {
  if (depth > 16) fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, `${label} exceeds the data depth limit`);
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
    if (typeof value === 'string' && FORBIDDEN_TEXT.some((pattern) => pattern.test(value))) {
      fail(QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY, `${label} contains a private-path or credential sentinel`);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || (types && types.isProxy(value))) {
    fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, `${label} must be plain data`);
  }
  if (ancestors.has(value)) fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, `${label} may not be circular`);
  ancestors.add(value);
  try {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) {
      fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, `${label} has an unsupported prototype`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const output = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value')
          || (key !== 'length' && descriptor.enumerable !== true)) {
        fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, `${label} may not contain accessors, symbols, or hidden fields`);
      }
      if (!array && FORBIDDEN_KEYS.has(key)) {
        fail(QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY, `${label}.${key} is outside the public source boundary`);
      }
    }
    if (array) {
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, `${label} may not be sparse`);
        output.push(copyPlain(descriptor.value, `${label}[${index}]`, depth + 1, ancestors));
      }
    } else {
      for (const [key, descriptor] of Object.entries(descriptors)) {
        output[key] = copyPlain(descriptor.value, `${label}.${key}`, depth + 1, ancestors);
      }
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function arrayOrderRules(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
  }
  return rules;
}

function digest(domain, value) {
  return sha256Hex(`${domain}\n${canonicalise(value, arrayOrderRules(value))}`);
}

function accessClass(row) {
  if (row.body_access_state === 'official_public_extracted_hwp_blocked') return 'official_public_hwp_blocked';
  if (row.body_access_state === 'metadata_api_record_only') return 'official_public_metadata_only';
  if (row.body_access_state === 'official_public_page_context') return 'official_public_metadata_only';
  return 'official_public_unreviewed';
}

function directState(row, inventorySource) {
  const holdTokens = new Set((String(row.unresolved_or_hold ?? '').toLowerCase().match(/[a-z0-9]+/gu) ?? []));
  if (row.disposition === 'excluded_overlay_or_vendor' || row.family_id === 'vendor_customer_overlay_context') {
    return 'excluded_nonofficial_overlay';
  }
  if (row.body_access_state === 'official_public_extracted_hwp_blocked') return 'hold_hwp_normalization';
  if (row.body_access_state === 'metadata_api_record_only') return 'hold_metadata_only';
  if ([...holdTokens].some((token) => CONTROLLED_DEPENDENCY_TOKENS.has(token))) {
    return 'hold_controlled_dependency';
  }
  if (inventorySource.extractor_statuses.includes('hwp_requires_hwpx_preprocessing')) return 'hold_hwp_normalization';
  return 'direct_confirmation_required';
}

function sourceRecord(inventorySource, matrixRow) {
  const proofSourceRef = PROOF_SUBSET[inventorySource.source_id] ?? null;
  const state = proofSourceRef === null ? directState(matrixRow, inventorySource) : 'proof_subset_packet_bound';
  const record = {
    source_id: inventorySource.source_id,
    title: inventorySource.title,
    publisher: inventorySource.publisher,
    official_url: inventorySource.official_url,
    authority_family: matrixRow.family_id,
    authority_class: state === 'excluded_nonofficial_overlay' ? 'excluded_nonofficial' : 'official_public_routing_only',
    inventory_status: inventorySource.status,
    access_class: accessClass(matrixRow),
    revision_state: proofSourceRef === null ? 'unresolved_at_binding_time' : 'source_packet_pinned',
    status_state: proofSourceRef === null ? 'requires_official_status_receipt' : 'source_packet_status_recorded',
    applicability_ceiling: 'unknown_hold',
    claim_ceiling: proofSourceRef === null ? 'observed' : 'source_supported',
    direct_source_state: state,
    derivation_disposition: matrixRow.disposition,
    body_confirmation_required: matrixRow.direct_body_confirmation_required,
  };
  if (proofSourceRef !== null) {
    record.proof_subset_source_ref = proofSourceRef;
    record.source_packet_ref = {
      entity_id: QUALITY_READINESS_SOURCE_PACKET_REF.entity_id,
      revision_id: QUALITY_READINESS_SOURCE_PACKET_REF.revision_id,
      content_id: QUALITY_READINESS_SOURCE_PACKET_REF.content_id,
      content_hash_alg: QUALITY_READINESS_SOURCE_PACKET_REF.content_hash_alg,
    };
  } else if (state.startsWith('hold_') || state === 'excluded_nonofficial_overlay') {
    record.hold_reason = matrixRow.unresolved_or_hold || matrixRow.disposition_reason;
  }
  record.record_sha256 = digest('soulforge.quality_readiness.source_direct_record.v0', record);
  return record;
}

function aggregateCorpusClaimCeiling(records) {
  const order = new Map([
    ['observed', 0],
    ['source_supported', 1],
  ]);
  let aggregate = 'source_supported';
  for (const record of records) {
    if (!order.has(record.claim_ceiling)) {
      fail(QUALITY_READINESS_SOURCE_CODES.CORPUS_INVALID, 'source corpus record has an unknown canon claim ceiling');
    }
    if (order.get(record.claim_ceiling) < order.get(aggregate)) aggregate = record.claim_ceiling;
  }
  return aggregate;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Builds a deterministic public-safe record for all 56 catalog rows. It deliberately leaves every
 * unconfirmed row at `observed`; only the existing three-source packet is carried as a limited
 * source-supported proof subset. The function performs no network or filesystem operation.
 */
export function buildQualityReadinessSourceDirectCorpus({ inventory, matrix }) {
  const copiedInventory = copyPlain(inventory, 'source inventory');
  const copiedMatrix = copyPlain(matrix, 'source family matrix');
  exactKeys(copiedInventory, INVENTORY_KEYS, 'source inventory', QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID);
  if (copiedInventory.schema_version !== 'soulforge.quality_readiness.public_source_inventory_candidate.v1'
      || copiedInventory.source_count !== 56 || copiedInventory.claim_ceiling !== 'observed'
      || copiedInventory.source_authority_created !== false || !Array.isArray(copiedInventory.sources)
      || copiedInventory.sources.length !== 56) {
    fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, 'source inventory must be the exact 56-row public candidate input');
  }
  if (!copiedMatrix || copiedMatrix.schema_version !== 'soulforge.quality_readiness.source_family_matrix_candidate.v1'
      || copiedMatrix.source_count !== 56 || !Array.isArray(copiedMatrix.sources)
      || copiedMatrix.sources.length !== 56) {
    fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, 'source family matrix must be the matching 56-row candidate input');
  }
  const matrixById = new Map();
  for (const row of copiedMatrix.sources) {
    exactKeys(row, MATRIX_SOURCE_KEYS, 'source family matrix row', QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID);
    if (typeof row.source_id !== 'string' || matrixById.has(row.source_id)) {
      fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, 'source family matrix IDs must be unique');
    }
    matrixById.set(row.source_id, row);
  }
  const records = [];
  const seen = new Set();
  for (const source of copiedInventory.sources) {
    exactKeys(source, INVENTORY_SOURCE_KEYS, 'source inventory row', QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID);
    if (typeof source.source_id !== 'string' || seen.has(source.source_id)
        || typeof source.official_url !== 'string' || !source.official_url.startsWith('https://')
        || !Array.isArray(source.extractor_statuses)) {
      fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, 'source inventory rows must have unique official HTTPS metadata');
    }
    seen.add(source.source_id);
    const matrixRow = matrixById.get(source.source_id);
    if (!matrixRow) fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, 'source inventory and matrix membership differ');
    records.push(sourceRecord(source, matrixRow));
  }
  if (matrixById.size !== seen.size) fail(QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID, 'source matrix has an unpaired row');
  records.sort((left, right) => compareCodePoints(left.source_id, right.source_id));
  const counts = {
    total: records.length,
    official_public_routing_only: records.filter((record) => record.authority_class === 'official_public_routing_only').length,
    excluded_nonofficial_overlay: records.filter((record) => record.direct_source_state === 'excluded_nonofficial_overlay').length,
    proof_subset_packet_bound: records.filter((record) => record.direct_source_state === 'proof_subset_packet_bound').length,
    direct_confirmation_required: records.filter((record) => record.direct_source_state === 'direct_confirmation_required').length,
    hold: records.filter((record) => record.direct_source_state.startsWith('hold_')).length,
  };
  const inventory_sha256 = digest('soulforge.quality_readiness.source_inventory.v1', copiedInventory);
  const matrix_sha256 = digest('soulforge.quality_readiness.source_family_matrix.v1', copiedMatrix);
  const corpus = {
    schema_version: QUALITY_READINESS_SOURCE_CORPUS_SCHEMA,
    status: 'candidate_source_direct_record_only',
    source_count: records.length,
    inventory_sha256,
    matrix_sha256,
    claim_ceiling: aggregateCorpusClaimCeiling(records),
    applicability_ceiling: 'unknown_hold',
    source_adoption: false,
    rule_acceptance: false,
    records,
    counts,
    effects: {
      filesystem_reads: 0,
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_calls: 0,
    },
  };
  corpus.derivation_sha256 = digest('soulforge.quality_readiness.source_direct_corpus.v0', corpus);
  return freezeDeep(corpus);
}

/**
 * Reconstructs the one admitted 56-row public corpus from package-owned public inventory and
 * matrix bytes, then accepts only byte-equivalent structured material. This closes shallow
 * receipt substitution at the MCP boundary without reading customer/project/runtime state.
 */
export function verifyQualityReadinessSourceDirectCorpus(corpus) {
  let copied;
  try {
    copied = copyPlain(corpus, 'source direct corpus');
  } catch (error) {
    if (error instanceof ContractError) {
      fail(QUALITY_READINESS_SOURCE_CODES.CORPUS_INVALID, 'source direct corpus is malformed or crosses the public boundary');
    }
    throw error;
  }
  const expected = buildQualityReadinessSourceDirectCorpus({
    inventory: canonicalInventory,
    matrix: canonicalMatrix,
  });
  if (!isDeepStrictEqual(copied, expected)) {
    fail(QUALITY_READINESS_SOURCE_CODES.CORPUS_INVALID,
      'source direct corpus does not exactly match the canonical 56-row inventory/matrix derivation');
  }
  return expected;
}

function assertExactRef(ref, field) {
  exactKeys(ref, REF_KEYS, field, QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID);
  if (!isWellFormedRef(ref) || !SHA256_ID.test(ref.content_id) || ref.content_hash_alg !== 'sha256') {
    fail(QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID, `${field} must be an exact sha256 ref`);
  }
}

/**
 * Admits one body-free direct-source record. It accepts no RAG result and no catalog row as a
 * substitute for the distinct status, metadata, body, and direct-derivation refs.
 */
export function admitQualityReadinessDirectSource(input) {
  const copied = copyPlain(input, 'direct source record');
  exactKeys(copied, DIRECT_INPUT_KEYS, 'direct source record', QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID);
  if (typeof copied.source_id !== 'string' || !TOKEN.test(copied.source_id)
      || typeof copied.authority_family !== 'string' || !TOKEN.test(copied.authority_family)
      || typeof copied.official_url !== 'string' || !copied.official_url.startsWith('https://')
      || typeof copied.exact_locator !== 'string' || copied.exact_locator.length === 0 || copied.exact_locator.length > 256
      || copied.applicability_ceiling !== 'unknown_hold') {
    fail(QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID, 'direct source record has invalid public-safe identity or applicability fields');
  }
  const official = copied.access_class === 'official_public';
  const synthetic = copied.access_class === 'public_synthetic';
  if (!official && !synthetic) {
    fail(QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID, 'direct source record must be official-public or explicitly public-synthetic');
  }
  for (const field of ['metadata_revision_ref', 'body_revision_ref', 'status_receipt_ref']) assertExactRef(copied[field], field);
  const refKeys = new Set();
  for (const field of ['metadata_revision_ref', 'body_revision_ref', 'status_receipt_ref']) {
    const key = REF_KEYS.map((name) => copied[field][name]).join('\u001f');
    if (refKeys.has(key)) fail(QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID, 'direct source refs must remain distinct');
    refKeys.add(key);
  }
  const record = {
    schema_version: QUALITY_READINESS_DIRECT_SOURCE_SCHEMA,
    source_id: copied.source_id,
    authority_family: copied.authority_family,
    official_url: copied.official_url,
    exact_locator: copied.exact_locator,
    metadata_revision_ref: copied.metadata_revision_ref,
    body_revision_ref: copied.body_revision_ref,
    status_receipt_ref: copied.status_receipt_ref,
    access_class: copied.access_class,
    direct_source_state: synthetic ? 'synthetic_direct_confirmed' : 'direct_confirmed',
    applicability_ceiling: 'unknown_hold',
    claim_ceiling: 'observed',
    source_adoption: false,
    rule_acceptance: false,
    effects: {
      filesystem_reads: 0,
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_calls: 0,
    },
  };
  record.record_sha256 = digest('soulforge.quality_readiness.direct_source_record.v0', record);
  record.direct_derivation_ref = {
    entity_id: 'quality-readiness-direct-source',
    revision_id: `record:${record.record_sha256.slice(0, 16)}`,
    content_id: `sha256:${record.record_sha256}`,
    content_hash_alg: 'sha256',
  };
  return freezeDeep(record);
}

export function verifyQualityReadinessDirectSourceRecord(record) {
  const copied = copyPlain(record, 'direct source record');
  exactKeys(copied, DIRECT_OUTPUT_KEYS, 'direct source record', QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID);
  const expected = admitQualityReadinessDirectSource({
    source_id: copied.source_id,
    authority_family: copied.authority_family,
    official_url: copied.official_url,
    metadata_revision_ref: copied.metadata_revision_ref,
    body_revision_ref: copied.body_revision_ref,
    status_receipt_ref: copied.status_receipt_ref,
    exact_locator: copied.exact_locator,
    access_class: copied.access_class,
    applicability_ceiling: copied.applicability_ceiling,
  });
  if (JSON.stringify(expected) !== JSON.stringify(copied)) {
    fail(QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID, 'direct source record digest or immutable boundary fields do not match');
  }
  return expected;
}
