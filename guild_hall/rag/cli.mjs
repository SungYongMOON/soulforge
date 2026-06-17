#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  buildSourceTextMetadataProfile,
  loadSourceTextMetadataProfile,
  validateSourceTextMetadataProfile,
  writeSourceTextMetadataProfile,
} from "./source_text_profile.mjs";
import {
  buildSourceTextExtractionPacket,
  loadSourceTextExtractionPacket,
  validateSourceTextExtractionPacket,
  writeSourceTextExtractionPacket,
} from "./source_text_extraction_packet.mjs";
import {
  buildRagAnswerEngineRun,
  loadRagAnswerEngineRun,
  renderAnswerEngineRunText,
  validateRagAnswerEngineRun,
  writeRagAnswerEngineRun,
} from "./answer_engine_run.mjs";
import {
  loadCompanyKnowledgeIntakePacket,
  validateCompanyKnowledgeIntakePacket,
  validateCompanyKnowledgeIntakePacketWithLinkedReadyManifests,
} from "./company_knowledge_intake_packet.mjs";
import {
  validateSourceSyncReadyRef,
} from "./source_sync_ready_manifest.mjs";
import {
  buildSourceTextExtractionRunReport,
  loadSourceTextExtractionRunReport,
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
  loadKnowledgeSourceCard,
  loadSourceTextAnswerRun,
  loadSourceTextIndex,
  loadSourceTextTraceabilitySidecar,
  renderSourceTextAnswerRunText,
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
  loadRagWorkCard,
  loadSourceTextQualityReview,
  renderRagWorkCardText,
  validateRagWorkCard,
  validateSourceTextQualityReview,
  writeRagWorkCard,
  writeSourceTextQualityReview,
} from "./work_card.mjs";
import {
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
  renderOperationalRouteAnswerShell,
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
  renderOperationalRouteResolutionText,
  renderOperationalRouteSuggestionSafetyText,
  renderOperationalRouteSessionDigest,
  renderOperationalRouteSessionSweepText,
  renderOperationalRouteStatusDigest,
  renderOperationalRouteUsageRecordText,
  renderOperationalRouteUsageSummaryText,
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
import {
  answerFromRagManifest,
  buildRagMetadataIndex,
  buildRagManifest,
  buildRagRetrievalEvaluation,
  buildRagRetrievalTrace,
  buildSourceSliceDecisionPacket,
  buildSourceSliceOwnerDecisionRecord,
  buildSourceSliceCards,
  buildSourceSliceReviewQueue,
  buildSourceSliceTriageRegister,
  loadRagMetadataIndex,
  loadRagRetrievalEvaluation,
  loadRagRetrievalTrace,
  loadSourceSliceOwnerDecisionRecord,
  loadSourceSliceDecisionPacket,
  loadRagManifest,
  loadSourceSliceCards,
  loadSourceSliceReviewQueue,
  loadSourceSliceTriageRegister,
  renderAnswerText,
  validateRagManifest,
  validateRagMetadataIndex,
  validateRagRetrievalEvaluation,
  validateRagRetrievalTrace,
  validateRagAnswer,
  validateSourceSliceCards,
  validateSourceSliceDecisionPacket,
  validateSourceSliceOwnerDecisionRecord,
  validateSourceSliceReviewQueue,
  validateSourceSliceTriageRegister,
  writeRagMetadataIndex,
  writeRagRetrievalEvaluation,
  writeRagRetrievalTrace,
  writeRagManifest,
  writeSourceSliceDecisionPacket,
  writeSourceSliceOwnerDecisionRecord,
  writeSourceSliceCards,
  writeSourceSliceReviewQueue,
  writeSourceSliceTriageRegister,
} from "./rag.mjs";
import {
  buildMasterKnowledgeInventoryRefresh,
  loadMasterKnowledgeInventoryRefresh,
  validateMasterKnowledgeInventoryRefresh,
  writeMasterKnowledgeInventoryRefresh,
} from "./master_inventory_refresh.mjs";
import {
  buildKnowledgeSourceStorageAudit,
  loadKnowledgeSourceStorageAudit,
  validateKnowledgeSourceStorageAudit,
  writeKnowledgeSourceStorageAudit,
} from "./source_storage_audit.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());

  if (command === "master-inventory-refresh" || command === "refresh-master-inventory") {
    const options = {
      repoRoot,
      outputRootRef: optionalStringArg(args, "output-root-ref"),
      inventoryId: optionalStringArg(args, "inventory-id"),
      notebooklmMetadataRef: optionalStringArg(args, "notebooklm-metadata-ref"),
      now: optionalStringArg(args, "now"),
      date: optionalStringArg(args, "date"),
    };
    if (args.write) {
      printJson(await writeMasterKnowledgeInventoryRefresh(options));
      return;
    }
    const refresh = await buildMasterKnowledgeInventoryRefresh(options);
    if (args.full) {
      printJson(refresh);
      return;
    }
    printJson({
      status: refresh.status,
      output_dir_ref: refresh.output_dir_ref,
      artifacts: refresh.artifacts,
      total_rows: refresh.summary.summary.total_rows,
      candidate_rows: refresh.summary.summary.candidate_ledger_rows,
      notebooklm_notebooks: refresh.summary.summary.notebooklm_notebooks,
      notebooklm_sources: refresh.summary.summary.notebooklm_sources,
      selected_sourcebound_candidate_id: refresh.sourcebound_review_selection.selected_candidate?.candidate_id ?? null,
      validation: refresh.validation,
    });
    return;
  }

  if (command === "validate-master-inventory-refresh") {
    const inventory = await loadMasterKnowledgeInventoryRefresh({
      repoRoot,
      inventoryRef: optionalStringArg(args, "inventory-ref"),
    });
    printJson(validateMasterKnowledgeInventoryRefresh(inventory));
    return;
  }

  if (command === "knowledge-source-storage-audit" || command === "source-storage-audit") {
    const options = {
      repoRoot,
      outputRootRef: optionalStringArg(args, "output-root-ref"),
      auditId: optionalStringArg(args, "audit-id"),
      now: optionalStringArg(args, "now"),
      date: optionalStringArg(args, "date"),
      workmetaRootRef: optionalStringArg(args, "workmeta-root-ref"),
      workspaceRootRefs: arrayArg(args, "workspace-root-ref"),
      scanWorkspace: args["skip-workspace-scan"] ? false : true,
      hashFiles: args["hash-files"] === true,
      maxOrphanRows: optionalNumberArg(args, "max-orphan-rows"),
    };
    if (options.workspaceRootRefs.length === 0) {
      delete options.workspaceRootRefs;
    }
    if (args.write) {
      printJson(await writeKnowledgeSourceStorageAudit(options));
      return;
    }
    const result = await buildKnowledgeSourceStorageAudit(options);
    if (args.full) {
      printJson(result);
      return;
    }
    printJson({
      status: result.status,
      output_dir_ref: result.output_dir_ref,
      artifacts: result.artifacts,
      summary: result.summary.counts,
      validation: result.validation,
    });
    return;
  }

  if (command === "validate-knowledge-source-storage-audit" || command === "validate-source-storage-audit") {
    const audit = await loadKnowledgeSourceStorageAudit({
      repoRoot,
      auditRef: optionalStringArg(args, "audit-ref"),
    });
    const validation = validateKnowledgeSourceStorageAudit(audit);
    printJson(validation);
    if (validation.status !== "pass") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "manifest") {
    if (args.write) {
      printJson(
        await writeRagManifest({
          repoRoot,
          graphRef: optionalStringArg(args, "graph-ref"),
          exportId: optionalStringArg(args, "export-id"),
          outputRef: optionalStringArg(args, "output-ref"),
          manifestId: optionalStringArg(args, "manifest-id"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildRagManifest({
        repoRoot,
        graphRef: optionalStringArg(args, "graph-ref"),
        exportId: optionalStringArg(args, "export-id"),
        manifestId: optionalStringArg(args, "manifest-id"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "source-slice-cards" || command === "source-slices") {
    if (args.write) {
      printJson(
        await writeSourceSliceCards({
          repoRoot,
          manifestRef: optionalStringArg(args, "manifest-ref"),
          graphRef: optionalStringArg(args, "graph-ref"),
          exportId: optionalStringArg(args, "export-id"),
          outputRef: optionalStringArg(args, "output-ref"),
          sliceSetId: optionalStringArg(args, "slice-set-id"),
          projectCode: optionalStringArg(args, "project-code"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceSliceCards({
        repoRoot,
        manifestRef: optionalStringArg(args, "manifest-ref"),
        graphRef: optionalStringArg(args, "graph-ref"),
        exportId: optionalStringArg(args, "export-id"),
        sliceSetId: optionalStringArg(args, "slice-set-id"),
        projectCode: optionalStringArg(args, "project-code"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate") {
    const manifest = await loadRagManifest({ repoRoot, manifestRef: optionalStringArg(args, "manifest-ref") });
    printJson(validateRagManifest(manifest));
    return;
  }

  if (command === "validate-source-slice-cards" || command === "validate-source-slices") {
    const cardSet = await loadSourceSliceCards({ repoRoot, sourceSliceRef: optionalStringArg(args, "source-slice-ref") });
    printJson(validateSourceSliceCards(cardSet));
    return;
  }

  if (command === "source-slice-triage-register" || command === "source-slice-intake-register") {
    if (args.write) {
      printJson(
        await writeSourceSliceTriageRegister({
          repoRoot,
          sourceSliceRef: optionalStringArg(args, "source-slice-ref"),
          outputRef: optionalStringArg(args, "output-ref"),
          registerId: optionalStringArg(args, "register-id"),
          projectCode: optionalStringArg(args, "project-code"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceSliceTriageRegister({
        repoRoot,
        sourceSliceRef: optionalStringArg(args, "source-slice-ref"),
        registerId: optionalStringArg(args, "register-id"),
        projectCode: optionalStringArg(args, "project-code"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-source-slice-triage-register" || command === "validate-source-slice-intake-register") {
    const register = await loadSourceSliceTriageRegister({
      repoRoot,
      triageRegisterRef: optionalStringArg(args, "triage-register-ref"),
    });
    printJson(validateSourceSliceTriageRegister(register));
    return;
  }

  if (command === "source-slice-review-queue" || command === "source-review-queue") {
    if (args.write) {
      printJson(
        await writeSourceSliceReviewQueue({
          repoRoot,
          sourceSliceRef: optionalStringArg(args, "source-slice-ref"),
          triageRegisterRef: optionalStringArg(args, "triage-register-ref"),
          outputRef: optionalStringArg(args, "output-ref"),
          queueId: optionalStringArg(args, "queue-id"),
          projectCode: optionalStringArg(args, "project-code"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceSliceReviewQueue({
        repoRoot,
        sourceSliceRef: optionalStringArg(args, "source-slice-ref"),
        triageRegisterRef: optionalStringArg(args, "triage-register-ref"),
        queueId: optionalStringArg(args, "queue-id"),
        projectCode: optionalStringArg(args, "project-code"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-source-slice-review-queue" || command === "validate-source-review-queue") {
    const queue = await loadSourceSliceReviewQueue({ repoRoot, reviewQueueRef: optionalStringArg(args, "review-queue-ref") });
    printJson(validateSourceSliceReviewQueue(queue));
    return;
  }

  if (command === "source-slice-decision-packet" || command === "source-decision-packet") {
    if (args.write) {
      printJson(
        await writeSourceSliceDecisionPacket({
          repoRoot,
          triageRegisterRef: optionalStringArg(args, "triage-register-ref"),
          reviewQueueRef: optionalStringArg(args, "review-queue-ref"),
          outputRef: optionalStringArg(args, "output-ref"),
          packetId: optionalStringArg(args, "packet-id"),
          projectCode: optionalStringArg(args, "project-code"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceSliceDecisionPacket({
        repoRoot,
        triageRegisterRef: optionalStringArg(args, "triage-register-ref"),
        reviewQueueRef: optionalStringArg(args, "review-queue-ref"),
        packetId: optionalStringArg(args, "packet-id"),
        projectCode: optionalStringArg(args, "project-code"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-source-slice-decision-packet" || command === "validate-source-decision-packet") {
    const packet = await loadSourceSliceDecisionPacket({
      repoRoot,
      decisionPacketRef: optionalStringArg(args, "decision-packet-ref"),
    });
    printJson(validateSourceSliceDecisionPacket(packet));
    return;
  }

  if (command === "source-slice-owner-decision-record" || command === "source-owner-decision-record") {
    if (args.write) {
      printJson(
        await writeSourceSliceOwnerDecisionRecord({
          repoRoot,
          decisionPacketRef: optionalStringArg(args, "decision-packet-ref"),
          outputRef: optionalStringArg(args, "output-ref"),
          recordId: optionalStringArg(args, "record-id"),
          projectCode: optionalStringArg(args, "project-code"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceSliceOwnerDecisionRecord({
        repoRoot,
        decisionPacketRef: optionalStringArg(args, "decision-packet-ref"),
        recordId: optionalStringArg(args, "record-id"),
        projectCode: optionalStringArg(args, "project-code"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-source-slice-owner-decision-record" || command === "validate-source-owner-decision-record") {
    const record = await loadSourceSliceOwnerDecisionRecord({
      repoRoot,
      ownerDecisionRecordRef: optionalStringArg(args, "owner-decision-record-ref"),
    });
    printJson(validateSourceSliceOwnerDecisionRecord(record));
    return;
  }

  if (command === "source-text-metadata-profile" || command === "source-text-extraction-profile") {
    const scanRoots = arrayArg(args, "scan-root");
    const extractionLogRefs = arrayArg(args, "extraction-log-ref");
    if (args.write) {
      printJson(
        await writeSourceTextMetadataProfile({
          repoRoot,
          sourceSliceRef: optionalStringArg(args, "source-slice-ref"),
          extractionLogRefs,
          scanRoots,
          outputRef: optionalStringArg(args, "output-ref"),
          profileId: optionalStringArg(args, "profile-id"),
          projectCode: optionalStringArg(args, "project-code"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceTextMetadataProfile({
        repoRoot,
        sourceSliceRef: optionalStringArg(args, "source-slice-ref"),
        extractionLogRefs,
        scanRoots,
        profileId: optionalStringArg(args, "profile-id"),
        projectCode: optionalStringArg(args, "project-code"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-source-text-metadata-profile" || command === "validate-source-text-extraction-profile") {
    const profile = await loadSourceTextMetadataProfile({
      repoRoot,
      profileRef: optionalStringArg(args, "profile-ref"),
    });
    printJson(validateSourceTextMetadataProfile(profile));
    return;
  }

  if (command === "source-text-extraction-packet" || command === "sourcebound-extraction-packet") {
    if (args.write) {
      printJson(
        await writeSourceTextExtractionPacket({
          repoRoot,
          profileRef: optionalStringArg(args, "profile-ref"),
          sourceSliceRef: optionalStringArg(args, "source-slice-ref"),
          outputRef: optionalStringArg(args, "output-ref"),
          packetId: optionalStringArg(args, "packet-id"),
          projectCode: optionalStringArg(args, "project-code"),
          executionMode: optionalStringArg(args, "execution-mode"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceTextExtractionPacket({
        repoRoot,
        profileRef: optionalStringArg(args, "profile-ref"),
        sourceSliceRef: optionalStringArg(args, "source-slice-ref"),
        packetId: optionalStringArg(args, "packet-id"),
        projectCode: optionalStringArg(args, "project-code"),
        executionMode: optionalStringArg(args, "execution-mode"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-source-text-extraction-packet" || command === "validate-sourcebound-extraction-packet") {
    const packet = await loadSourceTextExtractionPacket({
      repoRoot,
      packetRef: optionalStringArg(args, "packet-ref"),
    });
    printJson(validateSourceTextExtractionPacket(packet));
    return;
  }

  if (command === "source-text-extraction-run-report" || command === "source-text-dry-run-report") {
    if (args.write) {
      printJson(
        await writeSourceTextExtractionRunReport({
          repoRoot,
          packetRef: optionalStringArg(args, "packet-ref"),
          outputRef: optionalStringArg(args, "output-ref"),
          reportId: optionalStringArg(args, "report-id"),
          projectCode: optionalStringArg(args, "project-code"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceTextExtractionRunReport({
        repoRoot,
        packetRef: optionalStringArg(args, "packet-ref"),
        reportId: optionalStringArg(args, "report-id"),
        projectCode: optionalStringArg(args, "project-code"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-source-text-extraction-run-report" || command === "validate-source-text-dry-run-report") {
    const report = await loadSourceTextExtractionRunReport({
      repoRoot,
      runReportRef: optionalStringArg(args, "run-report-ref"),
    });
    printJson(validateSourceTextExtractionRunReport(report));
    return;
  }

  if (command === "source-text-runtime-preflight" || command === "source-extraction-runtime-preflight") {
    const preflight = await buildSourceTextRuntimePreflight({
      repoRoot,
      requireHwpConverter: args["require-hwp-converter"] === true,
      collectVersions: args["no-version"] !== true,
      now: optionalStringArg(args, "now"),
    });
    const validation = validateSourceTextRuntimePreflight(preflight);
    printJson({
      ...preflight,
      validation,
    });
    if (preflight.status !== "ready" || validation.status !== "pass") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "validate-knowledge-source-card") {
    const card = await loadKnowledgeSourceCard({
      repoRoot,
      sourceCardRef: optionalStringArg(args, "source-card-ref"),
    });
    printJson(validateKnowledgeSourceCard(card));
    return;
  }

  if (command === "source-text-index") {
    const readyManifestRef = optionalStringArg(args, "ready-ref") ?? optionalStringArg(args, "source-sync-ready-ref");
    if (args.write) {
      printJson(
        await writeSourceTextIndex({
          repoRoot,
          sourceCardRef: optionalStringArg(args, "source-card-ref"),
          outputRef: optionalStringArg(args, "output-ref"),
          indexId: optionalStringArg(args, "index-id"),
          maxChars: args["max-chars"],
          doclingJsonRef: optionalStringArg(args, "docling-json-ref"),
          readyManifestRef,
          stableMs: args["stable-ms"],
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildSourceTextIndex({
        repoRoot,
        sourceCardRef: optionalStringArg(args, "source-card-ref"),
        indexId: optionalStringArg(args, "index-id"),
        maxChars: args["max-chars"],
        doclingJsonRef: optionalStringArg(args, "docling-json-ref"),
        readyManifestRef,
        stableMs: args["stable-ms"],
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-source-text-index") {
    const index = await loadSourceTextIndex({
      repoRoot,
      sourceTextIndexRef: optionalStringArg(args, "source-text-index-ref"),
    });
    printJson(validateSourceTextIndex(index));
    return;
  }

  if (command === "source-text-traceability-sidecar" || command === "source-text-page-sidecar") {
    const sidecarOptions = {
      repoRoot,
      sourceTextIndexRef: optionalStringArg(args, "source-text-index-ref"),
      doclingJsonRef: optionalStringArg(args, "docling-json-ref"),
      traceabilityId: optionalStringArg(args, "traceability-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeSourceTextTraceabilitySidecar(sidecarOptions));
      return;
    }
    printJson(await buildSourceTextTraceabilitySidecar(sidecarOptions));
    return;
  }

  if (command === "validate-source-text-traceability-sidecar" || command === "validate-source-text-page-sidecar") {
    const sidecar = await loadSourceTextTraceabilitySidecar({
      repoRoot,
      traceabilitySidecarRef: optionalStringArg(args, "traceability-sidecar-ref"),
    });
    printJson(validateSourceTextTraceabilitySidecar(sidecar));
    return;
  }

  if (command === "validate-source-sync-ready" || command === "validate-source-ready-manifest") {
    const validation = await validateSourceSyncReadyRef({
      repoRoot,
      readyRef: optionalStringArg(args, "ready-ref"),
      sourceCardRef: optionalStringArg(args, "source-card-ref"),
      sourceTextRef: optionalStringArg(args, "source-text-ref"),
      stableMs: args["stable-ms"],
      checkFiles: args["metadata-only"] !== true,
    });
    printJson(validation);
    if (validation.status !== "pass") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "source-text-answer-run" || command === "source-text-answer") {
    const question = optionalStringArg(args, "question") ?? args._?.join(" ");
    const runOptions = {
      repoRoot,
      sourceTextIndexRef: optionalStringArg(args, "source-text-index-ref"),
      question,
      runId: optionalStringArg(args, "run-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      maxChunks: args["max-chunks"],
      traceabilitySidecarRef: optionalStringArg(args, "traceability-sidecar-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      const writeResult = await writeSourceTextAnswerRun(runOptions);
      if (args.text) {
        const run = await loadSourceTextAnswerRun({ repoRoot, runRef: writeResult.source_text_answer_run_ref });
        process.stdout.write(renderSourceTextAnswerRunText(run));
        return;
      }
      printJson(writeResult);
      return;
    }
    const run = await buildSourceTextAnswerRun(runOptions);
    if (args.text) {
      process.stdout.write(renderSourceTextAnswerRunText(run));
      return;
    }
    printJson(run);
    return;
  }

  if (command === "validate-source-text-answer-run" || command === "validate-source-text-answer") {
    const run = await loadSourceTextAnswerRun({
      repoRoot,
      runRef: optionalStringArg(args, "run-ref"),
    });
    printJson(validateSourceTextAnswerRun(run));
    return;
  }

  if (command === "source-text-quality-review" || command === "source-text-citation-review") {
    const reviewOptions = {
      repoRoot,
      sourceTextIndexRef: optionalStringArg(args, "source-text-index-ref"),
      traceabilitySidecarRef: optionalStringArg(args, "traceability-sidecar-ref"),
      answerRunRef: optionalStringArg(args, "answer-run-ref"),
      pages: arrayArg(args, "page").length > 0 ? arrayArg(args, "page") : arrayArg(args, "pages"),
      reviewId: optionalStringArg(args, "review-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeSourceTextQualityReview(reviewOptions));
      return;
    }
    printJson(await buildSourceTextQualityReview(reviewOptions));
    return;
  }

  if (command === "validate-source-text-quality-review" || command === "validate-source-text-citation-review") {
    const review = await loadSourceTextQualityReview({
      repoRoot,
      reviewRef: optionalStringArg(args, "review-ref"),
    });
    printJson(validateSourceTextQualityReview(review));
    return;
  }

  if (command === "work-card" || command === "rag-work-card") {
    const question = optionalStringArg(args, "question") ?? args._?.join(" ");
    const queryLabel = optionalStringArg(args, "query-label");
    if (question && !queryLabel) {
      throw new Error("work-card from --question requires --query-label so the raw question is not persisted");
    }
    let answerRunRef = optionalStringArg(args, "answer-run-ref");
    let qualityReviewRef = optionalStringArg(args, "quality-review-ref");
    const sourceTextIndexRef = optionalStringArg(args, "source-text-index-ref");
    const traceabilitySidecarRef = optionalStringArg(args, "traceability-sidecar-ref");
    if (args.write && !answerRunRef && sourceTextIndexRef && question) {
      const answerRunWrite = await writeSourceTextAnswerRun({
        repoRoot,
        sourceTextIndexRef,
        traceabilitySidecarRef,
        question,
        runId: optionalStringArg(args, "answer-run-id"),
        maxChunks: args["max-chunks"],
        now: optionalStringArg(args, "now"),
      });
      answerRunRef = answerRunWrite.source_text_answer_run_ref;
    }
    if (args.write && !qualityReviewRef && sourceTextIndexRef && traceabilitySidecarRef) {
      const qualityReviewWrite = await writeSourceTextQualityReview({
        repoRoot,
        sourceTextIndexRef,
        traceabilitySidecarRef,
        answerRunRef,
        pages: arrayArg(args, "page").length > 0 ? arrayArg(args, "page") : arrayArg(args, "pages"),
        reviewId: optionalStringArg(args, "quality-review-id"),
        now: optionalStringArg(args, "now"),
      });
      qualityReviewRef = qualityReviewWrite.source_text_quality_review_ref;
    }
    const workCardOptions = {
      repoRoot,
      answerRunRef,
      qualityReviewRef,
      queryLabel,
      workCardId: optionalStringArg(args, "work-card-id"),
      graphNodeRefs: arrayArg(args, "graph-node-ref"),
      outputRef: optionalStringArg(args, "output-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      const writeResult = await writeRagWorkCard(workCardOptions);
      if (args.text) {
        const workCard = await loadRagWorkCard({ repoRoot, workCardRef: writeResult.source_text_work_card_ref });
        process.stdout.write(renderRagWorkCardText(workCard));
        return;
      }
      printJson(writeResult);
      return;
    }
    const workCard = await buildRagWorkCard(workCardOptions);
    if (args.text) {
      process.stdout.write(renderRagWorkCardText(workCard));
      return;
    }
    printJson(workCard);
    return;
  }

  if (command === "validate-work-card" || command === "validate-rag-work-card") {
    const workCard = await loadRagWorkCard({
      repoRoot,
      workCardRef: optionalStringArg(args, "work-card-ref"),
    });
    printJson(validateRagWorkCard(workCard));
    return;
  }

  if (command === "validate-operational-route-registry") {
    const validation = await validateOperationalRouteRegistry({
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
    });
    printJson(validation);
    return;
  }

  if (command === "operational-route-catalog") {
    const catalog = await buildOperationalRouteCatalog({
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    });
    if (args.text) {
      process.stdout.write(renderOperationalRouteCatalogText(catalog));
      return;
    }
    printJson(catalog);
    return;
  }

  if (command === "operational-route-resolve") {
    const resolution = await resolveOperationalRoute({
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      queryLabel: optionalStringArg(args, "query-label"),
      checkFiles: args["metadata-only"] !== true,
      now: optionalStringArg(args, "now"),
    });
    if (args.text) {
      process.stdout.write(renderOperationalRouteResolutionText(resolution));
      return;
    }
    printJson(resolution);
    return;
  }

  if (command === "operational-route-answer-shell") {
    process.stdout.write(
      await renderOperationalRouteAnswerShell({
        repoRoot,
        registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
        queryLabel: optionalStringArg(args, "query-label"),
        checkFiles: args["metadata-only"] !== true,
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "operational-route-smoke-run" || command === "validate-operational-route-smoke-tests") {
    printJson(
      await runOperationalRouteSmokeTests({
        repoRoot,
        registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
        smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
        checkFiles: args["metadata-only"] !== true,
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-operational-route-answer-cards") {
    printJson(
      await validateOperationalRouteAnswerCards({
        repoRoot,
        registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
        validationId: optionalStringArg(args, "validation-id"),
        checkFiles: args["metadata-only"] !== true,
        checkWorkCards: args["no-work-card-validation"] !== true,
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "operational-route-preflight") {
    const preflightOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      preflightId: optionalStringArg(args, "preflight-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRoutePreflight(preflightOptions));
      return;
    }
    const preflight = await buildOperationalRoutePreflight(preflightOptions);
    if (args.validate) {
      printJson(validateOperationalRoutePreflight(preflight));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRoutePreflightText(preflight));
      return;
    }
    printJson(preflight);
    return;
  }

  if (command === "validate-operational-route-preflight") {
    const preflight = await loadOperationalRoutePreflight({
      repoRoot,
      preflightRef: optionalStringArg(args, "operational-route-preflight-ref") ?? optionalStringArg(args, "preflight-ref"),
    });
    printJson(validateOperationalRoutePreflight(preflight));
    return;
  }

  if (command === "operational-route-preflight-view") {
    const preflight = await loadOperationalRoutePreflight({
      repoRoot,
      preflightRef: optionalStringArg(args, "operational-route-preflight-ref") ?? optionalStringArg(args, "preflight-ref"),
    });
    if (args.json) {
      printJson(preflight);
      return;
    }
    process.stdout.write(renderOperationalRoutePreflightText(preflight));
    return;
  }

  if (command === "operational-route-dashboard") {
    const dashboard = await buildOperationalRouteDashboard({
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      preflightId: optionalStringArg(args, "preflight-id"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    });
    if (args.validate) {
      printJson(validateOperationalRouteDashboard(dashboard));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteDashboardText(dashboard));
      return;
    }
    printJson(dashboard);
    return;
  }

  if (command === "operational-route-call-plan") {
    const planOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      queryLabel: optionalStringArg(args, "query-label"),
      planId: optionalStringArg(args, "plan-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteCallPlan(planOptions));
      return;
    }
    const plan = await buildOperationalRouteCallPlan(planOptions);
    if (args.validate) {
      printJson(validateOperationalRouteCallPlan(plan));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteCallPlanText(plan));
      return;
    }
    printJson(plan);
    return;
  }

  if (command === "validate-operational-route-call-plan") {
    const plan = await loadOperationalRouteCallPlan({
      repoRoot,
      callPlanRef:
        optionalStringArg(args, "operational-route-call-plan-ref")
        ?? optionalStringArg(args, "call-plan-ref")
        ?? optionalStringArg(args, "plan-ref"),
    });
    printJson(validateOperationalRouteCallPlan(plan));
    return;
  }

  if (command === "operational-route-call-plan-view") {
    const plan = await loadOperationalRouteCallPlan({
      repoRoot,
      callPlanRef:
        optionalStringArg(args, "operational-route-call-plan-ref")
        ?? optionalStringArg(args, "call-plan-ref")
        ?? optionalStringArg(args, "plan-ref"),
    });
    if (args.json) {
      printJson(plan);
      return;
    }
    process.stdout.write(renderOperationalRouteCallPlanText(plan));
    return;
  }

  if (command === "operational-route-operator-run") {
    process.stdout.write(
      await renderOperationalRouteOperatorRun({
        repoRoot,
        registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
        smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
        usageRootRef: optionalStringArg(args, "usage-root-ref"),
        candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
        operatorHealthRef:
          optionalStringArg(args, "operational-route-operator-health-ref")
          ?? optionalStringArg(args, "operator-health-ref")
          ?? optionalStringArg(args, "health-ref"),
        queryLabel: optionalStringArg(args, "query-label"),
        planId: optionalStringArg(args, "plan-id"),
        recordUsage: args["record-usage"] === true,
        skipAnswerShell: args["skip-answer-shell"] === true || args["no-answer-shell"] === true,
        usageId: optionalStringArg(args, "usage-id"),
        usageOutputRef: optionalStringArg(args, "usage-output-ref"),
        checkFiles: args["metadata-only"] !== true,
        checkWorkCards: args["no-work-card-validation"] !== true,
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "operational-route-closeout") {
    const closeout = await buildOperationalRouteCloseout({
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      queryLabel: optionalStringArg(args, "query-label"),
      closeoutId: optionalStringArg(args, "closeout-id"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    });
    if (args.validate) {
      printJson(validateOperationalRouteCloseout(closeout));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteCloseoutText(closeout));
      return;
    }
    printJson(closeout);
    return;
  }

  if (command === "operational-route-review-gate") {
    const gate = await buildOperationalRouteReviewGate({
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      gateId: optionalStringArg(args, "gate-id"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    });
    if (args.validate) {
      printJson(validateOperationalRouteReviewGate(gate));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteReviewGateText(gate));
      return;
    }
    printJson(gate);
    return;
  }

  if (command === "operational-route-command-sheet") {
    const sheet = await buildOperationalRouteCommandSheet({
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      sheetId: optionalStringArg(args, "sheet-id"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    });
    if (args.validate) {
      printJson(validateOperationalRouteCommandSheet(sheet));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteCommandSheetText(sheet));
      return;
    }
    printJson(sheet);
    return;
  }

  if (command === "operational-route-suggestion-safety") {
    const safetyOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      safetyId: optionalStringArg(args, "suggestion-safety-id") ?? optionalStringArg(args, "safety-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteSuggestionSafety(safetyOptions));
      return;
    }
    const safety = await buildOperationalRouteSuggestionSafety(safetyOptions);
    if (args.validate) {
      printJson(validateOperationalRouteSuggestionSafety(safety));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteSuggestionSafetyText(safety));
      return;
    }
    printJson(safety);
    return;
  }

  if (command === "validate-operational-route-suggestion-safety") {
    const safety = await loadOperationalRouteSuggestionSafety({
      repoRoot,
      suggestionSafetyRef:
        optionalStringArg(args, "operational-route-suggestion-safety-ref")
        ?? optionalStringArg(args, "suggestion-safety-ref")
        ?? optionalStringArg(args, "safety-ref"),
    });
    printJson(validateOperationalRouteSuggestionSafety(safety));
    return;
  }

  if (command === "operational-route-suggestion-safety-view") {
    const safety = await loadOperationalRouteSuggestionSafety({
      repoRoot,
      suggestionSafetyRef:
        optionalStringArg(args, "operational-route-suggestion-safety-ref")
        ?? optionalStringArg(args, "suggestion-safety-ref")
        ?? optionalStringArg(args, "safety-ref"),
    });
    if (args.json) {
      printJson(safety);
      return;
    }
    process.stdout.write(renderOperationalRouteSuggestionSafetyText(safety));
    return;
  }

  if (command === "operational-route-ops-check") {
    const opsCheckOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      opsCheckId: optionalStringArg(args, "ops-check-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteOpsCheck(opsCheckOptions));
      return;
    }
    const check = await buildOperationalRouteOpsCheck(opsCheckOptions);
    if (args.validate) {
      printJson(validateOperationalRouteOpsCheck(check));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteOpsCheckText(check));
      return;
    }
    printJson(check);
    return;
  }

  if (command === "validate-operational-route-ops-check") {
    const check = await loadOperationalRouteOpsCheck({
      repoRoot,
      opsCheckRef: optionalStringArg(args, "operational-route-ops-check-ref") ?? optionalStringArg(args, "ops-check-ref"),
    });
    printJson(validateOperationalRouteOpsCheck(check));
    return;
  }

  if (command === "operational-route-ops-check-view") {
    const check = await loadOperationalRouteOpsCheck({
      repoRoot,
      opsCheckRef: optionalStringArg(args, "operational-route-ops-check-ref") ?? optionalStringArg(args, "ops-check-ref"),
    });
    if (args.json) {
      printJson(check);
      return;
    }
    process.stdout.write(renderOperationalRouteOpsCheckText(check));
    return;
  }

  if (command === "operational-route-readiness") {
    const readinessOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      readinessId: optionalStringArg(args, "readiness-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteReadiness(readinessOptions));
      return;
    }
    const readiness = await buildOperationalRouteReadiness(readinessOptions);
    if (args.validate) {
      printJson(validateOperationalRouteReadiness(readiness));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteReadinessText(readiness));
      return;
    }
    printJson(readiness);
    return;
  }

  if (command === "validate-operational-route-readiness") {
    const readiness = await loadOperationalRouteReadiness({
      repoRoot,
      readinessRef: optionalStringArg(args, "operational-route-readiness-ref") ?? optionalStringArg(args, "readiness-ref"),
    });
    printJson(validateOperationalRouteReadiness(readiness));
    return;
  }

  if (command === "operational-route-readiness-view") {
    const readiness = await loadOperationalRouteReadiness({
      repoRoot,
      readinessRef: optionalStringArg(args, "operational-route-readiness-ref") ?? optionalStringArg(args, "readiness-ref"),
    });
    if (args.json) {
      printJson(readiness);
      return;
    }
    process.stdout.write(renderOperationalRouteReadinessText(readiness));
    return;
  }

  if (command === "operational-route-evidence-sweep") {
    const sweepOptions = {
      repoRoot,
      evidenceSweepId: optionalStringArg(args, "evidence-sweep-id") ?? optionalStringArg(args, "sweep-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      preflightRef: optionalStringArg(args, "operational-route-preflight-ref") ?? optionalStringArg(args, "preflight-ref"),
      opsCheckRef: optionalStringArg(args, "operational-route-ops-check-ref") ?? optionalStringArg(args, "ops-check-ref"),
      sessionSweepRef:
        optionalStringArg(args, "operational-route-session-sweep-ref") ?? optionalStringArg(args, "session-sweep-ref"),
      readinessRef: optionalStringArg(args, "operational-route-readiness-ref") ?? optionalStringArg(args, "readiness-ref"),
      statusRef: optionalStringArg(args, "operational-route-status-ref") ?? optionalStringArg(args, "status-ref"),
      usageSummaryRef: optionalStringArg(args, "usage-summary-ref") ?? optionalStringArg(args, "summary-ref"),
      usageRecordRefs: arrayArg(args, "usage-record-ref"),
      candidateRecordRefs: arrayArg(args, "candidate-record-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteEvidenceSweep(sweepOptions));
      return;
    }
    const sweep = await buildOperationalRouteEvidenceSweep(sweepOptions);
    if (args.validate) {
      printJson(validateOperationalRouteEvidenceSweep(sweep));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteEvidenceSweepText(sweep));
      return;
    }
    printJson(sweep);
    return;
  }

  if (command === "validate-operational-route-evidence-sweep") {
    const sweep = await loadOperationalRouteEvidenceSweep({
      repoRoot,
      sweepRef:
        optionalStringArg(args, "operational-route-evidence-sweep-ref")
        ?? optionalStringArg(args, "evidence-sweep-ref")
        ?? optionalStringArg(args, "sweep-ref"),
    });
    printJson(validateOperationalRouteEvidenceSweep(sweep));
    return;
  }

  if (command === "operational-route-evidence-sweep-view") {
    const sweep = await loadOperationalRouteEvidenceSweep({
      repoRoot,
      sweepRef:
        optionalStringArg(args, "operational-route-evidence-sweep-ref")
        ?? optionalStringArg(args, "evidence-sweep-ref")
        ?? optionalStringArg(args, "sweep-ref"),
    });
    if (args.json) {
      printJson(sweep);
      return;
    }
    process.stdout.write(renderOperationalRouteEvidenceSweepText(sweep));
    return;
  }

  if (command === "operational-route-latest-evidence") {
    const latestOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      latestEvidenceId: optionalStringArg(args, "latest-evidence-id") ?? optionalStringArg(args, "latest-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteLatestEvidence(latestOptions));
      return;
    }
    const latest = await buildOperationalRouteLatestEvidence(latestOptions);
    if (args.validate) {
      printJson(validateOperationalRouteLatestEvidence(latest));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteLatestEvidenceText(latest));
      return;
    }
    printJson(latest);
    return;
  }

  if (command === "validate-operational-route-latest-evidence") {
    const latest = await loadOperationalRouteLatestEvidence({
      repoRoot,
      latestEvidenceRef:
        optionalStringArg(args, "operational-route-latest-evidence-ref")
        ?? optionalStringArg(args, "latest-evidence-ref")
        ?? optionalStringArg(args, "latest-ref"),
    });
    printJson(validateOperationalRouteLatestEvidence(latest));
    return;
  }

  if (command === "operational-route-latest-evidence-view") {
    const latest = await loadOperationalRouteLatestEvidence({
      repoRoot,
      latestEvidenceRef:
        optionalStringArg(args, "operational-route-latest-evidence-ref")
        ?? optionalStringArg(args, "latest-evidence-ref")
        ?? optionalStringArg(args, "latest-ref"),
    });
    if (args.json) {
      printJson(latest);
      return;
    }
    process.stdout.write(renderOperationalRouteLatestEvidenceText(latest));
    return;
  }

  if (command === "operational-route-operator-brief") {
    const briefOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      latestEvidenceRef:
        optionalStringArg(args, "operational-route-latest-evidence-ref")
        ?? optionalStringArg(args, "latest-evidence-ref")
        ?? optionalStringArg(args, "latest-ref"),
      operatorBriefId: optionalStringArg(args, "operator-brief-id") ?? optionalStringArg(args, "brief-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteOperatorBrief(briefOptions));
      return;
    }
    const brief = await buildOperationalRouteOperatorBrief(briefOptions);
    if (args.validate) {
      printJson(validateOperationalRouteOperatorBrief(brief));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteOperatorBriefText(brief));
      return;
    }
    printJson(brief);
    return;
  }

  if (command === "validate-operational-route-operator-brief") {
    const brief = await loadOperationalRouteOperatorBrief({
      repoRoot,
      operatorBriefRef:
        optionalStringArg(args, "operational-route-operator-brief-ref")
        ?? optionalStringArg(args, "operator-brief-ref")
        ?? optionalStringArg(args, "brief-ref"),
    });
    printJson(validateOperationalRouteOperatorBrief(brief));
    return;
  }

  if (command === "operational-route-operator-brief-view") {
    const brief = await loadOperationalRouteOperatorBrief({
      repoRoot,
      operatorBriefRef:
        optionalStringArg(args, "operational-route-operator-brief-ref")
        ?? optionalStringArg(args, "operator-brief-ref")
        ?? optionalStringArg(args, "brief-ref"),
    });
    if (args.json) {
      printJson(brief);
      return;
    }
    process.stdout.write(renderOperationalRouteOperatorBriefText(brief));
    return;
  }

  if (command === "operational-route-doc-drift-check") {
    const docRefs = arrayArg(args, "doc-ref");
    const driftOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      latestEvidenceRef:
        optionalStringArg(args, "operational-route-latest-evidence-ref")
        ?? optionalStringArg(args, "latest-evidence-ref")
        ?? optionalStringArg(args, "latest-ref"),
      operatorBriefRef:
        optionalStringArg(args, "operational-route-operator-brief-ref")
        ?? optionalStringArg(args, "operator-brief-ref")
        ?? optionalStringArg(args, "brief-ref"),
      docRefs: docRefs.length > 0 ? docRefs : undefined,
      driftCheckId: optionalStringArg(args, "drift-check-id") ?? optionalStringArg(args, "check-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteOperatorDocDriftCheck(driftOptions));
      return;
    }
    const drift = await buildOperationalRouteOperatorDocDriftCheck(driftOptions);
    if (args.validate) {
      printJson(validateOperationalRouteOperatorDocDriftCheck(drift));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteOperatorDocDriftText(drift));
      return;
    }
    printJson(drift);
    return;
  }

  if (command === "validate-operational-route-doc-drift-check") {
    const drift = await loadOperationalRouteOperatorDocDriftCheck({
      repoRoot,
      docDriftRef:
        optionalStringArg(args, "operational-route-doc-drift-ref")
        ?? optionalStringArg(args, "doc-drift-ref")
        ?? optionalStringArg(args, "drift-ref"),
    });
    printJson(validateOperationalRouteOperatorDocDriftCheck(drift));
    return;
  }

  if (command === "operational-route-doc-drift-check-view") {
    const drift = await loadOperationalRouteOperatorDocDriftCheck({
      repoRoot,
      docDriftRef:
        optionalStringArg(args, "operational-route-doc-drift-ref")
        ?? optionalStringArg(args, "doc-drift-ref")
        ?? optionalStringArg(args, "drift-ref"),
    });
    if (args.json) {
      printJson(drift);
      return;
    }
    process.stdout.write(renderOperationalRouteOperatorDocDriftText(drift));
    return;
  }

  if (command === "operational-route-operator-health") {
    const healthOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      latestEvidenceRef:
        optionalStringArg(args, "operational-route-latest-evidence-ref")
        ?? optionalStringArg(args, "latest-evidence-ref")
        ?? optionalStringArg(args, "latest-ref"),
      operatorBriefRef:
        optionalStringArg(args, "operational-route-operator-brief-ref")
        ?? optionalStringArg(args, "operator-brief-ref")
        ?? optionalStringArg(args, "brief-ref"),
      docDriftRef:
        optionalStringArg(args, "operational-route-doc-drift-ref")
        ?? optionalStringArg(args, "doc-drift-ref")
        ?? optionalStringArg(args, "drift-ref"),
      operatorHealthId: optionalStringArg(args, "operator-health-id") ?? optionalStringArg(args, "health-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteOperatorHealth(healthOptions));
      return;
    }
    const health = await buildOperationalRouteOperatorHealth(healthOptions);
    if (args.validate) {
      printJson(validateOperationalRouteOperatorHealth(health));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteOperatorHealthText(health));
      return;
    }
    printJson(health);
    return;
  }

  if (command === "validate-operational-route-operator-health") {
    const health = await loadOperationalRouteOperatorHealth({
      repoRoot,
      healthRef:
        optionalStringArg(args, "operational-route-operator-health-ref")
        ?? optionalStringArg(args, "operator-health-ref")
        ?? optionalStringArg(args, "health-ref"),
    });
    printJson(validateOperationalRouteOperatorHealth(health));
    return;
  }

  if (command === "operational-route-operator-health-view") {
    const health = await loadOperationalRouteOperatorHealth({
      repoRoot,
      healthRef:
        optionalStringArg(args, "operational-route-operator-health-ref")
        ?? optionalStringArg(args, "operator-health-ref")
        ?? optionalStringArg(args, "health-ref"),
    });
    if (args.json) {
      printJson(health);
      return;
    }
    process.stdout.write(renderOperationalRouteOperatorHealthText(health));
    return;
  }

  if (command === "operational-route-session") {
    const sessionOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      queryLabel: optionalStringArg(args, "query-label"),
      sessionId: optionalStringArg(args, "session-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteSession(sessionOptions));
      return;
    }
    const session = await buildOperationalRouteSession(sessionOptions);
    if (args.text) {
      process.stdout.write(renderOperationalRouteSessionDigest(session));
      return;
    }
    printJson(session);
    return;
  }

  if (command === "validate-operational-route-session") {
    const session = await loadOperationalRouteSession({
      repoRoot,
      sessionRef: optionalStringArg(args, "operational-route-session-ref") ?? optionalStringArg(args, "session-ref"),
    });
    printJson(validateOperationalRouteSession(session));
    return;
  }

  if (command === "operational-route-session-sweep") {
    const sweepOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      smokeTestRef: optionalStringArg(args, "smoke-tests-ref") ?? optionalStringArg(args, "smoke-test-ref"),
      sweepId: optionalStringArg(args, "sweep-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteSessionSweep(sweepOptions));
      return;
    }
    const sweep = await buildOperationalRouteSessionSweep(sweepOptions);
    if (args.validate) {
      printJson(validateOperationalRouteSessionSweep(sweep));
      return;
    }
    if (args.text) {
      process.stdout.write(renderOperationalRouteSessionSweepText(sweep));
      return;
    }
    printJson(sweep);
    return;
  }

  if (command === "validate-operational-route-session-sweep") {
    const sweep = await loadOperationalRouteSessionSweep({
      repoRoot,
      sweepRef: optionalStringArg(args, "operational-route-session-sweep-ref") ?? optionalStringArg(args, "sweep-ref"),
    });
    printJson(validateOperationalRouteSessionSweep(sweep));
    return;
  }

  if (command === "operational-route-session-sweep-view") {
    const sweep = await loadOperationalRouteSessionSweep({
      repoRoot,
      sweepRef: optionalStringArg(args, "operational-route-session-sweep-ref") ?? optionalStringArg(args, "sweep-ref"),
    });
    if (args.json) {
      printJson(sweep);
      return;
    }
    process.stdout.write(renderOperationalRouteSessionSweepText(sweep));
    return;
  }

  if (command === "operational-route-run-view" || command === "operational-route-session-view") {
    const session = await loadOperationalRouteSession({
      repoRoot,
      sessionRef:
        optionalStringArg(args, "operational-route-run-ref")
        ?? optionalStringArg(args, "operational-route-session-ref")
        ?? optionalStringArg(args, "session-ref"),
    });
    if (args.json) {
      printJson(session);
      return;
    }
    process.stdout.write(renderOperationalRouteSessionDigest(session));
    return;
  }

  if (command === "operational-route-usage-record") {
    const usageOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      queryLabel: optionalStringArg(args, "query-label"),
      usageId: optionalStringArg(args, "usage-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteUsageRecord(usageOptions));
      return;
    }
    const record = await buildOperationalRouteUsageRecord(usageOptions);
    if (args.text) {
      process.stdout.write(renderOperationalRouteUsageRecordText(record));
      return;
    }
    printJson(record);
    return;
  }

  if (command === "validate-operational-route-usage-record") {
    const record = await loadOperationalRouteUsageRecord({
      repoRoot,
      recordRef: optionalStringArg(args, "usage-record-ref") ?? optionalStringArg(args, "record-ref"),
    });
    printJson(validateOperationalRouteUsageRecord(record));
    return;
  }

  if (command === "operational-route-usage-record-view") {
    const record = await loadOperationalRouteUsageRecord({
      repoRoot,
      recordRef: optionalStringArg(args, "usage-record-ref") ?? optionalStringArg(args, "record-ref"),
    });
    if (args.json) {
      printJson(record);
      return;
    }
    process.stdout.write(renderOperationalRouteUsageRecordText(record));
    return;
  }

  if (command === "operational-route-usage-summary") {
    const summaryOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      summaryId: optionalStringArg(args, "summary-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteUsageSummary(summaryOptions));
      return;
    }
    const summary = await buildOperationalRouteUsageSummary(summaryOptions);
    if (args.text) {
      process.stdout.write(renderOperationalRouteUsageSummaryText(summary));
      return;
    }
    printJson(summary);
    return;
  }

  if (command === "validate-operational-route-usage-summary") {
    const summary = await loadOperationalRouteUsageSummary({
      repoRoot,
      summaryRef: optionalStringArg(args, "usage-summary-ref") ?? optionalStringArg(args, "summary-ref"),
    });
    printJson(validateOperationalRouteUsageSummary(summary));
    return;
  }

  if (command === "operational-route-usage-summary-view") {
    const summary = await loadOperationalRouteUsageSummary({
      repoRoot,
      summaryRef: optionalStringArg(args, "usage-summary-ref") ?? optionalStringArg(args, "summary-ref"),
    });
    if (args.json) {
      printJson(summary);
      return;
    }
    process.stdout.write(renderOperationalRouteUsageSummaryText(summary));
    return;
  }

  if (command === "operational-route-candidate-record") {
    const candidateOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      queryLabel: optionalStringArg(args, "query-label"),
      candidateId: optionalStringArg(args, "candidate-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteCandidateRecord(candidateOptions));
      return;
    }
    const record = await buildOperationalRouteCandidateRecord(candidateOptions);
    if (args.text) {
      process.stdout.write(renderOperationalRouteCandidateRecordText(record, { previewOnly: true }));
      return;
    }
    printJson(record);
    return;
  }

  if (command === "validate-operational-route-candidate-record") {
    const record = await loadOperationalRouteCandidateRecord({
      repoRoot,
      recordRef: optionalStringArg(args, "candidate-record-ref") ?? optionalStringArg(args, "record-ref"),
    });
    printJson(validateOperationalRouteCandidateRecord(record));
    return;
  }

  if (command === "operational-route-candidate-record-view") {
    const record = await loadOperationalRouteCandidateRecord({
      repoRoot,
      recordRef: optionalStringArg(args, "candidate-record-ref") ?? optionalStringArg(args, "record-ref"),
    });
    if (args.json) {
      printJson(record);
      return;
    }
    process.stdout.write(renderOperationalRouteCandidateRecordText(record));
    return;
  }

  if (command === "operational-route-status") {
    const statusOptions = {
      repoRoot,
      registryRef: optionalStringArg(args, "route-registry-ref") ?? optionalStringArg(args, "registry-ref"),
      usageRootRef: optionalStringArg(args, "usage-root-ref"),
      candidateRootRef: optionalStringArg(args, "candidate-root-ref"),
      statusId: optionalStringArg(args, "status-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      checkFiles: args["metadata-only"] !== true,
      checkWorkCards: args["no-work-card-validation"] !== true,
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      printJson(await writeOperationalRouteStatus(statusOptions));
      return;
    }
    const status = await buildOperationalRouteStatus(statusOptions);
    if (args.text) {
      process.stdout.write(renderOperationalRouteStatusDigest(status));
      return;
    }
    printJson(status);
    return;
  }

  if (command === "validate-operational-route-status") {
    const status = await loadOperationalRouteStatus({
      repoRoot,
      statusRef: optionalStringArg(args, "operational-route-status-ref") ?? optionalStringArg(args, "status-ref"),
    });
    printJson(validateOperationalRouteStatus(status));
    return;
  }

  if (command === "operational-route-status-view") {
    const status = await loadOperationalRouteStatus({
      repoRoot,
      statusRef: optionalStringArg(args, "operational-route-status-ref") ?? optionalStringArg(args, "status-ref"),
    });
    if (args.json) {
      printJson(status);
      return;
    }
    process.stdout.write(renderOperationalRouteStatusDigest(status));
    return;
  }

  if (command === "answer-engine-run" || command === "answer-engine") {
    const question = optionalStringArg(args, "question") ?? args._?.join(" ");
    const runOptions = {
      repoRoot,
      metadataIndexRef: optionalStringArg(args, "metadata-index-ref"),
      extractionPacketRef: optionalStringArg(args, "extraction-packet-ref"),
      extractionRunReportRef: optionalStringArg(args, "extraction-run-report-ref") ?? optionalStringArg(args, "source-text-run-report-ref"),
      question,
      runId: optionalStringArg(args, "run-id"),
      traceId: optionalStringArg(args, "trace-id"),
      outputRef: optionalStringArg(args, "output-ref"),
      projectCode: optionalStringArg(args, "project-code"),
      maxUnits: args["max-units"],
      now: optionalStringArg(args, "now"),
    };
    if (args.write) {
      const writeResult = await writeRagAnswerEngineRun(runOptions);
      if (args.text) {
        const run = await loadRagAnswerEngineRun({ repoRoot, runRef: writeResult.answer_engine_run_ref });
        process.stdout.write(renderAnswerEngineRunText(run));
        return;
      }
      printJson(writeResult);
      return;
    }
    const run = await buildRagAnswerEngineRun(runOptions);
    if (args.text) {
      process.stdout.write(renderAnswerEngineRunText(run));
      return;
    }
    printJson(run);
    return;
  }

  if (command === "validate-answer-engine-run" || command === "validate-answer-engine") {
    const run = await loadRagAnswerEngineRun({
      repoRoot,
      runRef: optionalStringArg(args, "run-ref"),
    });
    printJson(validateRagAnswerEngineRun(run));
    return;
  }

  if (command === "metadata-index") {
    if (args.write) {
      printJson(
        await writeRagMetadataIndex({
          repoRoot,
          manifestRef: optionalStringArg(args, "manifest-ref"),
          decisionPacketRef: optionalStringArg(args, "decision-packet-ref"),
          ownerDecisionRecordRef: optionalStringArg(args, "owner-decision-record-ref"),
          outputRef: optionalStringArg(args, "output-ref"),
          indexId: optionalStringArg(args, "index-id"),
          projectCode: optionalStringArg(args, "project-code"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildRagMetadataIndex({
        repoRoot,
        manifestRef: optionalStringArg(args, "manifest-ref"),
        decisionPacketRef: optionalStringArg(args, "decision-packet-ref"),
        ownerDecisionRecordRef: optionalStringArg(args, "owner-decision-record-ref"),
        indexId: optionalStringArg(args, "index-id"),
        projectCode: optionalStringArg(args, "project-code"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-metadata-index") {
    const index = await loadRagMetadataIndex({
      repoRoot,
      metadataIndexRef: optionalStringArg(args, "metadata-index-ref"),
    });
    printJson(validateRagMetadataIndex(index));
    return;
  }

  if (command === "retrieval-trace") {
    const question = optionalStringArg(args, "question") ?? args._?.join(" ");
    if (args.write) {
      printJson(
        await writeRagRetrievalTrace({
          repoRoot,
          metadataIndexRef: optionalStringArg(args, "metadata-index-ref"),
          question,
          traceId: optionalStringArg(args, "trace-id"),
          outputRef: optionalStringArg(args, "output-ref"),
          maxUnits: args["max-units"],
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildRagRetrievalTrace({
        repoRoot,
        metadataIndexRef: optionalStringArg(args, "metadata-index-ref"),
        question,
        traceId: optionalStringArg(args, "trace-id"),
        maxUnits: args["max-units"],
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-retrieval-trace") {
    const trace = await loadRagRetrievalTrace({
      repoRoot,
      retrievalTraceRef: optionalStringArg(args, "retrieval-trace-ref"),
    });
    printJson(validateRagRetrievalTrace(trace));
    return;
  }

  if (command === "retrieval-evaluation") {
    if (args.write) {
      printJson(
        await writeRagRetrievalEvaluation({
          repoRoot,
          metadataIndexRef: optionalStringArg(args, "metadata-index-ref"),
          evaluationId: optionalStringArg(args, "evaluation-id"),
          outputRef: optionalStringArg(args, "output-ref"),
          now: optionalStringArg(args, "now"),
        }),
      );
      return;
    }
    printJson(
      await buildRagRetrievalEvaluation({
        repoRoot,
        metadataIndexRef: optionalStringArg(args, "metadata-index-ref"),
        evaluationId: optionalStringArg(args, "evaluation-id"),
        now: optionalStringArg(args, "now"),
      }),
    );
    return;
  }

  if (command === "validate-retrieval-evaluation") {
    const evaluation = await loadRagRetrievalEvaluation({
      repoRoot,
      retrievalEvaluationRef: optionalStringArg(args, "retrieval-evaluation-ref"),
    });
    printJson(validateRagRetrievalEvaluation(evaluation));
    return;
  }

  if (command === "validate-company-knowledge-intake-packet") {
    const packet = await loadCompanyKnowledgeIntakePacket({
      repoRoot,
      packetRef: optionalStringArg(args, "packet-ref"),
    });
    const validation = args["validate-source-sync-ready-refs"]
      ? await validateCompanyKnowledgeIntakePacketWithLinkedReadyManifests(packet, {
        repoRoot,
      })
      : validateCompanyKnowledgeIntakePacket(packet);
    printJson(validation);
    if (validation.status !== "pass") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "answer") {
    const question = optionalStringArg(args, "question") ?? args._?.join(" ");
    const answer = await answerFromRagManifest({
      repoRoot,
      question,
      manifestRef: optionalStringArg(args, "manifest-ref"),
      metadataIndexRef: optionalStringArg(args, "metadata-index-ref"),
      graphRef: optionalStringArg(args, "graph-ref"),
      exportId: optionalStringArg(args, "export-id"),
      maxUnits: args["max-units"],
      now: optionalStringArg(args, "now"),
    });
    const answerValidation = validateRagAnswer(answer);
    if (answerValidation.status !== "pass") {
      printJson(answerValidation);
      process.exitCode = 1;
      return;
    }
    if (args.text) {
      process.stdout.write(renderAnswerText(answer));
      return;
    }
    printJson(answer);
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._ = [...(args._ ?? []), token];
      continue;
    }
    const parsed = parseFlagToken(token);
    const next = argv[index + 1];
    const value = parsed.value ?? (next && !next.startsWith("--") ? next : true);
    if (parsed.value === undefined && value === next) {
      index += 1;
    }
    if (args[parsed.key] === undefined) {
      args[parsed.key] = value;
    } else if (Array.isArray(args[parsed.key])) {
      args[parsed.key].push(value);
    } else {
      args[parsed.key] = [args[parsed.key], value];
    }
  }
  return args;
}

function optionalStringArg(args, key) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (value === true) {
    throw new Error(`--${key} requires a value`);
  }
  if (Array.isArray(value)) {
    throw new Error(`--${key} accepts one value`);
  }
  return String(value);
}

function arrayArg(args, key) {
  const value = args[key];
  if (value === undefined) return [];
  if (value === true) {
    throw new Error(`--${key} requires a value`);
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function optionalNumberArg(args, key) {
  const value = optionalStringArg(args, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`--${key} requires an integer value`);
  }
  return parsed;
}

function parseFlagToken(token) {
  const raw = token.slice(2);
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex === -1) {
    return { key: raw, value: undefined };
  }
  return {
    key: raw.slice(0, separatorIndex),
    value: raw.slice(separatorIndex + 1),
  };
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/rag/cli.mjs master-inventory-refresh [--write] [--date YYYY-MM-DD | --now <iso>] [--inventory-id <id>] [--output-root-ref <repo-relative-dir>] [--notebooklm-metadata-ref <repo-relative-json>] [--full]",
      "  node guild_hall/rag/cli.mjs validate-master-inventory-refresh --inventory-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs knowledge-source-storage-audit [--write] [--date YYYY-MM-DD | --now <iso>] [--audit-id <id>] [--output-root-ref <repo-relative-dir>] [--workmeta-root-ref <repo-relative-dir>] [--workspace-root-ref <repo-relative-dir> ...] [--skip-workspace-scan] [--hash-files] [--max-orphan-rows <n>] [--full]",
      "  node guild_hall/rag/cli.mjs validate-knowledge-source-storage-audit --audit-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs manifest [--write] [--graph-ref <repo-relative-graph-json>] [--export-id <id>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate --manifest-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-slice-cards [--write] --manifest-ref <repo-relative-rag-manifest-json> [--slice-set-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-slice-cards --source-slice-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-slice-triage-register [--write] --source-slice-ref <repo-relative-source-slice-cards-json> [--register-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-slice-triage-register --triage-register-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-slice-review-queue [--write] (--triage-register-ref <repo-relative-triage-json> | --source-slice-ref <repo-relative-source-slice-cards-json>) [--queue-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-slice-review-queue --review-queue-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-slice-decision-packet [--write] (--triage-register-ref <repo-relative-triage-json> | --review-queue-ref <repo-relative-review-queue-json>) [--packet-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-slice-decision-packet --decision-packet-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-slice-owner-decision-record [--write] --decision-packet-ref <repo-relative-json> [--record-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-slice-owner-decision-record --owner-decision-record-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-text-metadata-profile [--write] [--source-slice-ref <repo-relative-json>] [--extraction-log-ref <repo-relative-csv>] [--scan-root <repo-relative-dir>] [--profile-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-text-metadata-profile --profile-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-text-extraction-packet [--write] --profile-ref <repo-relative-json> [--source-slice-ref <repo-relative-json>] [--packet-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-text-extraction-packet --packet-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-text-extraction-run-report [--write] --packet-ref <repo-relative-json> [--report-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-text-extraction-run-report --run-report-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-text-runtime-preflight [--require-hwp-converter] [--no-version]",
      "  node guild_hall/rag/cli.mjs validate-knowledge-source-card --source-card-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs validate-source-sync-ready --ready-ref <repo-relative-json> [--source-card-ref <repo-relative-json>] [--source-text-ref <repo-relative-text>] [--stable-ms <n>] [--metadata-only]",
      "  node guild_hall/rag/cli.mjs source-text-index [--write] --source-card-ref <repo-relative-json> [--ready-ref <repo-relative-json>] [--stable-ms <n>] [--docling-json-ref <repo-relative-json>] [--index-id <id>] [--max-chars <n>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-text-index --source-text-index-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-text-traceability-sidecar [--write] --source-text-index-ref <repo-relative-json> --docling-json-ref <repo-relative-json> [--traceability-id <id>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-text-traceability-sidecar --traceability-sidecar-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-text-answer-run [--write] --source-text-index-ref <repo-relative-json> --question <question> [--traceability-sidecar-ref <repo-relative-json>] [--run-id <id>] [--max-chunks <n>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-source-text-answer-run --run-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-text-quality-review [--write] --source-text-index-ref <repo-relative-json> --traceability-sidecar-ref <repo-relative-json> [--answer-run-ref <repo-relative-json>] [--page <n|start-end>] [--review-id <id>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-text-quality-review --review-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs work-card [--write] --answer-run-ref <repo-relative-json> --quality-review-ref <repo-relative-json> --query-label <label> [--work-card-id <id>] [--graph-node-ref <ref>] [--text]",
      "  node guild_hall/rag/cli.mjs work-card --write --source-text-index-ref <repo-relative-json> --traceability-sidecar-ref <repo-relative-json> --question <transient-question> --query-label <stored-label> [--page <n|start-end>] [--work-card-id <id>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-work-card --work-card-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs validate-operational-route-registry --route-registry-ref <repo-relative-yaml>",
      "  node guild_hall/rag/cli.mjs operational-route-catalog --route-registry-ref <repo-relative-yaml> [--text]",
      "  node guild_hall/rag/cli.mjs operational-route-resolve --route-registry-ref <repo-relative-yaml> --query-label <label> [--text]",
      "  node guild_hall/rag/cli.mjs operational-route-answer-shell --route-registry-ref <repo-relative-yaml> --query-label <label>",
      "  node guild_hall/rag/cli.mjs operational-route-smoke-run --route-registry-ref <repo-relative-yaml> --smoke-tests-ref <repo-relative-yaml>",
      "  node guild_hall/rag/cli.mjs validate-operational-route-answer-cards --route-registry-ref <repo-relative-yaml>",
      "  node guild_hall/rag/cli.mjs operational-route-preflight [--write] --route-registry-ref <repo-relative-yaml> [--smoke-tests-ref <repo-relative-yaml>] [--preflight-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-preflight --operational-route-preflight-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-preflight-view --operational-route-preflight-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-dashboard --route-registry-ref <repo-relative-yaml> [--smoke-tests-ref <repo-relative-yaml>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs operational-route-call-plan [--write] --route-registry-ref <repo-relative-yaml> --query-label <ephemeral-label> [--smoke-tests-ref <repo-relative-yaml>] [--plan-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-call-plan --operational-route-call-plan-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-call-plan-view --operational-route-call-plan-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-operator-run --route-registry-ref <repo-relative-yaml> --query-label <ephemeral-label> [--smoke-tests-ref <repo-relative-yaml>] [--operational-route-operator-health-ref <repo-relative-json>] [--skip-answer-shell] [--record-usage --usage-id <id>]",
      "  node guild_hall/rag/cli.mjs operational-route-closeout --route-registry-ref <repo-relative-yaml> [--query-label <ephemeral-label>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs operational-route-review-gate --route-registry-ref <repo-relative-yaml> [--text | --validate]",
      "  node guild_hall/rag/cli.mjs operational-route-command-sheet --route-registry-ref <repo-relative-yaml> [--smoke-tests-ref <repo-relative-yaml>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs operational-route-suggestion-safety [--write] --route-registry-ref <repo-relative-yaml> [--smoke-tests-ref <repo-relative-yaml>] [--suggestion-safety-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-suggestion-safety --operational-route-suggestion-safety-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-suggestion-safety-view --operational-route-suggestion-safety-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-ops-check [--write] --route-registry-ref <repo-relative-yaml> [--smoke-tests-ref <repo-relative-yaml>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-ops-check --operational-route-ops-check-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-ops-check-view --operational-route-ops-check-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-readiness [--write] --route-registry-ref <repo-relative-yaml> --smoke-tests-ref <repo-relative-yaml> [--readiness-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-readiness --operational-route-readiness-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-readiness-view --operational-route-readiness-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-evidence-sweep [--write] [--evidence-sweep-id <id>] [--operational-route-preflight-ref <repo-relative-json>] [--operational-route-ops-check-ref <repo-relative-json>] [--operational-route-session-sweep-ref <repo-relative-json>] [--operational-route-readiness-ref <repo-relative-json>] [--operational-route-status-ref <repo-relative-json>] [--usage-summary-ref <repo-relative-json>] [--usage-record-ref <repo-relative-json>] [--candidate-record-ref <repo-relative-json>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-evidence-sweep --operational-route-evidence-sweep-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-evidence-sweep-view --operational-route-evidence-sweep-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-latest-evidence [--write] --route-registry-ref <repo-relative-yaml> [--latest-evidence-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-latest-evidence --operational-route-latest-evidence-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-latest-evidence-view --operational-route-latest-evidence-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-operator-brief [--write] --route-registry-ref <repo-relative-yaml> [--operational-route-latest-evidence-ref <repo-relative-json>] [--operator-brief-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-operator-brief --operational-route-operator-brief-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-operator-brief-view --operational-route-operator-brief-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-doc-drift-check [--write] --route-registry-ref <repo-relative-yaml> [--operational-route-latest-evidence-ref <repo-relative-json>] [--operational-route-operator-brief-ref <repo-relative-json>] [--doc-ref <repo-relative-md> ...] [--drift-check-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-doc-drift-check --operational-route-doc-drift-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-doc-drift-check-view --operational-route-doc-drift-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-operator-health [--write] --route-registry-ref <repo-relative-yaml> [--operational-route-latest-evidence-ref <repo-relative-json>] [--operational-route-operator-brief-ref <repo-relative-json>] [--operational-route-doc-drift-ref <repo-relative-json>] [--operator-health-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-operator-health --operational-route-operator-health-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-operator-health-view --operational-route-operator-health-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-session [--write] --route-registry-ref <repo-relative-yaml> --query-label <ephemeral-label> [--smoke-tests-ref <repo-relative-yaml>] [--session-id <id>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-session --operational-route-session-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-session-sweep [--write] --route-registry-ref <repo-relative-yaml> --smoke-tests-ref <repo-relative-yaml> [--sweep-id <id>] [--text | --validate]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-session-sweep --operational-route-session-sweep-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-session-sweep-view --operational-route-session-sweep-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-run-view --operational-route-run-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-usage-record [--write] --route-registry-ref <repo-relative-yaml> --query-label <ephemeral-label> [--usage-id <id>] [--output-ref <repo-relative-json>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-usage-record --usage-record-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-usage-record-view --usage-record-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-usage-summary [--write] --route-registry-ref <repo-relative-yaml> [--usage-root-ref <repo-relative-dir>] [--summary-id <id>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-usage-summary --usage-summary-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-usage-summary-view --usage-summary-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-candidate-record [--write] --route-registry-ref <repo-relative-yaml> --query-label <ephemeral-label> [--candidate-id <id>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-candidate-record --candidate-record-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-candidate-record-view --candidate-record-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs operational-route-status [--write] --route-registry-ref <repo-relative-yaml> [--usage-root-ref <repo-relative-dir>] [--candidate-root-ref <repo-relative-dir>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-operational-route-status --operational-route-status-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs operational-route-status-view --operational-route-status-ref <repo-relative-json> [--json]",
      "  node guild_hall/rag/cli.mjs answer-engine-run [--write] --metadata-index-ref <repo-relative-json> [--extraction-packet-ref <repo-relative-json>] [--extraction-run-report-ref <repo-relative-json>] --question <question> [--run-id <id>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-answer-engine-run --run-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs metadata-index [--write] --manifest-ref <repo-relative-json> [--decision-packet-ref <repo-relative-json>] [--owner-decision-record-ref <repo-relative-json>] [--index-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-metadata-index --metadata-index-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs retrieval-trace [--write] --metadata-index-ref <repo-relative-json> --question <question> [--trace-id <id>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-retrieval-trace --retrieval-trace-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs retrieval-evaluation [--write] --metadata-index-ref <repo-relative-json> [--evaluation-id <id>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-retrieval-evaluation --retrieval-evaluation-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs validate-company-knowledge-intake-packet --packet-ref <repo-relative-json> [--validate-source-sync-ready-refs]",
      "  node guild_hall/rag/cli.mjs answer --question <question> [--manifest-ref <repo-relative-json> | --metadata-index-ref <repo-relative-json>] [--graph-ref <repo-relative-graph-json>] [--export-id <id>] [--text]",
      "",
      "Notes:",
      "  master-inventory-refresh regenerates the private metadata-only knowledge control surface under _workmeta/system/reports/knowledge_wiki; it uses NotebookLM metadata mirrors only and does not query NotebookLM live.",
      "  knowledge-source-storage-audit generates private metadata-only storage reports from _workmeta ledgers and workspace pointers; it does not copy, move, delete, upload, or decode source payloads.",
      "  The manifest/metadata commands stay metadata-only. The source-text commands read only owner-approved _workspaces/knowledge source cards and write private workspace payload artifacts.",
      "  Operational route candidate records persist only query fingerprints for unmatched labels; they do not update route registries or create default routes.",
      "  Operational route status combines registry validation, usage summaries, and candidate counts into one metadata-only operator dashboard.",
      "  Operational route answer-card validation checks card hygiene without returning card bodies.",
      "  Operational route preflight combines registry validation, smoke tests, answer-card validation, and status into one metadata-only readiness check.",
      "  Operational route sessions combine preflight and route resolution for one transient query while persisting only fingerprints and refs.",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
