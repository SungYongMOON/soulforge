// Deterministic RAG boundary for E01. It selects only source IDs and exact locators from a
// pre-pinned packet. Retrieval remains advisory navigation: it never returns a verdict, creates a
// rule, changes a Profile binding, or substitutes for direct-source admission.
import types from 'node:util/types';

import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { verifyQualityReadinessDirectSourceRecord } from '../source/quality_readiness_source_derivation.mjs';

export const QUALITY_READINESS_RAG_PACKET_SCHEMA = 'soulforge.quality_readiness.rag_packet.v0';
export const QUALITY_READINESS_RAG_RESULT_SCHEMA = 'soulforge.quality_readiness.rag_result.v0';
export const QUALITY_READINESS_RAG_CODES = Object.freeze({
  PACKET_REFUSED: 'QUALITY_READINESS_RAG_PACKET_REFUSED',
  PACKET_STALE: 'QUALITY_READINESS_RAG_PACKET_STALE',
  PACKET_FORGED: 'QUALITY_READINESS_RAG_PACKET_FORGED',
  PACKET_UNAUTHORIZED: 'QUALITY_READINESS_RAG_PACKET_UNAUTHORIZED',
  QUERY_INVALID: 'QUALITY_READINESS_RAG_QUERY_INVALID',
});

const PACKET_INPUT_KEYS = Object.freeze([
  'source_set_kind', 'corpus_derivation_sha256', 'direct_source_records', 'retrieval_records',
]);
const PACKET_KEYS = Object.freeze([...PACKET_INPUT_KEYS, 'schema_version', 'packet_sha256']);
const RETRIEVAL_KEYS = Object.freeze(['source_id', 'direct_record_sha256', 'locator', 'topic_tags']);
const QUERY_KEYS = Object.freeze(['query_id', 'topic_tags', 'source_packet_sha256']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_body', 'source_text', 'chunk', 'chunks', 'payload', 'project_payload',
  'prompt', 'completion', 'private_path', 'absolute_path', 'secret', 'credential', 'password',
]);
const FORBIDDEN_TEXT = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertExactKeys(value, keys, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object`);
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    fail(code, `${label} has an unexpected key set`);
  }
}

function copyPlain(value, label, code, depth = 0, ancestors = new Set()) {
  if (depth > 16) fail(code, `${label} exceeds the data depth limit`);
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
    if (typeof value === 'string' && FORBIDDEN_TEXT.some((pattern) => pattern.test(value))) {
      fail(QUALITY_READINESS_RAG_CODES.PACKET_UNAUTHORIZED, `${label} contains a private-path or credential sentinel`);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || (types && types.isProxy(value))) fail(code, `${label} must be plain data`);
  if (ancestors.has(value)) fail(code, `${label} may not be circular`);
  ancestors.add(value);
  try {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) {
      fail(code, `${label} has an unsupported prototype`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const output = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value')
          || (key !== 'length' && descriptor.enumerable !== true)) {
        fail(code, `${label} may not contain accessors, symbols, or hidden fields`);
      }
      if (!array && FORBIDDEN_KEYS.has(key)) {
        fail(QUALITY_READINESS_RAG_CODES.PACKET_UNAUTHORIZED, `${label}.${key} is outside the advisory retrieval boundary`);
      }
    }
    if (array) {
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) fail(code, `${label} may not be sparse`);
        output.push(copyPlain(descriptor.value, `${label}[${index}]`, code, depth + 1, ancestors));
      }
    } else {
      for (const [key, descriptor] of Object.entries(descriptors)) {
        output[key] = copyPlain(descriptor.value, `${label}.${key}`, code, depth + 1, ancestors);
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

function assertTopicTags(tags, label, code) {
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 24) fail(code, `${label} must be a bounded non-empty tag array`);
  let prior = null;
  for (const tag of tags) {
    if (typeof tag !== 'string' || !TOKEN.test(tag) || (prior !== null && compareCodePoints(prior, tag) >= 0)) {
      fail(code, `${label} must be sorted unique opaque tags`);
    }
    prior = tag;
  }
}

function validatePacket(packet) {
  const copied = copyPlain(packet, 'RAG packet', QUALITY_READINESS_RAG_CODES.PACKET_REFUSED);
  assertExactKeys(copied, PACKET_KEYS, 'RAG packet', QUALITY_READINESS_RAG_CODES.PACKET_REFUSED);
  if (copied.schema_version !== QUALITY_READINESS_RAG_PACKET_SCHEMA
      || !['public_corpus', 'public_synthetic'].includes(copied.source_set_kind)
      || typeof copied.corpus_derivation_sha256 !== 'string'
      || !Array.isArray(copied.direct_source_records)
      || !Array.isArray(copied.retrieval_records)
      || !SHA256_HEX.test(copied.packet_sha256)) {
    fail(QUALITY_READINESS_RAG_CODES.PACKET_REFUSED, 'RAG packet schema or pins are invalid');
  }
  if (copied.source_set_kind === 'public_corpus' && !SHA256_HEX.test(copied.corpus_derivation_sha256)) {
    fail(QUALITY_READINESS_RAG_CODES.PACKET_REFUSED, 'public-corpus RAG packet requires a pinned source-corpus digest');
  }
  if (copied.source_set_kind === 'public_synthetic' && copied.corpus_derivation_sha256 !== 'public_synthetic_no_corpus') {
    fail(QUALITY_READINESS_RAG_CODES.PACKET_REFUSED, 'public-synthetic RAG packet must not impersonate a real corpus pin');
  }
  const directById = new Map();
  for (const record of copied.direct_source_records) {
    let verified;
    try {
      verified = verifyQualityReadinessDirectSourceRecord(record);
    } catch {
      fail(QUALITY_READINESS_RAG_CODES.PACKET_FORGED, 'RAG packet contains an unpinned or forged direct-source record');
    }
    if (directById.has(verified.source_id)
        || (copied.source_set_kind === 'public_corpus' && verified.access_class !== 'official_public')
        || (copied.source_set_kind === 'public_synthetic' && verified.access_class !== 'public_synthetic')) {
      fail(QUALITY_READINESS_RAG_CODES.PACKET_UNAUTHORIZED, 'RAG packet has mixed, duplicated, or unauthorized direct-source classes');
    }
    directById.set(verified.source_id, verified);
  }
  if (directById.size === 0) fail(QUALITY_READINESS_RAG_CODES.PACKET_REFUSED, 'RAG packet requires at least one direct-source record');
  const retrieval = [];
  let priorKey = null;
  for (const row of copied.retrieval_records) {
    assertExactKeys(row, RETRIEVAL_KEYS, 'RAG retrieval record', QUALITY_READINESS_RAG_CODES.PACKET_REFUSED);
    if (typeof row.source_id !== 'string' || !TOKEN.test(row.source_id)
        || !SHA256_HEX.test(row.direct_record_sha256)
        || typeof row.locator !== 'string' || row.locator.length === 0 || row.locator.length > 256) {
      fail(QUALITY_READINESS_RAG_CODES.PACKET_REFUSED, 'RAG retrieval record is malformed');
    }
    assertTopicTags(row.topic_tags, 'RAG retrieval record topic_tags', QUALITY_READINESS_RAG_CODES.PACKET_REFUSED);
    const source = directById.get(row.source_id);
    if (!source || source.record_sha256 !== row.direct_record_sha256) {
      fail(QUALITY_READINESS_RAG_CODES.PACKET_FORGED, 'RAG retrieval record is not tied to its exact direct-source record');
    }
    const key = `${row.source_id}\u001f${row.locator}`;
    if (priorKey !== null && compareCodePoints(priorKey, key) >= 0) {
      fail(QUALITY_READINESS_RAG_CODES.PACKET_REFUSED, 'RAG retrieval records must be sorted uniquely by source and locator');
    }
    priorKey = key;
    retrieval.push(row);
  }
  const material = {
    source_set_kind: copied.source_set_kind,
    corpus_derivation_sha256: copied.corpus_derivation_sha256,
    direct_source_records: copied.direct_source_records,
    retrieval_records: copied.retrieval_records,
  };
  const expectedPacket = digest('soulforge.quality_readiness.rag_packet.v0', material);
  if (expectedPacket !== copied.packet_sha256) {
    fail(QUALITY_READINESS_RAG_CODES.PACKET_FORGED, 'RAG packet digest does not match its exact source and locator material');
  }
  return { packet: copied, directById, retrieval };
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function createQualityReadinessRagPacket(input) {
  const copied = copyPlain(input, 'RAG packet input', QUALITY_READINESS_RAG_CODES.PACKET_REFUSED);
  assertExactKeys(copied, PACKET_INPUT_KEYS, 'RAG packet input', QUALITY_READINESS_RAG_CODES.PACKET_REFUSED);
  const packet = {
    schema_version: QUALITY_READINESS_RAG_PACKET_SCHEMA,
    source_set_kind: copied.source_set_kind,
    corpus_derivation_sha256: copied.corpus_derivation_sha256,
    direct_source_records: copied.direct_source_records,
    retrieval_records: copied.retrieval_records,
  };
  packet.packet_sha256 = digest('soulforge.quality_readiness.rag_packet.v0', {
    source_set_kind: packet.source_set_kind,
    corpus_derivation_sha256: packet.corpus_derivation_sha256,
    direct_source_records: packet.direct_source_records,
    retrieval_records: packet.retrieval_records,
  });
  validatePacket(packet);
  return freezeDeep(packet);
}

/** Returns locator candidates only. `verdict_authority: false` is structural, not advisory text. */
export function retrieveQualityReadinessAdvisoryEvidence({ packet, query }) {
  const validated = validatePacket(packet);
  const copiedQuery = copyPlain(query, 'RAG query', QUALITY_READINESS_RAG_CODES.QUERY_INVALID);
  assertExactKeys(copiedQuery, QUERY_KEYS, 'RAG query', QUALITY_READINESS_RAG_CODES.QUERY_INVALID);
  if (typeof copiedQuery.query_id !== 'string' || !TOKEN.test(copiedQuery.query_id)
      || copiedQuery.source_packet_sha256 !== validated.packet.packet_sha256) {
    fail(copiedQuery.source_packet_sha256 === validated.packet.packet_sha256
      ? QUALITY_READINESS_RAG_CODES.QUERY_INVALID : QUALITY_READINESS_RAG_CODES.PACKET_STALE,
    'RAG query must pin the exact current source packet');
  }
  assertTopicTags(copiedQuery.topic_tags, 'RAG query topic_tags', QUALITY_READINESS_RAG_CODES.QUERY_INVALID);
  const queryTags = new Set(copiedQuery.topic_tags);
  const candidate_locators = validated.retrieval
    .filter((row) => row.topic_tags.some((tag) => queryTags.has(tag)))
    .map((row) => {
      const source = validated.directById.get(row.source_id);
      return {
        source_id: source.source_id,
        direct_record_sha256: source.record_sha256,
        exact_locator: row.locator,
        claim_ceiling: source.claim_ceiling,
        confirmation_required_before_rule_or_verdict: true,
      };
    });
  const status = candidate_locators.length === 0 ? 'hold_no_admissible_locator' : 'advisory_locator_candidates';
  const result = {
    schema_version: QUALITY_READINESS_RAG_RESULT_SCHEMA,
    status,
    verdict_authority: false,
    rule_authority: false,
    source_packet_sha256: validated.packet.packet_sha256,
    query_id: copiedQuery.query_id,
    candidate_locators,
    receipt: {
      input_sha256: digest('soulforge.quality_readiness.rag_query.v0', copiedQuery),
      output_sha256: '',
      effects: {
        filesystem_reads: 0,
        filesystem_writes: 0,
        network_calls: 0,
        model_calls: 0,
        rag_calls: 0,
      },
    },
  };
  result.receipt.output_sha256 = digest('soulforge.quality_readiness.rag_result.v0', {
    schema_version: result.schema_version,
    status: result.status,
    verdict_authority: result.verdict_authority,
    rule_authority: result.rule_authority,
    source_packet_sha256: result.source_packet_sha256,
    query_id: result.query_id,
    candidate_locators: result.candidate_locators,
    receipt: {
      input_sha256: result.receipt.input_sha256,
      effects: result.receipt.effects,
    },
  });
  return freezeDeep(result);
}
