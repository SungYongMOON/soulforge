// Prepares source documents for one exact grant: validate the grant, run the
// adapter that owns each granted source kind against its trusted root, and build
// the coverage record plus the change set against the previous coverage.
// Kinds without a connected adapter are reported as such, never skipped silently.
// Real (non-synthetic) data classes stay refused until the no-exfiltration
// boundary evidence and per-source grants are admitted by a separate gate.
import { validateSourceGrant, buildSourceCoverage, detectSourceChanges, SourceDocumentError } from './source_documents.mjs';
import { readLinearSourceDocuments } from '../adapters/sources/linear_custody_source.mjs';

export const SOURCE_ADAPTERS = Object.freeze({ linear: readLinearSourceDocuments });
export const SYNTHETIC_DATA_CLASS = 'public_synthetic';

export async function prepareSourceDocuments({ grant, roots, now, previousCoverage = null } = {}) {
  const admitted = validateSourceGrant(grant, { now });
  if (!admitted.grant.allowed_data_classes.every(dataClass => dataClass === SYNTHETIC_DATA_CLASS)) {
    throw new SourceDocumentError('real_source_preparation_not_admitted');
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
  return Object.freeze({
    grant: Object.freeze({ grant_id: admitted.grant.grant_id, grant_sha256: admitted.grant_sha256, project_key: admitted.project_key }),
    documents: Object.freeze([...documents].sort((a, b) => a.doc_key.localeCompare(b.doc_key))),
    coverage,
    changes: detectSourceChanges(previousCoverage, coverage),
  });
}
