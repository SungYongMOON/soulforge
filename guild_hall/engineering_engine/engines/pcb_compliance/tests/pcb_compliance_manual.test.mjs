import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const chapters = [
  "01_purpose_and_shape.md",
  "02_rule_layers.md",
  "03_source_derivation.md",
  "04_vocabulary.md",
  "05_evaluator.md",
  "06_evidence_trace.md",
  "07_runs_and_receipts.md",
  "08_decisions.md",
  "09_next_work_and_handoff.md",
  "10_observation_boundary.md",
  "11_guidance_boundary.md",
  "12_integration_door.md",
];

test("PCB manual has every domain chapter and source-bound boundary links", async () => {
  const manual = await readFile(new URL("../manual/README.md", import.meta.url), "utf8");
  const packageReadme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const sourcePacket = await readFile(new URL("../contracts/pcb_compliance_source_packet_v0.md", import.meta.url), "utf8");

  for (const chapter of chapters) {
    const body = await readFile(new URL(`../manual/${chapter}`, import.meta.url), "utf8");
    assert.ok(body.startsWith("# "), `${chapter} must have a chapter heading`);
    assert.match(manual, new RegExp(chapter.replace(".", "\\.")));
  }
  assert.match(packageReadme, /evidence bundle/i);
  assert.match(sourcePacket, /RAG may locate candidate official pages/i);
  assert.match(sourcePacket, /UNKNOWN\/HOLD/);
  assert.doesNotMatch(sourcePacket, /actual IPC clause text/i);
});

function markdownFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith(".md") ? [path] : [];
  });
}

test("all PCB package-local Markdown links resolve across README, manual, contracts, and topology", () => {
  const packageRoot = fileURLToPath(new URL("../", import.meta.url));
  const scopes = ["README.md", "manual", "contracts", "topology"];
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
  for (const scope of scopes) {
    const path = resolve(packageRoot, scope);
    if (!existsSync(path)) continue;
    const files = statSync(path).isDirectory() ? markdownFiles(path) : [path];
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      for (const match of contents.matchAll(linkPattern)) {
        const target = match[1].split("#", 1)[0].split("?", 1)[0];
        if (!target || /^(?:https?:|mailto:)/iu.test(target)) continue;
        assert.equal(existsSync(resolve(dirname(file), target)), true, `${file} -> ${target}`);
      }
    }
  }
});
