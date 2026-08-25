#!/usr/bin/env node
// Public-synthetic E06 demonstration runner. It reads no files, accepts no runtime payload,
// writes no files, and emits exactly one deterministic JSON result on stdout.
import { buildReliabilityMaintainabilityPublicSyntheticRequest } from '../fixtures/reliability_maintainability_public_synthetic.mjs';
import { assessReliabilityMaintainability } from '../evaluator/reliability_maintainability.mjs';

const result = assessReliabilityMaintainability(buildReliabilityMaintainabilityPublicSyntheticRequest());
process.stdout.write(`${JSON.stringify(result)}\n`);
