import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

export const AGENT_RUNTIME_BINDINGS_SCHEMA = "soulforge.team_ops_board.agent_runtime_bindings.v1";

const MAX_BINDING_BYTES = 65_536;
const ROOT_FIELDS = new Set(["schema_version", "metadata_only", "bindings"]);
const ROW_FIELDS = new Set(["bot_id", "agent_id", "display_label", "hermes_session_key"]);

const UNCONFIGURED_RESULT = Object.freeze({
  state: "hold",
  hold_code: "AGENT_RUNTIME_BINDINGS_UNCONFIGURED",
  bindings: Object.freeze([]),
});
const INVALID_RESULT = Object.freeze({
  state: "hold",
  hold_code: "AGENT_RUNTIME_BINDINGS_INVALID",
  bindings: Object.freeze([]),
});

function isInjectedLocalPath(value) {
  return typeof value === "string"
    && value.length > 0
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && path.isAbsolute(value)
    && !/^(?:\\\\|\/\/)/u.test(value)
    && path.resolve(value) === value;
}

function pathsEqual(first, second) {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function sameIdentity(first, second) {
  return String(first.dev) === String(second.dev)
    && String(first.ino) === String(second.ino)
    && first.size === second.size
    && first.mtimeMs === second.mtimeMs;
}

function validFileStat(metadata) {
  return metadata.isFile()
    && !metadata.isSymbolicLink()
    && metadata.nlink === 1
    && metadata.size > 0
    && metadata.size <= MAX_BINDING_BYTES;
}

async function readStableBindingFile(bindingPath, testHooks) {
  const lstatFile = testHooks.lstat ?? lstat;
  const realpathFile = testHooks.realpath ?? realpath;
  const openFile = testHooks.open ?? open;
  const before = await lstatFile(bindingPath);
  if (!validFileStat(before)) throw new Error("binding_file_invalid");
  const canonical = await realpathFile(bindingPath);
  const comparePaths = testHooks.pathsEqual ?? pathsEqual;
  if (!comparePaths(canonical, bindingPath)) throw new Error("binding_file_invalid");
  await testHooks.beforeOpen?.(bindingPath);

  let handle;
  try {
    handle = await openFile(bindingPath, "r");
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(before, opened)) {
      throw new Error("binding_file_invalid");
    }
    await testHooks.beforeRead?.(bindingPath);
    const bytes = await handle.readFile();
    if (bytes.byteLength > MAX_BINDING_BYTES) throw new Error("binding_file_invalid");
    const afterHandle = await handle.stat();
    const afterPath = await lstatFile(bindingPath);
    if (!validFileStat(afterPath) || !sameIdentity(opened, afterHandle) || !sameIdentity(opened, afterPath)) {
      throw new Error("binding_file_invalid");
    }
    return bytes;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function isBoundedString(value, maximum) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validateBindingDocument(value) {
  if (
    !hasExactKeys(value, ROOT_FIELDS)
    || value.schema_version !== AGENT_RUNTIME_BINDINGS_SCHEMA
    || value.metadata_only !== true
    || !Array.isArray(value.bindings)
    || value.bindings.length === 0
    || value.bindings.length > 100
  ) {
    throw new Error("binding_document_invalid");
  }

  const botIds = new Set();
  const agentIds = new Set();
  const sessionKeys = new Set();
  const bindings = [];
  for (const row of value.bindings) {
    if (
      !hasExactKeys(row, ROW_FIELDS)
      || !isBoundedString(row.bot_id, 200)
      || !isBoundedString(row.agent_id, 200)
      || !isBoundedString(row.display_label, 200)
      || !(row.hermes_session_key === null || isBoundedString(row.hermes_session_key, 512))
      || botIds.has(row.bot_id)
      || agentIds.has(row.agent_id)
      || (row.hermes_session_key !== null && sessionKeys.has(row.hermes_session_key))
    ) {
      throw new Error("binding_document_invalid");
    }
    botIds.add(row.bot_id);
    agentIds.add(row.agent_id);
    if (row.hermes_session_key !== null) sessionKeys.add(row.hermes_session_key);
    bindings.push({
      bot_id: row.bot_id,
      agent_id: row.agent_id,
      display_label: row.display_label,
      hermes_session_key: row.hermes_session_key,
    });
  }
  return bindings;
}

export async function loadAgentRuntimeBindings({ bindingPath, testHooks = {} } = {}) {
  if (bindingPath === undefined || bindingPath === null || bindingPath === "") {
    return UNCONFIGURED_RESULT;
  }
  if (!isInjectedLocalPath(bindingPath)) return INVALID_RESULT;
  try {
    const bytes = await readStableBindingFile(bindingPath, testHooks);
    const bindings = validateBindingDocument(JSON.parse(bytes.toString("utf8")));
    return { state: "ready", hold_code: null, bindings };
  } catch {
    return INVALID_RESULT;
  }
}
