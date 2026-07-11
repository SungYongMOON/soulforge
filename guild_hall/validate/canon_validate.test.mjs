import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const validatorPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "canon_validate.mjs");

test("canon validator accepts canonical knowledge and class-local knowledge refs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-knowledge-"));
  try {
    await writeValidFixture(root);

    const result = await runValidator(root);

    assert.equal(result.code, 0);
    assert.equal(result.report.ok, true);
    assert.equal(result.report.checked.includes(".registry/knowledge/frontline_doctrine/knowledge.yaml"), true);
    assert.equal(result.report.checked.includes(".registry/classes/knight/knowledge_refs.yaml"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator rejects unresolved and duplicate knowledge refs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-knowledge-"));
  try {
    await writeValidFixture(root, {
      refsYaml: [
        "class_id: knight",
        "kind: knowledge_refs",
        "status: active",
        "assign:",
        "  - assign: line_doctrine",
        "    ref: missing_knowledge",
        "  - assign: line_doctrine",
        "    ref: frontline_doctrine",
        "",
      ].join("\n"),
    });

    const result = await runValidator(root);
    const issueIds = result.report.errors.map((error) => error.id);

    assert.equal(result.code, 1);
    assert.equal(result.report.ok, false);
    assert.equal(issueIds.includes("knowledge_refs_ref_unresolved"), true);
    assert.equal(issueIds.includes("knowledge_refs_duplicate_assign"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator checks knowledge id, kind, status, and class pointer structure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-knowledge-"));
  try {
    await writeValidFixture(root, {
      knowledgeYaml: [
        "knowledge_id: wrong_id",
        "kind: note",
        "title: Frontline Doctrine",
        "",
      ].join("\n"),
      classYaml: [
        "class_id: knight",
        "kind: class",
        "status: active",
        "knowledge_refs: missing_refs.yaml",
        "",
      ].join("\n"),
      refsYaml: null,
    });

    const result = await runValidator(root);
    const issueIds = result.report.errors.map((error) => error.id);

    assert.equal(result.code, 1);
    assert.equal(result.report.ok, false);
    assert.equal(issueIds.includes("knowledge_id_mismatch"), true);
    assert.equal(issueIds.includes("knowledge_kind_invalid"), true);
    assert.equal(issueIds.includes("knowledge_status_missing"), true);
    assert.equal(issueIds.includes("knowledge_refs_file_missing"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator accepts redacted public mission drafts with blocked null workflow", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-public-mission-"));
  try {
    await writeValidFixture(root);
    await writePublicMissionDraftFixture(root, {
      missionYaml: [
        "schema_version: soulforge.dungeon_assignment.public_mission_draft.v1",
        "mission_id: public_mail_mission_draft_fixture",
        "status: draft",
        "party_id: public_mail_draft_party",
        "workflow_id: null",
        "objective: Synthetic public mission draft review",
        "boundary:",
        "  raw_payload_copied: false",
        "  private_refs_removed: true",
        "  source_refs_redacted: true",
        "  raw_payload_markers_absent: true",
        "  local_file_refs_absent: true",
        "  secret_like_values_absent: true",
        "metadata:",
        "  source_hint: redacted_synthetic_mail_metadata",
        "  filing_ref: redacted",
        "",
      ].join("\n"),
    });

    const result = await runValidator(root);

    assert.equal(result.code, 0);
    assert.equal(result.report.ok, true);
    assert.equal(result.report.checked.includes(".mission/public_mail_mission_draft_fixture/mission.yaml"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator rejects public mission drafts with raw, private, marker, local file, or secret-like values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-public-mission-"));
  try {
    await writeValidFixture(root);
    await writePublicMissionDraftFixture(root, {
      missionYaml: [
        "schema_version: soulforge.dungeon_assignment.public_mission_draft.v1",
        "mission_id: public_mail_mission_draft_fixture",
        "status: draft",
        "party_id: public_mail_draft_party",
        "workflow_id: null",
        "objective: Synthetic public mission draft review",
        "boundary:",
        "  raw_payload_copied: true",
        "  source_refs_redacted: false",
        "  raw_payload_markers_absent: false",
        "  local_file_refs_absent: false",
        "  secret_like_values_absent: false",
        "metadata:",
        "  filing_ref: _workmeta/FAKE-000/reports/synthetic-pointer.yaml",
        "  dot_filing_ref: ./_workmeta/FAKE-000/reports/synthetic-pointer.yaml",
        "  repo_filing_ref: repo/_workmeta/FAKE-000/reports/synthetic-pointer.yaml",
        "  wrapped_filing_ref: (_workmeta/FAKE-000/reports/synthetic-pointer.yaml)",
        "  intake_ref: source://synthetic-mail-fixture/redaction-needed",
        "  payload_marker: body_text",
        "  raw_payload_body: synthetic placeholder only",
        "  local_file_ref: file://fixture/synthetic-placeholder.txt",
        "  access_token: fake_fixture_token_value_0000000000",
        "  authorization: Bearer fake_fixture_bearer_value_0000000000",
        "  operator_note: api_key=fake_fixture_value_0000000000",
        "",
      ].join("\n"),
    });

    const result = await runValidator(root);
    const issueIds = result.report.errors.map((error) => error.id);
    const privateRefDetails = result.report.errors
      .filter((error) => error.id === "public_mission_draft_unredacted_private_ref")
      .map((error) => error.detail);
    const secretLikeDetails = result.report.errors
      .filter((error) => error.id === "public_mission_draft_secret_like_value")
      .map((error) => error.detail);

    assert.equal(result.code, 1);
    assert.equal(result.report.ok, false);
    assert.equal(issueIds.includes("public_mission_draft_raw_payload_copied"), true);
    assert.equal(issueIds.includes("public_mission_draft_unredacted_private_ref"), true);
    assert.equal(issueIds.includes("public_mission_draft_forbidden_marker"), true);
    assert.equal(issueIds.includes("public_mission_draft_local_file_ref"), true);
    assert.equal(issueIds.includes("public_mission_draft_secret_like_value"), true);
    assert.equal(privateRefDetails.some((detail) => detail.includes("metadata.dot_filing_ref")), true);
    assert.equal(privateRefDetails.some((detail) => detail.includes("metadata.repo_filing_ref")), true);
    assert.equal(privateRefDetails.some((detail) => detail.includes("metadata.wrapped_filing_ref")), true);
    assert.equal(secretLikeDetails.some((detail) => detail.includes("metadata.authorization")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator rejects public mission drafts with missing required redaction fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-public-mission-"));
  try {
    await writeValidFixture(root);
    await writePublicMissionDraftFixture(root, {
      missionYaml: [
        "schema_version: soulforge.dungeon_assignment.public_mission_draft.v1",
        "mission_id: public_mail_mission_draft_fixture",
        "status: draft",
        "party_id: public_mail_draft_party",
        "workflow_id: null",
        "objective: Synthetic public mission draft review",
        "boundary:",
        "  raw_payload_copied: false",
        "  private_refs_removed: true",
        "metadata:",
        "  source_hint: redacted_synthetic_mail_metadata",
        "",
      ].join("\n"),
    });

    const result = await runValidator(root);
    const issueIds = result.report.errors.map((error) => error.id);

    assert.equal(result.code, 1);
    assert.equal(result.report.ok, false);
    assert.equal(issueIds.includes("public_mission_draft_required_redaction_field_missing"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator: 깨진 yaml 은 경로 포함 이슈로 보고하고 나머지 검사를 지속한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-yamlread-"));
  try {
    await writeValidFixture(root);
    await writeFixture(root, ".registry/species/human/species.yaml", "species_id: human\nheroes: [unclosed\n");

    const result = await runValidator(root);
    const readFailures = result.report.errors.filter((error) => error.id === "yaml_read_failed");

    assert.equal(result.code, 1);
    assert.equal(result.report.ok, false);
    assert.equal(readFailures.length, 1);
    assert.equal(readFailures[0].file, ".registry/species/human/species.yaml");
    assert.equal(result.report.checked.includes(".registry/classes/knight/class.yaml"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator: 깨진 index.yaml 도 fatal 없이 이슈 보고 + 다른 카탈로그 검사 지속", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-yamlread-"));
  try {
    await writeValidFixture(root);
    await writeFixture(root, ".workflow/index.yaml", "entries:\n  - [broken\n");

    const result = await runValidator(root);
    const issueIds = result.report.errors.map((error) => error.id);

    assert.equal(result.code, 1);
    assert.equal(result.report.ok, false);
    assert.equal(result.report.errors.some((error) => error.id === "yaml_read_failed" && error.file === ".workflow/index.yaml"), true);
    assert.equal(result.report.checked.includes(".party/index.yaml"), true);
    assert.equal(issueIds.filter((id) => id === "yaml_read_failed").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator: 빈 파일의 정상 null 파싱은 read 실패가 아니다(기존 mismatch 동작 보존)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-yamlnull-"));
  try {
    await writeValidFixture(root);
    await writeFixture(root, ".registry/species/human/species.yaml", "");

    const result = await runValidator(root);
    const issueIds = result.report.errors.map((error) => error.id);

    assert.equal(result.code, 1);
    assert.equal(issueIds.includes("species_id_mismatch"), true);
    assert.equal(issueIds.includes("yaml_read_failed"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator: 주석만 있는 index.yaml(null 파싱)은 기존대로 통과한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-yamlnull-"));
  try {
    await writeValidFixture(root);
    await writeFixture(root, ".workflow/index.yaml", "# no entries yet\n");

    const result = await runValidator(root);

    assert.equal(result.code, 0);
    assert.equal(result.report.ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function runValidator(root) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [validatorPath, "--root", root, "--json"], { maxBuffer: 1024 * 1024 });
    return { code: 0, report: JSON.parse(stdout) };
  } catch (error) {
    return {
      code: error.code,
      report: JSON.parse(error.stdout),
    };
  }
}

async function writeValidFixture(root, overrides = {}) {
  const knowledgeYaml = overrides.knowledgeYaml ?? [
    "knowledge_id: frontline_doctrine",
    "kind: knowledge",
    "status: active",
    "title: Frontline Doctrine",
    "",
  ].join("\n");
  const classYaml = overrides.classYaml ?? [
    "class_id: knight",
    "kind: class",
    "status: active",
    "knowledge_refs: knowledge_refs.yaml",
    "",
  ].join("\n");
  const refsYaml = overrides.refsYaml === undefined ? [
    "class_id: knight",
    "kind: knowledge_refs",
    "status: active",
    "assign:",
    "  - assign: line_doctrine",
    "    ref: frontline_doctrine",
    "",
  ].join("\n") : overrides.refsYaml;

  await mkdir(path.join(root, ".unit"), { recursive: true });
  await writeFixture(root, "_workspaces/README.md", "# Workspaces\n");
  await writeFixture(root, ".registry/index.yaml", "entries: []\n");
  await writeFixture(root, ".workflow/index.yaml", "entries: []\n");
  await writeFixture(root, ".party/index.yaml", "entries: []\n");
  await writeFixture(root, ".mission/index.yaml", "entries: []\n");
  await writeFixture(root, ".registry/species/human/species.yaml", "species_id: human\nheroes: []\n");
  await writeFixture(root, ".registry/classes/knight/class.yaml", classYaml);
  if (refsYaml !== null) {
    await writeFixture(root, ".registry/classes/knight/knowledge_refs.yaml", refsYaml);
  }
  await writeFixture(root, ".registry/knowledge/frontline_doctrine/knowledge.yaml", knowledgeYaml);
}

async function writePublicMissionDraftFixture(root, { missionYaml }) {
  await writeFixture(root, ".party/index.yaml", [
    "entries:",
    "  - party_id: public_mail_draft_party",
    "    path: public_mail_draft_party/party.yaml",
    "",
  ].join("\n"));
  await writeFixture(root, ".party/public_mail_draft_party/party.yaml", [
    "party_id: public_mail_draft_party",
    "member_slots: member_slots.yaml",
    "allowed_species: allowed_species.yaml",
    "allowed_classes: allowed_classes.yaml",
    "allowed_workflows: allowed_workflows.yaml",
    "appserver_profile: appserver_profile.yaml",
    "",
  ].join("\n"));
  await writeFixture(root, ".party/public_mail_draft_party/member_slots.yaml", "slots: []\n");
  await writeFixture(root, ".party/public_mail_draft_party/allowed_species.yaml", "species: []\n");
  await writeFixture(root, ".party/public_mail_draft_party/allowed_classes.yaml", "classes: []\n");
  await writeFixture(root, ".party/public_mail_draft_party/allowed_workflows.yaml", "workflows: []\n");
  await writeFixture(root, ".party/public_mail_draft_party/appserver_profile.yaml", "profile: synthetic\n");
  await writeFixture(root, ".mission/index.yaml", [
    "entries:",
    "  - mission_id: public_mail_mission_draft_fixture",
    "    status: draft",
    "    readiness_status: blocked",
    "",
  ].join("\n"));
  await writeFixture(root, ".mission/public_mail_mission_draft_fixture/mission.yaml", missionYaml);
  await writeFixture(root, ".mission/public_mail_mission_draft_fixture/readiness.yaml", [
    "mission_id: public_mail_mission_draft_fixture",
    "status: blocked",
    "checks:",
    "  workflow_present: missing",
    "",
  ].join("\n"));
  await writeFixture(root, ".mission/public_mail_mission_draft_fixture/dispatch_request.yaml", "requests: []\n");
  await writeFixture(root, ".mission/public_mail_mission_draft_fixture/resolved_plan.yaml", "steps: []\n");
}

async function writeFixture(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
