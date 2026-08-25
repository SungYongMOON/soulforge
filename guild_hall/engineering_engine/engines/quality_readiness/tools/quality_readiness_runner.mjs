#!/usr/bin/env node
// Public-synthetic E01 demonstration runner. It reads no files and writes only deterministic JSON
// to stdout; the module receipt declares every external-effect counter as zero.
import { buildQualityReadinessPublicSyntheticRequest } from '../fixtures/quality_readiness_public_synthetic.mjs';
import { assessQualityReadiness } from '../evaluator/quality_readiness.mjs';

const result = assessQualityReadiness(buildQualityReadinessPublicSyntheticRequest());
process.stdout.write(`${JSON.stringify(result)}\n`);
