import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXCLUDED_COLUMN_ENTRIES_V0,
  RETIRED_TERMS_POLICY_V0,
  findRetiredDisplayTermViolations,
  isCandidatePath,
} from "./retired_display_terms_policy.mjs";

const policyCli = fileURLToPath(new URL("./retired_display_terms_policy.mjs", import.meta.url));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const glossaryPath = path.join(repoRoot, "docs", "architecture", "foundation", "SHARED_GLOSSARY_V0.md");

test("retired display term policy flags a bare retired term in prose", () => {
  const violations = findRetiredDisplayTermViolations("- 상황판을 오늘 확인한다.", "example.md");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].id, "retired_display_term");
  assert.equal(violations[0].term, "상황판");
  assert.equal(violations[0].display, "Vigil");
  assert.equal(violations[0].line, 1);
  assert.equal(violations[0].column, 3);
});

test("retired display term policy flags every configured term at least once", () => {
  for (const entry of RETIRED_TERMS_POLICY_V0) {
    const line = `- 문서 본문에 ${entry.term} 이(가) 그대로 남아 있다.`;
    const violations = findRetiredDisplayTermViolations(line, "example.md");
    assert.ok(
      violations.some((violation) => violation.term === entry.term),
      `expected a violation for retired term '${entry.term}'`,
    );
  }
});

test("retired display term policy ignores backticked and code-fenced spans", () => {
  const text = [
    "이미 고정된 식별자는 그대로 둔다: `team-ops-board`, `상황판`, `4192`.",
    "```text",
    "4192 typed projection",
    "Team Ops Board legacy log line",
    "```",
    "코드 블록 밖 후속 문장은 검사 대상이다.",
  ].join("\n");

  assert.equal(findRetiredDisplayTermViolations(text, "example.md").length, 0);
});

test("retired display term policy ignores path/URL-adjacent tokens", () => {
  const text = [
    "정본 경로: `ui-workspace/apps/team-ops-board/src/core`.",
    "폴더 이름은 install/watch-4192/ 아래에 남는다.",
    "문서 참조는 [Vigil operations](08_WATCH_4192_OPERATIONS.md) 형태를 쓴다.",
  ].join("\n");

  assert.equal(findRetiredDisplayTermViolations(text, "example.md").length, 0);
});

test("retired display term policy narrows the slash exclusion to whole path-shaped tokens", () => {
  const oneSidedEnumeration = findRetiredDisplayTermViolations(
    "Task Engine/AX 표기는 산문 열거이지 파일 경로가 아니다.",
    "example.md",
  );
  assert.deepEqual(oneSidedEnumeration.map((violation) => violation.term), ["Task Engine"]);

  const realPath = findRetiredDisplayTermViolations(
    "정본 경로 guild_hall/validate/x.mjs 는 산문 열거가 아니라 실제 파일이다.",
    "example.md",
  );
  assert.equal(realPath.length, 0);
});

test("retired display term policy keeps the '포트 4192' identifier context clean", () => {
  const text = [
    "Vigil(포트 4192)는 유지한다.",
    "compatibility handle 4192 remains the runtime handle.",
    "compatibility/runtime handle 4192 is cited here.",
  ].join("\n");

  assert.equal(findRetiredDisplayTermViolations(text, "example.md").length, 0);
});

test("retired display term policy still flags a bare '4192' outside identifier context", () => {
  const violations = findRetiredDisplayTermViolations("4192 remains Main Node operations UI.", "example.md");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].term, "4192");
});

test("retired display term policy reports one violation per occurrence on a line", () => {
  const violations = findRetiredDisplayTermViolations(
    "Team Ops Board와 Ops Board는 같은 Vigil 시스템을 가리킨다.",
    "example.md",
  );
  assert.deepEqual(violations.map((violation) => violation.term), ["Team Ops Board", "Ops Board"]);
});

test("retired display term policy ignores the house-style '<display>(<retired term>)' citation", () => {
  const text = [
    "Ore(원천 자료) → Tributary(수집 lane) → Ingot(사본) → Heartwood(비공개 데이터 창고).",
    "Hammer(Task Engine), Covenant(정본 승격 3규칙: W-AUTH), Tongs(MCP 문), Vigil(포트 4192), Sigil(봇 SOUL 스냅샷).",
  ].join("\n");

  assert.equal(findRetiredDisplayTermViolations(text, "example.md").length, 0);
});

test("retired display term policy still flags a retired term outside its own display-name citation", () => {
  const violations = findRetiredDisplayTermViolations(
    "Hammer(Task Engine)의 collector를 바꾸면 Task Engine의 문서도 갱신한다.",
    "example.md",
  );
  assert.equal(violations.length, 1);
  assert.equal(violations[0].term, "Task Engine");
  assert.ok(violations[0].column > "Hammer(Task Engine)의 collector를 바꾸면 ".length);
});

test("retired display term policy candidate-path filter matches the handoff scope", () => {
  assert.equal(isCandidatePath("README.md"), true);
  assert.equal(isCandidatePath("AGENTS.md"), true);
  assert.equal(isCandidatePath("docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md"), true);
  assert.equal(isCandidatePath("docs/architecture/foundation/SHARED_GLOSSARY_V0.md"), false);
  assert.equal(isCandidatePath("docs/architecture/foundation/SOULFORGE_WORLD_BIBLE_V0.md"), false);
  assert.equal(isCandidatePath("docs/reviews/EXTERNAL_REVIEW_MAP_2026-09-05.md"), true);
  assert.equal(isCandidatePath("docs/reviews/exchange/2026-09-05_soulforge_to_gpt_01.md"), false);
  assert.equal(isCandidatePath("docs/reviews/exchange/README.md"), false);
  assert.equal(isCandidatePath("CHANGELOG.md"), false);
  assert.equal(isCandidatePath(".workflow/post_development_review_gate_v0/README.md"), false);
  assert.equal(isCandidatePath("ui-workspace/apps/dev-erp/docs/DESIGN.md"), false);
  assert.equal(isCandidatePath("docs/architecture/guild_hall/README.md"), true);
  assert.equal(isCandidatePath("guild_hall/README.md"), false);
  assert.equal(isCandidatePath("docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.yaml"), false);
});

test("retired display term policy CLI reports violations for a temp repo and exits 1", async () => {
  const tempRoot = await fs.mkdtemp(path.join(tmpdir(), "display-terms-policy-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: tempRoot, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);

  await fs.writeFile(path.join(tempRoot, "AGENTS.md"), "- 오늘 상황판을 확인했다.\n", "utf8");
  await fs.writeFile(path.join(tempRoot, "CHANGELOG.md"), "- 오늘 상황판을 확인했다.\n", "utf8");

  const json = spawnSync(process.execPath, [policyCli, "--root", tempRoot, "--scope", "changed", "--json"], {
    cwd: tempRoot,
    encoding: "utf8",
  });
  assert.equal(json.status, 1, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.summary.violations_total, 1);
  assert.equal(report.violations[0].file, "AGENTS.md");
  assert.equal(report.violations[0].term, "상황판");

  const human = spawnSync(process.execPath, [policyCli, "--root", tempRoot, "--scope", "changed"], {
    cwd: tempRoot,
    encoding: "utf8",
  });
  assert.equal(human.status, 1, human.stderr);
  assert.match(human.stdout, /violations: 1/);
});

test("retired display term policy CLI passes clean when the retired term is gone", async () => {
  const tempRoot = await fs.mkdtemp(path.join(tmpdir(), "display-terms-policy-clean-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: tempRoot, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  await fs.writeFile(path.join(tempRoot, "AGENTS.md"), "- 오늘 Vigil을 확인했다.\n", "utf8");

  const json = spawnSync(process.execPath, [policyCli, "--root", tempRoot, "--scope", "changed", "--json"], {
    cwd: tempRoot,
    encoding: "utf8",
  });
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.summary.violations_total, 0);
});

test("the enforced list stays a verbatim subset of the glossary's retired-term column", async () => {
  const glossaryText = await fs.readFile(glossaryPath, "utf8");
  const columnTokens = extractRetiredTermColumnTokens(glossaryText);
  assert.ok(columnTokens.length > 10, "expected to parse several rows from the 옛 표기 대조표");

  // Soundness: every enforced term must actually appear in the glossary column text, so this
  // policy can never enforce an invented display-term rule.
  for (const entry of RETIRED_TERMS_POLICY_V0) {
    assert.ok(
      columnTokens.some((token) => token.includes(entry.term)),
      `policy term '${entry.term}' was not found in the glossary's 이제 쓰지 않는 표기 column`,
    );
  }

  // Completeness: every raw column token must be accounted for, either as an enforced policy
  // term (or a substring of one) or as a documented, reasoned exclusion. This makes a future
  // glossary edit that adds or removes a retired form fail here until someone updates one of the
  // two lists on purpose.
  const excludedTerms = new Set(EXCLUDED_COLUMN_ENTRIES_V0.map((entry) => entry.term));
  const uncovered = columnTokens.filter((token) => {
    if (excludedTerms.has(token)) {
      return false;
    }
    return !RETIRED_TERMS_POLICY_V0.some((entry) => token.includes(entry.term));
  });
  assert.deepEqual(uncovered, [], "every glossary column token must be enforced or explicitly excluded with a reason");
});

function extractRetiredTermColumnTokens(glossaryText) {
  const lines = glossaryText.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) => line.startsWith("## 옛 표기"));
  assert.ok(sectionStart >= 0, "glossary is missing the '## 옛 표기 → 표시명 대조표' section");
  const nextSectionStart = lines.findIndex((line, index) => index > sectionStart && line.startsWith("## "));
  const sectionEnd = nextSectionStart === -1 ? lines.length : nextSectionStart;

  const tokens = [];
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    const line = lines[index];
    if (!line.startsWith("|")) {
      continue;
    }
    const cells = line.split("|").map((cell) => cell.trim());
    // cells[0] is empty (leading '|'); cells[1]=표시명, cells[2]=이제 쓰지 않는 표기, ...
    if (cells[1] === "표시명" || /^-+$/.test(cells[1] ?? "")) {
      continue; // header label row or header separator row
    }
    const retiredCell = cells[2] ?? "";
    if (!retiredCell) {
      continue;
    }
    for (const rawToken of retiredCell.split(",")) {
      const token = rawToken.trim();
      if (token) {
        tokens.push(token);
      }
    }
  }
  return tokens;
}
