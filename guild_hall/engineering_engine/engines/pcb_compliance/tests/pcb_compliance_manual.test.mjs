import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
