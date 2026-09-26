// Same-day voice attribution ("해 놓고 고치기"): a voice card segment with no
// project candidate is placed in a project's history, marked weak, only when
// that KST day already has the project's written sources (mail/Slack/Linear)
// and the recording's own text or original title matches a project term or a
// participant of those written sources. Deterministic string matching only; no
// model, no network, no source reads. No match keeps it unattributed.
import { SAME_DAY_ATTRIBUTION } from './history.mjs';

export const SAME_DAY_RULE = 'same_day_context.v1';
export { SAME_DAY_ATTRIBUTION };
const WRITTEN = new Set(['mail', 'slack', 'linear']);
const fail = code => { throw new Error(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nfc = value => String(value ?? '').normalize('NFC');
// Korean personal names in display names: the leading 3-4 Hangul syllables
// before any title, affiliation or bracket. Shorter or non-Hangul names are not
// used (too many accidental hits in speech).
const NAME = /^[가-힣]{3,4}$/u;
export function participantName(display) {
  const head = nfc(display).replace(/["'“”]/gu, ' ').replace(/[([{<].*$/u, ' ').trim().split(/[\s/,|·]+/u)[0] ?? '';
  return NAME.test(head) ? head : null;
}
function termList(config, project) {
  const raw = config?.project_terms ?? [];
  if (!Array.isArray(raw) || raw.length > 200 || raw.some(term => typeof term !== 'string'
    || nfc(term).trim().length < 2 || term.length > 100)) fail('history_voice_same_day_terms_invalid');
  return [...new Set([project, ...raw.map(term => nfc(term).trim())])].sort();
}
function excludedNames(config) {
  const raw = config?.exclude_participants ?? [];
  if (!Array.isArray(raw) || raw.length > 200 || raw.some(name => typeof name !== 'string' || name.length > 100))
    fail('history_voice_same_day_exclude_invalid');
  return new Set(raw.map(name => nfc(name).trim()));
}
/**
 * Per-day context from the project's already-collected written records.
 * Returns Map(day -> {written, terms, participants}) or null when the rule is off.
 */
export function sameDayContext({ project, records, displayMetadata = {}, config }) {
  if (config === false) return null;
  const options = plain(config) ? config : {};
  const terms = termList(options, project), exclude = excludedNames(options);
  const people = plain(displayMetadata.person_names) ? displayMetadata.person_names : {};
  const slack = plain(displayMetadata.slack_names) ? displayMetadata.slack_names : {};
  const byDay = new Map();
  for (const row of records ?? []) {
    if (!plain(row) || !WRITTEN.has(row.kind) || typeof row.date !== 'string') continue;
    if (!byDay.has(row.date)) byDay.set(row.date, { written: 0, terms, participants: new Set() });
    const day = byDay.get(row.date); day.written += 1;
    const displays = row.kind === 'mail'
      ? [row.sender, row.recipient].flatMap(value => String(value ?? '').split(','))
        .map(address => people[address.trim().toLowerCase()]).filter(Boolean)
      : row.kind === 'slack' ? [slack[row.sender]].filter(Boolean) : [];
    for (const display of displays) {
      const name = participantName(display);
      if (name && !exclude.has(name)) day.participants.add(name);
    }
  }
  for (const day of byDay.values()) day.participants = [...day.participants].sort();
  return byDay;
}
const ascii = term => /^[\x20-\x7e]+$/u.test(term);
const escape = term => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
function contains(text, term) {
  if (!ascii(term)) return text.includes(term);
  return new RegExp(`(?<![A-Za-z0-9])${escape(term)}(?![A-Za-z0-9])`, 'iu').test(text);
}
/**
 * fields: [{field:'transcript'|'recording_title', text}]. Returns the explainable
 * reason ({rule, written_sources_that_day, matches:[{kind, term, field}]}) or null.
 */
export function matchSameDay(dayContext, fields) {
  if (!dayContext || dayContext.written < 1) return null;
  const matches = [];
  for (const { field, text } of fields) {
    const value = nfc(text);
    if (!value) continue;
    for (const term of dayContext.terms) if (contains(value, term)) matches.push({ kind: 'project_term', term, field });
    for (const name of dayContext.participants) if (value.includes(name)) matches.push({ kind: 'participant', term: name, field });
  }
  if (!matches.length) return null;
  const seen = new Set();
  return { rule: SAME_DAY_RULE, written_sources_that_day: dayContext.written,
    matches: matches.filter(match => { const key = `${match.kind}\u0000${match.term}\u0000${match.field}`;
      if (seen.has(key)) return false; seen.add(key); return true; }) };
}
/** A card segment the rule may consider: verified card, no candidate, no other-project mention. */
export function sameDayEligible(card, segment) {
  return card?.verified === true && Array.isArray(segment?.project_candidates) && segment.project_candidates.length === 0
    && (!Array.isArray(segment.other_project_mentions) || segment.other_project_mentions.length === 0);
}
