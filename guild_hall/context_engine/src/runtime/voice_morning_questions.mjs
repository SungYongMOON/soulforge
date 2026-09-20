// Step 4 of VOICE_RECORDING_LIBRARY_V0.md's "2026-09-20 운영 방침": the
// question-selection half of "예외만 아침에 모아 묻기" -- turning the exception
// pool the reconcile harness has already built (`harness/
// estate_voice_card_reconcile.mjs`'s `exception_review`, across as many past
// receipts as the caller hands in) into the bounded set a morning briefing
// can actually show a person, without ever losing an exception that does not
// fit today.
//
// Pure, no I/O, no model: `selectQuestions` takes the exception pool and the
// question ledger the caller already read, and returns what to present, what
// still waits, and what a fresh review of the same inputs would answer
// identically -- same inputs, same output, every time (`now` and `cap` are
// themselves inputs, never read from a clock or a config file in here; `now`
// is required for exactly that reason -- a default of `new Date()` would
// make this module's own output depend on when it happened to run).
//
// One question groups one or more exception rows that share:
//   - the same `session_id` (never across sessions -- a person's answer
//     about one recording is never assumed to answer for another),
//   - the same reason *family* (`kind`, below) -- `strong_conflict`,
//     `important_and_unresolved`, `missing_context` and `new_project_
//     candidate` are all "who does this belong to" (귀속); `content_
//     mismatch` is "does the card's date/amount actually match" (내용확인);
//     `needs_split` is "does this need to be cut into two" (분할); `
//     conditional_or_reported` is "is this even a present decision yet"
//     (조건확인) -- and
//   - the identical set of project candidate codes.
// Two rows on the same segment with a *different* reason (a segment that is
// both `important_and_unresolved` and, after a re-run, also `content_
// mismatch`) are two separate questions, one per kind -- never merged by
// title or date alone, and never merged across kinds even for the one
// segment they both name.
//
// A question's id is a stable hash of (`kind`, its sorted candidate set, its
// sorted target list) -- never a random id, and never derived from `now` --
// so the same exception pool, read again on the same or a later day,
// produces the exact same id for the exact same group. Candidates are part
// of that hash (R2): two groups that share a session, kind and target set
// but differ only in candidate set are two different questions with two
// different option lists, not one id shared by both. That stability is the
// whole of the "fast loop": the caller looks the id up in the ledger, and an
// already-`answered` question whose targets are unchanged is never re-asked
// (`resolved_by_reuse`), with no search, no index, no model call.
import { createHash } from 'node:crypto';

export const VOICE_MORNING_QUESTIONS_VERSION = 'v0';

// Reason -> question kind (Korean label carried in the output; the family
// name itself is internal grouping vocabulary only).
const REASON_KIND = Object.freeze({
  strong_conflict: '귀속', important_and_unresolved: '귀속', missing_context: '귀속',
  new_project_candidate: '귀속',
  content_mismatch: '내용확인',
  needs_split: '분할',
  conditional_or_reported: '조건확인',
});

// Card text markers a decision cannot wait past the next briefing for --
// the same "deadline/contract/money" vocabulary `voice_attribution_policy.
// mjs`'s own RISK_MARKERS uses for exactly this reason, duplicated as a
// small, explicit literal list rather than imported: this module groups and
// prioritises rows the policy module already classified, it does not
// re-classify anything, and importing the policy module's own marker list
// (built for matching card text) to re-scan `risk_markers` here would be the
// wrong direction of dependency for what is a fixed, short, and unlikely to
// drift vocabulary.
const URGENT_MARKERS = Object.freeze(['납기', '마감', '기한', '계약', '발주', '금액']);

function isReadableExceptionRow(row) {
  return row !== null && typeof row === 'object' && typeof row.session_id === 'string' && row.session_id !== ''
    && typeof row.run_id === 'string' && row.run_id !== ''
    && typeof row.segment_id === 'string' && row.segment_id !== ''
    && typeof row.why === 'string' && Object.hasOwn(REASON_KIND, row.why);
}

// A control-byte field separator, built with `String.fromCharCode` rather
// than written as a literal escape in source -- a literal control character
// typed into an Edit-tool-authored file has landed as a real embedded byte
// before in this codebase (this file's own previous revision did exactly
// that in every key below), which is unreadable in a diff and easy to get
// wrong silently. Built once and reused everywhere a field boundary needs to
// be unambiguous: `"ab"+"c"` must never equal `"a"+"bc"`.
const SEP = String.fromCharCode(31);
const targetKey = target => `${target.session_id}${SEP}${target.run_id}${SEP}${target.segment_id}`;

/**
 * A stable id: `kind`, the sorted candidate set and every target's key,
 * sorted -- never the row order they arrived in, and never `kind` + targets
 * alone (R2, see the header comment above).
 */
export function questionIdFor(kind, targets, candidates = []) {
  const sortedKeys = [...targets].map(targetKey).sort();
  const sortedCandidates = [...new Set(candidates)].sort();
  const hash = createHash('sha256')
    .update(`${kind}${SEP}${sortedCandidates.join(SEP)}${SEP}${sortedKeys.join(SEP)}`)
    .digest('hex');
  return `q_${hash.slice(0, 20)}`;
}

/** Whether `text` (a card title/description) names an urgent marker. */
function hasUrgentMarker(text) {
  const value = String(text ?? '');
  return URGENT_MARKERS.some(marker => value.includes(marker));
}

/**
 * Groups the exception pool by (session_id, kind, candidate set). Rows this
 * module cannot read at all (missing session_id/run_id/segment_id, or a
 * `why` this module has no kind for) are dropped from grouping -- the caller
 * gave a malformed row, not a real exception, and this module does not
 * invent classifications the policy module never made.
 */
function groupExceptions(exceptions) {
  const groups = new Map();
  for (const row of exceptions) {
    if (!isReadableExceptionRow(row)) continue;
    const kind = REASON_KIND[row.why];
    const codes = [...new Set(Array.isArray(row.candidates) ? row.candidates.filter(code => typeof code === 'string') : [])]
      .sort();
    const groupKey = `${row.session_id}${SEP}${kind}${SEP}${codes.join(',')}`;
    let group = groups.get(groupKey);
    if (group === undefined) {
      group = { kind, sessionId: row.session_id, candidates: codes, rows: [], urgent: false };
      groups.set(groupKey, group);
    }
    group.rows.push(row);
    if (row.why === 'content_mismatch' || hasUrgentMarker(row.title) || (row.risk_markers ?? []).some(hasUrgentMarker)) {
      group.urgent = true;
    }
  }
  return [...groups.values()];
}

/** The representative row a group is shown by: the earliest `clock` among its rows (falls back to the first row). */
function representativeRow(group) {
  const withClock = group.rows.filter(row => typeof row.clock === 'string');
  if (withClock.length === 0) return group.rows[0];
  return withClock.slice().sort((a, b) => a.clock.localeCompare(b.clock))[0];
}

/**
 * `{ session_id, run_id, segment_id, receipt_ran_at }` for every distinct
 * target a group's rows name -- deduplicated (two rows can name the same
 * segment across two receipts of the same pass) and sorted, so a group's own
 * target list is itself deterministic.
 */
function targetsFor(group) {
  const byKey = new Map();
  for (const row of group.rows) {
    const target = { session_id: row.session_id, run_id: row.run_id, segment_id: row.segment_id,
      receipt_ran_at: typeof row.receipt_ran_at === 'string' ? row.receipt_ran_at : null };
    byKey.set(targetKey(target), target);
  }
  return [...byKey.values()].sort((a, b) => targetKey(a).localeCompare(targetKey(b)));
}

// Options a person is actually offered, by kind. Attribution offers every
// candidate code plus the two universal outs; the other three kinds have no
// project decision to offer at all -- see `harness/voice_question_cli.mjs`'s
// own header for exactly what each answer choice does.
function optionsFor(kind, candidates) {
  if (kind === '귀속') return [...candidates, '다른 과제', '업무 아님'];
  if (kind === '내용확인') return ['확인됨(맞음)', '불일치(틀림)'];
  if (kind === '분할') return ['분할 필요', '그대로 유지'];
  return ['이제 확정됨', '아직 보류'];
}

/** Whether every one of `targets` appears, unchanged (same run_id), among `question.targets`. */
function coversTargets(question, targets) {
  const covered = new Map(question.targets.map(target => [`${target.session_id}${SEP}${target.segment_id}`, target.run_id]));
  return targets.every(target => covered.get(`${target.session_id}${SEP}${target.segment_id}`) === target.run_id);
}

/** `now` (an ISO instant, required) as a `YYYY-MM-DD` date string in `tz` --
 * `Intl.DateTimeFormat` with the `en-CA` locale formats exactly that shape,
 * so this needs no manual offset arithmetic and stays correct for any IANA
 * zone the caller passes (Asia/Seoul has no DST, but this makes no special
 * case of that). `2026-09-21T14:30:00Z` (23:30 KST) is still `2026-09-21`;
 * `2026-09-21T15:30:00Z` (00:30 KST the next day) is `2026-09-22`. */
export function todayInTz(nowIso, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(nowIso));
}

/**
 * One selection pass. `exceptions` is the whole exception pool the caller
 * assembled (every exception row from however many reconcile receipts it
 * chose to read -- this module never truncates the pool, only what it
 * *presents*). `ledger` is `{ questions: [...] }` as read from the question
 * ledger store (S4-2) -- this module never writes it; the caller persists
 * whatever it decides to do with this result. `now` (an ISO instant) is
 * required, never defaulted from a clock (see the header comment). `cap`
 * (default 10, must be a positive integer -- 0 and negative are refused,
 * not "present nothing") is a ceiling on how many *independent judgements*
 * are shown today, not a quota to fill. `tz` (default Asia/Seoul) is the
 * zone "today" is computed in.
 *
 * Returns `{ presented, carried_over, urgent_overflow, resolved_by_reuse,
 * metrics }`. Every list holds question objects in the same shape a caller
 * would write to the ledger (`question_id`, `kind`, `targets`, `options`,
 * `representative`, `first_seen`, `urgent`, `reopened_from`).
 */
export function selectQuestions({ exceptions = [], ledger = { questions: [] }, now, cap = 10, tz = 'Asia/Seoul' } = {}) {
  if (typeof now !== 'string' || !Number.isFinite(Date.parse(now))) throw new TypeError('voice_morning_questions_now_required');
  if (!Number.isSafeInteger(cap) || cap < 1) throw new TypeError('voice_morning_questions_cap_invalid');
  const today = todayInTz(now, tz);
  const ledgerQuestions = Array.isArray(ledger?.questions) ? ledger.questions : [];
  const byId = new Map(ledgerQuestions.map(question => [question.question_id, question]));
  // For CE-34's reopen link: the most recent settled (answered/withdrawn)
  // question that covered a given (session_id, segment_id, kind) -- so a
  // fresh group whose id differs (a new run_id, or a new candidate set) can
  // still say what it supersedes.
  const settledByTarget = new Map();
  for (const question of ledgerQuestions) {
    if (question.status !== 'answered' && question.status !== 'withdrawn') continue;
    for (const target of question.targets) {
      settledByTarget.set(`${target.session_id}${SEP}${target.segment_id}${SEP}${question.kind}`, question.question_id);
    }
  }

  const groups = groupExceptions(exceptions);
  const resolvedByReuse = [];
  const candidates = [];
  let reopenedCount = 0;

  for (const group of groups) {
    const targets = targetsFor(group);
    const questionId = questionIdFor(group.kind, targets, group.candidates);
    const existing = byId.get(questionId);
    if (existing !== undefined && existing.status === 'answered' && coversTargets(existing, targets)) {
      resolvedByReuse.push(existing);
      continue;
    }
    const rep = representativeRow(group);
    const reopenedFrom = (() => {
      for (const target of targets) {
        const previous = settledByTarget.get(`${target.session_id}${SEP}${target.segment_id}${SEP}${group.kind}`);
        if (previous !== undefined && previous !== questionId) return previous;
      }
      return null;
    })();
    if (reopenedFrom !== null) reopenedCount += 1;
    const firstSeen = existing?.first_seen ?? now;
    candidates.push({ question_id: questionId, kind: group.kind, targets,
      options: optionsFor(group.kind, group.candidates), candidates: group.candidates,
      representative: { time: rep.clock ?? null, title: rep.title ?? null },
      urgent: group.urgent, first_seen: firstSeen, reopened_from: reopenedFrom,
      // Present even when re-derived from an existing (not-yet-answered)
      // ledger row, never inventing a fresh proposal for something already
      // tracked: `existing` here is only ever `proposed`/`presented`/
      // `withdrawn` at this point (an `answered` one already took the
      // `resolvedByReuse` branch above).
      previously_presented_on: existing?.presented_on ?? [] });
  }

  // Priority: urgent before non-urgent; within each, oldest first_seen
  // first. When urgent items alone meet or exceed `cap`, every presented
  // slot goes to urgent (a fresh review's own explicit case: 11 urgent
  // candidates, cap 10, is 10 presented and 1 urgent_overflow, not 9 urgent
  // + 1 reserved non-urgent slot that does not exist in that scenario).
  // When urgent items do not fill the cap, the remaining slots are simply
  // the oldest non-urgent ones next in this same sort -- "reserve 1 slot for
  // the longest-waiting non-urgent" is satisfied by that ordering itself,
  // not a separate carve-out.
  const sorted = candidates.slice().sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (a.first_seen !== b.first_seen) return a.first_seen.localeCompare(b.first_seen);
    return a.question_id.localeCompare(b.question_id);
  });
  const presented = sorted.slice(0, cap).map(question => ({ ...question, presented_on: [...question.previously_presented_on,
    ...(question.previously_presented_on.includes(today) ? [] : [today])] }));
  const overflow = sorted.slice(cap);
  const urgentOverflow = overflow.filter(question => question.urgent);
  const carriedOver = overflow.filter(question => !question.urgent);

  const waitDays = question => Math.max(0, Math.floor((Date.parse(now) - Date.parse(question.first_seen)) / 86400000));
  const oldestWaitDays = candidates.length === 0 ? 0 : Math.max(...candidates.map(waitDays));
  const newToday = candidates.filter(question => question.reopened_from === null
    && (byId.get(question.question_id) === undefined)).length;

  return {
    presented, carried_over: carriedOver, urgent_overflow: urgentOverflow, resolved_by_reuse: resolvedByReuse,
    metrics: { total_unresolved: candidates.length, resolved_by_reuse: resolvedByReuse.length,
      new_today: newToday, presented_today: presented.length, carried_over: carriedOver.length,
      urgent_overflow: urgentOverflow.length, oldest_wait_days: oldestWaitDays, reopened: reopenedCount },
  };
}
