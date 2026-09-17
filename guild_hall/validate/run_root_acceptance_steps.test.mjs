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
    ['"synthetic-recovery-canary"', "npm run validate:synthetic-recovery-canary"],
    ['"battle-log"', "npm run validate:battle-log"],
    ['"agent-observation"', "npm run validate:agent-observation"],
    ['"ai-usage-meter"', "npm run validate:ai-usage-meter"],
    ['"authority-taxonomy"', "npm run validate:authority-taxonomy"],
    ['"product-composition"', "npm run validate:product-composition"],
    ['"manual-release"', "npm run validate:manual-release"],
    ['"manual-projection"', "npm run validate:manual-projection"],
    ['"internal-rc-prephysical"', "npm run validate:internal-rc-prephysical"],
    ['"main-node-deployment"', "npm run validate:main-node-deployment"],
    ['"universal-client"', "npm run validate:universal-client"],
    ['"dev-erp-mcp"', "npm run validate:dev-erp-mcp"],
    ['"tongs-lane"', "npm run validate:tongs-lane"],
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
    ['"quality-readiness-deepening"', "npm run validate:quality-readiness-deepening"],
    ['"database-engineering"', "npm run validate:database-engineering"],
    ['"material-procurement-readiness"', "npm run validate:material-procurement-readiness"],
    ['"configuration-change-impact"', "npm run validate:configuration-change-impact"],
    ['"manufacturing-readiness"', "npm run validate:manufacturing-readiness"],
    ['"field-failure-corrective-action"', "npm run validate:field-failure-corrective-action"],
    ['"safety-hazard"', "npm run validate:safety-hazard"],
    ['"bom-supply-chain-risk"', "npm run validate:bom-supply-chain-risk"],
    ['"interface-consistency"', "npm run validate:interface-consistency"],
    ['"reliability-maintainability"', "npm run validate:reliability-maintainability"],
    ['"pcb-compliance"', "npm run validate:pcb-compliance"],
    ['"calibration-measurement-validity"', "npm run validate:calibration-measurement-validity"],
    ['"engine-release"', "npm run validate:engine-release"],
    ['"watchtower"', "npm run validate:watchtower"],
    ['"secure-work"', "npm run validate:secure-work"],
  ];
  for (const [stepId, command] of requiredSteps) {
    const occurrences = source.split(stepId).length - 1;
    assert.equal(occurrences, 2, `${stepId} 스텝은 두 모드(validate·done-check)에 각 1회 있어야 함 (현재 ${occurrences})`);
    assert.equal(source.includes(command), true, `${stepId} 스텝 명령 누락: ${command}`);
  }
});

test("루트 게이트: display-terms 스텝이 두 모드 모두 path-policy 바로 뒤에 배선돼 있다", () => {
  const blocks = source.match(/(?:validate|"done-check"): \[[\s\S]*?\n  \],/g) ?? [];
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const pathPolicyIndex = lines.findIndex((line) => line.startsWith('["path-policy"'));
    assert.ok(pathPolicyIndex >= 0, "path-policy step is missing");
    assert.equal(
      lines[pathPolicyIndex + 1],
      '["display-terms", "npm run validate:display-terms"],',
      "display-terms step must immediately follow path-policy",
    );
    // secure-work's own validator (node --check + node --test, no Python/venv
    // dependency) sits right after display-terms so a from-scratch checkout
    // with no E14 kit or venv bound still gates on it in both modes -- see
    // guild_hall/secure_work/README.md and SECURE_WORK_CYCLE_V0.md B4.
    assert.equal(
      lines[pathPolicyIndex + 2],
      '["secure-work", "npm run validate:secure-work"],',
      "secure-work step must immediately follow display-terms",
    );
  }
  // The path-policy step next to it is itself wired at "tracked" scope, not "changed": its command
  // calls `validate:path-policy:all`, which runs `local_absolute_path_policy.mjs --scope tracked`,
  // so the gate exercises every tracked document even on a clean tree. `validate:display-terms`
  // now matches that: it is the tracked-scope gate with a baseline exemption file
  // (`retired_display_terms_baseline.json`), so a clean tree still scans the whole tree instead of
  // trivially passing with zero files considered. A violation outside the baseline still fails the
  // run; a violation inside a baselined file is exempted; and a baselined file with zero current
  // violations only warns (see `guild_hall/validate/README.md`) without failing, as a prompt to trim
  // the baseline. `validate:display-terms:changed` stays available for a fast during-edit check, and
  // `validate:display-terms:tracked` stays available as a baseline-free, manual, whole-tree audit
  // that may legitimately show red.
  assert.equal(
    rootPackage.scripts["validate:display-terms"],
    "node --test guild_hall/validate/retired_display_terms_policy.test.mjs && node guild_hall/validate/retired_display_terms_policy.mjs --scope tracked --baseline guild_hall/validate/retired_display_terms_baseline.json",
  );
  assert.equal(rootPackage.scripts["validate:display-terms:changed"], "node guild_hall/validate/retired_display_terms_policy.mjs --scope changed");
  assert.equal(rootPackage.scripts["validate:display-terms:tracked"], "node guild_hall/validate/retired_display_terms_policy.mjs --scope tracked");
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
