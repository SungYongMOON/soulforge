#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  readJson,
  renderDirectory,
  resolveRoute,
  validateBindings,
  validateCatalog
} from "./directory.mjs";

const USAGE = `Usage:
  node guild_hall/codex_work_directory/cli.mjs validate-catalog --catalog <path>
  node guild_hall/codex_work_directory/cli.mjs validate-binding --catalog <path> --binding <path>
  node guild_hall/codex_work_directory/cli.mjs render --catalog <path> [--view all|overview|projects|ax]
  node guild_hall/codex_work_directory/cli.mjs resolve --catalog <path> [--binding <path>] --query <text>
  node guild_hall/codex_work_directory/cli.mjs resolve --catalog <path> [--binding <path>] --route-id <id>
  node guild_hall/codex_work_directory/cli.mjs resolve --catalog <path> [--binding <path>] --project-code <code> --canon-confirmed

All commands are read-only. No command sends, creates, dispatches, or writes runtime state.`;

export function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (key === "canon-confirmed") {
      values.canon_confirmed = true;
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    values[key.replaceAll("-", "_")] = value;
    index += 1;
  }
  return { command, values };
}

function requireValue(values, key) {
  if (!values[key]) {
    throw new Error(`missing required --${key.replaceAll("_", "-")}`);
  }
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const { command, values } = parseArgs(argv);
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  requireValue(values, "catalog");
  const catalog = await readJson(values.catalog);

  if (command === "validate-catalog") {
    const validation = await validateCatalog(catalog);
    printJson(validation);
    return validation.valid ? 0 : 1;
  }

  if (command === "validate-binding") {
    requireValue(values, "binding");
    const bindings = await readJson(values.binding);
    const validation = await validateBindings(bindings, catalog);
    printJson(validation);
    return validation.valid ? 0 : 1;
  }

  const catalogValidation = await validateCatalog(catalog);
  if (!catalogValidation.valid) {
    printJson({ ...catalogValidation, error: "catalog validation failed" });
    return 1;
  }

  if (command === "render") {
    const view = values.view ?? "all";
    const markdown = renderDirectory(catalog, view);
    printJson({
      view,
      markdown,
      side_effect_performed: false,
      dispatch_performed: false
    });
    return 0;
  }

  if (command === "resolve") {
    const bindings = values.binding ? await readJson(values.binding) : undefined;
    if (bindings) {
      const bindingValidation = await validateBindings(bindings, catalog);
      if (!bindingValidation.valid) {
        printJson({ ...bindingValidation, error: "binding validation failed" });
        return 1;
      }
    }
    const selectors = [
      values.query,
      values.route_id,
      values.project_code
    ].filter((value) => value !== undefined);
    if (selectors.length !== 1) {
      throw new Error("resolve requires exactly one of --query, --route-id, or --project-code");
    }
    printJson(resolveRoute({
      catalog,
      bindings,
      query: values.query,
      route_id: values.route_id,
      project_code: values.project_code,
      canon_confirmed: values.canon_confirmed === true
    }));
    return 0;
  }

  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      printJson({
        error: error.message,
        side_effect_performed: false,
        dispatch_performed: false
      });
      process.exitCode = 1;
    }
  );
}
