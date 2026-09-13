// Prepares source documents for one exact grant: validate the grant, run the
// adapter that owns each granted source kind against its trusted root, and build
// the coverage record plus the change set against the previous coverage.
// Kinds without a connected adapter are reported as such, never skipped silently.
// Real (non-synthetic) data classes stay refused until the no-exfiltration
// boundary evidence and per-source grants are admitted by a separate gate.
import { validateSourceGrant, buildSourceCoverage, detectSourceChanges, SourceDocumentError } from './source_documents.mjs';
import { buildPreparationRun } from './preparation_run.mjs';
import { grantNeedsAdmission, validateRealDataAdmission } from './real_data_admission.mjs';
import { readLinearSourceDocuments } from '../adapters/sources/linear_custody_source.mjs';
import { readVoiceSourceDocuments } from '../adapters/sources/voice_session_source.mjs';
import { readMailSourceDocuments } from '../adapters/sources/mail_event_source.mjs';
import { readDocumentSourceDocuments } from '../adapters/sources/document_file_source.mjs';
import { readSlackSourceDocuments } from '../adapters/sources/slack_custody_source.mjs';

export const SOURCE_ADAPTERS = Object.freeze({ document: readDocumentSourceDocuments, linear: readLinearSourceDocuments,
  mail: readMailSourceDocuments, slack: readSlackSourceDocuments, voice: readVoiceSourceDocuments });
export const SYNTHETIC_DATA_CLASS = 'public_synthetic';

// Passing `runId` makes this call emit its own run record. The record is built
// here, around the actual adapter work, rather than by a caller holding the
// result: a record for documents the preparer did not emit cannot be produced
// through this surface. `clock` exists so a test can fix the observed interval.
export async function prepareSourceDocuments({ grant, roots, now, previousCoverage = null,
  runId = null, clock = () => new Date(), admission = null } = {}) {
  const startedAt = clock().toISOString();
  // The grant's bytes are its identity, so a path segment that canonical JSON
  // cannot render (a macOS NFD filename, a name truncated mid-surrogate-pair)
  // makes the grant unidentifiable. That is a refusal the Owner can act on -
  // rewrite the segment in NFC - and it is said in this module's own vocabulary
  // rather than escaping as somebody else's error class.
  let admitted;
  try { admitted = validateSourceGrant(grant, { now }); }
  catch (error) {
    if (error instanceof SourceDocumentError) throw error;
    throw new SourceDocumentError('source_grant_not_canonical');
  }
  // Synthetic material needs only the grant. Anything else needs an admission:
  // an Owner-authorized record naming this project, these data classes and
  // these source roots, with the boundary stated (local only, nothing sent
  // out). Without one the refusal stands exactly as before.
  let admissionRef = null;
  if (grantNeedsAdmission(admitted.grant)) {
    if (admission === null) throw new SourceDocumentError('real_source_preparation_not_admitted');
    admissionRef = validateRealDataAdmission(admission, { admitted, now });
  }
  const documents = [], results = [];
  for (const source of admitted.grant.sources) {
    const adapter = Object.hasOwn(SOURCE_ADAPTERS, source.kind) ? SOURCE_ADAPTERS[source.kind] : null;
    const rootPath = roots && Object.hasOwn(roots, source.root_ref) ? roots[source.root_ref] : null;
    const unavailable = code => source.items.forEach(item => results.push({ source_kind: source.kind,
      root_ref: source.root_ref, item_id: item.item_id, status: 'failed', code }));
    if (!adapter) { unavailable('adapter_not_connected'); continue; }
    if (typeof rootPath !== 'string') { unavailable('source_root_unbound'); continue; }
    const output = await adapter({ admitted, source, rootPath });
    documents.push(...output.documents);
    results.push(...output.results);
  }
  const coverage = buildSourceCoverage({ projectKey: admitted.project_key, grantSha256: admitted.grant_sha256, results });
  const prepared = {
    grant: Object.freeze({ grant_id: admitted.grant.grant_id, grant_sha256: admitted.grant_sha256, project_key: admitted.project_key }),
    documents: Object.freeze([...documents].sort((a, b) => a.doc_key.localeCompare(b.doc_key))),
    coverage,
    changes: detectSourceChanges(previousCoverage, coverage),
    // Who admitted real material, by id and digest - null when none was needed.
    admission: admissionRef,
  };
  // Both lineage-less states carry the same two keys, so one gate - `run === null`
  // with a stated reason - covers "no record was asked for" and "a record was
  // asked for and could not be made". Leaving the keys off the first shape made
  // a reader's check silently not apply.
  if (runId === null) return Object.freeze({ ...prepared, run: null, run_unavailable: 'record_not_requested' });
  // The record is built after every adapter has run, so anything it throws would
  // destroy work already done - including documents from the other kinds in this
  // grant. Twice a value honest input carries did exactly that. Whatever the
  // reason, the documents stand and the missing record is reported beside them:
  // no record is a thing a reader can see and act on, a lost preparation is not.
  try {
    return Object.freeze({ ...prepared, run: buildPreparationRun({ preparation: prepared, runId, startedAt,
      endedAt: clock().toISOString(), previousCoverage }), run_unavailable: null });
  } catch (error) {
    return Object.freeze({ ...prepared, run: null,
      run_unavailable: error instanceof SourceDocumentError ? error.code : 'preparation_run_uncomputable' });
  }
}
