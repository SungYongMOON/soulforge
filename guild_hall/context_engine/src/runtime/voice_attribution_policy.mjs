// The swappable rule module behind VOICE_RECORDING_LIBRARY_V0.md's
// "2026-09-20 운영 방침" section: what a conversation-list card segment becomes
// once the reconcile harness (`harness/estate_voice_card_reconcile.mjs`) has
// looked for same-day corroboration in mail and Linear. This module does no I/O
// and calls no model -- it only classifies what the caller already found.
//
// Four outcomes, in the order this module checks them:
//   skip         the segment's nature is not `project_work` or `team_operations`
//                (includes `unreadable`), or the segment itself could not be read.
//   provisional  the card's own strongest project candidate is `strong`, OR the
//                candidates are weak/absent but an independent same-day mail or
//                Linear record corroborates one of them.
//   exception    weak/absent candidates, no corroboration, and the segment's
//                title or description names a risk marker (a decision, a
//                deadline, an amount, an external commitment).
//   candidate    weak/absent candidates, no corroboration, no risk marker.
//
// `classifyAttribution` never decides `confirmed` -- that stays a person's word,
// written only through `harness/voice_route_cli.mjs confirm`. It also never
// reads a transcript: everything it looks at is the card's own derived title,
// description, nature and project candidates, plus a corroboration verdict the
// caller already computed with `mailCorroborates`/`linearCorroborates` below.
//
// If this file's rules change, this file and the VOICE_RECORDING_LIBRARY_V0.md
// section it implements are the only two places that change
// (DOCUMENT_OWNERSHIP's "교체 알고리즘" ownership).

export const VOICE_ATTRIBUTION_POLICY_VERSION = 'v0';

// A conversation's card is corroborated as soon as one independent source backs
// it up; this is not a vote, so the threshold is not raised by more agreement.
export const MIN_CORROBORATION = 1;

// Substring markers, matched case-sensitively against the segment's own title
// and description (never the transcript). Deliberately blunt: '원' alone matches
// inside many ordinary words, which is the trade this first slice makes in
// favour of not missing an amount. Callers that want a sharper list pass their
// own `markers` argument to `hasRiskMarker`/`matchedRiskMarkers` rather than
// editing the segment text.
export const RISK_MARKERS = Object.freeze(['결정', '확정', '마감', '기한', '납기', '금액', '원', '발주',
  '계약', '회신', '약속', '제출']);

// The two natures the 2026-09-20 policy ever attributes. Everything else --
// `idea`, `personal`/`daily`, `mixed`, `unreadable`, or an unknown value -- is
// skipped rather than guessed at.
const ATTRIBUTABLE_NATURES = Object.freeze(['project_work', 'team_operations']);

// Tokens dropped from `distinctiveTerms` even though they clear the length
// floor: common connective and time words that would otherwise make two
// unrelated records look linked. Short on purpose -- this is not a stoplist for
// natural-language search, only for "is this the same one word" corroboration.
export const GENERIC_TERMS = Object.freeze(['그리고', '그런데', '그래서', '오늘', '내일', '어제', '지금',
  '저희', '우리', '합니다', '했습니다', '있습니다', '됩니다', '부탁드립니다', '감사합니다']);

const glyphs = value => [...String(value ?? '')];

/** Whether `text` contains any of `markers` (default `RISK_MARKERS`) as a plain substring. */
export function hasRiskMarker(text, markers = RISK_MARKERS) {
  const value = String(text ?? '');
  return markers.some(marker => value.includes(marker));
}

/** Every marker in `markers` (default `RISK_MARKERS`) that actually occurs in `text`, in list order. */
export function matchedRiskMarkers(text, markers = RISK_MARKERS) {
  const value = String(text ?? '');
  return markers.filter(marker => value.includes(marker));
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

/**
 * Whether a mail event corroborates a project: one of `aliasTerms` appears in
 * the subject, or in the flattened sender text the caller supplies (display
 * name and/or address, already joined -- this function reads no mail body and
 * takes none).
 */
export function mailCorroborates({ subject, fromDisplay } = {}, aliasTerms = []) {
  if (!Array.isArray(aliasTerms) || aliasTerms.length === 0) return false;
  const subjectValue = String(subject ?? '').toLowerCase();
  const fromValue = String(fromDisplay ?? '').toLowerCase();
  return aliasTerms.some(term => subjectValue.includes(term) || fromValue.includes(term));
}

/**
 * Whether a Linear issue corroborates a segment: its title shares a distinctive
 * term with the segment's own title/description text. The project match itself
 * (is this issue even that project's) is the caller's job -- this function only
 * asks whether the words line up once the caller has already narrowed to one
 * project's issues.
 */
export function linearCorroborates({ title } = {}, segmentText) {
  const issueTerms = distinctiveTerms(title);
  if (issueTerms.length === 0) return false;
  const segmentTerms = new Set(distinctiveTerms(segmentText));
  return issueTerms.some(term => segmentTerms.has(term));
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
  const hasStrong = candidates.some(row => row?.strength === 'strong');
  const corroborated = corroboration !== null && corroboration !== undefined
    && corroboration.corroborated === true
    && Array.isArray(corroboration.refs) && corroboration.refs.length >= MIN_CORROBORATION;
  if (hasStrong) return { ...base, classification: 'provisional', reason: 'strong_candidate', risk_markers: [] };
  if (corroborated) return { ...base, classification: 'provisional', reason: 'corroborated', risk_markers: [] };
  const text = `${segment.title ?? ''}\n${segment.description ?? ''}`;
  const risks = matchedRiskMarkers(text);
  if (risks.length > 0) {
    return { ...base, classification: 'exception', reason: 'risk_marker_without_corroboration', risk_markers: risks };
  }
  return { ...base, classification: 'candidate', reason: 'weak_or_unclassified_no_risk', risk_markers: [] };
}
