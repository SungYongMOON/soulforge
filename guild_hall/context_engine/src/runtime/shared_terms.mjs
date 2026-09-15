// The shared-term registry, and what a reader does with it.
//
// Several projects in this estate run the same kind of work, so they use the same
// words for it: CDR, 수신부, 앰프, 해상시험. A record that contains one of those
// words has not thereby named a project, and a reader that treats it as one
// attributes a voice segment, a mail or a chunk to whichever project the word
// reminded it of. The registry is the list of those words, and this module is the
// one place that answers "is this term able to decide a project at all".
//
// It is derived, not authored: the registry is rebuilt from the graph index's own
// entities (a name several projects' generations hold) plus an Owner-placed seed
// of terms declared shared without waiting for the graph to show them. Nothing
// here reads a store, a database or a model -- a registry file and a piece of text
// go in, a verdict per term comes out -- so a caller can classify while offline
// and a missing registry degrades to "no verdict" rather than to a guess.
//
// The matching rule is deliberately small and stated rather than clever: no
// morphology, no stemming, no dictionary. A term matches as a case-folded
// substring, which is what lets 수신부 match 수신부의 and 수신부에서 without a
// Korean analyser; a term that is entirely ASCII additionally requires that the
// characters touching it are not ASCII letters or digits, so `CDR` does not match
// inside `CDROM`.
import { readFileSync } from 'node:fs';

export const SHARED_TERMS_SCHEMA = 'soulforge.context_shared_terms.v0';
// What a term is about. `content` is the estate's own subject vocabulary; a
// `workflow` term is the state-machine and notification wording that arrives with
// the task tracker (Status Change, due_date, 상태 변경). Both are shared and
// neither can decide a project, but they answer different questions, so a reader
// shows them apart and the project step drops the workflow ones from its query.
export const TERM_CATEGORIES = Object.freeze(['content', 'workflow']);
export const SHARED_TERMS_MAX_BYTES = 8 * 1024 * 1024;
// What one call will scan. A caller with more text than this splits it; it is not
// quietly truncated, because a term missed by truncation reads as "not present".
export const SHARED_TERMS_MAX_CHARACTERS = 200000;
// The one shape a term can be recognised in without being in the registry: an
// all-capital Latin token, which is what an acronym looks like in these records.
// A token joined to a hyphen (`P26-014`, `SON-1421`) is an identifier rather than
// a term and is left alone, and Korean is never cut up here -- without morphology
// there is no safe way to tell a word from a word plus its particle.
const ACRONYM = /(?<![\p{L}\p{N}-])\p{Lu}[\p{Lu}\p{N}]{1,15}(?![\p{L}\p{N}-])/gu;
const ASCII_WORD = /[a-z0-9]/u;
const NON_ASCII = /[^\u0000-\u007F]/u;

export class SharedTermsError extends Error {
  constructor(code) { super(code); this.name = 'SharedTermsError'; this.code = code; }
}
const fail = code => { throw new SharedTermsError(code); };

/** trim, case-fold, and collapse every run of whitespace -- the worker's rule, in JS. */
export function normaliseTerm(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().toLowerCase();
}

/**
 * The registry at `path`, or null when there is none.
 *
 * "None" is a real answer: a host that has never generated one, or a consumer
 * pointed at a control root that does not carry it, should keep working with no
 * verdict rather than fail. A file that exists but is not a registry is a
 * different matter -- reading it as "no registry" would silently turn a broken
 * generation into an unclassified reader, so it refuses.
 */
export function loadSharedTerms(path) {
  if (typeof path !== 'string' || !path) return null;
  let bytes;
  try { bytes = readFileSync(path); }
  catch (error) { return error?.code === 'ENOENT' ? null : fail('shared_terms_unreadable'); }
  if (bytes.length > SHARED_TERMS_MAX_BYTES) fail('shared_terms_too_large');
  let value;
  try { value = JSON.parse(bytes); } catch { fail('shared_terms_unreadable'); }
  if (value?.schema !== SHARED_TERMS_SCHEMA) fail('shared_terms_schema_unknown');
  if (typeof value.generated_at !== 'string' || !value.generated_at || !Array.isArray(value.generation_refs)
    || !Array.isArray(value.terms)) fail('shared_terms_invalid');
  let derived = false;
  const terms = value.terms.map(row => {
    if (typeof row?.term !== 'string' || !row.term || typeof row.normalized !== 'string' || !row.normalized
      || !Array.isArray(row.projects) || !row.projects.every(code => typeof code === 'string' && code)
      || !Number.isSafeInteger(row.mention_count) || row.mention_count < 0
      || !['graph', 'seed', 'both'].includes(row.source)) fail('shared_terms_invalid');
    for (const field of ['observed_projects', 'declared_projects']) {
      if (Object.hasOwn(row, field) && (!Array.isArray(row[field])
        || !row[field].every(code => typeof code === 'string' && code))) fail('shared_terms_invalid');
    }
    if (Object.hasOwn(row, 'declared_shared') && typeof row.declared_shared !== 'boolean') fail('shared_terms_invalid');
    if (Object.hasOwn(row, 'category') && !TERM_CATEGORIES.includes(row.category)) fail('shared_terms_invalid');
    const complete = ['declared_shared', 'observed_projects', 'declared_projects', 'category']
      .every(field => Object.hasOwn(row, field));
    if (!complete) derived = true;
    // A row written before the declaration and the observation were told apart
    // says only `projects` and `source`. The one thing that file does record is
    // that the seed named the term, so `declared_shared` is recoverable; which of
    // the projects came from the seed is not, and is reported as unknown (empty)
    // rather than guessed at.
    const declaredShared = Object.hasOwn(row, 'declared_shared') ? row.declared_shared : row.source !== 'graph';
    const observed = Object.hasOwn(row, 'observed_projects') ? [...row.observed_projects] : [...row.projects];
    const declaredProjects = Object.hasOwn(row, 'declared_projects') ? [...row.declared_projects] : [];
    return Object.freeze({ term: row.term, normalized: row.normalized, projects: Object.freeze([...row.projects]),
      mention_count: row.mention_count, source: row.source, declared_shared: declaredShared,
      observed_projects: Object.freeze(observed), declared_projects: Object.freeze(declaredProjects),
      category: Object.hasOwn(row, 'category') ? row.category : 'content' });
  });
  const refs = value.generation_refs.map(row => {
    if (typeof row?.project !== 'string' || !row.project || typeof row.generation_id !== 'string'
      || !row.generation_id) fail('shared_terms_invalid');
    return Object.freeze({ project: row.project, generation_id: row.generation_id });
  });
  return Object.freeze({ schema: value.schema, generated_at: value.generated_at,
    generation_refs: Object.freeze(refs), terms: Object.freeze(terms),
    compat: derived ? 'derived_from_v0_rows' : 'rows_as_written',
    counts: Object.freeze({ ...(value.counts ?? {}) }) });
}

/** Whether `needle` (already normalised) occurs in `haystack` (already normalised). */
function occurs(haystack, needle) {
  const korean = NON_ASCII.test(needle);
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (korean) return true;
    const before = at === 0 ? '' : haystack[at - 1];
    const after = haystack[at + needle.length] ?? '';
    if (!ASCII_WORD.test(before) && !ASCII_WORD.test(after)) return true;
  }
  return false;
}

const KIND_ORDER = { shared: 0, distinctive: 1, unregistered: 2 };

/**
 * The terms this text carries, and whether any of them can decide a project.
 *
 * `shared` is a term the estate uses in more than one place: either two or more
 * projects' generations were observed holding it, or a person declared it shared
 * in the seed. A declaration is not an observation and the two are kept apart --
 * the seed's own project list never inflates the observed count -- but either one
 * is enough to stop the term from deciding a project.
 *
 * `distinctive` is a term exactly one project's generation holds and nobody
 * declared shared, so it is a candidate -- still a candidate, because the registry
 * says where a term has been seen, not where it may appear. `unregistered` is an
 * acronym-shaped token the registry has never seen; it is reported so a reader can
 * say "I do not know this word" instead of quietly treating it as distinctive, and
 * it is never strong evidence for anything.
 *
 * Without a registry there is no verdict, so the answer is empty rather than a
 * list of guesses.
 */
export function classifyTerms(text, registry) {
  if (typeof text !== 'string' || !text) return [];
  if ([...text].length > SHARED_TERMS_MAX_CHARACTERS) fail('shared_terms_text_too_large');
  if (registry === null || registry === undefined || !Array.isArray(registry.terms)) return [];
  const haystack = normaliseTerm(text);
  const found = new Map();
  const known = new Set();
  for (const entry of registry.terms) {
    const needle = typeof entry?.normalized === 'string' && entry.normalized
      ? entry.normalized : normaliseTerm(entry?.term);
    if (!needle) continue;
    known.add(needle);
    if (found.has(needle) || !occurs(haystack, needle)) continue;
    const observed = Array.isArray(entry.observed_projects) ? [...entry.observed_projects]
      : (Array.isArray(entry.projects) ? [...entry.projects] : []);
    const declaredProjects = Array.isArray(entry.declared_projects) ? [...entry.declared_projects] : [];
    const declaredShared = typeof entry.declared_shared === 'boolean' ? entry.declared_shared
      : entry.source !== 'graph';
    // A row that names no project at all and carries no declaration says nothing
    // about anything; it is left out rather than reported as distinctive to
    // nowhere. The generator cannot emit one, so this is a file-shape guard.
    if (observed.length === 0 && !declaredShared) continue;
    found.set(needle, Object.freeze({ term: typeof entry.term === 'string' && entry.term ? entry.term : needle,
      kind: declaredShared || observed.length >= 2 ? 'shared' : 'distinctive',
      projects: Object.freeze([...new Set([...observed, ...declaredProjects])].sort()),
      observed_projects: Object.freeze([...observed].sort()),
      declared_projects: Object.freeze([...declaredProjects].sort()),
      observed_project_count: observed.length, declared_shared: declaredShared,
      category: TERM_CATEGORIES.includes(entry.category) ? entry.category : 'content' }));
  }
  for (const [token] of text.matchAll(ACRONYM)) {
    const needle = normaliseTerm(token);
    if (!needle || known.has(needle) || found.has(needle)) continue;
    found.set(needle, Object.freeze({ term: token, kind: 'unregistered', projects: Object.freeze([]),
      observed_projects: Object.freeze([]), declared_projects: Object.freeze([]),
      observed_project_count: 0, declared_shared: false, category: 'content' }));
  }
  return [...found.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
}
