// The swappable rule module behind VOICE_RECORDING_LIBRARY_V0.md's
// "2026-09-20 운영 방침" section: what a conversation-list card segment becomes
// once the reconcile harness (`harness/estate_voice_card_reconcile.mjs`) has
// looked for corroboration in mail and Linear records from the same day
// window (the target day plus one day either side). This module does no I/O
// and calls no model -- it only classifies what the caller already found.
//
// Four outcomes, in the order this module checks them:
//   skip         the segment's nature is not `project_work` or `team_operations`
//                (includes `unreadable`), or the segment itself could not be read.
//   exception    either (a) two of the card's own project candidates are both
//                `strong` for two different projects -- a conflict this module
//                does not resolve (VOICE_RECORDING_LIBRARY_V0.md §승인된 목표
//                처리선 item 10, `reason: 'strong_conflict'`), checked before
//                anything else so a conflict is never quietly resolved by
//                picking whichever candidate happened to be strong "enough"; or
//                (b) weak/absent candidates, no corroboration, and the segment's
//                title or description names a risk marker (a decision, a
//                deadline, an amount, an external commitment).
//   provisional  exactly one candidate is `strong` (no conflict), OR the
//                candidates are weak/absent but an independent mail or Linear
//                record from the same day window corroborates one of them.
//   candidate    weak/absent candidates, no corroboration, no risk marker.
//
// `classifyAttribution` never decides `confirmed` -- that stays a person's word,
// written only through `harness/voice_route_cli.mjs confirm`. It also never
// reads a transcript: everything it looks at is the card's own derived title,
// description, nature and project candidates, plus a corroboration verdict the
// caller already computed with `mailCorroborates`/`linearCorroborates` below,
// which look at mail and Linear records from the target day plus one day
// either side, never only the target day itself.
//
// If this file's rules change, this file and the VOICE_RECORDING_LIBRARY_V0.md
// section it implements are the only two places that change
// (DOCUMENT_OWNERSHIP's "교체 알고리즘" ownership).

export const VOICE_ATTRIBUTION_POLICY_VERSION = 'v0';

// A conversation's card is corroborated as soon as one independent source backs
// it up; this is not a vote, so the threshold is not raised by more agreement.
export const MIN_CORROBORATION = 1;

// Substring markers, matched case-sensitively against the segment's own title
// and description (never the transcript). Callers that want a sharper or
// broader list pass their own `markers` argument to
// `hasRiskMarker`/`matchedRiskMarkers` rather than editing the segment text.
//
// A bare '원' is deliberately not in this list: it is the last syllable of
// many ordinary words that have nothing to do with money (지원, 원본, 직원,
// 원인). Money is instead matched by `MONEY_PATTERN` below, which requires a
// digit immediately before the unit -- "500,000원"/"5,000 만원" is a risk
// marker, "지원"/"원본" and "3 원본" (a digit merely nearby, not adjacent) are
// not.
export const RISK_MARKERS = Object.freeze(['결정', '확정', '마감', '기한', '납기', '금액', '발주',
  '계약', '회신', '약속', '제출']);

// A digit run (with optional thousands separators and one decimal part)
// immediately followed by a currency unit -- '만원' may have one space
// between '만' and '원', and one more before '만' itself ("5,000 만원"), but a
// bare '원' or '억' must sit directly against the last digit. That last rule
// is what keeps a list number or a sentence that merely happens to have a
// digit nearby from matching: "1. 원인" has a digit and a '원' in the same
// sentence, but not a digit immediately before it, so it does not match, and
// neither does "3 원본" or "0.1.7" or "10월 12일". Checked in addition to
// `RISK_MARKERS`, never in place of it, by both `hasRiskMarker` and
// `matchedRiskMarkers` -- it is not itself a member of `RISK_MARKERS` since it
// is a pattern, not a literal substring. Not global: a shared global regex's
// `lastIndex` is exactly the kind of hidden state a caller could trip over by
// reusing it, so `matchedRiskMarkers` builds its own global copy to collect
// every amount in one text rather than only the first.
export const MONEY_PATTERN = /\d[\d,]*(?:\.\d+)?(?:\s?만\s?원|억|원)/u;

// The two natures the 2026-09-20 policy ever attributes. Everything else --
// `idea`, `personal`/`daily`, `mixed`, `unreadable`, or an unknown value -- is
// skipped rather than guessed at.
const ATTRIBUTABLE_NATURES = Object.freeze(['project_work', 'team_operations']);

// Tokens dropped from `distinctiveTerms` even though they clear the length
// floor: common connective, time and generic-work words that would otherwise
// make two unrelated records look linked (a mail about a completely different
// project's "시험 일정" shares nothing with a card segment's "시험 일정" beyond
// the fact that both are about doing some project's work). Short on purpose --
// this is not a stoplist for natural-language search, only for "is this the
// same one word" corroboration.
export const GENERIC_TERMS = Object.freeze(['그리고', '그런데', '그래서', '오늘', '내일', '어제', '지금',
  '저희', '우리', '합니다', '했습니다', '있습니다', '됩니다', '부탁드립니다', '감사합니다',
  '시험', '회의', '검토', '일정', '자료', '확인', '보고', '계획', '진행', '준비', '데이터']);

const glyphs = value => [...String(value ?? '')];

/** Whether `text` contains any of `markers` (default `RISK_MARKERS`) as a plain substring, or a `MONEY_PATTERN` match. */
export function hasRiskMarker(text, markers = RISK_MARKERS) {
  const value = String(text ?? '');
  return markers.some(marker => value.includes(marker)) || MONEY_PATTERN.test(value);
}

/**
 * Every marker in `markers` (default `RISK_MARKERS`) that actually occurs in
 * `text`, in list order, followed by every `MONEY_PATTERN` amount found (each
 * trimmed), in the order they occur -- "500,000원과 50만원" reports both.
 */
export function matchedRiskMarkers(text, markers = RISK_MARKERS) {
  const value = String(text ?? '');
  const hits = markers.filter(marker => value.includes(marker));
  const moneyPatternGlobal = new RegExp(MONEY_PATTERN.source, `${MONEY_PATTERN.flags}g`);
  const money = [...value.matchAll(moneyPatternGlobal)].map(match => match[0].trim());
  return [...hits, ...money];
}

/**
 * `text` split into lowercased tokens of two or more code points, on anything
 * that is not a letter, digit or Hangul syllable, with `GENERIC_TERMS` and
 * pure-digit tokens dropped and duplicates collapsed.
 *
 * This is the one notion of "the same distinctive word" every corroboration
 * check below shares: a title and a card segment "share a distinctive term"
 * exactly when this function's output for each has a member in common.
 */
// Lowercased tokens of two or more code points, split the same way
// `distinctiveTerms` splits, but keeping a purely-numeric token: a project
// code's own number segment (`049` in `P24-049`) has to survive here so
// `projectAliasTerms` can recognise and drop it, even though such a token is
// never distinctive enough to stand as a corroboration term on its own.
function rawTokens(text) {
  const value = String(text ?? '').toLowerCase();
  const tokens = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.filter(token => glyphs(token).length >= 2 && !GENERIC_TERMS.includes(token));
}

export function distinctiveTerms(text) {
  return [...new Set(rawTokens(text).filter(token => !/^\d+$/u.test(token)))];
}

/**
 * The alias terms a project's Linear project name(s) contribute: every
 * distinctive token of `projectName` other than the project code's own
 * tokens. A name like "P24-049 SAS 처리장치 (저주파 SAS)" yields
 * `['sas', '처리장치', '저주파']` for code `P24-049` -- `p24` is dropped because
 * it is one of the code's own tokens, `049` was already dropped by
 * `distinctiveTerms` as purely numeric, and `sas` is kept because it is
 * neither.
 */
export function projectAliasTerms(projectName, code = null) {
  const codeTokens = new Set(code === null ? [] : rawTokens(code));
  return distinctiveTerms(projectName).filter(term => !codeTokens.has(term));
}

// Whether `code` appears in `text` as a standalone token -- neither neighbour
// of the match continues an identifier character. Mirrors
// `harness/estate_inventory.mjs`'s `mailCodesIn` boundary rule rather than
// importing it: `projectAliasTerms` deliberately strips a project code's own
// tokens out of its alias-term list (a code is not a "word" a project is
// known by), so a mail that names the code verbatim -- "P24-049 관련" -- needs
// this separate, exact check to corroborate at all.
function codeAppearsIn(text, code) {
  if (typeof code !== 'string' || code === '') return false;
  const value = String(text ?? '');
  const boundary = ch => ch === '' || !/[0-9A-Za-z-]/u.test(ch);
  const pieces = value.split(code);
  return pieces.length > 1 && pieces.slice(0, -1)
    .some((piece, index) => boundary(piece.slice(-1)) && boundary(pieces[index + 1].slice(0, 1)));
}

/**
 * Whether a mail event corroborates a project: `code` (the project code, e.g.
 * `P24-049`) appears verbatim as a standalone token in the subject or the
 * flattened sender text, OR one of `aliasTerms` appears in either (matched
 * case-insensitively, unlike the code check). The sender text is whatever the
 * caller already flattened (display name and/or address); this function reads
 * no mail body and takes none.
 */
export function mailCorroborates({ subject, fromDisplay } = {}, aliasTerms = [], code = null) {
  const subjectValue = String(subject ?? '');
  const fromValue = String(fromDisplay ?? '');
  if (codeAppearsIn(subjectValue, code) || codeAppearsIn(fromValue, code)) return true;
  if (!Array.isArray(aliasTerms) || aliasTerms.length === 0) return false;
  const subjectLower = subjectValue.toLowerCase();
  const fromLower = fromValue.toLowerCase();
  return aliasTerms.some(term => subjectLower.includes(term) || fromLower.includes(term));
}

/**
 * Whether a Linear issue corroborates a segment: its title and the segment's
 * own title/description text share at least two distinct distinctive terms,
 * or share exactly one that is also one of the project's own `aliasTerms`. A
 * single ordinary shared word ("시스템", or any word `GENERIC_TERMS` missed) is
 * cheap to get by coincidence across two unrelated records; a shared word the
 * project is actually known by is not. The project match itself (is this
 * issue even that project's) is the caller's job -- this function only asks
 * whether the words line up once the caller has already narrowed to one
 * project's issues.
 */
export function linearCorroborates({ title } = {}, segmentText, aliasTerms = []) {
  const issueTerms = new Set(distinctiveTerms(title));
  if (issueTerms.size === 0) return false;
  const shared = distinctiveTerms(segmentText).filter(term => issueTerms.has(term));
  if (shared.length >= 2) return true;
  return shared.length === 1 && Array.isArray(aliasTerms) && aliasTerms.includes(shared[0]);
}

/** Whether `segment` is the shape this module can classify at all. */
function isReadableSegment(segment) {
  return segment !== null && typeof segment === 'object' && typeof segment.nature === 'string';
}

/**
 * One segment's classification, given a corroboration verdict the caller
 * already computed for it (`{ corroborated, refs }`, `refs` naming the
 * independent sources that agreed -- a `mail:<event_id>` or
 * `linear:<identifier>` string each). `corroboration` may be omitted or `null`
 * for a segment with nothing to corroborate against (no project candidate at
 * all); that reads the same as "not corroborated".
 *
 * Returns `{ classification, reason, policy_version, risk_markers }`.
 * `risk_markers` is only ever non-empty for `exception`.
 */
export function classifyAttribution(segment, corroboration = null) {
  const base = { policy_version: VOICE_ATTRIBUTION_POLICY_VERSION };
  if (!isReadableSegment(segment)) {
    return { ...base, classification: 'skip', reason: 'segment_unreadable', risk_markers: [] };
  }
  if (!ATTRIBUTABLE_NATURES.includes(segment.nature)) {
    return { ...base, classification: 'skip',
      reason: segment.nature === 'unreadable' ? 'nature_unreadable' : 'nature_not_project_or_team',
      risk_markers: [] };
  }
  const candidates = Array.isArray(segment.project_candidates) ? segment.project_candidates : [];
  // A malformed row with no real `project_code` is excluded here rather than
  // counted: two such rows must not collapse into "one strong candidate" by
  // both mapping to `undefined`, and one paired with a real strong code must
  // not manufacture a conflict between a project and nothing.
  const strongCodes = new Set(candidates
    .filter(row => row?.strength === 'strong' && typeof row.project_code === 'string' && row.project_code !== '')
    .map(row => row.project_code));
  // Two different projects both marked strong is not "extra confident", it is
  // a disagreement this module has no basis to break -- so it is the very
  // first thing checked, ahead of corroboration and ahead of the single-strong
  // case, rather than silently resolved by whichever candidate the caller
  // happened to list first.
  if (strongCodes.size >= 2) return { ...base, classification: 'exception', reason: 'strong_conflict', risk_markers: [] };
  const corroborated = corroboration !== null && corroboration !== undefined
    && corroboration.corroborated === true
    && Array.isArray(corroboration.refs) && corroboration.refs.length >= MIN_CORROBORATION;
  if (strongCodes.size === 1) return { ...base, classification: 'provisional', reason: 'strong_candidate', risk_markers: [] };
  if (corroborated) return { ...base, classification: 'provisional', reason: 'corroborated', risk_markers: [] };
  const text = `${segment.title ?? ''}\n${segment.description ?? ''}`;
  const risks = matchedRiskMarkers(text);
  if (risks.length > 0) {
    return { ...base, classification: 'exception', reason: 'risk_marker_without_corroboration', risk_markers: risks };
  }
  return { ...base, classification: 'candidate', reason: 'weak_or_unclassified_no_risk', risk_markers: [] };
}
