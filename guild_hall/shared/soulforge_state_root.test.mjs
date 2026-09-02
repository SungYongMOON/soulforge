import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SOULFORGE_OWNER_ROOT_ENV,
  SOULFORGE_ROOT_OVERRIDE_INVALID,
  SOULFORGE_STATE_ROOT_ENV,
  SoulforgeRootOverrideError,
  readSoulforgeRootOverride,
  resolveSoulforgeStateRoot,
} from "./soulforge_state_root.mjs";

async function tempRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-state-root-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return root;
}

function assertOverrideRejected(fn, variable, reason) {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof SoulforgeRootOverrideError, "override error type");
  assert.equal(caught.code, SOULFORGE_ROOT_OVERRIDE_INVALID);
  assert.equal(caught.variable, variable);
  assert.equal(caught.reason, reason);
  assert.match(caught.message, new RegExp(`^${variable} is set but`, "u"));
  return caught;
}

test("no override: returns null and callers keep their fallback byte-for-byte", () => {
  assert.equal(readSoulforgeRootOverride({}), null);
  assert.equal(readSoulforgeRootOverride({ UNRELATED: "x" }), null);
  assert.equal(readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: undefined }), null);
  const fallback = path.join("checkout", "guild_hall", "state");
  assert.equal(resolveSoulforgeStateRoot({}, fallback), fallback);
  let evaluated = 0;
  assert.equal(resolveSoulforgeStateRoot({}, () => { evaluated += 1; return fallback; }), fallback);
  assert.equal(evaluated, 1);
});

test("SOULFORGE_STATE_ROOT alone replaces the state root and leaves the owner root unset", async (t) => {
  const stateRoot = await tempRoot(t);
  const override = readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: stateRoot });
  assert.deepEqual(override, { source: "state_root", ownerRoot: null, stateRoot: path.resolve(stateRoot) });
  let evaluated = 0;
  assert.equal(resolveSoulforgeStateRoot({ [SOULFORGE_STATE_ROOT_ENV]: stateRoot }, () => { evaluated += 1; return "x"; }), path.resolve(stateRoot));
  assert.equal(evaluated, 0, "fallback is not evaluated when the override applies");
});

test("SOULFORGE_OWNER_ROOT alone derives <owner>/guild_hall/state", async (t) => {
  const ownerRoot = await tempRoot(t);
  const override = readSoulforgeRootOverride({ [SOULFORGE_OWNER_ROOT_ENV]: ownerRoot });
  assert.deepEqual(override, {
    source: "owner_root",
    ownerRoot: path.resolve(ownerRoot),
    stateRoot: path.join(path.resolve(ownerRoot), "guild_hall", "state"),
  });
});

test("both set: the finer SOULFORGE_STATE_ROOT wins for state and the owner root is kept", async (t) => {
  const ownerRoot = await tempRoot(t);
  const stateRoot = await tempRoot(t);
  const override = readSoulforgeRootOverride({
    [SOULFORGE_OWNER_ROOT_ENV]: ownerRoot,
    [SOULFORGE_STATE_ROOT_ENV]: stateRoot,
  });
  assert.deepEqual(override, {
    source: "state_root",
    ownerRoot: path.resolve(ownerRoot),
    stateRoot: path.resolve(stateRoot),
  });
});

test("forward-slash spelling of an existing absolute directory is normalized", async (t) => {
  const stateRoot = await tempRoot(t);
  const spelled = stateRoot.split(path.sep).join("/");
  const override = readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: spelled });
  assert.equal(override.stateRoot, path.resolve(stateRoot));
});

test("surrounding whitespace is trimmed before validation and never reaches the resolved root", async (t) => {
  const stateRoot = await tempRoot(t);
  const ownerRoot = await tempRoot(t);
  const override = readSoulforgeRootOverride({
    [SOULFORGE_OWNER_ROOT_ENV]: `  ${ownerRoot}\t`,
    [SOULFORGE_STATE_ROOT_ENV]: `${stateRoot}   `,
  });
  assert.deepEqual(override, {
    source: "state_root",
    ownerRoot: path.resolve(ownerRoot),
    stateRoot: path.resolve(stateRoot),
  });
  assert.equal(
    readSoulforgeRootOverride({ [SOULFORGE_OWNER_ROOT_ENV]: ` ${ownerRoot} ` }).stateRoot,
    path.join(path.resolve(ownerRoot), "guild_hall", "state"),
  );
  // A trailing newline (a common Scheduled Task / shell artifact) is whitespace and is trimmed too.
  assert.equal(readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: `${stateRoot}\n` }).stateRoot, path.resolve(stateRoot));
});

test("Windows: a rooted-but-driveless value is refused; drive and UNC roots pass the root check", async (t) => {
  const stateRoot = await tempRoot(t);
  // `<sep>driveless` is absolute on the native platform but carries no drive
  // or UNC root; the win32 rule is exercised on every platform by injection.
  const driveless = `${path.sep}driveless`;
  assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: driveless }, { platform: "win32" }),
    SOULFORGE_STATE_ROOT_ENV,
    "drive_or_unc_required",
  );
  assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_OWNER_ROOT_ENV]: driveless }, { platform: "win32" }),
    SOULFORGE_OWNER_ROOT_ENV,
    "drive_or_unc_required",
  );
  if (process.platform === "win32") {
    assertOverrideRejected(
      () => readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: "\\driveless" }),
      SOULFORGE_STATE_ROOT_ENV,
      "drive_or_unc_required",
    );
    // An existing drive-rooted directory still passes on the real platform.
    assert.equal(readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: stateRoot }).stateRoot, path.resolve(stateRoot));
    // A UNC root passes the root check (existence is proven by the injected stat).
    const directory = { isDirectory: () => true };
    assert.equal(
      readSoulforgeRootOverride(
        { [SOULFORGE_STATE_ROOT_ENV]: "\\\\server\\share\\state" },
        { stat: () => directory },
      ).stateRoot,
      path.resolve("\\\\server\\share\\state"),
    );
  }
});

test("fail closed: relative, missing, file, empty, and control-character values refuse without echoing the value", async (t) => {
  const root = await tempRoot(t);
  const file = path.join(root, "not-a-directory.txt");
  await writeFile(file, "x", "utf8");
  const missing = path.join(root, "does-not-exist");
  const relative = path.join("relative", "state-root");

  const relativeError = assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: relative }),
    SOULFORGE_STATE_ROOT_ENV,
    "relative",
  );
  assert.equal(relativeError.message.includes(relative), false, "message must not echo the value");
  assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: missing }),
    SOULFORGE_STATE_ROOT_ENV,
    "missing",
  );
  assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: file }),
    SOULFORGE_STATE_ROOT_ENV,
    "not_directory",
  );
  assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: "" }),
    SOULFORGE_STATE_ROOT_ENV,
    "empty",
  );
  assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: "   " }),
    SOULFORGE_STATE_ROOT_ENV,
    "empty",
  );
  // Whitespace control characters at the ends are trimmed; an embedded
  // non-whitespace control character is still refused.
  assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_STATE_ROOT_ENV]: `${root}${path.sep}${String.fromCharCode(1)}sub` }),
    SOULFORGE_STATE_ROOT_ENV,
    "control_character",
  );
  assertOverrideRejected(
    () => readSoulforgeRootOverride({ [SOULFORGE_OWNER_ROOT_ENV]: missing }),
    SOULFORGE_OWNER_ROOT_ENV,
    "missing",
  );
  assertOverrideRejected(
    () => resolveSoulforgeStateRoot({ [SOULFORGE_OWNER_ROOT_ENV]: relative }, "fallback"),
    SOULFORGE_OWNER_ROOT_ENV,
    "relative",
  );
});

test("fail closed: a broken owner root is refused even when the state root is valid", async (t) => {
  const stateRoot = await tempRoot(t);
  assertOverrideRejected(
    () => readSoulforgeRootOverride({
      [SOULFORGE_OWNER_ROOT_ENV]: path.join(stateRoot, "missing-owner"),
      [SOULFORGE_STATE_ROOT_ENV]: stateRoot,
    }),
    SOULFORGE_OWNER_ROOT_ENV,
    "missing",
  );
});
