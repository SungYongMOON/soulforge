import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { MAX_CLAUDE_STATUSLINE_STDIN_BYTES, runClaudeStatuslineQuotaFanoutCli } from "./claude-statusline-quota-fanout.mjs";

async function readInput(stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > MAX_CLAUDE_STATUSLINE_STDIN_BYTES) return null;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export async function runClaudeStatuslineFanoutWrapper({ argv = [], stdin = process.stdin, stdout = process.stdout, spawnImpl = spawn } = {}) {
  if (argv.length !== 4 || argv[0] !== "--receipt-path" || argv[2] !== "--next-command-base64") return 64;
  const input = await readInput(stdin).catch(() => null);
  if (input === null) return 1;
  await runClaudeStatuslineQuotaFanoutCli({ argv: argv.slice(0, 2), stdin: [input] });
  let command;
  try { command = Buffer.from(argv[3], "base64url").toString("utf8"); } catch { return 64; }
  if (!command || /[\r\n\0]/u.test(command)) return 64;
  return await new Promise((resolve) => {
    const child = spawnImpl(command, { shell: true, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    child.stdout.pipe(stdout, { end: false });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(Number.isInteger(code) ? code : 1));
    child.stdin.end(input);
  });
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  void runClaudeStatuslineFanoutWrapper({ argv: process.argv.slice(2) }).then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
}
