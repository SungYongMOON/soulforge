#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { answerFromManual, llmQueueStats } from "../src/llm.mjs";
import { openStore } from "../src/store.mjs";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const CASES = {
  learner: [
    ["ERP를 잘 쓰고 싶은데 처음에 뭘 보면 돼요?", "man-onboarding-start-here"],
    ["오늘 내 일 확인하고 메일로 온 일을 처리하는 기본 흐름 알려줘요.", "man-basic-daily-flow"],
    ["작업 파일을 올리고 검토까지 넘기는 흐름을 한 번에 알려줘요.", "man-deliverable-review-flow"],
    ["실수했거나 누가 바꿨는지 확인하려면 어디를 봐요?", "man-audit-mistake-check"],
    ["AI한테 맡겨도 되는 일과 맡기면 안 되는 일이 뭐예요?", "man-ai-appropriate-use"],
  ],
  power: [
    ["메일 여러 개를 같은 과제로 분류하고 할 일까지 만들고 담당도 맞추려면 어떻게 해요?", "man-mail-bulk-assign"],
    ["게이트가 BOM/Gerber 누락 때문에 막혔을 때 확인하고 다시 통과시키는 흐름 알려줘요.", "man-gate-blocked-next"],
    ["03_Out 산출물을 올리고 본인검토, 팀검토, 반려 후 재검토까지 어떻게 돌려요?", "man-deliverable-review-loop"],
    ["회의 액션아이템을 과제 할 일로 연결하고 나중에 감사로그로 확인하려면 어떻게 해요?", "man-meeting-action-audit-flow"],
    ["AI 제안이 올라오면 검토, 승인, 취소, 이력 확인까지 어떤 순서로 보면 돼요?", "man-ai-proposal-lifecycle"],
  ],
  concurrent: [
    ["오늘 제 할 일과 마감 지난 일은 어디서 봐요?", "man-today-my-work"],
    ["메일 첨부파일도 과제에 같이 붙나요?", "man-mail-attachment-boundary"],
    ["게이트를 다시 실행하거나 재검토 요청할 수 있나요?", "man-gate-rerun-review"],
    ["AI가 제 허락 없이 파일이나 데이터를 바꾸나요?", "man-ai-change-approval"],
    ["회의 액션아이템은 자동으로 할 일이 돼요?", "man-meeting-action-items"],
    ["올라마나 젬마가 너무 느릴 때는 어떻게 해요?", "man-llm-slow"],
  ],
};

function loadManual(store) {
  const manual = JSON.parse(readFileSync(join(APP_DIR, "manual", "manual_faq.json"), "utf8"));
  for (const item of manual) store.upsertFaq({ ...item, data_label: "manual" });
}

function visibleText(result) {
  return String(result.answer ?? result.text ?? result.message ?? "");
}

function evaluate(result, expectedId, provider) {
  const sourceId = result.source?.id ?? null;
  const providerOk = provider === "stub" || result.llm === true;
  return Boolean(result.ok !== false && result.matched && providerOk && sourceId === expectedId);
}

async function askSequential({ store, label, cases, provider, failures }) {
  console.log(`\n## ${label}`);
  let pass = 0;
  for (const [question, expectedId] of cases) {
    const result = await answerFromManual({ store, question, provider });
    const ok = evaluate(result, expectedId, provider);
    if (ok) pass += 1;
    else failures.push({ label, question, expectedId, sourceId: result.source?.id ?? null });
    console.log(JSON.stringify({
      ok,
      question,
      expectedId,
      sourceId: result.source?.id ?? null,
      matched: result.matched,
      llm: result.llm,
      provider: result.provider,
      model: result.model,
      answer: visibleText(result).replace(/\s+/g, " ").slice(0, 220),
    }, null, 2));
  }
  console.log(`${label}: ${pass}/${cases.length}`);
}

async function askConcurrent({ store, cases, provider, failures }) {
  console.log("\n## concurrent");
  console.log("before", JSON.stringify(llmQueueStats()));
  const start = Date.now();
  const results = await Promise.all(cases.map(async ([question, expectedId]) => {
    const result = await answerFromManual({ store, question, provider });
    const ok = evaluate(result, expectedId, provider);
    if (!ok) failures.push({ label: "concurrent", question, expectedId, sourceId: result.source?.id ?? null });
    return {
      ok,
      question,
      expectedId,
      sourceId: result.source?.id ?? null,
      matched: result.matched,
      llm: result.llm,
      provider: result.provider,
      model: result.model,
      answer: visibleText(result).replace(/\s+/g, " ").slice(0, 220),
    };
  }));
  for (const result of results) console.log(JSON.stringify(result, null, 2));
  console.log("elapsedMs", Date.now() - start);
  console.log("after", JSON.stringify(llmQueueStats()));
  console.log(`concurrent: ${results.filter((result) => result.ok).length}/${cases.length}`);
}

async function main() {
  const provider = process.argv.includes("--stub") ? "stub" : "ollama";
  const store = openStore(":memory:");
  loadManual(store);
  const failures = [];
  await askSequential({ store, label: "learner", cases: CASES.learner, provider, failures });
  await askSequential({ store, label: "power", cases: CASES.power, provider, failures });
  await askConcurrent({ store, cases: CASES.concurrent, provider, failures });
  if (failures.length) {
    console.error("\nchatbot smoke failures");
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
