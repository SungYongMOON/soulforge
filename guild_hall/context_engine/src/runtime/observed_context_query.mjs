// Task-authorized observation query. It does not create an accepted generation.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const unavailable = () => ({ status: 'NOT_AVAILABLE', claim_ceiling: 'observed', accepted_generation_ref: null,
  evidence: [], gaps: ['READ_AUTHORITY_OR_SOURCE_UNAVAILABLE'], effects: { writes: 0, model_calls: 0, external_sends: 0 } });
const kinds = new Set(['mail_metadata', 'mail_body', 'legacy_metadata', 'legacy_review_pending', 'document_metadata', 'meeting_metadata', 'task_metadata']);
const rowFields = ['id','project_code','source_ref','source_revision_sha256','input_file_sha256','kind','claim_state','text','section','known_at','locator'];
const gapCodes = new Set(['SOURCE_ASSERTIONS_ARE_NOT_ACCEPTED_FACTS','MAIL_CANDIDATE_SECTIONS_ARE_LITERAL_SPANS_NOT_CONFIRMED_INTENT',
  'QUOTED_MAIL_BOUNDARIES_CONSERVATIVE','LEGACY_191_SOURCES_AND_267_REVIEWS_ARE_UNACCEPTED_HISTORICAL_METADATA',
  'A_203_SECONDARY_NOT_MERGED_WITH_B_297','PLAUD_429_METADATA_HAS_NO_ACCEPTED_KVDS_SPAN_SCOPE',
  'LINEAR_PROJECT_SCOPE_MAP_EMPTY_CURRENT_ISSUES_NOT_READ','SE_128_ROWS_RESOLVE_TO_DIRECTORIES_NOT_128_PHYSICAL_DOCUMENTS',
  'DOCUMENT_CONTENT_ADMISSION_PENDING','ACCEPTED_GENERATION_NOT_CREATED','NO_AUTOMATIC_TASK_OR_CANON_WRITE','BODY_EVIDENCE_NOT_IN_THIS_GENERATION',
  'R1_KVDS_SELECTION_IS_NOT_COMPLETE_PROJECT_COVERAGE']);
const sourceRef = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const instant = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const locator = value => {
  if (typeof value !== 'string' || value.length > 100 || !/^(?:metadata\.subject|body:codepoint:[0-9]{1,8}:[0-9]{1,8}|csv:(?:source_id|review_id):[a-f0-9]{64})$/.test(value)) return false;
  if (!value.startsWith('body:')) return true;
  const [, , start, end] = value.split(':').map((part,index)=>index>1?Number(part):part);
  return end > start && end - start <= 400;
};
const coverageFields = {
  mail: ['selected','body_read','existing_folder_frame','existing_folder_selected','existing_folder_review_pending','existing_folder_auto','selected_outside_folder'], legacy: ['sources','review_pending'],
  documents: ['inventory_rows','directory_rows','registered_file_metadata','admitted_content'],
  plaud: ['index_records','exact_project_spans','body_read'], linear: ['candidate_records','verified_project_mappings','current_issue_reads'],
};
function coverageValid(value) {
  return value && Object.keys(value).length === Object.keys(coverageFields).length && Object.entries(coverageFields).every(([key, fields]) =>
    value[key] && Object.keys(value[key]).length === fields.length && fields.every(field => Number.isSafeInteger(value[key][field]) && value[key][field] >= 0 && value[key][field] <= 1000000));
}

/** loadCorpus is a local-only provider; authoritySnapshot must be fresh. */
export function createObservedContextQuery({ binding: suppliedBinding, loadCorpus, authoritySnapshot } = {}) {
  const binding = suppliedBinding ? structuredClone(suppliedBinding) : null;
  const configured = binding && hex(binding.task_authority_sha256) && hex(binding.corpus_sha256)
    && hex(binding.input_packet_sha256) && Array.isArray(binding.allowed_source_refs) && binding.allowed_source_refs.length <= 2000
    && binding.allowed_source_refs.every(sourceRef) && new Set(binding.allowed_source_refs).size === binding.allowed_source_refs.length
    && typeof binding.actor_ref === 'string' && binding.actor_ref && typeof binding.project_code === 'string'
    && typeof loadCorpus === 'function' && typeof authoritySnapshot === 'function';
  return Object.freeze({ async query(request) {
    if (!configured) return unavailable();
    try {
      const before = structuredClone(authoritySnapshot());
      const admitted = () => before.active === true && before.actor_ref === binding.actor_ref
        && before.task_authority_sha256 === binding.task_authority_sha256 && before.project_code === binding.project_code
        && isDeepStrictEqual(before, authoritySnapshot());
      if (!admitted() || request.actor_ref !== binding.actor_ref || request.project_code !== binding.project_code
        || request.purpose !== 'review_observed_sources' || request.scope !== 'project' || request.task_authority_sha256 !== binding.task_authority_sha256
        || typeof request.query !== 'string' || request.query.length > 500) return unavailable();
      const bytes = await loadCorpus();
      if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024 || sha(bytes) !== binding.corpus_sha256 || !admitted()) return unavailable();
      const corpus = JSON.parse(bytes.toString('utf8'));
      if (corpus.project_code !== binding.project_code || corpus.task_authority_sha256 !== binding.task_authority_sha256
        || corpus.input_packet_sha256 !== binding.input_packet_sha256 || !instant(corpus.known_at)
        || !coverageValid(corpus.source_coverage)
        || !sourceRef(corpus.coverage_audit_ref)
        || !Array.isArray(corpus.records) || corpus.records.length > 2000 || !Array.isArray(corpus.gaps)
        || corpus.gaps.length > 16 || corpus.gaps.some(gap => !gapCodes.has(gap))) return unavailable();
      const ids = new Set();
      for (const row of corpus.records) {
        if (!row || Object.keys(row).length !== rowFields.length || rowFields.some(field => !Object.hasOwn(row,field))
          || row.project_code !== binding.project_code || !hex(row.id) || ids.has(row.id) || !hex(row.source_revision_sha256) || !hex(row.input_file_sha256)
          || !sourceRef(row.source_ref) || !binding.allowed_source_refs.includes(row.source_ref) || !kinds.has(row.kind)
          || !locator(row.locator) || !(row.known_at === null || instant(row.known_at))
          || !['observed', 'review_pending'].includes(row.claim_state) || typeof row.text !== 'string' || row.text.length > 400
          || !['situation', 'decision_candidates', 'commitment_candidates', 'existing_work_candidates'].includes(row.section)) return unavailable();
        ids.add(row.id);
      }
      const terms = request.query.toLowerCase().split(/\s+/).filter(Boolean);
      const ordered = corpus.records.map(row => ({ row, score: terms.reduce((n, term) => n + (row.text.toLowerCase().includes(term) ? 1 : 0), 0) }))
        .sort((a, b) => b.score - a.score || (Date.parse(b.row.known_at) || 0) - (Date.parse(a.row.known_at) || 0) || a.row.id.localeCompare(b.row.id));
      const groups = { situation: [], decision_candidates: [], commitment_candidates: [], existing_work_candidates: [] };
      for (const { row } of ordered) if (groups[row.section].length < 2) groups[row.section].push(Object.fromEntries(rowFields.map(field=>[field,row[field]])));
      const evidence = Object.values(groups).flat();
      const result = { status: 'OBSERVED_CONTEXT', claim_ceiling: 'observed', accepted_generation_ref: null,
        project_code: binding.project_code, task_authority_sha256: binding.task_authority_sha256, corpus_sha256: binding.corpus_sha256,
        input_packet_sha256: binding.input_packet_sha256, binding_sha256: sha(JSON.stringify(binding)), known_at: corpus.known_at,
        currentness: 'pinned_snapshot_only',
        coverage_audit_ref: corpus.coverage_audit_ref,
        ...groups, evidence: evidence.map(row => ({ id: row.id, source_ref: row.source_ref, source_revision_sha256: row.source_revision_sha256,
          input_file_sha256: row.input_file_sha256, locator: row.locator ?? null })), gaps: corpus.gaps,
        coverage: { corpus_records: corpus.records.length, returned_records: evidence.length, accepted_claims: 0,
          sources: structuredClone(corpus.source_coverage) },
        effects: { writes: 0, model_calls: 0, external_sends: 0 } };
      if (!admitted()) return unavailable();
      const payload = { ...result, digest: sha(JSON.stringify(result)) };
      if (JSON.stringify(payload).length > 12000) return { ...unavailable(), gaps: ['OBSERVATION_OUTPUT_BUDGET_EXCEEDED'] };
      return payload;
    } catch { return unavailable(); }
  } });
}
