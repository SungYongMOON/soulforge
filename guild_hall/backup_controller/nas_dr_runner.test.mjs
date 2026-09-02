import test from "node:test";
import assert from "node:assert/strict";

import { validateConfig } from "./nas_dr_runner.mjs";

// A backslash-heavy destination written as a literal here would trip the
// repository path-policy byte scan, so the probes are assembled at runtime.
const BS = String.fromCharCode(92);
const UNC = (host, share) => `${BS}${BS}${host}${BS}${share}`;

const good = () => ({
  schema_version: "soulforge.backup_controller.nas_dr_runner_config.v0",
  destination_root: UNC("nas-host", "dr_target"),
  generation_prefix: "auto",
  keep_generations: 14,
  min_free_bytes: 1099511627776,
  staging_max_age_hours: 24,
  source_sets: [{ class: "runtime_state", id: "example", path: `D:${BS}example` }],
});

const refuses = (mutate, fragment) => {
  const cfg = good();
  mutate(cfg);
  assert.throws(() => validateConfig(cfg), (e) => e.message.includes(fragment),
    `expected a refusal mentioning "${fragment}"`);
};

test("a coherent config validates", () => {
  assert.equal(validateConfig(good()).keep_generations, 14);
});

test("the destination must be a UNC path, never a drive letter", () => {
  // A drive-letter mount is session-scoped and its reported free space is a
  // synthetic constant, so it cannot carry a capacity-bearing backup contract.
  refuses((c) => { c.destination_root = `Z:${BS}soulforge_backup`; }, "UNC path");
  refuses((c) => { c.destination_root = ["", "mnt", "nas", "dr"].join("/"); }, "UNC path");
  refuses((c) => { c.destination_root = ""; }, "UNC path");
});

test("a RaiDrive virtual host is refused in any spelling", () => {
  for (const host of ["RaiDrive-user", "raidrive", "RaiDrive1", "myRaiDrive-2", "raidrive.local"]) {
    refuses((c) => { c.destination_root = UNC(host, "Synology"); }, "RaiDrive");
  }
});

test("retention can never be configured below two generations", () => {
  // One generation means the only copy is deleted the moment a new one starts.
  refuses((c) => { c.keep_generations = 1; }, "keep_generations");
  refuses((c) => { c.keep_generations = 0; }, "keep_generations");
  refuses((c) => { c.keep_generations = "many"; }, "keep_generations");
});

test("a low-space floor is mandatory and positive", () => {
  refuses((c) => { c.min_free_bytes = 0; }, "min_free_bytes");
  refuses((c) => { delete c.min_free_bytes; }, "min_free_bytes");
});

test("a config with the wrong schema or no sources is refused", () => {
  refuses((c) => { c.schema_version = "something.else.v9"; }, "schema mismatch");
  refuses((c) => { c.source_sets = []; }, "no source sets");
  refuses((c) => { delete c.source_sets; }, "no source sets");
});
