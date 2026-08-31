import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderManualHtmlProjection } from "../src/manual_html_projection.mjs";

const digest = `sha256:${createHash("sha256").update(Buffer.from("AAAA", "base64")).digest("hex")}`;
const image = { id: "hero", alt: "A diagram", digest, version: "1.0.0", data_uri: "data:image/png;base64,AAAA" };
const input = { manual: "operator", version: "1.2.3", locale: "en-US", audience: "operators", markdown: "# Start\n\n![A diagram](hero)\n\n```sh\necho safe\n```", images: [image] };

test("renders deterministic accessible self-contained HTML and receipt", () => {
  const first = renderManualHtmlProjection(input);
  const second = renderManualHtmlProjection(input);
  assert.equal(first.html, second.html);
  assert.match(first.html, /aria-label="Table of contents"/u);
  assert.match(first.html, /alt="A diagram"/u);
  assert.match(first.html, /@media print/u);
  assert.equal(first.receipt.image_digests[0].digest, digest);
});

test("escapes raw markup and rejects unsafe URLs", () => {
  assert.throws(() => renderManualHtmlProjection({ ...input, markdown: "<script>alert(1)</script>" }), /raw_html/u);
  for (const markdown of ["[bad](https://evil.test)", "![x](C:" + "\\secret.png)", "![x](missing)"]) {
    assert.throws(() => renderManualHtmlProjection({ ...input, markdown }), /forbidden|missing/u);
  }
});

test("requires image alt, digest, and local embedded data", () => {
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, alt: "" }] }), /alt/u);
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, digest: "missing" }] }), /digest/u);
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, data_uri: "https://example.test/x.png" }] }), /source/u);
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, digest: `sha256:${"0".repeat(64)}` }] }), /digest_mismatch/u);
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, data_uri: "data:image/svg+xml;base64,AAAA" }] }), /source/u);
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, data_uri: "data:image/png;base64,AAA=" }] }), /digest_mismatch/u);
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, data_uri: "data:image/png;base64,AA=A" }] }), /source/u);
  const oversized = Buffer.alloc((5 * 1024 * 1024) + 1).toString("base64");
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, data_uri: `data:image/png;base64,${oversized}` }] }), /size/u);
});

test("rejects unsafe content before markdown token parsing without blocking repository-relative refs", () => {
  const hostile = [
    "# https://evil.test",
    "- C:" + "\\private\\secret.txt",
    "- /private/secret.txt",
    "![safe](https://evil.test/x.png)",
    "[bad](//evil.test/x)",
    "- //server/share",
    "![<img src=x>](hero)",
    "```sh\n<script>alert(1)</script>\n```",
  ];
  for (const markdown of hostile) assert.throws(() => renderManualHtmlProjection({ ...input, markdown }), /forbidden/u);
  assert.doesNotThrow(() => renderManualHtmlProjection({
    ...input,
    markdown: "# References\n\nUse guild_hall/deployment_pack/README.md and docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md.",
  }));
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, id: "https://evil.test/x" }] }), /forbidden/u);
  assert.throws(() => renderManualHtmlProjection({ ...input, images: [{ ...image, alt: "C:" + "\\private\\diagram.png" }] }), /forbidden/u);
});

test("renders every tracked candidate manual and binds its catalog digest", () => {
  const catalog = JSON.parse(readFileSync(
    new URL("../manuals/manual_release_catalog.v0.json", import.meta.url),
    "utf8",
  ));
  const candidates = catalog.manuals.filter((manual) => manual.state === "candidate");
  assert.equal(candidates.length, 16);
  for (const manual of candidates) {
    const markdown = readFileSync(
      new URL(`../manuals/${manual.semantic_role}.v0.md`, import.meta.url),
      "utf8",
    );
    const contentDigest = `sha256:${createHash("sha256").update(markdown, "utf8").digest("hex")}`;
    assert.equal(contentDigest, manual.content_digest, manual.semantic_role);
    const rendered = renderManualHtmlProjection({
      manual: manual.semantic_role,
      version: "0.1.0",
      locale: "ko-KR",
      audience: "Development Team 1",
      markdown,
      images: [],
    });
    assert.match(rendered.html, /<!doctype html>/u, manual.semantic_role);
  }
});
