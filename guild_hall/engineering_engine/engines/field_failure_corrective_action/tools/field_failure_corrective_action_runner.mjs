#!/usr/bin/env node
// Public-synthetic FFCA demonstration runner. It reads no files, makes no network calls, and
// emits only deterministic JSON to stdout. Every effect counter in the receipt is zero.
import { assessFieldFailureCorrectiveAction } from "../evaluator/field_failure_corrective_action.mjs";
import { buildFieldFailureCorrectiveActionPublicSyntheticRequest } from "../fixtures/field_failure_corrective_action_public_synthetic.mjs";

const result = assessFieldFailureCorrectiveAction(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
process.stdout.write(`${JSON.stringify(result)}\n`);
