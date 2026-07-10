import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, parse, posix, win32 } from "node:path";
import test from "node:test";

import {
  CODEX_MESSAGE_PAYLOAD_SCHEMA,
  CodexMessagePayloadStoreError,
  createCodexMessagePayloadStore,
  createOpaqueMessagePayloadRef,
  isMessagePayloadPathInside,
  validateMessagePayloadRef,
} from "../src/codex_message_payload_store.mjs";

const ITEM_A = "ITEM-001";
const ITEM_B = "ITEM-002";
const SERVICE_DIRECTORY = ".dev-erp-codex-message-payloads-v1";
const ITEM_DIRECTORY_DOMAIN = "dev-erp-codex-message-item-directory-v1\0";

function itemDirectoryName(itemId) {
  return createHash("sha256").update(ITEM_DIRECTORY_DOMAIN).update(itemId).digest("hex");
}

function itemDirectory(root, itemId) {
  return join(root, SERVICE_DIRECTORY, "items", itemDirectoryName(itemId));
}

function payloadDirectory(root, itemId, payloadRef) {
  return join(itemDirectory(root, itemId), payloadRef);
}

async function workspace(t, prefix = "dev-erp-message-payload-") {
  const temp = await nodeFs.mkdtemp(join(tmpdir(), prefix));
  const root = join(temp, "owner-workspaces");
  await nodeFs.mkdir(root);
  t.after(() => nodeFs.rm(temp, { recursive: true, force: true }));
  return { temp, root };
}

function expectStoreError(code) {
  return (error) => {
    assert.ok(error instanceof CodexMessagePayloadStoreError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  };
}

function isLinkPrivilegeError(error) {
  return ["EACCES", "EPERM", "UNKNOWN"].includes(error?.code);
}

test("opaque message refs are strict, high-entropy, and cryptographically item-bound", () => {
  const first = createOpaqueMessagePayloadRef(ITEM_A);
  const second = createOpaqueMessagePayloadRef(ITEM_A);
  assert.match(first, /^cmp_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first, second);
  assert.equal(validateMessagePayloadRef(first, { itemId: ITEM_A }), first);
  assert.throws(() => validateMessagePayloadRef(first, { itemId: ITEM_B }), expectStoreError("payload_cross_item_forbidden"));
  for (const invalid of ["", "cmp_short", "../payload", "cmp_C:/private_value_________________________"]) {
    assert.throws(() => validateMessagePayloadRef(invalid), expectStoreError("payload_ref_invalid"));
  }
});

test("Windows, UNC, and POSIX containment is separator-aware and platform-correct", () => {
  const drive = ["C", ":"].join("");
  const windowsRoot = win32.join(`${drive}${win32.sep}`, "Team", "Payloads");
  assert.equal(isMessagePayloadPathInside(windowsRoot, win32.join(windowsRoot, "Item", "payload.json")), true);
  assert.equal(isMessagePayloadPathInside(windowsRoot, win32.join(`${drive}${win32.sep}`, "team", "payloads", "item")), true);
  assert.equal(isMessagePayloadPathInside(windowsRoot, win32.join(`${drive}${win32.sep}`, "Team", "Payloads-copy")), false);

  const uncRoot = ["", "", "team-pc", "ApprovedShare", "Payloads"].join(win32.sep);
  assert.equal(isMessagePayloadPathInside(uncRoot, win32.join(uncRoot, "Item")), true);
  assert.equal(isMessagePayloadPathInside(uncRoot, ["", "", "other-pc", "ApprovedShare", "Item"].join(win32.sep)), false);

  const posixRoot = posix.join("/", "srv", "Payloads");
  assert.equal(isMessagePayloadPathInside(posixRoot, posix.join(posixRoot, "item", "payload.json")), true);
  assert.equal(isMessagePayloadPathInside(posixRoot, posix.join("/", "srv", "payloads", "item")), false);
  assert.equal(isMessagePayloadPathInside(windowsRoot, posixRoot), false);
});

test("store requires a pre-existing bounded owner root and exposes no path-bearing API state", async (t) => {
  const { root } = await workspace(t);
  const store = await createCodexMessagePayloadStore({ root });
  assert.deepEqual(Object.keys(store).sort(), ["resolveAuthorizedMessagePayload", "writeMessagePayload"]);
  assert.equal(JSON.stringify(store), "{}");
  assert.equal("root" in store, false);
  assert.equal("list" in store, false);
  assert.equal("read" in store, false);

  await assert.rejects(
    () => createCodexMessagePayloadStore({ root: "relative/workspaces" }),
    expectStoreError("payload_owner_root_invalid"),
  );
  await assert.rejects(
    () => createCodexMessagePayloadStore({ root: parse(root).root }),
    expectStoreError("payload_owner_root_too_broad"),
  );
  await assert.rejects(
    () => createCodexMessagePayloadStore({ root: join(root, "missing") }),
    expectStoreError("payload_store_initialization_failed"),
  );
});

test("all Codex message roles round-trip bounded UTF-8 while serialized results omit storage paths", async (t) => {
  const { root } = await workspace(t);
  const store = await createCodexMessagePayloadStore({ root });
  const messages = new Map([
    ["user", "사용자 질문 🧭"],
    ["assistant", "검증된 답변입니다."],
    ["error", "실행이 안전하게 중단되었습니다."],
    ["system", "승인된 과제 범위만 사용합니다."],
  ]);

  for (const [role, text] of messages) {
    const metadata = await store.writeMessagePayload({ itemId: ITEM_A, role, text });
    assert.deepEqual(Object.keys(metadata).sort(), ["byte_length", "payload_ref", "role", "sha256"]);
    assert.equal(metadata.role, role);
    assert.equal(metadata.byte_length, Buffer.byteLength(text, "utf8"));
    assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(metadata).includes(root), false);

    const resolved = await store.resolveAuthorizedMessagePayload({
      itemId: ITEM_A,
      payloadRef: metadata.payload_ref,
    });
    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.payload, {
      payload_ref: metadata.payload_ref,
      role,
      text,
      byte_length: Buffer.byteLength(text, "utf8"),
      sha256: metadata.sha256,
    });
    const serialized = JSON.stringify(resolved);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes(SERVICE_DIRECTORY), false);
  }
});

test("authorized resolver requires both item id and opaque ref and rejects cross-item access before I/O", async (t) => {
  const { root } = await workspace(t);
  const store = await createCodexMessagePayloadStore({ root });
  const metadata = await store.writeMessagePayload({ itemId: ITEM_A, role: "user", text: "private task text" });

  assert.deepEqual(await store.resolveAuthorizedMessagePayload({
    itemId: ITEM_B,
    payloadRef: metadata.payload_ref,
  }), { ok: false, error: "payload_cross_item_forbidden" });
  assert.deepEqual(await store.resolveAuthorizedMessagePayload({
    payloadRef: metadata.payload_ref,
  }), { ok: false, error: "payload_item_id_invalid" });
  assert.deepEqual(await store.resolveAuthorizedMessagePayload({
    itemId: ITEM_A,
    payloadRef: metadata.payload_ref,
    path: root,
  }), { ok: false, error: "payload_resolve_request_unknown_field" });
  assert.equal(JSON.stringify(await store.resolveAuthorizedMessagePayload({
    itemId: ITEM_A,
    payloadRef: "not-a-reference",
  })).includes(root), false);
});

test("UTF-8 byte limits, malformed Unicode, roles, and write request fields fail closed", async (t) => {
  const { root } = await workspace(t);
  const store = await createCodexMessagePayloadStore({ root, maxBytes: 8 });
  const accepted = await store.writeMessagePayload({ itemId: ITEM_A, role: "user", text: "한글" });
  assert.equal(accepted.byte_length, 6);
  await assert.rejects(
    () => store.writeMessagePayload({ itemId: ITEM_A, role: "user", text: "한글자" }),
    expectStoreError("payload_text_size_invalid"),
  );
  await assert.rejects(
    () => store.writeMessagePayload({ itemId: ITEM_A, role: "user", text: "" }),
    expectStoreError("payload_text_size_invalid"),
  );
  await assert.rejects(
    () => store.writeMessagePayload({ itemId: ITEM_A, role: "user", text: "\ud800" }),
    expectStoreError("payload_text_invalid_utf8"),
  );
  await assert.rejects(
    () => store.writeMessagePayload({ itemId: ITEM_A, role: "tool", text: "x" }),
    expectStoreError("payload_role_invalid"),
  );
  await assert.rejects(
    () => store.writeMessagePayload({ itemId: ITEM_A, role: "user", text: "x", path: root }),
    expectStoreError("payload_write_request_unknown_field"),
  );
});

test("exclusive reference-directory reservation prevents collision overwrite", async (t) => {
  const { root } = await workspace(t);
  const fixedRandom = () => Buffer.alloc(24, 7);
  const store = await createCodexMessagePayloadStore({ root, randomBytes: fixedRandom });
  const first = await store.writeMessagePayload({ itemId: ITEM_A, role: "assistant", text: "first committed text" });
  await assert.rejects(
    () => store.writeMessagePayload({ itemId: ITEM_A, role: "assistant", text: "must not overwrite" }),
    expectStoreError("payload_ref_collision"),
  );
  const resolved = await store.resolveAuthorizedMessagePayload({ itemId: ITEM_A, payloadRef: first.payload_ref });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.payload.text, "first committed text");
});

test("an interrupted write without the atomic commit marker is never readable", async (t) => {
  const { root } = await workspace(t);
  const failingFs = {
    ...nodeFs,
    open: async (path, flags, mode) => {
      if (basename(String(path)) === "committed") {
        const error = new Error("injected marker failure");
        error.code = "EIO";
        throw error;
      }
      return nodeFs.open(path, flags, mode);
    },
  };
  const fixedRandom = () => Buffer.alloc(24, 9);
  const failingStore = await createCodexMessagePayloadStore({ root, fs: failingFs, randomBytes: fixedRandom });
  await assert.rejects(
    () => failingStore.writeMessagePayload({ itemId: ITEM_A, role: "system", text: "not committed" }),
    expectStoreError("payload_write_failed"),
  );

  const ref = createOpaqueMessagePayloadRef(ITEM_A).replace(/_[A-Za-z0-9_-]{32}$/, `_${Buffer.alloc(24, 9).toString("base64url")}`);
  const normalStore = await createCodexMessagePayloadStore({ root });
  assert.deepEqual(await normalStore.resolveAuthorizedMessagePayload({ itemId: ITEM_A, payloadRef: ref }), {
    ok: false,
    error: "payload_unavailable",
  });
  assert.equal(await nodeFs.readFile(join(payloadDirectory(root, ITEM_A, ref), "payload.json"), "utf8").then((x) => x.includes("not committed")), true);
});

test("junction/symlink directories are rejected while an owner-provided root junction is pinned and allowed", async (t) => {
  const { temp, root } = await workspace(t);
  const outside = join(temp, "approved-junction-target");
  await nodeFs.mkdir(outside);
  const linkedOwnerRoot = join(temp, "owner-root-link");
  try {
    await nodeFs.symlink(outside, linkedOwnerRoot, "junction");
  } catch (error) {
    if (isLinkPrivilegeError(error)) return t.skip("junction creation is unavailable on this host");
    throw error;
  }
  const linkedStore = await createCodexMessagePayloadStore({ root: linkedOwnerRoot });
  const linkedMetadata = await linkedStore.writeMessagePayload({ itemId: ITEM_A, role: "user", text: "approved owner root" });
  assert.equal((await linkedStore.resolveAuthorizedMessagePayload({ itemId: ITEM_A, payloadRef: linkedMetadata.payload_ref })).ok, true);

  const store = await createCodexMessagePayloadStore({ root });
  const escapedTarget = join(temp, "escaped-item-target");
  await nodeFs.mkdir(escapedTarget);
  const escapedItemDirectory = itemDirectory(root, ITEM_B);
  try {
    await nodeFs.symlink(escapedTarget, escapedItemDirectory, "junction");
  } catch (error) {
    if (isLinkPrivilegeError(error)) return t.skip("junction creation is unavailable on this host");
    throw error;
  }
  await assert.rejects(
    () => store.writeMessagePayload({ itemId: ITEM_B, role: "user", text: "must not escape" }),
    expectStoreError("payload_symlink_forbidden"),
  );
  assert.deepEqual(await nodeFs.readdir(escapedTarget), []);
});

test("payload hardlink replacements are rejected without returning text", async (t) => {
  const { temp, root } = await workspace(t);
  const store = await createCodexMessagePayloadStore({ root });

  const hardlinkMetadata = await store.writeMessagePayload({ itemId: ITEM_A, role: "assistant", text: "hardlink protected" });
  const hardlinkPayload = join(payloadDirectory(root, ITEM_A, hardlinkMetadata.payload_ref), "payload.json");
  const externalHardlinkSource = join(temp, "external-hardlink-source.json");
  await nodeFs.writeFile(externalHardlinkSource, await nodeFs.readFile(hardlinkPayload));
  await nodeFs.unlink(hardlinkPayload);
  await nodeFs.link(externalHardlinkSource, hardlinkPayload);
  assert.deepEqual(await store.resolveAuthorizedMessagePayload({ itemId: ITEM_A, payloadRef: hardlinkMetadata.payload_ref }), {
    ok: false,
    error: "payload_hardlink_forbidden",
  });
});

test("payload symlink replacements are rejected without returning text", async (t) => {
  const { temp, root } = await workspace(t);
  const store = await createCodexMessagePayloadStore({ root });

  const symlinkMetadata = await store.writeMessagePayload({ itemId: ITEM_A, role: "error", text: "symlink protected" });
  const symlinkPayload = join(payloadDirectory(root, ITEM_A, symlinkMetadata.payload_ref), "payload.json");
  const externalSymlinkSource = join(temp, "external-symlink-source.json");
  await nodeFs.writeFile(externalSymlinkSource, await nodeFs.readFile(symlinkPayload));
  await nodeFs.unlink(symlinkPayload);
  try {
    await nodeFs.symlink(externalSymlinkSource, symlinkPayload, "file");
  } catch (error) {
    if (isLinkPrivilegeError(error)) return t.skip("file symlink creation is unavailable on this host");
    throw error;
  }
  assert.deepEqual(await store.resolveAuthorizedMessagePayload({ itemId: ITEM_A, payloadRef: symlinkMetadata.payload_ref }), {
    ok: false,
    error: "payload_symlink_forbidden",
  });
});

test("envelope tampering, copying, and invalid UTF-8 fail closed", async (t) => {
  const { root } = await workspace(t);
  const store = await createCodexMessagePayloadStore({ root });
  const metadata = await store.writeMessagePayload({ itemId: ITEM_A, role: "assistant", text: "trusted response" });
  const payloadFile = join(payloadDirectory(root, ITEM_A, metadata.payload_ref), "payload.json");
  const original = JSON.parse(await nodeFs.readFile(payloadFile, "utf8"));
  assert.equal(original.schema, CODEX_MESSAGE_PAYLOAD_SCHEMA);
  original.text = "tampered response";
  original.byte_length = Buffer.byteLength(original.text, "utf8");
  await nodeFs.writeFile(payloadFile, JSON.stringify(original));
  assert.deepEqual(await store.resolveAuthorizedMessagePayload({ itemId: ITEM_A, payloadRef: metadata.payload_ref }), {
    ok: false,
    error: "payload_envelope_hash_mismatch",
  });

  const invalidUtf8 = await store.writeMessagePayload({ itemId: ITEM_A, role: "system", text: "valid before disk tamper" });
  const invalidUtf8File = join(payloadDirectory(root, ITEM_A, invalidUtf8.payload_ref), "payload.json");
  await nodeFs.writeFile(invalidUtf8File, Buffer.from([0xff, 0xfe, 0xfd]));
  assert.deepEqual(await store.resolveAuthorizedMessagePayload({ itemId: ITEM_A, payloadRef: invalidUtf8.payload_ref }), {
    ok: false,
    error: "payload_envelope_invalid",
  });
});
