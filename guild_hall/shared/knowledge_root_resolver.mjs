import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { comparablePathIdentity } from "./physical_path_identity.mjs";

export const ROOT_STATUS = Object.freeze({
  RESOLVED: "resolved",
});

const identities = new WeakMap();

export class KnowledgeRootResolverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KnowledgeRootResolverError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new KnowledgeRootResolverError(code, message);
}

function normalizedAbsolute(value, field) {
  const unsafeCode = `${field}_unsafe`;
  const hasControl = typeof value === "string" && /[\u0000-\u001f\u007f]/u.test(value);
  const hasNetworkOrDevicePrefix = typeof value === "string"
    && (value.startsWith("\\\\") || value.startsWith("//"));
  const drivePrefix = typeof value === "string" && /^[A-Za-z]:[\\/]/u.test(value);
  const firstColon = typeof value === "string" ? value.indexOf(":") : -1;
  const hasAlternateDataStream = firstColon >= 0
    && (!(drivePrefix && firstColon === 1) || value.indexOf(":", 2) >= 0);
  const hasNonCanonicalUnicode = typeof value === "string" && value.normalize("NFC") !== value;
  const windowsSegments = typeof value === "string" && process.platform === "win32"
    ? value.slice(drivePrefix ? 3 : 0).split(/[\\/]/u).filter(Boolean)
    : [];
  const hasWindowsAliasForm = windowsSegments.some((segment) => (
    /[. ]$/u.test(segment)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(segment)
  ));
  if (hasControl || hasNetworkOrDevicePrefix || hasAlternateDataStream
      || hasNonCanonicalUnicode || hasWindowsAliasForm) {
    fail(unsafeCode, `${field} contains a forbidden path form`);
  }
  if (typeof value !== "string" || value.length === 0 || !isAbsolute(value)) {
    fail(`${field}_invalid`, `${field} must be a normalized absolute path`);
  }
  const normalized = resolve(value);
  if (comparablePathIdentity(normalized) !== comparablePathIdentity(value)) {
    fail(`${field}_invalid`, `${field} must be a normalized absolute path`);
  }
  return normalized;
}

function containedBy(root, candidate) {
  const delta = relative(root, candidate);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`));
}

function authentic(value) {
  const identity = value !== null && typeof value === "object" ? identities.get(value) : undefined;
  if (identity === undefined) {
    fail("invalid_resolution", "An authentic knowledge-root resolution is required");
  }
  return identity;
}

function assertDirectDescendant(containment, requested) {
  const delta = relative(containment, requested);
  let cursor = containment;
  for (const segment of delta === "" ? [] : delta.split(sep)) {
    cursor = join(cursor, segment);
    let stat;
    try {
      stat = lstatSync(cursor);
    } catch {
      fail("root_unavailable", "Knowledge-root metadata is unavailable");
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail("root_not_direct_directory", "Knowledge root must be a direct directory");
    }
  }
  return delta;
}

export function resolveKnowledgeRoot(path, { containmentRoot } = {}) {
  const requested = normalizedAbsolute(path, "path");
  const containment = normalizedAbsolute(containmentRoot, "containment_root");
  if (comparablePathIdentity(containment) === comparablePathIdentity(requested)) {
    fail("root_must_be_strict_descendant", "Knowledge root must be below its containment root");
  }
  if (!containedBy(
    comparablePathIdentity(containment),
    comparablePathIdentity(requested),
  )) {
    fail("root_outside_containment", "Knowledge root is outside its containment root");
  }
  const lexicalDelta = assertDirectDescendant(containment, requested);

  let requestedStat;
  let containmentStat;
  let requestedReal;
  let containmentReal;
  try {
    requestedStat = lstatSync(requested);
    containmentStat = lstatSync(containment);
    requestedReal = realpathSync.native(requested);
    containmentReal = realpathSync.native(containment);
  } catch {
    fail("root_unavailable", "Knowledge-root metadata is unavailable");
  }
  if (!requestedStat.isDirectory() || requestedStat.isSymbolicLink()) {
    fail("root_not_direct_directory", "Knowledge root must be a direct directory");
  }
  if (!containmentStat.isDirectory() && !containmentStat.isSymbolicLink()) {
    fail("containment_not_directory", "Containment root must resolve to a directory");
  }

  const comparableRequested = comparablePathIdentity(requestedReal);
  const comparableContainment = comparablePathIdentity(containmentReal);
  if (comparableRequested === comparableContainment) {
    fail("root_must_be_strict_descendant", "Knowledge root must be below its containment root");
  }
  if (!containedBy(comparableContainment, comparableRequested)) {
    fail("root_outside_containment", "Knowledge root is outside its containment root");
  }
  if (comparablePathIdentity(resolve(containmentReal, lexicalDelta)) !== comparableRequested) {
    fail("root_not_direct_directory", "Knowledge root must be a direct directory");
  }

  const result = Object.freeze({
    status: ROOT_STATUS.RESOLVED,
    // Local admission evidence only. This is a domain-separated commitment to the
    // observed realpath string, not directory content, a stable file identity, or a
    // publishable secret. Any later body read must revalidate its own open handle.
    local_path_commitment_sha256: `sha256:${createHash("sha256")
      .update("soulforge.knowledge_root.local_path.v0\0")
      .update(comparableRequested)
      .digest("hex")}`,
  });
  identities.set(result, { comparable_realpath: comparableRequested });
  return result;
}

export function containsRoot(root, candidate) {
  const rootIdentity = authentic(root);
  const candidateIdentity = authentic(candidate);
  return containedBy(rootIdentity.comparable_realpath, candidateIdentity.comparable_realpath);
}

export function rootRelation(left, right) {
  const leftIdentity = authentic(left);
  const rightIdentity = authentic(right);
  if (leftIdentity.comparable_realpath === rightIdentity.comparable_realpath) return "same";
  if (containedBy(leftIdentity.comparable_realpath, rightIdentity.comparable_realpath)) return "contains";
  if (containedBy(rightIdentity.comparable_realpath, leftIdentity.comparable_realpath)) return "contained_by";
  return "disjoint";
}
