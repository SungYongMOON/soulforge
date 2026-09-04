import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_DENIED_WRITE_PATHS,
  findDeniedAgentWritePaths,
  isDeniedAgentWritePath,
} from "./agent_write_boundary.mjs";

test("정확한 파일과 하위 트리를 모두 막는다", () => {
  assert.ok(isDeniedAgentWritePath("guild_hall/watchtower/health_recovery_coordinator.mjs"));
  assert.ok(isDeniedAgentWritePath("guild_hall/path_registry/"));
  assert.ok(isDeniedAgentWritePath("guild_hall/path_registry/src/path_registry_core.mjs"));
  assert.ok(isDeniedAgentWritePath("AGENTS.md"));

  assert.ok(!isDeniedAgentWritePath("guild_hall/watchtower/topology.mjs"));
  assert.ok(!isDeniedAgentWritePath("guild_hall/dev_worker/README.md"));
  assert.ok(!isDeniedAgentWritePath("CHANGELOG.md"));
  assert.ok(!isDeniedAgentWritePath(""));
  assert.ok(!isDeniedAgentWritePath(null));
});

test("넓은 경로로 금지 항목을 삼키는 것을 막는다", () => {
  // `guild_hall/` 을 통째로 허용하면 그 아래 금지 항목이 전부 열린다.
  // 부모 경로도 막지 않으면 이 목록은 한 줄로 우회된다.
  for (const wide of ["guild_hall/", "guild_hall", "guild_hall/watchtower/", "."]) {
    assert.ok(isDeniedAgentWritePath(wide), `${wide} 는 금지 항목을 포함한다`);
  }
  // 금지 항목을 포함하지 않는 넓은 경로는 통과한다.
  assert.ok(!isDeniedAgentWritePath("docs/architecture/guild_hall/"));
  assert.ok(!isDeniedAgentWritePath("ui-workspace/"));
});

test("경로 표기 차이로 우회되지 않는다", () => {
  for (const spelling of [
    "guild_hall\\watchtower\\alert_policy.mjs",   // 역슬래시
    "./guild_hall/watchtower/alert_policy.mjs",   // 앞의 ./
    "  guild_hall/watchtower/alert_policy.mjs  ", // 공백
  ]) {
    assert.ok(isDeniedAgentWritePath(spelling), spelling);
  }
});

test("packet 이 무엇을 적든 금지 항목은 사유와 함께 잡힌다", () => {
  const hits = findDeniedAgentWritePaths([
    "guild_hall/watchtower/topology.mjs",                       // 허용
    "guild_hall/dev_worker/candidate_queue.mjs",                // 금지 - 자기 승인정책
    "guild_hall/validate/",                                     // 금지 - 검사기
  ]);
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map((hit) => hit.requested).sort(), [
    "guild_hall/dev_worker/candidate_queue.mjs",
    "guild_hall/validate/",
  ]);
  assert.ok(hits.every((hit) => typeof hit.why === "string" && hit.why.length > 0), "사유가 붙는다");
});

test("경계 밖 packet 은 통과한다", () => {
  assert.deepEqual(findDeniedAgentWritePaths([
    "guild_hall/watchtower/topology.mjs", "CHANGELOG.md", "docs/architecture/guild_hall/",
  ]), []);
  assert.deepEqual(findDeniedAgentWritePaths([]), []);
  assert.deepEqual(findDeniedAgentWritePaths(null), []);
});

test("이 목록 자신과 검사기가 목록에 들어 있다", () => {
  // 이 둘이 빠지면 에이전트가 목록을 지우거나 검사기를 무르게 만들 수 있고,
  // 그러면 나머지 항목은 전부 무의미해진다.
  const denied = AGENT_DENIED_WRITE_PATHS.map((entry) => entry.path);
  assert.ok(denied.includes("guild_hall/shared/agent_write_boundary.mjs"));
  assert.ok(denied.includes("guild_hall/validate/"));
  assert.ok(isDeniedAgentWritePath("guild_hall/shared/agent_write_boundary.test.mjs")
    || isDeniedAgentWritePath("guild_hall/shared/agent_write_boundary.mjs"));
});

test("모든 항목에 사유가 있다", () => {
  for (const entry of AGENT_DENIED_WRITE_PATHS) {
    assert.ok(typeof entry.path === "string" && entry.path.length > 0);
    assert.ok(typeof entry.why === "string" && entry.why.length > 0, `${entry.path} 사유 없음`);
  }
});
