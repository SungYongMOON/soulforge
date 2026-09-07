// App-owned working usage only. Calendar rollover requires a new authorized
// balance observation; an expired journal is never silently refilled.
import { openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";

export function openBudgetJournal(file, observation) {
  let lock;
  try { lock = openSync(`${file}.lock`, "wx"); } catch { throw new Error("budget_journal_busy"); }
  let closed = false;
  const close = () => { if (!closed) { closed = true; closeSync(lock); unlinkSync(`${file}.lock`); } };
  try {
    const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    if (existing && (existing.contractDigest !== observation?.contractDigest || existing.observedAt !== observation?.observedAt || existing.resetAt > observation?.resetAt)) throw new Error("budget_observation_reconciliation_required");
    const state = existing ?? structuredClone(observation);
    const journal = { state, reserve(next) {
      if (closed) throw new Error("budget_journal_closed");
      if (next.contractDigest !== journal.state.contractDigest || next.observedAt !== journal.state.observedAt || next.remaining > journal.state.remaining || next.remainingRequests > journal.state.remainingRequests || next.resetAt > journal.state.resetAt) throw new Error("budget_must_only_decrease");
      const pending = `${file}.${process.pid}.pending`;
      writeFileSync(pending, JSON.stringify(next), { flag: "wx" });
      renameSync(pending, file);
      journal.state = next;
    }, close };
    return journal;
  } catch (error) { close(); throw error; }
}
