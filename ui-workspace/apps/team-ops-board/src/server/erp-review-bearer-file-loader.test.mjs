import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ERP_REVIEW_CREDENTIAL_MAX_BYTES,
  isInjectedCredentialPath,
  loadErpReviewCredential,
} from "./erp-review-bearer-file-loader.mjs";

const SYNTHETIC_TOKEN = "sfmcp_v1_SYNTHETIC-TOKEN-NOT-A-SECRET_0123456789abcdef";

function hold(code) {
  return { state: "hold", hold_code: code, token: null };
}

test("missing or hostile path forms are a fixed HOLD that never echoes the path", async () => {
  const marker = "PRIVATE-PATH-MARKER";
  const control = String.fromCharCode(0);
  for (const filePath of [undefined, null, "", "relative/token.txt", `${marker}${control}`, "//server/share/token.txt"]) {
    const result = await loadErpReviewCredential({ filePath });
    assert.deepEqual(result, hold("ERP_REVIEW_CREDENTIAL_PATH_INVALID"), String(filePath));
    assert.equal(JSON.stringify(result).includes(marker), false);
  }
  assert.equal(isInjectedCredentialPath(path.resolve("token.txt")), true);
  assert.equal(isInjectedCredentialPath(`${path.resolve("token.txt")}${path.sep}..${path.sep}x`), false);
});

test("an absent file is MISSING and a bounded one-line file yields the token in memory only", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "erp-review-credential-"));
  try {
    const filePath = path.join(root, "erp_review_token.txt");
    assert.deepEqual(await loadErpReviewCredential({ filePath }), hold("ERP_REVIEW_CREDENTIAL_MISSING"));

    await writeFile(filePath, `${SYNTHETIC_TOKEN}\n`, "utf8");
    const withNewline = await loadErpReviewCredential({ filePath });
    assert.deepEqual(withNewline, { state: "ready", hold_code: null, token: SYNTHETIC_TOKEN });

    await writeFile(filePath, SYNTHETIC_TOKEN, "utf8");
    assert.equal((await loadErpReviewCredential({ filePath })).token, SYNTHETIC_TOKEN);

    await writeFile(filePath, `${SYNTHETIC_TOKEN}\r\n`, "utf8");
    assert.equal((await loadErpReviewCredential({ filePath })).token, SYNTHETIC_TOKEN);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("BOM, a second line, whitespace, control bytes, and size drift are whole-file INVALID", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "erp-review-credential-"));
  try {
    const filePath = path.join(root, "erp_review_token.txt");
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const cases = [
      Buffer.concat([bom, Buffer.from(SYNTHETIC_TOKEN, "utf8")]),
      Buffer.from(`${SYNTHETIC_TOKEN}\nsecond-line-value\n`, "utf8"),
      Buffer.from(`${SYNTHETIC_TOKEN} `, "utf8"),
      Buffer.from(` ${SYNTHETIC_TOKEN}`, "utf8"),
      Buffer.from(`${SYNTHETIC_TOKEN}${String.fromCharCode(9)}`, "utf8"),
      Buffer.from("\n", "utf8"),
      Buffer.from("short", "utf8"),
      Buffer.from("x".repeat(ERP_REVIEW_CREDENTIAL_MAX_BYTES + 1), "utf8"),
      Buffer.from(`Bearer ${SYNTHETIC_TOKEN}`, "utf8"),
    ];
    for (const bytes of cases) {
      await writeFile(filePath, bytes);
      const result = await loadErpReviewCredential({ filePath });
      assert.deepEqual(result, hold("ERP_REVIEW_CREDENTIAL_INVALID"), bytes.toString("utf8").slice(0, 24));
      assert.equal(JSON.stringify(result).includes(SYNTHETIC_TOKEN), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a symlink to a valid file and a directory are INVALID rather than followed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "erp-review-credential-"));
  try {
    const target = path.join(root, "real_token.txt");
    await writeFile(target, SYNTHETIC_TOKEN, "utf8");
    const link = path.join(root, "linked_token.txt");
    let linked = true;
    try {
      await symlink(target, link, "file");
    } catch {
      linked = false; // symlink creation may be unavailable on this host; the directory case still runs.
    }
    if (linked) {
      assert.deepEqual(await loadErpReviewCredential({ filePath: link }), hold("ERP_REVIEW_CREDENTIAL_INVALID"));
    }
    assert.deepEqual(await loadErpReviewCredential({ filePath: root }), hold("ERP_REVIEW_CREDENTIAL_INVALID"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
