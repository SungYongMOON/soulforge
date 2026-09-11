// Internal opt-in projection of typed evidence from an already verified paragraph.
// These are accepted source assertions, not model extraction or new acceptance.
import { sameExactRef } from '../../../engineering_engine/kernel/identity.mjs';
import { canonicalInstantEpoch } from '../../../engineering_engine/kernel/project_context_generation_candidate.mjs';
import { projectTypedRecord } from '../../algorithms/representation/accepted_typed_v1.mjs';

export const MEMORY_KINDS = Object.freeze(['fact', 'decision', 'commitment', 'constraint', 'correction', 'failure', 'success', 'preference', 'procedure']);
const token = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/u.test(v);
const instant = v => canonicalInstantEpoch(v) !== null;
const keys = (v, list) => v && Object.getPrototypeOf(v) === Object.prototype
  && Object.keys(v).length === list.length && list.every(k => Object.hasOwn(v, k));

export function readTypedMemory(paragraph, projectRef, hit, scope) {
  try {
    const value = JSON.parse(paragraph);
    if (!keys(value, ['project_ref', 'task_ref', 'records']) || !sameExactRef(value.project_ref, projectRef)
      || !token(value.task_ref) || !Array.isArray(value.records) || value.records.length > 24) throw new Error();
    const ids = new Set();
    const records = value.records.map(row => {
      if (!keys(row, ['id', 'kind', 'statement', 'subject', 'key', 'value', 'state', 'valid_at', 'known_at', 'purposes', 'relations'])
        || !token(row.id) || ids.has(row.id) || !MEMORY_KINDS.includes(row.kind)
        || typeof row.statement !== 'string' || !row.statement.trim() || [...row.statement].length > 400
        || !token(row.subject) || !token(row.key) || !token(row.value)
        || !['active', 'resolved', 'withdrawn'].includes(row.state) || !instant(row.valid_at) || !instant(row.known_at)
        || row.valid_at > row.known_at || row.known_at > hit.known_at || row.valid_at > hit.valid_at
        || !Array.isArray(row.purposes) || !row.purposes.length || new Set(row.purposes).size !== row.purposes.length
        || row.purposes.some(p => !['work', 'procedure_review'].includes(p))
        || !Array.isArray(row.relations) || row.relations.length > 6
        || row.relations.some(r => !keys(r, ['kind', 'target']) || !['depends_on', 'corrects', 'conflicts_with', 'same_result', 'applies_to'].includes(r.kind) || !token(r.target))
        // A common grant permits preferences only here, never project assertions.
        || (scope === 'common' && row.kind !== 'preference')) throw new Error();
      ids.add(row.id);
      return projectTypedRecord(row, value.task_ref);
    });
    return { status: 'VERIFIED', records };
  } catch { return { status: 'TYPED_EVIDENCE_INVALID', records: [] }; }
}
