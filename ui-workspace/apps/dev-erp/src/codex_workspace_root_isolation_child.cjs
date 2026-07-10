"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const { join, posix, win32 } = require("node:path");

const MAX_INPUT = 1024 * 1024;
const MAX_ENTRIES = 50000;
const MAX_DEPTH = 64;
const PROTECTED = /^(?:\.git|\.codex|\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.env(?:\..*)?|_workmeta|private-state|.*(?:secret|credential|token|password|cookie).*|agents(?:\.override)?\.md|dev-erp\.db(?:-(?:wal|shm))?|.*\.(?:key|pem|pfx|p12))$/i;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (input.length > MAX_INPUT) process.exit(71);
});

function comparable(value, style) {
  const api = style === "windows" ? win32 : posix;
  let raw = String(value);
  if (style === "windows") {
    raw = raw.replaceAll("/", "\\");
    const lower = raw.toLowerCase();
    if (lower.startsWith("\\\\?\\unc\\")) raw = `\\\\${raw.slice(8)}`;
    else if (lower.startsWith("\\\\?\\")) raw = raw.slice(4);
  }
  const root = api.parse(raw).root;
  let normalized = api.normalize(raw);
  while (normalized.length > root.length && (normalized.endsWith("\\") || normalized.endsWith("/"))) {
    normalized = normalized.slice(0, -1);
  }
  return style === "windows" ? normalized.toLowerCase() : normalized;
}

function inside(root, target, style) {
  const api = style === "windows" ? win32 : posix;
  const rel = api.relative(comparable(root, style), comparable(target, style));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${api.sep}`) && !api.isAbsolute(rel));
}

function detectedStyle(value) {
  if (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(String(value))) return "windows";
  return posix.isAbsolute(String(value)) ? "posix" : null;
}

function scalar(value) {
  if (typeof value === "bigint") return value.toString(10);
  return Number.isSafeInteger(value) ? String(value) : null;
}

function objectIdentity(stat) {
  const dev = scalar(stat.dev);
  const ino = scalar(stat.ino);
  if (dev === null || ino === null || (dev === "0" && ino === "0")) throw new Error("identity");
  return { dev, ino, key: `${dev}:${ino}` };
}

function scanTree(root, style, mutablePrefixes = []) {
  const digest = createHash("sha256");
  const immutableDigest = createHash("sha256");
  const stack = [{ absolute: root, relative: "", depth: 0 }];
  const seenObjects = new Set();
  let entries = 0;
  while (stack.length) {
    const current = stack.pop();
    if (current.depth > MAX_DEPTH) throw new Error("scan_limit");
    const names = fs.readdirSync(current.absolute, { withFileTypes: true })
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
    for (const name of names) {
      entries += 1;
      if (entries > MAX_ENTRIES) throw new Error("scan_limit");
      if (PROTECTED.test(name)) throw new Error("protected");
      const absolute = join(current.absolute, name);
      const relative = current.relative ? `${current.relative}/${name}` : name;
      const lexical = fs.lstatSync(absolute, { bigint: true });
      if (lexical.isSymbolicLink()) throw new Error("link");
      const real = fs.realpathSync(absolute);
      if (!inside(root, real, style)) throw new Error("link");
      const stat = fs.statSync(real, { bigint: true });
      const identity = objectIdentity(stat);
      if (seenObjects.has(identity.key)) throw new Error("link");
      seenObjects.add(identity.key);
      const nlink = scalar(stat.nlink);
      const kind = stat.isDirectory() ? "d" : (stat.isFile() ? "f" : "x");
      if (kind === "x") throw new Error("link");
      if (kind === "f" && nlink !== "1") throw new Error("link");
      const record = JSON.stringify([
        relative,
        kind,
        identity.dev,
        identity.ino,
        nlink,
        scalar(stat.size),
        scalar(stat.mtimeNs),
      ]);
      digest.update(record);
      const comparableRelative = style === "windows" ? relative.toLowerCase() : relative;
      const mutable = mutablePrefixes.some((prefix) => (
        comparableRelative === prefix || comparableRelative.startsWith(`${prefix}/`)
      ));
      if (!mutable) immutableDigest.update(record);
      if (kind === "d") stack.push({ absolute: real, relative, depth: current.depth + 1 });
    }
  }
  return { digest: digest.digest("hex"), immutableDigest: immutableDigest.digest("hex"), entries };
}

function send(value) {
  process.stdout.write(JSON.stringify(value));
}

process.stdin.on("end", () => {
  try {
    const packet = JSON.parse(input);
    if (!packet || !Array.isArray(packet.rows) || packet.rows.length > 128
        || !Array.isArray(packet.forbidden_roots) || packet.forbidden_roots.length > 256
        || packet.forbidden_roots.some((root) => typeof root !== "string" || !root || root.length > 4096)) {
      return send({ ok: false, error: "workspace_root_isolation_protocol_invalid" });
    }
    const forbidden = packet.forbidden_roots.map((root) => {
      const real = fs.realpathSync(root);
      const style = detectedStyle(real);
      if (!style) throw new Error("style");
      const identity = objectIdentity(fs.statSync(real, { bigint: true }));
      return { style, real, comparable: comparable(real, style), dev: identity.dev, ino: identity.ino };
    });
    const roots = packet.rows.map((row) => {
      if (!row || typeof row.workspace_id !== "string" || !["windows", "posix"].includes(row.style)
          || typeof row.root !== "string"
          || (row.mutable_relative_prefixes !== undefined && (!Array.isArray(row.mutable_relative_prefixes)
            || row.mutable_relative_prefixes.length > 16))) throw new Error("protocol");
      const mutablePrefixes = (row.mutable_relative_prefixes || []).map((prefix) => {
        if (typeof prefix !== "string" || !prefix || prefix.length > 1024 || prefix !== prefix.trim()
            || prefix.startsWith("/") || prefix.startsWith("\\") || /^[A-Za-z]:/.test(prefix)) throw new Error("protocol");
        const normalized = prefix.replaceAll("\\", "/");
        if (normalized.split("/").some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
          throw new Error("protocol");
        }
        return row.style === "windows" ? normalized.toLowerCase() : normalized;
      });
      const lexical = fs.lstatSync(row.root, { bigint: true });
      if (lexical.isSymbolicLink()) throw new Error("link");
      const real = fs.realpathSync(row.root);
      const stat = fs.statSync(real, { bigint: true });
      if (!stat.isDirectory()) throw new Error("unavailable");
      const style = detectedStyle(real);
      if (!style || style !== row.style) throw new Error("style");
      const identity = objectIdentity(stat);
      const tree = scanTree(real, style, mutablePrefixes);
      return {
        workspace_id: row.workspace_id,
        style,
        real,
        comparable: comparable(real, style),
        dev: identity.dev,
        ino: identity.ino,
        tree_digest: tree.digest,
        immutable_tree_digest: tree.immutableDigest,
        scanned_entries: tree.entries,
      };
    });
    for (let left = 0; left < roots.length; left += 1) {
      for (let right = left + 1; right < roots.length; right += 1) {
        const a = roots[left];
        const b = roots[right];
        const same = a.dev === b.dev && a.ino === b.ino;
        const overlap = a.style === b.style && (inside(a.real, b.real, a.style) || inside(b.real, a.real, a.style));
        if (same || overlap) return send({ ok: false, error: "workspace_root_real_overlap" });
      }
    }
    for (const root of roots) {
      for (const denied of forbidden) {
        const same = root.dev === denied.dev && root.ino === denied.ino;
        const overlap = root.style === denied.style
          && (inside(root.real, denied.real, root.style) || inside(denied.real, root.real, root.style));
        if (same || overlap) return send({ ok: false, error: "workspace_root_boundary_overlap" });
      }
    }
    const scannedEntryCount = roots.reduce((total, row) => total + row.scanned_entries, 0);
    const boundaryPayload = roots.map((row) => ({
      workspace_id: row.workspace_id,
      style: row.style,
      real: row.comparable,
      dev: row.dev,
      ino: row.ino,
    })).concat(forbidden.map((row) => ({
      style: row.style,
      real: row.comparable,
      dev: row.dev,
      ino: row.ino,
    })));
    const treePayload = roots.map((row) => ({
      workspace_id: row.workspace_id,
      tree_digest: row.tree_digest,
    }));
    const immutableTreePayload = roots.map((row) => ({
      workspace_id: row.workspace_id,
      tree_digest: row.immutable_tree_digest,
    }));
    const revision = createHash("sha256").update(JSON.stringify(boundaryPayload)).digest("hex");
    const treeRevision = createHash("sha256").update(JSON.stringify(treePayload)).digest("hex");
    const immutableTreeRevision = createHash("sha256").update(JSON.stringify(immutableTreePayload)).digest("hex");
    return send({
      ok: true,
      revision,
      tree_revision: treeRevision,
      immutable_tree_revision: immutableTreeRevision,
      workspace_count: roots.length,
      forbidden_root_count: forbidden.length,
      scanned_entry_count: scannedEntryCount,
    });
  } catch (error) {
    const errors = {
      protocol: "workspace_root_isolation_protocol_invalid",
      style: "workspace_root_style_mismatch",
      identity: "workspace_root_identity_unavailable",
      protected: "workspace_tree_protected_entry",
      link: "workspace_tree_link_unsafe",
      scan_limit: "workspace_tree_scan_limit",
    };
    return send({ ok: false, error: errors[error?.message] || "workspace_root_isolation_unavailable" });
  }
});
