import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { canonicalJson } from "./project_history_envelope.mjs";
import { queryProjectHistoryKnowledgeProjection } from "./project_history_knowledge_query.mjs";

const USAGE = [
  "Usage:",
  "  node guild_hall/shared/project_history_knowledge_query_cli.mjs --projection <metadata-json> --knowledge-scope <project|common> --origin-project-code <PNN-NNN> --question <transient-text> [--max-units <1-20>] [--now <iso8601>]",
  "",
  "Emits one feature-OFF metadata-only query result to stdout.",
  "The caller must choose project or common; this command never falls back across scopes.",
  "It does not persist the raw question or write source, RAG, Wiki, graph, DB, or canon state.",
].join("\n");

function invalidArguments() {
  const error = new Error("invalid_arguments");
  error.code = "invalid_arguments";
  return error;
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true };
  }
  if (argv.length % 2 !== 0) throw invalidArguments();
  const allowed = new Set([
    "--projection",
    "--knowledge-scope",
    "--origin-project-code",
    "--question",
    "--max-units",
    "--now",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== "string" || value.length === 0 || values.has(key)) {
      throw invalidArguments();
    }
    values.set(key, value);
  }
  for (const required of ["--projection", "--knowledge-scope", "--origin-project-code", "--question"]) {
    if (!values.has(required)) throw invalidArguments();
  }
  const maxUnitsText = values.get("--max-units");
  const maxUnits = maxUnitsText === undefined ? 5 : Number(maxUnitsText);
  if (!Number.isInteger(maxUnits)) throw invalidArguments();
  return {
    help: false,
    projection: values.get("--projection"),
    knowledgeScope: values.get("--knowledge-scope"),
    originProjectCode: values.get("--origin-project-code"),
    question: values.get("--question"),
    maxUnits,
    now: values.get("--now"),
  };
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const options = parseArgs(argv);
  if (options.help) {
    stdout.write(`${USAGE}\n`);
    return null;
  }
  let projectionText;
  try {
    projectionText = await readFile(options.projection, "utf8");
  } catch {
    const error = new Error("projection_read_failed");
    error.code = "projection_read_failed";
    throw error;
  }
  let projection;
  try {
    projection = JSON.parse(projectionText);
  } catch {
    const error = new Error("projection_json_invalid");
    error.code = "projection_json_invalid";
    throw error;
  }
  const result = await queryProjectHistoryKnowledgeProjection(projection, options);
  stdout.write(`${canonicalJson(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? "project_history_knowledge_query_failed"}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
