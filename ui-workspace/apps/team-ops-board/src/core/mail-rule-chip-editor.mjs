// mail-rule-chip-editor.mjs — pure state and small display helpers for the "메일 분류 키워드"
// panel. No fetch, DOM, or timer: the panel owns the network calls, this module owns the
// literal-chip add/remove/dedupe arithmetic and its bounds, plus the status-badge label/tone
// mapping. Regex terms already on the rule can be removed here but never authored (the UI has
// no regex input). `yields_to` is not editable in this slice — the state only carries the
// rule's existing (already-normalized-to-array) value through unchanged into the draft.

export const MAX_TERMS = 60;
export const MAX_LITERAL_CHARS = 80;
export const MAX_NOTE_CHARS = 500;

const toChip = item => ({ label: item.label, kind: item.kind, value: item.value, ...(item.flags !== undefined ? { flags: item.flags } : {}) });

export function initialChipEditorState(rule) {
  return { exact: (rule?.exact ?? []).map(toChip), hint: (rule?.hint ?? []).map(toChip), note: '', yields_to: rule?.yields_to ?? [] };
}

// Real rule files use a status vocabulary broader than the original 초안/확정 pair (e.g.
// `draft_open_items`, `draft_owner_answers_applied_no_open_items`). Any status starting with
// "draft" reads as 초안; `confirmed`/`accepted` read as 확정; anything else is shown as-is
// rather than guessed at.
export function mailRuleStatusLabel(status) {
  if (typeof status !== 'string' || !status) return '미확인';
  if (status.startsWith('draft')) return '초안';
  if (status === 'confirmed' || status === 'accepted') return '확정';
  return status;
}
export function mailRuleStatusTone(status) {
  return typeof status === 'string' && (status === 'confirmed' || status === 'accepted') ? 'green' : 'amber';
}

function withGroup(state, group, list) {
  return group === 'exact' ? { ...state, exact: list } : { ...state, hint: list };
}
function groupOf(state, group) {
  return group === 'exact' ? state.exact : state.hint;
}

// Returns the same `state` reference (no-op) when the value is empty, too long, over the
// term-count limit, or a duplicate label — the caller does not need a separate ok/error path
// for the common "nothing to add" cases; comparing the returned state's identity is enough.
export function addLiteralChip(state, group, rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value || value.length > MAX_LITERAL_CHARS) return state;
  const list = groupOf(state, group);
  if (list.length >= MAX_TERMS) return state;
  if (list.some(item => item.label === value)) return state;
  return withGroup(state, group, [...list, { label: value, kind: 'literal', value }]);
}

// S4: `addLiteralChip` above silently no-ops (same state reference) on empty/too-long/at-max/
// duplicate input, by design — but a caller still needs to know *why*, to keep the typed text
// on screen and say something instead of just doing nothing. This classifies the same four
// cases `addLiteralChip` checks, in the same order, without touching state or the input value
// itself (that stays the caller's job — see operations-mail-rules.tsx's ChipGroup). Returns
// `null` when the add would actually succeed.
export function describeChipAddRejection(state, group, rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) return 'empty';
  if (value.length > MAX_LITERAL_CHARS) return 'too_long';
  const list = groupOf(state, group);
  if (list.length >= MAX_TERMS) return 'at_max';
  if (list.some(item => item.label === value)) return 'duplicate';
  return null;
}

// Removes by array index, not by label (nit): a hand-edited rule file can carry duplicate
// labels within one group (this module never de-duplicates what it reads off disk, only what
// it adds), and removing "the chip with this label" would have silently removed every chip
// sharing it instead of only the one the Owner actually clicked. A no-op (same state reference)
// for an out-of-range index, consistent with `addLiteralChip`'s no-op convention above.
export function removeChip(state, group, index) {
  const list = groupOf(state, group);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return state;
  return withGroup(state, group, list.filter((_, i) => i !== index));
}

// R4: whether a keydown event's Enter should commit the currently-typed chip value. Guards
// Korean (or any) IME composition — a still-composing Enter must never be treated as "the Owner
// finished typing," or it adds a half-composed syllable block as its own chip. Two signals,
// because browsers are inconsistent: `isComposing` is the modern, reliable one (Firefox/Safari/
// Chromium all set it on the composing keydown), but some IME/browser combinations on Windows
// instead replay the composition-committing Enter with `keyCode === 229` and `isComposing`
// already false by then — checking only `isComposing` misses that replay. Takes a plain
// `{key, isComposing, keyCode}` object (the caller extracts these from its own event) rather
// than a DOM event, so this stays framework-free and testable with no DOM at all.
export function shouldCommitChipOnKeyDown({ key, isComposing, keyCode } = {}) {
  if (key !== 'Enter') return false;
  if (isComposing) return false;
  if (keyCode === 229) return false;
  return true;
}

export function setNote(state, rawNote) {
  const note = typeof rawNote === 'string' ? rawNote.slice(0, MAX_NOTE_CHARS) : '';
  return { ...state, note };
}

// The exact shape the server's draft validator expects. yields_to is always included (as the
// array the state was seeded with) so a save round-trips it even though nothing in this UI can
// change it yet.
export function toDraft(state) {
  return { exact: state.exact, hint: state.hint, yields_to: state.yields_to ?? [], ...(state.note ? { note: state.note } : {}) };
}
