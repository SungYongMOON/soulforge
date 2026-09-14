// Which words in a stretch of talk cannot, on their own, tell you which project
// it belongs to.
//
// A recording is full of terms that sound decisive and are not: the same board
// name, the same review milestone, the same subsystem word turns up in several
// projects, and a reader who takes one of them as the answer will file the talk
// under whichever project they thought of first. The registry is the list of
// those words -- derived, regenerable, and never authority: an entry says how
// many projects a term appears in, not which project a sentence is about.
//
// This is the minimal read side of that contract, and it exists so the voice
// read can already mark what it finds. The registry itself and the richer
// helper are built by the shared-terms slice (`claude/shared-terms-registry`);
// when that lands, this file is replaced by it wholesale -- the two names below
// (`loadSharedTerms`, `classifyTerms`) are the interface that has to survive.
//
// No schema name is asserted here. The registry has not been written yet, and
// guessing the string it will carry would turn an unbuilt artifact into a
// requirement; the declared schema travels through as data and the shape is
// what gets checked.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export const SHARED_TERMS_MAX_BYTES = 8 * 1024 * 1024;
/** A term shorter than this matches too much Korean text to be a clue. */
export const SHARED_TERM_MIN_LENGTH = 2;
const MAX_TERMS = 20000;
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();

/**
 * Reads the registry, or says why there is none. A missing registry is an
 * absence to report, never a reason to fall back on a guess -- the caller
 * simply marks nothing.
 */
export function loadSharedTerms(path) {
  const empty = (status, detail) => Object.freeze({ status, detail, path_sha256: null, terms: [],
    classifyTerms: () => [] });
  if (typeof path !== 'string' || !path) return empty('not_configured', null);
  if (!isAbsolute(path)) return empty('unavailable', 'shared terms path is not absolute');
  let bytes;
  try { bytes = readFileSync(path); } catch { return empty('unavailable', 'shared terms registry absent'); }
  if (bytes.length > SHARED_TERMS_MAX_BYTES) return empty('unavailable', 'shared terms registry too large');
  let parsed;
  try { parsed = JSON.parse(bytes); } catch { return empty('unavailable', 'shared terms registry unreadable'); }
  const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.terms) ? parsed.terms : null);
  if (rows === null) return empty('unavailable', 'shared terms registry shape unknown');
  const terms = [];
  for (const row of rows.slice(0, MAX_TERMS)) {
    const term = typeof row?.term === 'string' ? row.term : null;
    if (term === null || term.trim().length < SHARED_TERM_MIN_LENGTH) continue;
    const projects = Array.isArray(row.projects) ? row.projects.map(String) : [];
    terms.push(Object.freeze({ term, normalized: normalize(row.normalized ?? term), projects: Object.freeze(projects),
      project_count: projects.length, shared: projects.length >= 2,
      count: Number.isFinite(row.count) ? row.count : null,
      source: typeof row.source === 'string' ? row.source : 'unknown' }));
  }
  // Longest first, so a term that contains a shorter one is reported as itself.
  terms.sort((a, b) => b.normalized.length - a.normalized.length || a.normalized.localeCompare(b.normalized));
  const registry = Object.freeze({ status: 'ok', detail: null,
    path_sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    schema: typeof parsed?.schema === 'string' ? parsed.schema : null,
    generated_at: typeof parsed?.generated_at === 'string' ? parsed.generated_at : null,
    terms: Object.freeze(terms),
    classifyTerms: text => classifyTerms(text, registry) });
  return registry;
}

/**
 * The registry terms this text contains, each with how many projects carry it.
 * Substring matching over the normalized text: crude on purpose, because a
 * miss here costs a marking and a false positive costs nothing but a line the
 * reader checks. It decides nothing -- `shared` means "this word cannot pick a
 * project", not "this project".
 */
export function classifyTerms(text, registry) {
  const rows = registry?.terms ?? [];
  if (rows.length === 0) return [];
  const haystack = normalize(text);
  if (!haystack) return [];
  const found = [];
  const seen = new Set();
  for (const entry of rows) {
    if (seen.has(entry.normalized) || !haystack.includes(entry.normalized)) continue;
    seen.add(entry.normalized);
    found.push({ term: entry.term, normalized: entry.normalized, projects: [...entry.projects],
      project_count: entry.project_count, shared: entry.shared, source: entry.source });
  }
  // Shared first: those are the ones a reader has to stop treating as evidence.
  return found.sort((a, b) => Number(b.shared) - Number(a.shared) || b.project_count - a.project_count
    || a.term.localeCompare(b.term));
}
