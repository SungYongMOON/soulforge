import { DATABASE_GAP_STATE } from '../rules/database_engineering_vocabulary.mjs';

export const DATABASE_ENGINEERING_GUIDANCE = Object.freeze({
  schema_version: 'soulforge.database_engineering.guidance.v0',
  claim_ceiling: 'source_supported',
  messages: Object.freeze({
    [DATABASE_GAP_STATE.SATISFIED]: 'A project-bound requirement, exact supported platform, and submitted machine-observable evidence agree. This is not approval.',
    [DATABASE_GAP_STATE.MISSING]: 'A bound requirement and exact supported platform have contradictory machine-observable evidence. Confirm the project evidence and remediation owner.',
    [DATABASE_GAP_STATE.UNKNOWN]: 'Requirement, supported platform applicability, or machine-observable evidence is incomplete. Hold rather than infer a database decision.',
    [DATABASE_GAP_STATE.CONFLICT]: 'Submitted machine-observable evidence conflicts. Preserve the evidence and route resolution to the project authority.',
  }),
  advisory_boundary: 'Modeling, normalization, DBMS choice, index choice, partitioning, sharding, and isolation tradeoffs remain advisory unless the project binds an exact requirement and evidence.',
  source_boundary: 'RAG/LLM may locate source candidates and explain deterministic output; neither may accept rules or publish verdicts.',
});
