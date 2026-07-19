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

test("루트 게이트: 앱 테스트 스텝이 validate·done-check 양 모드에 배선돼 있다", () => {
  const requiredSteps = [
    ['"dev-erp"', "npm --prefix ui-workspace/apps/dev-erp test"],
    ['"team-ops-app"', "npm run validate:team-ops-app"],
    ['"shared"', "npm run validate:shared"],
    ['"ingress-staging"', "npm run validate:ingress-staging"],
    ['"ingress-continuous"', "npm run validate:ingress-continuous"],
    ['"dev-erp-mcp"', "npm run validate:dev-erp-mcp"],
  ];
  for (const [stepId, command] of requiredSteps) {
    const occurrences = source.split(stepId).length - 1;
    assert.equal(occurrences, 2, `${stepId} 스텝은 두 모드(validate·done-check)에 각 1회 있어야 함 (현재 ${occurrences})`);
    assert.equal(source.includes(command), true, `${stepId} 스텝 명령 누락: ${command}`);
  }
});
