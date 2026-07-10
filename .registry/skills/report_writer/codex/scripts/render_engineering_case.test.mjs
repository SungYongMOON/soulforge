import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CaseModelError,
  applyAnonymization,
  renderEngineeringCase,
  verifyArtifacts,
} from "./render_engineering_case.mjs";

const scriptPath = fileURLToPath(new URL("./render_engineering_case.mjs", import.meta.url));
const experimentPath = fileURLToPath(
  new URL("../references/engineering_case_model.experiment.example.json", import.meta.url),
);
const tradePath = fileURLToPath(
  new URL("../references/engineering_case_model.trade_study.example.json", import.meta.url),
);

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("renders experiment and trade-study examples with frozen model identity", async () => {
  for (const filePath of [experimentPath, tradePath]) {
    const model = await loadJson(filePath);
    const rendered = renderEngineeringCase(model);
    assert.equal(rendered.consistencyReport.status, "pass");
    assert.equal(rendered.consistencyReport.blockers.length, 0);
    assert.match(rendered.modelIdentity.model_sha256, /^sha256:[0-9a-f]{64}$/u);
    assert.deepEqual(rendered.reportProjection.model_identity, rendered.pptProjection.model_identity);
    assert.deepEqual(rendered.reportProjection.shared, rendered.pptProjection.shared);
    for (const mapping of model.anonymization.mappings) {
      assert.equal(rendered.reportMarkdown.includes(mapping.from), false);
      assert.equal(rendered.pptMarkdown.includes(mapping.from), false);
      assert.equal(JSON.stringify(rendered.consistencyReport).includes(mapping.from), false);
    }
    assert.equal(
      rendered.consistencyReport.anonymization.mappings.every((item) => item.replacement_count > 0),
      true,
    );
  }
});

test("fails model-to-projection mismatch and untraceable new number", async () => {
  const model = await loadJson(experimentPath);
  const rendered = renderEngineeringCase(model);
  const { mappingStats, sourceLabels } = applyAnonymization(model);
  const tamperedProjection = structuredClone(rendered.reportProjection);
  tamperedProjection.shared.evidence[0].value = "-999";
  const mismatch = verifyArtifacts({
    modelIdentity: rendered.modelIdentity,
    shared: rendered.reportProjection.shared,
    reportMarkdown: `${rendered.reportMarkdown}\n- 추적 불가 수치 999 dB`,
    pptMarkdown: rendered.pptMarkdown,
    reportProjection: tamperedProjection,
    pptProjection: rendered.pptProjection,
    sourceLabels,
    mappingStats,
  });
  assert.equal(mismatch.blockers.some((item) => item.code === "model_to_report_projection_mismatch"), true);
  assert.equal(mismatch.blockers.some((item) => item.code === "report_untraceable_numeric_token"), true);
});

test("binds each slide body and title to its declared judgment", async () => {
  const model = await loadJson(experimentPath);
  const rendered = renderEngineeringCase(model);
  const impactStart = rendered.pptMarkdown.indexOf(`## ${model.storyline.slides[1].title}`);
  const impactEnd = rendered.pptMarkdown.indexOf(`## ${model.storyline.slides[2].title}`);
  const impactSection = rendered.pptMarkdown.slice(impactStart, impactEnd);
  assert.equal(impactSection.includes(model.judgments[1].text), true);
  assert.equal(impactSection.includes(model.judgments[0].text), false);
  assert.equal(rendered.pptMarkdown.includes("담당 담당자"), false);
  assert.equal(rendered.pptMarkdown.includes("담당: 담당자"), false);
  assert.equal(rendered.pptMarkdown.includes("책임 주체: 담당자"), true);

  const mismatched = await loadJson(tradePath);
  mismatched.storyline.slides[1].title = "연결되지 않은 결론";
  assert.throws(() => renderEngineeringCase(mismatched), CaseModelError);
});

test("detects a Korean value-unit mutation", async () => {
  const model = await loadJson(tradePath);
  const rendered = renderEngineeringCase(model);
  const { mappingStats, sourceLabels } = applyAnonymization(model);
  const mismatch = verifyArtifacts({
    modelIdentity: rendered.modelIdentity,
    shared: rendered.reportProjection.shared,
    reportMarkdown: rendered.reportMarkdown,
    pptMarkdown: rendered.pptMarkdown.replace("82점", "82회"),
    reportProjection: rendered.reportProjection,
    pptProjection: rendered.pptProjection,
    sourceLabels,
    mappingStats,
  });
  assert.equal(mismatch.blockers.some((item) => item.code === "ppt_untraceable_numeric_token"), true);
});

test("rejects copular -임 while allowing lexical 움직임", async () => {
  const invalid = await loadJson(experimentPath);
  invalid.decision.statement = "격리 설계임.";
  assert.throws(() => renderEngineeringCase(invalid), CaseModelError);

  const invalidCaption = await loadJson(experimentPath);
  invalidCaption.figures[0].caption = "격리 설계임. 후속 비교";
  assert.throws(() => renderEngineeringCase(invalidCaption), CaseModelError);

  const lexical = await loadJson(experimentPath);
  lexical.limitations[0].text = "센서 움직임.";
  assert.equal(renderEngineeringCase(lexical).consistencyReport.status, "pass");
});

test("fails missing anonymization category and incomplete trade score matrix", async () => {
  const missingMapping = await loadJson(experimentPath);
  missingMapping.anonymization.mappings = missingMapping.anonymization.mappings.filter(
    (item) => item.category !== "company",
  );
  assert.throws(() => renderEngineeringCase(missingMapping), CaseModelError);

  const incompleteTrade = await loadJson(tradePath);
  delete incompleteTrade.trade_study.alternatives[0].scores.cost;
  assert.throws(() => renderEngineeringCase(incompleteTrade), CaseModelError);
});

test("CLI writes a redacted fail report without original mapping labels", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "report-writer-fail-"));
  try {
    const invalid = await loadJson(experimentPath);
    invalid.decision.statement = "가상발주처-알파 격리 설계임.";
    const inputPath = path.join(tempRoot, "invalid.json");
    const outputPath = path.join(tempRoot, "out");
    await writeFile(inputPath, `${JSON.stringify(invalid, null, 2)}\n`, "utf8");
    const result = spawnSync(process.execPath, [scriptPath, "--input", inputPath, "--out", outputPath], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(await readFile(path.join(outputPath, "consistency_report.json"), "utf8"));
    assert.equal(report.status, "fail");
    assert.equal(report.raw_private_labels_included, false);
    assert.equal(JSON.stringify(report).includes("가상발주처-알파"), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
