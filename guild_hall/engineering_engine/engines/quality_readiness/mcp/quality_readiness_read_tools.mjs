// Local read-only MCP-shaped dispatch surface. It is deliberately not registered with a global
// server or runtime: all tools consume supplied public-synthetic/domain outputs and return no
// writer capability, filesystem access, network call, or authority transition.
import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';
import { verifyQualityReadinessSourceDirectCorpus } from '../source/quality_readiness_source_derivation.mjs';

export const QUALITY_READINESS_MCP_SCHEMA = 'soulforge.quality_readiness.mcp.read_only.v0';
export const QUALITY_READINESS_MCP_CODES = Object.freeze({
  REQUEST_INVALID: 'QUALITY_READINESS_MCP_REQUEST_INVALID',
  TOOL_NOT_FOUND: 'QUALITY_READINESS_MCP_TOOL_NOT_FOUND',
  WRITE_REFUSED: 'QUALITY_READINESS_MCP_WRITE_REFUSED',
});

const TOOLS = Object.freeze([
  Object.freeze({
    name: 'engine_status',
    title: 'Quality Readiness engine status',
    description: 'Reports the local candidate boundary and its no-write posture.',
    write: false,
    data_class: 'public_rules',
  }),
  Object.freeze({
    name: 'source_status',
    title: 'Source-derivation status',
    description: 'Reports corpus counts and claim ceilings without source bodies or rule adoption.',
    write: false,
    data_class: 'public_rules',
  }),
  Object.freeze({
    name: 'rag_status',
    title: 'Advisory retrieval status',
    description: 'Reports locator-candidate status while retaining zero verdict authority.',
    write: false,
    data_class: 'public_rules',
  }),
  Object.freeze({
    name: 'observe_status',
    title: 'Observation status',
    description: 'Reports the supplied Typed Facts observation projection without scanning files.',
    write: false,
    data_class: 'team_judgment',
  }),
  Object.freeze({
    name: 'guidance_next_steps',
    title: 'Owner-review next steps',
    description: 'Returns bounded guidance cards without product disposition or acceptance authority.',
    write: false,
    data_class: 'team_judgment',
  }),
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertPlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (types && types.isProxy(value))) {
    fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, `${label} must be a plain object`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, `${label} must not use an inherited or custom prototype`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, `${label} may not carry accessors, symbols, or hidden fields`);
    }
  }
}

function exactKeys(value, keys, label) {
  assertPlainRecord(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, `${label} has an unexpected key set`);
  }
}

function assertReadOnlyInput(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || (types && types.isProxy(input))) {
    fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, `${label} must be a non-null plain object`);
  }
  for (const forbidden of ['write', 'mutation', 'writer']) {
    if (forbidden in input) {
      fail(QUALITY_READINESS_MCP_CODES.WRITE_REFUSED, 'Quality Readiness local MCP tools are read-only');
    }
  }
  assertPlainRecord(input, label);
}

function effects() {
  return {
    filesystem_reads: 0,
    filesystem_writes: 0,
    network_calls: 0,
    model_calls: 0,
    rag_calls: 0,
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function listQualityReadinessReadTools() {
  return freezeDeep(TOOLS.map((tool) => ({ ...tool })));
}

export function callQualityReadinessReadTool(request) {
  assertPlainRecord(request, 'tool call');
  const keys = Object.keys(request).sort();
  if (!keys.includes('name') || keys.length > 2 || keys.some((key) => !['name', 'input'].includes(key))) {
    fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, 'tool call must provide a name and optional input only');
  }
  const { name } = request;
  const input = Object.hasOwn(request, 'input') ? request.input : {};
  if (typeof name !== 'string' || !TOOLS.some((tool) => tool.name === name)) {
    fail(QUALITY_READINESS_MCP_CODES.TOOL_NOT_FOUND, 'requested Quality Readiness tool is not available');
  }
  assertReadOnlyInput(input, `${name} input`);
  if (name === 'engine_status') {
    exactKeys(input, [], 'engine_status input');
    return freezeDeep({
      schema_version: QUALITY_READINESS_MCP_SCHEMA,
      tool: name,
      status: 'local_read_only_candidate',
      execution_mode: 'deterministic_only',
      global_registration: false,
      writer_enabled: false,
      effects: effects(),
    });
  }
  if (name === 'source_status') {
    exactKeys(input, ['source_corpus'], 'source_status input');
    let corpus;
    try {
      corpus = verifyQualityReadinessSourceDirectCorpus(input.source_corpus);
    } catch {
      fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, 'source_status requires the exact canonical 56-row source-direct corpus receipt');
    }
    return freezeDeep({
      schema_version: QUALITY_READINESS_MCP_SCHEMA,
      tool: name,
      source_count: corpus.source_count,
      counts: { ...corpus.counts },
      claim_ceiling: corpus.claim_ceiling,
      applicability_ceiling: corpus.applicability_ceiling,
      source_adoption: false,
      rule_acceptance: false,
      derivation_sha256: corpus.derivation_sha256,
      effects: effects(),
    });
  }
  if (name === 'rag_status') {
    exactKeys(input, ['rag_result'], 'rag_status input');
    const result = input.rag_result;
    if (!result || result.schema_version !== 'soulforge.quality_readiness.rag_result.v0'
        || result.verdict_authority !== false || result.rule_authority !== false
        || !Array.isArray(result.candidate_locators)) {
      fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, 'rag_status requires an advisory-only RAG result');
    }
    return freezeDeep({
      schema_version: QUALITY_READINESS_MCP_SCHEMA,
      tool: name,
      status: result.status,
      candidate_locator_count: result.candidate_locators.length,
      verdict_authority: false,
      rule_authority: false,
      source_packet_sha256: result.source_packet_sha256,
      effects: effects(),
    });
  }
  if (name === 'observe_status') {
    exactKeys(input, ['observation_projection'], 'observe_status input');
    const observation = input.observation_projection;
    if (!observation || observation.schema_version !== 'soulforge.quality_readiness.observation_projection.v0'
        || !observation.counts || !observation.receipt) {
      fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, 'observe_status requires a domain observation projection');
    }
    return freezeDeep({
      schema_version: QUALITY_READINESS_MCP_SCHEMA,
      tool: name,
      known_at: observation.known_at,
      counts: { ...observation.counts },
      observations_sha256: observation.receipt.observations_sha256,
      effects: effects(),
    });
  }
  exactKeys(input, ['guidance'], 'guidance_next_steps input');
  const guidance = input.guidance;
  if (!guidance || guidance.schema_version !== 'soulforge.quality_readiness.guidance.v0'
      || guidance.verdict_authority !== false || !Array.isArray(guidance.cards)) {
    fail(QUALITY_READINESS_MCP_CODES.REQUEST_INVALID, 'guidance_next_steps requires owner-review-only guidance');
  }
  return freezeDeep({
    schema_version: QUALITY_READINESS_MCP_SCHEMA,
    tool: name,
    cards: guidance.cards.map((card) => ({ ...card })),
    verdict_authority: false,
    effects: effects(),
  });
}

export function handleQualityReadinessMcpRequest(request) {
  exactKeys(request, ['method', 'params'], 'MCP request');
  if (request.method === 'tools/list') {
    exactKeys(request.params, [], 'tools/list params');
    return freezeDeep({ schema_version: QUALITY_READINESS_MCP_SCHEMA, tools: listQualityReadinessReadTools() });
  }
  if (request.method === 'tools/call') {
    exactKeys(request.params, ['name', 'arguments'], 'tools/call params');
    return callQualityReadinessReadTool({ name: request.params.name, input: request.params.arguments });
  }
  fail(QUALITY_READINESS_MCP_CODES.TOOL_NOT_FOUND, 'only local tools/list and tools/call are supported');
}
