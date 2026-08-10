import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  buildInstructionManifest,
  discoverInstructionSources,
  loadInstructionManifests,
  persistInstructionManifest,
  runCodexPromptInput,
  validateInstructionManifest,
} from "./instruction_manifest.mjs";

test("instruction manifest hashes approved public sources without retaining prompt content", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-instruction-manifest-"));
  try {
    const nested = path.join(root, "nested");
    await mkdir(nested, { recursive: true });
    const rootAgents = path.join(root, "AGENTS.md");
    const nestedAgents = path.join(nested, "AGENTS.md");
    await writeFile(rootAgents, "PUBLIC ROOT INSTRUCTION\n", "utf8");
    await writeFile(nestedAgents, "PUBLIC NESTED INSTRUCTION\n", "utf8");
    const runner = async () => ({
      status: 0,
      codexVersion: "codex-cli 1.2.3",
      stdout: JSON.stringify({
        input: ["PUBLIC ROOT INSTRUCTION\n", "PUBLIC NESTED INSTRUCTION\n"],
        truncated: false,
      }),
    });
    const manifest = await buildInstructionManifest({
      cwd: nested,
      repoRoot: root,
      sourceCandidates: [
        { scope: "root", path: rootAgents },
        { scope: "nested", path: nestedAgents },
      ],
      approvedPublicRoots: [root],
      observedAt: "2026-08-03T00:00:00.000Z",
      runner,
    });
    assert.equal(manifest.prompt_probe_status, "completed");
    assert.deepEqual(manifest.sources.map((source) => source.model_visible), ["included", "included"]);
    assert.equal(manifest.truncated, false);
    assert.equal(manifest.total_instruction_bytes, 50);
    assert.doesNotMatch(JSON.stringify(manifest), /PUBLIC ROOT|PUBLIC NESTED/u);
    assert.equal(validateInstructionManifest(manifest), manifest);
    const schema = JSON.parse(await readFile(new URL("./instruction_manifest.v1.schema.json", import.meta.url), "utf8"));
    const validateSchema = new Ajv2020({ strict: true, allowUnionTypes: true, formats: { "date-time": true } }).compile(schema);
    assert.equal(validateSchema(manifest), true, JSON.stringify(validateSchema.errors));
    assert.throws(() => validateInstructionManifest({ ...manifest, prompt: "raw" }), { code: "instruction_manifest_shape_invalid" });
    const concurrent = await Promise.all([
      persistInstructionManifest(root, manifest),
      persistInstructionManifest(root, manifest),
    ]);
    assert.deepEqual(concurrent.map((receipt) => receipt.status).sort(), ["created", "replayed"]);
    const laterObservation = await buildInstructionManifest({
      cwd: nested,
      repoRoot: root,
      sourceCandidates: [
        { scope: "root", path: rootAgents },
        { scope: "nested", path: nestedAgents },
      ],
      approvedPublicRoots: [root],
      observedAt: "2026-08-04T00:00:00.000Z",
      runner,
    });
    assert.equal(laterObservation.manifest_id, manifest.manifest_id);
    assert.equal((await persistInstructionManifest(root, laterObservation)).status, "replayed");
    assert.equal((await loadInstructionManifests(root))[0].manifest_id, manifest.manifest_id);
    assert.equal((await loadInstructionManifests(root))[0].observed_at, manifest.observed_at);
    await assert.rejects(
      persistInstructionManifest(root, { ...manifest, codex_version: "codex-cli 9.9.9" }),
      { code: "evidence_event_id_conflict" },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("instruction manifest enforces the published 64-source limit before probing", async () => {
  let called = false;
  await assert.rejects(
    buildInstructionManifest({
      cwd: process.cwd(),
      repoRoot: process.cwd(),
      sourceCandidates: Array.from({ length: 65 }, (_, index) => ({ scope: "nested", path: path.join(process.cwd(), `missing-${index}`, "AGENTS.md") })),
      approvedPublicRoots: [process.cwd()],
      runner: async () => {
        called = true;
        return { status: 0, stdout: "{}" };
      },
    }),
    { code: "instruction_source_count_invalid" },
  );
  assert.equal(called, false);
});

test("mixed public and prohibited sources probe only verifiable inclusion metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-instruction-private-"));
  try {
    const privateRoot = path.join(root, "private");
    const publicRoot = path.join(root, "public");
    await mkdir(privateRoot, { recursive: true });
    await mkdir(publicRoot, { recursive: true });
    const privateAgents = path.join(privateRoot, "AGENTS.md");
    const publicAgents = path.join(publicRoot, "AGENTS.md");
    await writeFile(privateAgents, "PRIVATE-SENTINEL-SHOULD-NOT-BE-READ\n", "utf8");
    await writeFile(publicAgents, "APPROVED PUBLIC INSTRUCTION\n", "utf8");
    let called = false;
    const manifest = await buildInstructionManifest({
      cwd: publicRoot,
      repoRoot: publicRoot,
      sourceCandidates: [
        { scope: "global", path: privateAgents },
        { scope: "root", path: publicAgents },
      ],
      approvedPublicRoots: [publicRoot],
      observedAt: "2026-08-03T00:00:00.000Z",
      runner: async () => {
        called = true;
        return { status: 0, stdout: JSON.stringify({ input: ["APPROVED PUBLIC INSTRUCTION\n"] }) };
      },
    });
    assert.equal(called, true);
    assert.equal(manifest.prompt_probe_status, "completed_with_unverified_sources");
    assert.equal(manifest.sources[0].access_status, "prohibited");
    assert.equal(manifest.sources[0].sha256, null);
    assert.equal(manifest.sources[0].model_visible, "unknown");
    assert.equal(manifest.sources[1].model_visible, "included");
    assert.match(manifest.model_visible_prompt_digest, /^sha256:/u);
    assert.doesNotMatch(JSON.stringify(manifest), /PRIVATE-SENTINEL/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("instruction discovery prefers AGENTS.override.md in every scope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-instruction-override-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const repo = path.join(root, "repo");
    const nested = path.join(repo, "nested");
    await mkdir(codexHome, { recursive: true });
    await mkdir(nested, { recursive: true });
    for (const directory of [codexHome, repo, nested]) {
      await writeFile(path.join(directory, "AGENTS.md"), "base\n", "utf8");
      await writeFile(path.join(directory, "AGENTS.override.md"), "override\n", "utf8");
    }
    const discovered = await discoverInstructionSources({ cwd: nested, repoRoot: repo, codexHome });
    assert.deepEqual(discovered.candidates.map((candidate) => path.basename(candidate.path)), [
      "AGENTS.override.md",
      "AGENTS.override.md",
      "AGENTS.override.md",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prompt probe rejects unsafe model or feature options before launching Codex", async () => {
  await assert.rejects(
    runCodexPromptInput({ cwd: process.cwd(), modelId: "gpt-5.6-sol & echo unsafe" }),
    { code: "instruction_probe_option_invalid" },
  );
  await assert.rejects(
    runCodexPromptInput({ cwd: process.cwd(), disabledFeatures: ["hooks|unsafe"] }),
    { code: "instruction_probe_option_invalid" },
  );
});
