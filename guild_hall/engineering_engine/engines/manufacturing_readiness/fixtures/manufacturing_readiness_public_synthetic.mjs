// Public-synthetic facts only.  No project payload, source body, ERP row, or private path is present.
import {
  MANUFACTURING_READINESS_RULESET_REF,
  MANUFACTURING_READINESS_SOURCE_PACKET_REF,
} from '../rules/manufacturing_readiness_rules.mjs';

const FACETS = Object.freeze([
  'drawings',
  'bom',
  'processes',
  'tooling',
  'work_instructions',
  'personnel_and_equipment',
  'inspections',
  'materials',
]);

function facet(facet_id, applicability = 'applicable', evidence_state = 'present', evaluation_state = 'criteria_met') {
  return { facet_id, applicability, evidence_state, evaluation_state };
}

export const MANUFACTURING_READINESS_PUBLIC_SYNTHETIC_PROJECT_BINDING_REF = Object.freeze({
  schema_version: 'soulforge.project_binding.v0',
  project_id: 'synthetic-manufacturing-project',
  domain_engine_id: 'manufacturing_readiness',
  binding_revision_hash: 'synthetic-manufacturing-binding-r1',
  source_manifest_ref: 'synthetic-manufacturing-source-manifest-r1',
  authority_family: 'public_synthetic',
  valid_at: '2026-08-26T00:00:00.000Z',
  known_at: '2026-08-26T00:00:00.000Z',
  document_refs: Object.freeze(['synthetic-manufacturing-document-r1']),
});

const readyRequest = Object.freeze({
  schema_version: 'soulforge.manufacturing_readiness.domain_input.v0',
  project_binding_ref: MANUFACTURING_READINESS_PUBLIC_SYNTHETIC_PROJECT_BINDING_REF,
  facets: FACETS.map((facet_id) => facet(facet_id)),
});

const holdRequest = Object.freeze({
  schema_version: 'soulforge.manufacturing_readiness.domain_input.v0',
  project_binding_ref: MANUFACTURING_READINESS_PUBLIC_SYNTHETIC_PROJECT_BINDING_REF,
  facets: [
    facet('drawings'),
    facet('bom', 'applicable', 'absence_confirmed', 'criteria_met'),
    facet('processes', 'unknown', 'unknown', 'unknown'),
    facet('tooling', 'applicable', 'present', 'criteria_not_met'),
    facet('work_instructions'),
    facet('personnel_and_equipment'),
    {
      ...facet('inspections', 'not_applicable', 'unknown', 'unknown'),
      not_applicable_basis_ref: 'synthetic-inspection-scope-basis-r1',
    },
    facet('materials'),
  ],
});

export const MANUFACTURING_READINESS_PUBLIC_SYNTHETIC_FIXTURE = Object.freeze({
  fixture_id: 'manufacturing-readiness-public-synthetic-v0',
  ruleset_ref: MANUFACTURING_READINESS_RULESET_REF,
  source_packet_ref: MANUFACTURING_READINESS_SOURCE_PACKET_REF,
  ready_request: readyRequest,
  hold_request: holdRequest,
  hold_expected: Object.freeze({
    counts: Object.freeze({
      satisfied: 4,
      gap_missing: 1,
      gap_unknown: 1,
      gap_conflict: 1,
      not_applicable: 1,
      total: 8,
    }),
  }),
});

export function buildManufacturingReadinessPublicSyntheticRequest(kind = 'ready') {
  if (kind === 'ready') return structuredClone(readyRequest);
  if (kind === 'hold') return structuredClone(holdRequest);
  throw new TypeError(`unknown public synthetic manufacturing readiness fixture "${kind}"`);
}
