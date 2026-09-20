// The swappable rule module behind VOICE_RECORDING_LIBRARY_V0.md's
// "2026-09-20 운영 방침" section: what a conversation-list card segment becomes
// once the reconcile harness (`harness/estate_voice_card_reconcile.mjs`) has
// looked for corroboration in mail and Linear records from the same day
// window (the target day plus one day either side). This module does no I/O
// and calls no model -- it only classifies what the caller already found.
//
// v1 (Step 3, "판정 규칙 v1 + 중요 내용·답변 소비 최소 경계"): the check order below
// replaces v0's. Still exactly four classifications --
// `provisional`/`candidate`/`exception`/`skip` -- v1 widens *when* `exception`
// is reached and adds a content-verification gate before `provisional`; it
// does not add a fifth outcome. "Stale" input is not a classification either:
// it rides alongside as `result.input`.
//
// classifyAttribution's check order, in full:
//   1. input validity. A segment this module cannot even read (`null`, not an
//      object, no `nature` string) classifies `skip`/`segment_unreadable` and
//      `input.valid` is `false`. A segment this module CAN read, but the
//      caller knows is stale -- Step 2's `staleReasonFor` (a re-transcribed
//      or reconfigured run) or its own `import`-time `identity_changed` (a
//      regenerated card reusing a segment_id for a different stretch of the
//      recording) -- is still run through every rule below (the caller may
//      want "what would this be" even for a stale row), but `input.valid` is
//      `false` and `input.reason` names why. The reconcile harness must not
//      write anything for an input-invalid segment: it already skipped
//      `identity_changed` rows before this module existed, and now reads
//      `result.input.valid` instead of checking `identity_changed` itself, so
//      any future stale reason is covered by the same one rule.
//   2. human decisions. This module is never even called for a segment a
//      person already confirmed -- the reconcile harness reads the ledger and
//      skips a confirmed segment_id before calling this at all. A project a
//      person withdrew from this exact segment is filtered out of
//      `project_candidates` before this module ever sees it (the caller
//      downgrades a withdrawn project's card-declared `strength: 'strong'` to
//      `weak`) -- this module has no concept of "withdrawn" and never will;
//      it is not a fifth check, and this is the one place in this header that
//      names it, so the caller's own filtering is not merely an
//      implementation detail left undocumented.
//   3. 업무성 (attributability by nature and quality), checked ahead of any
//      candidate-based rule so a segment this module cannot trust to read is
//      never judged on its candidates at all:
//        - `nature === 'unreadable'`, or a quality flag saying the same
//          (`quality.marks` includes `'unreadable_ratio'`, or
//          `quality.unreadable_ratio >= 0.7`, the same threshold
//          `voice_conversation_list.mjs`'s own pipeline uses) -- `candidate`,
//          `needs_recovery`. NOT `skip`: a poorly-heard recording is exactly
//          the kind of thing that needs a stronger re-transcription pass, not
//          silence.
//        - `nature === 'mixed'` -- `exception`/`needs_split` when the segment
//          carries any risk marker or names two or more project candidates
//          (both are signs the boundary step should have cut this into more
//          than one conversation); otherwise `candidate`/`mixed_unsplit`.
//        - `project_work`/`team_operations` -- proceeds to steps 4-7.
//        - anything else (`idea`, `daily`, `undetermined`, an unknown value)
//          -- `skip`/`nature_not_project_or_team`, UNLESS the text carries a
//          commitment/request marker (widened `RISK_MARKERS`, plus a bare
//          '요청'), in which case `candidate`/`work_signal_outside_project_nature`
//          -- a real ask or promise inside an "idea" or "daily" segment is
//          never silently dropped just because the pipeline's own nature
//          guess was casual.
//   4. exceptions first, among `project_work`/`team_operations` segments only:
//        - two of the card's own candidates both `strong` for different
//          projects -- `exception`/`strong_conflict` (unchanged from v0): a
//          conflict this module does not resolve.
//        - no candidate at all, and the text names an identifier-shaped token
//          (`IDENTIFIER_LIKE`, the same shape
//          `harness/estate_shared_terms.mjs` uses) that matches none of the
//          caller's `registeredProjectCodes` -- `exception`/`new_project_candidate`.
//          A hyphenated code-like token nothing here has ever seen is a
//          signal a new project may need creating, not a guess this module
//          should make on its own.
//        - no candidate at all, a risk marker present, and not one
//          distinctive word (`distinctiveTerms`) anywhere in the text once
//          the risk marker's own matched text is excluded (a bare "결정" is
//          not itself an organisation/person/equipment term) --
//          `exception`/`missing_context`. This module has no named-entity
//          recognition, so "no organisation/person/equipment term" is
//          approximated as "no distinctive word besides the marker itself";
//          a segment that names anything specific alongside its risk marker
//          instead falls through to steps 5-7 as usual. Known, documented gap
//          (not silently
//          dropped): a customer/organisation NAME as the sole distinguishing
//          signal (rather than a hyphenated identifier) is not separately
//          detected here -- that needs a term registry this pure, I/O-free
//          module does not have, and an invented heuristic for it risks
//          flagging routine phrasing as a "new" party. Left for a future
//          decision, not guessed at.
//   5. content verification gate (the point of Step 3): before a *unique*
//      strong candidate (no conflict, survived step 4) is ever handed back as
//      `provisional`, the card's own stated dates and amounts (title +
//      description; `extractDates`/`extractAmounts`) are compared against
//      `transcriptText` -- the segment's own utterance-window text, supplied
//      by the caller (read-only; this module still never reads a transcript
//      itself). A card-stated date or amount that does not appear
//      (normalised: whitespace/commas stripped) anywhere in that window's own
//      text is `exception`/`content_mismatch`, with every mismatching value
//      named in `content_mismatches`. `transcriptText === null` (nothing to
//      compare against) never manufactures a mismatch -- it answers
//      `content_check: 'unverified'`, an honest "not checked", never a claim
//      of verification.
//   6. unique strong, unresolved by nothing above -- `provisional`/
//      `strong_candidate`, carrying whatever `content_check` step 5 computed
//      (`'confirmed'` or `'unverified'`; `'mismatch'` already exited at
//      step 5).
//   7. everything else is weak/unclassified. Corroboration (an independent
//      mail or Linear record from the ±1-day window; still computed by the
//      caller and handed in as `corroboration`) never promotes a segment to
//      `provisional` here -- v0 did that, v1 does not. It is only ever
//      surfaced as `result.cues` (the same ref strings, e.g. `mail:evt-1`),
//      which the reconcile harness still writes into the ledger candidate's
//      `basis`/`evidence_refs` as a cue for whoever reads it later, never as
//      a reason this module promoted anything. A risk marker present here is
//      still an open, unresolved question -- `exception` -- but the reason
//      names whether the marker itself reads as a present, live one
//      (`important_and_unresolved`) or as conditional ("만약 …면", "…되면"),
//      reported/quoted speech ("…다고 말했다"), negated/prohibited ("하지 마",
//      "하지 않"), or still pending ("아직 …") -- `conditional_or_reported`,
//      with the specific tag in `result.modality`. Neither reading is a
//      present decision, so neither is silently treated as one; the morning
//      question can say "조건부/인용" instead of "결정" because this module
//      already said so. No risk marker at all -- `candidate`/
//      `weak_or_unclassified_no_risk`.
//
// If this file's rules change, this file and the VOICE_RECORDING_LIBRARY_V0.md
// section it implements are the only two places that change
// (DOCUMENT_OWNERSHIP's "교체 알고리즘" ownership).

export const VOICE_ATTRIBUTION_POLICY_VERSION = 'v1';

// A conversation's card is corroborated as soon as one independent source backs
// it up; this is not a vote, so the threshold is not raised by more agreement.
// v1: still computed, only ever surfaces as `cues` -- see step 7 above.
export const MIN_CORROBORATION = 1;

// Substring markers, matched case-sensitively against the segment's own title
// and description (never the transcript). Callers that want a sharper or
// broader list pass their own `markers` argument to
// `hasRiskMarker`/`matchedRiskMarkers` rather than editing the segment text.
//
// A bare '원' is deliberately not in this list: it is the last syllable of
// many ordinary words that have nothing to do with money (지원, 원본, 직원,
// 원인). Money is instead matched by `MONEY_PATTERN` below.
//
// A bare '회신' is deliberately not in this list either: "회신 감사합니다"
// (thanking someone *for* a reply already received) is not a pending request
// for one. Only a request/deadline form counts -- '회신 요청', '회신 바랍'(니다),
// '회신해 주'(세요), '회신 부탁'(드립니다), or a deadline stated as '...까지 회신'
// (any other date/day '...까지' form is caught by `DEADLINE_PATTERN` below,
// not this list).
//
// v1 additions ('미완료', '완료되지 않'): CE-26's known miss -- an incomplete-
// status report ("아직 완료되지 않았습니다") is a work signal even with no
// deadline or money word in it. v0 left this "for a rule-v1 decision"; this
// module now is that decision.
export const RISK_MARKERS = Object.freeze(['결정', '확정', '마감', '기한', '납기', '금액', '발주',
  '계약', '회신 요청', '회신 바랍', '회신해 주', '회신 부탁', '까지 회신', '약속', '제출',
  '미완료', '완료되지 않']);

// A digit run (with optional thousands separators and one decimal part)
// immediately followed by a currency unit, with two guards:
//   - a bare '원' or '억' must sit directly against the last digit UNLESS the
//     number is large enough to plausibly be an amount on its own (4+ plain
//     digits, or thousands-comma-grouped), in which case exactly one space is
//     also allowed -- "5000원"/"5,000원" and now "5000 원"/"5,000 원" all
//     match, but "3 원본"/"1 원문" (a short, unspaced-in-writing number) do
//     not, because a short number followed by a space is far more often a
//     list index or a stray digit than an amount written with a space before
//     its unit.
//   - the unit must not be followed immediately by another Hangul syllable:
//     "3원소"/"원인"/"원본" is a different word starting with or containing
//     '원', not an amount followed by more text. Known trade-off, not a bug:
//     a real amount directly against a following particle with no space or
//     punctuation ("500,000원과", "50만원이") is now also a miss. Real
//     Korean writing usually puts a space or punctuation after an amount
//     before continuing the sentence ("500,000원, ...", "500,000원 지출"),
//     which still matches; the tighter case is left for a future decision.
// Checked in addition to `RISK_MARKERS`, never in place of it, by both
// `hasRiskMarker` and `matchedRiskMarkers` -- it is not itself a member of
// `RISK_MARKERS` since it is a pattern, not a literal substring. Not global: a
// shared global regex's `lastIndex` is exactly the kind of hidden state a
// caller could trip over by reusing it, so `matchedRiskMarkers` builds its
// own global copy to collect every amount in one text rather than only the
// first.
export const MONEY_PATTERN =
  /\d[\d,]*(?:\.\d+)?(?:\s?만\s?원|억)(?![가-힣])|\d[\d,]*(?:\.\d+)?원(?![가-힣])|(?:\d{4,}|\d{1,3}(?:,\d{3})+)(?:\.\d+)?\s원(?![가-힣])/u;

// v1: "내일까지 보내 주세요" was CE-26's other known miss -- a deadline stated
// as "<relative day/date>까지", never using '회신'/'답장' at all. Anchored to
// a concrete day word (today/tomorrow/a weekday/a week reference/a calendar
// date) immediately before '까지', not a bare '까지' on its own -- "여기까지
// 왔다"/"이까지" are not deadlines, and a bare '까지' would catch far too much
// ordinary text. Checked in addition to `RISK_MARKERS`, the same way
// `MONEY_PATTERN` is, by both `hasRiskMarker` and `matchedRiskMarkers`.
export const DEADLINE_PATTERN =
  /(?:오늘|내일|모레|월요일|화요일|수요일|목요일|금요일|토요일|일요일|이번\s?주|다음\s?주|\d{1,2}\s?월\s?\d{1,2}\s?일|\d{1,2}\s?일)\s?까지/u;

// The two natures the 2026-09-20 policy ever attributes without further
// question. `mixed` and `unreadable` are each their own branch (step 3
// above); everything else falls to the idea/daily/other branch.
const ATTRIBUTABLE_NATURES = Object.freeze(['project_work', 'team_operations']);

// Step 3's idea/daily/other fallback: `RISK_MARKERS` plus a bare '요청'
// (unlike the main risk-marker check, a bare request word is a reasonable
// enough signal here that something in a casually-natured segment might
// actually be project work worth not dropping).
const COMMITMENT_MARKERS = Object.freeze([...RISK_MARKERS, '요청']);

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

/** Whether `text` contains any of `markers` (default `RISK_MARKERS`) as a plain substring, a `MONEY_PATTERN` match, or a `DEADLINE_PATTERN` match. */
export function hasRiskMarker(text, markers = RISK_MARKERS) {
  const value = String(text ?? '');
  return markers.some(marker => value.includes(marker)) || MONEY_PATTERN.test(value) || DEADLINE_PATTERN.test(value);
}

/**
 * Every marker in `markers` (default `RISK_MARKERS`) that actually occurs in
 * `text`, in list order, followed by every `MONEY_PATTERN` amount and every
 * `DEADLINE_PATTERN` deadline found (each trimmed), in the order they occur.
 */
export function matchedRiskMarkers(text, markers = RISK_MARKERS) {
  const value = String(text ?? '');
  const hits = markers.filter(marker => value.includes(marker));
  const moneyPatternGlobal = new RegExp(MONEY_PATTERN.source, `${MONEY_PATTERN.flags}g`);
  const money = [...value.matchAll(moneyPatternGlobal)].map(match => match[0].trim());
  const deadlinePatternGlobal = new RegExp(DEADLINE_PATTERN.source, `${DEADLINE_PATTERN.flags}g`);
  const deadlines = [...value.matchAll(deadlinePatternGlobal)].map(match => match[0].trim());
  return [...hits, ...money, ...deadlines];
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

// -------------------------------------------------------------------- v1
// The same identifier shape `harness/estate_shared_terms.mjs`'s `IDENTIFIER`
// uses to recognise a project-code-like token (a letter start, at least one
// digit somewhere, one or more hyphenated segments) -- duplicated rather than
// imported: that module does file I/O and reads a term registry, neither of
// which belongs in this pure, I/O-free classifier.
const IDENTIFIER_LIKE = /^(?=.*\d)[A-Za-z][0-9A-Za-z]*(?:-[0-9A-Za-z]+)+$/u;

/** Every identifier-shaped token in `text` (case preserved, deduplicated). */
function identifierLikeTokens(text) {
  const value = String(text ?? '');
  const tokens = value.match(/[A-Za-z0-9][A-Za-z0-9-]*/gu) ?? [];
  return [...new Set(tokens.filter(token => IDENTIFIER_LIKE.test(token)))];
}

// Card-declared dates this module can extract and compare against a
// transcript window (the content-check gate, step 5): Korean month-day, ISO
// date, and a relative-week reference. Not a general date parser -- three
// concrete, checkable forms.
const DATE_TOKEN_PATTERN = /\d{1,2}\s?월\s?\d{1,2}\s?일|\d{4}-\d{2}-\d{2}|(?:다음|이번|지난)\s?주/gu;

const normalizeForCompare = value => String(value ?? '').replace(/[\s,]+/gu, '');

/** Every date-like token `DATE_TOKEN_PATTERN` finds in `text`, trimmed and deduplicated, in order. */
export function extractDates(text) {
  const value = String(text ?? '');
  return [...new Set([...value.matchAll(DATE_TOKEN_PATTERN)].map(match => match[0].trim()))];
}

/** Every `MONEY_PATTERN` amount in `text`, trimmed and deduplicated, in order. */
export function extractAmounts(text) {
  const value = String(text ?? '');
  const moneyPatternGlobal = new RegExp(MONEY_PATTERN.source, `${MONEY_PATTERN.flags}g`);
  return [...new Set([...value.matchAll(moneyPatternGlobal)].map(match => match[0].trim()))];
}

/**
 * Compares `cardText`'s own stated dates and amounts against `transcriptText`
 * (the segment's own utterance-window text, read-only, supplied by the
 * caller -- this module never reads a transcript itself). `transcriptText`
 * being `null`/`undefined` (the caller had none to give, or chose not to
 * look) answers `'unverified'`, not `'confirmed'` -- an honest state, not a
 * claim this module checked something it did not. A date or amount the card
 * states that does not appear (normalised: whitespace and commas stripped)
 * anywhere in the transcript text answers `'mismatch'`, with every
 * mismatching value named in `mismatches`. This is a literal string-
 * containment check against the given window's own text -- not audio, not an
 * independent record, and not any other project's own similar wording.
 */
export function contentCheck({ cardText, transcriptText } = {}) {
  if (transcriptText === null || transcriptText === undefined) return { status: 'unverified', mismatches: [] };
  const normalizedTranscript = normalizeForCompare(transcriptText);
  const mismatches = [];
  for (const date of extractDates(cardText)) {
    if (!normalizedTranscript.includes(normalizeForCompare(date))) mismatches.push({ kind: 'date', value: date });
  }
  for (const amount of extractAmounts(cardText)) {
    if (!normalizedTranscript.includes(normalizeForCompare(amount))) mismatches.push({ kind: 'amount', value: amount });
  }
  return { status: mismatches.length > 0 ? 'mismatch' : 'confirmed', mismatches };
}

// Step 7's modality tags, checked in this order (first match wins) -- coarse,
// whole-segment-text substring matches, the same style every other marker in
// this module uses, not a per-marker anchor to exactly which risk marker sits
// inside the conditional/quote/negation. A false modality tag only changes
// which of two exception reasons is reported (see step 7 above), never
// whether the segment is `exception` at all, so this coarseness costs a
// wrong Korean phrasing in the morning question at worst, never a wrong
// classification.
const CONDITIONAL_MARKERS = Object.freeze(['만약', '한다면', '된다면', '하면', '되면', '라면']);
const REPORTED_MARKERS = Object.freeze(['다고 말했', '다고 했다', '라고 말했', '라고 했다', '다고 전했', '라고 전했']);
const NEGATED_MARKERS = Object.freeze(['하지 마', '하지 않', '안 함', '안함']);
const PENDING_MARKERS = Object.freeze(['아직']);

/**
 * `'conditional'` (a hypothetical: "만약 …면", "…되면"), `'reported'` (quoted
 * or past-reported speech: "…다고 말했다"), `'negated'` (a prohibition or plain
 * negation: "하지 마", "하지 않"), `'pending'` (a still-incomplete state:
 * "아직 …"), or `null` if `text` carries none of these. None of these read as
 * a present, live decision or order -- see step 7 above.
 */
export function detectModality(text) {
  const value = String(text ?? '');
  if (CONDITIONAL_MARKERS.some(marker => value.includes(marker))) return 'conditional';
  if (REPORTED_MARKERS.some(marker => value.includes(marker))) return 'reported';
  if (NEGATED_MARKERS.some(marker => value.includes(marker))) return 'negated';
  if (PENDING_MARKERS.some(marker => value.includes(marker))) return 'pending';
  return null;
}

// The same 0.7 ratio `voice_conversation_list.mjs`'s own pipeline uses to
// force a segment's nature to `unreadable` in the first place -- duplicated
// as a documented, deliberate threshold rather than imported, since that
// module is the harness-layer pipeline, not something this pure classifier
// depends on.
const UNREADABLE_RATIO_THRESHOLD = 0.7;

function isUnreadableQuality(segment) {
  if (segment.nature === 'unreadable') return true;
  const quality = segment.quality;
  if (quality === null || typeof quality !== 'object') return false;
  if (Array.isArray(quality.marks) && quality.marks.includes('unreadable_ratio')) return true;
  return typeof quality.unreadable_ratio === 'number' && quality.unreadable_ratio >= UNREADABLE_RATIO_THRESHOLD;
}

/** Whether `segment` is the shape this module can classify at all. */
function isReadableSegment(segment) {
  return segment !== null && typeof segment === 'object' && typeof segment.nature === 'string';
}

const asCodeSet = value => (value instanceof Set ? value : new Set(Array.isArray(value) ? value : []));

/**
 * One segment's classification, given a corroboration verdict the caller
 * already computed for it (`{ corroborated, refs }`, `refs` naming the
 * independent sources that agreed -- a `mail:<event_id>` or
 * `linear:<identifier>` string each; may be omitted or `null` for a segment
 * with nothing to corroborate against). `options`:
 *   `staleReason` (string|null) -- Step 2's staleness/identity-change reason
 *     for this exact segment, if the caller has one. Never affects the
 *     computed classification, only `result.input`.
 *   `transcriptText` (string|null) -- the segment's own utterance-window
 *     text, for the content-check gate (step 5). `null`/omitted means "not
 *     supplied", never "checked and empty".
 *   `registeredProjectCodes` (Set<string>|string[]) -- every project code
 *     this estate already knows, for the new-project signal (step 4). Not
 *     supplied reads as "nothing known to be registered" (an empty set), not
 *     "skip this check".
 *
 * Returns `{ classification, reason, policy_version, risk_markers, modality,
 * input, cues, content_check, content_mismatches, new_project_signal }`.
 * `risk_markers` is only ever non-empty when it is the reason (or part of the
 * reason) `exception` was reached.
 */
export function classifyAttribution(segment, corroboration = null, options = {}) {
  const { staleReason = null, transcriptText = null, registeredProjectCodes = new Set() } = options;
  const registeredCodes = asCodeSet(registeredProjectCodes);
  const cues = Array.isArray(corroboration?.refs) ? [...corroboration.refs] : [];
  const emptyFields = { modality: null, cues, content_check: null, content_mismatches: [], new_project_signal: null };

  // Step 1 (structural half): a segment this module cannot even read at all.
  if (!isReadableSegment(segment)) {
    return { policy_version: VOICE_ATTRIBUTION_POLICY_VERSION, classification: 'skip', reason: 'segment_unreadable',
      risk_markers: [], input: { valid: false, reason: 'segment_unreadable' }, ...emptyFields };
  }
  // Step 1 (staleness half): read on, but mark the input invalid for the caller.
  const input = staleReason === null ? { valid: true, reason: null } : { valid: false, reason: staleReason };
  const base = { policy_version: VOICE_ATTRIBUTION_POLICY_VERSION, input, cues };

  // Step 2 (human decisions): confirmed segments never reach this module at
  // all, and a withdrawn project is already filtered out of
  // `project_candidates` by the caller before this call -- both are the
  // caller's job, named here rather than silently assumed. Nothing to do.

  const text = `${segment.title ?? ''}\n${segment.description ?? ''}`;
  const candidates = Array.isArray(segment.project_candidates) ? segment.project_candidates : [];
  // A malformed row with no real `project_code` is excluded here rather than
  // counted: two such rows must not collapse into "one strong candidate" by
  // both mapping to `undefined`, and one paired with a real strong code must
  // not manufacture a conflict between a project and nothing.
  const strongCodes = new Set(candidates
    .filter(row => row?.strength === 'strong' && typeof row.project_code === 'string' && row.project_code !== '')
    .map(row => row.project_code));

  // Step 3: 업무성.
  const modality = detectModality(text);
  if (isUnreadableQuality(segment)) {
    return { ...base, classification: 'candidate', reason: 'needs_recovery', risk_markers: [], ...emptyFields, modality };
  }
  if (segment.nature === 'mixed') {
    const risks = matchedRiskMarkers(text);
    if (risks.length > 0 || candidates.length >= 2) {
      return { ...base, classification: 'exception', reason: 'needs_split', risk_markers: risks, ...emptyFields, modality };
    }
    return { ...base, classification: 'candidate', reason: 'mixed_unsplit', risk_markers: [], ...emptyFields, modality };
  }
  if (!ATTRIBUTABLE_NATURES.includes(segment.nature)) {
    const risks = matchedRiskMarkers(text, COMMITMENT_MARKERS);
    if (risks.length > 0) {
      return { ...base, classification: 'candidate', reason: 'work_signal_outside_project_nature',
        risk_markers: risks, ...emptyFields, modality };
    }
    return { ...base, classification: 'skip', reason: 'nature_not_project_or_team', risk_markers: [], ...emptyFields, modality };
  }

  // Step 4: exceptions first, ahead of any single-candidate answer.
  if (strongCodes.size >= 2) {
    return { ...base, classification: 'exception', reason: 'strong_conflict', risk_markers: [], ...emptyFields, modality };
  }
  if (candidates.length === 0) {
    const identifiers = identifierLikeTokens(text).filter(token => !registeredCodes.has(token));
    if (identifiers.length > 0) {
      return { ...base, classification: 'exception', reason: 'new_project_candidate', risk_markers: [], modality,
        cues, content_check: null, content_mismatches: [], new_project_signal: identifiers[0] };
    }
    const risks = matchedRiskMarkers(text);
    if (risks.length > 0) {
      // The risk marker's own matched text ("결정", the amount digits, ...)
      // is not itself an organisation/person/equipment term -- it has to be
      // excluded before asking whether anything else specific is named,
      // otherwise a bare "결정" would count as its own context and this
      // branch could never fire.
      const riskWordTokens = new Set(distinctiveTerms(risks.join(' ')));
      const context = distinctiveTerms(text).filter(term => !riskWordTokens.has(term));
      if (context.length === 0) {
        return { ...base, classification: 'exception', reason: 'missing_context', risk_markers: risks, ...emptyFields, modality };
      }
    }
  }

  // Step 5: content verification gate, only for a unique strong candidate.
  if (strongCodes.size === 1) {
    const check = contentCheck({ cardText: text, transcriptText });
    if (check.status === 'mismatch') {
      return { ...base, classification: 'exception', reason: 'content_mismatch', risk_markers: [], modality,
        cues, content_check: 'mismatch', content_mismatches: check.mismatches, new_project_signal: null };
    }
    // Step 6.
    return { ...base, classification: 'provisional', reason: 'strong_candidate', risk_markers: [], modality,
      cues, content_check: check.status, content_mismatches: [], new_project_signal: null };
  }

  // Step 7: weak/unclassified. `cues` (corroboration) never promotes.
  const risks = matchedRiskMarkers(text);
  if (risks.length > 0) {
    return { ...base, classification: 'exception',
      reason: modality === null ? 'important_and_unresolved' : 'conditional_or_reported',
      risk_markers: risks, ...emptyFields, modality };
  }
  return { ...base, classification: 'candidate', reason: 'weak_or_unclassified_no_risk', risk_markers: [], ...emptyFields, modality };
}
