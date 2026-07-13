import fs from "node:fs/promises";
import path from "node:path";

import { sha256Bytes } from "./canonical.mjs";
import { MAX_INPUT_REF_SIZE } from "./contract.mjs";
import { fail } from "./errors.mjs";

function confined(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function createFilesystemPayloadAdapter({ bindings, allowedRoots }) {
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) fail("payload_bindings_invalid", "Payload bindings must be an exact ref-to-path object");
  if (!Array.isArray(allowedRoots) || allowedRoots.length < 1 || allowedRoots.some((root) => typeof root !== "string" || !path.isAbsolute(root))) {
    fail("payload_roots_invalid", "Payload adapter requires absolute allowed roots");
  }
  const bindingEntries = Object.entries(bindings);
  for (const [, target] of bindingEntries) {
    if (typeof target !== "string" || !path.isAbsolute(target)) fail("payload_binding_path_invalid", "Payload binding paths must be absolute");
  }
  const bindingMap = new Map(bindingEntries);

  return {
    async read(ref) {
      const target = bindingMap.get(ref.payload_ref);
      if (!target) fail("payload_ref_unbound", `No filesystem binding for ${ref.payload_ref}`);
      const metadata = await fs.lstat(target);
      if (!metadata.isFile() || metadata.isSymbolicLink()) fail("payload_not_regular_file", "Payload binding must resolve from a non-symlink regular file");
      if (metadata.size !== ref.size || metadata.size < 1 || metadata.size > MAX_INPUT_REF_SIZE) fail("payload_declared_size_mismatch", "Payload size does not match its request contract");
      const realTarget = await fs.realpath(target);
      const realRoots = await Promise.all(allowedRoots.map((root) => fs.realpath(root)));
      if (!realRoots.some((root) => confined(root, realTarget))) fail("payload_root_not_approved", "Payload file is outside approved roots");
      const bytes = await fs.readFile(realTarget);
      if (sha256Bytes(bytes) !== ref.sha256) fail("payload_declared_hash_mismatch", "Payload hash does not match its request contract");
      return bytes;
    },
  };
}
