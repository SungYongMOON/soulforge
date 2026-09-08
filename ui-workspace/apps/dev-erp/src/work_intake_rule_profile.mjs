// App-local selection of already typed, accepted rule evidence. Layer names are not ranks.
import { isDeepStrictEqual } from 'node:util';
import { exactRefIdentityKey, sameExactRef } from '../../../../guild_hall/engineering_engine/kernel/identity.mjs';
import { resolveApplicability, resolveAuthority, APPLICABILITY_COMPONENTS } from '../../../../guild_hall/engineering_engine/core/validators/authority.mjs';
import { resolveProfileBindings } from '../../../../guild_hall/engineering_engine/core/interfaces/domain_engine_adapter.mjs';
import { inspectInstant } from '../../../../guild_hall/engineering_engine/core/validators/canonical.mjs';
import { sha256Canonical } from '../../../../guild_hall/shared/project_history_envelope.mjs';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const keys = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
function demand(condition) { if (!condition) throw new Error('unavailable'); }
const refSet = refs => [...new Map(refs.map(ref => [exactRefIdentityKey(ref), ref])).values()]
  .sort((left, right) => left.revision_id < right.revision_id ? -1 : left.revision_id > right.revision_id ? 1 : 0);

export function applyWorkIntakeRuleProfile({ profile, binding, states, refs, commonRefs, projectRef, asOf, currentTime = asOf }) {
  demand(inspectInstant(currentTime).valid && Date.parse(currentTime) >= Date.parse(asOf));
  demand(keys(binding, ['selection', 'profile_revision_ref', 'approved_exceptions'])
    && keys(profile, ['selection', 'revision_ref', 'layers', 'exceptions'])
    && keys(profile.selection, ['customer_id', 'quality_grade', 'project_ref'])
    && TOKEN.test(profile.selection.customer_id || '') && TOKEN.test(profile.selection.quality_grade || '')
    && isDeepStrictEqual(profile.selection, binding.selection)
    && sameExactRef(profile.selection.project_ref, projectRef)
    && sameExactRef(profile.revision_ref, binding.profile_revision_ref)
    && refs.has(exactRefIdentityKey(profile.revision_ref))
    && Array.isArray(profile.layers) && profile.layers.length > 0 && profile.layers.length <= 50
    && Array.isArray(profile.exceptions) && profile.exceptions.length <= 100 && Array.isArray(binding.approved_exceptions));
  const expectedById = new Map(states.expected.map(element => [element.element_id, element]));
  const selected = []; const coverage = new Set(); const layerIds = new Set();
  for (const layer of profile.layers) {
    demand(keys(layer, ['layer_id', 'kind', 'applies_to', 'revision_ref', 'authority_family', 'applicability', 'expected_element_ids'])
      && TOKEN.test(layer.layer_id || '') && !layerIds.has(layer.layer_id)
      && refs.has(exactRefIdentityKey(layer.revision_ref))
      && keys(layer.applicability, APPLICABILITY_COMPONENTS)
      && Array.isArray(layer.expected_element_ids) && layer.expected_element_ids.length > 0
      && new Set(layer.expected_element_ids).size === layer.expected_element_ids.length
      && layer.expected_element_ids.every(id => expectedById.has(id)));
    layerIds.add(layer.layer_id);
    let matches;
    if (layer.kind === 'common') {
      demand(keys(layer.applies_to, []) && commonRefs.has(exactRefIdentityKey(layer.revision_ref))
        && layer.expected_element_ids.every(id => commonRefs.has(exactRefIdentityKey(expectedById.get(id).requirement_ref))));
      matches = true;
    } else if (layer.kind === 'customer') {
      demand(keys(layer.applies_to, ['customer_id']) && TOKEN.test(layer.applies_to.customer_id || ''));
      matches = layer.applies_to.customer_id === profile.selection.customer_id;
    } else if (layer.kind === 'quality_grade') {
      demand(keys(layer.applies_to, ['quality_grade']) && TOKEN.test(layer.applies_to.quality_grade || ''));
      matches = layer.applies_to.quality_grade === profile.selection.quality_grade;
    } else {
      demand(layer.kind === 'project' && keys(layer.applies_to, ['project_ref']) && exactRefIdentityKey(layer.applies_to.project_ref));
      matches = sameExactRef(layer.applies_to.project_ref, projectRef);
    }
    const applicability = resolveApplicability(layer.applicability);
    // Even an unselected layer must name a registered family. Unknown applicability on a
    // selected layer cannot silently mean "not required".
    resolveAuthority([{ key: layer.authority_family, applicable: applicability }]);
    demand(!matches || applicability !== 'unknown');
    layer.expected_element_ids.forEach(id => coverage.add(id));
    if (matches && applicability === true) selected.push(layer);
  }
  demand(states.expected.every(element => coverage.has(element.element_id)) && selected.some(layer => layer.kind === 'common'));
  const selectedIds = new Set(selected.flatMap(layer => layer.expected_element_ids));
  const authorities = {};
  for (const id of selectedIds) {
    const candidates = selected.filter(layer => layer.expected_element_ids.includes(id))
      .map(layer => ({ key: layer.authority_family, applicable: true }));
    const authority = resolveAuthority(candidates);
    demand(authority.conflict === false && expectedById.get(id).authority_family === authority.winner);
    authorities[id] = authority.winner;
  }
  const excluded = new Set();
  for (const exception of profile.exceptions) {
    demand(keys(exception, ['exception_ref', 'approval_ref', 'rule_revision_ref', 'scope', 'expected_element_id', 'decision',
      'approved', 'approver_kind', 'valid_at', 'expires_at'])
      && exception.approved === true && exception.approver_kind === 'registered_human' && exception.decision === 'exclude'
      && isDeepStrictEqual(exception.scope, profile.selection)
      && binding.approved_exceptions.some(approved => isDeepStrictEqual(approved, exception))
      && ['exception_ref', 'approval_ref', 'rule_revision_ref'].every(key => refs.has(exactRefIdentityKey(exception[key])))
      && inspectInstant(exception.valid_at).valid && inspectInstant(exception.expires_at).valid
      && Date.parse(exception.valid_at) <= Date.parse(asOf) && Date.parse(asOf) < Date.parse(exception.expires_at)
      && Date.parse(exception.valid_at) <= Date.parse(currentTime) && Date.parse(currentTime) < Date.parse(exception.expires_at)
      && selectedIds.has(exception.expected_element_id) && !excluded.has(exception.expected_element_id)
      && sameExactRef(exception.rule_revision_ref, expectedById.get(exception.expected_element_id).requirement_ref)
      && !(states.conflicting_element_ids || []).includes(exception.expected_element_id));
    excluded.add(exception.expected_element_id);
  }
  const expected = states.expected.filter(element => selectedIds.has(element.element_id) && !excluded.has(element.element_id));
  const retained = new Set(expected.map(element => element.element_id));
  const observed = states.observed.filter(element => retained.has(element.element_id.slice(4)));
  const conflicting = (states.conflicting_element_ids || []).filter(id => retained.has(id));
  const filtered = { expected, observed, canonical_accepted_input_set: {
    source_revision_refs: refSet(expected.map(element => element.requirement_ref)),
    artifact_revision_refs: refSet(observed.map(element => element.artifact_revision_ref)),
  }, ...(Object.hasOwn(states, 'conflicting_element_ids') ? { conflicting_element_ids: conflicting,
    source_claims: Object.fromEntries(conflicting.map(id => [id, states.source_claims[id]])) } : {}) };
  const common = selected.filter(layer => layer.kind === 'common');
  const project = selected.filter(layer => layer.kind !== 'common');
  const makeBinding = (kind, layers) => ({ profile_kind: kind, profile_id: `${kind}:${profile.revision_ref.revision_id}`,
    domain_engine_id: 'systems_engineering', revision_or_hash: profile.revision_ref.content_id,
    extends_or_base_pin: profile.revision_ref.revision_id,
    source_refs: [...new Set(layers.map(layer => layer.revision_ref.revision_id))],
    operations: layers.map(layer => ({ layer_id: layer.layer_id, kind: layer.kind,
      expected_element_ids: layer.expected_element_ids, revision_ref: layer.revision_ref })) });
  const bindings = resolveProfileBindings(makeBinding('organization', common), project.length ? makeBinding('project', project) : null);
  return { states: filtered, trace: { selection: profile.selection, profile_revision_ref: profile.revision_ref,
    profile_sha256: sha256Canonical(profile), selected_layer_ids: selected.map(layer => layer.layer_id),
    expected_element_ids: expected.map(element => element.element_id), excluded_element_ids: [...excluded], authorities,
    approved_exception_refs: profile.exceptions.map(exception => exception.exception_ref),
    profile_bindings: bindings.map(({ operations, ...bindingTrace }) => bindingTrace) } };
}
