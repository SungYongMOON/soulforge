#!/usr/bin/env node

import { readHppLocalActivityBinding, validateActivityOutboxStore } from "./local_activity.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));

try {
  const { binding } = await readHppLocalActivityBinding(args.binding, args["binding-sha256"]);
  process.stdout.write(`${JSON.stringify(await validateActivityOutboxStore(binding))}\n`);
} catch (error) {
  process.stderr.write(`hpp_activity_outbox_store_rejected:${error?.code ?? "unexpected"}\n`);
  process.exitCode = 1;
}
