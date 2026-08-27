#!/usr/bin/env node
// Public-synthetic, zero-write demonstration runner. It reads no caller files and emits JSON only.
import { assessManufacturingReadiness } from '../evaluator/manufacturing_readiness.mjs';
import { buildManufacturingReadinessPublicSyntheticRequest } from '../fixtures/manufacturing_readiness_public_synthetic.mjs';

process.stdout.write(`${JSON.stringify(assessManufacturingReadiness(buildManufacturingReadinessPublicSyntheticRequest('ready')))}\n`);
