import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { canonicalJson } from "./project_history_envelope.mjs";
import { buildProjectHistoryKnowledgeProjection } from "./project_history_knowledge_projection.mjs";

const USAGE = [
  "Usage:",
  "  node guild_hall/shared/project_history_knowledge_projection_cli.mjs --generation <metadata-json> --knowledge-scope <project|common> --origin-project-code <PNN-NNN>",
  "",
  "Emits one deterministic feature-OFF metadata preview to stdout.",
  "It does not write source data, accepted history, RAG state, graph state, or canon.",
].join("\n");

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true, generation: null, knowledgeScope: null, originProjectCode: null };
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--generation", "--knowledge-scope", "--origin-project-code"].includes(key)
        || typeof value !== "string" || value.length === 0 || values.has(key)) {
      const error = new Error("invalid_arguments");
      error.code = "invalid_arguments";
      throw error;
    }
    values.set(key, value);
  }
  if (argv.length !== 6
      || !values.has("--generation")
      || !values.has("--knowledge-scope")
      || !values.has("--origin-project-code")) {
    const error = new Error("invalid_arguments");
    error.code = "invalid_arguments";
    throw error;
  }
  return {
    help: false,
    generation: values.get("--generation"),
    knowledgeScope: values.get("--knowledge-scope"),
    originProjectCode: values.get("--origin-project-code"),
  };
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const options = parseArgs(argv);
  if (options.help) {
    stdout.write(`${USAGE}\n`);
    return null;
  }
  let generationText;
  try {
    generationText = await readFile(options.generation, "utf8");
  } catch {
    const error = new Error("generation_read_failed");
    error.code = "generation_read_failed";
    throw error;
  }
  let generation;
  try {
    generation = JSON.parse(generationText);
  } catch {
    const error = new Error("generation_json_invalid");
    error.code = "generation_json_invalid";
    throw error;
  }
  const projection = await buildProjectHistoryKnowledgeProjection(generation, {
    knowledgeScope: options.knowledgeScope,
    originProjectCode: options.originProjectCode,
  });
  stdout.write(`${canonicalJson(projection)}\n`);
  return projection;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? "project_history_knowledge_projection_failed"}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
