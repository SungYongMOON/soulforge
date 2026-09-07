import { constants } from "node:fs";
import { lstat, open, realpath, readdir, link, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { deepFreeze } from "../../../../../guild_hall/agent_observation/guard_primitives.mjs";
import { evaluateWorkbenchIntakeRecord, isWorkbenchIntakeRecord } from "../core/workbench-intake-record.mjs";

const ID = /^w_[a-f0-9]{32}$/u;
const RECORD_NAME = /^w_[a-f0-9]{32}\.json$/u;
const PENDING_NAME = /^\.pending\.[a-f0-9]{32}\.json$/u;
const MAX_RECORDS = 256;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const samePath = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const failure = hold_code => deepFreeze({ status: "HOLD", hold_code, append_required: false, persisted: false, replayed: false });
const fail = code => { throw Object.assign(new Error(code), { intakeCode: code }); };
const codeOf = error => error?.intakeCode ?? "STORE_IO_UNAVAILABLE";

/**
 * Explicit isolated-root store; no default state path, root creation, overwrite or migration.
 * The caller owns OS directory custody. Physical ancestor/root/file checks reject supplied
 * symlinks and observed replacements; portable Node checks are not an OS adversarial-race sandbox.
 * File fsync + create-only publication supports process-crash replay. On Windows, portable
 * directory fsync is unavailable, so this does not promise power-loss durability of directory entries.
 */
export function createWorkbenchIntakeStore({ root, maxRecordBytes = 32768, lockRetries = 100 } = {}) {
  if (typeof root !== "string" || !isAbsolute(root) || resolve(root) === parse(resolve(root)).root
    || !Number.isSafeInteger(maxRecordBytes) || maxRecordBytes < 1024 || maxRecordBytes > 65536
    || !Number.isSafeInteger(lockRetries) || lockRetries < 0 || lockRetries > 500) {
    throw new TypeError("Explicit isolated intake root and bounded options required");
  }
  const rootPath = resolve(root);
  let rootIdentity = null;

  async function checkRoot() {
    let cursor = rootPath;
    while (true) {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail("STORE_ROOT_UNSAFE");
      if (cursor === rootPath) {
        if (rootIdentity !== null && !sameFile(stat, rootIdentity)) fail("STORE_ROOT_CHANGED");
        rootIdentity ??= stat;
      }
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    if (!samePath(await realpath(rootPath), rootPath)) fail("STORE_ROOT_UNSAFE");
  }

  async function fileStat(name) {
    await checkRoot();
    const stat = await lstat(join(rootPath, name));
    if (stat.isSymbolicLink() || !stat.isFile()) fail("STORE_FILE_UNSAFE");
    return stat;
  }

  async function readRecord(name, before) {
    if (before.size < 2 || before.size > maxRecordBytes) fail("STORE_RECORD_INVALID");
    const handle = await open(join(rootPath, name), constants.O_RDONLY | NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!sameFile(before, opened) || !opened.isFile() || opened.size !== before.size) fail("STORE_FILE_CHANGED");
      const bytes = await handle.readFile();
      const after = await fileStat(name);
      const final = await handle.stat();
      if (!sameFile(opened, after) || !sameFile(opened, final) || bytes.length !== before.size
        || after.size !== before.size || after.mtimeMs !== before.mtimeMs || final.mtimeMs !== before.mtimeMs) fail("STORE_FILE_CHANGED");
      let record;
      try { record = JSON.parse(bytes.toString("utf8")); } catch { fail("STORE_RECORD_INVALID"); }
      if (!isWorkbenchIntakeRecord(record) || `${record.request_id}.json` !== name) fail("STORE_RECORD_INVALID");
      return record;
    } finally { await handle.close(); }
  }

  async function records() {
    await checkRoot();
    const names = await readdir(rootPath);
    if (names.length > MAX_RECORDS + 3) fail("STORE_LIMIT_REACHED");
    const committed = [];
    const staged = [];
    for (const name of names) {
      if (name !== ".intake.lock" && !RECORD_NAME.test(name) && !PENDING_NAME.test(name)) fail("STORE_ENTRY_UNKNOWN");
      let stat;
      try { stat = await fileStat(name); }
      catch (error) {
        // A completed writer may remove its own lock/staging name after readdir. Canonical
        // records are immutable and are never permitted this disappearance exception.
        if (error.code === "ENOENT" && !RECORD_NAME.test(name)) continue;
        throw error;
      }
      if (RECORD_NAME.test(name)) committed.push({ name, stat, record: await readRecord(name, stat) });
      else if (PENDING_NAME.test(name)) staged.push({ name, stat });
      else if (stat.nlink !== 1) fail("STORE_FILE_UNSAFE");
    }
    // A crash after publication may leave the staged hardlink. It is ignorable only when it
    // names the exact inode of a fully validated committed record; partial staging fails closed.
    if (staged.some(temp => !committed.some(row => sameFile(temp.stat, row.stat)))) fail("STORE_INCOMPLETE");
    for (const row of committed) {
      const current = await fileStat(row.name);
      if (!sameFile(current, row.stat)) fail("STORE_FILE_CHANGED");
      const knownLinks = 1 + staged.filter(temp => sameFile(temp.stat, row.stat)).length;
      // Staging cleanup can reduce 2 links to 1 during this read-only snapshot.
      if (current.nlink !== 1 && current.nlink !== knownLinks) fail("STORE_FILE_UNSAFE");
    }
    if (committed.length > MAX_RECORDS) fail("STORE_LIMIT_REACHED");
    const keys = committed.map(row => row.record.request.idempotency_key);
    if (new Set(keys).size !== keys.length) fail("STORE_IDEMPOTENCY_CONFLICT");
    return committed.map(row => row.record);
  }

  async function acquireLock() {
    for (let attempt = 0; attempt <= lockRetries; attempt++) {
      await checkRoot();
      try {
        let handle;
        try { handle = await open(join(rootPath, ".intake.lock"), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NOFOLLOW, 0o600); }
        catch (error) {
          if (process.platform === "win32" && error.code === "EPERM") error.intakeLockOpenDenied = true;
          throw error;
        }
        const identity = await handle.stat();
        try {
          await checkRoot();
          await handle.writeFile("{}\n");
          await handle.sync();
        } catch (error) { await handle.close(); throw error; }
        return { handle, identity };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try { await fileStat(".intake.lock"); }
        catch (statError) { if (statError.code === "ENOENT") continue; throw statError; }
        if (attempt === lockRetries) fail("STORE_BUSY");
        await new Promise(resolveWait => setTimeout(resolveWait, 10));
      }
    }
    fail("STORE_BUSY");
  }

  async function removeOwned(name, identity) {
    const current = await fileStat(name);
    if (!sameFile(current, identity)) fail("STORE_FILE_CHANGED");
    await unlink(join(rootPath, name));
  }

  async function syncDirectory() {
    if (process.platform === "win32") return;
    const handle = await open(rootPath, constants.O_RDONLY);
    try { await handle.sync(); } finally { await handle.close(); }
  }

  return Object.freeze({
    async read(requestId) {
      if (typeof requestId !== "string" || !ID.test(requestId)) return failure("REQUEST_ID_INVALID");
      try {
        const record = (await records()).find(row => row.request_id === requestId);
        return record ? deepFreeze({ status: "FOUND", record }) : deepFreeze({ status: "NOT_FOUND" });
      } catch (error) { return failure(codeOf(error)); }
    },

    async record(request, metadata) {
      // Validate request, authentication/scope evidence and server metadata before any mutation.
      const preview = evaluateWorkbenchIntakeRecord(request, { ...metadata, existing_records: [] });
      // Empty preflight cannot resolve a revision parent. All other validation
      // must pass first; the real parent and successor are checked below, then
      // checked again under the write lock before publication.
      if (preview.status !== "RECORDED" && preview.hold_code !== "REVISION_PARENT_UNAVAILABLE") return { ...preview, persisted: false };
      let lock = null;
      let staged = null;
      let published = false;
      let outcome;
      try {
        // Replay is safe even after a process died leaving a lock behind. It does not append.
        try {
          const current = evaluateWorkbenchIntakeRecord(request, { ...metadata, existing_records: await records() });
          if (current.status !== "RECORDED") return { ...current, persisted: false };
          if (current.replayed) return deepFreeze({ ...current, persisted: true });
        } catch (error) {
          if (error.intakeCode !== "STORE_INCOMPLETE") throw error;
        }
        try { lock = await acquireLock(); }
        catch (error) {
          if (error.intakeLockOpenDenied !== true) throw error;
          // Windows can deny an exclusive open while another writer deletes its lock.
          // Recheck only the existing immutable replay; never retry permission errors or
          // append without a lock. Real IO failures and non-identical requests stay closed.
          const replay = evaluateWorkbenchIntakeRecord(request, { ...metadata, existing_records: await records() });
          if (replay.status !== "RECORDED" || !replay.replayed) throw error;
          return deepFreeze({ ...replay, persisted: true });
        }
        const existing = await records();
        const next = evaluateWorkbenchIntakeRecord(request, { ...metadata, existing_records: existing });
        if (next.status !== "RECORDED") outcome = { ...next, persisted: false };
        else if (next.replayed) outcome = { ...next, persisted: true };
        else {
          if (existing.length >= MAX_RECORDS) fail("STORE_LIMIT_REACHED");
          const bytes = Buffer.from(`${JSON.stringify(next.record)}\n`, "utf8");
          if (bytes.length > maxRecordBytes) fail("STORE_RECORD_TOO_LARGE");
          await checkRoot();
          const name = `.pending.${randomBytes(16).toString("hex")}.json`;
          const handle = await open(join(rootPath, name), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NOFOLLOW, 0o600);
          staged = { name, identity: await handle.stat() };
          try {
            await checkRoot();
            await handle.writeFile(bytes);
            await handle.sync();
          } finally { await handle.close(); }
          await checkRoot();
          const currentStage = await fileStat(name);
          if (!sameFile(currentStage, staged.identity) || currentStage.size !== bytes.length || currentStage.nlink !== 1) fail("STORE_FILE_CHANGED");
          try { await link(join(rootPath, name), join(rootPath, `${next.record.request_id}.json`)); }
          catch (error) { if (error.code === "EEXIST") fail("REQUEST_ID_CONFLICT"); throw error; }
          published = true;
          await checkRoot();
          await syncDirectory();
          await removeOwned(staged.name, staged.identity);
          staged = null;
          outcome = { ...next, persisted: true };
        }
      } catch (error) {
        outcome = failure(published ? "STORE_COMMIT_UNCERTAIN" : codeOf(error));
      } finally {
        // Only this call's exact staged inode and lock may be removed. Crash leftovers are
        // never stolen, deleted or treated as an execution receipt by a future request.
        if (staged !== null && !published) {
          try { await removeOwned(staged.name, staged.identity); } catch { /* Fail closed above. */ }
        }
        if (lock !== null) {
          try {
            await lock.handle.close();
            await removeOwned(".intake.lock", lock.identity);
          } catch { outcome = failure(published ? "STORE_COMMIT_UNCERTAIN" : "STORE_LOCK_UNCERTAIN"); }
        }
      }
      return deepFreeze(outcome);
    },
  });
}
