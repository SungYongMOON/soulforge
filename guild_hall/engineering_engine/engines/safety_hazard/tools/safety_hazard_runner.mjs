#!/usr/bin/env node
// Public-synthetic demonstration runner. It reads no file and writes deterministic JSON only
// to stdout. Its receipt declares every external effect counter as zero.
import { assessSafetyHazard } from '../evaluator/safety_hazard.mjs';
import { buildSafetyHazardPublicSyntheticRequest } from '../fixtures/safety_hazard_public_synthetic.mjs';

process.stdout.write(`${JSON.stringify(assessSafetyHazard(buildSafetyHazardPublicSyntheticRequest()))}\n`);
