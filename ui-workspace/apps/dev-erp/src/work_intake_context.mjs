// Explicit file-backed, read-only accepted-context/Rune consumer. No writer imports.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { types } from 'node:util';
import { sameExactRef, exactRefIdentityKey } from '../../../../guild_hall/engineering_engine/kernel/identity.mjs';
import { runEnginePass } from '../../../../guild_hall/engineering_engine/core/runtime/engine_pass.mjs';
import { validateStateElement } from '../../../../guild_hall/engineering_engine/core/validators/snapshot.mjs';
import { recordSourceConflict, REQUIRED_SOURCE_CLAIM_FIELDS } from '../../../../guild_hall/engineering_engine/core/validators/authority.mjs';
import { createAcceptedContextReader } from './accepted_context_reader.mjs';
import { applyWorkIntakeRuleProfile } from './work_intake_rule_profile.mjs';

const HASH = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const MAX_BYTES = 2 * 1024 * 1024;
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const keys = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const optionalKeys = (value, fields, optional) => keys(value, [...fields, ...optional.filter(key => Object.hasOwn(value || {}, key))]);
const within = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)); };
const hold = () => ({ status: 'HOLD', blocker_codes: ['ACCEPTED_TYPED_CONTEXT_NOT_AVAILABLE'],
  accepted_context_ref: null, engine_finding_refs: [], findings: [], evidence_refs: [],
  official_done: false, side_effects: 0 });
function demand(condition) { if (!condition) throw new Error('unavailable'); }
function plainCopy(value, seen = new WeakSet(), depth = 0) {
  demand(depth <= 20);
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { demand(Number.isSafeInteger(value)); return value; }
  demand(typeof value === 'object' && !types.isProxy(value) && !seen.has(value)
    && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype));
  seen.add(value);
  const copy = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    demand(typeof key === 'string' && key !== '__proto__' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
    copy[key] = plainCopy(descriptor.value, seen, depth + 1);
  }
  seen.delete(value);
  return copy;
}

function aclFromJson(value) {
  demand(keys(value, ['actors', 'revoked_actors', 'revoked_generations'])
    && ['actors', 'revoked_actors', 'revoked_generations'].every(key => Array.isArray(value[key])));
  const actors = new Map();
  for (const row of value.actors) {
    demand(keys(row, ['actor_ref', 'grant']) && !actors.has(row.actor_ref));
    const grant = row.grant;
    demand(keys(grant, ['grant_revision_ref', 'allowed_projects', 'allowed_scopes', 'allowed_purposes',
      'field_allowed', 'chunk_allowed', 'locator_allowed'])
      && ['allowed_projects', 'allowed_scopes', 'allowed_purposes'].every(key => Array.isArray(grant[key])));
    actors.set(row.actor_ref, { ...grant, allowed_projects: new Set(grant.allowed_projects),
      allowed_scopes: new Set(grant.allowed_scopes), allowed_purposes: new Set(grant.allowed_purposes) });
  }
  return { actors, revoked_actors: new Set(value.revoked_actors), revoked_generations: new Set(value.revoked_generations) };
}

/**
 * Caller supplies a trusted configuration digest and the complete intake writable-root set.
 * Current state descriptors use sha256:null; configuration, generation and per-event typed
 * evidence are byte-pinned. A new generation requires a newly pinned configuration.
 * The typed_input digest must come from the verified event packet, never a model decision.
 */
export function createWorkIntakeContextConsumer({ configPath, configSha256, writableRoots } = {}) {
  try {
    demand(isAbsolute(configPath || '') && HASH.test(configSha256 || '')
      && Array.isArray(writableRoots) && writableRoots.length > 0 && writableRoots.every(path => isAbsolute(path)));
    // Existing aliases must also resolve inside the blocked boundary.
    const writable = writableRoots.flatMap(path => {
      const absolute = resolve(path);
      try { return [absolute, realpathSync(absolute)]; } catch { return [absolute]; }
    });
    // Inspect every component: realpath on the leaf alone would miss an ancestor junction.
    function checkedPath(path, directory = false) {
      demand(typeof path === 'string' && isAbsolute(path) && path === resolve(path));
      demand(!writable.some(root => within(root, path)));
      let part = path;
      while (true) {
        demand(!lstatSync(part).isSymbolicLink() && realpathSync(part) === part);
        const parent = dirname(part); if (parent === part) break; part = parent;
      }
      const stat = lstatSync(path);
      demand(directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1 && stat.size >= 2 && stat.size <= MAX_BYTES);
      return stat;
    }
    function readFile(descriptor, current = false) {
      demand(keys(descriptor, ['path', 'sha256']) && (current ? descriptor.sha256 === null : HASH.test(descriptor.sha256 || '')));
      const checked = checkedPath(descriptor.path);
      const fd = openSync(descriptor.path, 'r');
      try {
        const before = fstatSync(fd);
        demand(before.ino === checked.ino && before.dev === checked.dev && before.nlink === 1 && before.size <= MAX_BYTES);
        const bytes = readFileSync(fd);
        const after = fstatSync(fd);
        const final = checkedPath(descriptor.path);
        demand(bytes.length <= MAX_BYTES && before.size === after.size && before.mtimeMs === after.mtimeMs
          && before.ctimeMs === after.ctimeMs && final.ino === before.ino && final.dev === before.dev
          && (current || digest(bytes) === descriptor.sha256));
        return { value: JSON.parse(bytes.toString('utf8')), sha256: digest(bytes) };
      } finally { closeSync(fd); }
    }
    const configDescriptor = { path: resolve(configPath), sha256: configSha256 };
    const config = readFile(configDescriptor).value;
    demand(optionalKeys(config, ['project_ref', 'producer_binding_ref', 'files', 'typed_input_roots'], ['rule_profile_binding'])
      && exactRefIdentityKey(config.project_ref) && exactRefIdentityKey(config.producer_binding_ref)
      && keys(config.files, ['pointer', 'source_revisions', 'acl', 'accepted_generation'])
      && Array.isArray(config.typed_input_roots) && config.typed_input_roots.length > 0);
    config.typed_input_roots.forEach(path => checkedPath(path, true));
    function currentConfig() { readFile(configDescriptor); }
    function current(name) { currentConfig(); return readFile(config.files[name], true).value; }
    function generation() { currentConfig(); return readFile(config.files.accepted_generation).value; }
    function observations() {
      currentConfig();
      return ['pointer', 'source_revisions', 'acl'].map(name => readFile(config.files[name], true).sha256).join(':');
    }
    const reader = createAcceptedContextReader({ enabled: true,
      binding: { project_ref: config.project_ref, producer_binding_ref: config.producer_binding_ref },
      providers: { currentPointer: () => current('pointer'), currentSourceRevisions: () => current('source_revisions'),
        currentAclPolicy: () => aclFromJson(current('acl')),
        readAcceptedGeneration: async (project, accepted) => {
          const value = generation();
          demand(sameExactRef(project, config.project_ref) && sameExactRef(accepted, value.manifest?.accepted_generation_ref));
          return value;
        } } });
    return Object.freeze({
      async read(input, { currentTime } = {}) {
        try {
          const safe = plainCopy(input);
          demand(keys(safe, ['actor_ref', 'project_ref', 'accepted_generation_ref', 'scope', 'as_of', 'purpose', 'budget', 'cursor', 'typed_input'])
            && safe.scope === 'project' && safe.cursor === null && sameExactRef(safe.project_ref, config.project_ref));
          const { typed_input: typedDescriptor, ...query } = safe;
          const before = observations();
          const accepted = await reader.query(query);
          demand(accepted.status === 'ok' && accepted.cursor === null && accepted.hits.length > 0);
          demand(config.typed_input_roots.some(root => within(root, typedDescriptor?.path || '')));
          const typedRead = readFile(typedDescriptor);
          const typed = typedRead.value;
          demand(optionalKeys(typed, ['project_ref', 'accepted_generation_ref', 'source_revision_refs', 'engine'], ['rule_profile'])
            && sameExactRef(typed.project_ref, accepted.project_ref)
            && sameExactRef(typed.accepted_generation_ref, accepted.accepted_generation_ref)
            && Object.hasOwn(typed, 'rule_profile') === Object.hasOwn(config, 'rule_profile_binding'));
          const commonQuery = { ...query, scope: 'common' };
          const common = typed.rule_profile ? await reader.query(commonQuery) : null;
          demand(!typed.rule_profile || (common.status === 'ok' && common.cursor === null));
          const commonRefs = new Set((common?.hits || []).map(hit => exactRefIdentityKey(hit.source_revision_ref)));
          const hitRefs = new Set([...accepted.hits, ...(common?.hits || [])].map(hit => exactRefIdentityKey(hit.source_revision_ref)));
          demand(Array.isArray(typed.source_revision_refs) && typed.source_revision_refs.length > 0
            && typed.source_revision_refs.every(ref => exactRefIdentityKey(ref) && hitRefs.has(exactRefIdentityKey(ref))));
          const refs = new Set(typed.source_revision_refs.map(exactRefIdentityKey));
          demand(refs.size === typed.source_revision_refs.length);
          const engine = typed.engine;
          demand(keys(engine, ['states', 'subject_id', 'topology_digest', 'observation_run_id', 'taken_at', 'valid_at'])
            && TOKEN.test(engine.subject_id || '') && TOKEN.test(engine.observation_run_id || '')
            && /^[0-9a-f]{64}$/u.test(engine.topology_digest || '')
            && engine.taken_at === query.as_of && engine.valid_at <= engine.taken_at);
          let states = engine.states;
          demand(optionalKeys(states, ['expected', 'observed', 'canonical_accepted_input_set'], ['conflicting_element_ids', 'source_claims'])
            && Object.hasOwn(states, 'conflicting_element_ids') === Object.hasOwn(states, 'source_claims')
            && Array.isArray(states.expected) && states.expected.length > 0 && states.expected.length <= 100
            && Array.isArray(states.observed) && states.observed.length <= 100
            && keys(states.canonical_accepted_input_set, ['source_revision_refs', 'artifact_revision_refs']));
          const expectedIds = new Set(); const observedIds = new Set();
          for (const element of states.expected) {
            validateStateElement(element);
            demand(element.axis === 'expected' && TOKEN.test(element.element_id || '') && !expectedIds.has(element.element_id)
              && refs.has(exactRefIdentityKey(element.requirement_ref)) && element.applicability === true);
            expectedIds.add(element.element_id);
          }
          for (const element of states.observed) {
            validateStateElement(element);
            demand(element.axis === 'observed' && TOKEN.test(element.element_id || '') && !observedIds.has(element.element_id)
              && expectedIds.has(element.element_id.slice(4)) && element.element_id.startsWith('obs_')
              && refs.has(exactRefIdentityKey(element.artifact_revision_ref)));
            observedIds.add(element.element_id);
          }
          for (const group of Object.values(states.canonical_accepted_input_set)) {
            demand(Array.isArray(group) && group.every(ref => refs.has(exactRefIdentityKey(ref))));
          }
          const sameRefSet = (left, right) => {
            const a = left.map(exactRefIdentityKey).sort(); const b = [...new Set(right.map(exactRefIdentityKey))].sort();
            return a.length === b.length && a.every((key, index) => key === b[index]);
          };
          demand(sameRefSet(states.canonical_accepted_input_set.source_revision_refs, states.expected.map(element => element.requirement_ref))
            && sameRefSet(states.canonical_accepted_input_set.artifact_revision_refs, states.observed.map(element => element.artifact_revision_ref)));
          for (const element of [...states.expected, ...states.observed]) {
            demand(element.known_at <= query.as_of && element.valid_at <= query.as_of);
          }
          if (Object.hasOwn(states, 'conflicting_element_ids')) {
            demand(Array.isArray(states.conflicting_element_ids) && new Set(states.conflicting_element_ids).size === states.conflicting_element_ids.length
              && keys(states.source_claims, states.conflicting_element_ids)
              && states.conflicting_element_ids.every(id => expectedIds.has(id)));
            for (const claims of Object.values(states.source_claims)) {
              demand(Array.isArray(claims) && claims.length >= 2 && claims.length <= 20);
              for (const claim of claims) {
                demand(keys(claim, REQUIRED_SOURCE_CLAIM_FIELDS) && TOKEN.test(claim.claim_id || '') && TOKEN.test(claim.lineage_ref || '')
                  && refs.has(exactRefIdentityKey(claim.source_revision_ref))
                  && (typeof claim.asserted_value === 'boolean' || Number.isSafeInteger(claim.asserted_value)
                    || (typeof claim.asserted_value === 'string' && TOKEN.test(claim.asserted_value)))
                  && claim.valid_at <= query.as_of && claim.known_at <= query.as_of);
              }
              recordSourceConflict(claims);
            }
          }
          const profile = typed.rule_profile ? applyWorkIntakeRuleProfile({ profile: typed.rule_profile,
            binding: config.rule_profile_binding, states, refs, commonRefs, projectRef: accepted.project_ref, asOf: query.as_of,
            ...(currentTime === undefined ? {} : { currentTime }) }) : null;
          if (profile) states = profile.states;
          const ruleConflicts = Object.entries(states.source_claims || {}).map(([expected_element_id, claims]) => ({
            expected_element_id, ...recordSourceConflict(claims) }));
          // The existing engine includes this fingerprint in replay-relevant provenance.
          // It binds selection, pinned policy, exact typed bytes and fresh ACL/source state,
          // including changes which leave the selected expected-element set unchanged.
          states = plainCopy({ ...states, context_capsule_fingerprint: digest(JSON.stringify({ typed_sha256: typedRead.sha256,
            config_sha256: configSha256, current_state: before, common_query: common?.query_digest || null })).slice(7) });
          const pointer = current('pointer');
          const result = runEnginePass({ states, subjectId: engine.subject_id,
            projectBindingRef: exactRefIdentityKey(accepted.project_ref), generation: pointer.generation_number,
            topologyDigest: engine.topology_digest, observationRunId: engine.observation_run_id,
            takenAt: engine.taken_at, validAt: engine.valid_at, mintValue: randomUUID });
          // Re-authorize after the engine; no asynchronous work follows the final observations.
          const finalAccepted = await reader.query(query);
          const finalCommon = common ? await reader.query(commonQuery) : null;
          demand(finalAccepted.status === 'ok' && finalAccepted.query_digest === accepted.query_digest
            && (!common || (finalCommon.status === 'ok' && finalCommon.query_digest === common.query_digest))
            && before === observations() && readFile(typedDescriptor).sha256 === typedRead.sha256);
          const findings = result.findings.map(finding => ({ finding_id: finding.finding_id, snapshot_id: finding.snapshot_id,
            gap_type: finding.gap_type, expected_element_id: finding.expected_element_id,
            evidence_claim_ceiling: finding.evidence_claim_ceiling, disposition_state: finding.disposition_state,
            observation_attempt_ref: finding.observation_attempt_ref,
            ...(finding.source_conflict ? { source_conflict: finding.source_conflict } : {}) }));
          return { status: ruleConflicts.length ? 'HOLD' : 'READ_ONLY_ASSESSED',
            ...(ruleConflicts.length ? { blocker_codes: ['RULE_CONFLICT_UNRESOLVED'] } : {}),
            accepted_context_ref: accepted.accepted_generation_ref,
            accepted_context_id: accepted.accepted_generation_ref.revision_id,
            engine_finding_refs: findings.map(finding => finding.finding_id), findings,
            evidence_refs: typed.source_revision_refs,
            evidence_digests: { config_sha256: configSha256, typed_input_sha256: typedRead.sha256,
              accepted_query_sha256: accepted.query_digest, current_state_sha256: digest(before),
              ...(common ? { common_query_sha256: common.query_digest } : {}),
              ...(profile ? { rule_profile_sha256: profile.trace.profile_sha256 } : {}),
              engine_fingerprint_sha256: `sha256:${result.fingerprint}` },
            assessment: { snapshot_id: result.snapshot.snapshot_id, gap_counts: result.gap_counts,
              requirements_judged: result.requirements_judged, claim_ceiling: result.snapshot.claim_ceiling },
            ...(profile ? { rule_profile: profile.trace } : {}),
            ...(ruleConflicts.length ? { rule_conflicts: ruleConflicts } : {}),
            official_done: false, side_effects: 0 };
        } catch { return hold(); }
      },
    });
  } catch { return Object.freeze({ read: async () => hold() }); }
}
