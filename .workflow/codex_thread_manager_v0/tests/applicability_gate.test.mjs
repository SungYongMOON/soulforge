import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workflowDir = path.resolve(testDir, "..");
const repoRoot = path.resolve(workflowDir, "..", "..");

const readUtf8 = (target) => readFile(target, "utf8");
const fixture = JSON.parse(
  await readUtf8(path.join(testDir, "applicability_gate.fixture.json")),
);

assert.equal(
  fixture.schema_id,
  "soulforge.codex_thread_manager_applicability_fixture.v1",
);
assert.ok(Array.isArray(fixture.cases) && fixture.cases.length >= 8);

const workflow = await readUtf8(path.join(workflowDir, "workflow.yaml"));
const stepGraph = await readUtf8(path.join(workflowDir, "step_graph.yaml"));
const handoffRules = await readUtf8(path.join(workflowDir, "handoff_rules.yaml"));
const monsterRules = await readUtf8(path.join(workflowDir, "monster_rules.yaml"));
const readme = await readUtf8(path.join(workflowDir, "README.md"));
const canonicalSkill = await readUtf8(
  path.join(
    repoRoot,
    ".registry",
    "skills",
    "codex_thread_manager",
    "codex",
    "SKILL.md",
  ),
);
const canonicalOpenAi = await readUtf8(
  path.join(
    repoRoot,
    ".registry",
    "skills",
    "codex_thread_manager",
    "codex",
    "agents",
    "openai.yaml",
  ),
);
const registrySkill = await readUtf8(
  path.join(repoRoot, ".registry", "skills", "codex_thread_manager", "skill.yaml"),
);
const workflowConfig = parseYaml(workflow);

for (const [name, source] of [
  ["workflow.yaml", workflow],
  ["step_graph.yaml", stepGraph],
  ["handoff_rules.yaml", handoffRules],
  ["monster_rules.yaml", monsterRules],
  ["skill.yaml", registrySkill],
  ["agents/openai.yaml", canonicalOpenAi],
]) {
  assert.doesNotThrow(() => parseYaml(source), `${name} must remain valid YAML`);
}

const frontmatterMatch = canonicalSkill.match(/^---\r?\n([\s\S]*?)\r?\n---/);
assert.ok(frontmatterMatch, "canonical SKILL.md frontmatter must exist");
const frontmatter = parseYaml(frontmatterMatch[1]);
assert.deepEqual(
  Object.keys(frontmatter).sort(),
  ["description", "name"],
  "canonical skill frontmatter keys",
);
assert.equal(frontmatter.name, "soulforge-codex-thread-manager");
assert.ok(frontmatter.description.length <= 1024, "description length <= 1024");
assert.doesNotMatch(frontmatter.description, /[<>]/);

const { findLocalAbsolutePathViolations } = await import(
  pathToFileURL(
    path.join(repoRoot, "guild_hall", "validate", "local_absolute_path_policy.mjs"),
  ).href
);
for (const [name, source] of [
  ["canonical SKILL.md", canonicalSkill],
  ["canonical agents/openai.yaml", canonicalOpenAi],
  ["registry skill.yaml", registrySkill],
  ["workflow README.md", readme],
  ["workflow.yaml", workflow],
  ["step_graph.yaml", stepGraph],
  ["handoff_rules.yaml", handoffRules],
  ["monster_rules.yaml", monsterRules],
]) {
  assert.deepEqual(
    findLocalAbsolutePathViolations(source, name),
    [],
    `${name} must contain no concrete local absolute paths`,
  );
}

const between = (text, start, end) => {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `missing block start: ${start}`);
  const contentStart = startIndex + start.length;
  const endIndex = text.indexOf(end, contentStart);
  assert.notEqual(endIndex, -1, `missing block end: ${end}`);
  return text.slice(contentStart, endIndex);
};

const applicability = between(
  workflow,
  "applicability_gate:\n",
  "codex_thread_manager_contract:\n",
);
const applicableSignals = between(
  applicability,
  "  applicable_when:\n",
  "  not_applicable_when:\n",
);
const notApplicableSignals = between(
  applicability,
  "  not_applicable_when:\n",
  "  not_applicable_behavior:\n",
);

for (const testCase of fixture.cases) {
  assert.equal(typeof testCase.prompt, "string", `${testCase.case_id}: prompt`);
  if (testCase.expected === "applicable") {
    assert.match(applicableSignals, new RegExp(`- ${testCase.signal}(?:\\r?\\n|$)`));
  } else if (testCase.expected === "not_applicable") {
    assert.match(notApplicableSignals, new RegExp(`- ${testCase.signal}(?:\\r?\\n|$)`));
  } else if (testCase.expected === "clarify") {
    assert.match(applicability, new RegExp(`${testCase.signal}: true`));
  } else {
    assert.fail(`${testCase.case_id}: unsupported expected value`);
  }
}

assert.match(canonicalSkill, /^## Applicability Gate$/m);
assert.match(canonicalSkill, /Using a task tool does not itself trigger\s+this skill\./);
assert.match(canonicalSkill, /stop without loading the workflow/);
assert.match(registrySkill, /Direct task-tool use does not itself\s+trigger this skill\./);
assert.match(readme, /^## Applicability Gate$/m);
assert.match(
  stepGraph,
  /^steps:\r?\n  - step_id: applicability_gate\r?$/m,
  "the applicability gate must be the first workflow step",
);
assert.match(stepGraph, /intake_continues_only_when_applicable: true/);
assert.match(
  handoffRules,
  /condition: applicability_passed_and_goal_and_boundary_declared/,
);
assert.match(
  monsterRules,
  /one_off_task_tool_use_treated_as_thread_orchestration/,
);
assert.match(applicability, /workflow_package_load_forbidden: true/);
assert.match(applicability, /night_work_handoff_refresh_forbidden: true/);
assert.match(applicability, /worker_or_topology_creation_forbidden: true/);
assert.match(applicability, /workspace_board_enrollment_forbidden: true/);
assert.deepEqual(
  workflowConfig.codex_thread_manager_contract.workspace_board_enrollment_policy.task_operations,
  ["create", "fork", "continue", "rollover", "handoff"],
);
assert.match(workflow, /post_operation_enrollment_receipt_required_before_task_operation_completion: true/);
assert.match(workflow, /projectless_task_requires_explicit_delegation_group_nullable_parent_and_safe_label: true/);
assert.match(readme, /mandatory post-operation completion gate/);

console.log(`PASS applicability contract: ${fixture.cases.length} cases`);
