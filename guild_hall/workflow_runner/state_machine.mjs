import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.mjs";
import { validateWorkflowJobState } from "./contract.mjs";
import { fail } from "./errors.mjs";

const PHASE_ORDER = [
  "validate",
  "intake",
  "draft",
  "technical_content",
  "evidence_logic",
  "derive_executive_summary",
  "final_polish",
  "preservation",
  "semantic_verify",
  "document_validate",
  "render",
  "boundary",
  "receipt",
];

const TERMINAL = new Set(["blocked", "succeeded", "failed", "cancelled", "interrupted"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const JOURNAL_FILES = Object.freeze({
  prepared_execution: "prepared_execution.json",
  receipt_intent: "receipt_intent.json",
  receipt_confirmation: "receipt_confirmation.json",
  terminal_outcome_intent: "terminal_outcome_intent.json",
});

function isoNow(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) fail("state_clock_invalid", "Clock did not return a valid date");
  return date.toISOString();
}

export function createInitialState({ jobId, requestSha256, clock = () => new Date() }) {
  const timestamp = isoNow(clock);
  return validateWorkflowJobState({
    schema: "soulforge.workflow_job_state.v1",
    job_id: jobId,
    request_sha256: requestSha256,
    state_version: 0,
    status: "queued",
    phase: "validate",
    attempt: 0,
    created_at: timestamp,
    updated_at: timestamp,
    terminal_reason_code: null,
  });
}

function sameDesiredState(state, desired) {
  return state.status === desired.status
    && state.phase === desired.phase
    && state.attempt === desired.attempt
    && state.terminal_reason_code === desired.terminalReasonCode;
}

export function transitionState(state, {
  expectedStateVersion,
  status,
  phase,
  attempt = state.attempt,
  terminalReasonCode = null,
  clock = () => new Date(),
}) {
  validateWorkflowJobState(state);
  const desired = { status, phase, attempt, terminalReasonCode };
  if (expectedStateVersion === state.state_version - 1 && sameDesiredState(state, desired)) {
    return state;
  }
  if (expectedStateVersion !== state.state_version) {
    fail("state_cas_conflict", "State version compare-and-swap failed", {
      expected: expectedStateVersion,
      actual: state.state_version,
    });
  }
  if (TERMINAL.has(state.status)) fail("state_terminal_transition", `Cannot transition terminal state ${state.status}`);
  const currentPhaseIndex = PHASE_ORDER.indexOf(state.phase);
  const nextPhaseIndex = PHASE_ORDER.indexOf(phase);
  if (nextPhaseIndex < currentPhaseIndex) {
    fail("state_phase_regression", `Cannot move phase backward from ${state.phase} to ${phase}`);
  }
  if (status === "queued") fail("state_requeue_forbidden", "A job cannot transition back to queued");
  if (TERMINAL.has(status) !== (terminalReasonCode !== null)) {
    fail("state_terminal_reason_mismatch", "Terminal status requires a reason and non-terminal status forbids one");
  }
  if (!TERMINAL.has(status) && status !== "running") {
    fail("state_status_transition_invalid", `Invalid running transition status ${status}`);
  }
  const next = {
    ...state,
    state_version: state.state_version + 1,
    status,
    phase,
    attempt,
    updated_at: isoNow(clock),
    terminal_reason_code: terminalReasonCode,
  };
  return validateWorkflowJobState(next);
}

export function interruptRunningState(state, { expectedStateVersion = state.state_version, clock = () => new Date() } = {}) {
  validateWorkflowJobState(state);
  if (state.status !== "running") return state;
  return transitionState(state, {
    expectedStateVersion,
    status: "interrupted",
    phase: state.phase,
    attempt: state.attempt,
    terminalReasonCode: "runner_restart_interrupted",
    clock,
  });
}

export function phaseTransitionDigest(history) {
  return sha256Canonical(history.map((state) => ({
    state_version: state.state_version,
    status: state.status,
    phase: state.phase,
    attempt: state.attempt,
    updated_at: state.updated_at,
    terminal_reason_code: state.terminal_reason_code,
  })));
}

export function createMemoryStateAdapter() {
  const jobs = new Map();
  const idempotencyKeys = new Map();
  return {
    async open({ jobId, idempotencyKey, requestSha256, initialState }) {
      const bound = idempotencyKeys.get(idempotencyKey);
      if (bound && (bound.jobId !== jobId || bound.requestSha256 !== requestSha256)) {
        fail("idempotency_conflict", "idempotency_key is already bound to a different job or request");
      }
      const current = jobs.get(jobId);
      if (!current) {
        validateWorkflowJobState(initialState);
        jobs.set(jobId, {
          idempotencyKey,
          requestSha256,
          state: initialState,
          history: [initialState],
          outcome: null,
          journal: {},
        });
        idempotencyKeys.set(idempotencyKey, { jobId, requestSha256 });
        return { replayed: false, state: initialState, outcome: null, journal: {} };
      }
      if (current.idempotencyKey !== idempotencyKey || current.requestSha256 !== requestSha256) {
        fail("idempotency_conflict", "job_id or idempotency_key was reused with a different request hash");
      }
      return { replayed: true, state: current.state, outcome: current.outcome, journal: { ...current.journal } };
    },

    async compareAndSwap({ jobId, expectedStateVersion, nextState }) {
      const current = jobs.get(jobId);
      if (!current) fail("state_job_missing", `No state for ${jobId}`);
      validateWorkflowJobState(nextState);
      if (current.state.state_version === nextState.state_version && canonicalJson(current.state) === canonicalJson(nextState)) {
        return current.state;
      }
      if (current.state.state_version !== expectedStateVersion || nextState.state_version !== expectedStateVersion + 1) {
        fail("state_cas_conflict", "State adapter compare-and-swap failed", {
          expected: expectedStateVersion,
          actual: current.state.state_version,
          next: nextState.state_version,
        });
      }
      current.state = nextState;
      current.history.push(nextState);
      return nextState;
    },

    async recordOutcome({ jobId, outcome }) {
      const current = jobs.get(jobId);
      if (!current) fail("state_job_missing", `No state for ${jobId}`);
      if (current.outcome && canonicalJson(current.outcome) !== canonicalJson(outcome)) {
        fail("idempotent_outcome_conflict", "A different outcome is already recorded");
      }
      current.outcome = current.outcome ?? outcome;
      return current.outcome;
    },

    async recordJournal({ jobId, name, value }) {
      const current = jobs.get(jobId);
      if (!current) fail("state_job_missing", `No state for ${jobId}`);
      if (!Object.hasOwn(JOURNAL_FILES, name)) fail("state_journal_name_invalid", `Unknown durable journal ${name}`);
      if (Object.hasOwn(current.journal, name) && canonicalJson(current.journal[name]) !== canonicalJson(value)) {
        fail("state_journal_conflict", `Conflicting durable journal ${name}`);
      }
      current.journal[name] ??= value;
      return current.journal[name];
    },

    async recoverRunning({ jobId, clock = () => new Date() }) {
      const current = jobs.get(jobId);
      if (!current) fail("state_job_missing", `No state for ${jobId}`);
      if (current.state.status !== "running") return current.state;
      const next = interruptRunningState(current.state, { clock });
      current.state = next;
      current.history.push(next);
      return next;
    },

    async snapshot(jobId) {
      const current = jobs.get(jobId);
      if (!current) return null;
      return {
        state: current.state,
        history: [...current.history],
        outcome: current.outcome,
        journal: { ...current.journal },
      };
    },
  };
}

async function syncDirectory(directory, fsOps) {
  let handle;
  try {
    handle = await fsOps.open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (!new Set(["EINVAL", "ENOTSUP", "EPERM", "EISDIR"]).has(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

async function writeExclusiveJson(target, value, fsOps) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}-${randomUUID()}.tmp`);
  let linked = false;
  try {
    const handle = await fsOps.open(temporary, "wx");
    try {
      await handle.writeFile(`${canonicalJson(value)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fsOps.link(temporary, target);
    linked = true;
    await syncDirectory(path.dirname(target), fsOps);
  } catch (error) {
    if (linked) await fsOps.rm(target, { force: true });
    throw error;
  } finally {
    await fsOps.rm(temporary, { force: true });
  }
}

async function readJson(target, fsOps) {
  return JSON.parse(await fsOps.readFile(target, "utf8"));
}

async function readOptionalJson(target, fsOps) {
  try {
    return await readJson(target, fsOps);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function ensureExclusiveRecord(target, value, conflictCode, fsOps) {
  try {
    await writeExclusiveJson(target, value, fsOps);
    return value;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await readJson(target, fsOps);
    if (canonicalJson(existing) !== canonicalJson(value)) fail(conflictCode, `Conflicting durable record at ${path.basename(target)}`);
    return existing;
  }
}

function stateFilename(version) {
  return `${String(version).padStart(12, "0")}.json`;
}

async function readStateHistory(stateDirectory, fsOps) {
  let names;
  try {
    names = await fsOps.readdir(stateDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const stateFiles = names.filter((name) => /^\d{12}\.json$/.test(name)).sort();
  const history = [];
  for (const name of stateFiles) history.push(validateWorkflowJobState(await readJson(path.join(stateDirectory, name), fsOps)));
  return history;
}

function confined(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(root, candidate);
  if (allowRoot && relative === "") return true;
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function assertNoLinkedPath(base, target, fsOps) {
  const relative = path.relative(base, target);
  let current = base;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const metadata = await fsOps.lstat(current);
      if (metadata.isSymbolicLink()) fail("state_root_link_forbidden", `Durable state path contains a link or junction: ${segment}`);
      if (!metadata.isDirectory()) fail("state_root_component_not_directory", `Durable state path component is not a directory: ${segment}`);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

export function createFilesystemStateAdapter({ root, repositoryRoot, fsOps = fs }) {
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("state_root_not_absolute", "Durable state root must be absolute");
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) fail("state_repository_root_invalid", "Durable state adapter requires the absolute repository root");
  const resolvedRoot = path.resolve(root);
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const approvedBase = path.join(resolvedRepositoryRoot, "_workspaces", "system");
  if (!confined(approvedBase, resolvedRoot)) fail("state_forbidden_root", "Durable state root must be a child of _workspaces/system");
  let boundaryPromise = null;
  const ensureBoundary = () => {
    boundaryPromise ??= (async () => {
      const repositoryMetadata = await fsOps.lstat(resolvedRepositoryRoot);
      if (!repositoryMetadata.isDirectory() || repositoryMetadata.isSymbolicLink()) fail("state_repository_identity_invalid", "Repository root must be a non-link directory");
      await assertNoLinkedPath(resolvedRepositoryRoot, resolvedRoot, fsOps);
      await fsOps.mkdir(resolvedRoot, { recursive: true });
      await assertNoLinkedPath(resolvedRepositoryRoot, resolvedRoot, fsOps);
      const realRepositoryRoot = await fsOps.realpath(resolvedRepositoryRoot);
      const realRoot = await fsOps.realpath(resolvedRoot);
      const realApprovedBase = path.join(realRepositoryRoot, "_workspaces", "system");
      if (!confined(realApprovedBase, realRoot)) fail("state_root_symlink_escape", "Durable state root escaped _workspaces/system");
      return realRoot;
    })();
    return boundaryPromise;
  };
  const jobsRoot = path.join(resolvedRoot, "jobs");
  const idempotencyRoot = path.join(resolvedRoot, "idempotency");
  const jobRoot = (jobId) => {
    if (!SAFE_ID.test(jobId)) fail("state_job_id_invalid", "Durable state job id is not safe");
    return path.join(jobsRoot, jobId);
  };
  const stateRoot = (jobId) => path.join(jobRoot(jobId), "state");
  const readJournal = async (jobId) => {
    const entries = await Promise.all(Object.entries(JOURNAL_FILES).map(async ([name, filename]) => [name, await readOptionalJson(path.join(jobRoot(jobId), filename), fsOps)]));
    return Object.fromEntries(entries.filter(([, value]) => value !== null));
  };

  return {
    async open({ jobId, idempotencyKey, requestSha256, initialState }) {
      await ensureBoundary();
      validateWorkflowJobState(initialState);
      await fsOps.mkdir(jobsRoot, { recursive: true });
      await fsOps.mkdir(idempotencyRoot, { recursive: true });
      const idempotencyPath = path.join(idempotencyRoot, `${sha256Bytes(Buffer.from(idempotencyKey, "utf8"))}.json`);
      await ensureExclusiveRecord(idempotencyPath, { job_id: jobId, request_sha256: requestSha256 }, "idempotency_conflict", fsOps);
      await fsOps.mkdir(stateRoot(jobId), { recursive: true });
      await ensureExclusiveRecord(path.join(jobRoot(jobId), "binding.json"), {
        job_id: jobId,
        idempotency_key_sha256: sha256Bytes(Buffer.from(idempotencyKey, "utf8")),
        request_sha256: requestSha256,
      }, "idempotency_conflict", fsOps);
      const historyBefore = await readStateHistory(stateRoot(jobId), fsOps);
      if (historyBefore.length === 0) {
        await ensureExclusiveRecord(path.join(stateRoot(jobId), stateFilename(0)), initialState, "state_initial_conflict", fsOps);
      }
      const history = await readStateHistory(stateRoot(jobId), fsOps);
      const state = history.at(-1);
      let outcome = null;
      try {
        outcome = await readJson(path.join(jobRoot(jobId), "outcome.json"), fsOps);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      return { replayed: historyBefore.length > 0, state, outcome, journal: await readJournal(jobId) };
    },

    async compareAndSwap({ jobId, expectedStateVersion, nextState }) {
      await ensureBoundary();
      validateWorkflowJobState(nextState);
      const history = await readStateHistory(stateRoot(jobId), fsOps);
      const current = history.at(-1);
      if (!current) fail("state_job_missing", `No durable state for ${jobId}`);
      if (current.state_version === nextState.state_version && canonicalJson(current) === canonicalJson(nextState)) return current;
      if (current.state_version !== expectedStateVersion || nextState.state_version !== expectedStateVersion + 1) {
        fail("state_cas_conflict", "Durable state compare-and-swap failed", { expected: expectedStateVersion, actual: current.state_version });
      }
      try {
        await writeExclusiveJson(path.join(stateRoot(jobId), stateFilename(nextState.state_version)), nextState, fsOps);
      } catch (error) {
        if (error?.code === "EEXIST") fail("state_cas_conflict", "Concurrent durable state transition won the CAS");
        throw error;
      }
      return nextState;
    },

    async recordOutcome({ jobId, outcome }) {
      await ensureBoundary();
      return ensureExclusiveRecord(path.join(jobRoot(jobId), "outcome.json"), outcome, "idempotent_outcome_conflict", fsOps);
    },

    async recordJournal({ jobId, name, value }) {
      await ensureBoundary();
      if (!Object.hasOwn(JOURNAL_FILES, name)) fail("state_journal_name_invalid", `Unknown durable journal ${name}`);
      return ensureExclusiveRecord(path.join(jobRoot(jobId), JOURNAL_FILES[name]), value, "state_journal_conflict", fsOps);
    },

    async recoverRunning({ jobId, clock = () => new Date() }) {
      await ensureBoundary();
      const history = await readStateHistory(stateRoot(jobId), fsOps);
      const current = history.at(-1);
      if (!current) fail("state_job_missing", `No durable state for ${jobId}`);
      if (current.status !== "running") return current;
      const next = interruptRunningState(current, { clock });
      return this.compareAndSwap({ jobId, expectedStateVersion: current.state_version, nextState: next });
    },

    async snapshot(jobId) {
      await ensureBoundary();
      const history = await readStateHistory(stateRoot(jobId), fsOps);
      if (!history.length) return null;
      let outcome = null;
      try {
        outcome = await readJson(path.join(jobRoot(jobId), "outcome.json"), fsOps);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      return { state: history.at(-1), history, outcome, journal: await readJournal(jobId) };
    },
  };
}
