import fs from "node:fs";
import process from "node:process";
import { parse } from "yaml";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const fixtureFlag = args.indexOf("--fixture");
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node validate_outlook_readability_preset.mjs --fixture <fixture.yaml>");
  process.exit(0);
}
if (fixtureFlag < 0 || !args[fixtureFlag + 1]) fail("missing --fixture <fixture.yaml>");

const fixture = parse(fs.readFileSync(args[fixtureFlag + 1], "utf8"));
const expected = fixture?.expected;
const order = expected?.visible_section_order;
const typography = expected?.typography;
const handoff = expected?.handoff;

if (fixture?.preset_id !== "owner_outlook_readability_v1") fail("unexpected preset_id");
if (!Array.isArray(order) || order[0] !== "1. 요청사항") fail("priority request section must be first and numbered");
if (order.some((title, index) => !title.startsWith(`${index + 1}. `))) fail("numbered headings must be contiguous");
if (!expected?.omitted_sections?.includes("후속 조치")) fail("empty follow-up section must be omitted");
if (typography?.body?.font_family !== "Malgun Gothic" || typography?.body?.font_size_pt !== 10) fail("body typography mismatch");
if (typography?.headings?.font_family !== "Malgun Gothic" || typography?.headings?.font_size_pt !== 11 || typography?.headings?.bold !== true || typography?.headings?.space_before_pt !== 12 || typography?.headings?.space_after_pt !== 6 || typography?.headings?.bottom_rule !== true) fail("heading typography mismatch");
if (typography?.bullets_and_tables?.font_family !== "Malgun Gothic" || typography?.bullets_and_tables?.font_size_pt !== 10 || typography?.bullets_and_tables?.spacing !== "inherit_body") fail("bullet/table typography mismatch");
if (handoff?.authoring_workflow_mutates_outlook !== false || handoff?.owner_approved_separate_executor_required !== true || handoff?.authoring_workflow_sends_mail !== false || handoff?.exact_signature_footer_payload_present !== false) fail("authority boundary mismatch");

console.log("outlook_readability_preset_fixture: pass");
