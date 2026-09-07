// Derive the isolated workshop pack from its actual relative-import closure.
// Refuse scan hits rather than silently recording a new content approval.
import { readFileSync, writeFileSync } from "node:fs";
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
const nativeSources = [...listFiles(ROOT, `${WORKSHOP}/src`, ".py"), ".registry/skills/pptx_autofill_conversion/codex/scripts/replace_text_runs.py"];
const spec = JSON.parse(readFileSync(resolve(ROOT, SPEC), "utf8"));
spec.content_roles = {
  resource_lease_helper: helper,
  tool_adapter: [...closure.filter((file) => !helper.includes(file) && !validators.includes(file)), ...nativeSources].sort(),
  validators,
  workshop_docs: [`${WORKSHOP}/README.md`, `${WORKSHOP}/module.manifest.json`, ...listFiles(ROOT, `${WORKSHOP}/tests`, ".py"), "guild_hall/deployment_pack/manuals/workshop_operator.v0.md"],
};
spec.smoke_test_entries = validators;
// Real lock/expiry and child process tests own bounded timing windows.
spec.test_concurrency = 1;
for (const file of Object.values(spec.content_roles).flat()) {
  if (SECRET_MATERIAL.test(readFileSync(resolve(ROOT, file), "utf8"))) throw new Error(`workshop_pack_content_review_required:${file}`);
}
const expected = `${JSON.stringify(spec, null, 2)}\n`;
if (process.argv.slice(2).some((arg) => arg !== "--check")) throw new Error("workshop_spec_arguments_invalid");
if (process.argv.includes("--check")) {
  if (readFileSync(resolve(ROOT, SPEC), "utf8").replace(/\r\n/g, "\n") !== expected) throw new Error("workshop_spec_drift");
  process.stdout.write("PASS: workshop pack source closure is current\n");
} else {
  writeFileSync(resolve(ROOT, SPEC), expected);
  process.stdout.write(`workshop pack: ${Object.values(spec.content_roles).flat().length} files, ${validators.length} smoke entries\n`);
}
