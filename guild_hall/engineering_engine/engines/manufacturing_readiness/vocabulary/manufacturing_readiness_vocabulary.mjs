// Closed public vocabulary for the bounded manufacturing build-start assessment.
export const MANUFACTURING_READINESS_VOCABULARY_SCHEMA =
  'soulforge.manufacturing_readiness.vocabulary.v0';

export const MANUFACTURING_READINESS_FACETS = Object.freeze([
  Object.freeze({
    facet_id: 'drawings',
    label: 'drawings',
    boundary: 'revision-pinned manufacturing-document evidence only; not design approval',
  }),
  Object.freeze({
    facet_id: 'bom',
    label: 'BOM',
    boundary: 'declared parts/material list agreement only; not ERP inventory truth',
  }),
  Object.freeze({
    facet_id: 'processes',
    label: 'processes',
    boundary: 'approved process evidence only; not process qualification authority',
  }),
  Object.freeze({
    facet_id: 'tooling',
    label: 'tooling',
    boundary: 'declared suitability/control evidence only; not calibration authority',
  }),
  Object.freeze({
    facet_id: 'work_instructions',
    label: 'work instructions',
    boundary: 'approved instruction evidence only; not work-order release',
  }),
  Object.freeze({
    facet_id: 'personnel_and_equipment',
    label: 'personnel and equipment prerequisites',
    boundary: 'supplied qualification/prerequisite evidence only; not assignment or certification',
  }),
  Object.freeze({
    facet_id: 'inspections',
    label: 'inspections',
    boundary: 'inspection-plan/readiness evidence only; not quality acceptance',
  }),
  Object.freeze({
    facet_id: 'materials',
    label: 'materials',
    boundary: 'supplied material readiness evidence only; not procurement, receipt, or stock assertion',
  }),
]);

export const MANUFACTURING_READINESS_FACET_IDS = Object.freeze(
  MANUFACTURING_READINESS_FACETS.map((facet) => facet.facet_id),
);

export function isManufacturingReadinessFacetId(value) {
  return typeof value === 'string' && MANUFACTURING_READINESS_FACET_IDS.includes(value);
}
