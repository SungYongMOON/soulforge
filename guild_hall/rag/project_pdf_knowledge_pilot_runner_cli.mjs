// Thin process entrypoint for the bounded P4 runner.  The imported command
// seam owns all parsing and the one payload-free stderr receipt; this wrapper
// never prints an exception or an input value.
import process from "node:process";

import { runProjectPdfKnowledgePilotCli } from "./project_pdf_knowledge_pilot_runner.mjs";

try {
  const receipt = await runProjectPdfKnowledgePilotCli(process.argv.slice(2));
  process.exitCode = receipt.result === "PASS" ? 0 : 1;
} catch {
  process.exitCode = 1;
}
