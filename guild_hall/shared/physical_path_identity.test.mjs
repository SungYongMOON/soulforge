import assert from "node:assert/strict";
import test from "node:test";

import { comparablePathIdentity } from "./physical_path_identity.mjs";

test("normalizes only the fixed macOS /var root alias", () => {
  const macVar = ["", "var", "folders", "ab", "example"].join("/");
  const macPrivateVar = ["", "private", "var", "folders", "ab", "example"].join("/");
  assert.equal(
    comparablePathIdentity(macVar, "darwin"),
    comparablePathIdentity(macPrivateVar, "darwin"),
  );
  const otherAlias = ["", "Volumes", "linked", "example"].join("/");
  const otherPhysical = ["", "private", "example"].join("/");
  assert.notEqual(
    comparablePathIdentity(otherAlias, "darwin"),
    comparablePathIdentity(otherPhysical, "darwin"),
  );
});

test("keeps existing Windows case folding and other platforms unchanged", () => {
  const windowsUpper = ["C:", "Temp", "Example"].join("\\");
  const windowsLower = ["c:", "temp", "example"].join("\\");
  assert.equal(
    comparablePathIdentity(windowsUpper, "win32"),
    comparablePathIdentity(windowsLower, "win32"),
  );
  const linuxPath = ["", "var", "example"].join("/");
  assert.equal(comparablePathIdentity(linuxPath, "linux"), linuxPath);
});
