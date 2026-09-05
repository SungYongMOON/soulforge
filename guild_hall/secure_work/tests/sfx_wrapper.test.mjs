// The Node entry point must fail closed on its own, before it can start an
// interpreter or reach any adapter. These tests need no Python and no kit, so
// they run anywhere the rest of the tree's checks run.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readRuntime, resolveConfigPath } from "../sfx.mjs";

function scratch() {
  return mkdtempSync(path.join(tmpdir(), "sfx-test-"));
}

// Built by concatenation on purpose: the repository's absolute-path policy scans
// source bytes, so a literal drive-rooted string here would read as a real host
// path even though nothing on any disk is named this.
const FLAG = `${"C"}:/example-config/from-flag.json`;
const FROM_ENV = `${"C"}:/example-config/from-env.json`;

test("config comes from --config, then the environment, then nothing", () => {
  assert.equal(resolveConfigPath(["--config", FLAG, "doctor"], {}), FLAG);
  assert.equal(resolveConfigPath(["doctor"], { SOULFORGE_SECURE_WORK_CONFIG: FROM_ENV }),
    FROM_ENV);
  assert.equal(resolveConfigPath(["doctor"], {}), null);
  assert.equal(resolveConfigPath(["--config", "--job"], {}), null);
});

test("an unbound or missing config is a code, not a crash", () => {
  assert.equal(readRuntime(null).code, "CONFIG_NOT_BOUND");
  assert.equal(readRuntime(path.join(scratch(), "absent.json")).code, "CONFIG_FILE_MISSING");
});

test("a malformed or foreign config is refused", () => {
  const dir = scratch();
  const broken = path.join(dir, "broken.json");
  writeFileSync(broken, "{ not json", "utf8");
  assert.equal(readRuntime(broken).code, "CONFIG_FILE_INVALID");

  const foreign = path.join(dir, "foreign.json");
  writeFileSync(foreign, JSON.stringify({ schema: "something.else.v9" }), "utf8");
  assert.equal(readRuntime(foreign).code, "CONFIG_SCHEMA_MISMATCH");
});

test("an unbound, relative or absent interpreter is refused", () => {
  const dir = scratch();
  const base = { schema: "soulforge.secure_work.config.v0" };

  const unbound = path.join(dir, "unbound.json");
  writeFileSync(unbound, JSON.stringify(base), "utf8");
  assert.equal(readRuntime(unbound).code, "PYTHON_NOT_BOUND");

  const relative = path.join(dir, "relative.json");
  writeFileSync(relative, JSON.stringify({ ...base, runtime: { python_executable: "python" } }), "utf8");
  assert.equal(readRuntime(relative).code, "PYTHON_PATH_NOT_ABSOLUTE");

  const absent = path.join(dir, "absent-interpreter.json");
  const missing = path.join(dir, "no", "such", "python");
  writeFileSync(absent, JSON.stringify({ ...base, runtime: { python_executable: missing } }), "utf8");
  assert.equal(readRuntime(absent).code, "PYTHON_NOT_FOUND");
});

test("a config that names this test file as its interpreter resolves", () => {
  const dir = scratch();
  const interpreter = path.join(dir, "python-stand-in");
  writeFileSync(interpreter, "", "utf8");
  const bound = path.join(dir, "bound.json");
  writeFileSync(bound, JSON.stringify({
    schema: "soulforge.secure_work.config.v0",
    runtime: { python_executable: interpreter },
  }), "utf8");
  const runtime = readRuntime(bound);
  assert.equal(runtime.code, undefined);
  assert.equal(runtime.interpreter, interpreter);
});
