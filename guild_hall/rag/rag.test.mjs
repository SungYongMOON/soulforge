import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { exportKnowledgeGraph } from "../knowledge_graph/graph_export.mjs";

const RUNTIME_PREFLIGHT_FAKE_SECRET_ENV_KEY = [
  "SOULFORGE",
  "RAG",
  "PREFLIGHT",
  "FAKE",
  "SECRET",
  "POISON",
].join("_");
const RUNTIME_PREFLIGHT_FAKE_SECRET_ENV_VALUE = [
  "fake",
  "fixture",
  "secret",
  "poison",
  "value",
  "20260605",
].join("_");

import {
  answerFromRagManifest,
  buildRagMetadataIndex,
  buildRagManifest,
  buildRagRetrievalEvaluation,
  buildRagRetrievalTrace,
  buildSourceSliceCards,
  buildSourceSliceDecisionPacket,
  buildSourceSliceOwnerDecisionRecord,
  buildSourceSliceReviewQueue,
  buildSourceSliceTriageRegister,
  renderAnswerText,
  validateRagAnswer,
  validateRagMetadataIndex,
  validateRagRetrievalEvaluation,
  validateRagRetrievalTrace,
  validateRagManifest,
  validateSourceSliceCards,
  validateSourceSliceDecisionPacket,
  validateSourceSliceOwnerDecisionRecord,
  validateSourceSliceReviewQueue,
  validateSourceSliceTriageRegister,
  writeRagMetadataIndex,
  writeRagRetrievalEvaluation,
  writeRagRetrievalTrace,
  writeRagManifest,
  writeSourceSliceCards,
  writeSourceSliceDecisionPacket,
  writeSourceSliceOwnerDecisionRecord,
  writeSourceSliceReviewQueue,
  writeSourceSliceTriageRegister,
} from "./rag.mjs";
import {
  buildSourceTextMetadataProfile,
  validateSourceTextMetadataProfile,
  writeSourceTextMetadataProfile,
} from "./source_text_profile.mjs";
import {
  buildSourceTextExtractionPacket,
  validateSourceTextExtractionPacket,
  writeSourceTextExtractionPacket,
} from "./source_text_extraction_packet.mjs";
import {
  buildRagAnswerEngineRun,
  renderAnswerEngineRunText,
  validateRagAnswerEngineRun,
  writeRagAnswerEngineRun,
} from "./answer_engine_run.mjs";
import {
  buildSourceTextExtractionRunReport,
  validateSourceTextExtractionRunReport,
  writeSourceTextExtractionRunReport,
} from "./source_text_extraction_run_report.mjs";
import {
  buildSourceTextRuntimePreflight,
  validateSourceTextRuntimePreflight,
} from "./source_text_runtime_preflight.mjs";
import {
  buildSourceTextAnswerRun,
  buildSourceTextIndex,
  buildSourceTextTraceabilitySidecar,
  validateKnowledgeSourceCard,
  validateSourceTextAnswerRun,
  validateSourceTextIndex,
  validateSourceTextTraceabilitySidecar,
  writeSourceTextAnswerRun,
  writeSourceTextIndex,
  writeSourceTextTraceabilitySidecar,
} from "./source_text_index.mjs";
import {
  buildRagWorkCard,
  buildSourceTextQualityReview,
  validateRagWorkCard,
  validateSourceTextQualityReview,
  writeRagWorkCard,
  writeSourceTextQualityReview,
} from "./work_card.mjs";
import {
  COMPANY_KNOWLEDGE_INTAKE_PACKET_SCHEMA_VERSION,
  loadCompanyKnowledgeIntakePacket,
  validateCompanyKnowledgeIntakePacket,
} from "./company_knowledge_intake_packet.mjs";
import {
  SOURCE_SYNC_READY_MANIFEST_SCHEMA_VERSION,
  validateSourceSyncReadyManifest,
} from "./source_sync_ready_manifest.mjs";
import {
  OPERATIONAL_ROUTE_CLOSEOUT_SCHEMA_VERSION,
  buildOperationalRouteCandidateRecord,
  buildOperationalRouteCallPlan,
  buildOperationalRouteCatalog,
  buildOperationalRouteCloseout,
  buildOperationalRouteCommandSheet,
  buildOperationalRouteDashboard,
  buildOperationalRouteEvidenceSweep,
  buildOperationalRouteLatestEvidence,
  buildOperationalRouteOperatorBrief,
  buildOperationalRouteOperatorDocDriftCheck,
  buildOperationalRouteOperatorHealth,
  buildOperationalRouteOpsCheck,
  buildOperationalRoutePreflight,
  buildOperationalRouteReadiness,
  buildOperationalRouteReviewGate,
  buildOperationalRouteSuggestionSafety,
  buildOperationalRouteSession,
  buildOperationalRouteSessionSweep,
  buildOperationalRouteStatus,
  buildOperationalRouteUsageRecord,
  buildOperationalRouteUsageSummary,
  loadOperationalRouteCandidateRecord,
  loadOperationalRouteCallPlan,
  loadOperationalRouteEvidenceSweep,
  loadOperationalRouteLatestEvidence,
  loadOperationalRouteOperatorBrief,
  loadOperationalRouteOperatorDocDriftCheck,
  loadOperationalRouteOperatorHealth,
  loadOperationalRouteOpsCheck,
  loadOperationalRoutePreflight,
  loadOperationalRouteReadiness,
  loadOperationalRouteSuggestionSafety,
  loadOperationalRouteSession,
  loadOperationalRouteSessionSweep,
  loadOperationalRouteStatus,
  loadOperationalRouteUsageRecord,
  loadOperationalRouteUsageSummary,
  renderOperationalRouteSessionDigest,
  renderOperationalRouteSessionSweepText,
  renderOperationalRouteUsageRecordText,
  renderOperationalRouteUsageSummaryText,
  renderOperationalRouteCallPlanText,
  renderOperationalRouteCatalogText,
  renderOperationalRouteCandidateRecordText,
  renderOperationalRouteCloseoutText,
  renderOperationalRouteCommandSheetText,
  renderOperationalRouteDashboardText,
  renderOperationalRouteEvidenceSweepText,
  renderOperationalRouteLatestEvidenceText,
  renderOperationalRouteOperatorRun,
  renderOperationalRouteOperatorBriefText,
  renderOperationalRouteOperatorDocDriftText,
  renderOperationalRouteOperatorHealthText,
  renderOperationalRouteOpsCheckText,
  renderOperationalRoutePreflightText,
  renderOperationalRouteReadinessText,
  renderOperationalRouteReviewGateText,
  renderOperationalRouteSuggestionSafetyText,
  renderOperationalRouteStatusDigest,
  renderOperationalRouteAnswerShell,
  renderOperationalRouteResolutionText,
  resolveOperationalRoute,
  runOperationalRouteSmokeTests,
  validateOperationalRouteAnswerCards,
  validateOperationalRouteCallPlan,
  validateOperationalRouteCloseout,
  validateOperationalRouteCommandSheet,
  validateOperationalRouteEvidenceSweep,
  validateOperationalRouteLatestEvidence,
  validateOperationalRouteOperatorBrief,
  validateOperationalRouteOperatorDocDriftCheck,
  validateOperationalRouteOperatorHealth,
  validateOperationalRouteOpsCheck,
  validateOperationalRoutePreflight,
  validateOperationalRouteReadiness,
  validateOperationalRouteSuggestionSafety,
  validateOperationalRouteRegistry,
  validateOperationalRouteReviewGate,
  validateOperationalRouteSession,
  validateOperationalRouteSessionSweep,
  validateOperationalRouteCandidateRecord,
  validateOperationalRouteDashboard,
  validateOperationalRouteStatus,
  validateOperationalRouteUsageRecord,
  validateOperationalRouteUsageSummary,
  writeOperationalRouteCandidateRecord,
  writeOperationalRouteCallPlan,
  writeOperationalRouteEvidenceSweep,
  writeOperationalRouteLatestEvidence,
  writeOperationalRouteOperatorBrief,
  writeOperationalRouteOperatorDocDriftCheck,
  writeOperationalRouteOperatorHealth,
  writeOperationalRouteOpsCheck,
  writeOperationalRoutePreflight,
  writeOperationalRouteReadiness,
  writeOperationalRouteSuggestionSafety,
  writeOperationalRouteSession,
  writeOperationalRouteSessionSweep,
  writeOperationalRouteStatus,
  writeOperationalRouteUsageRecord,
  writeOperationalRouteUsageSummary,
} from "./operational_route.mjs";

test("metadata-only RAG manifest validates and answers from graph metadata", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-"));
  try {
    await writeFixtureRepo(repoRoot);
    const graphResult = await exportKnowledgeGraph({
      repoRoot,
      exportId: "fixture_graph",
      now: "2026-05-24T01:00:00Z",
    });

    const manifest = await buildRagManifest({
      repoRoot,
      graphRef: graphResult.graph_ref,
      manifestId: "fixture_manifest",
      now: "2026-05-24T02:00:00Z",
    });

    assert.equal(manifest.schema_version, "soulforge.rag_manifest.v0");
    assert.equal(manifest.boundary.metadata_only, true);
    assert.equal(manifest.boundary.source_payloads_included, false);
    assert.equal(manifest.boundary.chunk_text_included, false);
    assert.equal(manifest.boundary.notebooklm_answers_included, false);
    assert.equal(manifest.scope.source_surfaces.includes("explicit_rag_manifest_refs"), false);
    assert.ok(manifest.lens_profiles.some((profile) => profile.lens_id === "rag_knowledge_readiness"));
    assert.ok(manifest.retrieval_units.some((unit) => unit.graph_node_ref === ".registry/knowledge/graph_rag"));
    assert.ok(manifest.graph_bindings.some((binding) => binding.relation_type === "uses"));
    assert.equal(validateRagManifest(manifest).status, "pass");
    const graphRagUnit = manifest.retrieval_units.find((unit) => unit.graph_node_ref === ".registry/knowledge/graph_rag");

    const writeResult = await writeRagManifest({
      repoRoot,
      graphRef: graphResult.graph_ref,
      manifestId: "fixture_manifest_written",
      outputRef: "_workspaces/system/rag/manifests/fixture_manifest_written/rag_manifest.json",
      now: "2026-05-24T02:00:00Z",
    });
    assert.equal(writeResult.status, "written");
    assert.equal(writeResult.retrieval_unit_count, manifest.retrieval_units.length);

    const localWriteResult = await writeRagManifest({
      repoRoot,
      graphRef: graphResult.graph_ref,
      manifestId: "fixture_manifest_local",
      outputRef: "_workspaces/_local/pc-fixture/system/rag/manifests/fixture_manifest_local/rag_manifest.json",
      now: "2026-05-24T02:00:00Z",
    });
    assert.equal(
      localWriteResult.manifest_ref,
      "_workspaces/_local/pc-fixture/system/rag/manifests/fixture_manifest_local/rag_manifest.json",
    );

    const sourceSliceCards = await buildSourceSliceCards({
      repoRoot,
      manifest,
      manifestRef: "_workspaces/system/rag/manifests/fixture_manifest_written/rag_manifest.json",
      sliceSetId: "fixture_source_slices",
      now: "2026-05-24T02:30:00Z",
    });
    assert.equal(sourceSliceCards.schema_version, "soulforge.source_slice_card_set.v0");
    assert.equal(sourceSliceCards.boundary.metadata_only, true);
    assert.equal(sourceSliceCards.boundary.source_payloads_included, false);
    assert.equal(sourceSliceCards.boundary.chunk_payloads_included, false);
    assert.equal(sourceSliceCards.boundary.embeddings_included, false);
    assert.equal(sourceSliceCards.boundary.bm25_index_included, false);
    assert.equal(sourceSliceCards.boundary.vector_index_included, false);
    assert.equal(sourceSliceCards.cards.length, manifest.sources.length);
    assert.equal(validateSourceSliceCards(sourceSliceCards).status, "pass");
    const graphRagSourceHandle = graphRagUnit.source_handles[0];
    const graphRagSlice = sourceSliceCards.cards.find((card) => card.source_handle === graphRagSourceHandle);
    assert.ok(graphRagSlice);
    assert.equal(graphRagSlice.card_schema_version, "soulforge.source_slice_card.v0");
    assert.equal(graphRagSlice.source_access.source_text_loaded, false);
    assert.equal(graphRagSlice.index_readiness.allowed_for_index_build, false);
    assert.ok(graphRagSlice.blocker_codes.includes("owner_source_slice_approval_required"));
    assert.ok(graphRagSlice.covered_graph_node_refs.includes(".registry/knowledge/graph_rag"));
    const sourceSliceJson = JSON.stringify(sourceSliceCards);
    assert.doesNotMatch(
      sourceSliceJson,
      /"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|"embedding"\s*:|"bm25"\s*:|"vector_payload"\s*:|"notebooklm_answer"\s*:|\/Users\/|\/Volumes\//,
    );

    const sourceSliceWriteResult = await writeSourceSliceCards({
      repoRoot,
      manifest,
      sliceSetId: "fixture_source_slices_written",
      outputRef: "_workspaces/system/rag/source_slice_cards/fixture_source_slices_written/source_slice_cards.json",
      now: "2026-05-24T02:30:00Z",
    });
    assert.equal(sourceSliceWriteResult.status, "written");
    assert.equal(sourceSliceWriteResult.card_count, sourceSliceCards.cards.length);
    const writtenSourceSliceCards = JSON.parse(await readFile(path.join(repoRoot, sourceSliceWriteResult.source_slice_ref), "utf8"));
    assert.equal(validateSourceSliceCards(writtenSourceSliceCards).status, "pass");

    const localSourceSliceWriteResult = await writeSourceSliceCards({
      repoRoot,
      manifest,
      sliceSetId: "fixture_source_slices_local",
      outputRef: "_workspaces/_local/pc-fixture/system/rag/source_slice_cards/fixture_source_slices_local/source_slice_cards.json",
      now: "2026-05-24T02:30:00Z",
    });
    assert.equal(
      localSourceSliceWriteResult.source_slice_ref,
      "_workspaces/_local/pc-fixture/system/rag/source_slice_cards/fixture_source_slices_local/source_slice_cards.json",
    );

    const triageRegister = await buildSourceSliceTriageRegister({
      repoRoot,
      cardSet: sourceSliceCards,
      sourceSliceRef: "_workspaces/system/rag/source_slice_cards/fixture_source_slices_written/source_slice_cards.json",
      registerId: "fixture_source_slice_triage_register",
      now: "2026-05-24T02:35:00Z",
    });
    assert.equal(triageRegister.schema_version, "soulforge.source_slice_triage_register.v0");
    assert.equal(triageRegister.boundary.metadata_only, true);
    assert.equal(triageRegister.boundary.register_is_not_owner_approval, true);
    assert.equal(triageRegister.boundary.source_text_retrieval_allowed, false);
    assert.equal(triageRegister.boundary.index_build_allowed, false);
    assert.equal(triageRegister.triage_policy.standing_owner_policy.owner_defined_criteria_are_policy, true);
    assert.equal(triageRegister.triage_policy.standing_owner_policy.auto_register_passed_metadata, true);
    assert.equal(triageRegister.triage_policy.standing_owner_policy.stronger_permissions_default_false, true);
    assert.equal(triageRegister.triage_policy.standing_owner_policy.grants.metadata_knowledge, true);
    assert.equal(triageRegister.triage_policy.standing_owner_policy.grants.source_text_retrieval, false);
    assert.equal(triageRegister.triage_policy.standing_owner_policy.grants.index_build, false);
    assert.equal(triageRegister.triage_policy.standing_owner_policy.grants.notebooklm_packet, false);
    assert.equal(triageRegister.triage_policy.standing_owner_policy.grants.public_canon, false);
    assert.equal(triageRegister.counts.registered_count, sourceSliceCards.cards.length);
    assert.equal(triageRegister.counts.owner_review_count, 0);
    assert.equal(triageRegister.counts.blocked_count, 0);
    assert.equal(validateSourceSliceTriageRegister(triageRegister).status, "pass");
    const graphRagTriageItem = triageRegister.registered_items.find((item) => item.source_handle === graphRagSourceHandle);
    assert.ok(graphRagTriageItem);
    assert.equal(graphRagTriageItem.criteria_result.result, "accepted_for_metadata_knowledge");
    assert.equal(graphRagTriageItem.criteria_result.route, "registered_metadata_knowledge");
    assert.equal(graphRagTriageItem.criteria_result.boundary_contract.allowed_for_rag_metadata_answer, true);
    assert.equal(graphRagTriageItem.criteria_result.boundary_contract.allowed_for_source_text_retrieval, false);
    assert.equal(graphRagTriageItem.criteria_result.boundary_contract.allowed_for_index_build, false);
    assert.equal(graphRagTriageItem.criteria_result.boundary_contract.public_canon_promotion_allowed, false);
    const triageRegisterJson = JSON.stringify(triageRegister);
    assert.doesNotMatch(
      triageRegisterJson,
      /"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|"embedding"\s*:|"bm25"\s*:|"vector_payload"\s*:|"notebooklm_answer"\s*:|\/Users\/|\/Volumes\//,
    );

    const triageRegisterWriteResult = await writeSourceSliceTriageRegister({
      repoRoot,
      cardSet: sourceSliceCards,
      registerId: "fixture_source_slice_triage_register_written",
      now: "2026-05-24T02:36:00Z",
    });
    assert.equal(triageRegisterWriteResult.status, "written");
    assert.equal(
      triageRegisterWriteResult.triage_register_ref,
      "_workmeta/system/reports/rag/source_slice_triage_register/fixture_source_slice_triage_register_written/source_slice_triage_register.json",
    );
    assert.equal(triageRegisterWriteResult.registered_count, sourceSliceCards.cards.length);
    const writtenTriageRegister = JSON.parse(await readFile(path.join(repoRoot, triageRegisterWriteResult.triage_register_ref), "utf8"));
    assert.equal(validateSourceSliceTriageRegister(writtenTriageRegister).status, "pass");

    const filteredReviewQueue = await buildSourceSliceReviewQueue({
      repoRoot,
      triageRegister,
      triageRegisterRef: "_workmeta/system/reports/rag/source_slice_triage_register/fixture_source_slice_triage_register_written/source_slice_triage_register.json",
      queueId: "fixture_filtered_review_queue",
      now: "2026-05-24T02:38:00Z",
    });
    assert.equal(filteredReviewQueue.items.length, 0);
    assert.equal(filteredReviewQueue.counts.card_count, sourceSliceCards.cards.length);
    assert.equal(filteredReviewQueue.source_refs.register_id, "fixture_source_slice_triage_register");
    assert.equal(filteredReviewQueue.review_policy.purpose, "owner_source_slice_decision_preparation_for_triage_holds");
    assert.equal(validateSourceSliceReviewQueue(filteredReviewQueue).status, "pass");

    const filteredReviewQueueWriteResult = await writeSourceSliceReviewQueue({
      repoRoot,
      triageRegister,
      queueId: "fixture_filtered_review_queue_written",
      now: "2026-05-24T02:39:00Z",
    });
    assert.equal(filteredReviewQueueWriteResult.status, "written");
    assert.equal(filteredReviewQueueWriteResult.item_count, 0);

    const decisionPacket = await buildSourceSliceDecisionPacket({
      repoRoot,
      triageRegister,
      reviewQueue: filteredReviewQueue,
      triageRegisterRef: "_workmeta/system/reports/rag/source_slice_triage_register/fixture_source_slice_triage_register_written/source_slice_triage_register.json",
      reviewQueueRef: "_workmeta/system/reports/rag/source_slice_review_queue/fixture_filtered_review_queue_written/source_slice_review_queue.json",
      packetId: "fixture_source_slice_decision_packet",
      now: "2026-05-24T02:43:00Z",
    });
    assert.equal(decisionPacket.schema_version, "soulforge.source_slice_decision_packet.v0");
    assert.equal(decisionPacket.boundary.metadata_only, true);
    assert.equal(decisionPacket.boundary.packet_is_not_owner_approval, true);
    assert.equal(decisionPacket.boundary.packet_applies_no_decisions, true);
    assert.equal(decisionPacket.boundary.stronger_permissions_default_false, true);
    assert.equal(decisionPacket.boundary.source_text_retrieval_allowed, false);
    assert.equal(decisionPacket.boundary.index_build_allowed, false);
    assert.equal(decisionPacket.counts.decision_item_count, triageRegister.registered_items.length);
    assert.equal(decisionPacket.counts.metadata_registered_count, triageRegister.registered_items.length);
    assert.equal(decisionPacket.counts.owner_review_count, 0);
    assert.equal(decisionPacket.counts.blocked_count, 0);
    assert.equal(validateSourceSliceDecisionPacket(decisionPacket).status, "pass");
    const graphRagDecisionItem = decisionPacket.items.find((item) => item.source_handle === graphRagSourceHandle);
    assert.ok(graphRagDecisionItem);
    assert.equal(graphRagDecisionItem.decision_route, "registered_metadata_stronger_permission_review");
    assert.equal(graphRagDecisionItem.current_rag_metadata_answer_allowed, true);
    assert.equal(graphRagDecisionItem.pending_decision.status, "pending_owner_decision");
    assert.equal(graphRagDecisionItem.pending_decision.applied_decision, "none");
    assert.equal(graphRagDecisionItem.pending_decision.default_decision, "keep_metadata_only");
    assert.equal(graphRagDecisionItem.pending_decision.source_text_retrieval_allowed, false);
    assert.equal(graphRagDecisionItem.pending_decision.index_build_allowed, false);
    assert.equal(graphRagDecisionItem.pending_decision.notebooklm_packet_allowed, false);
    assert.equal(graphRagDecisionItem.pending_decision.public_canon_promotion_allowed, false);
    const decisionPacketJson = JSON.stringify(decisionPacket);
    assert.doesNotMatch(
      decisionPacketJson,
      /"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|"embedding"\s*:|"bm25"\s*:|"vector_payload"\s*:|"notebooklm_answer"\s*:|\/Users\/|\/Volumes\//,
    );

    const decisionPacketWriteResult = await writeSourceSliceDecisionPacket({
      repoRoot,
      triageRegister,
      reviewQueue: filteredReviewQueue,
      packetId: "fixture_source_slice_decision_packet_written",
      now: "2026-05-24T02:44:00Z",
    });
    assert.equal(decisionPacketWriteResult.status, "written");
    assert.equal(
      decisionPacketWriteResult.decision_packet_ref,
      "_workmeta/system/reports/rag/source_slice_decision_packets/fixture_source_slice_decision_packet_written/source_slice_decision_packet.json",
    );
    const writtenDecisionPacket = JSON.parse(await readFile(path.join(repoRoot, decisionPacketWriteResult.decision_packet_ref), "utf8"));
    assert.equal(validateSourceSliceDecisionPacket(writtenDecisionPacket).status, "pass");

    const ownerDecisionRecord = await buildSourceSliceOwnerDecisionRecord({
      repoRoot,
      decisionPacket,
      decisionPacketRef: decisionPacketWriteResult.decision_packet_ref,
      recordId: "fixture_source_owner_decision_record",
      now: "2026-05-24T02:46:00Z",
    });
    assert.equal(ownerDecisionRecord.schema_version, "soulforge.source_slice_owner_decision_record.v0");
    assert.equal(ownerDecisionRecord.status, "draft_no_owner_decision_applied");
    assert.equal(ownerDecisionRecord.boundary.record_is_not_owner_approval, true);
    assert.equal(ownerDecisionRecord.boundary.record_applies_no_stronger_permissions, true);
    assert.equal(ownerDecisionRecord.boundary.source_text_retrieval_allowed, false);
    assert.equal(ownerDecisionRecord.boundary.index_build_allowed, false);
    assert.equal(ownerDecisionRecord.counts.stronger_permission_grant_count, 0);
    assert.equal(ownerDecisionRecord.items.length, decisionPacket.items.length);
    assert.equal(validateSourceSliceOwnerDecisionRecord(ownerDecisionRecord).status, "pass");
    const ownerDecisionRecordJson = JSON.stringify(ownerDecisionRecord);
    assert.doesNotMatch(
      ownerDecisionRecordJson,
      /"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|"embedding"\s*:|"bm25"\s*:|"vector_payload"\s*:|"notebooklm_answer"\s*:|\/Users\/|\/Volumes\//,
    );

    const ownerDecisionWriteResult = await writeSourceSliceOwnerDecisionRecord({
      repoRoot,
      decisionPacket,
      recordId: "fixture_source_owner_decision_record_written",
      now: "2026-05-24T02:47:00Z",
    });
    assert.equal(ownerDecisionWriteResult.status, "written");
    assert.equal(
      ownerDecisionWriteResult.owner_decision_record_ref,
      "_workmeta/system/reports/rag/source_slice_owner_decisions/fixture_source_owner_decision_record_written/source_slice_owner_decision_record.json",
    );
    const writtenOwnerDecisionRecord = JSON.parse(
      await readFile(path.join(repoRoot, ownerDecisionWriteResult.owner_decision_record_ref), "utf8"),
    );
    assert.equal(validateSourceSliceOwnerDecisionRecord(writtenOwnerDecisionRecord).status, "pass");

    const metadataIndex = await buildRagMetadataIndex({
      repoRoot,
      manifest,
      manifestRef: "_workspaces/system/rag/manifests/fixture_manifest_written/rag_manifest.json",
      decisionPacket,
      ownerDecisionRecord,
      decisionPacketRef: decisionPacketWriteResult.decision_packet_ref,
      ownerDecisionRecordRef: ownerDecisionWriteResult.owner_decision_record_ref,
      indexId: "fixture_metadata_index",
      now: "2026-05-24T02:48:00Z",
    });
    assert.equal(metadataIndex.schema_version, "soulforge.rag_metadata_index.v0");
    assert.equal(metadataIndex.boundary.metadata_only, true);
    assert.equal(metadataIndex.boundary.metadata_index_only, true);
    assert.equal(metadataIndex.boundary.source_text_loaded, false);
    assert.equal(metadataIndex.boundary.source_text_index_build_allowed, false);
    assert.equal(metadataIndex.counts.indexed_document_count, manifest.retrieval_units.length);
    assert.ok(metadataIndex.lexical_index.token_postings.length > 0);
    assert.equal(validateRagMetadataIndex(metadataIndex).status, "pass");
    assert.ok(metadataIndex.lexical_index.token_postings.every((posting) => posting.token_fingerprint && !Object.hasOwn(posting, "token")));
    assert.ok(metadataIndex.documents.every((document) => !Object.hasOwn(document, "source_handles")));
    assert.ok(metadataIndex.documents.every((document) => !Object.hasOwn(document, "token_frequencies")));
    const metadataIndexJson = JSON.stringify(metadataIndex);
    assert.doesNotMatch(
      metadataIndexJson,
      /"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|"embedding"\s*:|"bm25"\s*:|"vector_payload"\s*:|"notebooklm_answer"\s*:|"source_handles"\s*:|"source_locator_ref"\s*:|"token"\s*:|\/Users\/|\/Volumes\//,
    );

    const metadataIndexWriteResult = await writeRagMetadataIndex({
      repoRoot,
      manifest,
      decisionPacket,
      ownerDecisionRecord,
      manifestRef: "_workspaces/system/rag/manifests/fixture_manifest_written/rag_manifest.json",
      decisionPacketRef: decisionPacketWriteResult.decision_packet_ref,
      ownerDecisionRecordRef: ownerDecisionWriteResult.owner_decision_record_ref,
      indexId: "fixture_metadata_index_written",
      now: "2026-05-24T02:49:00Z",
    });
    assert.equal(metadataIndexWriteResult.status, "written");
    assert.equal(
      metadataIndexWriteResult.metadata_index_ref,
      "_workspaces/system/rag/metadata_retrieval_indexes/fixture_metadata_index_written/metadata_index.json",
    );
    const writtenMetadataIndex = JSON.parse(await readFile(path.join(repoRoot, metadataIndexWriteResult.metadata_index_ref), "utf8"));
    assert.equal(validateRagMetadataIndex(writtenMetadataIndex).status, "pass");

    const localMetadataIndexWriteResult = await writeRagMetadataIndex({
      repoRoot,
      manifest,
      decisionPacket,
      ownerDecisionRecord,
      manifestRef: "_workspaces/system/rag/manifests/fixture_manifest_written/rag_manifest.json",
      decisionPacketRef: decisionPacketWriteResult.decision_packet_ref,
      ownerDecisionRecordRef: ownerDecisionWriteResult.owner_decision_record_ref,
      outputRef:
        "_workspaces/_local/pc-fixture/system/rag/metadata_retrieval_indexes/fixture_metadata_index_local/metadata_index.json",
      indexId: "fixture_metadata_index_local",
      now: "2026-05-24T02:49:00Z",
    });
    assert.equal(
      localMetadataIndexWriteResult.metadata_index_ref,
      "_workspaces/_local/pc-fixture/system/rag/metadata_retrieval_indexes/fixture_metadata_index_local/metadata_index.json",
    );

    const retrievalTrace = await buildRagRetrievalTrace({
      repoRoot,
      metadataIndex,
      metadataIndexRef: metadataIndexWriteResult.metadata_index_ref,
      question: "GraphRAG source supported retrieval",
      traceId: "fixture_retrieval_trace",
      now: "2026-05-24T02:50:00Z",
    });
    assert.equal(retrievalTrace.schema_version, "soulforge.rag_retrieval_trace.v0");
    assert.equal(retrievalTrace.status, "retrieved_metadata");
    assert.equal(Object.hasOwn(retrievalTrace, "question"), false);
    assert.ok(retrievalTrace.question_fingerprint);
    assert.ok(retrievalTrace.query_token_fingerprints.length > 0);
    assert.ok(retrievalTrace.retrieved_units.some((unit) => unit.graph_node_ref === ".registry/knowledge/graph_rag"));
    assert.equal(validateRagRetrievalTrace(retrievalTrace).status, "pass");

    const retrievalTraceWriteResult = await writeRagRetrievalTrace({
      repoRoot,
      metadataIndex,
      metadataIndexRef: metadataIndexWriteResult.metadata_index_ref,
      question: "GraphRAG source supported retrieval",
      traceId: "fixture_retrieval_trace_written",
      now: "2026-05-24T02:51:00Z",
    });
    assert.equal(retrievalTraceWriteResult.status, "written");
    assert.equal(
      retrievalTraceWriteResult.retrieval_trace_ref,
      "_workmeta/system/reports/rag/retrieval_traces/fixture_retrieval_trace_written/retrieval_trace.json",
    );
    const writtenRetrievalTrace = JSON.parse(await readFile(path.join(repoRoot, retrievalTraceWriteResult.retrieval_trace_ref), "utf8"));
    assert.equal(validateRagRetrievalTrace(writtenRetrievalTrace).status, "pass");
    assert.doesNotMatch(JSON.stringify(writtenRetrievalTrace), /"question"\s*:|GraphRAG source supported retrieval|"source_handles"\s*:|\/Users\/|\/Volumes\//);

    const retrievalEvaluation = await buildRagRetrievalEvaluation({
      repoRoot,
      metadataIndex,
      metadataIndexRef: metadataIndexWriteResult.metadata_index_ref,
      evaluationId: "fixture_retrieval_evaluation",
      now: "2026-05-24T02:52:00Z",
    });
    assert.equal(retrievalEvaluation.schema_version, "soulforge.rag_retrieval_evaluation.v0");
    assert.equal(retrievalEvaluation.boundary.evaluation_is_smoke_not_quality_benchmark, true);
    assert.ok(retrievalEvaluation.counts.case_count > 0);
    assert.equal(retrievalEvaluation.status, "pass");
    assert.ok(retrievalEvaluation.cases.every((item) => !Object.hasOwn(item, "question")));
    assert.equal(validateRagRetrievalEvaluation(retrievalEvaluation).status, "pass");

    const retrievalEvaluationWriteResult = await writeRagRetrievalEvaluation({
      repoRoot,
      metadataIndex,
      metadataIndexRef: metadataIndexWriteResult.metadata_index_ref,
      evaluationId: "fixture_retrieval_evaluation_written",
      now: "2026-05-24T02:53:00Z",
    });
    assert.equal(retrievalEvaluationWriteResult.status, "written");
    assert.equal(
      retrievalEvaluationWriteResult.retrieval_evaluation_ref,
      "_workmeta/system/reports/rag/retrieval_evaluations/fixture_retrieval_evaluation_written/retrieval_evaluation.json",
    );
    const writtenRetrievalEvaluation = JSON.parse(
      await readFile(path.join(repoRoot, retrievalEvaluationWriteResult.retrieval_evaluation_ref), "utf8"),
    );
    assert.equal(validateRagRetrievalEvaluation(writtenRetrievalEvaluation).status, "pass");
    assert.doesNotMatch(JSON.stringify(writtenRetrievalEvaluation), /"question"\s*:|\/Users\/|\/Volumes\//);

    const indexedAnswer = await answerFromRagManifest({
      repoRoot,
      question: "GraphRAG source supported retrieval",
      metadataIndex,
      metadataIndexRef: metadataIndexWriteResult.metadata_index_ref,
      maxUnits: 3,
    });
    assert.equal(indexedAnswer.schema_version, "soulforge.rag_answer.v0");
    assert.equal(indexedAnswer.status, "metadata_index_answer");
    assert.equal(indexedAnswer.boundary.metadata_index_only, true);
    assert.equal(indexedAnswer.retrieval_trace.retrieved_unit_count > 0, true);
    assert.ok(indexedAnswer.retrieved_units.some((unit) => unit.graph_node_ref === ".registry/knowledge/graph_rag"));
    assert.equal(Object.hasOwn(indexedAnswer, "question"), false);
    assert.equal(indexedAnswer.raw_question_persisted, false);
    assert.ok(indexedAnswer.question_fingerprint);
    assert.equal(validateRagAnswer(indexedAnswer).status, "pass");
    assert.equal(JSON.stringify(indexedAnswer).includes("GraphRAG source supported retrieval"), false);

    const ownerDecisionRecordWithGrant = validateSourceSliceOwnerDecisionRecord({
      ...ownerDecisionRecord,
      items: [
        {
          ...ownerDecisionRecord.items[0],
          owner_approval_granted: true,
          source_text_retrieval_allowed: true,
          index_build_allowed: true,
        },
      ],
    });
    assert.equal(ownerDecisionRecordWithGrant.status, "blocked");
    assert.ok(ownerDecisionRecordWithGrant.blockers.includes("owner_decision_item_owner_approval_must_not_be_granted"));
    assert.ok(ownerDecisionRecordWithGrant.blockers.includes("owner_decision_item_source_text_retrieval_must_not_be_allowed"));
    assert.ok(ownerDecisionRecordWithGrant.blockers.includes("owner_decision_item_index_build_must_not_be_allowed"));

    const metadataIndexWithSourceHandles = validateRagMetadataIndex({
      ...metadataIndex,
      documents: [
        {
          ...metadataIndex.documents[0],
          source_handles: ["source_should_not_persist"],
        },
      ],
    });
    assert.equal(metadataIndexWithSourceHandles.status, "blocked");
    assert.ok(metadataIndexWithSourceHandles.blockers.includes("metadata_index_document_source_handles_must_not_be_persisted"));

    const retrievalTraceWithQuestion = validateRagRetrievalTrace({
      ...retrievalTrace,
      question: "raw question must not persist",
    });
    assert.equal(retrievalTraceWithQuestion.status, "blocked");
    assert.ok(retrievalTraceWithQuestion.blockers.includes("retrieval_trace_question_must_not_be_persisted"));

    const reviewQueue = await buildSourceSliceReviewQueue({
      repoRoot,
      cardSet: sourceSliceCards,
      sourceSliceRef: "_workspaces/system/rag/source_slice_cards/fixture_source_slices_written/source_slice_cards.json",
      queueId: "fixture_source_slice_review_queue",
      now: "2026-05-24T02:40:00Z",
    });
    assert.equal(reviewQueue.schema_version, "soulforge.source_slice_review_queue.v0");
    assert.equal(reviewQueue.boundary.metadata_only, true);
    assert.equal(reviewQueue.boundary.queue_is_not_owner_approval, true);
    assert.equal(reviewQueue.boundary.queue_applies_no_decisions, true);
    assert.equal(reviewQueue.boundary.source_text_retrieval_allowed, false);
    assert.equal(reviewQueue.boundary.index_build_allowed, false);
    assert.equal(reviewQueue.items.length, sourceSliceCards.cards.length);
    assert.equal(validateSourceSliceReviewQueue(reviewQueue).status, "pass");
    const graphRagReviewItem = reviewQueue.items.find((item) => item.source_handle === graphRagSourceHandle);
    assert.ok(graphRagReviewItem);
    assert.equal(graphRagReviewItem.status, "pending_owner_review");
    assert.equal(graphRagReviewItem.decision.applied_decision, "none");
    assert.equal(graphRagReviewItem.decision.owner_approval_granted, false);
    assert.equal(graphRagReviewItem.decision.source_text_retrieval_allowed, false);
    assert.equal(graphRagReviewItem.decision.index_build_allowed, false);
    assert.equal(graphRagReviewItem.decision.recommended_decision, "review_required");
    const reviewQueueJson = JSON.stringify(reviewQueue);
    assert.doesNotMatch(
      reviewQueueJson,
      /"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|"embedding"\s*:|"bm25"\s*:|"vector_payload"\s*:|"notebooklm_answer"\s*:|\/Users\/|\/Volumes\//,
    );

    const reviewQueueWriteResult = await writeSourceSliceReviewQueue({
      repoRoot,
      cardSet: sourceSliceCards,
      queueId: "fixture_source_slice_review_queue_written",
      now: "2026-05-24T02:41:00Z",
    });
    assert.equal(reviewQueueWriteResult.status, "written");
    assert.equal(
      reviewQueueWriteResult.review_queue_ref,
      "_workmeta/system/reports/rag/source_slice_review_queue/fixture_source_slice_review_queue_written/source_slice_review_queue.json",
    );
    const writtenReviewQueue = JSON.parse(await readFile(path.join(repoRoot, reviewQueueWriteResult.review_queue_ref), "utf8"));
    assert.equal(validateSourceSliceReviewQueue(writtenReviewQueue).status, "pass");

    const sourceSliceWithPayload = validateSourceSliceCards({
      ...sourceSliceCards,
      cards: [
        {
          ...sourceSliceCards.cards[0],
          source_text: "payload should not be allowed",
        },
      ],
    });
    assert.equal(sourceSliceWithPayload.status, "blocked");
    assert.ok(sourceSliceWithPayload.blockers.some((item) => item.startsWith("forbidden_payload_key:")));

    const sourceSliceWithUnknownField = validateSourceSliceCards({
      ...sourceSliceCards,
      cards: [
        {
          ...sourceSliceCards.cards[0],
          index_payload: { term: "not allowed" },
        },
      ],
    });
    assert.equal(sourceSliceWithUnknownField.status, "blocked");
    assert.ok(sourceSliceWithUnknownField.blockers.some((item) => item.startsWith("source_slice_disallowed_key:")));
    assert.ok(sourceSliceWithUnknownField.blockers.some((item) => item.startsWith("source_slice_forbidden_payload_or_index_key:")));

    const reviewQueueWithPayload = validateSourceSliceReviewQueue({
      ...reviewQueue,
      items: [
        {
          ...reviewQueue.items[0],
          source_text: "payload should not be allowed",
        },
      ],
    });
    assert.equal(reviewQueueWithPayload.status, "blocked");
    assert.ok(reviewQueueWithPayload.blockers.some((item) => item.startsWith("source_slice_review_queue_disallowed_key:")));
    assert.ok(reviewQueueWithPayload.blockers.some((item) => item.startsWith("source_slice_review_queue_forbidden_payload_or_index_key:")));

    const triageRegisterWithPayload = validateSourceSliceTriageRegister({
      ...triageRegister,
      registered_items: [
        {
          ...triageRegister.registered_items[0],
          source_text: "payload should not be allowed",
        },
      ],
    });
    assert.equal(triageRegisterWithPayload.status, "blocked");
    assert.ok(triageRegisterWithPayload.blockers.some((item) => item.startsWith("source_slice_triage_register_disallowed_key:")));
    assert.ok(
      triageRegisterWithPayload.blockers.some((item) =>
        item.startsWith("source_slice_triage_register_forbidden_payload_or_index_key:"),
      ),
    );

    const triageRegisterWithSourceTextDecision = validateSourceSliceTriageRegister({
      ...triageRegister,
      registered_items: [
        {
          ...triageRegister.registered_items[0],
          criteria_result: {
            ...triageRegister.registered_items[0].criteria_result,
            boundary_contract: {
              ...triageRegister.registered_items[0].criteria_result.boundary_contract,
              allowed_for_source_text_retrieval: true,
              allowed_for_index_build: true,
              applied_owner_decision: true,
              public_canon_promotion_allowed: true,
            },
          },
        },
      ],
    });
    assert.equal(triageRegisterWithSourceTextDecision.status, "blocked");
    assert.ok(triageRegisterWithSourceTextDecision.blockers.includes("triage_item_source_text_retrieval_must_not_be_allowed"));
    assert.ok(triageRegisterWithSourceTextDecision.blockers.includes("triage_item_index_build_must_not_be_allowed"));
    assert.ok(triageRegisterWithSourceTextDecision.blockers.includes("triage_item_applied_owner_decision_must_be_false"));
    assert.ok(triageRegisterWithSourceTextDecision.blockers.includes("triage_item_public_canon_promotion_must_not_be_allowed"));

    const triageRegisterWithPublicCanonPolicy = validateSourceSliceTriageRegister({
      ...triageRegister,
      triage_policy: {
        ...triageRegister.triage_policy,
        standing_owner_policy: {
          ...triageRegister.triage_policy.standing_owner_policy,
          grants: {
            ...triageRegister.triage_policy.standing_owner_policy.grants,
            public_canon: true,
          },
        },
      },
    });
    assert.equal(triageRegisterWithPublicCanonPolicy.status, "blocked");
    assert.ok(
      triageRegisterWithPublicCanonPolicy.blockers.includes("standing_owner_policy_public_canon_must_not_be_granted"),
    );

    const reviewQueueWithAppliedDecision = validateSourceSliceReviewQueue({
      ...reviewQueue,
      items: [
        {
          ...reviewQueue.items[0],
          status: "approved_for_next_phase",
          decision: {
            ...reviewQueue.items[0].decision,
            applied_decision: "approve_source_slice",
            owner_approval_granted: true,
            source_text_retrieval_allowed: true,
            index_build_allowed: true,
          },
        },
      ],
    });
    assert.equal(reviewQueueWithAppliedDecision.status, "blocked");
    assert.ok(reviewQueueWithAppliedDecision.blockers.includes("review_item_status_must_be_pending_owner_review"));
    assert.ok(reviewQueueWithAppliedDecision.blockers.includes("review_decision_applied_decision_must_be_none"));
    assert.ok(reviewQueueWithAppliedDecision.blockers.includes("review_decision_owner_approval_must_not_be_granted"));
    assert.ok(reviewQueueWithAppliedDecision.blockers.includes("review_decision_source_text_retrieval_must_not_be_allowed"));
    assert.ok(reviewQueueWithAppliedDecision.blockers.includes("review_decision_index_build_must_not_be_allowed"));

    const decisionPacketWithAppliedDecision = validateSourceSliceDecisionPacket({
      ...decisionPacket,
      items: [
        {
          ...decisionPacket.items[0],
          pending_decision: {
            ...decisionPacket.items[0].pending_decision,
            applied_decision: "approve_source_slice",
            owner_decision_ref: "_workmeta/system/reports/rag/source_slice_decision_packets/owner_decision.yaml",
            source_text_retrieval_allowed: true,
            index_build_allowed: true,
            notebooklm_packet_allowed: true,
            public_canon_promotion_allowed: true,
          },
        },
      ],
    });
    assert.equal(decisionPacketWithAppliedDecision.status, "blocked");
    assert.ok(decisionPacketWithAppliedDecision.blockers.includes("pending_decision_applied_decision_must_be_none"));
    assert.ok(decisionPacketWithAppliedDecision.blockers.includes("pending_decision_source_text_retrieval_must_not_be_allowed"));
    assert.ok(decisionPacketWithAppliedDecision.blockers.includes("pending_decision_index_build_must_not_be_allowed"));
    assert.ok(decisionPacketWithAppliedDecision.blockers.includes("pending_decision_notebooklm_packet_must_not_be_allowed"));
    assert.ok(decisionPacketWithAppliedDecision.blockers.includes("pending_decision_public_canon_promotion_must_not_be_allowed"));

    const decisionPacketWithPayload = validateSourceSliceDecisionPacket({
      ...decisionPacket,
      items: [
        {
          ...decisionPacket.items[0],
          source_text: "payload should not be allowed",
        },
      ],
    });
    assert.equal(decisionPacketWithPayload.status, "blocked");
    assert.ok(decisionPacketWithPayload.blockers.some((item) => item.startsWith("source_slice_decision_packet_disallowed_key:")));
    assert.ok(decisionPacketWithPayload.blockers.some((item) => item.startsWith("source_slice_decision_packet_forbidden_payload_or_index_key:")));

    const reviewQueueWithRuntimePathBoundary = validateSourceSliceReviewQueue({
      ...reviewQueue,
      boundary: {
        ...reviewQueue.boundary,
        runtime_absolute_paths_included: true,
      },
    });
    assert.equal(reviewQueueWithRuntimePathBoundary.status, "blocked");
    assert.ok(reviewQueueWithRuntimePathBoundary.blockers.includes("runtime_absolute_paths_must_not_be_included"));

    const cardWithApprovedString = {
      ...sourceSliceCards.cards[0],
      owner_approval: "approved",
    };
    const queueFromApprovedString = await buildSourceSliceReviewQueue({
      repoRoot,
      cardSet: {
        ...sourceSliceCards,
        cards: [cardWithApprovedString],
      },
      queueId: "fixture_approved_string_stays_pending",
    });
    assert.equal(queueFromApprovedString.items[0].owner_approval_observed, "approved");
    assert.equal(queueFromApprovedString.items[0].status, "pending_owner_review");
    assert.equal(queueFromApprovedString.items[0].decision.owner_approval_granted, false);
    assert.equal(queueFromApprovedString.items[0].decision.source_text_retrieval_allowed, false);
    assert.equal(queueFromApprovedString.items[0].decision.index_build_allowed, false);

    const sourceSliceWithAuthorizedRetrieval = validateSourceSliceCards({
      ...sourceSliceCards,
      cards: [
        {
          ...sourceSliceCards.cards[0],
          status: "ready",
          source_access: {
            ...sourceSliceCards.cards[0].source_access,
            source_text_loaded: true,
            owner_source_slice_approval_required: false,
            allowed_for_source_text_retrieval: true,
          },
          planned_processing: {
            ...sourceSliceCards.cards[0].planned_processing,
            chunking_status: "complete",
            bm25_index_status: "ready",
            vector_index_status: "ready",
            embeddings_included: true,
          },
          index_readiness: {
            status: "ready",
            allowed_for_index_build: true,
            next_owner_action: "none",
          },
          blocker_codes: [],
        },
      ],
    });
    assert.equal(sourceSliceWithAuthorizedRetrieval.status, "blocked");
    assert.ok(sourceSliceWithAuthorizedRetrieval.blockers.includes("source_slice_v0_source_text_loaded_must_be_false"));
    assert.ok(sourceSliceWithAuthorizedRetrieval.blockers.includes("source_slice_v0_source_text_retrieval_must_not_be_allowed"));
    assert.ok(sourceSliceWithAuthorizedRetrieval.blockers.includes("source_slice_v0_index_build_must_not_be_allowed"));

    const sourceSliceWithUnsafeLocator = validateSourceSliceCards({
      ...sourceSliceCards,
      cards: [
        {
          ...sourceSliceCards.cards[0],
          source_locator_ref: "https://example.com/private.docx",
        },
      ],
    });
    assert.equal(sourceSliceWithUnsafeLocator.status, "blocked");
    assert.ok(sourceSliceWithUnsafeLocator.blockers.includes("source_locator_ref_unsafe"));

    const sourceSliceWithPrivateLocatorPublicSensitivity = validateSourceSliceCards({
      ...sourceSliceCards,
      cards: [
        {
          ...sourceSliceCards.cards[0],
          source_locator_ref: "_workmeta/P00-000/reports/private_source.yaml",
          sensitivity: "public_safe_metadata",
        },
      ],
    });
    assert.equal(sourceSliceWithPrivateLocatorPublicSensitivity.status, "blocked");
    assert.ok(
      sourceSliceWithPrivateLocatorPublicSensitivity.blockers.includes("source_locator_private_requires_private_sensitivity"),
    );

    await assert.rejects(
      () =>
        writeSourceSliceCards({
          repoRoot,
          manifest,
          outputRef: "docs/source_slice_cards.json",
        }),
      /source slice card output must be under _workspaces\/system\/rag\/source_slice_cards/,
    );
    await assert.rejects(
      () =>
        writeSourceSliceReviewQueue({
          repoRoot,
          cardSet: sourceSliceCards,
          outputRef: "docs/source_slice_review_queue.json",
        }),
      /source slice review queue output must be under _workmeta/,
    );

    const privateManifest = {
      ...manifest,
      sources: [
        {
          ...manifest.sources[0],
          source_handle: "source_private_metadata",
          storage_locator: "_workmeta/P00-000/reports/private_source.yaml",
          sensitivity: "private_metadata_only",
        },
      ],
      retrieval_units: [
        {
          ...manifest.retrieval_units[0],
          source_handles: ["source_private_metadata"],
        },
      ],
    };
    await assert.rejects(
      () =>
        writeSourceSliceCards({
          repoRoot,
          manifest: privateManifest,
          sliceSetId: "fixture_private_source_slices",
        }),
      /project_code_required_for_private_source_slice_cards/,
    );
    await assert.rejects(
      () =>
        writeSourceSliceCards({
          repoRoot,
          manifest: privateManifest,
          outputRef: "_workspaces/system/rag/source_slice_cards/fixture_private_source_slices/source_slice_cards.json",
          sliceSetId: "fixture_private_source_slices",
        }),
      /private source slice cards require _workmeta/,
    );
    const privateWriteResult = await writeSourceSliceCards({
      repoRoot,
      manifest: privateManifest,
      projectCode: "P00-000",
      sliceSetId: "fixture_private_source_slices",
      now: "2026-05-24T02:31:00Z",
    });
    assert.equal(
      privateWriteResult.source_slice_ref,
      "_workmeta/P00-000/reports/rag/source_slice_cards/fixture_private_source_slices/source_slice_cards.json",
    );
    const privateCardSet = JSON.parse(await readFile(path.join(repoRoot, privateWriteResult.source_slice_ref), "utf8"));
    await assert.rejects(
      () =>
        writeSourceSliceTriageRegister({
          repoRoot,
          cardSet: privateCardSet,
          registerId: "fixture_private_triage_register",
        }),
      /project_code_required_for_private_source_slice_cards/,
    );
    await assert.rejects(
      () =>
        writeSourceSliceTriageRegister({
          repoRoot,
          cardSet: privateCardSet,
          outputRef: "_workmeta/system/reports/rag/source_slice_triage_register/fixture_private_triage_register/source_slice_triage_register.json",
          registerId: "fixture_private_triage_register",
        }),
      /private source slice triage register requires _workmeta/,
    );
    const privateTriageRegisterWriteResult = await writeSourceSliceTriageRegister({
      repoRoot,
      cardSet: privateCardSet,
      projectCode: "P00-000",
      registerId: "fixture_private_triage_register",
      now: "2026-05-24T02:37:00Z",
    });
    assert.equal(
      privateTriageRegisterWriteResult.triage_register_ref,
      "_workmeta/P00-000/reports/rag/source_slice_triage_register/fixture_private_triage_register/source_slice_triage_register.json",
    );
    const privateTriageRegister = JSON.parse(
      await readFile(path.join(repoRoot, privateTriageRegisterWriteResult.triage_register_ref), "utf8"),
    );
    assert.equal(privateTriageRegister.registered_items.length, 0);
    assert.equal(privateTriageRegister.owner_review_items.length, 1);
    assert.equal(privateTriageRegister.owner_review_items[0].criteria_result.route, "owner_review_required");
    assert.equal(validateSourceSliceTriageRegister(privateTriageRegister).status, "pass");
    const privateFilteredReviewQueueWriteResult = await writeSourceSliceReviewQueue({
      repoRoot,
      triageRegister: privateTriageRegister,
      projectCode: "P00-000",
      queueId: "fixture_private_filtered_review_queue",
      now: "2026-05-24T02:38:00Z",
    });
    assert.equal(
      privateFilteredReviewQueueWriteResult.review_queue_ref,
      "_workmeta/P00-000/reports/rag/source_slice_review_queue/fixture_private_filtered_review_queue/source_slice_review_queue.json",
    );
    const privateFilteredReviewQueue = JSON.parse(
      await readFile(path.join(repoRoot, privateFilteredReviewQueueWriteResult.review_queue_ref), "utf8"),
    );
    assert.equal(privateFilteredReviewQueue.items.length, 1);
    assert.equal(privateFilteredReviewQueue.items[0].triage_route, "owner_review_required");
    assert.equal(privateFilteredReviewQueue.items[0].decision.recommended_decision, "private_review_required");
    assert.equal(validateSourceSliceReviewQueue(privateFilteredReviewQueue).status, "pass");
    await assert.rejects(
      () =>
        writeSourceSliceDecisionPacket({
          repoRoot,
          triageRegister: privateTriageRegister,
          reviewQueue: privateFilteredReviewQueue,
          packetId: "fixture_private_decision_packet",
        }),
      /project_code_required_for_private_source_slice_cards/,
    );
    await assert.rejects(
      () =>
        writeSourceSliceDecisionPacket({
          repoRoot,
          triageRegister: privateTriageRegister,
          reviewQueue: privateFilteredReviewQueue,
          outputRef: "_workmeta/system/reports/rag/source_slice_decision_packets/fixture_private_decision_packet/source_slice_decision_packet.json",
          packetId: "fixture_private_decision_packet",
        }),
      /private source slice decision packet requires _workmeta/,
    );
    const privateDecisionPacketWriteResult = await writeSourceSliceDecisionPacket({
      repoRoot,
      triageRegister: privateTriageRegister,
      reviewQueue: privateFilteredReviewQueue,
      projectCode: "P00-000",
      packetId: "fixture_private_decision_packet",
      now: "2026-05-24T02:45:00Z",
    });
    assert.equal(
      privateDecisionPacketWriteResult.decision_packet_ref,
      "_workmeta/P00-000/reports/rag/source_slice_decision_packets/fixture_private_decision_packet/source_slice_decision_packet.json",
    );
    const privateDecisionPacket = JSON.parse(
      await readFile(path.join(repoRoot, privateDecisionPacketWriteResult.decision_packet_ref), "utf8"),
    );
    assert.equal(privateDecisionPacket.items.length, 1);
    assert.equal(privateDecisionPacket.items[0].decision_route, "owner_review_required");
    assert.equal(privateDecisionPacket.items[0].pending_decision.default_decision, "hold_for_owner_review");
    assert.equal(validateSourceSliceDecisionPacket(privateDecisionPacket).status, "pass");
    await assert.rejects(
      () =>
        writeSourceSliceOwnerDecisionRecord({
          repoRoot,
          decisionPacket: privateDecisionPacket,
          recordId: "fixture_private_owner_decision_record",
        }),
      /project_code_required_for_private_source_slice_cards/,
    );
    await assert.rejects(
      () =>
        writeSourceSliceOwnerDecisionRecord({
          repoRoot,
          decisionPacket: privateDecisionPacket,
          outputRef: "_workmeta/system/reports/rag/source_slice_owner_decisions/fixture_private_owner_decision_record/source_slice_owner_decision_record.json",
          recordId: "fixture_private_owner_decision_record",
        }),
      /private source slice owner decision record requires _workmeta/,
    );
    const privateOwnerDecisionRecordWriteResult = await writeSourceSliceOwnerDecisionRecord({
      repoRoot,
      decisionPacket: privateDecisionPacket,
      projectCode: "P00-000",
      recordId: "fixture_private_owner_decision_record",
      now: "2026-05-24T02:46:00Z",
    });
    assert.equal(
      privateOwnerDecisionRecordWriteResult.owner_decision_record_ref,
      "_workmeta/P00-000/reports/rag/source_slice_owner_decisions/fixture_private_owner_decision_record/source_slice_owner_decision_record.json",
    );
    const privateOwnerDecisionRecord = JSON.parse(
      await readFile(path.join(repoRoot, privateOwnerDecisionRecordWriteResult.owner_decision_record_ref), "utf8"),
    );
    assert.equal(validateSourceSliceOwnerDecisionRecord(privateOwnerDecisionRecord).status, "pass");
    await assert.rejects(
      () =>
        writeRagMetadataIndex({
          repoRoot,
          manifest: privateManifest,
          decisionPacket: privateDecisionPacket,
          ownerDecisionRecord: privateOwnerDecisionRecord,
          indexId: "fixture_private_metadata_index",
        }),
      /project_code_required_for_private_source_slice_cards/,
    );
    await assert.rejects(
      () =>
        writeRagMetadataIndex({
          repoRoot,
          manifest: privateManifest,
          decisionPacket: privateDecisionPacket,
          ownerDecisionRecord: privateOwnerDecisionRecord,
          outputRef: "_workspaces/system/rag/metadata_retrieval_indexes/fixture_private_metadata_index/metadata_index.json",
          indexId: "fixture_private_metadata_index",
        }),
      /private rag metadata index requires _workmeta/,
    );
    const privateMetadataIndexWriteResult = await writeRagMetadataIndex({
      repoRoot,
      manifest: privateManifest,
      decisionPacket: privateDecisionPacket,
      ownerDecisionRecord: privateOwnerDecisionRecord,
      projectCode: "P00-000",
      indexId: "fixture_private_metadata_index",
      now: "2026-05-24T02:49:00Z",
    });
    assert.equal(
      privateMetadataIndexWriteResult.metadata_index_ref,
      "_workmeta/P00-000/reports/rag/metadata_retrieval_indexes/fixture_private_metadata_index/metadata_index.json",
    );
    const privateMetadataIndex = JSON.parse(await readFile(path.join(repoRoot, privateMetadataIndexWriteResult.metadata_index_ref), "utf8"));
    assert.equal(validateRagMetadataIndex(privateMetadataIndex).status, "pass");
    assert.equal(privateMetadataIndex.counts.private_source_count, 1);
    await assert.rejects(
      () =>
        writeSourceSliceReviewQueue({
          repoRoot,
          cardSet: privateCardSet,
          queueId: "fixture_private_review_queue",
        }),
      /project_code_required_for_private_source_slice_cards/,
    );
    await assert.rejects(
      () =>
        writeSourceSliceReviewQueue({
          repoRoot,
          cardSet: privateCardSet,
          outputRef: "_workmeta/system/reports/rag/source_slice_review_queue/fixture_private_review_queue/source_slice_review_queue.json",
          queueId: "fixture_private_review_queue",
        }),
      /private source slice review queue requires _workmeta/,
    );
    const privateReviewQueueWriteResult = await writeSourceSliceReviewQueue({
      repoRoot,
      cardSet: privateCardSet,
      projectCode: "P00-000",
      queueId: "fixture_private_review_queue",
      now: "2026-05-24T02:42:00Z",
    });
    assert.equal(
      privateReviewQueueWriteResult.review_queue_ref,
      "_workmeta/P00-000/reports/rag/source_slice_review_queue/fixture_private_review_queue/source_slice_review_queue.json",
    );
    const privateReviewQueue = JSON.parse(await readFile(path.join(repoRoot, privateReviewQueueWriteResult.review_queue_ref), "utf8"));
    assert.equal(privateReviewQueue.items[0].decision.recommended_decision, "private_review_required");
    assert.equal(validateSourceSliceReviewQueue(privateReviewQueue).status, "pass");

    const mislabeledPrivateManifest = {
      ...privateManifest,
      sources: [
        {
          ...privateManifest.sources[0],
          sensitivity: "public_safe_metadata",
        },
      ],
    };
    await assert.rejects(
      () =>
        writeSourceSliceCards({
          repoRoot,
          manifest: mislabeledPrivateManifest,
          sliceSetId: "fixture_mislabeled_private_source_slices",
        }),
      /project_code_required_for_private_source_slice_cards/,
    );
    const mislabeledPrivateWriteResult = await writeSourceSliceCards({
      repoRoot,
      manifest: mislabeledPrivateManifest,
      projectCode: "P00-000",
      sliceSetId: "fixture_mislabeled_private_source_slices",
      now: "2026-05-24T02:32:00Z",
    });
    assert.equal(
      mislabeledPrivateWriteResult.source_slice_ref,
      "_workmeta/P00-000/reports/rag/source_slice_cards/fixture_mislabeled_private_source_slices/source_slice_cards.json",
    );
    const mislabeledPrivateCardSet = JSON.parse(
      await readFile(path.join(repoRoot, mislabeledPrivateWriteResult.source_slice_ref), "utf8"),
    );
    assert.equal(mislabeledPrivateCardSet.cards[0].sensitivity, "private_metadata_only");
    assert.equal(validateSourceSliceCards(mislabeledPrivateCardSet).status, "pass");

    const answer = await answerFromRagManifest({
      repoRoot,
      question: "GraphRAG source supported retrieval",
      manifest,
      maxUnits: 3,
    });
    assert.equal(answer.schema_version, "soulforge.rag_answer.v0");
    assert.equal(answer.status, "metadata_only_answer");
    assert.equal(answer.boundary.no_source_text_loaded, true);
    assert.equal(answer.boundary.no_vector_search, true);
    assert.equal(answer.boundary.no_notebooklm_answers, true);
    assert.ok(answer.retrieved_units.some((unit) => unit.graph_node_ref === ".registry/knowledge/graph_rag"));
    assert.ok(answer.citations.some((citation) => citation.ref === ".registry/knowledge/graph_rag"));
    assert.match(answer.answer, /metadata-only RAG/);
    assert.equal(Object.hasOwn(answer, "question"), false);
    assert.equal(answer.raw_question_persisted, false);
    assert.ok(answer.question_fingerprint);
    assert.ok(answer.query_token_count > 0);
    assert.ok(answer.query_token_fingerprints.length > 0);
    assert.equal(validateRagAnswer(answer).status, "pass");
    assert.equal(JSON.stringify(answer).includes("GraphRAG source supported retrieval"), false);
    assert.equal(renderAnswerText(answer).includes("GraphRAG source supported retrieval"), false);

    const answerWithRawQuestion = validateRagAnswer({
      ...answer,
      question: "GraphRAG source supported retrieval",
    });
    assert.equal(answerWithRawQuestion.status, "blocked");
    assert.ok(answerWithRawQuestion.blockers.some((item) => item.startsWith("rag_answer_forbidden_raw_or_payload_key:")));

    const answerWithPayloadFields = validateRagAnswer({
      ...answer,
      source_text: "source text must not be present",
      chunk_text: "chunk text must not be present",
      notebooklm_answer: "NotebookLM answer must not be present",
    });
    assert.equal(answerWithPayloadFields.status, "blocked");
    assert.ok(answerWithPayloadFields.blockers.some((item) => item.includes(".source_text")));
    assert.ok(answerWithPayloadFields.blockers.some((item) => item.includes(".chunk_text")));
    assert.ok(answerWithPayloadFields.blockers.some((item) => item.includes(".notebooklm_answer")));

    const answerWithUnsafeValues = validateRagAnswer({
      ...answer,
      diagnostic_ref: ["", "Volumes", "OPENCLAW_WS", "private", "company.docx"].join("/"),
      credentials: {
        api_key: ["sk", "test_123456789012345678901234"].join("-"),
      },
    });
    assert.equal(answerWithUnsafeValues.status, "blocked");
    assert.ok(answerWithUnsafeValues.blockers.some((item) => item.startsWith("rag_answer_local_absolute_path:")));
    assert.ok(answerWithUnsafeValues.blockers.some((item) => item.startsWith("rag_answer_secret_like_key:")));

    const answerWithBadShape = validateRagAnswer({
      ...answer,
      arbitrary_extra_field: "extra",
      claim_ceiling: "canon_entry",
      question_fingerprint: "not_a_hash",
      query_token_count: 99,
      query_token_fingerprints: ["abc"],
    });
    assert.equal(answerWithBadShape.status, "blocked");
    assert.ok(answerWithBadShape.blockers.includes("unknown_key:rag_answer.arbitrary_extra_field"));
    assert.ok(answerWithBadShape.blockers.includes("claim_ceiling_not_allowed_for_rag_answer"));
    assert.ok(answerWithBadShape.blockers.includes("question_fingerprint_unsafe"));
    assert.ok(answerWithBadShape.blockers.includes("query_token_fingerprint_unsafe"));
    assert.ok(answerWithBadShape.blockers.includes("query_token_count_must_match_fingerprint_count"));

    const noEvidence = await answerFromRagManifest({
      repoRoot,
      question: "zzzz unmatched query",
      manifest,
      maxUnits: 3,
    });
    assert.equal(noEvidence.status, "blocked_insufficient_manifest_evidence");
    assert.equal(noEvidence.retrieved_units.length, 0);
    const genericEvidence = await answerFromRagManifest({
      repoRoot,
      question: "source support query",
      manifest,
      maxUnits: 3,
    });
    assert.equal(genericEvidence.status, "blocked_insufficient_manifest_evidence");

    const rejectedOnly = await answerFromRagManifest({
      repoRoot,
      question: "GraphRAG source supported retrieval",
      manifest: {
        ...manifest,
        retrieval_units: [
          {
            ...graphRagUnit,
            claim_ceiling: "rejected_or_blocked",
            retrieval: {
              ...graphRagUnit.retrieval,
              status: "blocked",
              allowed_for_retrieval: false,
              blocker_code: "fixture_rejected",
            },
          },
        ],
      },
      maxUnits: 3,
    });
    assert.equal(rejectedOnly.status, "blocked_insufficient_manifest_evidence");
    assert.equal(rejectedOnly.retrieved_units.length, 0);

    const blocked = validateRagManifest({
      ...manifest,
      boundary: { ...manifest.boundary, chunk_text_included: true },
    });
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.blockers.includes("chunk_text_must_not_be_included"));

    const unsafe = validateRagManifest({
      ...manifest,
      retrieval_units: [
        {
          ...manifest.retrieval_units[0],
          summary: "raw secret payload marker from HOST_HOME_DOT_ENV",
        },
      ],
    });
    assert.equal(unsafe.status, "blocked");
    assert.ok(unsafe.blockers.some((item) => item.startsWith("unsafe_manifest_string:")));

    const unsafePayloadProse = validateRagManifest({
      ...manifest,
      retrieval_units: [
        {
          ...manifest.retrieval_units[0],
          summary: "raw mail body payload should never be accepted as metadata",
        },
      ],
    });
    assert.equal(unsafePayloadProse.status, "blocked");
    assert.ok(unsafePayloadProse.blockers.some((item) => item.startsWith("unsafe_manifest_string:")));

    const manifestWithIndexPayload = validateRagManifest({
      ...manifest,
      indexes: [
        {
          lexical_index: {
            token_postings: [],
          },
        },
      ],
    });
    assert.equal(manifestWithIndexPayload.status, "blocked");
    assert.ok(manifestWithIndexPayload.blockers.includes("manifest_indexes_must_be_empty"));
    assert.ok(manifestWithIndexPayload.blockers.some((item) => item.startsWith("rag_manifest_index_payload_not_allowed:")));

    for (const field of ["sources", "retrieval_units", "graph_bindings"]) {
      const malformed = validateRagManifest({
        ...manifest,
        [field]: {},
      });
      assert.equal(malformed.status, "blocked");
      assert.ok(malformed.blockers.includes(`${field}_must_be_array`));
    }

    const malformedHandles = validateRagManifest({
      ...manifest,
      retrieval_units: [
        {
          ...manifest.retrieval_units[0],
          source_handles: {},
        },
      ],
    });
    assert.equal(malformedHandles.status, "blocked");
    assert.ok(malformedHandles.blockers.includes("source_handles_must_be_array"));

    await assert.rejects(
      () =>
        writeRagManifest({
          repoRoot,
          graphRef: graphResult.graph_ref,
          outputRef: "docs/rag_manifest.json",
        }),
      /rag manifest output must be under _workspaces\/system\/rag/,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("blocks default RAG system outputs while system binding is planned and local", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-system-guard-"));
  try {
    await writeFixtureRepo(repoRoot);
    await writeWorkspaceSystemBinding(repoRoot, "planned");
    await mkdir(path.join(repoRoot, "_workspaces", "system"), { recursive: true });
    const graphResult = await exportKnowledgeGraph({
      repoRoot,
      exportId: "fixture_graph_local_for_guard",
      outputRoot: "_workspaces/_local/pc-fixture/system/knowledge_view",
      now: "2026-05-24T01:00:00Z",
    });

    await assert.rejects(
      () =>
        writeRagManifest({
          repoRoot,
          graphRef: graphResult.graph_ref,
          manifestId: "blocked_default_manifest",
          now: "2026-05-24T02:00:00Z",
        }),
      /workspace_system_migration_required/,
    );

    const localManifestWrite = await writeRagManifest({
      repoRoot,
      graphRef: graphResult.graph_ref,
      manifestId: "allowed_local_manifest",
      outputRef: "_workspaces/_local/pc-fixture/system/rag/manifests/allowed_local_manifest/rag_manifest.json",
      now: "2026-05-24T02:00:00Z",
    });
    assert.equal(
      localManifestWrite.manifest_ref,
      "_workspaces/_local/pc-fixture/system/rag/manifests/allowed_local_manifest/rag_manifest.json",
    );

    await assert.rejects(
      () =>
        writeSourceSliceCards({
          repoRoot,
          manifestRef: localManifestWrite.manifest_ref,
          sliceSetId: "blocked_default_source_slices",
          now: "2026-05-24T02:30:00Z",
        }),
      /workspace_system_migration_required/,
    );

    const localSourceSliceWrite = await writeSourceSliceCards({
      repoRoot,
      manifestRef: localManifestWrite.manifest_ref,
      sliceSetId: "allowed_local_source_slices",
      outputRef: "_workspaces/_local/pc-fixture/system/rag/source_slice_cards/allowed_local_source_slices/source_slice_cards.json",
      now: "2026-05-24T02:30:00Z",
    });
    assert.equal(
      localSourceSliceWrite.source_slice_ref,
      "_workspaces/_local/pc-fixture/system/rag/source_slice_cards/allowed_local_source_slices/source_slice_cards.json",
    );

    await assert.rejects(
      () =>
        writeRagMetadataIndex({
          repoRoot,
          manifestRef: localManifestWrite.manifest_ref,
          indexId: "blocked_default_metadata_index",
          now: "2026-05-24T03:00:00Z",
        }),
      /workspace_system_migration_required/,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("company knowledge intake packet validator accepts metadata-only packets and blocks raw material markers", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-company-intake-"));
  const fixtureFileUrl = ["file:", "", "", "Volumes", "company", "private.docx"].join("/");
  try {
    const packet = {
      schema_version: COMPANY_KNOWLEDGE_INTAKE_PACKET_SCHEMA_VERSION,
      kind: "company_knowledge_intake_packet",
      packet_id: "company_intake_fixture",
      packet_status: "draft",
      generated_at_utc: "2026-05-26T00:00:00Z",
      handoff: {
        origin_label: "company_pc",
        return_label: "soulforge_local",
        purpose_label: "metadata_intake",
        prepared_by_role: "owner",
      },
      boundary: {
        metadata_only: true,
        packet_is_not_owner_approval: true,
        raw_payloads_included: false,
        source_payloads_included: false,
        source_text_included: false,
        chunk_payloads_included: false,
        mail_bodies_included: false,
        attachments_included: false,
        notebooklm_answers_included: false,
        notebooklm_questions_included: false,
        notebooklm_conversation_ids_included: false,
        secrets_or_session_included: false,
        live_account_state_included: false,
        runtime_absolute_paths_included: false,
        source_text_retrieval_allowed: false,
        index_build_allowed: false,
        notebooklm_packet_allowed: false,
        public_canon_promotion_allowed: false,
      },
      question_refs: [
        {
          question_label: "question_label_001",
          question_fingerprint: "b".repeat(64),
          query_token_count: 1,
          query_token_fingerprints: ["c".repeat(32)],
        },
      ],
      sources: [
        {
          source_id: "company_private_source_001",
          source_label: "Company private metadata reference 001",
          source_ref: "_workspaces/knowledge/source_cards/company_private_source_001.source_card.json",
          source_hash: `sha256:${"a".repeat(64)}`,
          source_size_bytes: 2048,
          source_class: "company_private",
          locator_kind: "owner_label",
          locator_label: "company_private_source_001",
          approval_status: "pending_owner_review",
          permissions: {
            metadata_only: true,
            source_text_retrieval_allowed: false,
            index_build_allowed: false,
            notebooklm_packet_allowed: false,
            public_canon_promotion_allowed: false,
            attachment_access_allowed: false,
            live_account_access_allowed: false,
            secret_access_allowed: false,
            raw_payload_access_allowed: false,
          },
        },
      ],
      handoff_state: {
        claim_ceiling: "observed",
        next_action: "owner_review",
      },
    };

    const packetRef = "company_intake_packet_fixture.json";
    await writeFile(path.join(repoRoot, packetRef), `${JSON.stringify(packet, null, 2)}\n`, "utf8");
    const loadedPacket = await loadCompanyKnowledgeIntakePacket({ repoRoot, packetRef });
    assert.equal(loadedPacket.packet_id, packet.packet_id);
    assert.equal(validateCompanyKnowledgeIntakePacket(loadedPacket).status, "pass");

    const packetWithRawFields = validateCompanyKnowledgeIntakePacket({
      ...packet,
      notebooklm_answer: "NotebookLM answer must not be present",
      sources: [
        {
          ...packet.sources[0],
          source_text: "raw source text must not be present",
        },
      ],
    });
    assert.equal(packetWithRawFields.status, "blocked");
    assert.ok(packetWithRawFields.blockers.some((item) => item.includes(".notebooklm_answer")));
    assert.ok(packetWithRawFields.blockers.some((item) => item.includes(".source_text")));

    const packetWithUnsafeValue = validateCompanyKnowledgeIntakePacket({
      ...packet,
      local_diagnostic_ref: ["", "Users", "example", "company", "private.docx"].join("/"),
      credentials: {
        password: ["password", "example-secret-value"].join("="),
      },
    });
    assert.equal(packetWithUnsafeValue.status, "blocked");
    assert.ok(packetWithUnsafeValue.blockers.some((item) => item.startsWith("company_packet_local_absolute_path:")));
    assert.ok(packetWithUnsafeValue.blockers.some((item) => item.startsWith("company_packet_secret_like_key:")));

    const packetWithStrongerPermissions = validateCompanyKnowledgeIntakePacket({
      ...packet,
      boundary: {
        ...packet.boundary,
        source_text_retrieval_allowed: true,
      },
      sources: [
        {
          ...packet.sources[0],
          permissions: {
            ...packet.sources[0].permissions,
            source_text_retrieval_allowed: true,
            public_canon_promotion_allowed: true,
          },
        },
      ],
    });
    assert.equal(packetWithStrongerPermissions.status, "blocked");
    assert.ok(packetWithStrongerPermissions.blockers.includes("boundary_source_text_retrieval_allowed_must_be_false"));
    assert.ok(
      packetWithStrongerPermissions.blockers.some((item) =>
        item.startsWith("source_permission_source_text_retrieval_allowed_must_be_false:"),
      ),
    );
    assert.ok(
      packetWithStrongerPermissions.blockers.some((item) =>
        item.startsWith("source_permission_public_canon_promotion_allowed_must_be_false:"),
      ),
    );

    const packetWithMalformedQuestionRefs = validateCompanyKnowledgeIntakePacket({
      ...packet,
      question_refs: [
        {
          question_label: "What is the project status",
          question_fingerprint: "not_a_hash",
          query_token_count: "one",
          query_token_fingerprints: ["not_a_token_fingerprint"],
        },
      ],
    });
    assert.equal(packetWithMalformedQuestionRefs.status, "blocked");
    assert.ok(packetWithMalformedQuestionRefs.blockers.some((item) => item.startsWith("question_ref_label_unsafe:")));
    assert.ok(
      packetWithMalformedQuestionRefs.blockers.some((item) =>
        item.startsWith("question_ref_question_fingerprint_unsafe:"),
      ),
    );
    assert.ok(
      packetWithMalformedQuestionRefs.blockers.some((item) =>
        item.startsWith("question_ref_query_token_fingerprint_unsafe:"),
      ),
    );

    const packetWithMismatchedQuestionTokenCount = validateCompanyKnowledgeIntakePacket({
      ...packet,
      question_refs: [
        {
          ...packet.question_refs[0],
          query_token_count: 99,
        },
      ],
    });
    assert.equal(packetWithMismatchedQuestionTokenCount.status, "blocked");
    assert.ok(
      packetWithMismatchedQuestionTokenCount.blockers.some((item) =>
        item.startsWith("question_ref_query_token_count_must_match_fingerprint_count:"),
      ),
    );

    const packetWithAuthorityAliases = validateCompanyKnowledgeIntakePacket({
      ...packet,
      account_id: "account_001",
      notebooklm_notebook_id: "notebook_001",
      conversation_ref: "conversation_001",
      owner_approval_granted: true,
      handoff_state: {
        ...packet.handoff_state,
        claim_ceiling: "canon_entry",
      },
    });
    assert.equal(packetWithAuthorityAliases.status, "blocked");
    assert.ok(packetWithAuthorityAliases.blockers.includes("company_packet_forbidden_raw_or_payload_key:company_knowledge_intake_packet.account_id"));
    assert.ok(
      packetWithAuthorityAliases.blockers.includes(
        "company_packet_forbidden_raw_or_payload_key:company_knowledge_intake_packet.notebooklm_notebook_id",
      ),
    );
    assert.ok(packetWithAuthorityAliases.blockers.includes("handoff_state_claim_ceiling_must_be_observed"));

    const packetWithFloatingSourceId = validateCompanyKnowledgeIntakePacket({
      ...packet,
      sources: [
        {
          ...packet.sources[0],
          source_ref: "1AbCDeFgHiJkLmNoPqRsTuVwXyZ",
        },
      ],
    });
    assert.equal(packetWithFloatingSourceId.status, "blocked");
    assert.ok(
      packetWithFloatingSourceId.blockers.some((item) =>
        item.startsWith("source_ref_must_be_soulforge_knowledge_relative:"),
      ),
    );

    const packetWithFileUrl = validateCompanyKnowledgeIntakePacket({
      ...packet,
      sources: [
        {
          ...packet.sources[0],
          source_label: fixtureFileUrl,
        },
      ],
    });
    assert.equal(packetWithFileUrl.status, "blocked");
    assert.ok(packetWithFileUrl.blockers.some((item) => item.startsWith("company_packet_url_string:")));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("source text metadata profile reuses extraction status metadata without loading bodies", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-source-text-profile-"));
  const fixtureFileUrl = ["file:", "", "", "Volumes", "company", "private.docx"].join("/");
  try {
    await writeFixtureRepo(repoRoot);
    const graphResult = await exportKnowledgeGraph({
      repoRoot,
      exportId: "fixture_graph_profile",
      now: "2026-05-25T01:00:00Z",
    });
    const manifestWrite = await writeRagManifest({
      repoRoot,
      graphRef: graphResult.graph_ref,
      manifestId: "fixture_manifest_profile",
      outputRef: "_workspaces/system/rag/manifests/fixture_manifest_profile/rag_manifest.json",
      now: "2026-05-25T01:10:00Z",
    });
    const sourceSliceWrite = await writeSourceSliceCards({
      repoRoot,
      manifestRef: manifestWrite.manifest_ref,
      sliceSetId: "fixture_source_slices_profile",
      outputRef: "_workspaces/system/rag/source_slice_cards/fixture_source_slices_profile/source_slice_cards.json",
      now: "2026-05-25T01:20:00Z",
    });
    await writeExtractionStatusFixture(repoRoot);

    const profile = await buildSourceTextMetadataProfile({
      repoRoot,
      sourceSliceRef: sourceSliceWrite.source_slice_ref,
      extractionLogRefs: ["_workmeta/system/runs/source_text_fixture/extraction_status.csv"],
      scanRoots: [".registry", ".workflow", "guild_hall/rag"],
      profileId: "fixture_source_text_profile",
      now: "2026-05-25T01:30:00Z",
    });

    assert.equal(profile.schema_version, "soulforge.source_text_metadata_profile.v0");
    assert.equal(profile.boundary.metadata_only, true);
    assert.equal(profile.boundary.source_text_loaded, false);
    assert.equal(profile.extraction_log_summaries[0].row_count, 3);
    assert.equal(profile.extraction_log_summaries[0].private_text_ref_count, 1);
    assert.equal(profile.extraction_log_summaries[0].status_counts.ok, 1);
    assert.equal(profile.extraction_log_summaries[0].status_counts.blocked, 1);
    assert.ok(profile.metadata_field_catalog.fields.some((field) => field.field_id === "extracted_chars"));
    assert.ok(profile.metadata_field_catalog.fields.some((field) => field.field_id === "source_handle"));
    assert.ok(profile.extractor_adapter_candidates.some((adapter) => adapter.adapter_id === "unstructured_partition"));
    assert.equal(validateSourceTextMetadataProfile(profile).status, "pass");
    const profileJson = JSON.stringify(profile);
    assert.doesNotMatch(profileJson, /private body|source text payload|https?:\/\/|file:\/\/|\/Users\/|\/Volumes\//);

    const writeResult = await writeSourceTextMetadataProfile({
      repoRoot,
      sourceSliceRef: sourceSliceWrite.source_slice_ref,
      extractionLogRefs: ["_workmeta/system/runs/source_text_fixture/extraction_status.csv"],
      scanRoots: [".registry", ".workflow", "guild_hall/rag"],
      profileId: "fixture_source_text_profile_written",
      now: "2026-05-25T01:35:00Z",
    });
    assert.equal(writeResult.status, "written");
    assert.match(writeResult.profile_ref, /^_workmeta\/system\/reports\/rag\/source_text_metadata_profiles\//);

    const packet = await buildSourceTextExtractionPacket({
      repoRoot,
      profileRef: writeResult.profile_ref,
      packetId: "fixture_source_text_packet",
      now: "2026-05-25T01:40:00Z",
    });
    assert.equal(packet.schema_version, "soulforge.source_text_extraction_packet.v0");
    assert.equal(packet.boundary.metadata_only, true);
    assert.equal(packet.boundary.packet_does_not_execute_extractor, true);
    assert.equal(packet.boundary.source_text_read_allowed, false);
    assert.equal(packet.execution_policy.runner_action_allowed_now, "validate_and_report_only");
    assert.equal(packet.counts.target_count, sourceSliceWrite.card_count);
    assert.equal(packet.counts.log_import_task_count, 1);
    assert.equal(packet.log_import_tasks[0].payload_values_copied, false);
    assert.ok(packet.metadata_field_policy.required_output_field_ids.includes("extracted_chars"));
    assert.ok(packet.adapter_plan.routes.some((route) => route.adapter_id === "existing_extraction_status_csv_importer"));
    assert.ok(packet.target_items.every((item) => item.execution_grants.source_text_read === false));
    assert.equal(validateSourceTextExtractionPacket(packet).status, "pass");
    const packetJson = JSON.stringify(packet);
    assert.doesNotMatch(packetJson, /private body|source text payload|https?:\/\/|file:\/\/|\/Users\/|\/Volumes\//);

    const packetWriteResult = await writeSourceTextExtractionPacket({
      repoRoot,
      profileRef: writeResult.profile_ref,
      packetId: "fixture_source_text_packet_written",
      now: "2026-05-25T01:45:00Z",
    });
    assert.equal(packetWriteResult.status, "written");
    assert.match(packetWriteResult.packet_ref, /^_workmeta\/system\/reports\/rag\/source_text_extraction_packets\//);
    const writtenPacket = JSON.parse(await readFile(path.join(repoRoot, packetWriteResult.packet_ref), "utf8"));
    assert.equal(validateSourceTextExtractionPacket(writtenPacket).status, "pass");

    const runReport = await buildSourceTextExtractionRunReport({
      repoRoot,
      packetRef: packetWriteResult.packet_ref,
      reportId: "fixture_source_text_run_report",
      now: "2026-05-25T01:45:30Z",
    });
    assert.equal(runReport.schema_version, "soulforge.source_text_extraction_run_report.v0");
    assert.equal(runReport.status, "dry_run_report_only");
    assert.equal(runReport.boundary.source_text_read, false);
    assert.equal(runReport.boundary.extractor_executed, false);
    assert.equal(runReport.counts.target_count, packetWriteResult.target_count);
    assert.equal(runReport.counts.source_text_read_grant_count, 0);
    assert.equal(runReport.answer_engine_handoff.allowed_answer_engine_mode, "metadata_index_answer");
    assert.equal(validateSourceTextExtractionRunReport(runReport).status, "pass");
    assert.doesNotMatch(
      JSON.stringify(runReport),
      /"source_locator_ref"\s*:|"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|"embedding"\s*:|"bm25"\s*:|"vector_payload"\s*:|"notebooklm_answer"\s*:|\/Users\/|\/Volumes\//,
    );

    const runReportWrite = await writeSourceTextExtractionRunReport({
      repoRoot,
      packetRef: packetWriteResult.packet_ref,
      reportId: "fixture_source_text_run_report_written",
      now: "2026-05-25T01:45:45Z",
    });
    assert.equal(runReportWrite.status, "written");
    assert.match(runReportWrite.run_report_ref, /^_workmeta\/system\/reports\/rag\/source_text_extraction_runs\//);
    const writtenRunReport = JSON.parse(await readFile(path.join(repoRoot, runReportWrite.run_report_ref), "utf8"));
    assert.equal(validateSourceTextExtractionRunReport(writtenRunReport).status, "pass");

    const metadataIndexWrite = await writeRagMetadataIndex({
      repoRoot,
      manifestRef: manifestWrite.manifest_ref,
      indexId: "fixture_answer_engine_metadata_index",
      now: "2026-05-25T01:46:00Z",
    });
    assert.equal(metadataIndexWrite.status, "written");

    const answerEngineRun = await buildRagAnswerEngineRun({
      repoRoot,
      metadataIndexRef: metadataIndexWrite.metadata_index_ref,
      extractionPacketRef: packetWriteResult.packet_ref,
      extractionRunReportRef: runReportWrite.run_report_ref,
      question: "GraphRAG source supported retrieval",
      runId: "fixture_answer_engine_run",
      now: "2026-05-25T01:47:00Z",
    });
    assert.equal(answerEngineRun.schema_version, "soulforge.rag_answer_engine_run.v0");
    assert.equal(answerEngineRun.status, "metadata_index_answer");
    assert.equal(answerEngineRun.boundary.metadata_only, true);
    assert.equal(answerEngineRun.boundary.raw_query_persisted, false);
    assert.equal(answerEngineRun.boundary.source_text_loaded, false);
    assert.equal(answerEngineRun.response.answer_uses_source_text, false);
    assert.equal(answerEngineRun.response.sourcebound_target_count, packetWriteResult.target_count);
    assert.equal(answerEngineRun.source_refs.extraction_run_report_ref, runReportWrite.run_report_ref);
    assert.ok(answerEngineRun.response.retrieved_unit_count > 0);
    assert.equal(validateRagAnswerEngineRun(answerEngineRun).status, "pass");
    assert.doesNotMatch(
      JSON.stringify(answerEngineRun),
      /"question"\s*:|GraphRAG source supported retrieval|"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|"private_payload"\s*:|\/Users\/|\/Volumes\//,
    );

    const statusRun = await buildRagAnswerEngineRun({
      repoRoot,
      metadataIndexRef: metadataIndexWrite.metadata_index_ref,
      extractionPacketRef: packetWriteResult.packet_ref,
      extractionRunReportRef: runReportWrite.run_report_ref,
      question: "답변 엔진 상태",
      runId: "fixture_answer_engine_status_run",
      now: "2026-05-25T01:48:00Z",
    });
    assert.equal(statusRun.status, "sourcebound_preflight_status");
    assert.equal(statusRun.response.sourcebound_target_count, packetWriteResult.target_count);
    assert.match(renderAnswerEngineRunText(statusRun), /sourcebound dry-run report/);
    assert.equal(validateRagAnswerEngineRun(statusRun).status, "pass");

    const answerEngineWrite = await writeRagAnswerEngineRun({
      repoRoot,
      metadataIndexRef: metadataIndexWrite.metadata_index_ref,
      extractionPacketRef: packetWriteResult.packet_ref,
      extractionRunReportRef: runReportWrite.run_report_ref,
      question: "GraphRAG source supported retrieval",
      runId: "fixture_answer_engine_run_written",
      now: "2026-05-25T01:49:00Z",
    });
    assert.equal(answerEngineWrite.status, "written");
    assert.match(answerEngineWrite.answer_engine_run_ref, /^_workmeta\/system\/reports\/rag\/answer_engine_runs\//);
    const writtenAnswerEngineRun = JSON.parse(await readFile(path.join(repoRoot, answerEngineWrite.answer_engine_run_ref), "utf8"));
    assert.equal(validateRagAnswerEngineRun(writtenAnswerEngineRun).status, "pass");

    const unsafePacket = validateSourceTextExtractionPacket({
      ...packet,
      boundary: {
        ...packet.boundary,
        source_text_read_allowed: true,
      },
    });
    assert.equal(unsafePacket.status, "blocked");
    assert.ok(unsafePacket.blockers.includes("source_text_read_must_not_be_allowed"));

    const unsafeMatcherPacket = validateSourceTextExtractionPacket({
      ...packet,
      adapter_plan: {
        ...packet.adapter_plan,
        routes: [
          {
            ...packet.adapter_plan.routes[0],
            matcher: fixtureFileUrl,
          },
          ...packet.adapter_plan.routes.slice(1),
        ],
      },
    });
    assert.equal(unsafeMatcherPacket.status, "blocked");
    assert.ok(unsafeMatcherPacket.blockers.includes("adapter_route_matcher_unsafe"));
    assert.ok(unsafeMatcherPacket.blockers.includes("unsafe_url_string:packet.adapter_plan.routes[0].matcher"));

    const blocked = validateSourceTextMetadataProfile({
      ...profile,
      metadata_field_catalog: {
        ...profile.metadata_field_catalog,
        fields: [
          ...profile.metadata_field_catalog.fields,
          {
            field_id: "body_text",
            category: "custom_candidate",
            value_policy: "metadata_only",
            source_surfaces: ["fixture"],
            observed_count: 1,
            evidence_refs: [],
            downstream_uses: ["source_text_preflight"],
          },
        ],
      },
    });
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.blockers.includes("payload_field_must_not_be_extractable:body_text"));

    const blockedAdapterProfile = validateSourceTextMetadataProfile({
      ...profile,
      extractor_adapter_candidates: [
        {
          ...profile.extractor_adapter_candidates[0],
          source_ref: fixtureFileUrl,
        },
        ...profile.extractor_adapter_candidates.slice(1),
      ],
    });
    assert.equal(blockedAdapterProfile.status, "blocked");
    assert.ok(blockedAdapterProfile.blockers.includes("extractor_adapter_candidate_unknown_key:source_ref"));
    assert.ok(blockedAdapterProfile.blockers.includes("unsafe_url_string:profile.extractor_adapter_candidates[0].source_ref"));

    const blockedAdapterDocumentationProfile = validateSourceTextMetadataProfile({
      ...profile,
      extractor_adapter_candidates: [
        {
          ...profile.extractor_adapter_candidates[0],
          documentation_ref: "https://docs.example.com/extractor",
        },
        ...profile.extractor_adapter_candidates.slice(1),
      ],
    });
    assert.equal(blockedAdapterDocumentationProfile.status, "blocked");
    assert.ok(
      blockedAdapterDocumentationProfile.blockers.includes(
        "extractor_adapter_candidate_documentation_ref_unsafe",
      ),
    );
    assert.ok(
      blockedAdapterDocumentationProfile.blockers.includes(
        "unsafe_url_string:profile.extractor_adapter_candidates[0].documentation_ref",
      ),
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("source text extraction run report blocks unknown keys across report shape", async () => {
  const packet = {
    schema_version: "soulforge.source_text_extraction_packet.v0",
    kind: "source_text_extraction_packet",
    status: "draft_preflight_not_executed",
    packet_id: "fixture_run_report_guard_packet",
    generator_id: "fixture_run_report_guard_generator",
    generated_at_utc: "2026-05-25T02:00:00Z",
    source_refs: {
      profile_ref: null,
      profile_id: "fixture_run_report_guard_profile",
      profile_fingerprint: "fixture_run_report_guard_fingerprint",
      source_slice_ref: null,
      slice_set_id: null,
      extraction_log_refs: [],
    },
    boundary: {
      metadata_only: true,
      packet_is_not_owner_approval: true,
      packet_does_not_execute_extractor: true,
      source_text_read_allowed: false,
      source_payloads_included: false,
      chunk_payloads_included: false,
      embeddings_included: false,
      bm25_or_vector_index_included: false,
      notebooklm_answers_included: false,
      secrets_or_session_included: false,
      runtime_absolute_paths_included: false,
      private_payload_write_allowed: false,
      index_build_allowed: false,
      public_canon_promotion_allowed: false,
    },
    execution_policy: {
      purpose: "fixture_metadata_preflight",
      execution_mode: "dry_run_preflight",
      packet_is_not_owner_approval: true,
      packet_does_not_execute_extractor: true,
      runner_action_allowed_now: "validate_and_report_only",
      source_text_read_allowed: false,
      private_payload_write_allowed: false,
      index_build_allowed: false,
      notebooklm_packet_membership_allowed: false,
      public_canon_promotion_allowed: false,
    },
    metadata_field_policy: {
      required_output_field_ids: [],
      payload_field_policy: {
        reject_as_extractable: [],
        payload_values_copied: false,
        excerpts_allowed: false,
      },
    },
    adapter_plan: {
      adapter_candidates: [],
      routes: [],
    },
    planned_outputs: {
      metadata_run_report_ref: "reports/rag/run_report_guard/source_text_extraction_run_report.json",
      target_result_ref_root: "reports/rag/run_report_guard/targets",
      private_payload_ref: null,
    },
    counts: {
      metadata_field_count: 0,
    },
    log_import_tasks: [],
    target_items: [
      {
        target_ref: "source_text_target:run_report_guard",
        source_slice_ref: "source_slice:run_report_guard",
        source_handle: "source_handle_run_report_guard",
        source_locator_ref: "fixtures/source.md",
        target_status: "planned_metadata_preflight_only",
        adapter_route: {
          adapter_id: "metadata_file_preflight",
          planned_action: "metadata_shape_preflight_only",
        },
        execution_grants: {
          metadata_preflight: true,
          source_text_read: false,
          private_payload_write: false,
          index_build: false,
        },
        blocker_codes: ["source_text_retrieval_not_approved"],
      },
    ],
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
  const report = await buildSourceTextExtractionRunReport({
    packet,
    reportId: "fixture_run_report_guard",
    now: "2026-05-25T02:05:00Z",
  });
  assert.equal(validateSourceTextExtractionRunReport(report).status, "pass");

  const maliciousReport = JSON.parse(JSON.stringify(report));
  maliciousReport.private_payload_ref = "payload_pointer";
  maliciousReport.source_refs.source_locator_ref = "locator_pointer";
  maliciousReport.boundary.harmless_extra_flag = false;
  maliciousReport.run_policy.display_note = "metadata note";
  maliciousReport.counts.extra_count = 0;
  maliciousReport.counts.blocker_counts.private_payload_ref = 1;
  maliciousReport.adapter_summary[0].source_locator_ref = "locator_pointer";
  maliciousReport.adapter_summary[0].planned_actions = [{ private_payload_ref: "payload_pointer" }];
  maliciousReport.blocker_summary[0].display_label = "blocker label";
  maliciousReport.target_reports[0].private_payload_ref = "payload_pointer";
  maliciousReport.run_policy.allowed_next_actions = [{ private_payload_ref: "payload_pointer" }];
  maliciousReport.answer_engine_handoff.extra_note = "metadata note";
  maliciousReport.validation.harmless_extra = "metadata note";
  maliciousReport.validation.blockers = [{ private_payload_ref: "payload_pointer" }];

  const validation = validateSourceTextExtractionRunReport(maliciousReport);
  assert.equal(validation.status, "blocked");
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.private_payload_ref"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.source_refs.source_locator_ref"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.boundary.harmless_extra_flag"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.run_policy.display_note"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.counts.extra_count"));
  assert.ok(validation.blockers.includes("counts_blocker_counts_key_unsafe:private_payload_ref"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.adapter_summary[0].source_locator_ref"));
  assert.ok(validation.blockers.includes("adapter_summary_planned_action_unsafe:report.adapter_summary[0].planned_actions[0]"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.blocker_summary[0].display_label"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.target_reports[0].private_payload_ref"));
  assert.ok(validation.blockers.includes("run_policy_allowed_next_action_unsafe:report.run_policy.allowed_next_actions[0]"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.answer_engine_handoff.extra_note"));
  assert.ok(validation.blockers.includes("run_report_unknown_key:report.validation.harmless_extra"));
  assert.ok(validation.blockers.includes("validation_blocker_unsafe:report.validation.blockers[0]"));
  assert.ok(validation.blockers.includes("forbidden_key:report.counts.blocker_counts.private_payload_ref"));
});

test("source text extraction run report accepts generated invalid-packet report shape", async () => {
  const report = await buildSourceTextExtractionRunReport({
    packet: {
      packet_id: "fixture_invalid_packet",
    },
    reportId: "fixture_invalid_packet_report",
    now: "2026-05-25T02:10:00Z",
  });

  assert.equal(report.status, "blocked_invalid_packet");
  assert.ok(report.blocker_summary.some((item) => item.blocker_code === "secrets_or_session_must_not_be_included"));
  assert.ok(report.validation.upstream_packet_validation.blockers.includes("secrets_or_session_must_not_be_included"));
  assert.equal(validateSourceTextExtractionRunReport(report).status, "pass");
});

test("source-text index reads owner-approved workspace knowledge source cards", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-source-index-"));
  try {
    const sourceRef = "_workspaces/knowledge/common/systems_engineering/starter/fixture_source.md";
    const sourceCardRef = "_workspaces/knowledge/source_cards/fixture_source_card.json";
    await writeFileWithParents(
      repoRoot,
      sourceRef,
      [
        "# Fixture Common Knowledge",
        "",
        "NotebookLM is a query bookshelf, not an authority surface.",
        "",
        "Project-specific knowledge stays under the project workspace. Cross-project systems engineering knowledge stays under the common knowledge workspace.",
        "",
        "RAG derived text and source-text indexes are private workspace payload artifacts, not public canon.",
      ].join("\n"),
    );
    const sourceCard = {
      schema_version: "soulforge.knowledge_source_card.v0",
      source_id: "fixture_common_knowledge_starter",
      title: "Fixture Common Knowledge Starter",
      source_ref: {
        repo_relative_path: sourceRef,
      },
      source_kind: "markdown_source_text",
      domains: ["systems_engineering", "knowledge_management"],
      sensitivity: "internal_common",
      approval_status: "owner_approved_starter_source",
      rag_permissions: {
        source_text_retrieval: true,
        index_build: true,
        answer_synthesis: true,
      },
      public_canon_promotion_allowed: false,
      notebooklm_packet_allowed: false,
      claim_ceiling: "observed",
    };
    await writeFileWithParents(repoRoot, sourceCardRef, JSON.stringify(sourceCard, null, 2));
    const sourceCardValidation = validateKnowledgeSourceCard(sourceCard);
    assert.equal(sourceCardValidation.schema_version, "soulforge.knowledge_source_card_validation.v0");
    assert.equal(sourceCardValidation.status, "pass");

    const officialSourceCardValidation = validateKnowledgeSourceCard({
      ...sourceCard,
      approval_status: "owner_approved_official_public_source",
      sensitivity: "public_official_source",
      origin: {
        publisher: "Fixture Official Agency",
        public_host: "fixture public host",
      },
      authority: {
        source_is_approved_knowledge_reference: true,
        approval_basis: "official_public_source_owner_rule",
      },
      public_canon_promotion_allowed: true,
      notebooklm_packet_allowed: true,
      claim_ceiling: "canon_entry",
    });
    assert.equal(officialSourceCardValidation.status, "pass");

    const nonOfficialPromotionValidation = validateKnowledgeSourceCard({
      ...sourceCard,
      public_canon_promotion_allowed: true,
      notebooklm_packet_allowed: true,
    });
    assert.equal(nonOfficialPromotionValidation.status, "blocked");
    assert.ok(nonOfficialPromotionValidation.blockers.includes("public_canon_promotion_requires_official_source_authority"));
    assert.ok(nonOfficialPromotionValidation.blockers.includes("notebooklm_packet_requires_official_source_authority"));

    const index = await buildSourceTextIndex({
      repoRoot,
      sourceCardRef,
      indexId: "fixture_source_text_index",
      now: "2026-05-25T08:00:00Z",
    });
    assert.equal(index.schema_version, "soulforge.source_text_index.v0");
    assert.equal(index.status, "ready");
    assert.equal(index.boundary.storage_scope, "_workspaces_private_payload");
    assert.equal(index.boundary.public_repo_safe, false);
    assert.equal(index.permissions.index_build_allowed, true);
    assert.equal(index.permissions.public_canon_promotion_allowed, false);
    assert.equal(index.counts.chunk_count > 0, true);
    assert.ok(index.chunks.some((chunk) => chunk.chunk_text.includes("NotebookLM")));
    assert.equal(validateSourceTextIndex(index).status, "pass");
    assert.doesNotMatch(JSON.stringify(index), /\/Users\/|\/Volumes\//);

    const indexWrite = await writeSourceTextIndex({
      repoRoot,
      sourceCardRef,
      indexId: "fixture_source_text_index_written",
      now: "2026-05-25T08:01:00Z",
    });
    assert.equal(indexWrite.status, "written");
    assert.match(indexWrite.source_text_index_ref, /^_workspaces\/knowledge\/rag\/indexes_local\/source_text_indexes\//);
    assert.match(indexWrite.derived_text_ref, /^_workspaces\/knowledge\/rag\/derived_text\//);
    const writtenIndex = JSON.parse(await readFile(path.join(repoRoot, indexWrite.source_text_index_ref), "utf8"));
    assert.equal(validateSourceTextIndex(writtenIndex).status, "pass");

    const doclingJsonRef = "_workspaces/knowledge/common/systems_engineering/starter/fixture_docling.json";
    await writeFileWithParents(
      repoRoot,
      doclingJsonRef,
      JSON.stringify(
        {
          schema_name: "DoclingDocument",
          version: "1.0.0",
          name: "fixture_docling",
          body: {
            self_ref: "#/body",
            children: [
              { $ref: "#/texts/0" },
              { $ref: "#/texts/1" },
              { $ref: "#/texts/2" },
              { $ref: "#/texts/3" },
              { $ref: "#/tables/0" },
              { $ref: "#/pictures/0" },
            ],
          },
          groups: [],
          texts: [
            { self_ref: "#/texts/0", label: "section_header", text: "Fixture Common Knowledge", prov: [{ page_no: 1 }] },
            { self_ref: "#/texts/1", label: "text", text: "NotebookLM is a query bookshelf, not an authority surface.", prov: [{ page_no: 1 }] },
            {
              self_ref: "#/texts/2",
              label: "text",
              text: "Project-specific knowledge stays under the project workspace. Cross-project systems engineering knowledge stays under the common knowledge workspace.",
              prov: [{ page_no: 2 }],
            },
            {
              self_ref: "#/texts/3",
              label: "text",
              text: "RAG derived text and source-text indexes are private workspace payload artifacts, not public canon.",
              prov: [{ page_no: 2 }],
            },
          ],
          tables: [
            {
              self_ref: "#/tables/0",
              label: "table",
              prov: [{ page_no: 2 }],
              data: {
                table_cells: [{ text: "metadata" }, { text: "page-backed" }],
              },
            },
          ],
          pictures: [
            {
              self_ref: "#/pictures/0",
              label: "picture",
              prov: [{ page_no: 2 }],
            },
          ],
          pages: {
            1: { page_no: 1, size: { width: 100, height: 100 } },
            2: { page_no: 2, size: { width: 100, height: 100 } },
          },
        },
        null,
        2,
      ),
    );
    const sidecar = await buildSourceTextTraceabilitySidecar({
      repoRoot,
      sourceTextIndexRef: indexWrite.source_text_index_ref,
      doclingJsonRef,
      traceabilityId: "fixture_source_text_traceability",
      now: "2026-05-25T08:01:30Z",
    });
    assert.equal(sidecar.schema_version, "soulforge.source_text_traceability_sidecar.v0");
    assert.equal(sidecar.status, "page_traceability_ready");
    assert.equal(sidecar.boundary.chunk_text_included, false);
    assert.equal(sidecar.counts.page_backed_chunk_count, sidecar.counts.chunk_count);
    assert.ok(sidecar.chunks.every((chunk) => chunk.page_span?.pages.length > 0));
    assert.ok(sidecar.page_summary.some((page) => page.page_no === 2 && page.table_count === 1 && page.picture_count === 1));
    assert.equal(sidecar.counts.mapped_chunk_count, sidecar.chunks.length);
    assert.equal(sidecar.counts.weak_mapped_chunk_count, 0);
    assert.equal(sidecar.counts.unmapped_chunk_count, 0);
    assert.equal(sidecar.counts.page_count, sidecar.page_summary.length);
    assert.equal(sidecar.counts.table_count, sidecar.page_summary.reduce((sum, page) => sum + page.table_count, 0));
    assert.equal(sidecar.counts.picture_count, sidecar.page_summary.reduce((sum, page) => sum + page.picture_count, 0));
    assert.ok(sidecar.page_summary.every((page) => Array.isArray(page.warning_codes)));
    assert.equal(validateSourceTextTraceabilitySidecar(sidecar).status, "pass");
    assert.doesNotMatch(JSON.stringify(sidecar), /"chunk_text"\s*:|"source_text"\s*:|NotebookLM is a query bookshelf|\/Users\/|\/Volumes\//);

    const sidecarWrite = await writeSourceTextTraceabilitySidecar({
      repoRoot,
      sourceTextIndexRef: indexWrite.source_text_index_ref,
      doclingJsonRef,
      traceabilityId: "fixture_source_text_traceability_written",
      now: "2026-05-25T08:01:45Z",
    });
    assert.equal(sidecarWrite.status, "written");
    assert.match(sidecarWrite.traceability_sidecar_ref, /^_workspaces\/knowledge\/rag\/traceability_sidecars\//);
    const writtenSidecar = JSON.parse(await readFile(path.join(repoRoot, sidecarWrite.traceability_sidecar_ref), "utf8"));
    assert.equal(validateSourceTextTraceabilitySidecar(writtenSidecar).status, "pass");

    const doclingIndex = await buildSourceTextIndex({
      repoRoot,
      sourceCardRef,
      doclingJsonRef,
      indexId: "fixture_source_text_docling_json_index",
      maxChars: 120,
      now: "2026-05-25T08:01:50Z",
    });
    assert.equal(doclingIndex.status, "ready");
    assert.equal(doclingIndex.source_refs.docling_json_ref, doclingJsonRef);
    assert.equal(doclingIndex.generation_profile.source_order_basis, "docling_element_page_order");
    assert.ok(doclingIndex.chunks.every((chunk) => chunk.page_span?.pages.length > 0));
    assert.ok(doclingIndex.chunks.some((chunk) => chunk.layout_labels.includes("table")));
    assert.equal(validateSourceTextIndex(doclingIndex).status, "pass");

    const doclingIndexSidecar = await buildSourceTextTraceabilitySidecar({
      repoRoot,
      sourceTextIndex: doclingIndex,
      doclingJsonRef,
      traceabilityId: "fixture_source_text_docling_json_index_traceability",
      now: "2026-05-25T08:01:55Z",
    });
    assert.equal(doclingIndexSidecar.status, "page_traceability_ready");
    assert.equal(doclingIndexSidecar.counts.weak_mapped_chunk_count, 0);
    assert.equal(doclingIndexSidecar.counts.unmapped_chunk_count, 0);
    assert.equal(validateSourceTextTraceabilitySidecar(doclingIndexSidecar).status, "pass");

    const doclingIndexAnswerRun = await buildSourceTextAnswerRun({
      repoRoot,
      sourceTextIndex: doclingIndex,
      question: "metadata page-backed",
      runId: "fixture_source_text_docling_json_index_answer_run",
      now: "2026-05-25T08:02:00Z",
    });
    assert.equal(doclingIndexAnswerRun.status, "source_text_answer");
    assert.equal(doclingIndexAnswerRun.boundary.citation_page_traceability_checked, true);
    assert.ok(doclingIndexAnswerRun.response.citations.every((citation) => citation.page_span?.pages.length > 0));
    assert.equal(doclingIndexAnswerRun.response.citations[0].traceability_status, "mapped");
    assert.equal(validateSourceTextAnswerRun(doclingIndexAnswerRun).status, "pass");

    const answerRun = await buildSourceTextAnswerRun({
      repoRoot,
      sourceTextIndexRef: indexWrite.source_text_index_ref,
      traceabilitySidecarRef: sidecarWrite.traceability_sidecar_ref,
      question: "NotebookLM authority",
      runId: "fixture_source_text_answer_run",
      now: "2026-05-25T08:02:00Z",
    });
    assert.equal(answerRun.schema_version, "soulforge.source_text_answer_run.v0");
    assert.equal(answerRun.status, "source_text_answer");
    assert.equal(answerRun.query.raw_query_persisted, false);
    assert.equal(answerRun.response.answer_uses_source_text, true);
    assert.ok(answerRun.response.answer_text.includes("NotebookLM"));
    assert.equal(answerRun.boundary.citation_page_traceability_checked, true);
    assert.ok(answerRun.response.citations[0].page_span.pages.includes(1));
    assert.equal(answerRun.response.citations[0].traceability_status, "mapped");
    assert.equal(validateSourceTextAnswerRun(answerRun).status, "pass");
    assert.doesNotMatch(JSON.stringify(answerRun), /"question"\s*:|NotebookLM authority|\/Users\/|\/Volumes\//);

    const qualityReview = await buildSourceTextQualityReview({
      repoRoot,
      sourceTextIndexRef: indexWrite.source_text_index_ref,
      traceabilitySidecarRef: sidecarWrite.traceability_sidecar_ref,
      answerRun,
      pages: ["1-2"],
      reviewId: "fixture_source_text_quality_review",
      now: "2026-05-25T08:02:30Z",
    });
    assert.equal(qualityReview.schema_version, "soulforge.source_text_quality_review.v0");
    assert.equal(qualityReview.status, "manual_review");
    assert.equal(qualityReview.boundary.chunk_text_included, false);
    assert.equal(qualityReview.boundary.source_text_included, false);
    assert.equal(qualityReview.reviewed_pages.length, 2);
    assert.equal(qualityReview.reviewed_pages.find((page) => page.page_no === 1).review_status, "source_supported");
    assert.equal(qualityReview.reviewed_pages.find((page) => page.page_no === 2).review_status, "source_supported");
    assert.equal(qualityReview.reviewed_pages.find((page) => page.page_no === 2).manual_review_required, true);
    assert.ok(qualityReview.warning_codes.includes("picture_present_on_page"));
    assert.equal(validateSourceTextQualityReview(qualityReview).status, "pass");
    assert.doesNotMatch(JSON.stringify(qualityReview), /"chunk_text"\s*:|"source_text"\s*:|NotebookLM is a query bookshelf|\/Users\/|\/Volumes\/|file:\/\//);

    const answerWrite = await writeSourceTextAnswerRun({
      repoRoot,
      sourceTextIndexRef: indexWrite.source_text_index_ref,
      traceabilitySidecarRef: sidecarWrite.traceability_sidecar_ref,
      question: "project workspace common knowledge",
      runId: "fixture_source_text_answer_run_written",
      now: "2026-05-25T08:03:00Z",
    });
    assert.equal(answerWrite.status, "written");
    assert.match(answerWrite.source_text_answer_run_ref, /^_workspaces\/knowledge\/rag\/answer_runs\//);
    const writtenAnswerRun = JSON.parse(await readFile(path.join(repoRoot, answerWrite.source_text_answer_run_ref), "utf8"));
    assert.equal(validateSourceTextAnswerRun(writtenAnswerRun).status, "pass");

    const qualityReviewWrite = await writeSourceTextQualityReview({
      repoRoot,
      sourceTextIndexRef: indexWrite.source_text_index_ref,
      traceabilitySidecarRef: sidecarWrite.traceability_sidecar_ref,
      answerRunRef: answerWrite.source_text_answer_run_ref,
      pages: ["1,2"],
      reviewId: "fixture_source_text_quality_review_written",
      now: "2026-05-25T08:03:30Z",
    });
    assert.equal(qualityReviewWrite.status, "written");
    assert.match(qualityReviewWrite.source_text_quality_review_ref, /^_workspaces\/knowledge\/rag\/source_text_quality_reviews\//);
    const writtenQualityReview = JSON.parse(await readFile(path.join(repoRoot, qualityReviewWrite.source_text_quality_review_ref), "utf8"));
    assert.equal(validateSourceTextQualityReview(writtenQualityReview).status, "pass");

    const workCard = await buildRagWorkCard({
      repoRoot,
      answerRunRef: answerWrite.source_text_answer_run_ref,
      qualityReviewRef: qualityReviewWrite.source_text_quality_review_ref,
      queryLabel: "fixture_source_text_work_card_query",
      workCardId: "fixture_source_text_work_card",
      graphNodeRefs: [".registry/knowledge/graph_rag"],
      now: "2026-05-25T08:04:00Z",
    });
    assert.equal(workCard.schema_version, "soulforge.source_text_work_card.v0");
    assert.equal(workCard.kind, "source_text_work_card");
    assert.equal(workCard.status, "manual_review");
    assert.equal(workCard.claim_ceiling, "source_supported");
    assert.equal(workCard.query.raw_query_persisted, false);
    assert.ok(workCard.evidence_pages.length > 0);
    assert.equal(validateRagWorkCard(workCard).status, "pass");
    assert.doesNotMatch(JSON.stringify(workCard), /"question"\s*:|project workspace common knowledge|NotebookLM is a query bookshelf|\/Users\/|\/Volumes\/|file:\/\//);

    const workCardWrite = await writeRagWorkCard({
      repoRoot,
      answerRunRef: answerWrite.source_text_answer_run_ref,
      qualityReviewRef: qualityReviewWrite.source_text_quality_review_ref,
      queryLabel: "fixture_source_text_work_card_query",
      workCardId: "fixture_source_text_work_card_written",
      now: "2026-05-25T08:04:30Z",
    });
    assert.equal(workCardWrite.status, "written");
    assert.match(workCardWrite.source_text_work_card_ref, /^_workspaces\/knowledge\/rag\/source_text_work_cards\//);
    const writtenWorkCard = JSON.parse(await readFile(path.join(repoRoot, workCardWrite.source_text_work_card_ref), "utf8"));
    assert.equal(validateRagWorkCard(writtenWorkCard).status, "pass");

    const blockedCardValidation = validateKnowledgeSourceCard({
      ...sourceCard,
      rag_permissions: {
        ...sourceCard.rag_permissions,
        index_build: false,
      },
    });
    assert.equal(blockedCardValidation.status, "blocked");
    assert.ok(blockedCardValidation.blockers.includes("index_build_permission_required"));

    const nonRepoAbsoluteRef = ["", "not_repo", "knowledge", "source.md"].join(path.sep);
    const absolutePathValidation = validateKnowledgeSourceCard({
      ...sourceCard,
      source_ref: {
        repo_relative_path: nonRepoAbsoluteRef,
      },
    });
    assert.equal(absolutePathValidation.status, "blocked");
    assert.ok(absolutePathValidation.blockers.includes("source_ref_must_be_under_workspaces_knowledge"));

    await assert.rejects(
      () =>
        writeSourceTextIndex({
          repoRoot,
          sourceCardRef,
          outputRef: "docs/source_text_index.json",
        }),
      /source text index output must be under _workspaces\/knowledge\/rag\/indexes_local\/source_text_indexes/,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("source-text artifact validators block hidden raw query path and secret contamination", () => {
  const sourceRef = "_workspaces/knowledge/common/systems_engineering/starter/fixture_source.md";
  const syntheticVolumePath = ["", "Volumes", "fixture", "source.txt"].join("/");
  const syntheticUserPath = ["", "Users", "fixture", "answer.txt"].join("/");
  const syntheticWindowsSourcePath = ["C:", "fixture", "source.txt"].join("\\");
  const syntheticWindowsPagePath = ["D:", "fixture", "page.txt"].join("\\");
  const validIndex = {
    schema_version: "soulforge.source_text_index.v0",
    kind: "source_text_index",
    index_id: "fixture_source_text_contamination_guard_index",
    status: "ready",
    source_refs: {
      source_card_ref: "_workspaces/knowledge/source_cards/fixture_source_card.json",
      source_id: "fixture_source_text_contamination_guard",
      source_ref: sourceRef,
      derived_text_ref: "_workspaces/knowledge/rag/derived_text/fixture_source_text_contamination_guard/source.txt",
      docling_json_ref: null,
    },
    boundary: {
      storage_scope: "_workspaces_private_payload",
      source_text_loaded: true,
      public_repo_safe: false,
    },
    permissions: {
      public_canon_promotion_allowed: false,
      notebooklm_packet_allowed: false,
    },
    chunks: [
      {
        chunk_id: "fixture_chunk_001",
        source_ref: sourceRef,
        chunk_text: "Legal source payload can mention question and token terms without persisting query metadata.",
      },
    ],
  };
  assert.equal(validateSourceTextIndex(validIndex).status, "pass");
  const objectChunkTextIndex = JSON.parse(JSON.stringify(validIndex));
  objectChunkTextIndex.chunks[0].chunk_text = {
    question: "nested transient question",
    credentials: {
      token: "access_token=fake_chunk_fixture_token_value_1234567890",
    },
  };
  const objectChunkTextValidation = validateSourceTextIndex(objectChunkTextIndex);
  assert.equal(objectChunkTextValidation.status, "blocked");
  assert.ok(objectChunkTextValidation.blockers.includes("chunk_text_required"));
  assert.ok(objectChunkTextValidation.blockers.includes("forbidden_key:source_text_index.chunks[0].chunk_text.question"));
  assert.ok(objectChunkTextValidation.blockers.includes("forbidden_key:source_text_index.chunks[0].chunk_text.credentials"));
  assert.ok(objectChunkTextValidation.blockers.includes("forbidden_key:source_text_index.chunks[0].chunk_text.credentials.token"));
  assert.ok(objectChunkTextValidation.blockers.includes("secret_like_value:source_text_index.chunks[0].chunk_text.credentials.token"));

  const contaminatedIndex = JSON.parse(JSON.stringify(validIndex));
  contaminatedIndex.audit = {
    raw_query: "transient raw query",
    question: "transient question",
    notebooklm_answer: "NotebookLM answer payload",
    credentials: {
      token: "access_token=fake_fixture_token_value_1234567890",
    },
    file_ref: "file://fixture/source.txt",
    local_path: syntheticVolumePath,
    windows_path: syntheticWindowsSourcePath,
  };
  const indexValidation = validateSourceTextIndex(contaminatedIndex);
  assert.equal(indexValidation.status, "blocked");
  assert.ok(indexValidation.blockers.includes("forbidden_key:source_text_index.audit.raw_query"));
  assert.ok(indexValidation.blockers.includes("forbidden_key:source_text_index.audit.question"));
  assert.ok(indexValidation.blockers.includes("forbidden_key:source_text_index.audit.notebooklm_answer"));
  assert.ok(indexValidation.blockers.includes("forbidden_key:source_text_index.audit.credentials"));
  assert.ok(indexValidation.blockers.includes("forbidden_key:source_text_index.audit.credentials.token"));
  assert.ok(indexValidation.blockers.includes("file_url_string:source_text_index.audit.file_ref"));
  assert.ok(indexValidation.blockers.includes("local_absolute_path:source_text_index.audit.local_path"));
  assert.ok(indexValidation.blockers.includes("local_absolute_path:source_text_index.audit.windows_path"));
  assert.ok(indexValidation.blockers.includes("secret_like_value:source_text_index.audit.credentials.token"));

  const validAnswerRun = {
    schema_version: "soulforge.source_text_answer_run.v0",
    kind: "source_text_answer_run",
    run_id: "fixture_source_text_answer_contamination_guard",
    status: "source_text_answer",
    source_refs: {
      source_text_index_ref: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture/source_text_index.json",
      source_ref: sourceRef,
    },
    boundary: {
      storage_scope: "_workspaces_private_payload",
      public_repo_safe: false,
    },
    query: {
      raw_query_persisted: false,
      query_token_fingerprints: [],
    },
    response: {
      answer_uses_source_text: true,
      retrieved_chunk_count: 0,
      answer_text: "Legal answer_text can mention question and token terms as private source-text payload.",
      citations: [],
    },
  };
  assert.equal(validateSourceTextAnswerRun(validAnswerRun).status, "pass");
  const objectAnswerTextRun = JSON.parse(JSON.stringify(validAnswerRun));
  objectAnswerTextRun.response.answer_text = {
    raw_query: "nested transient raw query",
    credentials: {
      token: "access_token=fake_nested_fixture_token_value_1234567890",
    },
  };
  const objectAnswerTextValidation = validateSourceTextAnswerRun(objectAnswerTextRun);
  assert.equal(objectAnswerTextValidation.status, "blocked");
  assert.ok(objectAnswerTextValidation.blockers.includes("answer_text_required"));
  assert.ok(objectAnswerTextValidation.blockers.includes("forbidden_key:source_text_answer_run.response.answer_text.raw_query"));
  assert.ok(objectAnswerTextValidation.blockers.includes("forbidden_key:source_text_answer_run.response.answer_text.credentials"));
  assert.ok(objectAnswerTextValidation.blockers.includes("forbidden_key:source_text_answer_run.response.answer_text.credentials.token"));
  assert.ok(objectAnswerTextValidation.blockers.includes("secret_like_value:source_text_answer_run.response.answer_text.credentials.token"));

  const contaminatedAnswerRun = JSON.parse(JSON.stringify(validAnswerRun));
  contaminatedAnswerRun.query.question = "transient question";
  contaminatedAnswerRun.query.raw_query = "transient raw query";
  contaminatedAnswerRun.response.notebooklm_answer = "NotebookLM answer payload";
  contaminatedAnswerRun.credentials = {
    token: "bearer fake_fixture_token_value_1234567890",
  };
  contaminatedAnswerRun.file_ref = "file://fixture/answer.txt";
  contaminatedAnswerRun.local_path = syntheticUserPath;
  const answerRunValidation = validateSourceTextAnswerRun(contaminatedAnswerRun);
  assert.equal(answerRunValidation.status, "blocked");
  assert.ok(answerRunValidation.blockers.includes("forbidden_key:source_text_answer_run.query.question"));
  assert.ok(answerRunValidation.blockers.includes("forbidden_key:source_text_answer_run.query.raw_query"));
  assert.ok(answerRunValidation.blockers.includes("forbidden_key:source_text_answer_run.response.notebooklm_answer"));
  assert.ok(answerRunValidation.blockers.includes("forbidden_key:source_text_answer_run.credentials"));
  assert.ok(answerRunValidation.blockers.includes("forbidden_key:source_text_answer_run.credentials.token"));
  assert.ok(answerRunValidation.blockers.includes("file_url_string:source_text_answer_run.file_ref"));
  assert.ok(answerRunValidation.blockers.includes("local_absolute_path:source_text_answer_run.local_path"));
  assert.ok(answerRunValidation.blockers.includes("secret_like_value:source_text_answer_run.credentials.token"));

  const validSidecar = {
    schema_version: "soulforge.source_text_traceability_sidecar.v0",
    kind: "source_text_traceability_sidecar",
    traceability_id: "fixture_source_text_traceability_contamination_guard",
    status: "page_traceability_ready",
    source_refs: {
      source_text_index_ref: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture/source_text_index.json",
      source_ref: sourceRef,
      docling_json_ref: "_workspaces/knowledge/common/systems_engineering/starter/fixture_docling.json",
    },
    boundary: {
      storage_scope: "_workspaces_private_payload",
      chunk_text_included: false,
      source_text_included: false,
      public_repo_safe: false,
    },
    chunks: [
      {
        chunk_id: "fixture_chunk_001",
        traceability_status: "mapped",
        layout_labels: [],
        page_span: {
          start_page: 1,
          end_page: 1,
          pages: [1],
        },
      },
    ],
    counts: {
      chunk_count: 1,
      mapped_chunk_count: 1,
      weak_mapped_chunk_count: 0,
      page_backed_chunk_count: 1,
      unmapped_chunk_count: 0,
    },
    page_summary: [],
  };
  assert.equal(validateSourceTextTraceabilitySidecar(validSidecar).status, "pass");
  const contaminatedSidecar = JSON.parse(JSON.stringify(validSidecar));
  contaminatedSidecar.source_text = "sidecar must not carry source text";
  contaminatedSidecar.chunks[0].chunk_text = "sidecar must not carry chunk text";
  contaminatedSidecar.chunks[0].source_text = "sidecar must not carry source text";
  contaminatedSidecar.response = {
    notebooklm_answer: "NotebookLM answer payload",
  };
  contaminatedSidecar.credentials = {
    session: "session_cookie=fake_fixture_session_value_1234567890",
  };
  contaminatedSidecar.page_summary = [
    {
      page_no: 1,
      file_ref: "file://fixture/page.txt",
      windows_path: syntheticWindowsPagePath,
    },
  ];
  const sidecarValidation = validateSourceTextTraceabilitySidecar(contaminatedSidecar);
  assert.equal(sidecarValidation.status, "blocked");
  assert.ok(sidecarValidation.blockers.includes("chunk_text_must_not_be_included"));
  assert.ok(sidecarValidation.blockers.includes("source_text_must_not_be_included"));
  assert.ok(sidecarValidation.blockers.includes("forbidden_key:source_text_traceability_sidecar.source_text"));
  assert.ok(sidecarValidation.blockers.includes("forbidden_key:source_text_traceability_sidecar.response.notebooklm_answer"));
  assert.ok(sidecarValidation.blockers.includes("forbidden_key:source_text_traceability_sidecar.credentials"));
  assert.ok(sidecarValidation.blockers.includes("forbidden_key:source_text_traceability_sidecar.credentials.session"));
  assert.ok(sidecarValidation.blockers.includes("file_url_string:source_text_traceability_sidecar.page_summary[0].file_ref"));
  assert.ok(sidecarValidation.blockers.includes("local_absolute_path:source_text_traceability_sidecar.page_summary[0].windows_path"));
  assert.ok(sidecarValidation.blockers.includes("secret_like_value:source_text_traceability_sidecar.credentials.session"));
});

test("source text traceability sidecar validator blocks synthetic risk inventory inconsistencies", () => {
  const sourceRef = "_workspaces/knowledge/common/systems_engineering/starter/fixture_source.md";
  const validSidecar = {
    schema_version: "soulforge.source_text_traceability_sidecar.v0",
    kind: "source_text_traceability_sidecar",
    traceability_id: "fixture_source_text_traceability_risk_inventory",
    status: "partial_page_traceability",
    source_refs: {
      source_text_index_ref: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture/source_text_index.json",
      source_ref: sourceRef,
      docling_json_ref: "_workspaces/knowledge/common/systems_engineering/starter/fixture_docling.json",
    },
    boundary: {
      storage_scope: "_workspaces_private_payload",
      chunk_text_included: false,
      source_text_included: false,
      public_repo_safe: false,
    },
    chunks: [
      {
        chunk_id: "fixture_chunk_001",
        traceability_status: "mapped",
        layout_labels: [],
        page_span: {
          start_page: 1,
          end_page: 1,
          pages: [1],
        },
        warning_codes: [],
      },
      {
        chunk_id: "fixture_chunk_002",
        traceability_status: "weak_mapped",
        layout_labels: [],
        page_span: {
          start_page: 2,
          end_page: 2,
          pages: [2],
        },
        warning_codes: ["weak_token_overlap_page_span"],
      },
      {
        chunk_id: "fixture_chunk_003",
        traceability_status: "unmapped",
        layout_labels: [],
        page_span: null,
        warning_codes: ["chunk_page_span_unmapped"],
      },
    ],
    counts: {
      chunk_count: 3,
      mapped_chunk_count: 1,
      weak_mapped_chunk_count: 1,
      unmapped_chunk_count: 1,
      page_backed_chunk_count: 2,
      page_count: 2,
      table_count: 1,
      picture_count: 1,
    },
    page_summary: [
      {
        page_no: 1,
        text_element_count: 1,
        table_count: 0,
        picture_count: 0,
        warning_codes: [],
      },
      {
        page_no: 2,
        text_element_count: 0,
        table_count: 1,
        picture_count: 1,
        warning_codes: ["no_docling_text_elements", "picture_present", "table_present"],
      },
    ],
  };
  assert.equal(validateSourceTextTraceabilitySidecar(validSidecar).status, "pass");

  const inconsistentSidecar = JSON.parse(JSON.stringify(validSidecar));
  inconsistentSidecar.counts = {
    chunk_count: 4,
    mapped_chunk_count: 0,
    weak_mapped_chunk_count: 0,
    unmapped_chunk_count: 0,
    page_backed_chunk_count: 1,
    page_count: 3,
    table_count: 0,
    picture_count: 0,
  };
  inconsistentSidecar.chunks[1].warning_codes = [];
  inconsistentSidecar.chunks[2].warning_codes = [];
  inconsistentSidecar.page_summary[0].warning_codes = "not_array";
  inconsistentSidecar.page_summary[1].warning_codes = [];
  inconsistentSidecar.page_summary[1].source_text = "synthetic forbidden payload marker";
  inconsistentSidecar.quality_gates = {
    canon_promotion_allowed: true,
    public_canon_entry: "fixture_public_canon_entry",
  };
  inconsistentSidecar.authority = {
    owner_approval_granted: true,
    source_truth_claimed: true,
  };

  const validation = validateSourceTextTraceabilitySidecar(inconsistentSidecar);
  assert.equal(validation.status, "blocked");
  assert.ok(validation.blockers.includes("chunk_count_mismatch"));
  assert.ok(validation.blockers.includes("mapped_chunk_count_mismatch"));
  assert.ok(validation.blockers.includes("weak_mapped_chunk_count_mismatch"));
  assert.ok(validation.blockers.includes("unmapped_chunk_count_mismatch"));
  assert.ok(validation.blockers.includes("page_backed_chunk_count_mismatch"));
  assert.ok(validation.blockers.includes("page_count_mismatch"));
  assert.ok(validation.blockers.includes("page_summary_table_count_mismatch"));
  assert.ok(validation.blockers.includes("page_summary_picture_count_mismatch"));
  assert.ok(validation.blockers.includes("page_summary_warning_codes_must_be_array"));
  assert.ok(validation.blockers.includes("page_summary_warning_code_mismatch"));
  assert.ok(validation.blockers.includes("weak_mapped_chunk_missing_warning"));
  assert.ok(validation.blockers.includes("unmapped_chunk_missing_warning"));
  assert.ok(validation.blockers.includes("source_text_must_not_be_included"));
  assert.ok(validation.blockers.includes("forbidden_key:source_text_traceability_sidecar.page_summary[1].source_text"));
  assert.ok(validation.blockers.includes("forbidden_key:source_text_traceability_sidecar.quality_gates.canon_promotion_allowed"));
  assert.ok(validation.blockers.includes("forbidden_key:source_text_traceability_sidecar.quality_gates.public_canon_entry"));
  assert.ok(validation.blockers.includes("forbidden_key:source_text_traceability_sidecar.authority.owner_approval_granted"));
  assert.ok(validation.blockers.includes("forbidden_key:source_text_traceability_sidecar.authority.source_truth_claimed"));
  assert.doesNotMatch(JSON.stringify(validation), /synthetic forbidden payload marker/);
});

test("quality review and work card validators block synthetic payload boundary contamination", () => {
  const fixtureSecretValue = "api_key=fake_rag_work_card_fixture_secret_value_1234567890";
  const fixtureSourceText = "fake-sentinel-source-text-body";
  const fixtureChunkText = "fake-sentinel-chunk-text-body";
  const fixtureRawQuery = "fake-sentinel-raw-query-body";
  const fixtureQuestion = "fake-sentinel-question-body";
  const fixtureFileUrl = "file://fixture/source.txt";
  const fixtureVolumePath = ["", "Volumes", "fixture", "source.txt"].join("/");
  const fixtureWindowsPath = ["C:", "fixture", "source.txt"].join("\\");
  const validQualityReview = {
    schema_version: "soulforge.source_text_quality_review.v0",
    kind: "source_text_quality_review",
    review_id: "fixture_quality_review_payload_boundary",
    status: "source_supported",
    source_refs: {
      source_text_index_ref: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture/source_text_index.json",
      traceability_sidecar_ref: "_workspaces/knowledge/rag/traceability_sidecars/fixture/traceability_sidecar.json",
      answer_run_ref: "_workspaces/knowledge/rag/answer_runs/fixture/source_text_answer_run.json",
    },
    boundary: {
      storage_scope: "_workspaces_private_payload",
      source_text_included: false,
      chunk_text_included: false,
      raw_query_persisted: false,
      public_repo_safe: false,
    },
    reviewed_pages: [
      {
        page_no: 1,
        review_status: "source_supported",
        chunk_ids: ["fixture_chunk_001"],
        citation_chunk_ids: ["fixture_chunk_001"],
        warning_codes: [],
        blocker_codes: [],
      },
    ],
    citation_reviews: [
      {
        chunk_id: "fixture_chunk_001",
        pages: [1],
        review_status: "source_supported",
        warning_codes: [],
        blocker_codes: [],
      },
    ],
  };
  assert.equal(validateSourceTextQualityReview(validQualityReview).status, "pass");

  const contaminatedQualityReview = JSON.parse(JSON.stringify(validQualityReview));
  contaminatedQualityReview.source_text = fixtureSourceText;
  contaminatedQualityReview.audit = {
    chunk_text: fixtureChunkText,
    raw_query: fixtureRawQuery,
    question: fixtureQuestion,
    file_ref: fixtureFileUrl,
    local_path: fixtureVolumePath,
    credentials: {
      api_key: fixtureSecretValue,
    },
  };
  const qualityReviewValidation = validateSourceTextQualityReview(contaminatedQualityReview);
  assert.equal(qualityReviewValidation.status, "blocked");
  assert.ok(qualityReviewValidation.blockers.includes("forbidden_payload_key:source_text_quality_review.source_text"));
  assert.ok(qualityReviewValidation.blockers.includes("forbidden_payload_key:source_text_quality_review.audit.chunk_text"));
  assert.ok(qualityReviewValidation.blockers.includes("forbidden_payload_key:source_text_quality_review.audit.raw_query"));
  assert.ok(qualityReviewValidation.blockers.includes("forbidden_payload_key:source_text_quality_review.audit.question"));
  assert.ok(qualityReviewValidation.blockers.includes("file_url_string:source_text_quality_review.audit.file_ref"));
  assert.ok(qualityReviewValidation.blockers.includes("local_absolute_path:source_text_quality_review.audit.local_path"));
  assert.ok(qualityReviewValidation.blockers.includes("secret_like_key:source_text_quality_review.audit.credentials"));
  assert.ok(qualityReviewValidation.blockers.includes("secret_like_key:source_text_quality_review.audit.credentials.api_key"));
  assert.ok(qualityReviewValidation.blockers.includes("secret_like_value:source_text_quality_review.audit.credentials.api_key"));
  assert.doesNotMatch(
    JSON.stringify(qualityReviewValidation),
    new RegExp([
      fixtureSourceText,
      fixtureChunkText,
      fixtureRawQuery,
      fixtureQuestion,
      fixtureSecretValue,
      "fixture/source.txt",
    ].join("|")),
  );

  const validWorkCard = {
    schema_version: "soulforge.source_text_work_card.v0",
    kind: "source_text_work_card",
    work_card_id: "fixture_work_card_payload_boundary",
    status: "ready",
    query: {
      query_label: "fixture_work_card_query_label",
      raw_query_persisted: false,
      query_fingerprint: "0".repeat(64),
    },
    source_refs: {
      source_text_answer_run_ref: "_workspaces/knowledge/rag/answer_runs/fixture/source_text_answer_run.json",
      source_text_quality_review_ref: "_workspaces/knowledge/rag/source_text_quality_reviews/fixture/source_text_quality_review.json",
    },
    boundary: {
      storage_scope: "_workspaces_private_payload",
      source_text_included: false,
      chunk_text_included: false,
      public_repo_safe: false,
    },
    citation_status: "source_supported",
    claim_ceiling: "source_supported",
    evidence_pages: [1],
    evidence_items: [
      {
        chunk_id: "fixture_chunk_001",
        pages: [1],
        evidence_status: "source_supported",
        warning_codes: [],
      },
    ],
  };
  assert.equal(validateRagWorkCard(validWorkCard).status, "pass");

  const contaminatedWorkCard = JSON.parse(JSON.stringify(validWorkCard));
  contaminatedWorkCard.query.raw_query = fixtureRawQuery;
  contaminatedWorkCard.query.question = fixtureQuestion;
  contaminatedWorkCard.evidence_items[0].source_text = fixtureSourceText;
  contaminatedWorkCard.evidence_items[0].chunk_text = fixtureChunkText;
  contaminatedWorkCard.evidence_items[0].file_ref = fixtureFileUrl;
  contaminatedWorkCard.diagnostics = {
    local_path: fixtureWindowsPath,
    secret: fixtureSecretValue,
  };
  const workCardValidation = validateRagWorkCard(contaminatedWorkCard);
  assert.equal(workCardValidation.status, "blocked");
  assert.ok(workCardValidation.blockers.includes("forbidden_payload_key:source_text_work_card.query.raw_query"));
  assert.ok(workCardValidation.blockers.includes("forbidden_payload_key:source_text_work_card.query.question"));
  assert.ok(workCardValidation.blockers.includes("forbidden_payload_key:source_text_work_card.evidence_items[0].source_text"));
  assert.ok(workCardValidation.blockers.includes("forbidden_payload_key:source_text_work_card.evidence_items[0].chunk_text"));
  assert.ok(workCardValidation.blockers.includes("file_url_string:source_text_work_card.evidence_items[0].file_ref"));
  assert.ok(workCardValidation.blockers.includes("local_absolute_path:source_text_work_card.diagnostics.local_path"));
  assert.ok(workCardValidation.blockers.includes("secret_like_key:source_text_work_card.diagnostics.secret"));
  assert.ok(workCardValidation.blockers.includes("secret_like_value:source_text_work_card.diagnostics.secret"));
  assert.doesNotMatch(
    JSON.stringify(workCardValidation),
    new RegExp([
      fixtureSourceText,
      fixtureChunkText,
      fixtureRawQuery,
      fixtureQuestion,
      fixtureSecretValue,
      "fixture/source.txt",
    ].join("|")),
  );
});

test("source-text runtime preflight resolves tools without exposing local paths", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-runtime-preflight-"));
  try {
    const fakeBin = path.join(repoRoot, "tool-bin");
    await writeFileWithParents(repoRoot, "guild_hall/state/tools/source_extraction_venv/Scripts/python.exe", "");
    await writeFileWithParents(repoRoot, "guild_hall/state/tools/source_extraction_venv/Scripts/docling.exe", "");
    await writeFileWithParents(repoRoot, "guild_hall/state/tools/tessdata/eng.traineddata", "eng");
    await writeFileWithParents(repoRoot, "guild_hall/state/tools/tessdata/kor.traineddata", "kor");
    await writeFileWithParents(repoRoot, "guild_hall/state/tools/tessdata/kor_vert.traineddata", "kor_vert");
    await writeFileWithParents(repoRoot, "guild_hall/state/tools/tessdata/osd.traineddata", "osd");
    await writeFileWithParents(fakeBin, "java.exe", "");
    await writeFileWithParents(fakeBin, "soffice.com", "");
    await writeFileWithParents(fakeBin, "tesseract.exe", "");

    const preflight = await buildSourceTextRuntimePreflight({
      repoRoot,
      platform: "win32",
      pathDelimiter: ";",
      env: {
        Path: fakeBin,
      },
      readWindowsUserEnv: false,
      collectVersions: false,
      now: "2026-05-26T10:00:00Z",
    });
    assert.equal(preflight.schema_version, "soulforge.source_text_runtime_preflight.v0");
    assert.equal(preflight.status, "ready");
    assert.equal(preflight.boundary.runtime_absolute_paths_included, false);
    assert.equal(preflight.boundary.runtime_paths_redacted, true);
    assert.equal(preflight.tools.find((tool) => tool.tool_id === "java_runtime").resolution.path_source, "process_environment_path");
    assert.equal(preflight.tools.find((tool) => tool.tool_id === "hwp_hwpx_converter").status, "not_required");
    assert.equal(validateSourceTextRuntimePreflight(preflight).status, "pass");
    assert.equal(JSON.stringify(preflight).includes(fakeBin), false);
    assert.doesNotMatch(JSON.stringify(preflight), /[A-Za-z]:[\\/]|file:\/\//);

    const hwpRequired = await buildSourceTextRuntimePreflight({
      repoRoot,
      platform: "win32",
      pathDelimiter: ";",
      env: {
        Path: fakeBin,
      },
      readWindowsUserEnv: false,
      collectVersions: false,
      requireHwpConverter: true,
      now: "2026-05-26T10:01:00Z",
    });
    assert.equal(hwpRequired.status, "blocked");
    assert.ok(hwpRequired.blockers.includes("required_tool_not_resolved:hwp_hwpx_converter"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("source-text runtime preflight CLI smoke resolves fake runtime without exposing local paths", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-runtime-cli-"));
  try {
    const fakeBin = path.join(repoRoot, "tool-bin");
    await writeSourceTextRuntimePreflightCliFixture(repoRoot, fakeBin);

    const result = await runRagCli([
      "source-text-runtime-preflight",
      "--repo-root",
      repoRoot,
      "--no-version",
      "--now",
      "2026-06-05T01:00:00Z",
    ], {
      env: sourceTextRuntimePreflightCliEnv(fakeBin),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assertNoUnsafeRuntimePreflightCliOutput(result.stdout, repoRoot);
    assertNoUnsafeRuntimePreflightCliOutput(result.stdout, fakeBin);
    assertNoUnsafeRuntimePreflightCliOutput(result.stdout, RUNTIME_PREFLIGHT_FAKE_SECRET_ENV_KEY);
    assertNoUnsafeRuntimePreflightCliOutput(result.stdout, RUNTIME_PREFLIGHT_FAKE_SECRET_ENV_VALUE);

    const preflight = JSON.parse(result.stdout);
    assert.equal(preflight.status, "ready");
    assert.equal(preflight.validation.status, "pass");
    assert.equal(preflight.boundary.metadata_only, true);
    assert.equal(preflight.boundary.preflight_only, true);
    assert.equal(preflight.boundary.source_files_opened, false);
    assert.equal(preflight.boundary.source_text_read, false);
    assert.equal(preflight.boundary.source_payloads_included, false);
    assert.equal(preflight.boundary.private_payloads_written, false);
    assert.equal(preflight.boundary.index_build_executed, false);
    assert.equal(preflight.boundary.runtime_absolute_paths_included, false);
    assert.equal(preflight.boundary.runtime_paths_redacted, true);
    assert.equal(preflight.validation.boundary.no_source_files_opened, true);
    assert.equal(preflight.validation.boundary.no_source_text_read, true);
    assert.equal(preflight.validation.boundary.no_source_payloads, true);
    assert.equal(preflight.validation.boundary.no_runtime_absolute_paths, true);
    assert.equal(preflight.tools.find((tool) => tool.tool_id === "hwp_hwpx_converter").status, "not_required");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("source-text runtime preflight CLI blocks missing required hwp converter without exposing local paths", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-runtime-cli-hwp-"));
  try {
    const fakeBin = path.join(repoRoot, "tool-bin");
    await writeSourceTextRuntimePreflightCliFixture(repoRoot, fakeBin);

    const result = await runRagCli([
      "source-text-runtime-preflight",
      "--repo-root",
      repoRoot,
      "--no-version",
      "--require-hwp-converter",
      "--now",
      "2026-06-05T01:05:00Z",
    ], {
      env: sourceTextRuntimePreflightCliEnv(fakeBin),
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, "");
    assertNoUnsafeRuntimePreflightCliOutput(result.stdout, repoRoot);
    assertNoUnsafeRuntimePreflightCliOutput(result.stdout, fakeBin);
    assertNoUnsafeRuntimePreflightCliOutput(result.stdout, RUNTIME_PREFLIGHT_FAKE_SECRET_ENV_KEY);
    assertNoUnsafeRuntimePreflightCliOutput(result.stdout, RUNTIME_PREFLIGHT_FAKE_SECRET_ENV_VALUE);

    const preflight = JSON.parse(result.stdout);
    assert.equal(preflight.status, "blocked");
    assert.equal(preflight.validation.status, "blocked");
    assert.ok(preflight.blockers.includes("required_tool_not_resolved:hwp_hwpx_converter"));
    assert.ok(preflight.validation.blockers.includes("required_tool_missing:hwp_hwpx_converter"));
    assertNoUnsafeRuntimePreflightBlockers(preflight.blockers);
    assertNoUnsafeRuntimePreflightBlockers(preflight.validation.blockers);
    assert.equal(preflight.boundary.source_files_opened, false);
    assert.equal(preflight.boundary.source_text_read, false);
    assert.equal(preflight.boundary.source_payloads_included, false);
    assert.equal(preflight.boundary.private_payloads_written, false);
    assert.equal(preflight.boundary.runtime_absolute_paths_included, false);
    assert.equal(preflight.validation.boundary.no_runtime_absolute_paths, true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("source sync ready manifest gates OneDrive-style source-text indexing", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-sync-ready-"));
  try {
    const sourceRef = "_workspaces/knowledge/common/systems_engineering/starter/sync_ready_fixture.md";
    const sourceCardRef = "_workspaces/knowledge/source_cards/sync_ready_fixture.source_card.json";
    const readyRef = "_workspaces/knowledge/common/systems_engineering/starter/sync_ready_fixture.ready.json";
    const sourceText = [
      "# Sync Ready Fixture",
      "",
      "This derived Markdown file is ready only when the ready manifest size and sha256 match.",
    ].join("\n");
    const sourceFileText = `${sourceText}\n`;
    await writeFileWithParents(repoRoot, sourceRef, sourceText);
    const sourceCard = {
      schema_version: "soulforge.knowledge_source_card.v0",
      source_id: "sync_ready_fixture",
      title: "Sync Ready Fixture",
      source_ref: {
        repo_relative_path: sourceRef,
      },
      source_sync_ready_ref: readyRef,
      source_kind: "markdown_source_text",
      domains: ["systems_engineering", "knowledge_management"],
      sensitivity: "internal_common",
      approval_status: "owner_approved_starter_source",
      rag_permissions: {
        source_text_retrieval: true,
        index_build: true,
        answer_synthesis: true,
      },
      public_canon_promotion_allowed: false,
      notebooklm_packet_allowed: false,
      claim_ceiling: "observed",
    };
    const sourceCardText = `${JSON.stringify(sourceCard, null, 2)}\n`;
    await writeFileWithParents(repoRoot, sourceCardRef, JSON.stringify(sourceCard, null, 2));
    const readyManifest = {
      schema_version: SOURCE_SYNC_READY_MANIFEST_SCHEMA_VERSION,
      kind: "source_sync_ready_manifest",
      manifest_id: "sync_ready_fixture_ready",
      source_id: "sync_ready_fixture",
      source_card_ref: sourceCardRef,
      status: "ready_for_index",
      created_at_utc: "2026-05-26T08:30:00Z",
      producer: {
        origin_label: "company_pc_fixture",
        tool_label: "owner_export_program_fixture",
        prepared_by_role: "owner_or_steward",
      },
      boundary: {
        metadata_only: true,
        ready_file_is_not_owner_approval: true,
        ready_file_is_not_source_truth: true,
        raw_payloads_included: false,
        source_payloads_included: false,
        source_text_included: false,
        chunk_payloads_included: false,
        notebooklm_answers_included: false,
        secrets_or_session_included: false,
        runtime_absolute_paths_included: false,
      },
      indexing_gate: {
        source_text_ref: sourceRef,
        min_stable_ms: 0,
        requires_source_card_validation: true,
        requires_hash_match: true,
      },
      files: [
        {
          role: "source_card",
          repo_relative_path: sourceCardRef,
          size_bytes: Buffer.byteLength(sourceCardText),
          sha256: `sha256:${sha256Hex(sourceCardText)}`,
          required: true,
          media_type_label: "application_json",
        },
        {
          role: "derived_text",
          repo_relative_path: sourceRef,
          size_bytes: Buffer.byteLength(sourceFileText),
          sha256: `sha256:${sha256Hex(sourceFileText)}`,
          required: true,
          media_type_label: "text_markdown",
        },
      ],
    };
    await writeFileWithParents(repoRoot, readyRef, JSON.stringify(readyManifest, null, 2));

    const readyValidation = await validateSourceSyncReadyManifest(readyManifest, {
      repoRoot,
      readyRef,
      sourceCardRef,
      sourceTextRef: sourceRef,
    });
    assert.equal(readyValidation.schema_version, "soulforge.source_sync_ready_manifest_validation.v0");
    assert.equal(readyValidation.status, "pass");
    assert.equal(readyValidation.counts.checked_file_count, 2);
    assert.equal(readyValidation.files.every((file) => file.exists && file.size_match && file.sha256_match), true);

    const gatedIndex = await buildSourceTextIndex({
      repoRoot,
      sourceCardRef,
      indexId: "sync_ready_fixture_index",
      now: "2026-05-26T08:31:00Z",
    });
    assert.equal(gatedIndex.status, "ready");
    assert.equal(gatedIndex.source_refs.source_sync_ready_ref, readyRef);
    assert.equal(gatedIndex.validation.sync_ready_validation, "pass");
    assert.equal(validateSourceTextIndex(gatedIndex).status, "pass");

    const brokenReadyRef = "_workspaces/knowledge/common/systems_engineering/starter/sync_ready_fixture_broken.ready.json";
    const brokenReadyManifest = {
      ...readyManifest,
      manifest_id: "sync_ready_fixture_broken_ready",
      files: [
        readyManifest.files[0],
        {
          ...readyManifest.files[1],
          sha256: `sha256:${"0".repeat(64)}`,
        },
      ],
    };
    await writeFileWithParents(repoRoot, brokenReadyRef, JSON.stringify(brokenReadyManifest, null, 2));
    const blockedIndex = await buildSourceTextIndex({
      repoRoot,
      sourceCardRef,
      readyManifestRef: brokenReadyRef,
      indexId: "sync_ready_fixture_blocked_index",
    });
    assert.equal(blockedIndex.status, "blocked_sync_not_ready");
    assert.equal(blockedIndex.boundary.source_text_loaded, false);
    assert.equal(blockedIndex.counts.chunk_count, 0);
    assert.ok(blockedIndex.validation.sync_ready_validation.blockers.includes("file_sha256_mismatch:files[1]"));
    assert.equal(validateSourceTextIndex(blockedIndex).status, "pass");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("source sync ready manifest blocks unsafe raw path url and secret markers without file checks", async () => {
  const sourceRef = "_workspaces/knowledge/common/systems_engineering/starter/sync_ready_negative_fixture.md";
  const sourceCardRef = "_workspaces/knowledge/source_cards/sync_ready_negative_fixture.source_card.json";
  const fakeWindowsPath = ["C:", "fixture", "source.txt"].join("\\");
  const unsafeReadyManifest = {
    schema_version: SOURCE_SYNC_READY_MANIFEST_SCHEMA_VERSION,
    kind: "source_sync_ready_manifest",
    manifest_id: "sync_ready_negative_fixture_ready",
    source_id: "sync_ready_negative_fixture",
    source_card_ref: sourceCardRef,
    status: "ready_for_index",
    created_at_utc: "2026-05-26T09:30:00Z",
    raw_payload: "fixture_raw_marker",
    alias_contamination: {
      drive_file_id: "fixture_drive_file_id",
      drive_id: "fixture_drive_id",
      google_drive_file_id: "fixture_google_drive_file_id",
      notebooklm_notebook_id: "fixture_notebooklm_notebook_id",
      notebooklm_source_id: "fixture_notebooklm_source_id",
      oauth_state: "fixture_oauth_state",
      live_account_state: "fixture_live_account_state",
      owner_approval_granted: true,
      public_canon_entry: "fixture_public_canon_entry",
    },
    producer: {
      origin_label: "company_pc_fixture",
      tool_label: "file://fixture/source.txt",
      prepared_by_role: "api_key=fake_fixture_token_value_1234567890",
    },
    boundary: {
      metadata_only: true,
      ready_file_is_not_owner_approval: true,
      ready_file_is_not_source_truth: true,
      raw_payloads_included: false,
      source_payloads_included: false,
      source_text_included: false,
      chunk_payloads_included: false,
      notebooklm_answers_included: false,
      secrets_or_session_included: false,
      runtime_absolute_paths_included: false,
    },
    indexing_gate: {
      source_text_ref: sourceRef,
      min_stable_ms: 0,
      requires_source_card_validation: true,
      requires_hash_match: true,
    },
    files: [
      {
        role: "source_card",
        repo_relative_path: sourceCardRef,
        size_bytes: 128,
        sha256: `sha256:${"a".repeat(64)}`,
        required: true,
        media_type_label: "application_json",
      },
      {
        role: "derived_text",
        repo_relative_path: sourceRef,
        size_bytes: 256,
        sha256: `sha256:${"b".repeat(64)}`,
        required: true,
        media_type_label: fakeWindowsPath,
      },
    ],
  };

  const validation = await validateSourceSyncReadyManifest(unsafeReadyManifest, {
    checkFiles: false,
  });

  assert.equal(validation.status, "blocked");
  assert.equal(validation.ready_for_index, false);
  assert.ok(
    validation.blockers.some((item) => item.startsWith("source_sync_ready_forbidden_raw_or_payload_key")),
  );
  assert.ok(validation.blockers.some((item) => item.startsWith("source_sync_ready_url_string")));
  assert.ok(validation.blockers.some((item) => item.startsWith("source_sync_ready_local_absolute_path")));
  assert.ok(validation.blockers.some((item) => item.startsWith("source_sync_ready_secret_like_value")));
  for (const key of [
    "drive_file_id",
    "drive_id",
    "google_drive_file_id",
    "notebooklm_notebook_id",
    "notebooklm_source_id",
    "oauth_state",
    "live_account_state",
    "owner_approval_granted",
    "public_canon_entry",
  ]) {
    assert.ok(
      validation.blockers.includes(
        `source_sync_ready_forbidden_raw_or_payload_key:source_sync_ready_manifest.alias_contamination.${key}`,
      ),
    );
  }
});

test("operational route registry validates and resolves without source payloads", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-operational-route-"));
  try {
    const workCardRef = "_workspaces/knowledge/rag/source_text_work_cards/fixture_requirements_card/source_text_work_card.json";
    const operatorCardRef = "_workspaces/knowledge/rag/operational_routes/fixture/operator_answer_cards/fixture_requirements.md";
    const wikiPageRef = "_workspaces/knowledge/wiki/private/fixture/current_scope/routes/fixture_requirements.md";
    const registryRef = "_workspaces/knowledge/rag/operational_routes/fixture/route_registry.yaml";
    const smokeTestsRef = "_workspaces/knowledge/rag/operational_routes/fixture/smoke_tests.yaml";
    const workCard = {
      schema_version: "soulforge.source_text_work_card.v0",
      kind: "source_text_work_card",
      work_card_id: "fixture_requirements_card",
      status: "manual_review",
      query: {
        query_label: "development requirements check",
        raw_query_persisted: false,
      },
      source_refs: {
        source_text_answer_run_ref: "_workspaces/knowledge/rag/answer_runs/fixture/source_text_answer_run.json",
        source_text_quality_review_ref: "_workspaces/knowledge/rag/source_text_quality_reviews/fixture/source_text_quality_review.json",
      },
      boundary: {
        storage_scope: "_workspaces_private_payload",
        source_text_included: false,
        chunk_text_included: false,
        public_repo_safe: false,
      },
      claim_ceiling: "source_supported",
      evidence_pages: [2, 5],
      evidence_items: [
        {
          chunk_id: "fixture_chunk_001",
          pages: [2, 5],
          evidence_status: "manual_review",
          warning_codes: ["table_present_on_page"],
        },
      ],
    };
    await writeFileWithParents(repoRoot, workCardRef, JSON.stringify(workCard, null, 2));
    await writeFileWithParents(
      repoRoot,
      operatorCardRef,
      [
        "# Fixture operator answer",
        "",
        "Route id: `fixture_requirements_route`",
        "",
        "Selected work card:",
        "",
        "`fixture_requirements_card`",
        "",
        "Evidence pages:",
        "",
        "`2`, `5`",
        "",
        "Manual-review notice:",
        "",
        "This answer is a source-supported/manual-review work-card answer. It is not final doctrine or source truth promotion.",
      ].join("\n"),
    );
    await writeFileWithParents(repoRoot, wikiPageRef, "# Fixture wiki route");
    await writeFileWithParents(
      repoRoot,
      registryRef,
      [
        "schema_version: soulforge.fixture.operational_route_registry.v0",
        "kind: private_operational_route_registry",
        "registry_id: fixture_current_scope_manual_review",
        "status: active_private_manual_review",
        "boundary:",
        "  visibility: private_local_workspace",
        "  source_text_included: false",
        "  chunk_text_included: false",
        "  copied_excerpt_included: false",
        "  notebooklm_answer_included: false",
        "  source_truth_claimed: false",
        "  final_answer_authority_allowed: false",
        "  public_canon_promotion_allowed: false",
        "  ontology_acceptance_allowed: false",
        "  external_upload_allowed: false",
        "  default_route_mutation_allowed: false",
        "  graph_truth_mutation_allowed: false",
        "route_defaults:",
        "  route_state: active_private_manual_review",
        "  response_mode: operator_answer_shell_with_manual_review_notice",
        "  claim_ceiling: source_supported_manual_review_current_claim_scope_only",
        "  source_payload_loading_allowed: false",
        "  use_as_public_default_route: false",
        "routes:",
        "  - route_id: fixture_requirements_route",
        "    trigger_labels:",
        "      - \"development requirements check\"",
        "      - \"requirements verification summary\"",
        "    selected_work_card_id: fixture_requirements_card",
        `    selected_work_card_ref: "${workCardRef}"`,
        `    operator_answer_card_ref: "${operatorCardRef}"`,
        `    wiki_page_ref: "${wikiPageRef}"`,
        "    evidence_pages: [2, 5]",
        "    review_context_pages: [2]",
        "    current_known_gap: \"table-sensitive manual review only\"",
      ].join("\n"),
    );
    await writeFileWithParents(
      repoRoot,
      smokeTestsRef,
      [
        "schema_version: soulforge.fixture.operational_route_smoke_tests.v0",
        "kind: operational_route_smoke_tests",
        "test_set_id: fixture_current_scope_manual_review",
        "tests:",
        "  - test_id: fixture_route_smoke_001",
        "    query_label: \"development requirements check\"",
        "    expected_route_id: fixture_requirements_route",
        "    expected_work_card_id: fixture_requirements_card",
        "    expected_evidence_pages: [2, 5]",
      ].join("\n"),
    );

    const validation = await validateOperationalRouteRegistry({ repoRoot, registryRef });
    assert.equal(validation.status, "pass");
    assert.equal(validation.routes[0].work_card_validation_status, "pass");

    const catalog = await buildOperationalRouteCatalog({
      repoRoot,
      registryRef,
      now: "2026-05-28T00:00:00Z",
    });
    assert.equal(catalog.status, "ready_private_manual_review");
    assert.equal(catalog.counts.route_count, 1);
    assert.equal(catalog.routes[0].route_id, "fixture_requirements_route");
    assert.equal(catalog.routes[0].trigger_label_count, 2);
    assert.equal(catalog.boundary.source_text_loaded, false);
    const catalogText = renderOperationalRouteCatalogText(catalog);
    assert.match(catalogText, /Status: ready_private_manual_review/);
    assert.match(catalogText, /fixture_requirements_route/);
    assert.match(catalogText, /Trigger labels: 2/);
    assert.doesNotMatch(catalogText, /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);
    assert.doesNotMatch(JSON.stringify(catalog), /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const resolution = await resolveOperationalRoute({
      repoRoot,
      registryRef,
      queryLabel: "development requirements check",
      now: "2026-05-28T00:00:00Z",
    });
    assert.equal(resolution.status, "matched");
    assert.equal(resolution.selected_route.route_id, "fixture_requirements_route");
    assert.equal(resolution.selected_route.selected_work_card_id, "fixture_requirements_card");
    assert.equal(resolution.selected_route.evidence_pages.join(","), "2,5");
    assert.equal(resolution.boundary.source_text_loaded, false);
    assert.doesNotMatch(JSON.stringify(resolution), /"source_text"\s*:|"chunk_text"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);
    assert.match(renderOperationalRouteResolutionText(resolution), /private\/manual-review route only/);
    const answerShell = await renderOperationalRouteAnswerShell({
      repoRoot,
      registryRef,
      queryLabel: "development requirements check",
      now: "2026-05-28T00:00:00Z",
    });
    assert.match(answerShell, /Fixture operator answer/);
    assert.match(answerShell, /private operator answer card only/);

    const smokeRun = await runOperationalRouteSmokeTests({ repoRoot, registryRef, smokeTestRef: smokeTestsRef });
    assert.equal(smokeRun.status, "pass");
    assert.equal(smokeRun.counts.pass_count, 1);

    const answerCardValidation = await validateOperationalRouteAnswerCards({
      repoRoot,
      registryRef,
      validationId: "fixture_answer_card_validation",
      now: "2026-05-28T00:30:00Z",
    });
    assert.equal(answerCardValidation.status, "pass");
    assert.equal(answerCardValidation.counts.pass_count, 1);
    assert.equal(answerCardValidation.routes[0].checks.stronger_authority_denial_present, true);
    assert.doesNotMatch(JSON.stringify(answerCardValidation), /Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const preflight = await buildOperationalRoutePreflight({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      preflightId: "fixture_operational_route_preflight",
      now: "2026-05-28T00:40:00Z",
    });
    assert.equal(preflight.status, "pass_private_manual_review_ready");
    assert.equal(preflight.counts.route_count, 1);
    assert.equal(preflight.answer_card_validation.status, "pass");
    assert.equal(preflight.smoke_run.status, "pass");
    assert.equal(preflight.routes[0].route_id, "fixture_requirements_route");
    assert.equal(preflight.routes[0].answer_card_status, "pass");
    assert.equal(preflight.routes[0].smoke_status, "pass");
    assert.equal(validateOperationalRoutePreflight(preflight).status, "pass");
    const preflightText = renderOperationalRoutePreflightText(preflight);
    assert.match(preflightText, /pass_private_manual_review_ready/);
    assert.match(preflightText, /fixture_requirements_route/);
    assert.doesNotMatch(preflightText, /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);
    assert.doesNotMatch(JSON.stringify(preflight), /Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const dashboard = await buildOperationalRouteDashboard({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      now: "2026-05-28T00:40:30Z",
    });
    assert.equal(dashboard.status, "ready_private_manual_review");
    assert.equal(dashboard.summary.route_count, 1);
    assert.equal(dashboard.summary.preflight_status, "pass_private_manual_review_ready");
    assert.equal(dashboard.routes[0].route_id, "fixture_requirements_route");
    assert.equal(dashboard.routes[0].answer_card_status, "pass");
    assert.equal(dashboard.boundary.source_text_loaded, false);
    assert.equal(validateOperationalRouteDashboard(dashboard).status, "pass");
    const dashboardText = renderOperationalRouteDashboardText(dashboard);
    assert.match(dashboardText, /Status: ready_private_manual_review/);
    assert.match(dashboardText, /Preflight: pass_private_manual_review_ready/);
    assert.match(dashboardText, /fixture_requirements_route/);
    assert.doesNotMatch(dashboardText, /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);
    assert.doesNotMatch(JSON.stringify(dashboard), /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const callPlan = await buildOperationalRouteCallPlan({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_call_plan",
      now: "2026-05-28T00:40:45Z",
    });
    assert.equal(callPlan.status, "ready_to_answer_manual_review");
    assert.equal(callPlan.selected_route.route_id, "fixture_requirements_route");
    assert.equal(callPlan.operator_surface.answer_shell_available, true);
    assert.equal(callPlan.raw_query_persisted, false);
    assert.equal(validateOperationalRouteCallPlan(callPlan).status, "pass");
    const callPlanText = renderOperationalRouteCallPlanText(callPlan);
    assert.match(callPlanText, /Status: ready_to_answer_manual_review/);
    assert.match(callPlanText, /Route: fixture_requirements_route/);
    assert.match(callPlanText, /Raw query persisted: no/);
    assert.doesNotMatch(callPlanText, /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);
    assert.doesNotMatch(JSON.stringify(callPlan), /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const callPlanWrite = await writeOperationalRouteCallPlan({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_call_plan_written",
      now: "2026-05-28T00:40:47Z",
    });
    assert.equal(callPlanWrite.status, "written");
    assert.match(callPlanWrite.operational_route_call_plan_ref, /^_workmeta\/system\/reports\/rag\/operational_route_call_plans\//);
    assert.equal(callPlanWrite.route_id, "fixture_requirements_route");
    assert.equal(callPlanWrite.raw_query_persisted, false);
    assert.equal(callPlanWrite.answer_shell_output_persisted, false);
    const writtenCallPlan = await loadOperationalRouteCallPlan({
      repoRoot,
      callPlanRef: callPlanWrite.operational_route_call_plan_ref,
    });
    assert.equal(validateOperationalRouteCallPlan(writtenCallPlan).status, "pass");
    const writtenCallPlanText = renderOperationalRouteCallPlanText(writtenCallPlan);
    assert.match(writtenCallPlanText, /Status: ready_to_answer_manual_review/);
    assert.match(writtenCallPlanText, /Raw query persisted: no/);
    assert.doesNotMatch(JSON.stringify(writtenCallPlan), /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const operatorRun = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_operator_run",
      now: "2026-05-28T00:40:50Z",
    });
    assert.match(operatorRun, /Status: ready_to_answer_manual_review/);
    assert.match(operatorRun, /Operator answer shell \(terminal-only\):/);
    assert.match(operatorRun, /Fixture operator answer/);
    assert.match(operatorRun, /private operator answer card only/);
    assert.doesNotMatch(operatorRun, /development requirements check|usage_record_ref|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);

    const preflightWrite = await writeOperationalRoutePreflight({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      preflightId: "fixture_operational_route_preflight_written",
      now: "2026-05-28T00:41:00Z",
    });
    assert.equal(preflightWrite.status, "written");
    assert.equal(preflightWrite.preflight_status, "pass_private_manual_review_ready");
    const writtenPreflight = await loadOperationalRoutePreflight({
      repoRoot,
      preflightRef: preflightWrite.operational_route_preflight_ref,
    });
    assert.equal(validateOperationalRoutePreflight(writtenPreflight).status, "pass");
    const writtenPreflightText = renderOperationalRoutePreflightText(writtenPreflight);
    assert.match(writtenPreflightText, /pass_private_manual_review_ready/);
    assert.match(writtenPreflightText, /fixture_requirements_route/);
    assert.doesNotMatch(writtenPreflightText, /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const session = await buildOperationalRouteSession({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "development requirements check",
      sessionId: "fixture_operational_route_session",
      now: "2026-05-28T00:42:00Z",
    });
    assert.equal(session.status, "ready_matched_route");
    assert.equal(session.selected_route.route_id, "fixture_requirements_route");
    assert.equal(session.preflight_summary.status, "pass_private_manual_review_ready");
    assert.equal(session.raw_query_persisted, false);
    assert.equal(session.operator_surface.answer_shell_output_persisted, false);
    assert.equal(validateOperationalRouteSession(session).status, "pass");
    const sessionDigest = renderOperationalRouteSessionDigest(session);
    assert.match(sessionDigest, /Status: ready_matched_route/);
    assert.match(sessionDigest, /Raw query persisted: no/);
    assert.doesNotMatch(sessionDigest, /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);
    assert.doesNotMatch(JSON.stringify(session), /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const sessionWrite = await writeOperationalRouteSession({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "development requirements check",
      sessionId: "fixture_operational_route_session_written",
      now: "2026-05-28T00:43:00Z",
    });
    assert.equal(sessionWrite.status, "written");
    assert.equal(sessionWrite.session_status, "ready_matched_route");
    assert.equal(sessionWrite.raw_query_persisted, false);
    const writtenSession = await loadOperationalRouteSession({
      repoRoot,
      sessionRef: sessionWrite.operational_route_session_ref,
    });
    assert.equal(validateOperationalRouteSession(writtenSession).status, "pass");
    const writtenSessionDigest = renderOperationalRouteSessionDigest(writtenSession);
    assert.match(writtenSessionDigest, /Status: ready_matched_route/);
    assert.match(writtenSessionDigest, /Operator answer card: _workspaces\/knowledge\/rag\/operational_routes\/fixture\/operator_answer_cards\/fixture_requirements.md/);
    assert.match(writtenSessionDigest, /Raw query persisted: no/);
    assert.match(writtenSessionDigest, /Answer shell output persisted: no/);
    assert.doesNotMatch(writtenSessionDigest, /development requirements check|Fixture operator answer|source-supported\/manual-review work-card answer|\/Users\/|[A-Za-z]:[\\/]/);

    const unmatchedSession = await buildOperationalRouteSession({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "aircraft paint supplier audit",
      sessionId: "fixture_unmatched_operational_route_session",
      now: "2026-05-28T00:44:00Z",
    });
    assert.equal(unmatchedSession.status, "blocked_no_route_candidate_capture_recommended");
    assert.equal(unmatchedSession.selected_route, null);
    assert.equal(unmatchedSession.operator_surface.candidate_record_recommended, true);
    assert.equal(validateOperationalRouteSession(unmatchedSession).status, "pass");
    assert.doesNotMatch(JSON.stringify(unmatchedSession), /aircraft paint supplier audit|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);

    const sessionSweep = await buildOperationalRouteSessionSweep({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      sweepId: "fixture_operational_route_sweep",
      now: "2026-05-28T00:45:00Z",
    });
    assert.equal(sessionSweep.status, "pass_private_manual_review_route_set_ready");
    assert.equal(sessionSweep.counts.case_count, 1);
    assert.equal(sessionSweep.counts.pass_count, 1);
    assert.equal(sessionSweep.counts.unique_route_count, 1);
    assert.equal(sessionSweep.cases[0].actual_route_id, "fixture_requirements_route");
    assert.equal(sessionSweep.cases[0].raw_query_persisted, false);
    assert.equal(sessionSweep.boundary.session_sweep_writes_usage_or_candidate, false);
    assert.equal(validateOperationalRouteSessionSweep(sessionSweep).status, "pass");
    const sessionSweepText = renderOperationalRouteSessionSweepText(sessionSweep);
    assert.match(sessionSweepText, /pass_private_manual_review_route_set_ready/);
    assert.match(sessionSweepText, /fixture_route_smoke_001/);
    assert.doesNotMatch(sessionSweepText, /development requirements check|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);

    const sessionSweepWrite = await writeOperationalRouteSessionSweep({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      sweepId: "fixture_operational_route_sweep_written",
      now: "2026-05-28T00:46:00Z",
    });
    assert.equal(sessionSweepWrite.status, "written");
    assert.match(sessionSweepWrite.operational_route_session_sweep_ref, /^_workmeta\/system\/reports\/rag\/operational_route_sweeps\//);
    const writtenSessionSweep = await loadOperationalRouteSessionSweep({
      repoRoot,
      sweepRef: sessionSweepWrite.operational_route_session_sweep_ref,
    });
    assert.equal(validateOperationalRouteSessionSweep(writtenSessionSweep).status, "pass");
    const writtenSessionSweepText = renderOperationalRouteSessionSweepText(writtenSessionSweep);
    assert.match(writtenSessionSweepText, /pass_private_manual_review_route_set_ready/);
    assert.match(writtenSessionSweepText, /fixture_route_smoke_001/);
    assert.doesNotMatch(writtenSessionSweepText, /development requirements check|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);
    assert.doesNotMatch(JSON.stringify(writtenSessionSweep), /development requirements check|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const maliciousSessionSweepValidation = validateOperationalRouteSessionSweep({
      schema_version: "soulforge.operational_route_session_sweep.v0",
      kind: "operational_route_session_sweep",
      sweep_id: "fixture_malicious_session_sweep",
      registry_ref: registryRef,
      smoke_test_ref: smokeTestsRef,
      status: "pass_private_manual_review_route_set_ready",
      answer_shell_output: "SHOULD_BLOCK",
      cases: [
        {
          smoke_test_id: "fixture_route_smoke_001",
          session_id: "fixture_malicious_session",
          status: "pass",
          session_validation_status: "pass",
          raw_query_persisted: true,
          answer_shell_output_persisted: true,
          answer_card_body_persisted: true,
        },
      ],
      authority: {
        source_truth_claimed: true,
        final_answer_authority_allowed: true,
        public_canon_promotion_allowed: true,
        ontology_acceptance_allowed: true,
        graph_truth_mutation_allowed: true,
        default_route_mutation_allowed: true,
        external_upload_allowed: true,
        sourcebound_review_launch_allowed_here: true,
      },
      boundary: {
        metadata_only: true,
        source_text_loaded: false,
        chunk_text_loaded: false,
        session_sweep_writes_usage_or_candidate: true,
        session_sweep_executes_answer_shell: true,
        session_sweep_persists_raw_query: true,
        answer_shell_output_persisted: true,
        answer_card_body_persisted: true,
        final_answer_authority_allowed: true,
        public_canon_promotion_allowed: true,
        ontology_acceptance_allowed: true,
        default_route_mutation_allowed: true,
        graph_truth_mutation_allowed: true,
      },
    });
    assert.equal(maliciousSessionSweepValidation.status, "blocked");
    assert.ok(maliciousSessionSweepValidation.blockers.includes("forbidden_payload_key:operational_route_session_sweep.answer_shell_output"));
    assert.ok(maliciousSessionSweepValidation.blockers.includes("case_raw_query_must_not_be_persisted"));
    assert.ok(maliciousSessionSweepValidation.blockers.includes("case_answer_shell_output_must_not_be_persisted"));
    assert.ok(maliciousSessionSweepValidation.blockers.includes("case_answer_card_body_must_not_be_persisted"));
    assert.ok(maliciousSessionSweepValidation.blockers.includes("authority_source_truth_claimed_must_be_false"));
    assert.ok(maliciousSessionSweepValidation.blockers.includes("authority_sourcebound_review_launch_allowed_here_must_be_false"));
    assert.ok(maliciousSessionSweepValidation.blockers.includes("boundary_session_sweep_writes_usage_or_candidate_must_be_false"));
    assert.ok(maliciousSessionSweepValidation.blockers.includes("boundary_session_sweep_executes_answer_shell_must_be_false"));
    assert.ok(maliciousSessionSweepValidation.blockers.includes("boundary_session_sweep_persists_raw_query_must_be_false"));

    const readiness = await buildOperationalRouteReadiness({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      readinessId: "fixture_operational_route_readiness",
      now: "2026-05-28T00:47:00Z",
    });
    assert.equal(readiness.status, "ready_private_manual_review_below_repeated_use_threshold");
    assert.equal(readiness.counts.route_sweep_pass_count, 1);
    assert.equal(readiness.counts.usage_record_count, 0);
    assert.equal(readiness.surfaces.ops_check.validation_status, "pass");
    assert.equal(readiness.surfaces.route_sweep.validation_status, "pass");
    assert.equal(readiness.boundary.readiness_writes_usage_or_candidate, false);
    assert.equal(readiness.authority.sourcebound_review_launch_allowed_here, false);
    assert.equal(validateOperationalRouteReadiness(readiness).status, "pass");
    const readinessText = renderOperationalRouteReadinessText(readiness);
    assert.match(readinessText, /ready_private_manual_review_below_repeated_use_threshold/);
    assert.match(readinessText, /route_sweep/);
    assert.doesNotMatch(readinessText, /development requirements check|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);

    const readinessWrite = await writeOperationalRouteReadiness({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      readinessId: "fixture_operational_route_readiness_written",
      now: "2026-05-28T00:48:00Z",
    });
    assert.equal(readinessWrite.status, "written");
    assert.match(readinessWrite.operational_route_readiness_ref, /^_workmeta\/system\/reports\/rag\/operational_route_readiness\//);
    const writtenReadiness = await loadOperationalRouteReadiness({
      repoRoot,
      readinessRef: readinessWrite.operational_route_readiness_ref,
    });
    assert.equal(validateOperationalRouteReadiness(writtenReadiness).status, "pass");
    assert.equal(writtenReadiness.boundary.readiness_launches_sourcebound_review, false);
    assert.doesNotMatch(JSON.stringify(writtenReadiness), /development requirements check|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const maliciousReadinessValidation = validateOperationalRouteReadiness({
      schema_version: "soulforge.operational_route_readiness.v0",
      kind: "operational_route_readiness",
      readiness_id: "fixture_malicious_readiness",
      registry_ref: registryRef,
      smoke_test_ref: smokeTestsRef,
      status: "ready_private_manual_review_below_repeated_use_threshold",
      answer_card_body: "SHOULD_BLOCK",
      surfaces: {
        ops_check: { status: "pass_private_manual_review_ready", validation_status: "pass" },
        route_sweep: { status: "pass_private_manual_review_route_set_ready", validation_status: "pass" },
      },
      authority: {
        operator_use_allowed: true,
        sourcebound_review_launch_allowed_here: true,
        source_truth_claimed_here: true,
        final_answer_authority_allowed_here: true,
        public_canon_promotion_allowed_here: true,
        ontology_acceptance_allowed_here: true,
        graph_truth_mutation_allowed_here: true,
        default_route_mutation_allowed_here: true,
        external_upload_allowed_here: true,
      },
      boundary: {
        metadata_only: true,
        source_text_loaded: false,
        chunk_text_loaded: false,
        source_payloads_included: false,
        copied_excerpts_included: false,
        notebooklm_answers_included: false,
        secrets_or_session_included: false,
        runtime_absolute_paths_included: false,
        final_answer_authority_allowed: true,
        public_canon_promotion_allowed: true,
        ontology_acceptance_allowed: true,
        default_route_mutation_allowed: true,
        graph_truth_mutation_allowed: true,
        readiness_writes_usage_or_candidate: true,
        readiness_executes_answer_shell: true,
        readiness_launches_sourcebound_review: true,
        raw_query_persisted: true,
        answer_shell_output_persisted: true,
        answer_card_body_persisted: true,
      },
    });
    assert.equal(maliciousReadinessValidation.status, "blocked");
    assert.ok(maliciousReadinessValidation.blockers.includes("forbidden_payload_key:operational_route_readiness.answer_card_body"));
    assert.ok(maliciousReadinessValidation.blockers.includes("authority_sourcebound_review_launch_allowed_here_must_be_false"));
    assert.ok(maliciousReadinessValidation.blockers.includes("authority_source_truth_claimed_here_must_be_false"));
    assert.ok(maliciousReadinessValidation.blockers.includes("boundary_readiness_writes_usage_or_candidate_must_be_false"));
    assert.ok(maliciousReadinessValidation.blockers.includes("boundary_readiness_launches_sourcebound_review_must_be_false"));
    assert.ok(maliciousReadinessValidation.blockers.includes("boundary_answer_card_body_persisted_must_be_false"));

    const usageRecord = await buildOperationalRouteUsageRecord({
      repoRoot,
      registryRef,
      queryLabel: "development requirements check",
      usageId: "fixture_requirements_usage_001",
      now: "2026-05-28T01:00:00Z",
    });
    assert.equal(usageRecord.status, "recorded_matched_route");
    assert.equal(usageRecord.route_id, "fixture_requirements_route");
    assert.equal(usageRecord.raw_query_persisted, false);
    assert.equal(usageRecord.selected_route.selected_work_card_id, "fixture_requirements_card");
    assert.equal(validateOperationalRouteUsageRecord(usageRecord).status, "pass");
    assert.doesNotMatch(JSON.stringify(usageRecord), /"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);
    const usageRecordText = renderOperationalRouteUsageRecordText(usageRecord);
    assert.match(usageRecordText, /recorded_matched_route/);
    assert.match(usageRecordText, /Raw query persisted: no/);
    assert.match(usageRecordText, /usage=1\/3|Usage count increment: 1/);
    assert.doesNotMatch(
      usageRecordText,
      /development requirements check|"query_label"\s*:|"question"\s*:|answer_card_body|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/,
    );

    const usageWrite = await writeOperationalRouteUsageRecord({
      repoRoot,
      registryRef,
      queryLabel: "development requirements check",
      usageId: "fixture_requirements_usage_002",
      now: "2026-05-28T01:01:00Z",
    });
    assert.equal(usageWrite.status, "written");
    assert.equal(usageWrite.raw_query_persisted, false);
    const writtenUsage = await loadOperationalRouteUsageRecord({ repoRoot, recordRef: usageWrite.usage_record_ref });
    assert.equal(validateOperationalRouteUsageRecord(writtenUsage).status, "pass");
    const writtenUsageText = renderOperationalRouteUsageRecordText(writtenUsage);
    assert.match(writtenUsageText, /fixture_requirements_usage_002/);
    assert.match(writtenUsageText, /Raw query persisted: no/);
    assert.doesNotMatch(
      writtenUsageText,
      /development requirements check|"query_label"\s*:|"question"\s*:|answer_card_body|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/,
    );

    const usageSummary = await buildOperationalRouteUsageSummary({
      repoRoot,
      registryRef,
      summaryId: "fixture_requirements_usage_summary",
      now: "2026-05-28T01:02:00Z",
    });
    assert.equal(usageSummary.status, "below_repeated_use_threshold");
    assert.equal(usageSummary.counts.usage_record_count, 1);
    assert.equal(usageSummary.routes.find((route) => route.route_id === "fixture_requirements_route").usage_count, 1);
    assert.equal(validateOperationalRouteUsageSummary(usageSummary).status, "pass");
    assert.doesNotMatch(JSON.stringify(usageSummary), /"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);
    const usageSummaryText = renderOperationalRouteUsageSummaryText(usageSummary);
    assert.match(usageSummaryText, /below_repeated_use_threshold/);
    assert.match(usageSummaryText, /usage=1\/3/);
    assert.doesNotMatch(
      usageSummaryText,
      /development requirements check|"query_label"\s*:|"question"\s*:|answer_card_body|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/,
    );

    const usageSummaryWrite = await writeOperationalRouteUsageSummary({
      repoRoot,
      registryRef,
      summaryId: "fixture_requirements_usage_summary_written",
      now: "2026-05-28T01:03:00Z",
    });
    assert.equal(usageSummaryWrite.status, "written");
    assert.equal(usageSummaryWrite.usage_record_count, 1);
    const writtenSummary = await loadOperationalRouteUsageSummary({ repoRoot, summaryRef: usageSummaryWrite.usage_summary_ref });
    assert.equal(validateOperationalRouteUsageSummary(writtenSummary).status, "pass");
    const writtenSummaryText = renderOperationalRouteUsageSummaryText(writtenSummary);
    assert.match(writtenSummaryText, /usage=1\/3/);
    assert.doesNotMatch(
      writtenSummaryText,
      /development requirements check|"query_label"\s*:|"question"\s*:|answer_card_body|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/,
    );

    const candidateRecord = await buildOperationalRouteCandidateRecord({
      repoRoot,
      registryRef,
      queryLabel: "aircraft paint supplier audit",
      candidateId: "fixture_unmatched_candidate_001",
      now: "2026-05-28T01:04:00Z",
    });
    assert.equal(candidateRecord.status, "recorded_unmatched_route_candidate");
    assert.equal(candidateRecord.resolution_status, "blocked_no_route");
    assert.equal(candidateRecord.raw_query_persisted, false);
    assert.equal(candidateRecord.candidate_signal.candidate_count_increment, 1);
    assert.equal(candidateRecord.candidate_signal.route_registry_update_allowed_here, false);
    assert.equal(validateOperationalRouteCandidateRecord(candidateRecord).status, "pass");
    assert.doesNotMatch(JSON.stringify(candidateRecord), /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);
    const candidateRecordText = renderOperationalRouteCandidateRecordText(candidateRecord);
    assert.match(candidateRecordText, /recorded_unmatched_route_candidate/);
    assert.match(candidateRecordText, /Preview only: no/);
    assert.match(candidateRecordText, /Owner review required: yes/);
    assert.doesNotMatch(candidateRecordText, /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);
    const candidateRecordPreviewText = renderOperationalRouteCandidateRecordText(candidateRecord, { previewOnly: true });
    assert.match(candidateRecordPreviewText, /preview_unmatched_route_candidate_no_write/);
    assert.match(candidateRecordPreviewText, /Preview only: yes/);
    assert.doesNotMatch(candidateRecordPreviewText, /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const matchedCandidateRecord = await buildOperationalRouteCandidateRecord({
      repoRoot,
      registryRef,
      queryLabel: "development requirements check",
      candidateId: "fixture_matched_candidate_noop",
      now: "2026-05-28T01:05:00Z",
    });
    assert.equal(matchedCandidateRecord.status, "not_recorded_existing_route_or_invalid_registry");
    assert.equal(matchedCandidateRecord.matched_route_id, "fixture_requirements_route");
    assert.equal(matchedCandidateRecord.candidate_signal.candidate_count_increment, 0);
    assert.equal(validateOperationalRouteCandidateRecord(matchedCandidateRecord).status, "pass");

    const candidateWrite = await writeOperationalRouteCandidateRecord({
      repoRoot,
      registryRef,
      queryLabel: "aircraft paint supplier audit",
      candidateId: "fixture_unmatched_candidate_002",
      now: "2026-05-28T01:06:00Z",
    });
    assert.equal(candidateWrite.status, "written");
    assert.equal(candidateWrite.raw_query_persisted, false);
    const writtenCandidate = await loadOperationalRouteCandidateRecord({
      repoRoot,
      recordRef: candidateWrite.candidate_record_ref,
    });
    assert.equal(validateOperationalRouteCandidateRecord(writtenCandidate).status, "pass");
    const writtenCandidateText = renderOperationalRouteCandidateRecordText(writtenCandidate);
    assert.match(writtenCandidateText, /recorded_unmatched_route_candidate/);
    assert.doesNotMatch(JSON.stringify(writtenCandidate), /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);
    assert.doesNotMatch(writtenCandidateText, /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const operationalStatus = await buildOperationalRouteStatus({
      repoRoot,
      registryRef,
      statusId: "fixture_operational_route_status",
      now: "2026-05-28T01:07:00Z",
    });
    assert.equal(operationalStatus.status, "candidate_review_required");
    assert.equal(operationalStatus.counts.route_count, 1);
    assert.equal(operationalStatus.counts.usage_record_count, 1);
    assert.equal(operationalStatus.counts.unmatched_candidate_count, 1);
    assert.equal(operationalStatus.authority.route_registry_update_allowed_here, false);
    assert.equal(operationalStatus.boundary.source_text_loaded, false);
    assert.equal(validateOperationalRouteStatus(operationalStatus).status, "pass");
    assert.match(renderOperationalRouteStatusDigest(operationalStatus), /candidate_review_required/);
    assert.doesNotMatch(JSON.stringify(operationalStatus), /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const operationalStatusWrite = await writeOperationalRouteStatus({
      repoRoot,
      registryRef,
      statusId: "fixture_operational_route_status_written",
      now: "2026-05-28T01:08:00Z",
    });
    assert.equal(operationalStatusWrite.status, "written");
    assert.equal(operationalStatusWrite.route_status, "candidate_review_required");
    assert.equal(operationalStatusWrite.unmatched_candidate_count, 1);
    const writtenOperationalStatus = await loadOperationalRouteStatus({
      repoRoot,
      statusRef: operationalStatusWrite.operational_route_status_ref,
    });
    assert.equal(validateOperationalRouteStatus(writtenOperationalStatus).status, "pass");
    const writtenOperationalStatusText = renderOperationalRouteStatusDigest(writtenOperationalStatus);
    assert.match(writtenOperationalStatusText, /candidate_review_required/);
    assert.match(writtenOperationalStatusText, /Routes: 1/);
    assert.doesNotMatch(
      writtenOperationalStatusText,
      /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/,
    );

    const operatorRunRecorded = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_operator_run_recorded",
      recordUsage: true,
      usageId: "fixture_operator_run_usage_001",
      now: "2026-05-28T01:09:00Z",
    });
    assert.match(operatorRunRecorded, /Health status: not_checked/);
    assert.match(operatorRunRecorded, /Operator answer shell: skipped/);
    assert.match(operatorRunRecorded, /--record-usage requires a passing operator health ref/);
    assert.match(operatorRunRecorded, /Usage record written: no/);
    assert.doesNotMatch(operatorRunRecorded, /development requirements check|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);
    await assert.rejects(
      readFile(path.join(repoRoot, "_workmeta", "system", "reports", "rag", "operational_route_usage", "fixture_operator_run_usage_001", "usage_record.json"), "utf8"),
    );

    const operatorRunCustomUsageRoot = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_operator_run_custom_usage_root",
      recordUsage: true,
      usageId: "fixture_operator_run_custom_usage_001",
      usageOutputRef: "_workmeta/fixture_project/reports/rag/operational_route_usage/fixture_operator_run_custom_usage_001/usage_record.json",
      now: "2026-05-28T01:10:00Z",
    });
    assert.match(operatorRunCustomUsageRoot, /Operator answer shell: skipped/);
    assert.match(operatorRunCustomUsageRoot, /Usage record written: no/);
    assert.doesNotMatch(operatorRunCustomUsageRoot, /development requirements check|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);
    await assert.rejects(
      readFile(path.join(repoRoot, "_workmeta", "fixture_project", "reports", "rag", "operational_route_usage", "fixture_operator_run_custom_usage_001", "usage_record.json"), "utf8"),
    );

    const closeout = await buildOperationalRouteCloseout({
      repoRoot,
      registryRef,
      queryLabel: "development requirements check",
      closeoutId: "fixture_operational_route_closeout",
      now: "2026-05-28T01:11:00Z",
    });
    assert.equal(closeout.status, "closed_private_manual_review_below_repeated_use_threshold");
    assert.equal(closeout.selected_route.route_id, "fixture_requirements_route");
    assert.equal(closeout.route_usage.usage_count, 1);
    assert.equal(closeout.route_usage.repeated_use_review_threshold, 3);
    assert.equal(closeout.boundary.usage_record_written_here, false);
    assert.equal(closeout.boundary.answer_card_body_persisted, false);
    assert.equal(validateOperationalRouteCloseout(closeout).status, "pass");
    const closeoutText = renderOperationalRouteCloseoutText(closeout);
    assert.match(closeoutText, /closed_private_manual_review_below_repeated_use_threshold/);
    assert.match(closeoutText, /Route usage count: 1/);
    assert.doesNotMatch(closeoutText, /development requirements check|Fixture operator answer|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);

    const unmatchedCloseout = await buildOperationalRouteCloseout({
      repoRoot,
      registryRef,
      queryLabel: "aircraft paint supplier audit",
      closeoutId: "fixture_operational_route_unmatched_closeout",
      now: "2026-05-28T01:12:00Z",
    });
    assert.equal(unmatchedCloseout.status, "unmatched_candidate_capture_available");
    assert.equal(unmatchedCloseout.boundary.candidate_record_written_here, false);
    assert.equal(validateOperationalRouteCloseout(unmatchedCloseout).status, "pass");
    assert.doesNotMatch(JSON.stringify(unmatchedCloseout), /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);

    const maliciousCloseoutValidation = validateOperationalRouteCloseout({
      schema_version: OPERATIONAL_ROUTE_CLOSEOUT_SCHEMA_VERSION,
      kind: "operational_route_closeout",
      closeout_id: "fixture_malicious_closeout_payload",
      registry_ref: registryRef,
      status: "registry_closeout_status_only",
      selected_route: null,
      route_usage: null,
      status_snapshot: {},
      next_actions: [],
      answer_shell_output: "SHOULD_BLOCK",
      answer_card_body: "SHOULD_BLOCK",
      boundary: {
        metadata_only: true,
        raw_query_persisted: false,
        answer_card_body_persisted: false,
        usage_record_written_here: false,
        candidate_record_written_here: false,
        answer_shell_output_persisted: true,
        source_text_loaded: true,
        source_truth_claimed: true,
        public_canon_promotion_allowed: true,
        default_route_mutation_allowed: true,
        graph_truth_mutation_allowed: true,
      },
    });
    assert.equal(maliciousCloseoutValidation.status, "blocked");
    assert.ok(maliciousCloseoutValidation.blockers.includes("forbidden_payload_key:closeout.answer_shell_output"));
    assert.ok(maliciousCloseoutValidation.blockers.includes("forbidden_payload_key:closeout.answer_card_body"));
    assert.ok(maliciousCloseoutValidation.blockers.includes("boundary_answer_shell_output_persisted_must_be_false"));
    assert.ok(maliciousCloseoutValidation.blockers.includes("boundary_source_text_loaded_must_be_false"));
    assert.ok(maliciousCloseoutValidation.blockers.includes("boundary_source_truth_claimed_must_be_false"));
    assert.ok(maliciousCloseoutValidation.blockers.includes("boundary_public_canon_promotion_allowed_must_be_false"));
    assert.ok(maliciousCloseoutValidation.blockers.includes("boundary_default_route_mutation_allowed_must_be_false"));
    assert.ok(maliciousCloseoutValidation.blockers.includes("boundary_graph_truth_mutation_allowed_must_be_false"));

    const reviewGate = await buildOperationalRouteReviewGate({
      repoRoot,
      registryRef,
      gateId: "fixture_operational_route_review_gate",
      now: "2026-05-28T01:13:00Z",
    });
    assert.equal(reviewGate.status, "hold_unmatched_candidate_review_required");
    assert.equal(reviewGate.counts.usage_record_count, 1);
    assert.equal(reviewGate.counts.repeated_use_review_ready_route_count, 0);
    assert.equal(reviewGate.counts.unmatched_candidate_count, 1);
    assert.equal(reviewGate.authority.sourcebound_review_launch_allowed_here, false);
    assert.equal(reviewGate.boundary.review_gate_launches_sourcebound_review, false);
    assert.equal(validateOperationalRouteReviewGate(reviewGate).status, "pass");
    const reviewGateText = renderOperationalRouteReviewGateText(reviewGate);
    assert.match(reviewGateText, /hold_unmatched_candidate_review_required/);
    assert.match(reviewGateText, /usage=1\/3/);
    assert.doesNotMatch(reviewGateText, /development requirements check|aircraft paint supplier audit|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);

    const maliciousReviewGateValidation = validateOperationalRouteReviewGate({
      schema_version: "soulforge.operational_route_review_gate.v0",
      kind: "operational_route_review_gate",
      gate_id: "fixture_malicious_review_gate",
      generated_at_utc: "2026-05-28T01:14:00.000Z",
      registry_ref: registryRef,
      status: "ready_for_sourcebound_review_queue",
      blockers: [],
      counts: {},
      routes: [],
      ready_routes: [],
      answer_card_body: "SHOULD_BLOCK",
      authority: {
        sourcebound_review_launch_allowed_here: true,
        route_registry_update_allowed_here: true,
        source_text_loading_allowed_here: true,
      },
      next_actions: [],
      boundary: {
        metadata_only: true,
        source_text_loaded: true,
        review_gate_launches_sourcebound_review: true,
        public_canon_promotion_allowed: true,
      },
    });
    assert.equal(maliciousReviewGateValidation.status, "blocked");
    assert.ok(maliciousReviewGateValidation.blockers.includes("forbidden_payload_key:operational_route_review_gate.answer_card_body"));
    assert.ok(maliciousReviewGateValidation.blockers.includes("authority_sourcebound_review_launch_allowed_here_must_be_false"));
    assert.ok(maliciousReviewGateValidation.blockers.includes("authority_route_registry_update_allowed_here_must_be_false"));
    assert.ok(maliciousReviewGateValidation.blockers.includes("authority_source_text_loading_allowed_here_must_be_false"));
    assert.ok(maliciousReviewGateValidation.blockers.includes("boundary_source_text_loaded_must_be_false"));
    assert.ok(maliciousReviewGateValidation.blockers.includes("boundary_review_gate_launches_sourcebound_review_must_be_false"));
    assert.ok(maliciousReviewGateValidation.blockers.includes("boundary_public_canon_promotion_allowed_must_be_false"));

    const commandSheet = await buildOperationalRouteCommandSheet({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      sheetId: "fixture_operational_route_command_sheet",
      now: "2026-05-28T01:15:00Z",
    });
    assert.equal(commandSheet.counts.command_count, 21);
    assert.equal(commandSheet.boundary.command_sheet_executes_commands, false);
    assert.equal(validateOperationalRouteCommandSheet(commandSheet).status, "pass");
    const commandSheetText = renderOperationalRouteCommandSheetText(commandSheet);
    assert.match(commandSheetText, /operational-route-dashboard/);
    assert.match(commandSheetText, /operational-route-operator-run/);
    assert.match(commandSheetText, /operational-route-call-plan --write/);
    assert.match(commandSheetText, /operational-route-call-plan-view/);
    assert.match(commandSheetText, /operational-route-review-gate/);
    assert.match(commandSheetText, /operational-route-preflight-view/);
    assert.match(commandSheetText, /operational-route-usage-summary-view/);
    assert.match(commandSheetText, /operational-route-evidence-sweep-view/);
    assert.match(commandSheetText, /operational-route-latest-evidence/);
    assert.match(commandSheetText, /operational-route-operator-brief/);
    assert.match(commandSheetText, /operational-route-operator-health/);
    assert.match(commandSheetText, /--record-usage --usage-id <safe_usage_id>/);
    assert.doesNotMatch(commandSheetText, /development requirements check|aircraft paint supplier audit|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);

    const maliciousCommandSheetValidation = validateOperationalRouteCommandSheet({
      schema_version: "soulforge.operational_route_command_sheet.v0",
      kind: "operational_route_command_sheet",
      sheet_id: "fixture_malicious_command_sheet",
      registry_ref: registryRef,
      commands: [{ phase: "bad_phase", command_line: "node guild_hall/rag/cli.mjs operational-route-command-sheet" }],
      answer_card_body: "SHOULD_BLOCK",
      boundary: {
        metadata_only: true,
        command_sheet_executes_commands: true,
        raw_query_persisted: true,
        answer_card_body_persisted: true,
        public_canon_promotion_allowed: true,
      },
    });
    assert.equal(maliciousCommandSheetValidation.status, "blocked");
    assert.ok(maliciousCommandSheetValidation.blockers.includes("forbidden_payload_key:operational_route_command_sheet.answer_card_body"));
    assert.ok(maliciousCommandSheetValidation.blockers.includes("boundary_command_sheet_executes_commands_must_be_false"));
    assert.ok(maliciousCommandSheetValidation.blockers.includes("boundary_raw_query_persisted_must_be_false"));
    assert.ok(maliciousCommandSheetValidation.blockers.includes("boundary_answer_card_body_persisted_must_be_false"));
    assert.ok(maliciousCommandSheetValidation.blockers.includes("boundary_public_canon_promotion_allowed_must_be_false"));

    const suggestionSafety = await buildOperationalRouteSuggestionSafety({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      safetyId: "fixture_operational_route_suggestion_safety",
      now: "2026-05-28T01:15:30Z",
    });
    assert.equal(suggestionSafety.status, "pass_operator_suggestion_safety");
    assert.equal(suggestionSafety.counts.direct_usage_record_write_suggestion_count, 0);
    assert.equal(suggestionSafety.counts.direct_candidate_record_write_suggestion_count, 0);
    assert.equal(suggestionSafety.counts.direct_call_plan_write_suggestion_count, 1);
    assert.equal(suggestionSafety.counts.unsafe_candidate_record_write_suggestion_count, 0);
    assert.equal(suggestionSafety.counts.unsafe_call_plan_write_suggestion_count, 0);
    assert.equal(suggestionSafety.counts.direct_answer_shell_suggestion_count, 0);
    assert.equal(suggestionSafety.counts.record_usage_without_health_ref_count, 0);
    assert.equal(suggestionSafety.counts.record_usage_outside_operator_run_count, 0);
    assert.equal(suggestionSafety.boundary.suggestion_safety_executes_commands, false);
    assert.equal(suggestionSafety.boundary.suggestion_safety_writes_usage_or_candidate, false);
    assert.equal(suggestionSafety.boundary.suggestion_safety_writes_call_plan, false);
    assert.equal(validateOperationalRouteSuggestionSafety(suggestionSafety).status, "pass");
    const suggestionSafetyText = renderOperationalRouteSuggestionSafetyText(suggestionSafety);
    assert.match(suggestionSafetyText, /pass_operator_suggestion_safety/);
    assert.match(suggestionSafetyText, /Direct usage-write suggestions: 0/);
    assert.match(suggestionSafetyText, /Direct call-plan-write suggestions: 1/);
    assert.match(suggestionSafetyText, /Unsafe candidate-write suggestions: 0/);
    assert.match(suggestionSafetyText, /Unsafe call-plan-write suggestions: 0/);
    assert.match(suggestionSafetyText, /Record-usage without health ref: 0/);
    assert.doesNotMatch(suggestionSafetyText, /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);
    assert.doesNotMatch(JSON.stringify(suggestionSafety), /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const unmatchedSmokeTestsRef = "_workspaces/knowledge/rag/operational_routes/fixture/smoke_tests_unmatched.yaml";
    await writeFileWithParents(
      repoRoot,
      unmatchedSmokeTestsRef,
      [
        "schema_version: soulforge.fixture.operational_route_smoke_tests.v0",
        "kind: operational_route_smoke_tests",
        "test_set_id: fixture_unmatched_probe",
        "tests:",
        "  - test_id: fixture_route_unmatched_001",
        "    query_label: \"aircraft paint supplier audit\"",
      ].join("\n"),
    );
    const unmatchedSuggestionSafety = await buildOperationalRouteSuggestionSafety({
      repoRoot,
      registryRef,
      smokeTestRef: unmatchedSmokeTestsRef,
      safetyId: "fixture_operational_route_suggestion_safety_unmatched",
      now: "2026-05-28T01:15:35Z",
    });
    assert.equal(unmatchedSuggestionSafety.status, "pass_operator_suggestion_safety");
    assert.equal(unmatchedSuggestionSafety.counts.direct_candidate_record_write_suggestion_count, 0);
    assert.equal(unmatchedSuggestionSafety.counts.unsafe_candidate_record_write_suggestion_count, 0);
    assert.equal(validateOperationalRouteSuggestionSafety(unmatchedSuggestionSafety).status, "pass");
    assert.doesNotMatch(JSON.stringify(unmatchedSuggestionSafety), /aircraft paint supplier audit|"query_label"\s*:|"question"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const suggestionSafetyWrite = await writeOperationalRouteSuggestionSafety({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      safetyId: "fixture_operational_route_suggestion_safety_written",
      now: "2026-05-28T01:15:45Z",
    });
    assert.equal(suggestionSafetyWrite.status, "written");
    assert.match(suggestionSafetyWrite.operational_route_suggestion_safety_ref, /^_workmeta\/system\/reports\/rag\/operational_route_suggestion_safety\//);
    const writtenSuggestionSafety = await loadOperationalRouteSuggestionSafety({
      repoRoot,
      suggestionSafetyRef: suggestionSafetyWrite.operational_route_suggestion_safety_ref,
    });
    assert.equal(validateOperationalRouteSuggestionSafety(writtenSuggestionSafety).status, "pass");

    const maliciousSuggestionSafetyValidation = validateOperationalRouteSuggestionSafety({
      ...suggestionSafety,
      safety_id: "fixture_malicious_suggestion_safety",
      counts: {
        ...suggestionSafety.counts,
        direct_usage_record_write_suggestion_count: 1,
        direct_answer_shell_suggestion_count: 1,
        record_usage_without_health_ref_count: 1,
        unsafe_candidate_record_write_suggestion_count: 1,
        unsafe_call_plan_write_suggestion_count: 1,
        record_usage_outside_operator_run_count: 1,
      },
      boundary: {
        ...suggestionSafety.boundary,
        suggestion_safety_executes_commands: true,
        suggestion_safety_writes_usage_or_candidate: true,
        suggestion_safety_writes_call_plan: true,
        public_canon_promotion_allowed: true,
      },
    });
    assert.equal(maliciousSuggestionSafetyValidation.status, "blocked");
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("direct_usage_record_write_suggestion_count_must_be_zero"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("unsafe_candidate_record_write_suggestion_count_must_be_zero"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("unsafe_call_plan_write_suggestion_count_must_be_zero"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("direct_answer_shell_suggestion_count_must_be_zero"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("record_usage_without_health_ref_count_must_be_zero"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("record_usage_outside_operator_run_count_must_be_zero"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("boundary_suggestion_safety_executes_commands_must_be_false"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("boundary_suggestion_safety_writes_usage_or_candidate_must_be_false"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("boundary_suggestion_safety_writes_call_plan_must_be_false"));
    assert.ok(maliciousSuggestionSafetyValidation.blockers.includes("boundary_public_canon_promotion_allowed_must_be_false"));

    const opsCheck = await buildOperationalRouteOpsCheck({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      opsCheckId: "fixture_operational_route_ops_check",
      now: "2026-05-28T01:16:00Z",
    });
    assert.equal(opsCheck.status, "pass_private_manual_review_ready");
    assert.equal(opsCheck.counts.command_count, 21);
    assert.equal(opsCheck.counts.suggestion_command_count, suggestionSafety.counts.command_count);
    assert.equal(opsCheck.counts.direct_usage_record_write_suggestion_count, 0);
    assert.equal(opsCheck.counts.direct_candidate_record_write_suggestion_count, 0);
    assert.equal(opsCheck.counts.direct_call_plan_write_suggestion_count, 1);
    assert.equal(opsCheck.counts.unsafe_candidate_record_write_suggestion_count, 0);
    assert.equal(opsCheck.counts.unsafe_call_plan_write_suggestion_count, 0);
    assert.equal(opsCheck.counts.direct_answer_shell_suggestion_count, 0);
    assert.equal(opsCheck.counts.record_usage_without_health_ref_count, 0);
    assert.equal(opsCheck.counts.record_usage_outside_operator_run_count, 0);
    assert.equal(opsCheck.surfaces.preflight.validation_status, "pass");
    assert.equal(opsCheck.surfaces.command_sheet.status, "pass");
    assert.equal(opsCheck.surfaces.suggestion_safety.status, "pass_operator_suggestion_safety");
    assert.equal(opsCheck.surfaces.suggestion_safety.validation_status, "pass");
    assert.equal(opsCheck.surfaces.review_gate.status, "hold_unmatched_candidate_review_required");
    assert.equal(opsCheck.authority.sourcebound_review_launch_allowed_here, false);
    assert.equal(opsCheck.boundary.ops_check_executes_commands, false);
    assert.equal(validateOperationalRouteOpsCheck(opsCheck).status, "pass");
    const opsCheckText = renderOperationalRouteOpsCheckText(opsCheck);
    assert.match(opsCheckText, /pass_private_manual_review_ready/);
    assert.match(opsCheckText, /command_sheet/);
    assert.match(opsCheckText, /suggestion_safety/);
    assert.match(opsCheckText, /Direct usage-write suggestions: 0/);
    assert.match(opsCheckText, /Unsafe candidate-write suggestions: 0/);
    assert.match(opsCheckText, /Unsafe call-plan-write suggestions: 0/);
    assert.match(opsCheckText, /review_gate/);
    assert.doesNotMatch(opsCheckText, /development requirements check|aircraft paint supplier audit|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);

    const opsCheckWrite = await writeOperationalRouteOpsCheck({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      opsCheckId: "fixture_operational_route_ops_check_written",
      now: "2026-05-28T01:16:30Z",
    });
    assert.equal(opsCheckWrite.status, "written");
    assert.match(opsCheckWrite.operational_route_ops_check_ref, /^_workmeta\/system\/reports\/rag\/operational_route_ops_check\//);
    const writtenOpsCheck = await loadOperationalRouteOpsCheck({
      repoRoot,
      opsCheckRef: opsCheckWrite.operational_route_ops_check_ref,
    });
    assert.equal(validateOperationalRouteOpsCheck(writtenOpsCheck).status, "pass");
    const writtenOpsCheckText = renderOperationalRouteOpsCheckText(writtenOpsCheck);
    assert.match(writtenOpsCheckText, /pass_private_manual_review_ready/);
    assert.match(writtenOpsCheckText, /preflight/);
    assert.doesNotMatch(writtenOpsCheckText, /development requirements check|aircraft paint supplier audit|Fixture operator answer|\/Users\/|[A-Za-z]:[\\/]/);
    assert.equal(writtenOpsCheck.boundary.ops_check_writes_usage_or_candidate, false);
    assert.doesNotMatch(JSON.stringify(writtenOpsCheck), /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const evidenceSweep = await buildOperationalRouteEvidenceSweep({
      repoRoot,
      preflightRef: preflightWrite.operational_route_preflight_ref,
      opsCheckRef: opsCheckWrite.operational_route_ops_check_ref,
      sessionSweepRef: sessionSweepWrite.operational_route_session_sweep_ref,
      statusRef: operationalStatusWrite.operational_route_status_ref,
      usageSummaryRef: usageSummaryWrite.usage_summary_ref,
      usageRecordRefs: [usageWrite.usage_record_ref],
      candidateRecordRefs: [candidateWrite.candidate_record_ref],
      evidenceSweepId: "fixture_operational_route_evidence_sweep",
      now: "2026-05-28T01:17:00Z",
    });
    assert.equal(evidenceSweep.status, "pass_metadata_only_evidence_sweep");
    assert.equal(evidenceSweep.counts.evidence_count, 7);
    assert.equal(evidenceSweep.counts.blocked_count, 0);
    assert.equal(validateOperationalRouteEvidenceSweep(evidenceSweep).status, "pass");
    const evidenceSweepText = renderOperationalRouteEvidenceSweepText(evidenceSweep);
    assert.match(evidenceSweepText, /Evidence: 7\/7 pass/);
    assert.match(evidenceSweepText, /ops_check/);
    assert.doesNotMatch(evidenceSweepText, /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const evidenceSweepWrite = await writeOperationalRouteEvidenceSweep({
      repoRoot,
      preflightRef: preflightWrite.operational_route_preflight_ref,
      opsCheckRef: opsCheckWrite.operational_route_ops_check_ref,
      sessionSweepRef: sessionSweepWrite.operational_route_session_sweep_ref,
      statusRef: operationalStatusWrite.operational_route_status_ref,
      usageSummaryRef: usageSummaryWrite.usage_summary_ref,
      usageRecordRefs: [usageWrite.usage_record_ref],
      candidateRecordRefs: [candidateWrite.candidate_record_ref],
      evidenceSweepId: "fixture_operational_route_evidence_sweep_written",
      now: "2026-05-28T01:17:30Z",
    });
    assert.equal(evidenceSweepWrite.status, "written");
    assert.match(evidenceSweepWrite.operational_route_evidence_sweep_ref, /^_workmeta\/system\/reports\/rag\/operational_route_evidence_sweeps\//);
    const writtenEvidenceSweep = await loadOperationalRouteEvidenceSweep({
      repoRoot,
      evidenceSweepRef: evidenceSweepWrite.operational_route_evidence_sweep_ref,
    });
    assert.equal(validateOperationalRouteEvidenceSweep(writtenEvidenceSweep).status, "pass");
    assert.doesNotMatch(JSON.stringify(writtenEvidenceSweep), /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const latestEvidence = await buildOperationalRouteLatestEvidence({
      repoRoot,
      registryRef,
      latestEvidenceId: "fixture_operational_route_latest_evidence",
      now: "2026-05-28T01:18:00Z",
    });
    assert.equal(latestEvidence.status, "ready_private_manual_review_below_repeated_use_threshold");
    assert.equal(latestEvidence.counts.latest_artifact_count, 8);
    assert.equal(latestEvidence.counts.missing_artifact_count, 0);
    assert.equal(latestEvidence.counts.blocked_artifact_count, 0);
    assert.equal(latestEvidence.counts.route_sweep_pass_count, 1);
    assert.equal(latestEvidence.counts.suggestion_command_count, suggestionSafety.counts.command_count);
    assert.equal(latestEvidence.counts.direct_usage_record_write_suggestion_count, 0);
    assert.equal(latestEvidence.counts.direct_candidate_record_write_suggestion_count, 0);
    assert.equal(latestEvidence.counts.direct_call_plan_write_suggestion_count, 1);
    assert.equal(latestEvidence.counts.unsafe_candidate_record_write_suggestion_count, 0);
    assert.equal(latestEvidence.counts.unsafe_call_plan_write_suggestion_count, 0);
    assert.equal(latestEvidence.counts.record_usage_outside_operator_run_count, 0);
    assert.equal(validateOperationalRouteLatestEvidence(latestEvidence).status, "pass");
    const latestEvidenceText = renderOperationalRouteLatestEvidenceText(latestEvidence);
    assert.match(latestEvidenceText, /Latest refs:/);
    assert.match(latestEvidenceText, /suggestion_safety/);
    assert.match(latestEvidenceText, /Direct usage-write suggestions: 0/);
    assert.match(latestEvidenceText, /Unsafe candidate-write suggestions: 0/);
    assert.match(latestEvidenceText, /Unsafe call-plan-write suggestions: 0/);
    assert.match(latestEvidenceText, /evidence_sweep/);
    assert.match(latestEvidenceText, /Missing evidence types:\n- none/);
    assert.doesNotMatch(latestEvidenceText, /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const latestEvidenceWrite = await writeOperationalRouteLatestEvidence({
      repoRoot,
      registryRef,
      latestEvidenceId: "fixture_operational_route_latest_evidence_written",
      now: "2026-05-28T01:18:30Z",
    });
    assert.equal(latestEvidenceWrite.status, "written");
    assert.match(latestEvidenceWrite.operational_route_latest_evidence_ref, /^_workmeta\/system\/reports\/rag\/operational_route_latest_evidence\//);
    const writtenLatestEvidence = await loadOperationalRouteLatestEvidence({
      repoRoot,
      latestEvidenceRef: latestEvidenceWrite.operational_route_latest_evidence_ref,
    });
    assert.equal(validateOperationalRouteLatestEvidence(writtenLatestEvidence).status, "pass");
    assert.doesNotMatch(JSON.stringify(writtenLatestEvidence), /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const fixtureLocalPath = ["", "Users", "fixture", "rag-secret.txt"].join("/");
    const fixtureWindowsPath = ["C:", "fixture", "rag-secret.txt"].join("\\");
    const fixtureSecretValue = "api_key=fake_rag_fixture_secret_value_1234567890";
    const maliciousEvidenceSweepValidation = validateOperationalRouteEvidenceSweep({
      ...evidenceSweep,
      evidence_sweep_id: "fixture_malicious_evidence_sweep_no_payload",
      answer_shell_output: "fake-sentinel-answer-shell",
      diagnostics: {
        raw_query: "fake-sentinel-raw-query",
        local_path: fixtureLocalPath,
        api_key: fixtureSecretValue,
      },
      evidence: [
        {
          ...evidenceSweep.evidence[0],
          answer_card_body: "fake-sentinel-answer-card",
          source_text: "fake-sentinel-source-text",
          chunk_text: "fake-sentinel-chunk-text",
          credential: {
            token: fixtureSecretValue,
          },
        },
      ],
      boundary: {
        ...evidenceSweep.boundary,
        raw_query_persisted: true,
        answer_shell_output_persisted: true,
        answer_card_body_persisted: true,
      },
    });
    assert.equal(maliciousEvidenceSweepValidation.status, "blocked");
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("forbidden_payload_key:operational_route_evidence_sweep.answer_shell_output"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("forbidden_payload_key:operational_route_evidence_sweep.diagnostics.raw_query"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("forbidden_payload_key:operational_route_evidence_sweep.evidence[0].answer_card_body"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("forbidden_payload_key:operational_route_evidence_sweep.evidence[0].source_text"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("forbidden_payload_key:operational_route_evidence_sweep.evidence[0].chunk_text"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("local_absolute_path:operational_route_evidence_sweep.diagnostics.local_path"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("secret_like_key:operational_route_evidence_sweep.diagnostics.api_key"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("secret_like_key:operational_route_evidence_sweep.evidence[0].credential"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("secret_like_key:operational_route_evidence_sweep.evidence[0].credential.token"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("secret_like_value:operational_route_evidence_sweep.diagnostics.api_key"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("secret_like_value:operational_route_evidence_sweep.evidence[0].credential.token"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("boundary_raw_query_persisted_must_be_false"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("boundary_answer_shell_output_persisted_must_be_false"));
    assert.ok(maliciousEvidenceSweepValidation.blockers.includes("boundary_answer_card_body_persisted_must_be_false"));

    const maliciousLatestEvidenceValidation = validateOperationalRouteLatestEvidence({
      ...latestEvidence,
      latest_evidence_id: "fixture_malicious_latest_evidence_no_payload",
      answer_card_body: "fake-sentinel-answer-card",
      source_text: "fake-sentinel-source-text",
      chunk_text: "fake-sentinel-chunk-text",
      diagnostics: {
        raw_query: "fake-sentinel-raw-query",
        local_path: fixtureWindowsPath,
        secret: fixtureSecretValue,
      },
      latest_evidence: [
        {
          ...latestEvidence.latest_evidence[0],
          answer_shell_output: "fake-sentinel-answer-shell",
          source_text: "fake-sentinel-source-text",
          chunk_text: "fake-sentinel-chunk-text",
          credentials: {
            session: fixtureSecretValue,
          },
        },
      ],
      boundary: {
        ...latestEvidence.boundary,
        raw_query_persisted: true,
        answer_shell_output_persisted: true,
        answer_card_body_persisted: true,
      },
    });
    assert.equal(maliciousLatestEvidenceValidation.status, "blocked");
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("forbidden_payload_key:operational_route_latest_evidence.answer_card_body"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("forbidden_payload_key:operational_route_latest_evidence.source_text"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("forbidden_payload_key:operational_route_latest_evidence.chunk_text"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("forbidden_payload_key:operational_route_latest_evidence.diagnostics.raw_query"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("forbidden_payload_key:operational_route_latest_evidence.latest_evidence[0].answer_shell_output"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("forbidden_payload_key:operational_route_latest_evidence.latest_evidence[0].source_text"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("forbidden_payload_key:operational_route_latest_evidence.latest_evidence[0].chunk_text"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("local_absolute_path:operational_route_latest_evidence.diagnostics.local_path"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("secret_like_key:operational_route_latest_evidence.diagnostics.secret"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("secret_like_key:operational_route_latest_evidence.latest_evidence[0].credentials"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("secret_like_key:operational_route_latest_evidence.latest_evidence[0].credentials.session"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("secret_like_value:operational_route_latest_evidence.diagnostics.secret"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("secret_like_value:operational_route_latest_evidence.latest_evidence[0].credentials.session"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("boundary_raw_query_persisted_must_be_false"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("boundary_answer_shell_output_persisted_must_be_false"));
    assert.ok(maliciousLatestEvidenceValidation.blockers.includes("boundary_answer_card_body_persisted_must_be_false"));

    const operatorBrief = await buildOperationalRouteOperatorBrief({
      repoRoot,
      registryRef,
      latestEvidenceRef: latestEvidenceWrite.operational_route_latest_evidence_ref,
      operatorBriefId: "fixture_operational_route_operator_brief",
      now: "2026-05-28T01:19:00Z",
    });
    assert.equal(operatorBrief.status, "ready_private_manual_review_below_repeated_use_threshold");
    assert.equal(operatorBrief.counts.route_count, 1);
    assert.equal(operatorBrief.counts.usage_record_count, 1);
    assert.equal(operatorBrief.counts.command_count, 12);
    assert.equal(operatorBrief.counts.direct_candidate_record_write_suggestion_count, 0);
    assert.equal(operatorBrief.counts.direct_call_plan_write_suggestion_count, 1);
    assert.equal(operatorBrief.counts.unsafe_candidate_record_write_suggestion_count, 0);
    assert.equal(operatorBrief.counts.unsafe_call_plan_write_suggestion_count, 0);
    assert.equal(operatorBrief.counts.direct_answer_shell_suggestion_count, 0);
    assert.equal(operatorBrief.counts.record_usage_without_health_ref_count, 0);
    assert.equal(operatorBrief.counts.record_usage_outside_operator_run_count, 0);
    assert.equal(operatorBrief.boundary.operator_brief_executes_commands, false);
    assert.equal(validateOperationalRouteOperatorBrief(operatorBrief).status, "pass");
    const operatorBriefText = renderOperationalRouteOperatorBriefText(operatorBrief);
    assert.match(operatorBriefText, /Operator brief/);
    assert.match(operatorBriefText, /fixture_requirements_route/);
    assert.match(operatorBriefText, /suggestion_safety_ref/);
    assert.match(operatorBriefText, /operational-route-call-plan --write/);
    assert.match(operatorBriefText, /operational-route-call-plan-view/);
    assert.match(operatorBriefText, /operational-route-operator-health/);
    assert.match(operatorBriefText, /operational-route-operator-run/);
    assert.match(operatorBriefText, /--skip-answer-shell/);
    assert.match(operatorBriefText, /--record-usage --usage-id <safe_usage_id>/);
    assert.doesNotMatch(operatorBriefText, /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const maliciousOperatorBriefValidation = validateOperationalRouteOperatorBrief({
      ...operatorBrief,
      brief_id: "fixture_malicious_operator_brief",
      commands: [
        {
          phase: "unsafe_call_plan",
          command_line: `node guild_hall/rag/cli.mjs operational-route-call-plan --write --route-registry-ref ${registryRef} --query-label "<ephemeral label>" --plan-id <safe_call_plan_id>`,
        },
        {
          phase: "unsafe_answer_shell",
          command_line: `node guild_hall/rag/cli.mjs operational-route-answer-shell --route-registry-ref ${registryRef} --query-label "<ephemeral label>"`,
        },
      ],
    });
    assert.equal(maliciousOperatorBriefValidation.status, "blocked");
    assert.ok(maliciousOperatorBriefValidation.blockers.includes("operator_brief_suggests_unsafe_call_plan_write"));
    assert.ok(maliciousOperatorBriefValidation.blockers.includes("operator_brief_suggests_direct_answer_shell"));

    const operatorBriefWrite = await writeOperationalRouteOperatorBrief({
      repoRoot,
      registryRef,
      latestEvidenceRef: latestEvidenceWrite.operational_route_latest_evidence_ref,
      operatorBriefId: "fixture_operational_route_operator_brief_written",
      now: "2026-05-28T01:19:30Z",
    });
    assert.equal(operatorBriefWrite.status, "written");
    assert.match(operatorBriefWrite.operational_route_operator_brief_ref, /^_workmeta\/system\/reports\/rag\/operational_route_operator_briefs\//);
    const writtenOperatorBrief = await loadOperationalRouteOperatorBrief({
      repoRoot,
      operatorBriefRef: operatorBriefWrite.operational_route_operator_brief_ref,
    });
    assert.equal(validateOperationalRouteOperatorBrief(writtenOperatorBrief).status, "pass");
    assert.doesNotMatch(JSON.stringify(writtenOperatorBrief), /development requirements check|aircraft paint supplier audit|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const runbookRef = "_workspaces/knowledge/rag/operational_routes/fixture/operator_runbook.md";
    const statusDigestRef = "_workspaces/knowledge/rag/operational_routes/fixture/operator_status_digest.md";
    const closeoutMapRef = "_workspaces/knowledge/rag/operational_routes/fixture/operator_closeout_map.md";
    const fixtureOperatorDocText = [
      registryRef,
      preflightWrite.operational_route_preflight_ref,
      opsCheckWrite.operational_route_ops_check_ref,
      suggestionSafetyWrite.operational_route_suggestion_safety_ref,
      sessionSweepWrite.operational_route_session_sweep_ref,
      readinessWrite.operational_route_readiness_ref,
      operationalStatusWrite.operational_route_status_ref,
      usageSummaryWrite.usage_summary_ref,
      evidenceSweepWrite.operational_route_evidence_sweep_ref,
      latestEvidenceWrite.operational_route_latest_evidence_ref,
      operatorBriefWrite.operational_route_operator_brief_ref,
      "command count `21`",
      "12 safe commands",
    ].join("\n");
    await writeFileWithParents(repoRoot, runbookRef, fixtureOperatorDocText);
    await writeFileWithParents(repoRoot, statusDigestRef, fixtureOperatorDocText);
    await writeFileWithParents(repoRoot, closeoutMapRef, fixtureOperatorDocText);
    const docDrift = await buildOperationalRouteOperatorDocDriftCheck({
      repoRoot,
      registryRef,
      latestEvidenceRef: latestEvidenceWrite.operational_route_latest_evidence_ref,
      operatorBriefRef: operatorBriefWrite.operational_route_operator_brief_ref,
      driftCheckId: "fixture_operational_route_doc_drift",
      now: "2026-05-28T01:20:00Z",
    });
    assert.equal(docDrift.status, "pass_operator_docs_current");
    assert.equal(docDrift.counts.stale_ref_count, 0);
    assert.equal(docDrift.counts.missing_required_ref_count, 0);
    assert.equal(validateOperationalRouteOperatorDocDriftCheck(docDrift).status, "pass");
    const docDriftText = renderOperationalRouteOperatorDocDriftText(docDrift);
    assert.match(docDriftText, /pass_operator_docs_current/);
    assert.doesNotMatch(docDriftText, /development requirements check|Fixture operator answer|"query_label"\s*:|"question"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const docDriftWrite = await writeOperationalRouteOperatorDocDriftCheck({
      repoRoot,
      registryRef,
      latestEvidenceRef: latestEvidenceWrite.operational_route_latest_evidence_ref,
      operatorBriefRef: operatorBriefWrite.operational_route_operator_brief_ref,
      driftCheckId: "fixture_operational_route_doc_drift_written",
      now: "2026-05-28T01:20:30Z",
    });
    assert.equal(docDriftWrite.status, "written");
    assert.match(docDriftWrite.operational_route_operator_doc_drift_ref, /^_workmeta\/system\/reports\/rag\/operational_route_doc_drift\//);
    const writtenDocDrift = await loadOperationalRouteOperatorDocDriftCheck({
      repoRoot,
      docDriftRef: docDriftWrite.operational_route_operator_doc_drift_ref,
    });
    assert.equal(validateOperationalRouteOperatorDocDriftCheck(writtenDocDrift).status, "pass");
    assert.doesNotMatch(JSON.stringify(writtenDocDrift), /development requirements check|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const operatorHealth = await buildOperationalRouteOperatorHealth({
      repoRoot,
      registryRef,
      latestEvidenceRef: latestEvidenceWrite.operational_route_latest_evidence_ref,
      operatorBriefRef: operatorBriefWrite.operational_route_operator_brief_ref,
      docDriftRef: docDriftWrite.operational_route_operator_doc_drift_ref,
      operatorHealthId: "fixture_operational_route_operator_health",
      now: "2026-05-28T01:21:00Z",
    });
    assert.equal(operatorHealth.status, "pass_private_manual_review_operator_health");
    assert.equal(operatorHealth.counts.route_count, 1);
    assert.equal(operatorHealth.counts.command_count, 21);
    assert.equal(operatorHealth.counts.operator_brief_command_count, 12);
    assert.equal(operatorHealth.counts.stale_ref_count, 0);
    assert.equal(operatorHealth.boundary.operator_health_executes_commands, false);
    assert.equal(validateOperationalRouteOperatorHealth(operatorHealth).status, "pass");
    const operatorHealthText = renderOperationalRouteOperatorHealthText(operatorHealth);
    assert.match(operatorHealthText, /pass_private_manual_review_operator_health/);
    assert.match(operatorHealthText, /operator_doc_drift/);
    assert.match(operatorHealthText, /Blockers:\n- none/);
    assert.doesNotMatch(operatorHealthText, /development requirements check|Fixture operator answer|"query_label"\s*:|"question"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const operatorHealthWrite = await writeOperationalRouteOperatorHealth({
      repoRoot,
      registryRef,
      latestEvidenceRef: latestEvidenceWrite.operational_route_latest_evidence_ref,
      operatorBriefRef: operatorBriefWrite.operational_route_operator_brief_ref,
      docDriftRef: docDriftWrite.operational_route_operator_doc_drift_ref,
      operatorHealthId: "fixture_operational_route_operator_health_written",
      now: "2026-05-28T01:21:30Z",
    });
    assert.equal(operatorHealthWrite.status, "written");
    assert.match(operatorHealthWrite.operational_route_operator_health_ref, /^_workmeta\/system\/reports\/rag\/operational_route_operator_health\//);
    const writtenOperatorHealth = await loadOperationalRouteOperatorHealth({
      repoRoot,
      healthRef: operatorHealthWrite.operational_route_operator_health_ref,
    });
    assert.equal(validateOperationalRouteOperatorHealth(writtenOperatorHealth).status, "pass");
    assert.doesNotMatch(JSON.stringify(writtenOperatorHealth), /development requirements check|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|\/Users\/|[A-Za-z]:[\\/]/);

    const healthGatedOperatorRun = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      operatorHealthRef: operatorHealthWrite.operational_route_operator_health_ref,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_health_gated_operator_run",
      now: "2026-05-28T01:21:45Z",
    });
    assert.match(healthGatedOperatorRun, /Operator health gate:/);
    assert.match(healthGatedOperatorRun, /Health status: pass_private_manual_review_operator_health/);
    assert.match(healthGatedOperatorRun, /Health validation: pass/);
    assert.match(healthGatedOperatorRun, /Health registry match: yes/);
    assert.match(healthGatedOperatorRun, /Fixture operator answer/);
    assert.doesNotMatch(healthGatedOperatorRun, /development requirements check|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);

    const healthGatedNoAnswerProbe = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      operatorHealthRef: operatorHealthWrite.operational_route_operator_health_ref,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_health_gated_operator_run_no_answer_probe",
      skipAnswerShell: true,
      now: "2026-05-28T01:21:46Z",
    });
    assert.match(healthGatedNoAnswerProbe, /Health status: pass_private_manual_review_operator_health/);
    assert.match(healthGatedNoAnswerProbe, /Operator answer shell: skipped/);
    assert.match(healthGatedNoAnswerProbe, /health-gated no-answer probe/);
    assert.match(healthGatedNoAnswerProbe, /Usage record written: no/);
    assert.doesNotMatch(healthGatedNoAnswerProbe, /Fixture operator answer|development requirements check|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);

    const skippedRecordedRun = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      operatorHealthRef: operatorHealthWrite.operational_route_operator_health_ref,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_health_gated_operator_run_skipped_record",
      recordUsage: true,
      skipAnswerShell: true,
      usageId: "fixture_health_gated_skipped_usage_001",
      now: "2026-05-28T01:21:46Z",
    });
    assert.match(skippedRecordedRun, /cannot be combined with --record-usage/);
    assert.match(skippedRecordedRun, /Usage record written: no/);
    assert.doesNotMatch(skippedRecordedRun, /Fixture operator answer|Usage record written: yes|development requirements check|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);
    await assert.rejects(
      readFile(path.join(repoRoot, "_workmeta", "system", "reports", "rag", "operational_route_usage", "fixture_health_gated_skipped_usage_001", "usage_record.json"), "utf8"),
    );

    const healthGatedRecordedRun = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      operatorHealthRef: operatorHealthWrite.operational_route_operator_health_ref,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_health_gated_operator_run_recorded",
      recordUsage: true,
      usageId: "fixture_health_gated_operator_run_usage_001",
      now: "2026-05-28T01:21:47Z",
    });
    assert.match(healthGatedRecordedRun, /Health status: pass_private_manual_review_operator_health/);
    assert.match(healthGatedRecordedRun, /Usage record written: yes/);
    assert.match(healthGatedRecordedRun, /Usage raw query persisted: no/);
    assert.match(healthGatedRecordedRun, /Usage record validation: pass/);
    assert.match(healthGatedRecordedRun, /Route usage count after write: 2/);
    assert.match(healthGatedRecordedRun, /Repeated-use review threshold: 3/);
    assert.match(healthGatedRecordedRun, /Repeated-use review ready: no/);
    assert.match(healthGatedRecordedRun, /Fixture operator answer/);
    assert.doesNotMatch(healthGatedRecordedRun, /development requirements check|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);
    const healthGatedUsageRef = healthGatedRecordedRun.match(/Usage record ref: ([^\n]+)/)?.[1];
    assert.ok(healthGatedUsageRef);
    const healthGatedUsage = await loadOperationalRouteUsageRecord({ repoRoot, recordRef: healthGatedUsageRef });
    assert.equal(validateOperationalRouteUsageRecord(healthGatedUsage).status, "pass");
    assert.equal(healthGatedUsage.raw_query_persisted, false);
    assert.match(healthGatedUsage.query_label_fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(healthGatedUsage, "query_label"), false);
    assert.equal(Object.hasOwn(healthGatedUsage, "question"), false);
    assert.doesNotMatch(
      JSON.stringify(healthGatedUsage),
      /development requirements check|Fixture operator answer|"query_label"\s*:|"question"\s*:|"answer_shell_output"\s*:|"answer_card_body"\s*:|"source_text"\s*:|"chunk_text"\s*:|"excerpt"\s*:|\/Users\/|[A-Za-z]:[\\/]/,
    );

    const healthGatedCustomUsageRoot = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      operatorHealthRef: operatorHealthWrite.operational_route_operator_health_ref,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_health_gated_operator_run_custom_usage_root",
      recordUsage: true,
      usageId: "fixture_health_gated_custom_usage_001",
      usageOutputRef: "_workmeta/fixture_project/reports/rag/operational_route_usage/fixture_health_gated_custom_usage_001/usage_record.json",
      now: "2026-05-28T01:21:48Z",
    });
    assert.match(healthGatedCustomUsageRoot, /Usage record validation: pass/);
    assert.match(healthGatedCustomUsageRoot, /Route usage count after write: 1/);
    assert.match(healthGatedCustomUsageRoot, /Repeated-use review threshold: 3/);
    assert.match(healthGatedCustomUsageRoot, /Repeated-use review ready: no/);
    assert.doesNotMatch(healthGatedCustomUsageRoot, /development requirements check|candidate_record_ref|\/Users\/|[A-Za-z]:[\\/]/);

    const blockedHealthRef = "_workmeta/system/reports/rag/operational_route_operator_health/fixture_blocked_operator_health/operator_health.json";
    await writeFileWithParents(
      repoRoot,
      blockedHealthRef,
      JSON.stringify({
        ...writtenOperatorHealth,
        health_id: "fixture_blocked_operator_health",
        status: "blocked_operator_health",
        blockers: ["forced_fixture_blocker"],
      }, null, 2),
    );
    const blockedHealthGatedRun = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      operatorHealthRef: blockedHealthRef,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_blocked_health_gated_operator_run",
      now: "2026-05-28T01:21:50Z",
    });
    assert.match(blockedHealthGatedRun, /Health status: blocked_operator_health/);
    assert.match(blockedHealthGatedRun, /Operator answer shell: skipped/);
    assert.match(blockedHealthGatedRun, /operator health gate did not pass/);
    assert.doesNotMatch(blockedHealthGatedRun, /Fixture operator answer|development requirements check|\/Users\/|[A-Za-z]:[\\/]/);

    const usageWithoutHealthRun = await renderOperationalRouteOperatorRun({
      repoRoot,
      registryRef,
      smokeTestRef: smokeTestsRef,
      queryLabel: "development requirements check",
      planId: "fixture_operational_route_record_usage_without_health",
      recordUsage: true,
      usageId: "fixture_usage_without_health",
      now: "2026-05-28T01:21:55Z",
    });
    assert.match(usageWithoutHealthRun, /Health status: not_checked/);
    assert.match(usageWithoutHealthRun, /Operator answer shell: skipped/);
    assert.match(usageWithoutHealthRun, /--record-usage requires a passing operator health ref/);
    assert.match(usageWithoutHealthRun, /Usage record written: no/);
    assert.doesNotMatch(usageWithoutHealthRun, /Fixture operator answer|development requirements check|\/Users\/|[A-Za-z]:[\\/]/);
    await assert.rejects(
      readFile(path.join(repoRoot, "_workmeta", "system", "reports", "rag", "operational_route_usage", "fixture_usage_without_health", "usage_record.json"), "utf8"),
    );

    const maliciousOperatorHealthValidation = validateOperationalRouteOperatorHealth({
      schema_version: "soulforge.operational_route_operator_health.v0",
      kind: "operational_route_operator_health",
      health_id: "fixture_malicious_operator_health",
      registry_ref: registryRef,
      status: "pass_private_manual_review_operator_health",
      answer_shell_output: "SHOULD_BLOCK",
      latest_refs: {},
      surface_statuses: {},
      validations: {},
      blockers: [],
      boundary: {
        metadata_only: true,
        operator_health_scans_stored_metadata_only: true,
        operator_health_reads_operator_docs_only_for_doc_drift: true,
        source_text_loaded: false,
        chunk_text_loaded: false,
        source_payloads_included: false,
        copied_excerpts_included: false,
        notebooklm_answers_included: false,
        secrets_or_session_included: false,
        runtime_absolute_paths_included: false,
        operator_health_executes_commands: true,
        operator_health_writes_usage_or_candidate: true,
        operator_health_writes_call_plan: true,
        operator_health_launches_sourcebound_review: true,
        raw_query_persisted: true,
        answer_shell_output_persisted: true,
        answer_card_body_persisted: true,
        source_truth_claimed: true,
        final_answer_authority_allowed: true,
        public_canon_promotion_allowed: true,
        ontology_acceptance_allowed: true,
        graph_truth_mutation_allowed: true,
        default_route_mutation_allowed: true,
        external_upload_allowed: true,
      },
    });
    assert.equal(maliciousOperatorHealthValidation.status, "blocked");
    assert.ok(maliciousOperatorHealthValidation.blockers.includes("forbidden_payload_key:operational_route_operator_health.answer_shell_output"));
    assert.ok(maliciousOperatorHealthValidation.blockers.includes("boundary_operator_health_executes_commands_must_be_false"));
    assert.ok(maliciousOperatorHealthValidation.blockers.includes("boundary_operator_health_writes_usage_or_candidate_must_be_false"));
    assert.ok(maliciousOperatorHealthValidation.blockers.includes("boundary_operator_health_writes_call_plan_must_be_false"));
    assert.ok(maliciousOperatorHealthValidation.blockers.includes("boundary_operator_health_launches_sourcebound_review_must_be_false"));
    assert.ok(maliciousOperatorHealthValidation.blockers.includes("boundary_raw_query_persisted_must_be_false"));
    assert.ok(maliciousOperatorHealthValidation.blockers.includes("boundary_source_truth_claimed_must_be_false"));

    const maliciousOpsCheckValidation = validateOperationalRouteOpsCheck({
      schema_version: "soulforge.operational_route_ops_check.v0",
      kind: "operational_route_ops_check",
      ops_check_id: "fixture_malicious_ops_check",
      registry_ref: registryRef,
      status: "pass_private_manual_review_ready",
      surfaces: {},
      counts: {},
      answer_shell_output: "SHOULD_BLOCK",
      authority: {
        operator_use_allowed: true,
        sourcebound_review_launch_allowed_here: true,
      },
      boundary: {
        metadata_only: true,
        ops_check_executes_commands: true,
        ops_check_writes_usage_or_candidate: true,
        ops_check_launches_sourcebound_review: true,
        answer_card_body_persisted: true,
        public_canon_promotion_allowed: true,
      },
    });
    assert.equal(maliciousOpsCheckValidation.status, "blocked");
    assert.ok(maliciousOpsCheckValidation.blockers.includes("forbidden_payload_key:operational_route_ops_check.answer_shell_output"));
    assert.ok(maliciousOpsCheckValidation.blockers.includes("authority_sourcebound_review_launch_allowed_here_must_be_false"));
    assert.ok(maliciousOpsCheckValidation.blockers.includes("boundary_ops_check_executes_commands_must_be_false"));
    assert.ok(maliciousOpsCheckValidation.blockers.includes("boundary_ops_check_writes_usage_or_candidate_must_be_false"));
    assert.ok(maliciousOpsCheckValidation.blockers.includes("boundary_ops_check_launches_sourcebound_review_must_be_false"));
    assert.ok(maliciousOpsCheckValidation.blockers.includes("boundary_answer_card_body_persisted_must_be_false"));
    assert.ok(maliciousOpsCheckValidation.blockers.includes("boundary_public_canon_promotion_allowed_must_be_false"));

    const blockedValidation = await validateOperationalRouteRegistry({
      repoRoot,
      registry: {
        ...{
          schema_version: "soulforge.fixture.operational_route_registry.v0",
          kind: "private_operational_route_registry",
          registry_id: "fixture_blocked",
          route_defaults: {
            claim_ceiling: "source_supported_manual_review_current_claim_scope_only",
            source_payload_loading_allowed: false,
            use_as_public_default_route: false,
          },
          routes: [],
        },
        boundary: {
          source_text_included: true,
          chunk_text_included: false,
          copied_excerpt_included: false,
          notebooklm_answer_included: false,
          source_truth_claimed: false,
          final_answer_authority_allowed: false,
          public_canon_promotion_allowed: false,
          ontology_acceptance_allowed: false,
          external_upload_allowed: false,
          default_route_mutation_allowed: false,
          graph_truth_mutation_allowed: false,
        },
      },
      checkFiles: false,
      checkWorkCards: false,
    });
    assert.equal(blockedValidation.status, "blocked");
    assert.ok(blockedValidation.blockers.includes("boundary_source_text_included_must_be_false"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("source-text retrieval normalizes Korean technical queries and ranks dense matches", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-rag-korean-retrieval-"));
  try {
    const sourceRef = "_workspaces/knowledge/common/systems_engineering/starter/korean_retrieval_fixture.md";
    const sourceCardRef = "_workspaces/knowledge/source_cards/korean_retrieval_fixture.source_card.json";
    await writeFileWithParents(
      repoRoot,
      sourceRef,
      [
        "# Synthetic Korean Retrieval Fixture",
        "",
        "체계공학 관점의 검토 항목은 요구사항, 인터페이스, 검증 계획을 함께 정리한다.",
        "",
        "위험 요구사항 관리는 위험 원인, 완화 조건, 검증 기준을 연결해 추적한다.",
        "",
        "범용 개요: SW, 신뢰성, 시험, 평가, 검토라는 단어를 넓게 나열하지만 조합 항목을 설명하지 않는다.",
        "",
        "세부 항목: S/W신뢰성 시험평가는 소프트웨어 결함 재현 조건과 신뢰성 검토 기준을 함께 확인한다.",
        "",
        "변형 항목: AI-ML검증은 A I M L 검증 요청과 같은 약어 구두점 변형에도 연결되어야 한다.",
      ].join("\n"),
    );
    const sourceCard = {
      schema_version: "soulforge.knowledge_source_card.v0",
      source_id: "fixture_korean_retrieval_quality",
      title: "Fixture Korean Retrieval Quality",
      source_ref: {
        repo_relative_path: sourceRef,
      },
      source_kind: "markdown_source_text",
      domains: ["systems_engineering", "retrieval_quality"],
      sensitivity: "internal_common",
      approval_status: "owner_approved_starter_source",
      rag_permissions: {
        source_text_retrieval: true,
        index_build: true,
        answer_synthesis: true,
      },
      public_canon_promotion_allowed: false,
      notebooklm_packet_allowed: false,
      claim_ceiling: "observed",
    };
    await writeFileWithParents(repoRoot, sourceCardRef, JSON.stringify(sourceCard, null, 2));
    const index = await buildSourceTextIndex({
      repoRoot,
      sourceCardRef,
      indexId: "fixture_korean_retrieval_quality_index",
      maxChars: 110,
      now: "2026-05-25T09:00:00Z",
    });
    assert.equal(validateSourceTextIndex(index).status, "pass");
    const denseChunk = index.chunks.find((chunk) => chunk.chunk_text.includes("세부 항목"));
    const broadChunk = index.chunks.find((chunk) => chunk.chunk_text.includes("범용 개요"));
    const acronymVariantChunk = index.chunks.find((chunk) => chunk.chunk_text.includes("변형 항목"));
    assert.ok(denseChunk);
    assert.ok(broadChunk);
    assert.ok(acronymVariantChunk);

    const spacingAndPunctuationRun = await buildSourceTextAnswerRun({
      repoRoot,
      sourceTextIndex: index,
      sourceTextIndexRef: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture_korean_retrieval_quality/source_text_index.json",
      question: "S W 신뢰성 시험 평가 기준은 무엇인가요",
      runId: "fixture_korean_spacing_punctuation_regression",
      now: "2026-05-25T09:01:00Z",
    });
    assert.equal(spacingAndPunctuationRun.status, "source_text_answer");
    assert.equal(spacingAndPunctuationRun.response.citations[0].chunk_id, denseChunk.chunk_id);
    assert.equal(validateSourceTextAnswerRun(spacingAndPunctuationRun).status, "pass");
    assert.doesNotMatch(JSON.stringify(spacingAndPunctuationRun), /S W 신뢰성 시험 평가 기준은 무엇인가요|\/Users\/|\/Volumes\//);

    const broadHitRegressionRun = await buildSourceTextAnswerRun({
      repoRoot,
      sourceTextIndex: index,
      sourceTextIndexRef: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture_korean_retrieval_quality/source_text_index.json",
      question: "SW 신뢰성 시험평가 검토",
      runId: "fixture_korean_broad_hit_regression",
      now: "2026-05-25T09:02:00Z",
    });
    assert.equal(broadHitRegressionRun.status, "source_text_answer");
    assert.equal(broadHitRegressionRun.response.citations[0].chunk_id, denseChunk.chunk_id);
    assert.notEqual(broadHitRegressionRun.response.citations[0].chunk_id, broadChunk.chunk_id);
    assert.equal(validateSourceTextAnswerRun(broadHitRegressionRun).status, "pass");

    const acronymRun = await buildSourceTextAnswerRun({
      repoRoot,
      sourceTextIndex: index,
      sourceTextIndexRef: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture_korean_retrieval_quality/source_text_index.json",
      question: "A I M L 검증",
      runId: "fixture_korean_acronym_regression",
      now: "2026-05-25T09:03:00Z",
    });
    assert.equal(acronymRun.status, "source_text_answer");
    assert.equal(acronymRun.response.citations[0].chunk_id, acronymVariantChunk.chunk_id);

    const q1LikeRun = await buildSourceTextAnswerRun({
      repoRoot,
      sourceTextIndex: index,
      sourceTextIndexRef: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture_korean_retrieval_quality/source_text_index.json",
      question: "체계 공학 검토",
      runId: "fixture_korean_q1_like_control",
      now: "2026-05-25T09:04:00Z",
    });
    assert.equal(q1LikeRun.status, "source_text_answer");
    assert.equal(validateSourceTextAnswerRun(q1LikeRun).status, "pass");

    const q3LikeRun = await buildSourceTextAnswerRun({
      repoRoot,
      sourceTextIndex: index,
      sourceTextIndexRef: "_workspaces/knowledge/rag/indexes_local/source_text_indexes/fixture_korean_retrieval_quality/source_text_index.json",
      question: "위험 요구사항 검증 기준",
      runId: "fixture_korean_q3_like_control",
      now: "2026-05-25T09:05:00Z",
    });
    assert.equal(q3LikeRun.status, "source_text_answer");
    assert.equal(validateSourceTextAnswerRun(q3LikeRun).status, "pass");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function writeFixtureRepo(repoRoot) {
  await writeYaml(repoRoot, ".registry/knowledge/source_criticism/knowledge.yaml", {
    knowledge_id: "source_criticism",
    kind: "knowledge",
    status: "active",
    title: "Source Criticism",
    summary: "Source criticism keeps claims tied to approved evidence.",
  });
  await writeYaml(repoRoot, ".registry/knowledge/graph_rag/knowledge.yaml", {
    knowledge_id: "graph_rag",
    kind: "knowledge",
    status: "active",
    title: "GraphRAG",
    summary: "GraphRAG combines graph navigation with retrieval readiness.",
    claim_ceiling: "source_supported",
  });
  await writeYaml(repoRoot, ".registry/classes/archivist/class.yaml", {
    class_id: "archivist",
    kind: "class",
    status: "active",
    title: "Archivist",
  });
  await writeYaml(repoRoot, ".registry/classes/archivist/knowledge_refs.yaml", {
    class_id: "archivist",
    kind: "knowledge_refs",
    status: "active",
    assign: [
      { assign: "source_criticism", ref: "source_criticism" },
      { assign: "graph_rag", ref: "graph_rag" },
    ],
  });
  await writeYaml(repoRoot, ".registry/species/human/species.yaml", {
    species_id: "human",
    kind: "species",
    status: "active",
    title: "Human",
  });
  await writeYaml(repoRoot, ".unit/scribe_01/unit.yaml", {
    unit_id: "scribe_01",
    status: "active",
    identity: { species_id: "human" },
    class_ids: ["archivist"],
  });
  await writeYaml(repoRoot, ".workflow/index.yaml", {
    entries: [{ workflow_id: "knowledge_access_event_capture_v0", path: "knowledge_access_event_capture_v0/workflow.yaml" }],
  });
  await writeYaml(repoRoot, ".workflow/knowledge_access_event_capture_v0/workflow.yaml", {
    workflow_id: "knowledge_access_event_capture_v0",
    kind: "workflow",
    status: "active",
    title: "Knowledge Access Event Capture v0",
  });
  await writeYaml(repoRoot, ".workflow/knowledge_access_event_capture_v0/profile_policy.yaml", {
    workflow_id: "knowledge_access_event_capture_v0",
    kind: "workflow_profile_policy",
    status: "active",
    primary_profile: {
      model: "gpt-5.5",
      reasoning_effort: "medium",
      species: "human",
      class: "archivist",
      quality_class: "quality_equivalent_pass",
    },
  });
  await writeYaml(repoRoot, ".party/index.yaml", {
    entries: [{ party_id: "knowledge_wiki_cell", path: "knowledge_wiki_cell/party.yaml" }],
  });
  await writeYaml(repoRoot, ".party/knowledge_wiki_cell/party.yaml", {
    party_id: "knowledge_wiki_cell",
    kind: "party_template",
    status: "active",
    title: "Knowledge Wiki Cell",
    default_workflow_id: "knowledge_access_event_capture_v0",
    workflow_chain: [{ workflow_id: "knowledge_access_event_capture_v0" }],
  });
}

async function writeWorkspaceSystemBinding(repoRoot, state) {
  await writeFileWithParents(
    repoRoot,
    "_workmeta/system/bindings/workspace_junctions.yaml",
    `schema_version: soulforge.workspace_junction_binding.v1
junctions:
  - workspace_alias: system
    project_code: null
    cloud_relative_path: system
    link_relative_path: _workspaces/system
    state: ${state}
`,
  );
}

async function writeFileWithParents(repoRoot, relativePath, value) {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${value}\n`, "utf8");
}

async function writeSourceTextRuntimePreflightCliFixture(repoRoot, fakeBin) {
  await writeFileWithParents(repoRoot, "guild_hall/state/tools/source_extraction_venv/bin/python", "");
  await writeFileWithParents(repoRoot, "guild_hall/state/tools/source_extraction_venv/bin/docling", "");
  await writeFileWithParents(repoRoot, "guild_hall/state/tools/source_extraction_venv/Scripts/python.exe", "");
  await writeFileWithParents(repoRoot, "guild_hall/state/tools/source_extraction_venv/Scripts/docling.exe", "");
  await writeFileWithParents(repoRoot, "guild_hall/state/tools/tessdata/eng.traineddata", "eng");
  await writeFileWithParents(repoRoot, "guild_hall/state/tools/tessdata/kor.traineddata", "kor");
  await writeFileWithParents(repoRoot, "guild_hall/state/tools/tessdata/kor_vert.traineddata", "kor_vert");
  await writeFileWithParents(repoRoot, "guild_hall/state/tools/tessdata/osd.traineddata", "osd");
  await writeFileWithParents(fakeBin, "java", "");
  await writeFileWithParents(fakeBin, "java.exe", "");
  await writeFileWithParents(fakeBin, "soffice", "");
  await writeFileWithParents(fakeBin, "soffice.com", "");
  await writeFileWithParents(fakeBin, "soffice.exe", "");
  await writeFileWithParents(fakeBin, "tesseract", "");
  await writeFileWithParents(fakeBin, "tesseract.exe", "");
}

function sourceTextRuntimePreflightCliEnv(fakeBin) {
  const env = {
    PATH: fakeBin,
    Path: fakeBin,
    JAVA_HOME: "",
    LIBREOFFICE_HOME: "",
    TESSERACT_HOME: "",
    TESSDATA_PREFIX: "",
    HWPX_CONVERTER_CMD: "",
    HANCOM_HOME: "",
    [RUNTIME_PREFLIGHT_FAKE_SECRET_ENV_KEY]: RUNTIME_PREFLIGHT_FAKE_SECRET_ENV_VALUE,
  };
  for (const key of ["HOME", "USERPROFILE", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

async function runRagCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFileCallback(process.execPath, ["guild_hall/rag/cli.mjs", ...args], {
      cwd: path.resolve("."),
      env: options.env,
      maxBuffer: 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error?.signal) {
        reject(error);
        return;
      }
      resolve({
        exitCode: error ? Number(error.code ?? 1) : 0,
        stdout: String(stdout),
        stderr: String(stderr),
      });
    });
  });
}

function assertNoUnsafeRuntimePreflightCliOutput(stdout, localPath) {
  assert.equal(stdout.includes(localPath), false);
  const localRootNames = ["Volumes", "Users", "tmp", "private", "var", "home", "opt"].join("|");
  const slash = String.raw`[\\/]`;
  assert.doesNotMatch(stdout, new RegExp(`${slash}(?:${localRootNames})${slash}[^\\s"'{}\\[\\],<>]+`));
  assert.doesNotMatch(stdout, /[A-Za-z]:[\\/][^\s"'{}\[\],<>]+/);
  assert.doesNotMatch(stdout, new RegExp(["file", "://"].join(""), "i"));
  assert.doesNotMatch(stdout, /\b(secret|token|session|credential|cookie|api[_-]?key)\b/i);
}

function assertNoUnsafeRuntimePreflightBlockers(blockers) {
  assert.ok(Array.isArray(blockers));
  assert.equal(blockers.some((item) => String(item).startsWith("unsafe_runtime_")), false);
}

async function writeYaml(repoRoot, relativePath, value) {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const lines = Object.entries(value)
    .map(([key, child]) => `${key}: ${formatYamlValue(child, 0)}`)
    .join("\n");
  await writeFile(filePath, `${lines}\n`, "utf8");
}

async function writeExtractionStatusFixture(repoRoot) {
  const filePath = path.join(repoRoot, "_workmeta/system/runs/source_text_fixture/extraction_status.csv");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    [
      "handle,extension,bytes,extracted_chars,page_count,slide_count,sheets,status,private_text_ref,metadata,note",
      "fixture_docx,.docx,1200,450,3,,,ok,private_text_ref_hidden,{producer:fixture},",
      "fixture_hwp,.hwp,900,0,,,,blocked,,{},hwp_requires_hwpx_preprocess",
      "fixture_zip,.zip,2000,0,,,,container_only,,{},zip_inventory_only",
    ].join("\n"),
    "utf8",
  );
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function formatYamlValue(value, depth) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `\n${value.map((item) => `${"  ".repeat(depth + 1)}- ${formatYamlValue(item, depth + 1).trimStart()}`).join("\n")}`;
  }
  if (value && typeof value === "object") {
    return `\n${Object.entries(value)
      .map(([key, child]) => `${"  ".repeat(depth + 1)}${key}: ${formatYamlValue(child, depth + 1)}`)
      .join("\n")}`;
  }
  return JSON.stringify(value);
}
