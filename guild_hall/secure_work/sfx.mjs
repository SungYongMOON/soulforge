#!/usr/bin/env node

// `sfx` — thin Node entry point for the secure-work lane.
//
// Why a Node wrapper in front of a Python engine: this repository's command
// surface is `npm run <script>` over Node CLIs, and every other lane is reached
// that way, so the lane keeps one shape with the rest of the tree. The engine
// itself has to stay Python, because the E14 contract kit's reference core
// (`sf_sewe`) is Python and re-implementing that contract in Node would be
// exactly the re-invention the kit's implementer contract forbids.
//
// This file adds no behaviour of its own. It resolves the runtime config,
// locates the interpreter named there, puts this package on `PYTHONPATH`, and
// passes the arguments and the exit code straight through. Host paths live only
// in that config file, never here.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, "src");
const CONFIG_ENV = "SOULFORGE_SECURE_WORK_CONFIG";

export function resolveConfigPath(argv, env) {
  const flag = argv.indexOf("--config");
  if (flag >= 0 && argv[flag + 1] && !argv[flag + 1].startsWith("--")) return argv[flag + 1];
  return env[CONFIG_ENV] || null;
}

export function readRuntime(configPath) {
  if (!configPath) return { code: "CONFIG_NOT_BOUND" };
  if (!existsSync(configPath)) return { code: "CONFIG_FILE_MISSING" };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return { code: "CONFIG_FILE_INVALID" };
  }
  if (parsed.schema !== "soulforge.secure_work.config.v0") return { code: "CONFIG_SCHEMA_MISMATCH" };
  const interpreter = parsed?.runtime?.python_executable;
  if (typeof interpreter !== "string" || !interpreter) return { code: "PYTHON_NOT_BOUND" };
  if (!path.isAbsolute(interpreter)) return { code: "PYTHON_PATH_NOT_ABSOLUTE" };
  if (!existsSync(interpreter)) return { code: "PYTHON_NOT_FOUND" };
  return { interpreter };
}

function fail(code) {
  process.stdout.write(`${JSON.stringify({ ok: false, code }, null, 2)}\n`);
  return 2;
}

function main() {
  const argv = process.argv.slice(2);
  const configPath = resolveConfigPath(argv, process.env);
  const runtime = readRuntime(configPath);
  if (runtime.code) return fail(runtime.code);
  const result = spawnSync(runtime.interpreter, ["-m", "soulforge_secure_work.cli", ...argv], {
    stdio: "inherit",
    env: {
      ...process.env,
      [CONFIG_ENV]: configPath,
      PYTHONPATH: [packageRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      PYTHONUTF8: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });
  if (result.error) return fail("PYTHON_SPAWN_FAILED");
  return result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main());
}
