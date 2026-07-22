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
const presetUrl = new URL("../templates/outlook_readability_preset_v1.yaml", import.meta.url);
const preset = parse(fs.readFileSync(presetUrl, "utf8"));
const expected = fixture?.expected;
const order = expected?.visible_section_order;
const typography = expected?.typography;
const expectedTables = expected?.tables;
const presetTables = preset?.structure?.tables?.layout;
const handoff = expected?.handoff;

if (fixture?.preset_id !== "owner_outlook_readability_v1") fail("unexpected preset_id");
if (!Array.isArray(order) || order[0] !== "1. 요청사항") fail("priority request section must be first and numbered");
if (order.some((title, index) => !title.startsWith(`${index + 1}. `))) fail("numbered headings must be contiguous");
if (!expected?.omitted_sections?.includes("후속 조치")) fail("empty follow-up section must be omitted");
if (typography?.body?.font_family !== "Malgun Gothic" || typography?.body?.font_size_pt !== 10) fail("body typography mismatch");
if (typography?.headings?.font_family !== "Malgun Gothic" || typography?.headings?.font_size_pt !== 11 || typography?.headings?.bold !== true || typography?.headings?.space_before_pt !== 12 || typography?.headings?.space_after_pt !== 6 || typography?.headings?.bottom_rule !== true) fail("heading typography mismatch");
if (typography?.bullets_and_tables?.font_family !== "Malgun Gothic" || typography?.bullets_and_tables?.font_size_pt !== 10 || typography?.bullets_and_tables?.spacing !== "inherit_body") fail("bullet/table typography mismatch");
if (expectedTables?.width_mode !== "fixed" || expectedTables?.default_width_pt !== 470 || expectedTables?.maximum_width_pt !== 470 || expectedTables?.horizontal_alignment !== "left" || expectedTables?.auto_fit_to_window !== false || expectedTables?.wrap_cell_text !== true || expectedTables?.column_sizing !== "content_weighted_within_fixed_width" || expectedTables?.outlook_word_width_unit !== "points" || expectedTables?.outlook_word_preferred_width_type?.name !== "wdPreferredWidthPoints" || expectedTables?.outlook_word_preferred_width_type?.value !== 3 || expectedTables?.persistence_verification !== "verify_after_save_close_and_reopen") fail("expected table layout mismatch");
if (expectedTables?.owner_explicit_width_override?.allowed !== true || expectedTables?.owner_explicit_width_override?.verification !== "verify_actual_table_width_matches_owner_selected_width_before_save") fail("expected table owner-override mismatch");
if (expectedTables?.application_verification?.default !== "verify_actual_table_width_at_or_below_maximum_before_save" || expectedTables?.application_verification?.owner_override !== "verify_actual_table_width_matches_owner_selected_width_before_save") fail("expected table verification mismatch");
if (presetTables?.width_mode !== expectedTables.width_mode || presetTables?.default_width_pt !== expectedTables.default_width_pt || presetTables?.maximum_width_pt !== expectedTables.maximum_width_pt || presetTables?.horizontal_alignment !== expectedTables.horizontal_alignment || presetTables?.auto_fit_to_window !== expectedTables.auto_fit_to_window || presetTables?.wrap_cell_text !== expectedTables.wrap_cell_text || presetTables?.column_sizing !== expectedTables.column_sizing || presetTables?.outlook_word_width_unit !== expectedTables.outlook_word_width_unit || presetTables?.outlook_word_preferred_width_type?.name !== expectedTables.outlook_word_preferred_width_type.name || presetTables?.outlook_word_preferred_width_type?.value !== expectedTables.outlook_word_preferred_width_type.value || presetTables?.persistence_verification !== expectedTables.persistence_verification) fail("preset table layout mismatch");
if (presetTables?.owner_explicit_width_override?.allowed !== expectedTables.owner_explicit_width_override.allowed || presetTables?.owner_explicit_width_override?.verification !== expectedTables.owner_explicit_width_override.verification) fail("preset table owner-override mismatch");
if (presetTables?.application_verification?.default !== expectedTables.application_verification.default || presetTables?.application_verification?.owner_override !== expectedTables.application_verification.owner_override) fail("preset table verification mismatch");
if (handoff?.authoring_workflow_mutates_outlook !== false || handoff?.owner_approved_separate_executor_required !== true || handoff?.authoring_workflow_sends_mail !== false || handoff?.exact_signature_footer_payload_present !== false) fail("authority boundary mismatch");

console.log("outlook_readability_preset_fixture: pass");
