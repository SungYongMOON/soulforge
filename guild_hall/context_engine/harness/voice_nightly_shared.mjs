// Shared, dependency-light pieces of the nightly voice conversation-list lane: the
// receipt schema names and the Asia/Seoul calendar-date helpers. They live in their
// own leaf module so that `estate_voice_card_reconcile.mjs` (which reads nightly
// receipts) and `voice_conversation_list_nightly.mjs` (which, with
// `--chain-reconcile`, loads the reconcile harness) do not import each other --
// the repository's import graph must stay acyclic (module_operability preflight).
import { ConversationListError } from '../src/runtime/voice_conversation_list.mjs';

export const NIGHTLY_RECEIPT_SCHEMA_V1 = 'soulforge.voice_conversation_list_nightly_receipt.v1';
export const NIGHTLY_RECEIPT_SCHEMA = 'soulforge.voice_conversation_list_nightly_receipt.v2';

const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const fail = code => { throw new ConversationListError(code); };

/** "Today" as a calendar date in Asia/Seoul (fixed +09:00, no DST) for one instant. */
export function seoulDateFor(nowIso) {
  const at = Date.parse(nowIso);
  if (!Number.isFinite(at)) fail('voice_conversation_list_nightly_now_invalid');
  return new Date(at + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** One `YYYY-MM-DD` shifted by whole calendar days, in no particular time zone. */
export function shiftDate(dateStr, deltaDays) {
  if (!DATE_DIR.test(dateStr ?? '')) fail('voice_conversation_list_nightly_date_invalid');
  const [year, month, day] = dateStr.split('-').map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() + deltaDays);
  return at.toISOString().slice(0, 10);
}

/** The default target date: yesterday, read in Asia/Seoul. */
export function defaultTargetDate(nowIso) {
  return shiftDate(seoulDateFor(nowIso), -1);
}
