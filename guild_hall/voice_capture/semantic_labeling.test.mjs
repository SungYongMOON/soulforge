import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import {
  analyzeVoiceSemanticManifest,
  analyzeVoiceSemanticSession,
  buildComparisonGatedSemanticSummary,
  buildSafeComparisonSummary,
  buildSafeSemanticSummary,
  buildVoiceSemanticLabelRun,
  compareVoiceSemanticManifests,
  compareVoiceSemanticRuns,
  compareVoiceSemanticRunsUntrusted,
  parseTranscriptJsonl,
  prepareVoiceSemanticReviewClipsFromComparison,
  prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp,
  rankVoiceProjectContextShadow,
  validateVoiceSemanticComparison,
  validateVoiceSemanticLabelRun,
  verifySemanticManifestPairBinding,
  verifySemanticReviewSourceBinding,
  verifyLocalAsrExecutionArtifacts,
} from "./semantic_labeling.mjs";
import { parseWhisperJson, suppressRepetitiveSegments } from "./local_asr.mjs";

const HASH = "a".repeat(64);
const execFileAsync = promisify(execFile);

function segment(segmentId, content, start = segmentId * 2, speaker = "SPEAKER_00") {
  return {
    schema_version: "soulforge.voice_transcript_segment.v0",
    segment_id: segmentId,
    start_seconds: start,
    end_seconds: start + 1.5,
    speaker,
    content,
  };
}

function buildRun(segments, extra = {}) {
  return buildVoiceSemanticLabelRun({
    recordingId: "recording_fixture_001",
    transcriptRef: "_workspaces/system/voice_capture/sessions/fixture/transcript.jsonl",
    transcriptSha256: HASH,
    sourceSegments: segments,
    recordedAt: "2026-07-22T20:00:00+09:00",
    evidenceRole: "independent_machine_transcript_stronger_unverified",
    transcriptQuality: "machine_transcript_unverified",
    ...extra,
  });
}

test("semantic recording and retrieval times are stored on the KST business axis", () => {
  const run = buildRun([segment(1, "\uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694")], {
    recordedAt: "2026-07-23T15:30:00.000Z",
  });
  assert.equal(run.recording_ref.recorded_at, "2026-07-24T00:30:00.000+09:00");
  assert.equal(run.retrieval_plan.time_window.start, "2026-07-10T00:30:00.000+09:00");
  assert.equal(run.retrieval_plan.time_window.end, "2026-07-26T00:30:00.000+09:00");
  assert.equal(validateVoiceSemanticLabelRun(run).ok, true);
});

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function asSyntheticVerifiedStrong(run) {
  const stronger = structuredClone(run);
  const body = {
    schema_version: "soulforge.voice_asr_pair_provenance.v1",
    session_id: "recording_fixture_001",
    session_manifest_sha256: "0".repeat(64),
    source_sha256: "1".repeat(64),
    source_audio_hash_verified: true,
    fast: {
      manifest_sha256: "2".repeat(64), run_id: "fixture_fast", engine: "whisper.cpp",
      model_id: "large-v3-turbo-q5_0", model_sha1: "3".repeat(40),
      model_sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
      transcript_sha256: "4".repeat(64),
      execution_artifact_set_sha256: "7".repeat(64),
      transcript_reconstruction_verified: true,
    },
    stronger: {
      manifest_sha256: "5".repeat(64), run_id: "fixture_stronger", engine: "whisper.cpp",
      model_id: "large-v3-q5_0", model_sha1: "6".repeat(40),
      model_sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
      transcript_sha256: stronger.recording_ref.transcript_sha256,
      execution_artifact_set_sha256: "8".repeat(64),
      transcript_reconstruction_verified: true,
    },
    verification_state: "source_model_transcript_and_execution_artifacts_verified",
    execution_attestation_state: "local_artifact_chain_not_hardware_attested",
  };
  stronger.evidence_provenance = {
    ...body,
    receipt_id: `vap_${crypto.createHash("sha256").update(stableStringify(body)).digest("hex").slice(0, 24)}`,
  };
  stronger.recording_ref.evidence_role = "independent_machine_transcript_stronger_verified_pair";
  stronger.evidence_gate = {
    input_class: "independent_asr_stronger",
    state: "shadow_reviewable",
    reason_codes: ["verified_stronger_asr_available"],
    action_candidate_emission_allowed: true,
    project_candidate_emission_allowed: true,
    next_step: "shadow_context_correlation",
  };
  stronger.review_windows = [];
  return stronger;
}

function syntheticCandidate(run, extra = {}) {
  return {
    candidate_id: `vac_${"a".repeat(24)}`,
    lineage_id: `vad_${"b".repeat(24)}`,
    revision_id: `var_${"c".repeat(24)}`,
    candidate_kind: "request",
    source_unit_ref: run.segment_labels[0].unit_id,
    driver_kind: "request",
    decision_application_state: "candidate",
    project_ref: null,
    project_resolution_state: "unresolved_needs_context",
    actor_candidates: { speaker_candidate: "SPEAKER_00", requester_candidate: "SPEAKER_00", assignee_candidate: null, mentioned_person_candidates: [] },
    action_codes: ["check_or_confirm"],
    due_candidate_state: "unknown",
    supporting_source_refs: ["voice-segment://fixture/unit_1_1"],
    contradictory_evidence_count: 0,
    unresolved_fields: ["project_ref"],
    exception_codes: ["project_context_missing"],
    claim_ceiling: "machine_generated_candidate",
    ...extra,
  };
}

test("labels direct commitment but standalone fast ASR emits no task candidate", () => {
  const run = buildRun([segment(1, "제가 내일까지 시험 결과를 보내드릴게요.")]);
  const row = run.segment_labels[0];
  assert.deepEqual(row.speech_acts, ["commitment", "deadline_mention"]);
  assert.equal(row.modality, "intended");
  assert.equal(row.speech_commitment_state, "self_committed_candidate");
  assert.equal(run.action_candidates.length, 0);
  assert.equal(run.evidence_gate.state, "stronger_local_asr_required");
  assert.equal(run.boundaries.official_task_mutated, false);
});

test("reported request never becomes a direct request", () => {
  const run = buildRun([segment(1, "김상윤 수석님이 시험 결과를 보내 달라고 했습니다.")]);
  const row = run.segment_labels[0];
  assert.ok(row.speech_acts.includes("reported_speech"));
  assert.ok(!row.speech_acts.includes("request"));
  assert.equal(row.attribution_mode, "reported_unknown_actor");
  assert.deepEqual(run.action_candidates, []);
});

test("offer question is not misclassified as a commitment", () => {
  const run = buildRun([segment(1, "제가 계측기 자료를 보내드릴까요?")]);
  const row = run.segment_labels[0];
  assert.ok(row.speech_acts.includes("offer"));
  assert.ok(row.speech_acts.includes("open_question"));
  assert.ok(!row.speech_acts.includes("commitment"));
  assert.equal(run.action_candidates.length, 0);
});

test("negative completion and prohibition never produce positive task evidence", () => {
  const negative = buildRun([segment(1, "아직 자료를 보내지 않았습니다.")]);
  assert.ok(negative.segment_labels[0].speech_acts.includes("status_update"));
  assert.equal(negative.segment_labels[0].polarity, "negated");
  assert.ok(!negative.segment_labels[0].speech_acts.includes("result_report"));
  assert.equal(negative.action_candidates.length, 0);

  const prohibition = buildRun([segment(1, "그 자료는 외부에 보내지 마세요.")]);
  assert.ok(prohibition.segment_labels[0].speech_acts.includes("cancellation"));
  assert.ok(!prohibition.segment_labels[0].speech_acts.includes("request"));
  assert.deepEqual(prohibition.action_candidates, []);

  const contrast = buildRun([segment(1, "어렵지만 자료는 계속 검토합니다.")]);
  assert.ok(!contrast.segment_labels[0].speech_acts.includes("cancellation"));

  const refusedFuture = buildRun([segment(1, "제가 자료를 안 보내겠습니다.")]);
  assert.ok(refusedFuture.segment_labels[0].speech_acts.includes("cancellation"));
  assert.ok(!refusedFuture.segment_labels[0].speech_acts.includes("commitment"));
  assert.equal(refusedFuture.segment_labels[0].polarity, "negated");
});

test("reported, negated, prohibited, questioned, and conditional wording stays non-authoritative", () => {
  const reported = buildRun([segment(1, "김상윤 수석님이 자료를 보내 달라고 요청했습니다.")]);
  assert.ok(reported.segment_labels[0].speech_acts.includes("reported_speech"));
  assert.ok(!reported.segment_labels[0].speech_acts.includes("request"));

  const negated = buildRun([segment(1, "자료 정리가 완료한 것은 아닙니다.")]);
  assert.ok(negated.segment_labels[0].speech_acts.includes("status_update"));
  assert.ok(!negated.segment_labels[0].speech_acts.includes("result_report"));

  const prohibited = buildRun([segment(1, "이 파일은 외부에 공유하지 않도록 해 주세요.")]);
  assert.ok(prohibited.segment_labels[0].speech_acts.includes("cancellation"));
  assert.ok(!prohibited.segment_labels[0].speech_acts.includes("request"));

  const completionQuestion = buildRun([segment(1, "자료 정리가 완료됐습니까?")]);
  assert.ok(completionQuestion.segment_labels[0].speech_acts.includes("open_question"));
  assert.ok(!completionQuestion.segment_labels[0].speech_acts.includes("result_report"));

  const decisionQuestion = buildRun([segment(1, "다음 주에 진행하기로 결정했습니까?")]);
  assert.ok(decisionQuestion.segment_labels[0].speech_acts.includes("open_question"));
  assert.ok(!decisionQuestion.segment_labels[0].speech_acts.includes("decision"));

  const conditionalDecision = buildRun([segment(1, "승인되면 다음 주에 진행하기로 결정했습니다.")]);
  assert.ok(conditionalDecision.segment_labels[0].speech_acts.includes("conditional_statement"));
  assert.ok(!conditionalDecision.segment_labels[0].speech_acts.includes("decision"));

  const conditionalPurchase = buildRun([segment(1, "승인 시 발주하겠습니다.")]);
  assert.ok(conditionalPurchase.segment_labels[0].speech_acts.includes("conditional_statement"));
  assert.ok(!conditionalPurchase.segment_labels[0].speech_acts.includes("commitment"));
  assert.equal(conditionalPurchase.segment_labels[0].modality, "conditional");
  assert.equal(conditionalPurchase.evidence_gate.state, "stronger_local_asr_required");

  const conditionalAfterApproval = buildRun([segment(1, "승인 후 발주하겠습니다.")]);
  assert.ok(conditionalAfterApproval.segment_labels[0].speech_acts.includes("conditional_statement"));
  assert.ok(!conditionalAfterApproval.segment_labels[0].speech_acts.includes("commitment"));

  const reportedRequest = buildRun([segment(1, "고객이 설계 변경을 요청했습니다.")]);
  assert.ok(reportedRequest.segment_labels[0].speech_acts.includes("reported_speech"));
  assert.ok(!reportedRequest.segment_labels[0].speech_acts.includes("request"));
});

test("common Korean prohibition, condition, reported speech, and incomplete-state forms preserve authority boundaries", () => {
  const prohibited = buildRun([segment(1, "\uc678\ubd80 \uacf5\uc720 \uae08\uc9c0\uc785\ub2c8\ub2e4.")]);
  assert.ok(prohibited.segment_labels[0].speech_acts.includes("cancellation"));
  assert.ok(!prohibited.segment_labels[0].speech_acts.includes("request"));

  const conditional = buildRun([segment(1, "\uc2b9\uc778 \uc5ec\ubd80\uc5d0 \ub530\ub77c \uc790\ub8cc\ub97c \ubcf4\ub0b4\uaca0\uc2b5\ub2c8\ub2e4.")]);
  assert.ok(conditional.segment_labels[0].speech_acts.includes("conditional_statement"));
  assert.ok(!conditional.segment_labels[0].speech_acts.includes("commitment"));

  const reported = buildRun([segment(1, "\uae40\uc0c1\uc724 \uc218\uc11d\ub2d8 \ub9d0\ub85c\ub294 \uc81c\uac00 \uc790\ub8cc\ub97c \ubcf4\ub0b4\uaca0\uc2b5\ub2c8\ub2e4.")]);
  assert.ok(reported.segment_labels[0].speech_acts.includes("reported_speech"));
  assert.ok(!reported.segment_labels[0].speech_acts.includes("commitment"));

  const incomplete = buildRun([segment(1, "\uc790\ub8cc \uc815\ub9ac\ub294 \uc644\ub8cc \uc804\uc785\ub2c8\ub2e4.")]);
  assert.ok(incomplete.segment_labels[0].speech_acts.includes("status_update"));
  assert.ok(!incomplete.segment_labels[0].speech_acts.includes("result_report"));
  assert.equal(incomplete.segment_labels[0].polarity, "negated");
});

test("common polite send requests escalate while common incomplete variants never become completion claims", () => {
  for (const content of [
    "\uc790\ub8cc\ub97c \ubcf4\ub0b4 \uc8fc\uc138\uc694.",
    "\uc790\ub8cc \ubcf4\ub0b4\uc904\ub798\uc694?",
    "\uc790\ub8cc \ubcf4\ub0b4\uc904 \uc218 \uc788\ub098\uc694?",
    "\uc790\ub8cc \ubcf4\ub0b4 \ubc14\ub78d\ub2c8\ub2e4.",
    "\uba54\uc77c \ud655\uc778 \uac00\ub2a5\ud558\uc2e4\uae4c\uc694?",
    "문서를 읽어 주세요.",
    "자료를 보내주셨으면 좋겠습니다.",
    "자료 검토 부탁드릴게요.",
    "검토해 주시면 감사하겠습니다.",
  ]) {
    const request = buildRun([segment(1, content)]);
    assert.ok(request.segment_labels[0].speech_acts.includes("request"));
    assert.ok(!request.segment_labels[0].speech_acts.includes("commitment"));
    assert.equal(request.evidence_gate.state, "stronger_local_asr_required");
    assert.equal(request.review_windows.length, 1);
  }

  for (const content of [
    "\uc544\uc9c1 \uc644\ub8cc\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4.",
    "\uc644\ub8cc\uac00 \uc548 \ub410\uc2b5\ub2c8\ub2e4.",
    "\uc790\ub8cc \uc815\ub9ac\ub294 \uc544\uc9c1 \uc548 \ub05d\ub0ac\uc2b5\ub2c8\ub2e4.",
    "\uc791\uc5c5\uc774 \uc544\uc9c1 \ub35c \ub05d\ub0ac\uc2b5\ub2c8\ub2e4.",
    "아직 끝나진 않았습니다.",
    "\ubbf8\uc644\ub8cc \uc0c1\ud0dc\uc785\ub2c8\ub2e4.",
    "\uc544\uc9c1 \uc548 \ubcf4\ub0c8\uc2b5\ub2c8\ub2e4.",
  ]) {
    const run = buildRun([segment(1, content)]);
    assert.ok(run.segment_labels[0].speech_acts.includes("status_update"));
    assert.ok(!run.segment_labels[0].speech_acts.includes("result_report"));
    assert.equal(run.segment_labels[0].polarity, "negated");
  }
});

test("question-only context is preserved without creating a Driver candidate", () => {
  const run = buildRun([segment(1, "시험 일정은 언제인가요?")]);
  assert.ok(run.segment_labels[0].speech_acts.includes("open_question"));
  assert.equal(run.action_candidates.length, 0);
});

test("provider transcript is locator-only and can never emit task or project authority", () => {
  const run = buildRun([segment(1, "내일까지 시험 결과를 보내 주세요.")], {
    evidenceRole: "provider_transcript_auxiliary_unverified",
    transcriptQuality: "provider_transcript_unverified",
  });
  assert.equal(run.evidence_gate.input_class, "provider_locator_only");
  assert.equal(run.evidence_gate.state, "independent_asr_required");
  assert.equal(run.action_candidates.length, 0);
  assert.equal(run.project_resolution.candidates.length, 0);
  assert.equal(run.retrieval_plan.query_terms.length, 0);
  assert.equal(run.segment_labels[0].disposition, "locator_only_untrusted");
  assert.equal(run.review_windows.length, 1);
  assert.equal(run.review_windows[0].human_listen_required, false);
  assert.equal(run.boundaries.provider_transcript_authority_zero, true);
});

test("ambiguous trivial speech is ignored without asking a human to listen", () => {
  const run = buildRun([segment(1, "네, 식사 맛있게 하세요.")], {
    evidenceRole: "independent_machine_transcript_unverified",
    transcriptQuality: "machine_transcript_unverified_attention_required",
  });
  assert.equal(run.evidence_gate.state, "screened_no_material_signal_ignored");
  assert.equal(run.evidence_gate.next_step, "no_further_action");
  assert.equal(run.action_candidates.length, 0);
  assert.equal(run.review_windows.length, 0);
  assert.equal(run.segment_labels[0].disposition, "context_only");
});

test("greetings, acknowledgements, meals, thanks, weather, and casual chat never request human review", () => {
  for (const content of [
    "\uc548\ub155\ud558\uc138\uc694.",
    "\ub124, \uc54c\uaca0\uc2b5\ub2c8\ub2e4.",
    "네, 확인했습니다.",
    "네, 확인했습니다. 감사합니다.",
    "네, 확인했습니다. 고맙습니다.",
    "\uc624\ub298 \uc810\uc2ec \ub9db\uc788\uac8c \ub4dc\uc138\uc694.",
    "\uc810\uc2ec \uba39\uc5c8\uc2b5\ub2c8\ub2e4.",
    "\uac10\uc0ac\ud569\ub2c8\ub2e4.",
    "고맙습니다.",
    "\uc774\uc0c1\uc785\ub2c8\ub2e4.",
    "네, 이상입니다. 감사합니다.",
    "네, 여기까지 하겠습니다. 감사합니다.",
    "이상으로 마치겠습니다. 감사합니다.",
    "문제 없습니다.",
    "문제는 전혀 없습니다.",
    "납기 지연 가능성은 없습니다.",
    "고객 영향은 없습니다.",
    "문제가 발생하지 않았습니다.",
    "비용은 증가하지 않았습니다.",
    "점심을 준비해 주세요.",
    "점심 좀 준비해 주세요.",
    "잘 부탁드립니다.",
    "잘 부탁드리겠습니다.",
    "행복을 바랍니다.",
    "\uc624\ub298 \ub0a0\uc528\uac00 \uc88b\ub124\uc694.",
  ]) {
    const run = buildRun([segment(1, content)], { transcriptQuality: "machine_transcript_unverified_attention_required" });
    assert.equal(run.evidence_gate.state, "screened_no_material_signal_ignored", content);
    assert.equal(run.evidence_gate.next_step, "no_further_action");
    assert.equal(run.review_windows.length, 0);
    assert.equal(run.action_candidates.length, 0);
  }

  const actualRisk = buildRun([segment(1, "온도가 50도 이상이면 위험합니다.")]);
  assert.ok(actualRisk.segment_labels[0].speech_acts.includes("risk_or_issue"));
  assert.equal(actualRisk.evidence_gate.state, "stronger_local_asr_required");
});

test("low-quality nontrivial text cannot be silently proven trivial", () => {
  const run = buildRun([segment(1, "발화가 정확히 인식되지 않았습니다.")], {
    transcriptQuality: "machine_transcript_low_quality_attention_required",
  });
  assert.equal(run.evidence_gate.state, "stronger_local_asr_required");
  assert.ok(run.evidence_gate.reason_codes.includes("low_quality_cannot_prove_trivial_content"));
  assert.equal(run.review_windows.length, 0);
  assert.equal(run.action_candidates.length, 0);
});

test("ordinary progress, result, decision, and delivery-risk wording remains material", () => {
  const cases = [
    ["작업은 정상 진행 중입니다.", "status_update"],
    ["작업이 진행되고 있습니다.", "status_update"],
    ["현재 검토하고 있습니다.", "status_update"],
    ["시험이 통과했습니다.", "result_report"],
    ["측정 결과는 12V입니다.", "result_report"],
    ["측정값은 12V로 나왔습니다.", "result_report"],
    ["시험 결과가 정상으로 나왔어요.", "result_report"],
    ["검사 결과 이상 없음입니다.", "result_report"],
    ["배터리 전압 3.3볼트입니다.", "result_report"],
    ["그럼 A안으로 진행하죠.", "decision"],
    ["그럼 A안으로 갑시다.", "decision"],
    ["그러면 A안으로 가죠.", "decision"],
    ["그럼 A안으로 하죠.", "decision"],
    ["A안으로 정했습니다.", "decision"],
    ["A안으로 진행하는 걸로 했습니다.", "decision"],
    ["제가 맡겠습니다.", "commitment"],
    ["제가 검토를 맡을게요.", "commitment"],
    ["그건 제가 처리할게.", "commitment"],
    ["자료는 제가 보낼게요.", "commitment"],
    ["자료를 송부하겠습니다.", "commitment"],
    ["결과를 전달하겠습니다.", "commitment"],
    ["도면을 공유하겠습니다.", "commitment"],
    ["내용을 확인해보겠습니다.", "commitment"],
    ["자료 좀 봐 주세요.", "request"],
    ["자료 확인 좀 부탁드려요.", "request"],
    ["자료를 송부 부탁드립니다.", "request"],
    ["자료 보내주면 좋겠습니다.", "request"],
    ["검토 결과 회신 부탁드립니다.", "request"],
    ["질문에 답변 부탁드립니다.", "request"],
    ["진행률은 70%입니다.", "status_update"],
    ["전압은 12V입니다.", "result_report"],
    ["납기를 못 맞춥니다.", "risk_or_issue"],
    ["납기가 빠듯합니다.", "risk_or_issue"],
    ["일정이 밀릴 것 같습니다.", "risk_or_issue"],
    ["납기 차질이 예상됩니다.", "risk_or_issue"],
    ["납품이 늦어질 수 있습니다.", "risk_or_issue"],
    ["배송이 늦습니다.", "risk_or_issue"],
    ["출하가 이틀 정도 밀릴 수 있어요.", "risk_or_issue"],
    ["비용이 30퍼센트 증가했습니다.", "risk_or_issue"],
    ["비용이 초과될 수 있습니다.", "risk_or_issue"],
    ["고객 영향이 큽니다.", "risk_or_issue"],
    ["안전 등급이 낮습니다.", "risk_or_issue"],
    ["품질 등급이 C로 하락했습니다.", "risk_or_issue"],
    ["안전 등급은 E입니다.", "result_report"],
    ["고객 이탈이 예상됩니다.", "risk_or_issue"],
    ["품질 점수는 72점입니다.", "result_report"],
    ["납기는 금요일까지입니다.", "deadline_mention"],
    ["8월 3일까지 제출입니다.", "deadline_mention"],
    ["3일 내로 제출입니다.", "deadline_mention"],
    ["내일까지요.", "deadline_mention"],
    ["고객이 샘플 3개를 다음 주까지 달라고 합니다.", "reported_speech"],
    ["팀장이 내일까지 보내 달랍니다.", "reported_speech"],
  ];
  for (const [content, expectedAct] of cases) {
    const run = buildRun([segment(1, content)]);
    assert.ok(run.segment_labels[0].speech_acts.includes(expectedAct), `${content} should include ${expectedAct}`);
    assert.equal(run.evidence_gate.state, "stronger_local_asr_required");
    assert.equal(run.review_windows.length, 1);
    assert.equal(run.review_windows[0].human_listen_required, false);
    assert.ok(run.review_windows[0].duration_seconds >= 30);
    assert.ok(run.review_windows[0].duration_seconds <= 90);
  }

  const conditionalCommitment = buildRun([segment(1, "고객 확인이 끝나는 대로 발주하겠습니다.")]);
  assert.ok(conditionalCommitment.segment_labels[0].speech_acts.includes("conditional_statement"));
  assert.ok(!conditionalCommitment.segment_labels[0].speech_acts.includes("commitment"));

  const reportedRequest = buildRun([segment(1, "팀장이 내일까지 보내 달랍니다.")]);
  assert.equal(reportedRequest.segment_labels[0].attribution_mode, "reported_unknown_actor");
  assert.ok(!reportedRequest.segment_labels[0].speech_acts.includes("request"));
});

test("self-asserted stronger role remains fast and cannot trigger human review", () => {
  const fast = buildRun([segment(1, "내일까지 시험 결과를 보내 주세요.", 20)], {
    evidenceRole: "independent_machine_transcript_unverified",
    transcriptQuality: "machine_transcript_unverified_attention_required",
  });
  assert.equal(fast.evidence_gate.state, "stronger_local_asr_required");
  assert.equal(fast.review_windows[0].start_seconds, 5);
  assert.equal(fast.review_windows[0].human_listen_required, false);
  assert.equal(fast.action_candidates.length, 0);

  const stronger = buildRun([segment(1, "내일까지 시험 결과를 보내 주세요.", 20)], {
    evidenceRole: "independent_machine_transcript_stronger_unverified",
    transcriptQuality: "machine_transcript_unverified_attention_required",
  });
  assert.equal(stronger.evidence_gate.input_class, "independent_asr_fast");
  assert.equal(stronger.evidence_gate.state, "stronger_local_asr_required");
  assert.equal(stronger.review_windows[0].human_listen_required, false);
  assert.equal(stronger.action_candidates.length, 0);
});

test("fast and stronger ASR agreement avoids human listening while material disagreement creates one bounded window", () => {
  const fast = buildRun([segment(1, "내일까지 시험 결과를 보내 주세요.", 20)], {
    evidenceRole: "independent_machine_transcript_unverified",
  });
  const strongerAgreement = asSyntheticVerifiedStrong(buildRun([segment(1, "내일까지 시험 결과를 보내 주세요.", 20)], {
    transcriptSha256: "b".repeat(64),
    evidenceRole: "independent_machine_transcript_stronger_unverified",
    transcriptQuality: "machine_transcript_unverified_attention_required",
  }));
  const agreed = compareVoiceSemanticRunsUntrusted(fast, strongerAgreement);
  assert.equal(agreed.state, "shadow_reviewable");
  assert.equal(agreed.disagreement_count, 0);
  assert.equal(agreed.human_review_windows.length, 0);

  const strongerDisagreement = asSyntheticVerifiedStrong(buildRun([segment(1, "시험 배경 설명입니다.", 20)], {
    transcriptSha256: "c".repeat(64),
    evidenceRole: "independent_machine_transcript_stronger_unverified",
  }));
  const disagreed = compareVoiceSemanticRunsUntrusted(fast, strongerDisagreement);
  assert.equal(disagreed.state, "human_audio_review_required");
  assert.equal(disagreed.disagreement_count, 1);
  assert.equal(disagreed.human_review_windows[0].human_listen_required, true);
  assert.ok(disagreed.human_review_windows[0].duration_seconds <= 90);
  assert.equal(disagreed.boundaries.trivial_ambiguity_escalated, false);
});

test("an in-memory forged stronger run cannot reach comparison or semantic summary authority", () => {
  const fast = buildRun([segment(1, "내일까지 시험 결과를 보내 주세요.", 20)]);
  const stronger = asSyntheticVerifiedStrong(buildRun([segment(1, "시험 배경 설명입니다.", 20)], {
    transcriptSha256: "e".repeat(64),
  }));
  stronger.action_candidates = [syntheticCandidate(stronger)];
  stronger.coverage.action_candidate_count = 1;
  const validation = validateVoiceSemanticLabelRun(stronger);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((item) => item.includes("not artifact-verified")));
  assert.throws(() => compareVoiceSemanticRuns(fast, stronger), /not artifact-verified/u);
  const untrustedComparison = compareVoiceSemanticRunsUntrusted(fast, stronger);
  assert.throws(() => buildSafeSemanticSummary(stronger), /not artifact-verified/u);
  assert.throws(() => buildSafeComparisonSummary(untrustedComparison), /artifact-verified manifest comparison/u);
  assert.throws(() => buildComparisonGatedSemanticSummary(stronger, untrustedComparison), /artifact-verified manifest comparison/u);
});

test("trivial acknowledgement and nearby meal quantities never create human audio review", () => {
  const acknowledgementFast = buildRun([segment(1, "네, 확인했습니다.", 10)]);
  const acknowledgementStrong = asSyntheticVerifiedStrong(buildRun([segment(1, "네, 알겠습니다.", 10)], {
    transcriptSha256: "1".repeat(64),
  }));
  const acknowledgementComparison = compareVoiceSemanticRunsUntrusted(acknowledgementFast, acknowledgementStrong);
  assert.equal(acknowledgementComparison.state, "shadow_reviewable");
  assert.equal(acknowledgementComparison.fast_material_unit_count, 0);
  assert.equal(acknowledgementComparison.stronger_material_unit_count, 0);

  const fast = buildRun([
    segment(1, "자료를 확인해 주세요.", 20),
    segment(2, "점심은 3개 주문했습니다.", 27),
  ]);
  const stronger = asSyntheticVerifiedStrong(buildRun([
    segment(1, "자료를 확인해 주세요.", 20),
    segment(2, "점심은 4개 주문했습니다.", 27),
  ], { transcriptSha256: "2".repeat(64) }));
  const comparison = compareVoiceSemanticRunsUntrusted(fast, stronger);
  assert.equal(comparison.state, "shadow_reviewable");
  assert.equal(comparison.disagreement_count, 0);
});

test("conflicting engineering values remain material and require bounded review", () => {
  for (const [fastText, strongerText, digestCharacter] of [
    ["전압은 12V입니다.", "전압은 15V입니다.", "3"],
    ["저항은 10Ω입니다.", "저항은 15Ω입니다.", "4"],
    ["저항은 10옴입니다.", "저항은 15옴입니다.", "7"],
    ["온도는 50도입니다.", "온도는 80도입니다.", "8"],
    ["저항 10옴.", "저항 15옴.", "9"],
    ["온도 50도.", "온도 80도.", "a"],
    ["8월 3일까지 제출입니다.", "8월 4일까지 제출입니다.", "5"],
    ["품질 점수는 72점입니다.", "품질 점수는 27점입니다.", "6"],
  ]) {
    const fast = buildRun([segment(1, fastText, 10)]);
    const stronger = asSyntheticVerifiedStrong(buildRun([segment(1, strongerText, 10)], {
      transcriptSha256: digestCharacter.repeat(64),
    }));
    const comparison = compareVoiceSemanticRunsUntrusted(fast, stronger);
    assert.equal(comparison.state, "human_audio_review_required", `${fastText} versus ${strongerText}`);
    assert.ok(comparison.human_review_windows[0].importance_reason_codes.includes("critical_entity_disagreement"));
    assert.ok(comparison.human_review_windows[0].duration_seconds >= 30);
  }
});

test("ASR comparison tolerates equivalent critical entities split across adjacent turn boundaries", () => {
  const fast = buildRun([
    segment(1, "값은 3cm입니다.", 5),
    segment(2, "내일까지 확인해 주세요.", 10),
  ], { evidenceRole: "independent_machine_transcript_unverified" });
  const stronger = asSyntheticVerifiedStrong(buildRun([
    segment(1, "값은 3cm이고 내일까지 확인해 주세요.", 8),
  ], {
    transcriptSha256: "f".repeat(64),
    evidenceRole: "independent_machine_transcript_stronger_unverified",
  }));
  const comparison = compareVoiceSemanticRunsUntrusted(fast, stronger);
  assert.equal(comparison.state, "shadow_reviewable");
  assert.equal(comparison.disagreement_count, 0);
  assert.equal(comparison.human_review_windows.length, 0);
});

test("ASR comparison escalates a conflicting material value", () => {
  const fast = buildRun([segment(1, "12cm로 확인해 주세요.", 10)], {
    evidenceRole: "independent_machine_transcript_unverified",
  });
  const stronger = asSyntheticVerifiedStrong(buildRun([segment(1, "15cm로 확인해 주세요.", 10)], {
    transcriptSha256: "9".repeat(64),
    evidenceRole: "independent_machine_transcript_stronger_unverified",
  }));
  const comparison = compareVoiceSemanticRunsUntrusted(fast, stronger);
  assert.equal(comparison.state, "human_audio_review_required");
  assert.ok(comparison.human_review_windows[0].importance_reason_codes.includes("critical_entity_disagreement"));
});

test("ASR comparison escalates a one-sided additional critical value", () => {
  const fast = buildRun([segment(1, "12cm\ub85c \ud655\uc778\ud574 \uc8fc\uc138\uc694", 10)]);
  const stronger = asSyntheticVerifiedStrong(buildRun([segment(1, "12cm\uc640 15cm\ub85c \ud655\uc778\ud574 \uc8fc\uc138\uc694", 10)], {
    transcriptSha256: "6".repeat(64),
  }));
  const comparison = compareVoiceSemanticRunsUntrusted(fast, stronger);
  assert.equal(comparison.state, "human_audio_review_required");
  assert.ok(comparison.human_review_windows[0].importance_reason_codes.includes("critical_entity_disagreement"));
});

test("ASR comparison preserves Korean particle-bearing counts and escalates their conflict", () => {
  const fast = buildRun([segment(1, "3\uac1c\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694", 10)]);
  const stronger = asSyntheticVerifiedStrong(buildRun([segment(1, "5\uac1c\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694", 10)], {
    transcriptSha256: "5".repeat(64),
  }));
  assert.equal(fast.segment_labels[0].entities.find((item) => item.kind === "measured_value")?.value, "3\uac1c");
  assert.equal(stronger.segment_labels[0].entities.find((item) => item.kind === "measured_value")?.value, "5\uac1c");
  const comparison = compareVoiceSemanticRunsUntrusted(fast, stronger);
  assert.equal(comparison.state, "human_audio_review_required");
  assert.ok(comparison.human_review_windows[0].importance_reason_codes.includes("critical_entity_disagreement"));

  const durationSuffix = buildRun([segment(1, "3\uc8fc\uac04 \uac80\ud1a0\ud574 \uc8fc\uc138\uc694", 10)]);
  const distributionSuffix = buildRun([segment(1, "3\uac1c\uc529 \ud655\uc778\ud574 \uc8fc\uc138\uc694", 10)]);
  assert.equal(durationSuffix.segment_labels[0].entities.find((item) => item.kind === "measured_value")?.value, "3\uc8fc");
  assert.equal(distributionSuffix.segment_labels[0].entities.find((item) => item.kind === "measured_value")?.value, "3\uac1c");
});

test("ASR comparison catches project-code changes and one-sided person loss", () => {
  const fastProject = buildRun([segment(1, "P26-014 자료를 내일까지 확인해 주세요.", 10)], {
    evidenceRole: "independent_machine_transcript_unverified",
  });
  const strongProject = asSyntheticVerifiedStrong(buildRun([segment(1, "P26-015 자료를 내일까지 확인해 주세요.", 10)], {
    transcriptSha256: "7".repeat(64),
  }));
  const projectComparison = compareVoiceSemanticRunsUntrusted(fastProject, strongProject);
  assert.equal(fastProject.segment_labels[0].entities.find((item) => item.kind === "project_code_mention")?.value, "P26-014");
  assert.ok(projectComparison.human_review_windows[0].importance_reason_codes.includes("critical_entity_disagreement"));

  const fastPerson = buildRun([segment(1, "김상윤 수석님 관련 자료를 내일까지 확인해 주세요.", 10)]);
  const strongPerson = asSyntheticVerifiedStrong(buildRun([segment(1, "관련 자료를 내일까지 확인해 주세요.", 10)], {
    transcriptSha256: "8".repeat(64),
  }));
  const personComparison = compareVoiceSemanticRunsUntrusted(fastPerson, strongPerson);
  assert.ok(personComparison.human_review_windows[0].importance_reason_codes.includes("critical_entity_disagreement"));
});

test("material disagreement without timestamps fails closed instead of creating an unbounded review", () => {
  const noTime = { ...segment(1, "자료를 확인해 주세요."), start_seconds: null, end_seconds: null };
  const fast = buildRun([noTime]);
  const stronger = asSyntheticVerifiedStrong(buildRun([{ ...noTime, content: "자료를 보내 주세요." }], {
    transcriptSha256: "0".repeat(64),
  }));
  assert.throws(() => compareVoiceSemanticRunsUntrusted(fast, stronger), /without finite timestamps/u);
});

test("ASR comparison schema accepts body-safe disagreement output", async () => {
  const fast = buildRun([segment(1, "내일까지 시험 결과를 보내 주세요.", 20)], {
    evidenceRole: "independent_machine_transcript_unverified",
  });
  const stronger = asSyntheticVerifiedStrong(buildRun([segment(1, "시험 배경 설명입니다.", 20)], {
    transcriptSha256: "d".repeat(64),
    evidenceRole: "independent_machine_transcript_stronger_unverified",
  }));
  const comparison = compareVoiceSemanticRunsUntrusted(fast, stronger);
  const schema = JSON.parse(await readFile(new URL("./semantic_asr_comparison.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true }).compile(schema);
  assert.equal(validate(comparison), true, JSON.stringify(validate.errors));
  assert.equal(validateVoiceSemanticComparison(comparison).ok, true);

  const unknownField = structuredClone(comparison);
  unknownField.unexpected = true;
  assert.equal(validate(unknownField), false);
  assert.equal(validateVoiceSemanticComparison(unknownField).ok, false);

  const inconsistentState = structuredClone(comparison);
  inconsistentState.state = "shadow_reviewable";
  inconsistentState.disagreement_count = 0;
  assert.equal(validate(inconsistentState), false);
  assert.equal(validateVoiceSemanticComparison(inconsistentState).ok, false);

  const unbounded = structuredClone(comparison);
  unbounded.human_review_windows[0].duration_seconds = 994;
  assert.equal(validate(unbounded), false);
  assert.equal(validateVoiceSemanticComparison(unbounded).ok, false);
  assert.equal(JSON.stringify(comparison).includes("시험 결과"), false);
});

test("bounded human-review clip preparation is dry-run first, idempotent, and transcript-free", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-review-"));
  try {
    const sessionDir = path.join(root, "_workspaces", "system", "voice_capture", "sessions", "2026-07-22", "fixture_review");
    const audioPath = path.join(sessionDir, "audio", "source.mp3");
    await mkdir(path.dirname(audioPath), { recursive: true });
    await writeFile(audioPath, "synthetic audio", "utf8");
    const audioRef = path.relative(root, audioPath).split(path.sep).join("/");
    const audioSha256 = crypto.createHash("sha256").update("synthetic audio").digest("hex");
    await writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify({
      session_id: "fixture_review",
      source_sha256: audioSha256,
      audio: { ref: audioRef, sha256: audioSha256 },
    })}\n`, "utf8");
    const comparison = {
      schema_version: "soulforge.voice_semantic_asr_comparison.v1",
      comparison_id: `vsc_${"1".repeat(24)}`,
      recording_id: "fixture_review",
      fast_run_id: `vsl_${"2".repeat(24)}`,
      stronger_run_id: `vsl_${"3".repeat(24)}`,
      fast_material_unit_count: 1,
      stronger_material_unit_count: 0,
      disagreement_count: 1,
      state: "human_audio_review_required",
      human_review_windows: [{
        window_id: `vrw_${"4".repeat(24)}`,
        start_seconds: 5,
        duration_seconds: 31.5,
        source_unit_refs: ["unit_1_1"],
        importance_state: "material_ambiguity_candidate",
        importance_reason_codes: ["material_speech_act_disagreement"],
        escalation_state: "human_audio_review_required",
        human_listen_required: true,
        transcript_text_copied: false,
      }],
      boundaries: {
        transcript_body_copied: false,
        provider_transcript_used: false,
        trivial_ambiguity_escalated: false,
        official_task_mutated: false,
      },
    };
    const ffmpegPath = path.join(root, "ffmpeg.exe");
    await writeFile(ffmpegPath, "fixture", "utf8");
    const runner = (command, args, options) => {
      assert.equal(command, ffmpegPath);
      assert.equal(args[args.indexOf("-i") + 1], "pipe:0");
      assert.equal(args.at(-1), "pipe:1");
      assert.equal(crypto.createHash("sha256").update(options.input).digest("hex"), audioSha256);
      assert.equal(options.input_sha256, audioSha256);
      const outputPath = args.find((value) => String(value).endsWith(".wav"));
      writeFileSync(outputPath, "bounded review audio", "utf8");
      return { status: 0 };
    };

    await assert.rejects(
      prepareVoiceSemanticReviewClipsFromComparison({ repoRoot: root, sessionDir, comparison, apply: false }),
      /artifact-verified manifest comparison/u,
    );
    await assert.rejects(
      prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({
        repoRoot: process.cwd(),
        sessionDir,
        comparison,
        apply: false,
      }),
      /temporary repo root/u,
    );

    const dry = await prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({
      repoRoot: root,
      sessionDir,
      comparison,
      ffmpegBinary: ffmpegPath,
      commandRunner: runner,
      apply: false,
    });
    assert.equal(dry.applied, false);
    assert.equal(dry.plan.clip_count, 1);
    assert.equal(dry.plan.clips[0].duration_seconds <= 90, true);

    const failingRunner = (command, args) => {
      const outputPath = args.find((value) => String(value).endsWith(".wav"));
      writeFileSync(outputPath, "partial review audio", "utf8");
      throw new Error("synthetic ffmpeg failure after partial output");
    };
    await assert.rejects(
      prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({
        repoRoot: root,
        sessionDir,
        comparison,
        ffmpegBinary: ffmpegPath,
        commandRunner: failingRunner,
        apply: true,
      }),
      /synthetic ffmpeg failure/u,
    );
    const reviewOutputDir = path.join(sessionDir, "analysis", "semantic_review_audio", comparison.comparison_id);
    assert.deepEqual((await readdir(reviewOutputDir)).filter((name) => name.includes(".tmp-")), []);

    await assert.rejects(
      prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({
        repoRoot: root,
        sessionDir,
        comparison,
        ffmpegBinary: ffmpegPath,
        commandRunner: runner,
        beforeManifestRename: () => { throw new Error("synthetic manifest rename failure"); },
        apply: true,
      }),
      /synthetic manifest rename failure/u,
    );
    assert.deepEqual((await readdir(reviewOutputDir)).filter((name) => name.includes(".tmp-")), []);
    await rm(path.join(root, dry.plan.clips[0].clip_ref), { force: true });

    const applied = await prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({
      repoRoot: root,
      sessionDir,
      comparison,
      ffmpegBinary: ffmpegPath,
      commandRunner: runner,
      apply: true,
    });
    assert.equal(applied.applied, true);
    assert.equal(applied.duplicate, false);
    assert.equal(JSON.stringify(applied.plan).includes("시험 결과"), false);
    assert.equal((await readFile(path.join(root, applied.plan.clips[0].clip_ref), "utf8")), "bounded review audio");

    const clipManifestPath = path.join(root, applied.manifest_ref);
    const tamperedManifest = structuredClone(applied.plan);
    tamperedManifest.clips[0].start_seconds += 1;
    await writeFile(clipManifestPath, `${JSON.stringify(tamperedManifest, null, 2)}\n`, "utf8");
    await assert.rejects(
      prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({
        repoRoot: root, sessionDir, comparison, ffmpegBinary: ffmpegPath, commandRunner: runner, apply: true,
      }),
      /manifest conflicts/u,
    );
    await writeFile(clipManifestPath, `${JSON.stringify(applied.plan, null, 2)}\n`, "utf8");

    const replay = await prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({
      repoRoot: root,
      sessionDir,
      comparison,
      ffmpegBinary: ffmpegPath,
      commandRunner: () => { throw new Error("idempotent replay must not invoke ffmpeg"); },
      apply: true,
    });
    assert.equal(replay.duplicate, true);

    await writeFile(audioPath, "tampered audio", "utf8");
    await assert.rejects(
      prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({
        repoRoot: root, sessionDir, comparison, ffmpegBinary: ffmpegPath, commandRunner: runner, apply: false,
      }),
      /source audio SHA-256 mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("untrusted review fixture rejects a temporary-directory link escape", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-link-escape-"));
  const linkedRoot = path.join(root, "linked-root");
  try {
    try {
      await symlink(process.cwd(), linkedRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        t.skip(`link creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp({ repoRoot: linkedRoot }),
      /link escape/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tentative speech decision is labeled but standalone ASR creates no candidate", () => {
  const run = buildRun([segment(1, "일단 다음 주에 진행하기로 했습니다.")]);
  assert.ok(run.segment_labels[0].speech_acts.includes("decision"));
  assert.equal(run.segment_labels[0].modality, "uncertain");
  assert.equal(run.segment_labels[0].speech_decision_state, "tentative");
  assert.equal(run.action_candidates.length, 0);
});

test("project evidence cannot create a route before verified ASR pair and P5 acceptance", () => {
  const cards = [{
    schema_version: "soulforge.voice_project_context_card.v1",
    card_ref: "_workmeta/P26-014/project_context/cards/v1.json",
    project_ref: "P26-014",
    card_version: "1",
    valid_at: null,
    known_at: "2026-07-22T11:00:00Z",
    input_set_digest: "c".repeat(64),
    authority_state: "shadow_unaccepted_input",
    claim_ceiling: "observed",
    acl_state: "unresolved",
    coverage_gap_codes: ["p5_context_acceptance_missing"],
    aliases: [{ value: "기뢰전", kind: "approved_alias" }],
    people: [],
    terms: [{ value: "수중센서", kind: "equipment", weight: 2 }],
    negative_terms: [],
    source_refs: ["_workmeta/P26-014/project_context/source_index.json"],
  }];
  const phrase = "기뢰전 수중센서 시험 결과를 내일까지 정리해 주세요.";
  const run = buildRun([segment(1, phrase)], { projectContextCards: cards });
  assert.equal(run.segment_labels[0].project_match.state, "unresolved_needs_context");
  assert.equal(run.segment_labels[0].project_match.candidates.length, 0);
  assert.equal(run.action_candidates.length, 0);
  assert.equal(JSON.stringify(run).includes(phrase), false);
  assert.equal(validateVoiceSemanticLabelRun(run).ok, true);
});

test("all source segments are accounted for exactly once", () => {
  const run = buildRun([
    segment(1, "첫 번째 배경 설명입니다.", 0),
    segment(2, "자료를 확인해 주세요.", 10),
    segment(3, "네 알겠습니다.", 20, "SPEAKER_01"),
  ]);
  assert.equal(run.coverage.source_segment_count, 3);
  assert.equal(run.coverage.covered_source_segment_count, 3);
  assert.equal(run.coverage.every_source_segment_accounted_for, true);
  assert.equal(run.coverage.unlabeled_semantic_unit_count, 0);
});

test("duplicate or invalid source segment identity fails closed", () => {
  assert.throws(
    () => buildRun([segment(1, "첫 구간"), segment(1, "중복 구간")]),
    /duplicate source segment_id/u,
  );
  assert.throws(
    () => buildRun([{ ...segment(1, "역방향 구간"), start_seconds: 5, end_seconds: 4 }]),
    /ends before it starts/u,
  );
});

test("semantic run identity changes with transcript revision while standalone authority stays zero", () => {
  const first = buildRun([segment(1, "제가 자료를 보내드릴게요.")]);
  const second = buildVoiceSemanticLabelRun({
    recordingId: "recording_fixture_001",
    transcriptRef: "_workspaces/system/voice_capture/sessions/fixture/transcript.jsonl",
    transcriptSha256: "b".repeat(64),
    sourceSegments: [segment(1, "제가 수정 자료를 보내드릴게요.")],
    recordedAt: "2026-07-22T20:00:00+09:00",
    evidenceRole: "independent_machine_transcript_stronger_unverified",
    transcriptQuality: "machine_transcript_unverified",
  });
  assert.notEqual(first.run_id, second.run_id);
  assert.notEqual(first.segment_labels[0].content_sha256, second.segment_labels[0].content_sha256);
  assert.equal(first.action_candidates.length, 0);
  assert.equal(second.action_candidates.length, 0);
});

test("semantic run identity binds every output-determining recording and turn input", () => {
  const rows = [segment(1, "\uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694", 10)];
  const base = buildRun(rows, { recordingTitle: "\ud1b5\ud654", durationSeconds: 30, turnOptions: { maxChars: 420, maxGapSeconds: 3 } });
  const changedTime = buildRun(rows, { recordedAt: "2026-07-23T20:00:00+09:00", recordingTitle: "\ud1b5\ud654", durationSeconds: 30, turnOptions: { maxChars: 420, maxGapSeconds: 3 } });
  const changedTitle = buildRun(rows, { recordingTitle: "\ud68c\uc758", durationSeconds: 30, turnOptions: { maxChars: 420, maxGapSeconds: 3 } });
  const changedDuration = buildRun(rows, { recordingTitle: "\ud1b5\ud654", durationSeconds: 1200, turnOptions: { maxChars: 420, maxGapSeconds: 3 } });
  const changedTurnOptions = buildRun(rows, { recordingTitle: "\ud1b5\ud654", durationSeconds: 30, turnOptions: { maxChars: 100, maxGapSeconds: 1 } });
  const changedSegments = buildRun([{ ...rows[0], content: "\ub2e4\ub978 \uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694" }], { recordingTitle: "\ud1b5\ud654", durationSeconds: 30, turnOptions: { maxChars: 420, maxGapSeconds: 3 } });
  const changedTranscriptRef = buildRun(rows, { transcriptRef: "_workspaces/system/voice_capture/sessions/fixture/revised/transcript.jsonl", recordingTitle: "\ud1b5\ud654", durationSeconds: 30, turnOptions: { maxChars: 420, maxGapSeconds: 3 } });
  for (const changed of [changedTime, changedTitle, changedDuration, changedTurnOptions, changedSegments, changedTranscriptRef]) assert.notEqual(changed.run_id, base.run_id);
});

test("completed local ASR manifest is hash-bound and dry-run makes no writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-label-"));
  try {
    const runDir = path.join(root, "_workspaces", "system", "voice_capture", "sessions", "2026-07-22", "fixture", "analysis", "local_asr", "run_v1");
    await mkdir(runDir, { recursive: true });
    await writeFile(path.resolve(runDir, "../../..", "session_manifest.json"), `${JSON.stringify({
      session_id: "fixture_session",
      source_provider: "PLAUD",
      recorded_at_local: "2026-07-22T20:00:00+09:00",
    })}\n`, "utf8");
    const transcript = `${JSON.stringify(segment(1, "내일까지 자료를 확인해 주세요.", 0))}\n`;
    const transcriptPath = path.join(runDir, "transcript.jsonl");
    await writeFile(transcriptPath, transcript, "utf8");
    const transcriptRef = path.relative(root, transcriptPath).split(path.sep).join("/");
    const digest = crypto.createHash("sha256").update(transcript).digest("hex");
    const manifestPath = path.join(runDir, "analysis_manifest.json");
    await writeFile(manifestPath, `${JSON.stringify({
      state: "completed",
      session_id: "fixture_session",
      segment_count: 1,
      transcript_jsonl_ref: transcriptRef,
      transcript_sha256: digest,
      evidence_role: "independent_machine_transcript_unverified",
      quality: "machine_transcript_unverified",
      completed_at: "2026-07-22T11:00:00Z",
    }, null, 2)}\n`, "utf8");
    const beforeManifest = await readFile(manifestPath);
    const beforeTranscript = await readFile(transcriptPath);
    const first = await analyzeVoiceSemanticManifest({ repoRoot: root, analysisManifestPath: manifestPath });
    const second = await analyzeVoiceSemanticManifest({ repoRoot: root, analysisManifestPath: manifestPath });
    assert.equal(first.applied, false);
    assert.deepEqual(first, second);
    assert.equal(first.run.recording_ref.recorded_at, "2026-07-22T20:00:00.000+09:00");
    assert.deepEqual(await readFile(manifestPath), beforeManifest);
    assert.deepEqual(await readFile(transcriptPath), beforeTranscript);

    const forbiddenCardPath = path.join(root, "_workmeta", "system", "secrets", "credential.json");
    await mkdir(path.dirname(forbiddenCardPath), { recursive: true });
    await writeFile(forbiddenCardPath, "{not-even-json", "utf8");
    await assert.rejects(
      analyzeVoiceSemanticManifest({ repoRoot: root, analysisManifestPath: manifestPath, contextCardPaths: [forbiddenCardPath] }),
      /context card path must match/u,
    );

    const broken = JSON.parse(await readFile(manifestPath, "utf8"));
    broken.transcript_sha256 = "b".repeat(64);
    await writeFile(manifestPath, `${JSON.stringify(broken)}\n`, "utf8");
    await assert.rejects(
      analyzeVoiceSemanticManifest({ repoRoot: root, analysisManifestPath: manifestPath }),
      /SHA-256 mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local ASR semantic time uses the session recording start and never ASR completion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-source-time-"));
  try {
    const sessionDir = path.join(root, "_workspaces", "system", "voice_capture", "sessions", "2026-07-23", "fixture_time");
    const runDir = path.join(sessionDir, "analysis", "local_asr", "run_v1");
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify({
      session_id: "fixture_time",
      source_provider: "PLAUD",
      recorded_at_local: "2026-07-23T12:00:00",
    })}\n`, "utf8");
    const transcript = `${JSON.stringify(segment(1, "\uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694", 10))}\n`;
    const transcriptPath = path.join(runDir, "transcript.jsonl");
    await writeFile(transcriptPath, transcript, "utf8");
    const manifestPath = path.join(runDir, "analysis_manifest.json");
    await writeFile(manifestPath, `${JSON.stringify({
      state: "completed",
      session_id: "fixture_time",
      segment_count: 1,
      transcript_jsonl_ref: path.relative(root, transcriptPath).split(path.sep).join("/"),
      transcript_sha256: crypto.createHash("sha256").update(transcript).digest("hex"),
      evidence_role: "independent_machine_transcript_unverified",
      quality: "machine_transcript_unverified",
      completed_at: "2026-07-23T15:00:00Z",
    })}\n`, "utf8");

    const result = await analyzeVoiceSemanticManifest({
      repoRoot: root,
      analysisManifestPath: manifestPath,
    });
    assert.equal(result.run.recording_ref.recorded_at, "2026-07-23T21:00:00.000+09:00");

    const missingTime = JSON.parse(await readFile(path.join(sessionDir, "session_manifest.json"), "utf8"));
    delete missingTime.recorded_at_local;
    await writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify(missingTime)}\n`, "utf8");
    await assert.rejects(
      analyzeVoiceSemanticManifest({ repoRoot: root, analysisManifestPath: manifestPath }),
      /session recording start is required/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider transcript session uses the same PLAUD source-time normalization", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-provider-time-"));
  try {
    const sessionDir = path.join(
      root,
      "_workspaces",
      "system",
      "voice_capture",
      "sessions",
      "2026-07-23",
      "provider_fixture",
    );
    await mkdir(sessionDir, { recursive: true });
    const transcriptPath = path.join(sessionDir, "transcript.jsonl");
    const transcript = `${JSON.stringify(segment(1, "\uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694", 10))}\n`;
    await writeFile(transcriptPath, transcript, "utf8");
    const sessionManifestPath = path.join(sessionDir, "session_manifest.json");
    const manifest = {
      session_id: "provider_fixture",
      source_provider: "PLAUD",
      recorded_at_local: "2026-07-23T12:00:00",
      transcript: {
        jsonl_ref: path.relative(root, transcriptPath).split(path.sep).join("/"),
        segment_count: 1,
        evidence_role: "provider_transcript_auxiliary_unverified",
        quality: "provider_transcript_unverified",
      },
    };
    await writeFile(sessionManifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

    const result = await analyzeVoiceSemanticSession({
      repoRoot: root,
      sessionDir,
    });
    assert.equal(result.run.recording_ref.recorded_at, "2026-07-23T21:00:00.000+09:00");

    await writeFile(sessionManifestPath, `${JSON.stringify({
      ...manifest,
      source_provider: "OTHER",
    })}\n`, "utf8");
    await assert.rejects(
      analyzeVoiceSemanticSession({ repoRoot: root, sessionDir }),
      /offsetless recording start is ambiguous/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verified ASR pair rejects manifest substitution between provenance and analysis", () => {
  const original = Buffer.from('{"state":"completed","run_id":"fast"}\n', "utf8");
  const changed = Buffer.from('{"state":"completed","run_id":"substituted"}\n', "utf8");
  const receipt = {
    fast: { manifest_sha256: crypto.createHash("sha256").update(original).digest("hex") },
    stronger: { manifest_sha256: "b".repeat(64) },
  };
  assert.equal(verifySemanticManifestPairBinding(original, receipt, "fast"), true);
  assert.throws(
    () => verifySemanticManifestPairBinding(changed, receipt, "fast"),
    /changed after ASR pair verification/u,
  );
});

test("review audio source stays bound to the verified pair manifest and audio digests", () => {
  const sessionManifestBytes = Buffer.from('{"session_id":"fixture_review"}\n', "utf8");
  const sourceSha256 = "c".repeat(64);
  const binding = {
    session_manifest_sha256: crypto.createHash("sha256").update(sessionManifestBytes).digest("hex"),
    source_sha256: sourceSha256,
  };
  assert.equal(verifySemanticReviewSourceBinding({
    sessionManifestBytes,
    declaredAudioSha256: sourceSha256,
    observedAudioSha256: sourceSha256,
    binding,
  }), true);
  assert.throws(() => verifySemanticReviewSourceBinding({
    sessionManifestBytes: Buffer.from('{"session_id":"same_name_other_date"}\n', "utf8"),
    declaredAudioSha256: sourceSha256,
    observedAudioSha256: sourceSha256,
    binding,
  }), /session manifest does not match/u);
  assert.throws(() => verifySemanticReviewSourceBinding({
    sessionManifestBytes,
    declaredAudioSha256: "d".repeat(64),
    observedAudioSha256: "d".repeat(64),
    binding,
  }), /audio does not match/u);
});

test("ASR pair provenance rejects a declared source hash that does not match the actual session audio", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-source-proof-"));
  try {
    const sessionDir = path.join(root, "_workspaces", "system", "voice_capture", "sessions", "2026-07-22", "fixture_source");
    const audioPath = path.join(sessionDir, "audio", "source.wav");
    await mkdir(path.dirname(audioPath), { recursive: true });
    await writeFile(audioPath, "actual source bytes", "utf8");
    const audioRef = path.relative(root, audioPath).split(path.sep).join("/");
    const declaredHash = "1".repeat(64);
    await writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify({
      session_id: "fixture_source",
      source_sha256: declaredHash,
      audio: { ref: audioRef, sha256: declaredHash },
    })}\n`, "utf8");
    const makeManifest = async (lane, modelId, evidenceRole) => {
      const runDir = path.join(sessionDir, "analysis", "local_asr", lane);
      await mkdir(runDir, { recursive: true });
      const manifestPath = path.join(runDir, "analysis_manifest.json");
      await writeFile(manifestPath, `${JSON.stringify({
        state: "completed",
        session_id: "fixture_source",
        source_audio_ref: audioRef,
        source_sha256: declaredHash,
        run_id: lane,
        engine: "whisper.cpp",
        model_id: modelId,
        model_ref: "model.bin",
        model_sha1: "2".repeat(40),
        evidence_role: evidenceRole,
      })}\n`, "utf8");
      return manifestPath;
    };
    const fastManifest = await makeManifest("fixture_fast", "large-v3-turbo-q5_0", "independent_machine_transcript_unverified");
    const strongManifest = await makeManifest("fixture_strong", "large-v3-q5_0", "independent_machine_transcript_stronger_unverified");
    await assert.rejects(
      compareVoiceSemanticManifests({ repoRoot: root, fastAnalysisManifestPath: fastManifest, strongerAnalysisManifestPath: strongManifest }),
      /actual source audio SHA-256 mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local ASR execution proof reconstructs the transcript and rejects changed chunk artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-artifact-proof-"));
  try {
    const runDir = path.join(root, "run");
    const chunksDir = path.join(runDir, "chunks");
    await mkdir(chunksDir, { recursive: true });
    const manifestPath = path.join(runDir, "analysis_manifest.json");
    const window = { nominal_start_seconds: 0, nominal_end_seconds: 10, extract_start_seconds: 0, extract_duration_seconds: 10 };
    const whisper = { transcription: [{ offsets: { from: 1000, to: 2500 }, text: "\uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694", tokens: [{ p: 0.9 }] }] };
    const reconstructed = suppressRepetitiveSegments(parseWhisperJson(whisper, window, { runId: "fixture_run" }), { enabled: true, minimum_text_characters: 4, lookback_seconds: 90 });
    reconstructed.kept.forEach((row, index) => { row.segment_id = index + 1; });
    const transcript = `${reconstructed.kept.map((row) => JSON.stringify(row)).join("\n")}\n`;
    const manifest = {
      run_id: "fixture_run",
      chunk_count: 1,
      repetition_filter: { enabled: true, minimum_text_characters: 4, lookback_seconds: 90 },
      transcript_sha256: crypto.createHash("sha256").update(transcript).digest("hex"),
      segment_count: reconstructed.kept.length,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
    await writeFile(path.join(chunksDir, "chunk_00001.json"), `${JSON.stringify(whisper)}\n`, "utf8");
    await writeFile(path.join(chunksDir, "chunk_00001.txt"), "synthetic text artifact\n", "utf8");
    await writeFile(path.join(chunksDir, "chunk_00001.srt"), "synthetic subtitle artifact\n", "utf8");
    const receiptPath = path.join(chunksDir, "chunk_00001.complete.json");
    const receipt = { schema_version: "soulforge.local_asr_chunk_receipt.v0", chunk_index: 1, window, segment_count: 1 };
    await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`, "utf8");

    const verified = await verifyLocalAsrExecutionArtifacts(manifestPath, manifest);
    assert.match(verified.execution_artifact_set_sha256, /^[a-f0-9]{64}$/u);

    const extraOutputPath = path.join(chunksDir, "chunk_00002.json");
    const extraReceiptPath = path.join(chunksDir, "chunk_00002.complete.json");
    await writeFile(extraOutputPath, `${JSON.stringify(whisper)}\n`, "utf8");
    await writeFile(extraReceiptPath, `${JSON.stringify({ ...receipt, chunk_index: 2 })}\n`, "utf8");
    await assert.rejects(verifyLocalAsrExecutionArtifacts(manifestPath, manifest), /artifact set does not exactly match/u);
    await rm(extraOutputPath, { force: true });
    await rm(extraReceiptPath, { force: true });

    await writeFile(receiptPath, `${JSON.stringify({ ...receipt, segment_count: 2 })}\n`, "utf8");
    await assert.rejects(verifyLocalAsrExecutionArtifacts(manifestPath, manifest), /segment_count mismatch/u);

    await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`, "utf8");
    const changed = { transcription: [{ ...whisper.transcription[0], text: "\ub2e4\ub978 \ubb38\uc7a5" }] };
    await writeFile(path.join(chunksDir, "chunk_00001.json"), `${JSON.stringify(changed)}\n`, "utf8");
    await assert.rejects(verifyLocalAsrExecutionArtifacts(manifestPath, manifest), /cannot be reconstructed/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parser rejects malformed JSONL", () => {
  assert.throws(() => parseTranscriptJsonl("{not-json}\n"), /invalid transcript JSONL/u);
});

test("JSON Schema accepts the bounded output and rejects unknown fields", async () => {
  const schemaPath = new URL("./semantic_label_run.schema.json", import.meta.url);
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true }).compile(schema);
  const run = buildRun([segment(1, "자료를 확인해 주세요.")]);
  assert.equal(validate(run), true, JSON.stringify(validate.errors));
  const unsafe = structuredClone(run);
  unsafe.transcript_body = "synthetic sentinel";
  assert.equal(validate(unsafe), false);
});

test("runtime and schema reject authority spoofing, open taxonomies, null windows, and secret-like terms", async () => {
  const schema = JSON.parse(await readFile(new URL("./semantic_label_run.schema.json", import.meta.url), "utf8"));
  const schemaValidate = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true }).compile(schema);
  const base = buildRun([segment(1, "자료를 확인해 주세요.")]);

  const unknownTopLevel = structuredClone(base);
  unknownTopLevel.unexpected = true;
  assert.equal(validateVoiceSemanticLabelRun(unknownTopLevel).ok, false);
  assert.equal(schemaValidate(unknownTopLevel), false);

  const wrongEngine = structuredClone(base);
  wrongEngine.engine.engine_id = "other_engine";
  assert.equal(validateVoiceSemanticLabelRun(wrongEngine).ok, false);
  assert.equal(schemaValidate(wrongEngine), false);

  const spoofed = structuredClone(base);
  spoofed.recording_ref.evidence_role = "provider_transcript_auxiliary_unverified";
  spoofed.evidence_gate = { ...spoofed.evidence_gate, input_class: "independent_asr_stronger", state: "shadow_reviewable", action_candidate_emission_allowed: true, project_candidate_emission_allowed: true, next_step: "shadow_context_correlation" };
  spoofed.action_candidates = [syntheticCandidate(spoofed)];
  spoofed.coverage.action_candidate_count = 1;
  assert.equal(validateVoiceSemanticLabelRun(spoofed).ok, false);
  assert.equal(schemaValidate(spoofed), false);

  const openTaxonomy = structuredClone(base);
  openTaxonomy.action_candidates = [syntheticCandidate(openTaxonomy, { candidate_kind: "authoritative_task", driver_kind: "production_task_engine" })];
  openTaxonomy.coverage.action_candidate_count = 1;
  const taxonomyResult = validateVoiceSemanticLabelRun(openTaxonomy);
  assert.ok(taxonomyResult.errors.some((item) => item.includes("unknown candidate_kind")));
  assert.ok(taxonomyResult.errors.some((item) => item.includes("unknown driver_kind")));
  assert.equal(schemaValidate(openTaxonomy), false);

  const nullWindow = structuredClone(base);
  nullWindow.review_windows[0].start_seconds = null;
  assert.equal(validateVoiceSemanticLabelRun(nullWindow).ok, false);
  assert.equal(schemaValidate(nullWindow), false);

  const secretValue = structuredClone(base);
  secretValue.segment_labels[0].entities.push({ kind: "project_alias", value: "password-secret-123", value_sha256: "d".repeat(64) });
  secretValue.retrieval_plan.query_terms.push({ kind: "project_alias", value: "password-secret-123", value_sha256: "d".repeat(64) });
  const secretResult = validateVoiceSemanticLabelRun(secretValue);
  assert.ok(secretResult.errors.some((item) => item.includes("secret-like")));
  assert.equal(schemaValidate(secretValue), false);

  const projectKey = structuredClone(base);
  projectKey.segment_labels[0].entities.push({ kind: "project_alias", value: "sk-proj-1234567890abcdef", value_sha256: "e".repeat(64) });
  projectKey.retrieval_plan.query_terms.push({ kind: "project_alias", value: "sk-proj-1234567890abcdef", value_sha256: "e".repeat(64) });
  const projectKeyResult = validateVoiceSemanticLabelRun(projectKey);
  assert.ok(projectKeyResult.errors.some((item) => item.includes("secret-like")));
  assert.equal(schemaValidate(projectKey), false);

  const upperProjectKey = structuredClone(base);
  upperProjectKey.segment_labels[0].entities.push({ kind: "project_alias", value: "SK-PROJ-1234567890ABCDEF", value_sha256: "f".repeat(64) });
  assert.equal(validateVoiceSemanticLabelRun(upperProjectKey).ok, false);
  assert.equal(schemaValidate(upperProjectKey), false);

  const upperGithubToken = structuredClone(base);
  upperGithubToken.segment_labels[0].entities.push({ kind: "project_alias", value: "GHP_1234567890ABCDEF", value_sha256: "1".repeat(64) });
  assert.equal(validateVoiceSemanticLabelRun(upperGithubToken).ok, false);
  assert.equal(schemaValidate(upperGithubToken), false);

  const sanitizedSpeaker = buildRun([{ ...segment(1, "\uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694"), speaker: "sk-proj-1234567890abcdef" }]);
  assert.equal(sanitizedSpeaker.segment_labels[0].speaker_label, "UNKNOWN");
  const unsafeSpeaker = structuredClone(base);
  unsafeSpeaker.segment_labels[0].speaker_label = "sk-proj-1234567890abcdef";
  assert.equal(validateVoiceSemanticLabelRun(unsafeSpeaker).ok, false);
  assert.equal(schemaValidate(unsafeSpeaker), false);

  const koreanSecretSpeaker = buildRun([{ ...segment(1, "자료를 확인해 주세요"), speaker: "비밀번호: 1234" }]);
  assert.equal(koreanSecretSpeaker.segment_labels[0].speaker_label, "UNKNOWN");
  const unsafeKoreanSpeaker = structuredClone(base);
  unsafeKoreanSpeaker.segment_labels[0].speaker_label = "비밀번호: 1234";
  assert.equal(validateVoiceSemanticLabelRun(unsafeKoreanSpeaker).ok, false);
  assert.equal(schemaValidate(unsafeKoreanSpeaker), false);

  for (const koreanSecret of [
    "비번: 1234",
    "인증코드: 654321",
    "접속키: SYNTHETIC123",
    "PIN: 7788",
    "패스워드: SYNTHETIC",
    "비번은 synthetic1234",
    "인증코드 synthetic5678",
    "PIN synthetic0000",
    "비밀번호1234",
    "비번1234",
    "인증코드654321",
    "PIN7788",
    "접속키SYNTHETIC123",
  ]) {
    const sanitized = buildRun([{ ...segment(1, "자료를 확인해 주세요"), speaker: koreanSecret }]);
    assert.equal(sanitized.segment_labels[0].speaker_label, "UNKNOWN");
    const unsafe = structuredClone(base);
    unsafe.segment_labels[0].speaker_label = koreanSecret;
    assert.equal(validateVoiceSemanticLabelRun(unsafe).ok, false);
    assert.equal(schemaValidate(unsafe), false);
  }

  const absoluteTranscriptRef = structuredClone(base);
  absoluteTranscriptRef.recording_ref.transcript_ref = ["C:", "private", "transcript.jsonl"].join("/");
  assert.equal(validateVoiceSemanticLabelRun(absoluteTranscriptRef).ok, false);
  assert.equal(schemaValidate(absoluteTranscriptRef), false);

  for (const genericSecret of [
    "token:FAKEVALUE1234567890",
    "cookie:FAKEVALUE1234567890",
    "credential:FAKEVALUE1234567890",
    "authorization:FAKEVALUE1234567890",
    "Bearer FAKEVALUE1234567890",
  ]) {
    const sanitizedGenericSpeaker = buildRun([{ ...segment(1, "자료를 확인해 주세요"), speaker: genericSecret }]);
    assert.equal(sanitizedGenericSpeaker.segment_labels[0].speaker_label, "UNKNOWN");

    const unsafeGenericSpeaker = structuredClone(base);
    unsafeGenericSpeaker.segment_labels[0].speaker_label = genericSecret;
    assert.equal(validateVoiceSemanticLabelRun(unsafeGenericSpeaker).ok, false);
    assert.equal(schemaValidate(unsafeGenericSpeaker), false);
  }
});

test("project context card schema is strict and requires temporal fields", async () => {
  const schema = JSON.parse(await readFile(new URL("./project_context_card.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true }).compile(schema);
  const card = {
    schema_version: "soulforge.voice_project_context_card.v1",
    card_ref: "_workmeta/P26-014/project_context/cards/v1.json",
    project_ref: "P26-014",
    card_version: "1",
    valid_at: null,
    known_at: "2026-07-22T11:00:00Z",
    input_set_digest: "c".repeat(64),
    authority_state: "shadow_unaccepted_input",
    claim_ceiling: "observed",
    acl_state: "unresolved",
    coverage_gap_codes: ["p5_context_acceptance_missing"],
    aliases: [{ value: "synthetic-alpha", kind: "approved_alias" }],
    people: [],
    terms: [{ value: "synthetic-sensor", kind: "equipment", weight: 2 }],
    negative_terms: [],
    source_refs: ["_workmeta/P26-014/project_context/source_index.json"],
  };
  assert.equal(validate(card), true, JSON.stringify(validate.errors));
  const overclaimed = { ...card, authority_state: "accepted" };
  assert.equal(validate(overclaimed), false);
  const uppercaseAliasKind = { ...card, aliases: [{ value: "synthetic-alpha", kind: "Approved_Alias" }] };
  assert.equal(validate(uppercaseAliasKind), false);
  assert.throws(() => buildRun([segment(1, "synthetic-alpha")], { projectContextCards: [uppercaseAliasKind] }), /schema validation failed/u);
  const unknownField = { ...card, unexpected: true };
  assert.equal(validate(unknownField), false);
  assert.throws(() => buildRun([segment(1, "synthetic-alpha")], { projectContextCards: [unknownField] }), /schema validation failed/u);
  const absoluteCardRefs = [
    ["", "tmp", "private-card.json"].join("/"),
    ["C:", "private", "card.json"].join("/"),
    ["", "", "server", "share", "card.json"].join("\\"),
  ];
  for (const absoluteCardRef of absoluteCardRefs) {
    const absoluteRefCard = { ...card, card_ref: absoluteCardRef };
    assert.equal(validate(absoluteRefCard), false, `${absoluteCardRef} must fail schema validation`);
    assert.throws(
      () => buildRun([segment(1, "synthetic-alpha")], { projectContextCards: [absoluteRefCard] }),
      /schema validation failed/u,
    );
  }
  const traversalProjectRef = { ...card, project_ref: "P..X" };
  assert.equal(validate(traversalProjectRef), false);
  assert.throws(
    () => buildRun([segment(1, "synthetic-alpha")], { projectContextCards: [traversalProjectRef] }),
    /schema validation failed/u,
  );
  const sentenceAlias = { ...card, aliases: [{ value: "합성 장치 자료를 내일까지 확인해 주세요", kind: "approved_alias" }] };
  assert.equal(validate(sentenceAlias), false);
  assert.throws(
    () => buildRun([segment(1, "합성 장치 자료를 내일까지 확인해 주세요")], { projectContextCards: [sentenceAlias] }),
    /schema validation failed/u,
  );
  delete card.known_at;
  assert.equal(validate(card), false);
  assert.throws(() => buildRun([segment(1, "synthetic-alpha")], { projectContextCards: [card] }), /schema validation failed/u);
});

test("project ranking requires two distinct lexical anchors, not one duplicated token", () => {
  const baseCard = {
    schema_version: "soulforge.voice_project_context_card.v1",
    card_ref: "_workmeta/P26-014/project_context/cards/duplicate-anchor.json",
    project_ref: "P26-014",
    card_version: "1",
    valid_at: null,
    known_at: "2026-07-22T11:00:00Z",
    input_set_digest: "d".repeat(64),
    authority_state: "shadow_unaccepted_input",
    claim_ceiling: "observed",
    acl_state: "unresolved",
    coverage_gap_codes: ["p5_context_acceptance_missing"],
    aliases: [{ value: "합성알파", kind: "approved_alias" }],
    people: [],
    terms: [{ value: "합성알파", kind: "equipment", weight: 2 }],
    negative_terms: [],
    source_refs: ["_workmeta/P26-014/project_context/source_index.json"],
  };
  const duplicated = rankVoiceProjectContextShadow("합성알파", [baseCard]);
  assert.equal(duplicated.state, "unresolved_needs_context");
  assert.equal(duplicated.candidates[0].independent_anchor_value_count, 1);

  const overlapping = rankVoiceProjectContextShadow("합성 장치 자료 내일 확인 예정", [{
    ...baseCard,
    aliases: [{ value: "합성 장치 자료 내일 확인 예정", kind: "approved_alias" }],
    terms: [{ value: "합성 장치", kind: "equipment", weight: 2 }],
  }]);
  assert.equal(overlapping.state, "unresolved_needs_context");
  assert.equal(overlapping.candidates[0].independent_anchor_value_count, 1);

  const independent = rankVoiceProjectContextShadow("합성알파 합성센서", [{
    ...baseCard,
    terms: [{ value: "합성센서", kind: "equipment", weight: 2 }],
  }]);
  assert.equal(independent.state, "project_candidate_needs_review");
  assert.equal(independent.candidates[0].independent_anchor_value_count, 2);
});

test("CLI semantic apply requires a real bounded session or analysis manifest", async (t) => {
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const outsideSessionDir = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-cli-outside-"));
  t.after(() => rm(outsideSessionDir, { recursive: true, force: true }));
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [cliPath, "semantic-label", "--session-dir", outsideSessionDir, "--apply"],
      { windowsHide: true },
    ),
    (error) => error.code === 2 && /sessionDir|voice_capture|outside/u.test(error.stderr),
  );
});
