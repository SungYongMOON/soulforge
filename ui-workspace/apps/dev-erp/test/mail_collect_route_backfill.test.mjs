import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { mailRouteBackfillConfig } from "../src/mail_collect.mjs";

const ENV_KEYS = [
  "DEV_ERP_MAIL_ROUTE_BACKFILL",
  "DEV_ERP_MAIL_PROJECT_ROUTER_BINDING",
  "DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HIDDEN",
  "DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HINT",
  "DEV_ERP_MAIL_ROUTE_BACKFILL_PRIVATE_DEEP",
];

async function withEnv(vars, fn) {
  const old = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
  try {
    return await fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = old.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "sf-mail-collect-route-"));
  const binding = join(root, "_workmeta", "system", "bindings", "mail_project_router.yaml");
  mkdirSync(join(root, "_workmeta", "system", "bindings"), { recursive: true });
  writeFileSync(binding, "schema_version: test\nrules: []\n", "utf8");
  return {
    root,
    binding,
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

test("mail collect auto-enables route backfill when local binding exists", async () => {
  const rt = makeRoot();
  try {
    await withEnv({}, async () => {
      const cfg = mailRouteBackfillConfig({ repoRoot: rt.root });
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.binding, resolve(rt.binding));
      assert.equal(cfg.includeHidden, false);
      assert.equal(cfg.includeHint, false);
      assert.equal(cfg.privateDeep, false);
    });
  } finally {
    rt.cleanup();
  }
});

test("mail collect route backfill can use explicit runtime binding path", async () => {
  const rt = makeRoot();
  try {
    await withEnv({
      DEV_ERP_MAIL_PROJECT_ROUTER_BINDING: rt.binding,
      DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HIDDEN: "1",
      DEV_ERP_MAIL_ROUTE_BACKFILL_PRIVATE_DEEP: "yes",
    }, async () => {
      const cfg = mailRouteBackfillConfig({ repoRoot: join(rt.root, "runtime_without_workmeta") });
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.binding, resolve(rt.binding));
      assert.equal(cfg.includeHidden, true);
      assert.equal(cfg.includeHint, false);
      assert.equal(cfg.privateDeep, true);
    });
  } finally {
    rt.cleanup();
  }
});

test("mail collect route backfill can find sibling Soulforge binding from runtime root", async () => {
  const parent = mkdtempSync(join(tmpdir(), "sf-mail-collect-sibling-"));
  const sourceRoot = join(parent, "Soulforge");
  const runtimeRoot = join(parent, "Soulforge-runtime");
  const binding = join(sourceRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");
  try {
    mkdirSync(join(sourceRoot, "_workmeta", "system", "bindings"), { recursive: true });
    mkdirSync(runtimeRoot, { recursive: true });
    writeFileSync(binding, "schema_version: test\nrules: []\n", "utf8");
    await withEnv({}, async () => {
      const cfg = mailRouteBackfillConfig({ repoRoot: runtimeRoot });
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.binding, resolve(binding));
    });
  } finally {
    if (existsSync(parent)) rmSync(parent, { recursive: true, force: true });
  }
});

test("mail collect route backfill reports required missing binding", async () => {
  const root = mkdtempSync(join(tmpdir(), "sf-mail-collect-route-missing-"));
  try {
    await withEnv({ DEV_ERP_MAIL_ROUTE_BACKFILL: "1" }, async () => {
      const cfg = mailRouteBackfillConfig({ repoRoot: root });
      assert.equal(cfg.enabled, false);
      assert.equal(cfg.required, true);
      assert.equal(cfg.reason, "binding_missing");
    });
  } finally {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});
