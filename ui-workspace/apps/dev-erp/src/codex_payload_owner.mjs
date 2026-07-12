import { createHash } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const CODEX_PAYLOAD_APPROVED_CHILD_NAMES = Object.freeze([
  "codex-task-attachments",
  "codex-message-payloads",
]);
export const CODEX_PAYLOAD_DENY_BINDING_SCHEMA = "dev_erp.codex_payload_deny_binding.v1";

const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function pathInside(base, target) {
  const rel = relative(resolve(base), resolve(target));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function pathKey(value) {
  const resolved = resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return pathKey(left) === pathKey(right);
}

export function codexPayloadDenyBindingRevision({ attachmentRoot, messagePayloadRoot } = {}) {
  const roots = [attachmentRoot, messagePayloadRoot].map((value) => {
    if (typeof value !== "string" || !value || value !== value.trim()
        || CONTROL_RE.test(value) || !isAbsolute(value)) {
      throw new Error("payload_deny_binding_invalid");
    }
    return pathKey(value);
  });
  if (roots[0] === roots[1]) throw new Error("payload_deny_binding_invalid");
  return createHash("sha256").update(Buffer.from(JSON.stringify({
    schema: CODEX_PAYLOAD_DENY_BINDING_SCHEMA,
    attachment_root: roots[0],
    message_payload_root: roots[1],
  }), "utf8")).digest("hex");
}

export function filesystemIdentity(stat) {
  const scalar = (value) => typeof value === "bigint"
    ? value.toString(10)
    : (Number.isSafeInteger(value) ? String(value) : null);
  const dev = scalar(stat?.dev);
  const ino = scalar(stat?.ino);
  return dev !== null && ino !== null && (dev !== "0" || ino !== "0") ? `${dev}:${ino}` : null;
}

function directoryReceipt(path, { allowLink = false } = {}) {
  const link = lstatSync(path, { bigint: true });
  if ((!link.isDirectory() && !link.isSymbolicLink())
      || (!allowLink && link.isSymbolicLink())) throw new Error("payload_owner_unsafe");
  const real = realpathSync(path);
  const stat = statSync(real, { bigint: true });
  if (!stat.isDirectory()) throw new Error("payload_owner_unsafe");
  const identity = filesystemIdentity(stat);
  if (!identity) throw new Error("payload_owner_identity_unavailable");
  return { real, identity };
}

export function inspectCodexPayloadOwner({
  backendRoot,
  workspaceOwnerRoot,
  ownerBase,
  roots,
  configured = true,
}) {
  const resolvedBackend = resolve(backendRoot);
  const resolvedWorkspaceOwner = resolve(workspaceOwnerRoot);
  const resolvedBase = resolve(ownerBase);
  const resolvedRoots = Array.isArray(roots) ? roots.map((root) => resolve(root)) : [];
  const expectedWorkspaceOwner = resolve(resolvedBackend, "_workspaces", "system");
  const expectedBase = resolve(resolvedWorkspaceOwner, "dev-erp");
  const expectedRoots = CODEX_PAYLOAD_APPROVED_CHILD_NAMES.map((name) => resolve(resolvedBase, name));
  const lexicalSafe = samePath(resolvedWorkspaceOwner, expectedWorkspaceOwner)
    && samePath(resolvedBase, expectedBase)
    && resolvedRoots.length === expectedRoots.length
    && expectedRoots.every((expected) => resolvedRoots.some((root) => samePath(root, expected)));
  let ready = false;
  let revision = null;
  try {
    if (!lexicalSafe) throw new Error("payload_owner_lexical_escape");
    const backendReceipt = directoryReceipt(resolvedBackend);
    const workspaceOwnerReceipt = directoryReceipt(resolvedWorkspaceOwner, { allowLink: true });
    const ownerReceipt = directoryReceipt(resolvedBase);
    if (!pathInside(workspaceOwnerReceipt.real, ownerReceipt.real)
        || !samePath(ownerReceipt.real, resolve(workspaceOwnerReceipt.real, "dev-erp"))) {
      throw new Error("payload_owner_real_escape");
    }
    const rootReceipts = expectedRoots.map((root, index) => {
      const receipt = directoryReceipt(root);
      if (!pathInside(ownerReceipt.real, receipt.real)
          || !samePath(receipt.real, resolve(ownerReceipt.real, CODEX_PAYLOAD_APPROVED_CHILD_NAMES[index]))) {
        throw new Error("payload_root_real_escape");
      }
      return receipt;
    });
    ready = true;
    if (ready) {
      const receipts = [
        ["backend", backendReceipt],
        ["workspace-owner", workspaceOwnerReceipt],
        ["payload-owner", ownerReceipt],
        ...rootReceipts.map((receipt, index) => [CODEX_PAYLOAD_APPROVED_CHILD_NAMES[index], receipt]),
      ];
      revision = createHash("sha256").update(receipts.map(([name, { real, identity }]) => (
        `${name}\0${pathKey(real)}\0${identity}`
      )).join("\0")).digest("hex");
    }
  } catch {}
  return Object.freeze({
    configured: configured === true,
    roots_safe: ready,
    revision,
  });
}
