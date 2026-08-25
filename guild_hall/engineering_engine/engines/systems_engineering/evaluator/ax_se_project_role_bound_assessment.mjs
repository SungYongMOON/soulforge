// Candidate-only AX/SE assessment bound to one exact logical role roster.
//
// This pure subject reuses the frozen v0 stage/gap assessment and replaces its
// caller-supplied role projection with a source-bound logical roster. It grants no
// human, live-availability, assignment, Task, ERP, model, network, file, or canon authority.

import { types } from 'node:util';

import { canonicalise } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { isWellFormedRef, sameExactRef } from '../../../core/validators/identity.mjs';
import { candidateHandle } from '../../../core/validators/minting.mjs';
import {
  assessAxSeProject,
  buildAxSeAssessmentInput,
} from './ax_se_project_assessment.mjs';
import { buildAxSeProjectRoleRoster } from './ax_se_project_role_roster.mjs';

export const AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA = 'soulforge.ax_se_project_role_bound_packet.v1';
export const AX_SE_PROJECT_ROLE_BOUND_ASSESSMENT_SCHEMA = 'soulforge.ax_se_project_role_bound_assessment.v1';
export const AX_SE_PROJECT_ROLE_PROJECTION_POLICY = 'soulforge.ax_se_project_role_projection_policy.v1';

export const AX_SE_PROJECT_ROLE_BOUND_CODES = Object.freeze({
  INPUT_INVALID: 'AX_SE_ROLE_BOUND_INPUT_INVALID',
  INPUT_UNSAFE: 'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
  INPUT_UNBOUNDED: 'AX_SE_ROLE_BOUND_INPUT_UNBOUNDED',
  REFERENCE_INVALID: 'AX_SE_ROLE_BOUND_REFERENCE_INVALID',
  ROSTER_BINDING_MISMATCH: 'AX_SE_ROLE_BOUND_ROSTER_BINDING_MISMATCH',
  CAPABILITY_VOCABULARY_MISMATCH: 'AX_SE_ROLE_BOUND_CAPABILITY_VOCABULARY_MISMATCH',
});

const PACKET_FIELDS = Object.freeze([
  'schema_version', 'context_packet', 'expected_project_binding_ref', 'policy',
  'policy_capability_vocabulary_ref', 'role_roster_packet',
]);
const REF_FIELDS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_text', 'chunk', 'chunks', 'answer', 'answer_text',
  'body', 'payload', 'prompt', 'completion', 'private_path', 'absolute_path',
  'source_path', 'secret', 'credential', 'password', 'cookie', 'token',
]);
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /(?:^|[^A-Za-z0-9_])\/(?:tmp|temp|var|etc|opt|srv|usr|bin|sbin|lib|dev|proc|sys|root|home|users|mnt|media|private|data|Applications|Library|Volumes)\/\S/iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);
const MAX = Object.freeze({ depth: 24, values: 30000, array: 512, keys: 32, string: 512 });

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

function assertSafeString(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
      'input strings must be bounded non-empty NFC text without controls', { field });
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
      'private paths, credentials, and payload-bearing strings are forbidden', { field });
  }
  return value;
}

function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;

  const walk = (value, depth, field) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNBOUNDED,
        'input exceeds the bounded plain-data limits');
    }
    if (typeof value === 'string') return assertSafeString(value, field);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
          'only safe integers are accepted', { field });
      }
      return value;
    }
    if (value === null || typeof value !== 'object') {
      fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
        'only non-null plain JSON data is accepted', { field });
    }
    if (types.isProxy(value)) {
      fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
        'Proxy input is refused before reflective access', { field });
    }
    if (seen.has(value)) {
      fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
        'cyclic and aliased object graphs are refused', { field });
    }
    seen.add(value);

    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
        'input reflection failed without exposing caller text', { field });
    }
    const array = Array.isArray(value);
    if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype)) {
      fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
        'custom prototypes and host objects are refused', { field });
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
        'symbol properties are not accepted', { field });
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    const arrayLength = array ? descriptors.length?.value : undefined;
    if (array) {
      if (!Number.isSafeInteger(arrayLength) || arrayLength < 0 || arrayLength > MAX.array) {
        fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNBOUNDED,
          'arrays must be dense, unnamed, and within the item limit', { field });
      }
      const expected = new Set(Array.from({ length: arrayLength }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNBOUNDED,
          'arrays must be dense, unnamed, and within the item limit', { field });
      }
    } else if (dataKeys.length > MAX.keys) {
      fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNBOUNDED,
        'an input object exceeds the field limit', { field });
    }

    const copy = array ? new Array(arrayLength) : {};
    for (const key of dataKeys) {
      if (key.length > 80 || key.normalize('NFC') !== key || FORBIDDEN_KEYS.has(key.toLowerCase())) {
        fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
          'payload-bearing, unsafe, or unbounded field name refused', { field });
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_UNSAFE,
          'accessors and hidden fields are refused', { field });
      }
      Object.defineProperty(copy, key, {
        value: walk(descriptor.value, depth + 1, array ? `${field}[]` : `${field}.*`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return copy;
  };

  return walk(root, 0, 'input');
}

function assertExactKeys(value, required, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_INVALID, `${label} must be an object`);
  }
  const actual = Object.keys(value);
  if (actual.some((key) => !required.includes(key))
      || required.some((key) => !Object.hasOwn(value, key))) {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_INVALID,
      `${label} has missing or unexpected fields`, {
        missing_count: required.filter((key) => !Object.hasOwn(value, key)).length,
        unexpected_count: actual.filter((key) => !required.includes(key)).length,
      });
  }
}

function assertExactRef(ref, field) {
  assertExactKeys(ref, REF_FIELDS, field);
  if (!isWellFormedRef(ref) || !/^sha256:[0-9a-f]{64}$/u.test(ref.content_id)) {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.REFERENCE_INVALID,
      `${field} must be an exact sha256-bound revision ref`, { field });
  }
}

function arrayOrderRules(value) {
  const rules = {};
  const visit = (row, path = '') => {
    if (Array.isArray(row)) {
      rules[path] = 'insertion_ordered';
      row.forEach((child) => visit(child, `${path}[]`));
    } else if (row !== null && typeof row === 'object') {
      Object.entries(row).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  visit(value);
  return rules;
}

function digest(domain, value) {
  try {
    return sha256Hex(`${domain}\n${canonicalise(value, arrayOrderRules(value))}`);
  } catch {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_INVALID,
      'role-bound assessment material is not canonically serialisable');
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function projectedRoles(roster) {
  const routeable = roster.exclusivity_supported;
  return roster.roles.map((role) => ({
    role_id: role.role_id,
    availability_state: routeable && role.routing_state === 'eligible' ? 'available' : 'unavailable',
    capabilities: [...role.capabilities],
  }));
}

function roleDecision(requiredCapability, roster) {
  if (roster.coverage_state === 'partial') {
    return { state: 'HOLD', reason_code: 'roster_coverage_partial', required_capability: requiredCapability };
  }
  if (roster.coverage_state === 'unknown') {
    return { state: 'HOLD', reason_code: 'roster_coverage_unknown', required_capability: requiredCapability };
  }
  if (roster.unknown_routing_count > 0) {
    return { state: 'HOLD', reason_code: 'roster_routing_unknown', required_capability: requiredCapability };
  }
  const eligible = roster.roles.filter((role) => role.routing_state === 'eligible'
    && role.capabilities.includes(requiredCapability));
  if (eligible.length === 1) {
    return {
      state: 'CANDIDATE',
      reason_code: 'unique_logical_role_candidate',
      required_capability: requiredCapability,
      role_id: eligible[0].role_id,
    };
  }
  if (eligible.length === 0) {
    return { state: 'HOLD', reason_code: 'capability_unmapped', required_capability: requiredCapability };
  }
  return {
    state: 'HOLD',
    reason_code: 'capability_ambiguous',
    required_capability: requiredCapability,
    eligible_role_ids: eligible.map((role) => role.role_id),
  };
}

/**
 * Assesses one exact project packet against one separately pinned exact logical roster ref.
 */
export function assessAxSeRoleBoundProject(roleBoundPacket, expectedRoleRosterRef) {
  const safe = snapshotPlainData({ roleBoundPacket, expectedRoleRosterRef });
  const packet = safe.roleBoundPacket;
  const expectedRef = safe.expectedRoleRosterRef;
  assertExactKeys(packet, PACKET_FIELDS, 'role-bound packet');
  if (packet.schema_version !== AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA) {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.INPUT_INVALID, 'role-bound packet schema is unsupported');
  }
  assertExactRef(expectedRef, 'expected role roster ref');
  assertExactRef(packet.policy_capability_vocabulary_ref, 'policy capability vocabulary ref');

  const roster = buildAxSeProjectRoleRoster({
    rosterPacket: packet.role_roster_packet,
    expectedProjectBindingRef: packet.expected_project_binding_ref,
  });
  if (!sameExactRef(roster.role_roster_ref, expectedRef)) {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.ROSTER_BINDING_MISMATCH,
      'the computed logical role roster does not match the separately pinned exact roster ref');
  }
  if (!sameExactRef(roster.capability_vocabulary_ref, packet.policy_capability_vocabulary_ref)) {
    fail(AX_SE_PROJECT_ROLE_BOUND_CODES.CAPABILITY_VOCABULARY_MISMATCH,
      'the policy and logical roster do not declare the same exact capability vocabulary ref');
  }

  const assessmentInput = buildAxSeAssessmentInput({
    contextPacket: packet.context_packet,
    expectedProjectBindingRef: packet.expected_project_binding_ref,
    policy: packet.policy,
    roles: projectedRoles(roster),
  });
  const base = assessAxSeProject(assessmentInput);
  const bindingMaterial = {
    base_input_fingerprint_sha256: base.input_fingerprint_sha256,
    role_roster_ref: roster.role_roster_ref,
    capability_vocabulary_ref: roster.capability_vocabulary_ref,
    policy_capability_vocabulary_ref: packet.policy_capability_vocabulary_ref,
    projection_policy_revision: AX_SE_PROJECT_ROLE_PROJECTION_POLICY,
  };
  const inputFingerprint = digest(AX_SE_PROJECT_ROLE_BOUND_ASSESSMENT_SCHEMA, bindingMaterial);
  const issueHandleByV0 = new Map();
  const issues = base.issues.map((issue) => {
    const { issue_handle: oldHandle, ...boundedIssue } = issue;
    const handle = candidateHandle(digest(`${AX_SE_PROJECT_ROLE_BOUND_ASSESSMENT_SCHEMA}.issue`, {
      project_binding_ref: base.project_binding_ref,
      issue: boundedIssue,
    }));
    issueHandleByV0.set(oldHandle, handle);
    return { issue_handle: handle, ...boundedIssue };
  });
  const missions = base.next_mission_candidates.map((mission) => {
    const { mission_candidate_handle: _oldHandle, role_candidate: oldRole, ...boundedMission } = mission;
    const decision = roleDecision(oldRole.required_capability, roster);
    const issueHandle = issueHandleByV0.get(mission.issue_handle);
    const handle = candidateHandle(digest(`${AX_SE_PROJECT_ROLE_BOUND_ASSESSMENT_SCHEMA}.mission`, {
      issue_handle: issueHandle,
      mission_kind: mission.mission_kind,
      role_decision: decision,
      role_roster_ref: roster.role_roster_ref,
      projection_policy_revision: AX_SE_PROJECT_ROLE_PROJECTION_POLICY,
    }));
    return {
      mission_candidate_handle: handle,
      ...boundedMission,
      issue_handle: issueHandle,
      role_decision: decision,
    };
  });
  const roleRoutingState = !roster.exclusivity_supported
    ? 'HOLD'
    : missions.length === 0
      ? 'NOT_REQUIRED'
      : missions.every((mission) => mission.role_decision.state === 'CANDIDATE')
        ? 'CANDIDATE_ONLY'
        : 'HOLD';
  const overallState = base.assessment_state === 'HOLD' || roleRoutingState === 'HOLD'
    ? 'HOLD'
    : base.assessment_state === 'UNKNOWN'
      ? 'UNKNOWN'
      : 'READY_FOR_OWNER_REVIEW';

  return deepFreeze({
    schema_version: AX_SE_PROJECT_ROLE_BOUND_ASSESSMENT_SCHEMA,
    projection_policy_revision: AX_SE_PROJECT_ROLE_PROJECTION_POLICY,
    assessment_handle: candidateHandle(inputFingerprint),
    input_fingerprint_sha256: inputFingerprint,
    project_binding_ref: base.project_binding_ref,
    objective_ref: base.objective_ref,
    policy_ref: base.policy_ref,
    project_snapshot_ref: base.project_snapshot_ref,
    role_roster_binding: {
      role_roster_ref: roster.role_roster_ref,
      capability_vocabulary_ref: roster.capability_vocabulary_ref,
      policy_capability_vocabulary_ref: packet.policy_capability_vocabulary_ref,
      capability_binding_mode: 'declared_policy_and_roster_exact_ref_token_equality',
      coverage_state: roster.coverage_state,
      unknown_routing_count: roster.unknown_routing_count,
      exclusivity_supported: roster.exclusivity_supported,
      logical_roles_only: true,
      vocabulary_membership_validated: false,
      live_availability_validated: false,
    },
    resolution: {
      stage_gap_state: base.assessment_state,
      role_routing_state: roleRoutingState,
      role_decisions_scope: 'emitted_mission_candidates_only',
      overall_state: overallState,
    },
    assessment_state: overallState,
    evidence_claim_ceiling: base.evidence_claim_ceiling,
    current_stage: {
      stage_code: base.current_stage.stage_code,
      stage_label: base.current_stage.stage_label,
      floor_status: base.current_stage.floor_status,
      requirement_counts: base.current_stage.requirement_counts,
      open_risk_count: base.current_stage.open_risk_count,
    },
    issues,
    next_mission_candidates: missions,
    candidate_truncation: base.candidate_truncation,
    authority: {
      candidate_only: true,
      roster_approval_claimed: false,
      human_identity_bound: false,
      live_availability_claimed: false,
      assignment_made: false,
      stage_cleared: false,
      owner_decision_made: false,
      person_assigned: false,
      task_intent_created: false,
    },
    gates: {
      stage_clear_allowed: false,
      taskdriver_activation_allowed: false,
      erp_write_allowed: false,
      canon_promotion_allowed: false,
    },
    effects: {
      erp_writes: 0,
      filesystem_writes: 0,
      model_calls: 0,
      network_calls: 0,
      taskdriver_activated: false,
    },
  });
}
