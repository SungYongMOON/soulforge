// The gate a real (non-synthetic) data class passes before the preparer reads
// a byte of it. Preparation of public_synthetic material needs nothing beyond
// the grant; anything else needs an admission: an Owner-authorized record that
// names the project, the data classes and the source roots it admits, and
// states the boundary the processing stays inside - local only, nothing sent
// out, no model calls. The record is read from the control root by address,
// pinned by digest, and checked here against the exact grant being prepared.
//
// The admission does not widen what an ACL allows: a store still checks each
// document's class against the actor's grant. It answers the other question -
// whether this material may be read for preparation at all - and it says who
// answered it. Removing the check, or relabeling company material as
// synthetic, are exactly the bypasses this module exists to make unnecessary.
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/core/validators/identity.mjs';
import { SourceDocumentError, isInstant } from './source_documents.mjs';

export const REAL_DATA_ADMISSION_SCHEMA = 'soulforge.context_real_data_admission.v1';
export const SYNTHETIC_DATA_CLASS = 'public_synthetic';
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+_-]{0,199}$/u;
// (valid_from is listed last so the APP boundary scan does not read it as an import.)
const FIELDS = ['schema_version', 'admission_id', 'project_ref', 'data_classes', 'source_refs', 'processing',
  'external_transfer', 'model_calls', 'authorized_by', 'authorized_at', 'valid_to', 'valid_from'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = code => { throw new SourceDocumentError(code); };

/** Does this grant reach beyond synthetic material at all? */
export function grantNeedsAdmission(grant) {
  return !grant.allowed_data_classes.every(dataClass => dataClass === SYNTHETIC_DATA_CLASS);
}

/**
 * Validates an admission against the admitted grant and the clock. Returns the
 * admission's identity (id and canonical digest) for the receipt; throws a
 * SourceDocumentError naming what refused it.
 */
export function validateRealDataAdmission(admission, { admitted, now } = {}) {
  if (!exactKeys(admission, FIELDS) || admission.schema_version !== REAL_DATA_ADMISSION_SCHEMA
    || !TOKEN.test(admission.admission_id ?? '') || exactRefIdentityKey(admission.project_ref) === null
    || !Array.isArray(admission.data_classes) || admission.data_classes.length === 0
    || !admission.data_classes.every(dataClass => TOKEN.test(dataClass) && dataClass !== SYNTHETIC_DATA_CLASS)
    || !Array.isArray(admission.source_refs) || !admission.source_refs.every(ref => TOKEN.test(ref))
    || admission.processing !== 'local_only' || admission.external_transfer !== false
    || !['none', 'loopback_only'].includes(admission.model_calls)
    || typeof admission.authorized_by !== 'string' || !admission.authorized_by
    || !isInstant(admission.authorized_at) || !isInstant(admission.valid_from) || !isInstant(admission.valid_to)
    || Date.parse(admission.valid_from) >= Date.parse(admission.valid_to)) fail('real_data_admission_invalid');
  if (!isInstant(now) || Date.parse(now) < Date.parse(admission.valid_from) || Date.parse(now) >= Date.parse(admission.valid_to)) {
    fail('real_data_admission_not_current');
  }
  if (exactRefIdentityKey(admission.project_ref) !== admitted.project_key) fail('real_data_admission_project_mismatch');
  const classes = new Set(admission.data_classes);
  for (const dataClass of admitted.grant.allowed_data_classes) {
    if (dataClass !== SYNTHETIC_DATA_CLASS && !classes.has(dataClass)) fail('real_data_admission_class_refused');
  }
  const refs = new Set(admission.source_refs);
  for (const source of admitted.grant.sources) {
    if (!refs.has(source.root_ref)) fail('real_data_admission_source_refused');
  }
  return Object.freeze({ admission_id: admission.admission_id, admission_sha256: sha256Canonical(admission),
    data_classes: Object.freeze([...admission.data_classes]), authorized_by: admission.authorized_by });
}
