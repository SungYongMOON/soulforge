import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// run_root_acceptance.mjs 는 import 시 top-level 로 즉시 실행되므로 소스 텍스트로 검사한다.
const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "run_root_acceptance.mjs"),
  "utf8",
);
const rootPackage = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"),
  "utf8",
));

test("루트 게이트: 앱 테스트 스텝이 validate·done-check 양 모드에 배선돼 있다", () => {
  const requiredSteps = [
    ['"dev-erp"', "npm --prefix ui-workspace/apps/dev-erp test"],
    ['"team-ops-app"', "npm run validate:team-ops-app"],
    ['"shared"', "npm run validate:shared"],
    ['"project-history-readiness"', "npm run validate:project-history-readiness"],
    ['"ingress-staging"', "npm run validate:ingress-staging"],
    ['"ingress-continuous"', "npm run validate:ingress-continuous"],
    ['"ingress-recovery"', "npm run validate:ingress-recovery"],
    ['"ingress-authority"', "npm run validate:ingress-authority"],
    ['"project-history-receipt-adapter-v2"', "npm run validate:project-history-receipt-adapter-v2"],
    ['"backup-controller"', "npm run validate:backup-controller"],
    ['"dev-erp-mcp"', "npm run validate:dev-erp-mcp"],
    ['"codex-work-directory"', "npm run validate:codex-work-directory"],
    ['"engineering-engine-ax-se-project-assessment"',
      "npm run validate:engineering-engine-ax-se-project-assessment"],
    ['"engineering-engine-p5-context-generation-candidate"',
      "npm run validate:engineering-engine-p5-context-generation-candidate"],
    ['"voice-first-accepted-context"',
      "npm run validate:voice-first-accepted-context"],
    ['"voice-first-worker-runtime"',
      "npm run validate:voice-first-worker-runtime"],
    ['"voice-first-mutation-canary"',
      "npm run validate:voice-first-mutation-canary"],
    ['"engineering-engine-no-duplicate-authority"', "npm run validate:engineering-engine-no-duplicate-authority"],
    ['"engineering-engine-core-domain"', "npm run validate:engineering-engine-core-domain"],
    ['"quality-readiness"', "npm run validate:quality-readiness"],
    ['"database-engineering"', "npm run validate:database-engineering"],
    ['"engine-release"', "npm run validate:engine-release"],
    ['"watchtower"', "npm run validate:watchtower"],
  ];
  for (const [stepId, command] of requiredSteps) {
    const occurrences = source.split(stepId).length - 1;
    assert.equal(occurrences, 2, `${stepId} 스텝은 두 모드(validate·done-check)에 각 1회 있어야 함 (현재 ${occurrences})`);
    assert.equal(source.includes(command), true, `${stepId} 스텝 명령 누락: ${command}`);
  }
});

test("root gates validate AX-SE before Watchtower and Watchtower before its consumer", () => {
  const blocks = source.match(/(?:validate|"done-check"): \[[\s\S]*?\n  \],/g) ?? [];
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    const axSe = block.indexOf(
      '["engineering-engine-ax-se-project-assessment", '
      + '"npm run validate:engineering-engine-ax-se-project-assessment"]',
    );
    const watchtower = block.indexOf('["watchtower", "npm run validate:watchtower"]');
    const p5Candidate = block.indexOf(
      '["engineering-engine-p5-context-generation-candidate", '
      + '"npm run validate:engineering-engine-p5-context-generation-candidate"]',
    );
    const acceptedContext = block.indexOf(
      '["voice-first-accepted-context", "npm run validate:voice-first-accepted-context"]',
    );
    const workerRuntime = block.indexOf(
      '["voice-first-worker-runtime", "npm run validate:voice-first-worker-runtime"]',
    );
    const mutationCanary = block.indexOf(
      '["voice-first-mutation-canary", "npm run validate:voice-first-mutation-canary"]',
    );
    const board = block.indexOf('["team-ops-app", "npm run validate:team-ops-app"]');
    assert.ok(axSe >= 0, "AX-SE focused validator step is missing");
    assert.ok(p5Candidate > axSe, "P5 candidate validation must follow its AX-SE producer gate");
    assert.ok(acceptedContext > p5Candidate, "accepted-context validation must follow its P5 candidate gate");
    assert.ok(workerRuntime > acceptedContext, "worker-runtime validation must follow accepted context");
    assert.ok(mutationCanary > workerRuntime, "mutation-canary validation must follow worker runtime");
    assert.ok(watchtower > mutationCanary, "Watchtower must follow the Engine gates it projects");
    assert.ok(watchtower >= 0, "watchtower step is missing");
    assert.ok(board > watchtower, "the consumer must follow its topology producer gate");
  }
});

test("루트 게이트: continuous ingress 검증이 mail bridge 전용 syntax·test를 포함한다", () => {
  const command = rootPackage.scripts["validate:ingress-continuous"];
  assert.equal(typeof command, "string");
  assert.equal(command.includes("node --check guild_hall/ingress/mail_bridge.mjs"), true);
  assert.equal(command.includes("guild_hall/ingress/mail_bridge.test.mjs"), true);
});

test("루트 게이트: Codex work directory 검증이 resolver·CLI syntax와 전용 test를 포함한다", () => {
  const command = rootPackage.scripts["validate:codex-work-directory"];
  assert.equal(typeof command, "string");
  assert.equal(command.includes("node --check guild_hall/codex_work_directory/directory.mjs"), true);
  assert.equal(command.includes("node --check guild_hall/codex_work_directory/cli.mjs"), true);
  assert.equal(command.includes("node --test guild_hall/codex_work_directory/directory.test.mjs"), true);
});
