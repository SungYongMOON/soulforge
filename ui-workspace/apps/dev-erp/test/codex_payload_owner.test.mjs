import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  CODEX_PAYLOAD_APPROVED_CHILD_NAMES,
  codexPayloadDenyBindingRevision,
  inspectCodexPayloadOwner,
} from "../src/codex_payload_owner.mjs";

function createPayloadTree(ownerRoot) {
  const ownerBase = join(ownerRoot, "dev-erp");
  const roots = CODEX_PAYLOAD_APPROVED_CHILD_NAMES.map((name) => join(ownerBase, name));
  for (const root of roots) mkdirSync(root, { recursive: true });
  return { ownerBase, roots };
}

function inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, roots) {
  return inspectCodexPayloadOwner({ backendRoot, workspaceOwnerRoot, ownerBase, roots });
}

function makeDirectoryLink(target, link) {
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
}

test("payload deny binding is pathless, deterministic, and does not require either root to exist", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-payload-deny-binding-"));
  const attachmentRoot = join(root, "missing-attachments");
  const messagePayloadRoot = join(root, "missing-messages");
  rmSync(root, { recursive: true, force: true });

  const revision = codexPayloadDenyBindingRevision({ attachmentRoot, messagePayloadRoot });
  assert.match(revision, /^[a-f0-9]{64}$/);
  assert.equal(codexPayloadDenyBindingRevision({ attachmentRoot, messagePayloadRoot }), revision);
  assert.notEqual(
    codexPayloadDenyBindingRevision({ attachmentRoot: messagePayloadRoot, messagePayloadRoot: attachmentRoot }),
    revision,
  );
  assert.equal(revision.includes(root), false);
  assert.throws(
    () => codexPayloadDenyBindingRevision({ attachmentRoot, messagePayloadRoot: attachmentRoot }),
    /payload_deny_binding_invalid/,
  );
});

test("payload owner accepts the exact non-junction owner and two approved child roots", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-payload-owner-local-"));
  try {
    const backendRoot = join(root, "backend");
    const workspaceOwnerRoot = join(backendRoot, "_workspaces", "system");
    const { ownerBase, roots } = createPayloadTree(workspaceOwnerRoot);

    const first = inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, roots);
    const reordered = inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, [...roots].reverse());

    assert.equal(first.roots_safe, true);
    assert.match(first.revision, /^[a-f0-9]{64}$/);
    assert.equal(reordered.revision, first.revision);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("payload owner accepts the exact system junction and pins its real identity", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-payload-owner-junction-"));
  try {
    const backendRoot = join(root, "backend");
    const workspaceOwnerRoot = join(backendRoot, "_workspaces", "system");
    const realOwnerA = join(root, "outside", "system-a");
    const realOwnerB = join(root, "outside", "system-b");
    const realOwnerEscape = join(root, "outside", "system-escape");
    const escapedBase = join(root, "escaped-payload-owner");
    createPayloadTree(realOwnerA);
    createPayloadTree(realOwnerB);
    const escapedOwner = createPayloadTree(escapedBase);
    mkdirSync(realOwnerEscape, { recursive: true });
    makeDirectoryLink(escapedOwner.ownerBase, join(realOwnerEscape, "dev-erp"));
    makeDirectoryLink(realOwnerA, workspaceOwnerRoot);

    const ownerBase = join(workspaceOwnerRoot, "dev-erp");
    const roots = CODEX_PAYLOAD_APPROVED_CHILD_NAMES.map((name) => join(ownerBase, name));
    const first = inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, roots);
    assert.equal(first.roots_safe, true);

    unlinkSync(workspaceOwnerRoot);
    makeDirectoryLink(realOwnerB, workspaceOwnerRoot);
    const retargeted = inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, roots);
    assert.equal(retargeted.roots_safe, true);
    assert.notEqual(retargeted.revision, first.revision);

    unlinkSync(workspaceOwnerRoot);
    makeDirectoryLink(realOwnerEscape, workspaceOwnerRoot);
    const escaped = inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, roots);
    assert.equal(escaped.roots_safe, false);
    assert.equal(escaped.revision, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("payload owner rejects arbitrary owner roots, owner bases, and extra child roots", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-payload-owner-lexical-"));
  try {
    const backendRoot = join(root, "backend");
    const workspaceOwnerRoot = join(backendRoot, "_workspaces", "system");
    const { ownerBase, roots } = createPayloadTree(workspaceOwnerRoot);
    const externalOwnerRoot = join(root, "external-system");
    const external = createPayloadTree(externalOwnerRoot);
    const extraRoot = join(ownerBase, "arbitrary-third-child");
    mkdirSync(extraRoot, { recursive: true });

    assert.equal(inspectFixture(backendRoot, externalOwnerRoot, external.ownerBase, external.roots).roots_safe, false);
    assert.equal(inspectFixture(backendRoot, workspaceOwnerRoot, join(workspaceOwnerRoot, "other-owner"), roots).roots_safe, false);
    assert.equal(inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, [...roots, extraRoot]).roots_safe, false);
    assert.equal(inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, [roots[0], extraRoot]).roots_safe, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("payload owner rejects a child junction that escapes the real workspace owner", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-payload-owner-escape-"));
  try {
    const backendRoot = join(root, "backend");
    const workspaceOwnerRoot = join(backendRoot, "_workspaces", "system");
    const ownerBase = join(workspaceOwnerRoot, "dev-erp");
    const externalRoot = join(root, "external-attachments");
    mkdirSync(externalRoot, { recursive: true });
    mkdirSync(ownerBase, { recursive: true });
    const roots = CODEX_PAYLOAD_APPROVED_CHILD_NAMES.map((name) => join(ownerBase, name));
    makeDirectoryLink(externalRoot, roots[0]);
    mkdirSync(roots[1], { recursive: true });

    const result = inspectFixture(backendRoot, workspaceOwnerRoot, ownerBase, roots);
    assert.equal(result.roots_safe, false);
    assert.equal(result.revision, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
