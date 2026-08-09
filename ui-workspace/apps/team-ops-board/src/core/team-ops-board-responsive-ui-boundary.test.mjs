import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MAIN_PATH = join(SRC_ROOT, "main.tsx");
const RESPONSIVE_CSS_PATH = join(SRC_ROOT, "team-ops-responsive.css");

test("responsive Board stylesheet loads after the base stylesheet", () => {
  const source = readFileSync(MAIN_PATH, "utf8");
  const baseImport = source.indexOf('import "./team-ops.css";');
  const responsiveImport = source.indexOf('import "./team-ops-responsive.css";');

  assert.notEqual(baseImport, -1);
  assert.notEqual(responsiveImport, -1);
  assert.ok(responsiveImport > baseImport);
});

test("Fleet status rows use a bounded responsive grid without fixed mobile minimums", () => {
  const css = readFileSync(RESPONSIVE_CSS_PATH, "utf8");

  assert.match(css, /@media \(max-width:\s*900px\)/u);
  assert.match(css, /\.fleet-status-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto;[^}]*grid-template-areas:[^}]*"name dot state"[^}]*"description description description"[^}]*"metadata metadata metadata"[^}]*max-width:\s*100%;[^}]*min-width:\s*0;/su);
  assert.match(css, /\.fleet-status-name\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/su);
  assert.match(css, /\.fleet-status-desc\s*\{[^}]*min-width:\s*0;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/su);
  assert.match(css, /\.fleet-status-meta\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/su);
  assert.match(css, /\.fleet-status-state\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/su);
});

test("responsive rules preserve content, overflow visibility, and accessible touch targets", () => {
  const css = readFileSync(RESPONSIVE_CSS_PATH, "utf8");

  assert.doesNotMatch(css, /display:\s*none/u);
  assert.doesNotMatch(css, /(?:^|\})\s*(?:html|body|\*)\s*(?:,|\{)[^}]*overflow(?:-x)?:\s*(?:hidden|clip)/su);
  assert.match(css, /\.live-board-top-actions \.live-refresh-button,[\s\S]*\.watchtower-inspector-actions button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/u);
  assert.match(css, /\.inbox-skip-link\s*\{[^}]*display:\s*inline-flex;[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;[^}]*box-sizing:\s*border-box;/su);
  assert.match(css, /\.live-state-panel button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/su);
});
