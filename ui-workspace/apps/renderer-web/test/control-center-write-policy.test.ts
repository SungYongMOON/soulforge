import assert from "node:assert/strict";

import {
  CONTROL_CENTER_PROTECTED_WRITE_PREFIXES,
  classifyControlCenterWrite
} from "../src/controlCenterWritePolicy";

// RED-03: the token-gated control-center PUT must stay read-only for protected
// data planes even when the write token is configured, and must reject every
// unsafe path shape before any filesystem resolution happens.

const allowed = [
  "docs/architecture/foundation/VISION_AND_GOALS.md",
  "README.md",
  "AGENTS.md",
  ".registry/index.yaml",
  "guild_hall/README.md",
  "guild_hall/gateway/README.md",
  ".mission/index.yaml"
];

for (const repoPath of allowed) {
  const decision = classifyControlCenterWrite(repoPath);
  assert.deepEqual(decision, { allowed: true, reason: "ok" }, `expected writable: ${repoPath}`);
}

const protectedPlane = [
  "_WORKMETA/demo_project/contract.yaml",
  "Private-State/CHANGELOG.md",
  "_workspaces/README.md",
  "_workspaces/demo_project/notes.md",
  "_workmeta/demo_project/contract.yaml",
  "_workmeta/system/reports/procedure_capture/example.md",
  "private-state/CHANGELOG.md",
  "guild_hall/state/snapshot/soulforge_snapshot.json",
  "_workspaces",
  "_workmeta",
  "private-state",
  "guild_hall/state"
];

for (const repoPath of protectedPlane) {
  const decision = classifyControlCenterWrite(repoPath);
  assert.deepEqual(
    decision,
    { allowed: false, reason: "protected_plane_read_only" },
    `expected protected: ${repoPath}`
  );
}

const invalidShape = [
  "",
  "/etc/passwd",
  // Concatenated so this tracked source never contains a literal drive-path
  // shape (the repo path policy scans source bytes).
  "C:" + "/Win" + "dows/system32/config",
  "c:secret.md",
  "docs\\architecture\\README.md",
  "docs/../.env",
  "../outside.md",
  "./docs/README.md",
  "docs//README.md",
  ".."
];

for (const repoPath of invalidShape) {
  const decision = classifyControlCenterWrite(repoPath);
  assert.deepEqual(
    decision,
    { allowed: false, reason: "path_shape_invalid" },
    `expected invalid shape: ${JSON.stringify(repoPath)}`
  );
}

// The protected-prefix contract itself stays pinned: silently narrowing it is a
// policy change that must show up in this test.
assert.deepEqual(
  [...CONTROL_CENTER_PROTECTED_WRITE_PREFIXES],
  ["_workspaces/", "_workmeta/", "private-state/", "guild_hall/state/"]
);

console.log("control-center write policy: %d writable, %d protected, %d invalid — all decisions verified", allowed.length, protectedPlane.length, invalidShape.length);
