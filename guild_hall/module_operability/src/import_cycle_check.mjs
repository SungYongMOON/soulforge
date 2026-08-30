// Import-cycle validator (module-operability gate, leaf 2).
//
// Builds the RELATIVE-import graph (static import incl. BARE side-effect
// imports, export-from re-exports, dynamic import, require) over the given
// roots and reports every cycle. A cycle makes startup/shutdown ordering and
// module extraction undefined — the pcb_compliance evaluator↔adapter pair
// proved this class exists in practice and was cut in the same leaf that
// introduced this check. Side-effect imports matter especially: adapter
// REGISTRATION uses exactly that form, and a cycle routed through one would
// otherwise pass the gate while Node hits the real circular load.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

// `from` also covers `export ... from` re-exports; the second alternative
// catches bare `import "./x.mjs"` side-effect imports.
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|(?<![.\w])import\s+)["'](\.\.?\/[^"']+)["']/g;

function toPosix(value) {
  return value.split("\\").join("/");
}

function listSourceFiles(baseDir, rootRel) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      const child = join(dir, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (statSync(child).isDirectory()) walk(child, relative);
      else if (/\.(mjs|cjs|js)$/.test(name)) out.push(relative);
    }
  };
  const absoluteRoot = join(baseDir, ...rootRel.split("/"));
  if (existsSync(absoluteRoot)) walk(absoluteRoot, rootRel);
  return out;
}

export function buildImportGraph(baseDir, roots) {
  const edges = new Map(); // file -> Set(file)
  const files = roots.flatMap((root) => listSourceFiles(baseDir, root));
  const known = new Set(files);
  for (const file of files) {
    const source = readFileSync(join(baseDir, ...file.split("/")), "utf8");
    const targets = new Set();
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = toPosix(join(dirname(file), match[1]));
      if (known.has(resolved)) targets.add(resolved);
      // Imports leaving the scanned roots are out of scope here (the
      // dependency validator owns cross-module DECLARATIONS).
    }
    edges.set(file, targets);
  }
  return { files, edges };
}

export function findImportCycles(baseDir, roots) {
  const { files, edges } = buildImportGraph(baseDir, roots);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map(files.map((file) => [file, WHITE]));
  const cycles = [];
  const stack = [];

  function visit(node) {
    color.set(node, GRAY);
    stack.push(node);
    for (const target of edges.get(node) ?? []) {
      const state = color.get(target);
      if (state === GRAY) {
        const start = stack.indexOf(target);
        cycles.push([...stack.slice(start), target]);
      } else if (state === WHITE) {
        visit(target);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const file of files) {
    if (color.get(file) === WHITE) visit(file);
  }
  let edgeCount = 0;
  for (const targets of edges.values()) edgeCount += targets.size;
  return { cycles, moduleCount: files.length, edgeCount };
}
