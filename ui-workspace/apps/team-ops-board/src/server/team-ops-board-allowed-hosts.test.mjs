import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TEAM_OPS_BOARD_ALLOWED_HOSTS,
  resolveTeamOpsBoardAllowedHosts,
} from "./team-ops-board-allowed-hosts.mjs";

const canonicalSyntheticHost = "board.synthetic.ts.net";
const oversizedSyntheticHost = [
  "a".repeat(63),
  "b".repeat(63),
  "c".repeat(63),
  "d".repeat(55),
  "ts",
  "net",
].join(".");

test("accepts exactly one canonical lowercase synthetic tailnet FQDN", () => {
  assert.deepEqual(
    resolveTeamOpsBoardAllowedHosts({ [TEAM_OPS_BOARD_ALLOWED_HOSTS]: canonicalSyntheticHost }),
    [canonicalSyntheticHost],
  );
});

test("unset or blank local values retain Vite's default host policy", () => {
  assert.deepEqual(resolveTeamOpsBoardAllowedHosts({}), []);
  assert.deepEqual(resolveTeamOpsBoardAllowedHosts({ [TEAM_OPS_BOARD_ALLOWED_HOSTS]: "" }), []);
  assert.deepEqual(resolveTeamOpsBoardAllowedHosts({ [TEAM_OPS_BOARD_ALLOWED_HOSTS]: " \t" }), []);
});

test("malformed local values fail closed without custom hosts", () => {
  const malformedSyntheticValues = [
    "*.synthetic.ts.net",
    "203.0.113.8",
    "[2001:db8::8]",
    "https://board.synthetic.ts.net",
    "board.synthetic.ts.net:1234",
    "board.synthetic.ts.net/path",
    "board.synthetic.ts.net,other.synthetic.ts.net",
    "board.synthetic.ts.net,board.synthetic.ts.net",
    "board..synthetic.ts.net",
    "Board.synthetic.ts.net",
    "board.synthetic.ts.net ",
    `${"a".repeat(64)}.synthetic.ts.net`,
    oversizedSyntheticHost,
  ];

  assert.ok(oversizedSyntheticHost.length > 253);
  for (const value of malformedSyntheticValues) {
    assert.deepEqual(
      resolveTeamOpsBoardAllowedHosts({ [TEAM_OPS_BOARD_ALLOWED_HOSTS]: value }),
      [],
      value,
    );
  }
});

test("Vite server and preview share the resolver result and never allow every host", async () => {
  const configSource = await readFile(new URL("../../vite.config.ts", import.meta.url), "utf8");

  assert.match(
    configSource,
    /import\s+\{\s*resolveTeamOpsBoardAllowedHosts\s*\}\s+from\s+"\.\/src\/server\/team-ops-board-allowed-hosts\.mjs";/u,
  );
  assert.match(
    configSource,
    /const boardAllowedHosts = resolveTeamOpsBoardAllowedHosts\(\);/u,
  );
  assert.match(
    configSource,
    /server:\s*\{\s*host:\s*"127\.0\.0\.1",\s*port:\s*4192,\s*allowedHosts:\s*boardAllowedHosts\s*\}/u,
  );
  assert.match(
    configSource,
    /preview:\s*\{\s*host:\s*"127\.0\.0\.1",\s*port:\s*4193,\s*allowedHosts:\s*boardAllowedHosts\s*\}/u,
  );
  assert.equal([...configSource.matchAll(/allowedHosts:\s*boardAllowedHosts\b/gu)].length, 2);
  assert.doesNotMatch(configSource, /allowedHosts\s*:\s*true\b/u);
});
