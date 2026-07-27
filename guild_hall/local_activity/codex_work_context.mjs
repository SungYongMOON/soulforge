import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  link,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const CODEX_WORK_CONTEXT_BINDING_SCHEMA =
  "soulforge.hpp_codex_work_context_binding.v1";
export const CODEX_WORK_CONTEXT_EVENT_SCHEMA =
  "soulforge.hpp_codex_work_context_event.v1";
export const CODEX_WORK_CONTEXT_SNAPSHOT_SCHEMA =
  "soulforge.hpp_codex_work_context_snapshot.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,159}$/u;
const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_BINDING_BYTES = 1024 * 1024;
const MAX_TITLE_CHARS = 240;
const MAX_SUMMARY_CHARS = 4_000;
const MAX_REF_CHARS = 600;
const MAX_REF_ITEMS = 64;
const OPERATIONS = new Set([
  "register_leader",
  "begin_work",
  "attach_thread",
  "checkpoint",
  "finish_work",
  "supersede_work",
  "status",
]);
const THREAD_ROLES = new Set([
  "leader_executor",
  "project_leader",
  "worker",
  "continuation",
  "verifier",
]);

function fail(code, message = code) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function exactObject(value, keys, label) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label}_invalid`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}_keys_invalid`);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(
    typeof value === "string" || Buffer.isBuffer(value)
      ? value
      : canonicalJson(value),
  ).digest("hex");
}

function safeId(value, label, pattern = SAFE_ID) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${label}_invalid`);
  }
  return value;
}

function boundedString(value, label, maximum) {
  if (typeof value !== "string") fail(`${label}_invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(`${label}_invalid`);
  return normalized;
}

function nullableBoundedString(value, label, maximum) {
  if (value === null) return null;
  return boundedString(value, label, maximum);
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.length > MAX_REF_ITEMS) {
    fail(`${label}_invalid`);
  }
  return value.map((item) => boundedString(item, label, MAX_REF_CHARS));
}

function absolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail(`${label}_invalid`);
  }
  return path.resolve(value);
}

function toKstIso(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail("occurred_at_invalid");
  const shifted = new Date(parsed.getTime() + (9 * 60 * 60 * 1000));
  return shifted.toISOString().replace(/Z$/u, "+09:00");
}

function sortPrefix(kstIso) {
  return new Date(kstIso).toISOString().replace(/[-:.TZ]/gu, "");
}

function generateWorkId(projectCode, eventId) {
  return `LW-${projectCode}-${digest(eventId).slice(0, 20)}`;
}

export function normalizeCodexWorkContextBinding(input) {
  exactObject(input, [
    "schema_version",
    "binding_id",
    "node_id",
    "node_role",
    "state_root",
    "projects",
  ], "binding");
  if (input.schema_version !== CODEX_WORK_CONTEXT_BINDING_SCHEMA) {
    fail("binding_schema_invalid");
  }
  if (input.node_role !== "tool_pc") fail("binding_node_role_invalid");
  if (
    !Array.isArray(input.projects)
    || input.projects.length < 1
    || input.projects.length > 128
  ) {
    fail("binding_projects_invalid");
  }
  const seen = new Set();
  const projects = input.projects.map((project, index) => {
    exactObject(project, ["project_code", "enabled"], `project_${index}`);
    const projectCode = safeId(project.project_code, "project_code", SAFE_PROJECT);
    if (seen.has(projectCode)) fail("binding_project_duplicate");
    seen.add(projectCode);
    if (typeof project.enabled !== "boolean") fail("project_enabled_invalid");
    return {
      project_code: projectCode,
      enabled: project.enabled,
    };
  });
  return {
    schema_version: CODEX_WORK_CONTEXT_BINDING_SCHEMA,
    binding_id: safeId(input.binding_id, "binding_id"),
    node_id: safeId(input.node_id, "node_id"),
    node_role: input.node_role,
    state_root: absolutePath(input.state_root, "binding_state_root"),
    projects: projects.sort((left, right) => (
      left.project_code.localeCompare(right.project_code, "en")
    )),
  };
}

export async function readCodexWorkContextBinding(
  bindingPath,
  expectedSha256,
) {
  const resolved = absolutePath(bindingPath, "binding_path");
  const before = await lstat(resolved);
  if (
    before.isSymbolicLink()
    || !before.isFile()
    || before.size > MAX_BINDING_BYTES
  ) {
    fail("binding_file_unsafe");
  }
  const bytes = await readFile(resolved);
  const after = await lstat(resolved);
  if (
    after.isSymbolicLink()
    || !after.isFile()
    || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
  ) {
    fail("binding_changed_during_read");
  }
  const actual = digest(bytes);
  const expected = String(expectedSha256 ?? "")
    .replace(/^sha256:/u, "")
    .toLowerCase();
  if (!SHA256.test(expected) || expected !== actual) {
    fail("binding_digest_mismatch");
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch {
    fail("binding_json_invalid");
  }
  return {
    binding: normalizeCodexWorkContextBinding(parsed),
    binding_sha256: actual,
  };
}

function normalizeCommonPayload(payload) {
  if (!OPERATIONS.has(payload.operation)) fail("operation_invalid");
  const projectCode = safeId(payload.project_code, "project_code", SAFE_PROJECT);
  return {
    operation: payload.operation,
    project_code: projectCode,
    occurred_at: toKstIso(payload.occurred_at ?? new Date()),
    event_id: payload.event_id === undefined
      ? randomUUID()
      : safeId(payload.event_id, "event_id"),
  };
}

function normalizeOperationPayload(input) {
  if (
    input === null
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) {
    fail("operation_payload_invalid");
  }
  const common = normalizeCommonPayload(input);
  if (common.operation === "register_leader") {
    exactObject(input, [
      "operation",
      "project_code",
      "occurred_at",
      "event_id",
      "leader_thread_ref",
      "title",
    ], "register_leader");
    return {
      ...common,
      leader_thread_ref: boundedString(
        input.leader_thread_ref,
        "leader_thread_ref",
        MAX_REF_CHARS,
      ),
      title: boundedString(input.title, "title", MAX_TITLE_CHARS),
    };
  }
  if (common.operation === "begin_work") {
    exactObject(input, [
      "operation",
      "project_code",
      "occurred_at",
      "event_id",
      "work_id",
      "leader_thread_ref",
      "executor_thread_ref",
      "title",
      "request_summary",
      "source_refs",
    ], "begin_work");
    return {
      ...common,
      work_id: input.work_id === null
        ? generateWorkId(common.project_code, common.event_id)
        : safeId(input.work_id, "work_id"),
      leader_thread_ref: boundedString(
        input.leader_thread_ref,
        "leader_thread_ref",
        MAX_REF_CHARS,
      ),
      executor_thread_ref: boundedString(
        input.executor_thread_ref,
        "executor_thread_ref",
        MAX_REF_CHARS,
      ),
      title: boundedString(input.title, "title", MAX_TITLE_CHARS),
      request_summary: boundedString(
        input.request_summary,
        "request_summary",
        MAX_SUMMARY_CHARS,
      ),
      source_refs: stringArray(input.source_refs, "source_refs"),
    };
  }
  if (common.operation === "attach_thread") {
    exactObject(input, [
      "operation",
      "project_code",
      "occurred_at",
      "event_id",
      "work_id",
      "thread_ref",
      "parent_thread_ref",
      "thread_role",
      "title",
    ], "attach_thread");
    if (!THREAD_ROLES.has(input.thread_role)) fail("thread_role_invalid");
    return {
      ...common,
      work_id: safeId(input.work_id, "work_id"),
      thread_ref: boundedString(input.thread_ref, "thread_ref", MAX_REF_CHARS),
      parent_thread_ref: nullableBoundedString(
        input.parent_thread_ref,
        "parent_thread_ref",
        MAX_REF_CHARS,
      ),
      thread_role: input.thread_role,
      title: boundedString(input.title, "title", MAX_TITLE_CHARS),
    };
  }
  if (common.operation === "checkpoint") {
    exactObject(input, [
      "operation",
      "project_code",
      "occurred_at",
      "event_id",
      "work_id",
      "thread_ref",
      "summary",
      "decision_refs",
      "file_refs",
      "run_refs",
    ], "checkpoint");
    return {
      ...common,
      work_id: safeId(input.work_id, "work_id"),
      thread_ref: boundedString(input.thread_ref, "thread_ref", MAX_REF_CHARS),
      summary: boundedString(input.summary, "summary", MAX_SUMMARY_CHARS),
      decision_refs: stringArray(input.decision_refs, "decision_refs"),
      file_refs: stringArray(input.file_refs, "file_refs"),
      run_refs: stringArray(input.run_refs, "run_refs"),
    };
  }
  if (common.operation === "finish_work") {
    exactObject(input, [
      "operation",
      "project_code",
      "occurred_at",
      "event_id",
      "work_id",
      "thread_ref",
      "result_summary",
      "verification_summary",
      "file_refs",
      "run_refs",
      "remaining_notes",
    ], "finish_work");
    return {
      ...common,
      work_id: safeId(input.work_id, "work_id"),
      thread_ref: boundedString(input.thread_ref, "thread_ref", MAX_REF_CHARS),
      result_summary: boundedString(
        input.result_summary,
        "result_summary",
        MAX_SUMMARY_CHARS,
      ),
      verification_summary: boundedString(
        input.verification_summary,
        "verification_summary",
        MAX_SUMMARY_CHARS,
      ),
      file_refs: stringArray(input.file_refs, "file_refs"),
      run_refs: stringArray(input.run_refs, "run_refs"),
      remaining_notes: nullableBoundedString(
        input.remaining_notes,
        "remaining_notes",
        MAX_SUMMARY_CHARS,
      ),
    };
  }
  if (common.operation === "supersede_work") {
    exactObject(input, [
      "operation",
      "project_code",
      "occurred_at",
      "event_id",
      "work_id",
      "thread_ref",
      "reason",
      "replacement_work_id",
    ], "supersede_work");
    const workId = safeId(input.work_id, "work_id");
    const replacementWorkId = input.replacement_work_id === null
      ? null
      : safeId(input.replacement_work_id, "replacement_work_id");
    if (replacementWorkId === workId) fail("replacement_work_self_reference");
    return {
      ...common,
      work_id: workId,
      thread_ref: boundedString(input.thread_ref, "thread_ref", MAX_REF_CHARS),
      reason: boundedString(input.reason, "reason", MAX_SUMMARY_CHARS),
      replacement_work_id: replacementWorkId,
    };
  }
  exactObject(input, [
    "operation",
    "project_code",
    "occurred_at",
    "event_id",
    "work_id",
  ], "status");
  return {
    ...common,
    work_id: input.work_id === null ? null : safeId(input.work_id, "work_id"),
  };
}

function projectConfig(binding, projectCode) {
  const project = binding.projects.find(
    (candidate) => candidate.project_code === projectCode,
  );
  if (!project) fail("project_not_allowed");
  if (!project.enabled) fail("project_disabled");
  return project;
}

function projectPaths(binding, projectCode) {
  const root = path.join(
    binding.state_root,
    "projects",
    projectCode,
    "codex_work_context",
  );
  return {
    root,
    leader_events: path.join(root, "leader_events"),
    work_units: path.join(root, "work_units"),
  };
}

async function readJson(target, label) {
  let parsed;
  try {
    parsed = JSON.parse((await readFile(target, "utf8")).replace(/^\uFEFF/u, ""));
  } catch {
    fail(`${label}_invalid`);
  }
  return parsed;
}

async function atomicWriteNew(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, bytes, { encoding: "utf8", flag: "wx" });
    await link(temporary, target);
    await rm(temporary, { force: true });
    return "written";
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (!["EEXIST", "EPERM"].includes(error?.code)) throw error;
    const existing = await readFile(target, "utf8").catch(() => null);
    if (existing === null) throw error;
    if (existing === bytes) return "replayed";
    fail("immutable_packet_conflict");
  }
}

async function atomicReplace(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function eventFileName(event) {
  return `${sortPrefix(event.occurred_at)}-${event.event_digest}.json`;
}

function buildEvent(binding, payload, sequence = null) {
  const eventCore = {
    schema_version: CODEX_WORK_CONTEXT_EVENT_SCHEMA,
    event_id: payload.event_id,
    operation: payload.operation,
    occurred_at: payload.occurred_at,
    project_code: payload.project_code,
    node_id: binding.node_id,
    work_id: payload.work_id ?? null,
    sequence,
    payload: Object.fromEntries(
      Object.entries(payload).filter(([key]) => ![
        "operation",
        "occurred_at",
        "event_id",
        "project_code",
        "work_id",
      ].includes(key)),
    ),
    data_label: "private_operational_metadata",
    claim_ceiling: "hpp_local_codex_context_evidence",
    boundaries: {
      whole_chat_auto_collected: false,
      bounded_fields_only: true,
      official_task_mutated: false,
      erp_database_mutated: false,
      project_context_inferred: false,
    },
  };
  return {
    ...eventCore,
    event_digest: digest(eventCore),
  };
}

async function listJsonFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readWorkEvents(workUnitRoot) {
  const files = await listJsonFiles(path.join(workUnitRoot, "events"));
  const events = [];
  const eventIds = new Map();
  for (const file of files) {
    const event = await readJson(file, "work_event");
    if (
      event?.schema_version !== CODEX_WORK_CONTEXT_EVENT_SCHEMA
      || typeof event.event_digest !== "string"
      || !Number.isSafeInteger(event.sequence)
      || event.sequence < 1
    ) {
      fail("work_event_invalid");
    }
    const { event_digest: declared, ...core } = event;
    if (digest(core) !== declared) fail("work_event_digest_invalid");
    const prior = eventIds.get(event.event_id);
    if (prior && prior !== declared) fail("work_event_id_conflict");
    if (!prior) events.push(event);
    eventIds.set(event.event_id, declared);
  }
  events.sort((left, right) => {
    return left.sequence - right.sequence || left.event_digest.localeCompare(
      right.event_digest,
      "en",
    );
  });
  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1) fail("work_event_sequence_invalid");
  }
  return events;
}

function buildSnapshot(projectCode, workId, events) {
  if (events.length < 1 || events[0].operation !== "begin_work") {
    fail("work_start_missing");
  }
  const start = events[0];
  if (start.project_code !== projectCode || start.work_id !== workId) {
    fail("work_identity_mismatch");
  }
  const threads = new Map();
  const directLeader = start.payload.leader_thread_ref;
  const executor = start.payload.executor_thread_ref;
  threads.set(directLeader, {
    thread_ref: directLeader,
    parent_thread_ref: null,
    thread_role: directLeader === executor
      ? "leader_executor"
      : "project_leader",
    title: start.payload.title,
    attached_at: start.occurred_at,
  });
  if (executor !== directLeader) {
    threads.set(executor, {
      thread_ref: executor,
      parent_thread_ref: directLeader,
      thread_role: "worker",
      title: start.payload.title,
      attached_at: start.occurred_at,
    });
  }
  const checkpoints = [];
  let completion = null;
  let supersession = null;
  for (const event of events.slice(1)) {
    if (event.project_code !== projectCode || event.work_id !== workId) {
      fail("work_event_scope_mismatch");
    }
    if (supersession) fail("work_event_after_supersession");
    if (completion && event.operation !== "supersede_work") {
      fail("work_event_after_finish");
    }
    if (event.operation === "attach_thread") {
      if (
        event.payload.parent_thread_ref !== null
        && !threads.has(event.payload.parent_thread_ref)
      ) {
        fail("parent_thread_not_attached");
      }
      const prior = threads.get(event.payload.thread_ref);
      const next = {
        thread_ref: event.payload.thread_ref,
        parent_thread_ref: event.payload.parent_thread_ref,
        thread_role: event.payload.thread_role,
        title: event.payload.title,
        attached_at: event.occurred_at,
      };
      if (prior && canonicalJson(prior) !== canonicalJson(next)) {
        fail("thread_attachment_conflict");
      }
      threads.set(event.payload.thread_ref, prior ?? next);
      continue;
    }
    if (event.operation === "checkpoint") {
      if (!threads.has(event.payload.thread_ref)) fail("thread_not_attached");
      checkpoints.push({
        checkpoint_id: event.event_id,
        occurred_at: event.occurred_at,
        thread_ref: event.payload.thread_ref,
        summary: event.payload.summary,
        decision_refs: event.payload.decision_refs,
        file_refs: event.payload.file_refs,
        run_refs: event.payload.run_refs,
      });
      continue;
    }
    if (event.operation === "finish_work") {
      if (!threads.has(event.payload.thread_ref)) fail("thread_not_attached");
      completion = {
        completion_id: event.event_id,
        occurred_at: event.occurred_at,
        thread_ref: event.payload.thread_ref,
        result_summary: event.payload.result_summary,
        verification_summary: event.payload.verification_summary,
        file_refs: event.payload.file_refs,
        run_refs: event.payload.run_refs,
        remaining_notes: event.payload.remaining_notes,
      };
      continue;
    }
    if (event.operation === "supersede_work") {
      if (!completion) fail("work_not_completed");
      if (!threads.has(event.payload.thread_ref)) fail("thread_not_attached");
      supersession = {
        supersession_id: event.event_id,
        occurred_at: event.occurred_at,
        thread_ref: event.payload.thread_ref,
        reason: event.payload.reason,
        replacement_work_id: event.payload.replacement_work_id,
      };
      continue;
    }
    fail("work_event_operation_invalid");
  }
  const core = {
    schema_version: CODEX_WORK_CONTEXT_SNAPSHOT_SCHEMA,
    project_code: projectCode,
    work_id: workId,
    status: supersession ? "superseded" : completion ? "completed" : "active",
    title: start.payload.title,
    request_summary: start.payload.request_summary,
    source_refs: start.payload.source_refs,
    started_at: start.occurred_at,
    last_event_at: events.at(-1).occurred_at,
    leader_thread_ref: directLeader,
    attached_threads: [...threads.values()].sort((left, right) => (
      left.attached_at.localeCompare(right.attached_at, "en")
      || left.thread_ref.localeCompare(right.thread_ref, "en")
    )),
    checkpoints,
    completion,
    supersession,
    event_count: events.length,
    data_label: "private_operational_metadata",
    claim_ceiling: "hpp_local_codex_context_evidence",
    boundaries: {
      whole_chat_auto_collected: false,
      bounded_fields_only: true,
      official_task_mutated: false,
      erp_database_mutated: false,
      project_context_inferred: false,
    },
  };
  return {
    ...core,
    snapshot_digest: digest(core),
  };
}

async function writeWorkEvent(paths, binding, payload) {
  const workUnitRoot = path.join(paths.work_units, payload.work_id);
  const existing = await readWorkEvents(workUnitRoot);
  if (payload.operation === "begin_work" && existing.length > 0) {
    const replay = existing.find((event) => event.event_id === payload.event_id);
    const candidate = buildEvent(binding, {
      ...payload,
      occurred_at: replay?.occurred_at ?? payload.occurred_at,
    }, replay?.sequence ?? 1);
    if (replay?.event_digest === candidate.event_digest) {
      const snapshot = buildSnapshot(
        payload.project_code,
        payload.work_id,
        existing,
      );
      await atomicReplace(path.join(workUnitRoot, "current.json"), snapshot);
      return {
        write_status: "replayed",
        snapshot,
      };
    }
    fail("work_already_started");
  }
  if (payload.operation !== "begin_work" && existing.length < 1) {
    fail("work_not_found");
  }
  const replay = existing.find(
    (candidate) => candidate.event_id === payload.event_id,
  );
  const event = buildEvent(
    binding,
    {
      ...payload,
      occurred_at: replay?.occurred_at ?? payload.occurred_at,
    },
    replay?.sequence ?? existing.length + 1,
  );
  if (replay) {
    if (replay.event_digest !== event.event_digest) fail("work_event_id_conflict");
    const snapshot = buildSnapshot(
      payload.project_code,
      payload.work_id,
      existing,
    );
    await atomicReplace(path.join(workUnitRoot, "current.json"), snapshot);
    return {
      write_status: "replayed",
      snapshot,
    };
  }
  if (
    existing.length > 0
    && payload.occurred_at < existing.at(-1).occurred_at
  ) {
    fail("work_event_time_regression");
  }
  if (
    payload.operation === "supersede_work"
    && payload.replacement_work_id !== null
  ) {
    const replacementRoot = path.join(
      paths.work_units,
      payload.replacement_work_id,
    );
    const replacementEvents = await readWorkEvents(replacementRoot);
    if (replacementEvents.length < 1) fail("replacement_work_not_found");
    const replacementSnapshot = buildSnapshot(
      payload.project_code,
      payload.replacement_work_id,
      replacementEvents,
    );
    if (replacementSnapshot.status === "superseded") {
      fail("replacement_work_not_current");
    }
  }
  const combined = [...existing, event];
  const snapshot = buildSnapshot(payload.project_code, payload.work_id, combined);
  const eventTarget = path.join(
    workUnitRoot,
    "events",
    eventFileName(event),
  );
  await atomicWriteNew(eventTarget, event);
  await atomicReplace(path.join(workUnitRoot, "current.json"), snapshot);
  return {
    write_status: "written",
    snapshot,
  };
}

async function registerLeader(paths, binding, payload) {
  const target = path.join(
    paths.leader_events,
    `${digest(payload.event_id)}.json`,
  );
  let existing = null;
  try {
    existing = await readJson(target, "leader_event");
  } catch (error) {
    if (error?.code !== "leader_event_invalid") throw error;
    const exists = await readFile(target, "utf8").catch((readError) => {
      if (readError?.code === "ENOENT") return null;
      throw readError;
    });
    if (exists !== null) throw error;
  }
  const event = buildEvent(binding, {
    ...payload,
    occurred_at: existing?.occurred_at ?? payload.occurred_at,
  });
  if (existing !== null && existing.event_digest !== event.event_digest) {
    fail("immutable_packet_conflict");
  }
  const writeStatus = await atomicWriteNew(target, event);
  return {
    write_status: writeStatus,
    leader: {
      project_code: payload.project_code,
      leader_thread_ref: payload.leader_thread_ref,
      title: payload.title,
      registered_at: event.occurred_at,
      event_id: payload.event_id,
    },
  };
}

async function listProjectWork(paths, projectCode) {
  let directories;
  try {
    directories = (await readdir(paths.work_units, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const snapshots = [];
  for (const workId of directories) {
    const events = await readWorkEvents(path.join(paths.work_units, workId));
    snapshots.push(buildSnapshot(projectCode, workId, events));
  }
  return snapshots.sort((left, right) => (
    right.last_event_at.localeCompare(left.last_event_at, "en")
    || left.work_id.localeCompare(right.work_id, "en")
  ));
}

export async function executeCodexWorkContextOperation({
  binding,
  bindingSha256,
  input,
}) {
  const normalizedBinding = normalizeCodexWorkContextBinding(binding);
  const payload = normalizeOperationPayload(input);
  projectConfig(normalizedBinding, payload.project_code);
  if (!SHA256.test(String(bindingSha256 ?? ""))) {
    fail("binding_sha256_invalid");
  }
  const paths = projectPaths(normalizedBinding, payload.project_code);
  if (payload.operation === "status") {
    const all = await listProjectWork(paths, payload.project_code);
    const workUnits = payload.work_id === null
      ? all
      : all.filter((item) => item.work_id === payload.work_id);
    if (payload.work_id !== null && workUnits.length < 1) fail("work_not_found");
    return {
      ok: true,
      operation: payload.operation,
      binding_id: normalizedBinding.binding_id,
      binding_sha256: bindingSha256,
      node_id: normalizedBinding.node_id,
      project_code: payload.project_code,
      active_count: workUnits.filter((item) => item.status === "active").length,
      completed_count: workUnits.filter((item) => item.status === "completed").length,
      superseded_count: workUnits.filter(
        (item) => item.status === "superseded",
      ).length,
      work_units: workUnits,
      claim_ceiling: "hpp_local_codex_context_evidence",
    };
  }
  if (payload.operation === "register_leader") {
    const result = await registerLeader(paths, normalizedBinding, payload);
    return {
      ok: true,
      operation: payload.operation,
      binding_id: normalizedBinding.binding_id,
      binding_sha256: bindingSha256,
      node_id: normalizedBinding.node_id,
      ...result,
      claim_ceiling: "hpp_local_codex_context_evidence",
    };
  }
  const result = await writeWorkEvent(
    paths,
    normalizedBinding,
    payload,
  );
  return {
    ok: true,
    operation: payload.operation,
    binding_id: normalizedBinding.binding_id,
    binding_sha256: bindingSha256,
    node_id: normalizedBinding.node_id,
    project_code: payload.project_code,
    work_id: payload.work_id,
    ...result,
    claim_ceiling: "hpp_local_codex_context_evidence",
  };
}
