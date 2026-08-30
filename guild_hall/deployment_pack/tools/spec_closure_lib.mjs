// Shared spec-emitter helpers: deterministic file listing and the
// relative-import closure walker. Extracted verbatim from emit_hpp_spec.mjs
// so every pack emitter computes closures with ONE recipe — a drift between
// emitters would silently pack different graphs for the same style of app.
//
// Regex-based specifier extraction is adequate for this codebase's plain
// static/dynamic import style; only RELATIVE specifiers are followed
// (node: builtins and bare names have no files to pack).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

// Shared g-flag regex: safe with matchAll (which never advances lastIndex);
// do NOT call .test()/.exec() on it — those mutate lastIndex across callers.
export const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](\.\.?\/[^"']+)["']/g;

export function toPosix(relPath) {
  return relPath.split("\\").join("/");
}

export function listFiles(rootDir, relDir, suffix) {
  const absolute = join(rootDir, ...relDir.split("/"));
  return readdirSync(absolute)
    .filter((name) => statSync(join(absolute, name)).isFile() && name.endsWith(suffix))
    .map((name) => `${relDir}/${name}`)
    .sort();
}

export function listFilesRecursive(rootDir, relDir) {
  const absolute = join(rootDir, ...relDir.split("/"));
  const out = [];
  for (const name of readdirSync(absolute)) {
    const child = join(absolute, name);
    if (statSync(child).isDirectory()) out.push(...listFilesRecursive(rootDir, `${relDir}/${name}`));
    else out.push(`${relDir}/${name}`);
  }
  return out.sort();
}

// Walk the RELATIVE import graph from the entrypoints; the packed file set
// is the ACTUAL module graph, computed, not assumed.
export function moduleClosure(rootDir, entryRelPaths) {
  const visited = new Set();
  const queue = [...entryRelPaths];
  while (queue.length > 0) {
    const rel = toPosix(queue.pop());
    if (visited.has(rel)) continue;
    visited.add(rel);
    if (!/\.(mjs|cjs|js)$/.test(rel)) continue;
    const source = readFileSync(join(rootDir, ...rel.split("/")), "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = toPosix(join(dirname(rel), match[1]).split("\\").join("/"));
      const absolute = join(rootDir, ...resolved.split("/"));
      if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return [...visited].sort();
}
