import fs from "node:fs";
import process from "node:process";
import { parse, stringify } from "yaml";

const INTENT_MODE = {
  simple_share: "compact",
  request_action: "action_brief",
  request_decision: "decision_brief",
  status_change: "status_change",
  answer_points: "reply_map",
};

const RENDER_MODES = new Set(["compact", "action_brief", "decision_brief", "status_change", "reply_map"]);
const CHANNEL_RISKS = new Set([
  "material_ambiguity",
  "active_disagreement",
  "negotiation_or_tradeoff",
  "emotion_or_reputation",
  "rapid_back_and_forth",
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function textPresent(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function distinctRoles(context) {
  const recipients = context.recipients ?? {};
  return new Set(["to", "cc", "bcc"].flatMap((lane) => list(recipients[lane]).map((item) => item?.role).filter(Boolean))).size;
}

function workStats(context) {
  const entries = list(context.requested_work);
  return {
    assignees: new Set(entries.map((item) => item?.assignee).filter(Boolean)).size,
    items: entries.reduce((total, item) => total + list(item?.work_items).length, 0),
  };
}

function hasSupportingConstraints(context) {
  return list(context.notes?.global).length > 0
    || list(context.format_and_examples?.requested_formats).length > 0
    || list(context.format_and_examples?.examples).length > 0
    || list(context.attachments?.items).length > 0
    || list(context.requested_work).some((item) => list(item?.notes).length > 0);
}

function selectMode(input) {
  if (input.schema_version !== "outbound_mail_render_input_v0") {
    throw new Error(`unsupported_render_input_schema:${input.schema_version ?? "missing"}`);
  }
  const context = input.normalized_team_mail_context ?? {};
  const stats = workStats(context);
  const recipientRoleCount = distinctRoles(context);
  const schedule = context.schedule ?? {};
  const response = context.response_requirements ?? {};
  const deadlinePresent = textPresent(schedule.deadline_or_reply_by) || textPresent(response.deadline_or_reply_by);

  const activeRisks = list(input.channel_risk_flags).filter((flag) => CHANNEL_RISKS.has(flag));
  const unknownRisks = list(input.channel_risk_flags).filter((flag) => !CHANNEL_RISKS.has(flag));
  if (unknownRisks.length > 0) throw new Error(`unsupported_channel_risk:${unknownRisks.join(",")}`);
  if (activeRisks.length > 0) {
    return { mode: "compact", score: 0, reasons: ["synchronous_discussion_recommended"] };
  }
  if (input.render_mode_preference && input.render_mode_preference !== "auto") {
    if (!RENDER_MODES.has(input.render_mode_preference)) {
      throw new Error(`unsupported_render_mode:${input.render_mode_preference}`);
    }
    return { mode: input.render_mode_preference, score: null, reasons: [`explicit_render_mode:${input.render_mode_preference}`] };
  }
  if (input.communication_intent && input.communication_intent !== "auto") {
    const explicit = INTENT_MODE[input.communication_intent];
    if (!explicit) throw new Error(`unsupported_communication_intent:${input.communication_intent}`);
    if (explicit === "reply_map" && Number(input.reply_item_count ?? 0) < 2) {
      return { mode: "compact", score: null, reasons: ["single_item_reply"] };
    }
    return { mode: explicit, score: null, reasons: [`explicit_intent:${input.communication_intent}`] };
  }
  if (input.thread_mode === "reply" && Number(input.reply_item_count ?? 0) >= 2) {
    return { mode: "reply_map", score: null, reasons: ["multi_item_reply"] };
  }
  if ((textPresent(schedule.before) && textPresent(schedule.after)) || input.mail_kind === "일정공유") {
    return { mode: "status_change", score: null, reasons: ["before_after_or_schedule_share"] };
  }

  let score = 0;
  const reasons = [];
  if (stats.assignees >= 2) { score += 2; reasons.push("multiple_assignees"); }
  if (stats.items >= 2) { score += 1; reasons.push("multiple_work_items"); }
  if (deadlinePresent) { score += 1; reasons.push("deadline_present"); }
  if (response.required === true) { score += 1; reasons.push("response_required"); }
  if (recipientRoleCount >= 2) { score += 1; reasons.push("multiple_recipient_roles"); }
  if (hasSupportingConstraints(context)) { score += 1; reasons.push("supporting_constraints_present"); }
  return score >= 3 || stats.assignees >= 2
    ? { mode: "action_brief", score, reasons }
    : { mode: "compact", score, reasons };
}

function visibleSections(input, mode) {
  const context = input.normalized_team_mail_context ?? {};
  const stats = workStats(context);
  const schedule = context.schedule ?? {};
  const response = context.response_requirements ?? {};
  const deadlinePresent = textPresent(schedule.deadline_or_reply_by) || textPresent(response.deadline_or_reply_by);
  if (mode === "compact") return [];
  if (mode === "reply_map") return ["회신"];
  if (mode === "status_change") {
    return [
      textPresent(context.mail_reason) ? "변경 요약" : null,
      textPresent(schedule.before) || textPresent(schedule.after) ? "변경 전/후" : null,
      list(context.facts).length > 0 ? "영향" : null,
      stats.items > 0 ? "후속 조치" : null,
    ].filter(Boolean);
  }
  if (mode === "decision_brief") {
    return [
      stats.items > 0 || textPresent(context.mail_reason) ? "결정 요청" : null,
      input.decision_context?.recommendation ? "권고안" : null,
      list(input.decision_context?.alternatives).length > 0 || list(input.decision_context?.impacts).length > 0 ? "대안 및 영향" : null,
      deadlinePresent ? "기한" : null,
      list(context.facts).length > 0 || textPresent(schedule.rationale) ? "근거" : null,
    ].filter(Boolean);
  }
  return [
    "수신",
    textPresent(context.mail_reason) ? "사유" : null,
    stats.items > 0 ? "목적" : null,
    stats.items > 0 ? "요청업무" : null,
    deadlinePresent ? "회신기한" : null,
    response.required === true ? "완료회신기준" : null,
    hasSupportingConstraints(context) ? "비고" : null,
  ].filter(Boolean);
}

export function buildRenderPlan(input) {
  const selected = selectMode(input);
  return {
    schema_version: "outbound_mail_render_plan_v0",
    mode: selected.mode,
    selection_score: selected.score,
    selection_reasons: selected.reasons,
    visible_sections: visibleSections(input, selected.mode),
    omit_empty_sections: true,
    metadata_source_of_truth: "outbound_team_mail_context_v1",
    channel_recommendation: list(input.channel_risk_flags).length > 0
      ? "synchronous_discussion_then_email_record"
      : "email",
  };
}

function parseArgs(argv) {
  const args = { input: null, fixture: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") args.help = true;
    else if (value === "--input") args.input = argv[++index];
    else if (value === "--fixture") args.fixture = argv[++index];
    else throw new Error(`unknown_argument:${value}`);
  }
  return args;
}

function readYaml(path) {
  return parse(path === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path, "utf8"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node select_mail_render_mode.mjs --input <yaml|-> | --fixture <validation_fixture.yaml>");
    return;
  }
  if (args.fixture) {
    const fixture = readYaml(args.fixture);
    for (const negative of fixture.negative_cases ?? []) {
      let rejection = null;
      try {
        buildRenderPlan(negative.input);
      } catch (error) {
        rejection = String(error.message);
      }
      if (!rejection?.startsWith(negative.expected_error)) {
        throw new Error(`negative_fixture_mismatch:${negative.case_id}:${rejection}`);
      }
      console.log(`MAIL_RENDER_NEGATIVE_OK ${negative.case_id} ${negative.expected_error}`);
    }
    for (const testCase of fixture.cases ?? []) {
      const actual = buildRenderPlan(testCase.input);
      const repeated = buildRenderPlan(testCase.input);
      if (JSON.stringify(actual) !== JSON.stringify(repeated)) {
        throw new Error(`nondeterministic_fixture:${testCase.case_id}`);
      }
      const projected = {
        mode: actual.mode,
        visible_sections: actual.visible_sections,
        channel_recommendation: actual.channel_recommendation,
      };
      if (JSON.stringify(projected) !== JSON.stringify(testCase.expected)) {
        throw new Error(`fixture_mismatch:${testCase.case_id}:${JSON.stringify(projected)}`);
      }
      console.log(`MAIL_RENDER_FIXTURE_OK ${testCase.case_id} ${actual.mode}`);
    }
    return;
  }
  if (!args.input) throw new Error("input_required");
  process.stdout.write(stringify(buildRenderPlan(readYaml(args.input))));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
