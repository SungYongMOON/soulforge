// Derive the isolated workshop pack from its actual relative-import closure.
// Refuse scan hits rather than silently recording a new content approval.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SECRET_MATERIAL } from "./build_pack.mjs";
import { listFiles, moduleClosure } from "./spec_closure_lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SPEC = "guild_hall/deployment_pack/packs/tool_workshop_pack.spec.json";
const WORKSHOP = "guild_hall/tool_workshop";
const validators = listFiles(ROOT, `${WORKSHOP}/tests`, ".test.mjs");
const sources = listFiles(ROOT, `${WORKSHOP}/src`, ".mjs");
const helper = [`${WORKSHOP}/src/tool_workshop_core.mjs`, `${WORKSHOP}/src/tool_workshop_durable.mjs`, `${WORKSHOP}/src/workshop_files.mjs`];
const closure = moduleClosure(ROOT, [...sources, ...validators]);
const nativeSources = [...listFiles(ROOT, `${WORKSHOP}/src`, ".py"), ...listFiles(ROOT, `${WORKSHOP}/src`, ".ps1"),
  ".registry/skills/pptx_autofill_conversion/codex/scripts/replace_text_runs.py",
  ".registry/skills/hwpx_document/codex/scripts/validate.py", ".registry/skills/hwpx_document/codex/scripts/page_guard.py",
  ".registry/skills/hwpx_document/codex/scripts/build_hwpx.py",
  ".registry/skills/hwpx_document/codex/scripts/office/pack.py"];
// The HWPX synthetic helper opens these fixed template parts rather than
// importing them. They belong to the installed smoke's actual data closure.
const hwpxFixtureReads = [
  "docs/architecture/workspace/examples/tool_workshop/synthetic_hwpx_fixture.py",
  ...["Contents/header.xml", "Contents/section0.xml", "Contents/content.hpf", "settings.xml", "version.xml",
    "mimetype", "META-INF/container.xml", "META-INF/container.rdf", "META-INF/manifest.xml",
    "Preview/PrvText.txt", "Preview/PrvImage.png"]
    .map(file => `.registry/skills/hwpx_document/codex/templates/base/${file}`),
  ...["report", "minutes"].flatMap(form => ["header.xml", "section0.xml"]
    .map(file => `.registry/skills/hwpx_document/codex/templates/${form}/${file}`)),
];
const spec = JSON.parse(readFileSync(resolve(ROOT, SPEC), "utf8"));
spec.content_roles = {
  resource_lease_helper: helper,
  tool_adapter: [...closure.filter((file) => !helper.includes(file) && !validators.includes(file)), ...nativeSources, ...hwpxFixtureReads].sort(),
  validators,
  workshop_docs: [`${WORKSHOP}/README.md`, `${WORKSHOP}/CLAUDE_ACP_SCOPE.md`, `${WORKSHOP}/module.manifest.json`, ...listFiles(ROOT, `${WORKSHOP}/tests`, ".py"), "guild_hall/deployment_pack/manuals/workshop_operator.v0.md",
    // The compatibility/failure smoke suites read these JSON files directly.
    "guild_hall/deployment_pack/lanes/tool_workshop_claude_acp_lane.spec.json", "guild_hall/deployment_pack/lanes/tool_workshop_claude_acp_v2_lane.spec.json", "guild_hall/deployment_pack/lanes/tool_workshop_claude_acp_v3_lane.spec.json"],
};
spec.smoke_test_entries = validators;
// Real lock/expiry and child process tests own bounded timing windows.
spec.test_concurrency = 1;
const reviewedPins = new Map((spec.content_scan_reviewed_files ?? []).map(pin => [pin.path, pin.sha256]));
const consumedPins = new Set();
for (const file of Object.values(spec.content_roles).flat()) {
  const bytes = readFileSync(resolve(ROOT, file));
  if (SECRET_MATERIAL.test(bytes.toString("utf8"))) {
    if (reviewedPins.get(file) !== createHash("sha256").update(bytes).digest("hex")) throw new Error(`workshop_pack_content_review_required:${file}`);
    consumedPins.add(file);
  }
}
for (const file of reviewedPins.keys()) if (!consumedPins.has(file)) throw new Error(`workshop_pack_unused_review_pin:${file}`);
const expected = `${JSON.stringify(spec, null, 2)}\n`;
if (process.argv.slice(2).some((arg) => arg !== "--check")) throw new Error("workshop_spec_arguments_invalid");
if (process.argv.includes("--check")) {
  if (readFileSync(resolve(ROOT, SPEC), "utf8").replace(/\r\n/g, "\n") !== expected) throw new Error("workshop_spec_drift");
  process.stdout.write("PASS: workshop pack source closure is current\n");
} else {
  writeFileSync(resolve(ROOT, SPEC), expected);
  process.stdout.write(`workshop pack: ${Object.values(spec.content_roles).flat().length} files, ${validators.length} smoke entries\n`);
}
