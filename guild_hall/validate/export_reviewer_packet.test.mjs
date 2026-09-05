import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  REVIEWER_PACKET_DOCUMENTS,
  REVIEWER_PACKET_SCHEMA_VERSION,
  buildReviewerPacket,
} from "./export_reviewer_packet.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATE = "2026-09-05";

async function syntheticRoot(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-reviewer-packet-"));
  for (const [relativePath, text] of Object.entries(files)) {
    const absolute = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, text, "utf8");
  }
  return root;
}

test("a synthetic packet concatenates documents in order with a refs-only manifest", async () => {
  const root = await syntheticRoot({
    "README.md": "# Alpha\n\nfirst\n",
    "docs/second.md": "# Beta\n\nsecond\n",
  });
  const built = await buildReviewerPacket({
    root,
    date: DATE,
    documents: [
      { path: "README.md", reason: "first" },
      { path: "docs/second.md", reason: "second", max_lines: 1 },
    ],
  });
  assert.equal(built.violations.length, 0);
  assert.equal(built.manifest.schema_version, REVIEWER_PACKET_SCHEMA_VERSION);
  assert.equal(built.manifest.document_count, 2);
  assert.equal(built.manifest.source_commit, null);
  assert.ok(built.text.indexOf("[1/2] README.md") < built.text.indexOf("[2/2] docs/second.md"));
  assert.equal(built.manifest.documents[1].truncated, true);
  assert.match(built.text, /truncated after 1 lines/u);
  assert.match(built.manifest.packet_sha256, /^sha256:[0-9a-f]{64}$/u);
  for (const document of built.manifest.documents) {
    assert.deepEqual(Object.keys(document).sort(), ["lines_included", "reason", "relative_path", "source_bytes", "source_sha256", "truncated"]);
  }
});

test("a document carrying a host-local path is reported as a policy violation", async () => {
  // Assembled from fragments so this test source itself never contains a drive-letter path literal.
  const hostPath = ["C", ":", "\\\\", "Users", "\\\\", "someone", "\\\\", "secret.txt"].join("");
  const root = await syntheticRoot({ "README.md": `# Leak\n\nsee ${hostPath}\n` });
  const built = await buildReviewerPacket({ root, date: DATE, documents: [{ path: "README.md", reason: "leak" }] });
  assert.ok(built.violations.length >= 1);
  assert.equal(built.manifest.path_policy_violations, built.violations.length);
});

test("private and generated trees can never be packet members", async () => {
  const root = await syntheticRoot({ "README.md": "# ok\n" });
  for (const forbidden of ["_workmeta/system/x.md", "private-state/CHANGELOG.md", "_workspaces/p/x.md", "node_modules/x/README.md", "../outside.md"]) {
    await assert.rejects(
      buildReviewerPacket({ root, date: DATE, documents: [{ path: forbidden, reason: "no" }] }),
      (error) => ["packet_private_tree_forbidden", "packet_path_invalid"].includes(error.code),
    );
  }
  await assert.rejects(
    buildReviewerPacket({ root, date: DATE, documents: [{ path: "docs/missing.md", reason: "no" }] }),
    (error) => error.code === "packet_document_missing",
  );
  await assert.rejects(buildReviewerPacket({ root, date: "20260905" }), (error) => error.code === "packet_date_invalid");
});

test("the real repository packet builds from the fixed reading list and passes the path policy", async () => {
  const built = await buildReviewerPacket({ root: REPOSITORY_ROOT, date: DATE });
  assert.equal(built.manifest.document_count, REVIEWER_PACKET_DOCUMENTS.length);
  assert.equal(built.violations.length, 0, JSON.stringify(built.violations.slice(0, 3)));
  assert.match(built.text, /Canto I · The Kindling/u);
  assert.match(built.text, /Soulforge 한 장/u);
  assert.equal(built.manifest.documents.at(-1).relative_path, "CHANGELOG.md");
  assert.equal(built.manifest.documents.at(-1).truncated, true);
});
