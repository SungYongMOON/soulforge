// A file inventory and declared npm descriptors from ONE fully verified root.
// Callers retain custody of a quiescent directory during the operation. These
// checks detect static aliases/links and observed read changes, not every
// hostile concurrent OS mutation. A manifest pin is byte identity, not trust.
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { recomputePackDigest } from "../../shared/pack_digest_recipe.mjs";
import { validateCycloneDx16 } from "./pack_sbom_schema.mjs";

export const SBOM_POLICY = "required_cyclonedx_1_6";
export const SBOM_LIMITS = Object.freeze({ manifest: 16 * 1024 * 1024, sbom: 64 * 1024 * 1024, file: 64 * 1024 * 1024, descriptor: 256 * 1024, total: 512 * 1024 * 1024, files: 50_000, entries: 100_000, depth: 80 });
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const HASH = /^[a-f0-9]{64}$/;
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const stable = (v) => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;
export const encodeSbomJson = (v) => Buffer.from(`${JSON.stringify(stable(v), null, 2)}\n`);
const prop = (name, value) => ({ name: `soulforge:${name}`, value: String(value) });
// Windows file IDs can exceed Number's safe integer range. Preserve the full
// inode/dev and nanosecond identity with bigint stats throughout byte checks.
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink;

function safeRelative(value) {
  if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*$/.test(value)) fail("sbom_path_invalid");
  for (const part of value.split("/")) {
    if (/^\.+$/.test(part) || part.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) fail("sbom_path_invalid");
  }
  if (value.split("/").length > SBOM_LIMITS.depth) fail("sbom_limit_exceeded");
}

function realChain(target) {
  if (typeof target !== "string" || !isAbsolute(target)) fail("sbom_root_required");
  const absolute = resolve(target), root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) fail("sbom_link_refused");
  }
  return absolute;
}

// Bounded read for the artifact adapter as well as manifested files. Errors
// expose codes only, never an OS absolute path or input JSON contents.
export function readSbomFile(path, limit) {
  try {
    realChain(path);
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n) fail("sbom_file_kind_invalid");
    if (before.size > BigInt(limit)) fail("sbom_limit_exceeded");
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = fstatSync(fd, { bigint: true });
      if (!opened.isFile() || !sameIdentity(before, opened)) fail("sbom_read_changed");
      const bytes = Buffer.alloc(Number(opened.size) + 1);
      let length = 0;
      while (length < bytes.length) {
        const count = readSync(fd, bytes, length, bytes.length - length, length);
        if (!count) break;
        length += count;
      }
      const after = fstatSync(fd, { bigint: true }), leaf = lstatSync(path, { bigint: true });
      if (BigInt(length) !== opened.size || !sameIdentity(opened, after) || !sameIdentity(after, leaf) || leaf.isSymbolicLink()) fail("sbom_read_changed");
      realChain(path);
      return bytes.subarray(0, length);
    } finally { closeSync(fd); }
  } catch (error) {
    if (error.code?.startsWith("sbom_")) throw error;
    fail("sbom_file_unreadable");
  }
}

function json(bytes, limit, code) {
  if (!(bytes instanceof Uint8Array) || bytes.length > limit) fail("sbom_limit_exceeded");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { fail(code); }
}

function manifestFrom(bytes, expected) {
  if (!HASH.test(expected ?? "") || sha256(bytes) !== expected) fail("sbom_manifest_pin_invalid");
  const m = json(bytes, SBOM_LIMITS.manifest, "sbom_manifest_invalid");
  if (!m || m.schema !== "soulforge.deployment_pack_manifest.v0" || !HASH.test(m.pack_digest ?? "")
    || typeof m.pack_id !== "string" || !/^[a-z][a-z0-9_]{0,79}$/.test(m.pack_id)
    || typeof m.version !== "string" || !/^\d+\.\d+\.\d+$/.test(m.version) || m.version.length > 64
    || !Array.isArray(m.files) || !m.files.length || m.files.length > SBOM_LIMITS.files
    || (m.sbom_policy !== undefined && m.sbom_policy !== SBOM_POLICY)) fail("sbom_manifest_invalid");
  let total = 0;
  const seen = new Set();
  for (const e of m.files) {
    if (!e || typeof e !== "object") fail("sbom_manifest_invalid");
    safeRelative(e.path);
    if (seen.has(e.path.toLowerCase())) fail("sbom_path_alias");
    seen.add(e.path.toLowerCase());
    if (!HASH.test(e.sha256 ?? "") || !Number.isSafeInteger(e.bytes) || e.bytes < 0) fail("sbom_manifest_invalid");
    total += e.bytes;
    if (e.bytes > SBOM_LIMITS.file || total > SBOM_LIMITS.total || (basename(e.path) === "package.json" && e.bytes > SBOM_LIMITS.descriptor)) fail("sbom_limit_exceeded");
  }
  if (recomputePackDigest(m.files) !== m.pack_digest) fail("sbom_pack_digest_invalid");
  return m;
}

function verifyPayload(root, manifest) {
  const actual = [], directories = [], identities = new Set(), names = new Set();
  let count = 0;
  const walk = (dir, prefix = "") => {
    const before = lstatSync(dir, { bigint: true });
    if (!before.isDirectory() || before.isSymbolicLink()) fail("sbom_link_refused");
    directories.push([dir, before]);
    for (const name of readdirSync(dir).sort()) {
      if (++count > SBOM_LIMITS.entries) fail("sbom_limit_exceeded");
      const rel = `${prefix}${name}`;
      safeRelative(rel);
      if (names.has(rel.toLowerCase())) fail("sbom_path_alias");
      names.add(rel.toLowerCase());
      const path = join(dir, name), info = lstatSync(path, { bigint: true });
      if (info.isSymbolicLink()) fail("sbom_link_refused");
      if (info.isDirectory()) walk(path, `${rel}/`);
      else if (info.isFile()) {
        const identity = `${info.dev}:${info.ino}`;
        if (info.nlink !== 1n || identities.has(identity)) fail("sbom_file_kind_invalid");
        identities.add(identity); actual.push(rel);
      } else fail("sbom_file_kind_invalid");
    }
  };
  try {
    const base = realChain(root);
    walk(base);
    if (JSON.stringify(actual.sort()) !== JSON.stringify(manifest.files.map((e) => e.path).sort())) fail("sbom_payload_file_set");
    const descriptors = [];
    for (const e of manifest.files) {
      const path = join(base, ...e.path.split("/"));
      const rel = relative(realpathSync(base), realpathSync(path));
      if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("sbom_path_invalid");
      const bytes = readSbomFile(path, e.bytes);
      if (bytes.length !== e.bytes || sha256(bytes) !== e.sha256) fail("sbom_payload_integrity");
      if (basename(e.path) === "package.json") descriptors.push([e, bytes]);
    }
    for (const [dir, before] of directories) if (!sameIdentity(before, lstatSync(dir, { bigint: true }))) fail("sbom_read_changed");
    realChain(base);
    return descriptors;
  } catch (error) {
    if (error.code?.startsWith("sbom_")) throw error;
    fail("sbom_payload_unreadable");
  }
}

function declaredValue(value) {
  // Declarations are never resolved/downloaded. Omit unrelated package.json
  // fields entirely; refuse host paths, URL credentials/query data and controls.
  if (typeof value !== "string" || !value || value.length > 512 || /[^\x20-\x7e]/.test(value)
    || /(?:^|[\s:])[A-Za-z]:[\\/]|(?:^|\s)(?:(?:file|link):)?[\\/]|^(?:file|link):~|\\|:\/\/[^/\s]*@|\?/.test(value)) fail("sbom_descriptor_metadata_invalid");
  return value;
}

function npmComponent(entry, bytes) {
  const value = json(bytes, SBOM_LIMITS.descriptor, "sbom_descriptor_invalid");
  if (!value || Array.isArray(value) || typeof value.name !== "string" || value.name.length > 214 || !NPM_NAME.test(value.name)
    || typeof value.version !== "string" || value.version.length > 128 || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(value.version)) fail("sbom_descriptor_identity_invalid");
  const properties = [prop("package-json-path", entry.path), prop("package-json-sha256", entry.sha256), prop("metadata-evidence", "verified-payload-descriptor"), prop("distribution-integrity", "UNKNOWN")];
  for (const key of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
    if (value[key] === undefined) continue;
    const declarations = value[key];
    if (!declarations || typeof declarations !== "object" || Array.isArray(declarations) || Object.keys(declarations).length > 2000) fail("sbom_descriptor_metadata_invalid");
    for (const [name, declaration] of Object.entries(declarations)) {
      if (name.length > 214 || !NPM_NAME.test(name)) fail("sbom_descriptor_metadata_invalid");
      declaredValue(declaration);
    }
    properties.push(prop(`npm-declared-${key}`, JSON.stringify(stable(declarations))));
  }
  if (value.license !== undefined) properties.push(prop("npm-declared-license", JSON.stringify(declaredValue(value.license))));
  return { type: entry.path.split("/").includes("node_modules") ? "library" : "application", "bom-ref": `npm-descriptor:${entry.path}`, name: value.name, version: value.version, properties };
}

export function createPackSbom({ manifestBytes, expectedManifestSha256, payloadRoot }) {
  const manifest = manifestFrom(manifestBytes, expectedManifestSha256);
  const descriptors = verifyPayload(payloadRoot, manifest);
  const components = manifest.files.map((e) => ({ type: "file", "bom-ref": `file:${e.path}`, name: e.path,
    hashes: [{ alg: "SHA-256", content: e.sha256 }], properties: [prop("bytes", e.bytes), prop("integrity-evidence", "payload-bytes-verified")] }));
  components.push(...descriptors.map(([entry, bytes]) => npmComponent(entry, bytes)));
  components.sort((a, b) => a["bom-ref"] < b["bom-ref"] ? -1 : a["bom-ref"] > b["bom-ref"] ? 1 : 0);
  const bom = { bomFormat: "CycloneDX", specVersion: "1.6", version: 1,
    metadata: { component: { type: "application", "bom-ref": `pack:${manifest.pack_id}@${manifest.version}`, name: manifest.pack_id, version: manifest.version },
      properties: [prop("manifest-sha256", expectedManifestSha256), prop("pack-digest", manifest.pack_digest),
        prop("scope", "pack-file-inventory-and-declared-npm-descriptors"), prop("payload-integrity", "VERIFIED"), prop("runtime-dependency-graph", "UNKNOWN"),
        prop("vulnerability-scan", "NOT_RUN"), prop("license-approval", "NOT_RUN"), prop("release-acceptance", "NOT_GRANTED")] }, components };
  const schema = validateCycloneDx16(bom), bytes = encodeSbomJson(bom);
  if (bytes.length > SBOM_LIMITS.sbom) fail("sbom_limit_exceeded");
  // Byte/schema checks do not opt an undeclared legacy manifest into the
  // product SBOM contract, even when matching sidecars happen to exist.
  const declared = manifest.sbom_policy === SBOM_POLICY;
  const evidence = { receipt: "pack_sbom", status: declared ? "VERIFIED" : "NOT_VERIFIED",
    ...(declared ? {} : { reason: "legacy_sbom_policy_absent" }),
    manifest_sha256: expectedManifestSha256, sbom_sha256: sha256(bytes), pack_digest: manifest.pack_digest,
    files: manifest.files.length, npm_descriptors: descriptors.length, payload_integrity: "VERIFIED", ...schema,
    runtime_dependency_graph: "UNKNOWN", vulnerability_scan: "NOT_RUN", license_approval: "NOT_RUN", release_acceptance: "NOT_GRANTED",
    custody: "quiescent-directory-required; hostile-concurrent-os-mutation-not-fully-covered", authenticity: "NOT_VERIFIED", ladder_note: "out_of_ladder_evidence" };
  return { bytes, evidence, receiptBytes: encodeSbomJson(evidence) };
}

// Legacy readers still get the same full byte/path checks without treating
// absent descriptors or an absent SBOM as a verified SBOM.
export function verifyPackPayload({ manifestBytes, expectedManifestSha256, payloadRoot }) {
  const manifest = manifestFrom(manifestBytes, expectedManifestSha256);
  verifyPayload(payloadRoot, manifest);
  return manifest;
}

export function verifyPackSbom({ manifestBytes, expectedManifestSha256, payloadRoot, sbomBytes }) {
  const bom = json(sbomBytes, SBOM_LIMITS.sbom, "sbom_json_invalid");
  validateCycloneDx16(bom);
  const expected = createPackSbom({ manifestBytes, expectedManifestSha256, payloadRoot });
  if (!Buffer.from(sbomBytes).equals(expected.bytes)) fail("sbom_bytes_mismatch");
  return expected;
}
