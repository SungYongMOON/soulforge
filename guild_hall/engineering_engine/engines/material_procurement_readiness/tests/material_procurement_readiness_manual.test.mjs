import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CHAPTERS = Object.freeze([
  "01_purpose_and_shape.md",
  "02_rule_layers.md",
  "03_source_derivation.md",
  "04_vocabulary.md",
  "05_compiler_evaluator.md",
  "06_evidence_trace.md",
  "07_runs_and_receipts.md",
  "08_decisions.md",
  "09_next_work_and_handoff.md",
  "10_observation_boundary.md",
  "11_guidance_boundary.md",
  "12_integration_door.md",
]);

test("manual index resolves every bounded local chapter link", () => {
  const indexUrl = new URL("../manual/README.md", import.meta.url);
  const index = readFileSync(indexUrl, "utf8");
  for (const chapter of CHAPTERS) {
    assert.match(index, new RegExp(`\\]\\(${chapter.replace(".", "\\.")}\\)`));
    assert.equal(existsSync(fileURLToPath(new URL(`../manual/${chapter}`, import.meta.url))), true, chapter);
  }
});

function markdownFiles(root) {
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith(".md") ? [path] : [];
  });
}

test("all package-local Markdown links resolve across README, manual, contracts, and topology", () => {
  const packageRoot = fileURLToPath(new URL("../", import.meta.url));
  const scopes = ["README.md", "manual", "contracts", "topology"];
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
  for (const scope of scopes) {
    const path = resolve(packageRoot, scope);
    const files = statSync(path).isDirectory() ? markdownFiles(path) : [path];
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      for (const match of contents.matchAll(linkPattern)) {
        const target = match[1].split("#", 1)[0];
        if (!target || /^(?:https?:|mailto:)/iu.test(target)) continue;
        assert.equal(existsSync(resolve(dirname(file), target)), true, `${file} -> ${target}`);
      }
    }
  }
});
