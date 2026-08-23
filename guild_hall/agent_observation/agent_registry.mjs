/**
 * Seam A - the Agent Registry.
 *
 * This seam owns durable agent identity: what an agent is, which project it is bound to, which
 * provider-side identities are the same agent, and the fact that an agent's memory is never an
 * authority. Nothing else in this owner may decide those questions, and this seam decides nothing
 * about runs, usage or receipts.
 *
 * The crosswalk is the reason identity is a seam of its own. Two provider identities that resolve
 * to the same agent must resolve to the same agent everywhere, so the provider/id_kind/id_value
 * binding is held once, next to the registration that creates it.
 */

import {
  COMPOSITE_SEPARATOR,
  guardEntry,
  hold,
  isPlainObject,
  isSafeId,
  isSafeIdList,
  isUtcMs,
  unknownKeyIn,
} from './guard_primitives.mjs';

import {
  ENTRY_CODES,
  MAX_LIST,
  OBSERVATION_HOLD_CODES,
  append,
  recordsOf,
  stateOf,
} from './observation_internals.mjs';

const H = OBSERVATION_HOLD_CODES;

export const AGENT_RECORD_SCHEMA = 'soulforge.agent_observation.agent_record.v1';

export const AGENT_KINDS = Object.freeze(['project_isolated_functional', 'shared_capability', 'tool_specialist_craftsman', 'resource_controller']);
export const FUNCTIONAL_ROLES = Object.freeze(['hardware', 'software', 'systems_engineering', 'quality', 'document', 'spreadsheet']);

const AGENT_FIELDS = Object.freeze(['agent_id', 'agent_kind', 'functional_role', 'project_id', 'provider_identities', 'authority_scope', 'memory_class', 'registered_at']);
const AUTHORITY_SCOPE_FIELDS = Object.freeze(['allowed_projects', 'allowed_actions']);
const PROVIDER_IDENTITY_FIELDS = Object.freeze(['provider', 'id_kind', 'id_value']);

/** The keys an agent record may carry, top level and below it. */
export const AGENT_RECORD_KEYS = Object.freeze(['schema_version', ...AGENT_FIELDS]);
export const AGENT_NESTED_KEYS = Object.freeze([...PROVIDER_IDENTITY_FIELDS, ...AUTHORITY_SCOPE_FIELDS]);

export function registerAgent(store, rawInput) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guarded = guardEntry(rawInput, AGENT_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const input = guarded.value;

  if (!isSafeId(input.agent_id)) return hold(H.INVALID_FIELD_VALUE, 'agent_id');
  if (input.project_id === null || input.project_id === undefined || input.project_id === '') return hold(H.UNKNOWN_PROJECT);
  if (!isSafeId(input.project_id)) return hold(H.INVALID_FIELD_VALUE, 'project_id');
  if (input.memory_class !== 'cache_only') return hold(H.AGENT_MEMORY_NOT_AUTHORITY_REQUIRED);
  if (!AGENT_KINDS.includes(input.agent_kind)) return hold(H.INVALID_FIELD_VALUE, 'agent_kind');
  if (!FUNCTIONAL_ROLES.includes(input.functional_role)) return hold(H.INVALID_FIELD_VALUE, 'functional_role');
  if (!isUtcMs(input.registered_at)) return hold(H.INVALID_FIELD_VALUE, 'registered_at');

  const scope = input.authority_scope;
  if (!isPlainObject(scope)) return hold(H.INVALID_FIELD_VALUE, 'authority_scope');
  const scopeExtra = unknownKeyIn(scope, AUTHORITY_SCOPE_FIELDS);
  if (scopeExtra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, scopeExtra);
  for (const key of AUTHORITY_SCOPE_FIELDS) {
    if (!isSafeIdList(scope[key], MAX_LIST)) return hold(H.INVALID_FIELD_VALUE, key);
  }
  if (!scope.allowed_projects.includes(input.project_id)) return hold(H.PROJECT_BINDING_MISMATCH, 'authority_scope');

  const identities = input.provider_identities;
  if (!Array.isArray(identities) || identities.length === 0 || identities.length > MAX_LIST) return hold(H.INVALID_FIELD_VALUE, 'provider_identities');
  const slots = new Set();
  for (const identity of identities) {
    if (!isPlainObject(identity)) return hold(H.INVALID_FIELD_VALUE, 'provider_identity');
    const extra = unknownKeyIn(identity, PROVIDER_IDENTITY_FIELDS);
    if (extra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, extra);
    if (!isSafeId(identity.provider) || !isSafeId(identity.id_kind) || !isSafeId(identity.id_value)) return hold(H.INVALID_FIELD_VALUE, 'provider_identity');
    const slot = `${identity.provider}${COMPOSITE_SEPARATOR}${identity.id_kind}`;
    if (slots.has(slot)) return hold(H.PROVIDER_IDENTITY_SLOT_CONFLICT, 'duplicate_provider_id_kind');
    slots.add(slot);
  }
  const crosswalkKeys = identities.map((identity) => [identity.provider, identity.id_kind, identity.id_value].join(COMPOSITE_SEPARATOR));
  for (const key of crosswalkKeys) {
    const boundAgent = state.providerCrosswalk.get(key);
    if (boundAgent !== undefined && boundAgent !== input.agent_id) return hold(H.PROVIDER_IDENTITY_CROSSWALK_CONFLICT);
  }

  const record = {
    schema_version: AGENT_RECORD_SCHEMA,
    agent_id: input.agent_id,
    agent_kind: input.agent_kind,
    functional_role: input.functional_role,
    project_id: input.project_id,
    provider_identities: identities.map((i) => ({ provider: i.provider, id_kind: i.id_kind, id_value: i.id_value })),
    authority_scope: { allowed_projects: [...scope.allowed_projects], allowed_actions: [...scope.allowed_actions] },
    memory_class: 'cache_only',
    registered_at: input.registered_at,
  };

  const written = append(state.agents, input.agent_id, record, H.AGENT_RECORD_CONFLICT);
  if (written.status === 'HOLD') return written;
  if (written.status === 'NO_OP') return { status: 'NO_OP', agent_id: input.agent_id, record: written.record };
  for (const key of crosswalkKeys) state.providerCrosswalk.set(key, input.agent_id);
  return { status: 'REGISTERED', agent_id: input.agent_id, record: written.record };
}

export const listAgents = (store) => recordsOf(store, 'agents');

/**
 * The registered agent behind an id, or `undefined`, and `null` for an unrecognized store handle.
 *
 * Run Observation needs the agent's project binding to close the project firewall. It asks this
 * seam rather than reading the agent map itself, so the registry stays the only place that decides
 * what a registered agent is.
 */
export function findAgentRecord(store, agentId) {
  const state = stateOf(store);
  if (state === undefined) return null;
  const entry = state.agents.get(agentId);
  return entry === undefined ? undefined : entry.record;
}
