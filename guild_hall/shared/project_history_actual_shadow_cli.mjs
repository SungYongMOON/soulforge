import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { canonicalJson } from "./project_history_envelope.mjs";
import { buildActualFiveLaneShadowGeneration } from "./project_history_actual_shadow.mjs";

const USAGE = [
  "Usage:",
  "  node guild_hall/shared/project_history_actual_shadow_cli.mjs --packet <metadata-only-json>",
  "",
  "Reads one feature-OFF pilot packet and writes one canonical Shadow generation to stdout.",
  "It does not write ERP, official history, source data, or an output file.",
].join("\n");

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true, packet: null };
  }
  if (argv.length !== 2 || argv[0] !== "--packet" || argv[1].length === 0) {
    const error = new Error("invalid_arguments");
    error.code = "invalid_arguments";
    throw error;
  }
  return { help: false, packet: argv[1] };
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const options = parseArgs(argv);
  if (options.help) {
    stdout.write(`${USAGE}\n`);
    return null;
  }
  let packetText;
  try {
    packetText = await readFile(options.packet, "utf8");
  } catch {
    const error = new Error("packet_read_failed");
    error.code = "packet_read_failed";
    throw error;
  }
  let packet;
  try {
    packet = JSON.parse(packetText);
  } catch {
    const error = new Error("packet_json_invalid");
    error.code = "packet_json_invalid";
    throw error;
  }
  const generation = buildActualFiveLaneShadowGeneration(packet);
  stdout.write(`${canonicalJson(generation)}\n`);
  return generation;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? "actual_shadow_failed"}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
