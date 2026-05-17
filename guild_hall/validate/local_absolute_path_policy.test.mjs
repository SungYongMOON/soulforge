import test from "node:test";
import assert from "node:assert/strict";
import { findLocalAbsolutePathViolations } from "./local_absolute_path_policy.mjs";

test("local absolute path policy flags concrete local paths", () => {
  const text = [
    `run_from: ${"C:"}/Soulforge`,
    `tool: ${"C:"}\\\\Cadence\\\\SPB_25.1\\\\tools\\\\bin\\\\psp_cmd.exe`,
    `mac: ${"/"}Users/seabotmoon-air/Workspace/Soulforge`,
    `file_link: ${"file:"}${"///"}${"Users"}/seabotmoon-air/Workspace/Soulforge/README.md`,
  ].join("\n");

  const violations = findLocalAbsolutePathViolations(text, "example.yaml");
  assert.deepEqual(
    violations.map((violation) => violation.id),
    [
      "windows_local_absolute_path",
      "windows_local_absolute_path",
      "posix_local_absolute_path",
      "file_uri_absolute_path",
    ],
  );
});

test("local absolute path policy ignores URLs and repo-relative paths", () => {
  const text = [
    "source: https://github.com/SungYongMOON/soulforge.git",
    "demo: demo://attachments/example.zip",
    "relative: _workmeta/system/runs/example/RUN_MANIFEST.yaml",
    "placeholder: <LOCAL_SOULFORGE_ROOT>/guild_hall/state",
  ].join("\n");

  assert.equal(findLocalAbsolutePathViolations(text, "example.md").length, 0);
});
