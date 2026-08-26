#!/usr/bin/env node
import { assembleEffectiveRuleSet, evaluate } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { databaseEngineeringAdapter } from '../evaluator/database_engineering_evaluator_adapter.mjs';
import { adaptDatabaseProjectEvidence } from '../evaluator/database_project_evidence_adapter.mjs';
import { buildSqlitePublicSyntheticInput } from '../fixtures/database_engineering_public_synthetic.mjs';

// Public-synthetic, stdout-only demonstration runner. It receives no file path, network,
// DB, model, or writer option, so the effect envelope is closed by construction.
const input = buildSqlitePublicSyntheticInput();
const adapted = adaptDatabaseProjectEvidence(input.binding, input.evidence, input.cutoffs);
const effective = assembleEffectiveRuleSet(databaseEngineeringAdapter, [], { purpose: 'public_synthetic' });
const result = evaluate(databaseEngineeringAdapter, effective, adapted.typed_project_facts, {}, input.cutoffs);
process.stdout.write(`${JSON.stringify(result)}\n`);
