import fs from "node:fs";
import process from "node:process";
import { parse, stringify } from "yaml";

const LEGACY_KEYS = new Set([
  "recipient_role",
  "reason_or_purpose",
  "requested_action",
  "facts_or_background",
  "schedule_or_deadline",
  "changes_before_after",
  "participating_groups",
  "attachments_or_share_state",
  "response_needed",
]);

const SAFETY_KEYS = [
  "contains_real_contact_values",
  "contains_raw_mail_excerpt",
  "contains_exact_footer_payload",
  "contains_private_path",
  "contains_private_project_row",
];

const VALUE_PATTERNS = [
  {
    reason: "email_contact_value",
    test: (value) => /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value),
  },
  {
    reason: "phone_contact_value",
    test: (value) => /\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/.test(value)
      || /\b0(?:2|[3-6]\d)[ -]\d{3,4}[ -]\d{4}\b/.test(value)
      || /\+\d{1,3}[ -](?:\d[ -]?){7,14}\d\b/.test(value),
  },
  {
    reason: "windows_absolute_path",
    test: (value) => /\b[A-Za-z]:[\\/][^\s"'<>|]+/.test(value)
      || /\\\\[^\\\s]+\\[^\\\s]+/.test(value),
  },
  {
    reason: "posix_private_runtime_path",
    test: (value) => /\/(?:home|Users|tmp|private|var\/(?:tmp|lib|log)|mnt\/[A-Za-z])\/[^\s"'<>]+/.test(value),
  },
  {
    reason: "soulforge_private_runtime_path",
    test: (value) => /(?:^|[\\/])(?:_workspaces|_workmeta|private-state)(?:[\\/]|$)/.test(value),
  },
  {
    reason: "quoted_mail_header_chain",
    test: (value) => {
      if (/-----\s*(?:Original Message|Forwarded message)\s*-----/i.test(value)) return true;
      const headers = value.match(/^\s*(?:From|Sent|To|Cc|Subject|보낸 사람|보낸 날짜|받는 사람|참조|제목)\s*:/gim) ?? [];
      return headers.length >= 3;
    },
  },
  {
    reason: "footer_security_payload",
    test: (value) => /(?:CONFIDENTIALITY NOTICE|This (?:e-?mail|message)(?: and any attachments)? (?:is|are) confidential|본 메일은 지정된 수신인|본 메일.*무단.*(?:유출|배포|복제)|대외비.*무단)/i.test(value),
  },
];

function assumption(sourcePath, sourceValue, reason) {
  return { source_path: sourcePath, source_value: sourceValue, reason };
}

function scanProtectedValues(value, path = "$") {
  if (typeof value === "string") {
    for (const pattern of VALUE_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(`protected_value_detected:${pattern.reason}:${path}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanProtectedValues(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      scanProtectedValues(child, `${path}.${key}`);
    }
  }
}

function materializeSyntheticTokens(value) {
  if (typeof value === "string") {
    return value
      .replaceAll("{{WINDOWS_DRIVE}}", "C:")
      .replaceAll("{{UNC_PREFIX}}", "\\\\")
      .replaceAll("{{POSIX_HOME}}", "/home");
  }
  if (Array.isArray(value)) return value.map(materializeSyntheticTokens);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, materializeSyntheticTokens(child)]),
    );
  }
  return value;
}

function assertPublicSafe(input) {
  const safety = input.public_safety ?? {};
  const unsafe = SAFETY_KEYS.filter((key) => safety[key] === true);
  if (unsafe.length > 0) {
    throw new Error(`unsafe_team_context:${unsafe.join(",")}`);
  }
  scanProtectedValues(input);
}

function normalizeV1(input) {
  const mixed = Object.keys(input).filter((key) => LEGACY_KEYS.has(key));
  if (mixed.length > 0) {
    throw new Error(`mixed_v0_v1_fields:${mixed.join(",")}`);
  }
  return structuredClone(input);
}

function normalizeV0(input) {
  const assumptions = Array.isArray(input.assumptions)
    ? structuredClone(input.assumptions)
    : [];
  const requestedAction = input.requested_action ?? {};
  const scheduleLegacy = input.schedule_or_deadline ?? {};
  const responseLegacy = input.response_needed ?? {};

  if (requestedAction.owner != null) {
    assumptions.push(assumption(
      "requested_action.owner",
      requestedAction.owner,
      "actual_assignee_semantics_ambiguous",
    ));
  }
  if (scheduleLegacy.current_state != null) {
    assumptions.push(assumption(
      "schedule_or_deadline.current_state",
      scheduleLegacy.current_state,
      "before_or_after_semantics_ambiguous",
    ));
  }
  if (scheduleLegacy.requested_by != null) {
    assumptions.push(assumption(
      "schedule_or_deadline.requested_by",
      scheduleLegacy.requested_by,
      "deadline_semantics_ambiguous",
    ));
  }
  if (responseLegacy.requested_by != null) {
    assumptions.push(assumption(
      "response_needed.requested_by",
      responseLegacy.requested_by,
      "role_or_deadline_semantics_ambiguous",
    ));
  }

  const changes = input.changes_before_after ?? {};
  for (const key of ["before", "after", "rationale"]) {
    if (changes[key] != null) {
      assumptions.push(assumption(
        `changes_before_after.${key}`,
        changes[key],
        "schedule_domain_semantics_ambiguous",
      ));
    }
  }

  const participants = (input.participating_groups ?? []).map((role, index) => {
    assumptions.push(assumption(
      `participating_groups[${index}]`,
      role,
      "participant_involvement_missing",
    ));
    return { role, involvement: null };
  });

  const known = new Set([
    "schema_version",
    ...LEGACY_KEYS,
    "assumptions",
    "source_basis",
    "public_safety",
  ]);
  for (const [key, value] of Object.entries(input)) {
    if (!known.has(key)) {
      assumptions.push(assumption(key, value, "unsupported_v0_field"));
    }
  }

  const workItems = requestedAction.work == null ? [] : [requestedAction.work];
  const requestedWork = workItems.length > 0 || requestedAction.owner != null
    ? [{ assignee: null, work_items: workItems, notes: [] }]
    : [];
  const attachments = input.attachments_or_share_state ?? {};

  return {
    schema_version: "outbound_team_mail_context_v1",
    recipients: {
      to: input.recipient_role == null
        ? []
        : [{ role: input.recipient_role, reason: null }],
      cc: [],
      bcc: [],
    },
    mail_reason: input.reason_or_purpose ?? null,
    requested_work: requestedWork,
    notes: { global: [] },
    facts: structuredClone(input.facts_or_background ?? []),
    schedule: {
      before: null,
      after: null,
      rationale: null,
      deadline_or_reply_by: null,
    },
    participants,
    format_and_examples: { requested_formats: [], examples: [] },
    attachments: {
      items: structuredClone(attachments.items ?? []),
      state: attachments.state ?? "unclear",
    },
    response_requirements: {
      required: responseLegacy.required ?? false,
      requested_from_roles: [],
      requested_content: responseLegacy.requested_content ?? null,
      deadline_or_reply_by: null,
    },
    assumptions,
    source_basis: structuredClone(input.source_basis ?? []),
    public_safety: Object.fromEntries(
      SAFETY_KEYS.map((key) => [key, input.public_safety?.[key] ?? false]),
    ),
  };
}

export function normalizeTeamMailContext(input) {
  assertPublicSafe(input);
  if (input.schema_version === "outbound_team_mail_context_v1") {
    return normalizeV1(input);
  }
  if (input.schema_version === "outbound_team_mail_context_v0") {
    return normalizeV0(input);
  }
  throw new Error(`unsupported_team_context_schema:${input.schema_version ?? "missing"}`);
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
  const text = path === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path, "utf8");
  return parse(text);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node normalize_team_mail_context.mjs --input <yaml|-> | --fixture <validation_fixture.yaml>");
    return;
  }
  if (args.fixture) {
    const fixture = readYaml(args.fixture);
    const probe = fixture.expected.v0_compatibility_probe;
    const context = normalizeTeamMailContext(probe.input);
    const actual = {
      context,
      output_schema: context.schema_version,
      mixed_v0_v1_fields: Object.keys(context).some((key) => LEGACY_KEYS.has(key)),
      authority_state: "draft_only",
      unsafe_coercion: false,
    };
    if (JSON.stringify(actual) !== JSON.stringify(probe.normalized_output)) {
      throw new Error("fixture_mismatch");
    }
    for (const negative of fixture.negative_inputs ?? []) {
      let rejection = null;
      try {
        normalizeTeamMailContext(materializeSyntheticTokens(negative.input));
      } catch (error) {
        rejection = String(error.message);
      }
      const expectedPrefix = `protected_value_detected:${negative.expected_reason}:`;
      if (!rejection?.startsWith(expectedPrefix)) {
        throw new Error(`negative_fixture_mismatch:${negative.case_id}`);
      }
      console.log(`TEAM_MAIL_CONTEXT_NEGATIVE_OK ${negative.case_id} ${negative.expected_reason}`);
    }
    for (const allowed of fixture.allowed_value_inputs ?? []) {
      normalizeTeamMailContext(allowed.input);
      console.log(`TEAM_MAIL_CONTEXT_ALLOWED_OK ${allowed.case_id}`);
    }
    console.log("TEAM_MAIL_CONTEXT_FIXTURE_OK");
    return;
  }
  if (!args.input) throw new Error("input_required");
  process.stdout.write(stringify(normalizeTeamMailContext(readYaml(args.input))));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
