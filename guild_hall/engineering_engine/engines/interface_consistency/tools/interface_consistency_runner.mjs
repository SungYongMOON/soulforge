#!/usr/bin/env node
// Public-synthetic, zero-write E02 runner. It reads no project material and writes deterministic
// JSON only to stdout.
import { buildInterfaceConsistencyPublicSyntheticRequest } from "../fixtures/interface_consistency_public_synthetic.mjs";
import { assessInterfaceConsistency } from "../evaluator/interface_consistency.mjs";

process.stdout.write(`${JSON.stringify(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()))}\n`);
