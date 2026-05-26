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
  buildSourceTextAnswerRun,
  buildSourceTextIndex,
  loadKnowledgeSourceCard,
  loadSourceTextAnswerRun,
  loadSourceTextIndex,
  renderSourceTextAnswerRunText,
  validateKnowledgeSourceCard,
  validateSourceTextAnswerRun,
  validateSourceTextIndex,
  writeSourceTextAnswerRun,
  writeSourceTextIndex,
} from "./source_text_index.mjs";
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

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());

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
    const validation = validateCompanyKnowledgeIntakePacket(packet);
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
      "  node guild_hall/rag/cli.mjs validate-knowledge-source-card --source-card-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs validate-source-sync-ready --ready-ref <repo-relative-json> [--source-card-ref <repo-relative-json>] [--source-text-ref <repo-relative-text>] [--stable-ms <n>] [--metadata-only]",
      "  node guild_hall/rag/cli.mjs source-text-index [--write] --source-card-ref <repo-relative-json> [--ready-ref <repo-relative-json>] [--stable-ms <n>] [--index-id <id>] [--max-chars <n>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-source-text-index --source-text-index-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs source-text-answer-run [--write] --source-text-index-ref <repo-relative-json> --question <question> [--run-id <id>] [--max-chunks <n>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-source-text-answer-run --run-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs answer-engine-run [--write] --metadata-index-ref <repo-relative-json> [--extraction-packet-ref <repo-relative-json>] [--extraction-run-report-ref <repo-relative-json>] --question <question> [--run-id <id>] [--text]",
      "  node guild_hall/rag/cli.mjs validate-answer-engine-run --run-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs metadata-index [--write] --manifest-ref <repo-relative-json> [--decision-packet-ref <repo-relative-json>] [--owner-decision-record-ref <repo-relative-json>] [--index-id <id>] [--project-code <code>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-metadata-index --metadata-index-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs retrieval-trace [--write] --metadata-index-ref <repo-relative-json> --question <question> [--trace-id <id>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-retrieval-trace --retrieval-trace-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs retrieval-evaluation [--write] --metadata-index-ref <repo-relative-json> [--evaluation-id <id>] [--output-ref <repo-relative-json>]",
      "  node guild_hall/rag/cli.mjs validate-retrieval-evaluation --retrieval-evaluation-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs validate-company-knowledge-intake-packet --packet-ref <repo-relative-json>",
      "  node guild_hall/rag/cli.mjs answer --question <question> [--manifest-ref <repo-relative-json> | --metadata-index-ref <repo-relative-json>] [--graph-ref <repo-relative-graph-json>] [--export-id <id>] [--text]",
      "",
      "Notes:",
      "  The manifest/metadata commands stay metadata-only. The source-text commands read only owner-approved _workspaces/knowledge source cards and write private workspace payload artifacts.",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
