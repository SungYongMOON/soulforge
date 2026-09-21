import { isDeepStrictEqual } from 'node:util';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { digest, fail, freeze, hashText, instant, keys, sha, snapshot, token } from './data.mjs';
const REF_FIELDS = ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'];
const UNIT_FIELDS = ['project_ref', 'unit_id', 'source_kind', 'source_revision_ref', 'locator', 'text', 'text_sha256', 'occurred_at', 'known_at'];
const validRef = r => keys(r, REF_FIELDS) && exactRefIdentityKey(r) !== null && sha(r.content_id)
  && token(r.entity_id) && token(r.revision_id);
const allowedBinding = unit => ({ unit_id: unit.unit_id, source_revision_ref: unit.source_revision_ref,
  locator: unit.locator, text_sha256: unit.text_sha256 });

/** Caller-attested approval, not authority issuance or a filesystem reader.
 * now is supplied by the trusted caller on each invocation, including rechecks.
 * Full-source hash is preserved; supplied unit UTF-8 hash is actually checked.
 */
export function linkApprovedUnits(input) {
  const safe = snapshot(input);
  if (!keys(safe, ['project_ref', 'units', 'grant', 'now'])) fail('span_request_invalid');
  const { project_ref: project, units, grant, now } = safe;
  if (!token(project) || !instant(now) || !Array.isArray(units) || units.length > 100
    || !keys(grant, ['project_ref', 'grant_id', 'epoch', 'expires_at', 'units'])
    || grant.project_ref !== project || !token(grant.grant_id) || !Number.isSafeInteger(grant.epoch) || grant.epoch < 1
    || !instant(grant.expires_at) || now >= grant.expires_at || !Array.isArray(grant.units) || grant.units.length > 100) fail('span_grant_invalid');
  if (grant.units.some(b => !keys(b, ['unit_id', 'source_revision_ref', 'locator', 'text_sha256'])
    || !token(b.unit_id) || !validRef(b.source_revision_ref) || typeof b.locator !== 'string' || !sha(b.text_sha256))) fail('span_grant_invalid');
  const ids = new Set(); let chars = 0;
  for (const unit of units) {
    if (!keys(unit, UNIT_FIELDS) || unit.project_ref !== project || !token(unit.unit_id) || ids.has(unit.unit_id)
      || !['mail', 'voice', 'document'].includes(unit.source_kind) || !validRef(unit.source_revision_ref)
      || typeof unit.locator !== 'string' || unit.locator.length > 512 || !/^(paragraph|utterance|page|cell):[^\s]+$/u.test(unit.locator)
      || typeof unit.text !== 'string' || !unit.text.trim() || unit.text.length > 20000
      || !sha(unit.text_sha256) || hashText(unit.text) !== unit.text_sha256
      || !instant(unit.occurred_at) || !instant(unit.known_at) || unit.occurred_at > unit.known_at || unit.known_at > now) fail('span_unit_invalid');
    if (grant.units.filter(b => isDeepStrictEqual(b, allowedBinding(unit))).length !== 1) fail('span_not_approved');
    ids.add(unit.unit_id); chars += unit.text.length;
  }
  if (chars > 200000 || grant.units.length !== units.length) fail('span_coverage_incomplete');
  const ordered = [...units].sort((a, b) => a.unit_id < b.unit_id ? -1 : a.unit_id > b.unit_id ? 1 : 0);
  const spans = ordered.map(unit => ({ unit_id: unit.unit_id,
    binding: { source_revision_ref: unit.source_revision_ref, source_span_ref: 'span:' + digest({ project, ...allowedBinding(unit) }).slice(7), locator: unit.locator },
    span_sha256: unit.text_sha256 }));
  const body = { schema: 'soulforge.knowledge_layer.linked_spans.v1', project_ref: project, grant,
    units: ordered, spans, coverage: { supplied: units.length, admitted: units.length, excluded: 0, characters: chars } };
  return freeze({ ...body, source_digest: digest(body) });
}
export function validateLinkedBundle(bundle, now) {
  const safe = snapshot(bundle);
  if (!keys(safe, ['schema', 'project_ref', 'grant', 'units', 'spans', 'coverage', 'source_digest'])) fail('span_bundle_invalid');
  const expected = linkApprovedUnits({ project_ref: safe.project_ref, units: safe.units, grant: safe.grant, now });
  if (!isDeepStrictEqual(safe, snapshot(expected))) fail('span_bundle_invalid');
  return expected;
}
