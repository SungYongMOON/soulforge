// mail-rule-chip-editor.mjs — pure state for the "메일 분류 키워드" panel's edit mode.
// No fetch, DOM, or timer: the panel owns the network calls, this module only owns the
// literal-chip add/remove/dedupe arithmetic and its bounds. Regex terms already on the rule
// can be removed here but never authored (the UI has no regex input).

export const MAX_TERMS = 60;
export const MAX_LITERAL_CHARS = 80;
export const MAX_NOTE_CHARS = 500;

const toChip = item => ({ label: item.label, kind: item.kind, value: item.value, ...(item.flags !== undefined ? { flags: item.flags } : {}) });

export function initialChipEditorState(rule) {
  return { exact: (rule?.exact ?? []).map(toChip), hint: (rule?.hint ?? []).map(toChip), note: '' };
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

export function removeChip(state, group, label) {
  return withGroup(state, group, groupOf(state, group).filter(item => item.label !== label));
}

export function setNote(state, rawNote) {
  const note = typeof rawNote === 'string' ? rawNote.slice(0, MAX_NOTE_CHARS) : '';
  return { ...state, note };
}

// The exact shape the server's draft validator expects.
export function toDraft(state) {
  return { exact: state.exact, hint: state.hint, ...(state.note ? { note: state.note } : {}) };
}
