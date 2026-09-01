import assert from "node:assert/strict";
import { win32 } from "node:path";
import test from "node:test";

import { isRuntimeCheckout } from "../src/runtime_checkout.mjs";

const WINDOWS_DRIVE = ["C", ":"].join("");
const windowsPath = (...segments) => `${WINDOWS_DRIVE}${win32.sep}${segments.join(win32.sep)}`;
const repeatedWindowsPath = (...segments) => `${WINDOWS_DRIVE}${win32.sep.repeat(2)}${segments.join(win32.sep.repeat(2))}${win32.sep.repeat(2)}`;
const posixPath = (...segments) => ["", ...segments].join("/");

test("runtime checkout: legacy Soulforge-runtime root and versioned server-pack payload are admitted", () => {
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge-runtime", "ui-workspace", "apps", "dev-erp")), true);
  assert.equal(isRuntimeCheckout(posixPath("Soulforge-runtime", "ui-workspace", "apps", "dev-erp")), true);
  assert.equal(isRuntimeCheckout(posixPath("Soulforge", "install", "server-pack", "0.1.2", "payload", "ui-workspace", "apps", "dev-erp")), true);
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge", "install", "server-pack", "10.20.30", "payload", "ui-workspace", "apps", "dev-erp")), true);
  assert.equal(isRuntimeCheckout(posixPath("Soulforge", "install", "server-pack", "0.1.2", "payload")), true);
  assert.equal(isRuntimeCheckout(repeatedWindowsPath("Soulforge", "install", "server-pack", "0.1.2", "payload")), true);
});

test("runtime checkout: development and install-like paths are rejected", () => {
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge", "ui-workspace", "apps", "dev-erp")), false);
  assert.equal(isRuntimeCheckout(windowsPath("dev", "source_checkout", "ui-workspace", "apps", "dev-erp")), false);
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge", "install", "server-pack", "latest", "payload", "ui-workspace", "apps", "dev-erp")), false);
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge", "install", "server-pack", "0.1.2", "payloadish", "ui-workspace", "apps", "dev-erp")), false);
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge", "install", "server-pack", "0.1.2", "payload", "..", "source_checkout")), false);
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge", "install", ".", "server-pack", "0.1.2", "payload")), false);
  assert.equal(isRuntimeCheckout(posixPath("Soulforge", "install", "server-pack", "0.1.2", "payload", "..", "source_checkout")), false);
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge-runtime", "dev", "payload")), false);
  assert.equal(isRuntimeCheckout(posixPath("Soulforge-runtime", "source_checkout", "payload")), false);
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge", "install", "server-pack", "0.1.2", "payload", "dev", "worker")), false);
  assert.equal(isRuntimeCheckout(posixPath("Soulforge", "install", "server-pack", "0.1.2", "payload", "source_checkout", "worker")), false);
  for (const version of ["v0.1.2", "0.1.2-rc.1", "0.1.2+build.7", "01.2.3", "1.02.3", "1.2.03"]) {
    assert.equal(isRuntimeCheckout(windowsPath("Soulforge", "install", "server-pack", version, "payload")), false, version);
  }
  assert.equal(isRuntimeCheckout(windowsPath("Soulforge-runtime-copy", "ui-workspace", "apps", "dev-erp")), false);
});
