import { createHash } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

function pathInside(base, target) {
  const rel = relative(resolve(base), resolve(target));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function filesystemIdentity(stat) {
  const scalar = (value) => typeof value === "bigint"
    ? value.toString(10)
    : (Number.isSafeInteger(value) ? String(value) : null);
  const dev = scalar(stat?.dev);
  const ino = scalar(stat?.ino);
  return dev !== null && ino !== null && (dev !== "0" || ino !== "0") ? `${dev}:${ino}` : null;
}

export function inspectCodexPayloadOwner({ backendRoot, ownerBase, roots, configured = true }) {
  const resolvedBackend = resolve(backendRoot);
  const resolvedBase = resolve(ownerBase);
  const resolvedRoots = Array.isArray(roots) ? roots.map((root) => resolve(root)) : [];
  const lexicalSafe = resolvedRoots.length > 0
    && resolvedRoots.every((root) => pathInside(resolvedBase, root));
  let ready = false;
  let revision = null;
  try {
    const backendLink = lstatSync(resolvedBackend, { bigint: true });
    const ownerLink = lstatSync(resolvedBase, { bigint: true });
    if (!backendLink.isDirectory() || backendLink.isSymbolicLink()
        || !ownerLink.isDirectory() || ownerLink.isSymbolicLink()) throw new Error("payload_owner_unsafe");
    const realBackend = realpathSync(resolvedBackend);
    const realBase = realpathSync(resolvedBase);
    if (!pathInside(realBackend, realBase)) throw new Error("payload_owner_escape");
    const rootReceipts = resolvedRoots.map((root) => {
      const link = lstatSync(root, { bigint: true });
      if (!link.isDirectory() || link.isSymbolicLink()) throw new Error("payload_root_unsafe");
      const real = realpathSync(root);
      const identity = filesystemIdentity(statSync(real, { bigint: true }));
      if (!identity) throw new Error("payload_root_identity_unavailable");
      return { real, identity };
    });
    ready = lexicalSafe && rootReceipts.every(({ real }) => pathInside(realBase, real));
    if (ready) {
      revision = createHash("sha256").update(rootReceipts.map(({ real, identity }) => (
        `${process.platform === "win32" ? real.toLowerCase() : real}\0${identity}`
      )).join("\0")).digest("hex");
    }
  } catch {}
  return Object.freeze({
    configured: configured === true,
    roots_safe: ready,
    revision,
  });
}
