#!/usr/bin/env node
// Public-synthetic zero-write runner. It reads no caller files and writes one deterministic
// JSON line to stdout only.
import { buildPcbCompliancePublicSyntheticRequest } from "../fixtures/pcb_compliance_public_synthetic.mjs";
import { assessPcbCompliance } from "../evaluator/pcb_compliance.mjs";

process.stdout.write(`${JSON.stringify(assessPcbCompliance(buildPcbCompliancePublicSyntheticRequest()))}\n`);
