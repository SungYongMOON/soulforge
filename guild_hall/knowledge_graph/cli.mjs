#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { runCodexBridgeAsk } from "../codex_bridge/codex_bridge.mjs";
import { exportKnowledgeGraph } from "./graph_export.mjs";
import {
  DEFAULT_KNOWLEDGE_GRAPH_REVIEW_MODEL,
  DEFAULT_KNOWLEDGE_GRAPH_REVIEW_OUTPUT_REF,
  buildKnowledgeGraphReviewRequest,
} from "./llm_review.mjs";
import { buildRetrievalPlan } from "./retrieval_plan.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());

  if (command === "export") {
    const result = await exportKnowledgeGraph({
      repoRoot,
      exportId: args["export-id"],
      outputRoot: args["output-root"],
      ledgerRefs: args["ledger-ref"],
      ledgerFiles: args["ledger-file"],
      ragManifestRefs: args["rag-manifest-ref"],
      sourceSliceTriageRegisterRefs: args["source-slice-triage-register-ref"],
      sourceSliceReviewQueueRefs: args["source-slice-review-queue-ref"],
      now: args.now,
    });
    printJson(result);
    return;
  }

  if (command === "plan") {
    const question = optionalStringArg(args, "question") ?? args._?.join(" ");
    const result = await buildRetrievalPlan({
      repoRoot,
      question,
      nodeRef: optionalStringArg(args, "node-ref"),
      graphRef: optionalStringArg(args, "graph-ref"),
      exportId: optionalStringArg(args, "export-id"),
      maxNodes: args["max-nodes"],
      maxPaths: args["max-paths"],
      maxSourceRefs: args["max-source-refs"],
    });
    printJson(result);
    return;
  }

  if (command === "review") {
    const question = optionalStringArg(args, "question") ?? args._?.join(" ");
    const plan = await buildRetrievalPlan({
      repoRoot,
      question,
      nodeRef: optionalStringArg(args, "node-ref"),
      graphRef: optionalStringArg(args, "graph-ref"),
      exportId: optionalStringArg(args, "export-id"),
      maxNodes: args["max-nodes"],
      maxPaths: args["max-paths"],
      maxSourceRefs: args["max-source-refs"],
    });
    const request = buildKnowledgeGraphReviewRequest(plan, {
      model: optionalStringArg(args, "model") ?? DEFAULT_KNOWLEDGE_GRAPH_REVIEW_MODEL,
      outputRef: optionalStringArg(args, "output-ref") ?? DEFAULT_KNOWLEDGE_GRAPH_REVIEW_OUTPUT_REF,
    });
    const result = await runCodexBridgeAsk({
      repoRoot,
      command: optionalStringArg(args, "command"),
      prompt: request.prompt,
      context: JSON.stringify(request.context, null, 2),
      mode: request.mode,
      model: request.model,
      profile: optionalStringArg(args, "profile"),
      outputRef: request.output_ref,
      jsonEvents: Boolean(args.json),
    });
    if (args.text) {
      process.stdout.write(`${result.response.text}\n`);
      return;
    }
    printJson({
      schema_version: "soulforge.knowledge_graph_llm_review_response.v0",
      kind: "knowledge_graph_relation_candidate_review",
      status: result.status,
      request,
      bridge: result,
    });
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
      "  node guild_hall/knowledge_graph/cli.mjs export [--export-id <id>] [--output-root <repo-relative-output-root>] [--ledger-ref <repo-relative-jsonl>]... [--rag-manifest-ref <repo-relative-json>]... [--source-slice-triage-register-ref <repo-relative-json>]... [--source-slice-review-queue-ref <repo-relative-json>]...",
      "  node guild_hall/knowledge_graph/cli.mjs plan --question <question> [--node-ref <node-ref>] [--graph-ref <repo-relative-graph-json>] [--export-id <id>] [--max-nodes <n>] [--max-paths <n>] [--max-source-refs <n>]",
      "  node guild_hall/knowledge_graph/cli.mjs review --node-ref <node-ref> [--question <question>] [--graph-ref <repo-relative-graph-json>] [--model gpt-5.5] [--output-ref <repo-relative-md>] [--text]",
      "",
      "Notes:",
      "  Generates metadata-only graph.json, a default Three.js graph_preview.html, graph_preview_2d.html, and an Obsidian-readable generated vault under _workspaces/system/knowledge_view by default.",
      "  Explicit ledger refs/files may add usage and recency signals. Usage counts are navigation signals, not truth or acceptance.",
      "  Explicit RAG manifest refs may add metadata-only RAG lens overlays. They do not load source text, vector stores, NotebookLM answers, or private payloads.",
      "  Explicit source-slice triage/register refs may add metadata-only RAG registration overlays. They do not approve source text, indexes, NotebookLM packets, or public canon promotion.",
      "  The plan command reads metadata-only graph data and returns selected-node-aware candidate nodes, relation paths, source refs, missing evidence, next actions, and a detection_card render contract. It does not load source text or generate answers.",
      "  The review command sends the compact metadata-only plan to the Codex bridge for advisory relation-candidate review. It defaults to gpt-5.5 and still cannot claim source truth, owner approval, or canon promotion.",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
