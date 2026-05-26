import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { exportKnowledgeGraph } from "../knowledge_graph/graph_export.mjs";
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
  buildSourceTextAnswerRun,
  buildSourceTextIndex,
  validateKnowledgeSourceCard,
  validateSourceTextAnswerRun,
  validateSourceTextIndex,
  writeSourceTextAnswerRun,
  writeSourceTextIndex,
} from "./source_text_index.mjs";
import {
  COMPANY_KNOWLEDGE_INTAKE_PACKET_SCHEMA_VERSION,
  loadCompanyKnowledgeIntakePacket,
  validateCompanyKnowledgeIntakePacket,
} from "./company_knowledge_intake_packet.mjs";

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

    const answerRun = await buildSourceTextAnswerRun({
      repoRoot,
      sourceTextIndexRef: indexWrite.source_text_index_ref,
      question: "NotebookLM authority",
      runId: "fixture_source_text_answer_run",
      now: "2026-05-25T08:02:00Z",
    });
    assert.equal(answerRun.schema_version, "soulforge.source_text_answer_run.v0");
    assert.equal(answerRun.status, "source_text_answer");
    assert.equal(answerRun.query.raw_query_persisted, false);
    assert.equal(answerRun.response.answer_uses_source_text, true);
    assert.ok(answerRun.response.answer_text.includes("NotebookLM"));
    assert.equal(validateSourceTextAnswerRun(answerRun).status, "pass");
    assert.doesNotMatch(JSON.stringify(answerRun), /"question"\s*:|NotebookLM authority|\/Users\/|\/Volumes\//);

    const answerWrite = await writeSourceTextAnswerRun({
      repoRoot,
      sourceTextIndexRef: indexWrite.source_text_index_ref,
      question: "project workspace common knowledge",
      runId: "fixture_source_text_answer_run_written",
      now: "2026-05-25T08:03:00Z",
    });
    assert.equal(answerWrite.status, "written");
    assert.match(answerWrite.source_text_answer_run_ref, /^_workspaces\/knowledge\/rag\/answer_runs\//);
    const writtenAnswerRun = JSON.parse(await readFile(path.join(repoRoot, answerWrite.source_text_answer_run_ref), "utf8"));
    assert.equal(validateSourceTextAnswerRun(writtenAnswerRun).status, "pass");

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

async function writeFileWithParents(repoRoot, relativePath, value) {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${value}\n`, "utf8");
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
