import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import {
  MANUFACTURING_READINESS_FACETS,
  MANUFACTURING_READINESS_FACET_IDS,
  isManufacturingReadinessFacetId,
} from '../vocabulary/manufacturing_readiness_vocabulary.mjs';

export const MANUFACTURING_READINESS_RULESET_SCHEMA =
  'soulforge.manufacturing_readiness.ruleset.v0';
export const MANUFACTURING_READINESS_RULESET_REVISION =
  'soulforge.manufacturing_readiness.ruleset.v0';

export const MANUFACTURING_READINESS_SOURCE_PACKET_REF = Object.freeze({
  entity_id: 'manufacturing-readiness-source-packet-v0',
  revision_id: 'manufacturing-readiness-source-packet-v0',
  content_id: 'sha256:a55d68030294df293e0662432f0db9bc26a5ef66bead6dd6a05d4e801fca93c9',
  content_hash_alg: 'sha256',
});

export const MANUFACTURING_READINESS_SOURCE_INVENTORY_REF = Object.freeze({
  entity_id: 'manufacturing-readiness-source-inventory-candidate-v1',
  revision_id: 'manufacturing-readiness-source-inventory-candidate-v1',
  content_id: 'sha256:1843bd8f812c3a62e9d2c928e38d68dfaed442416755bf658e7cc80e9c926f7a',
  content_hash_alg: 'sha256',
});

const rule = (rule_id, facet_id, source_refs, source_locators) => Object.freeze({
  rule_id,
  facet_id,
  source_refs: Object.freeze([...source_refs]),
  source_locators: Object.freeze([...source_locators]),
  required_evidence_states: Object.freeze(['present', 'criteria_met']),
});

// Ordered by rule_id.  Each rule is an evidence-readiness projection, not an
// applicability decision or source-compliance conclusion.
export const MANUFACTURING_READINESS_RULES = Object.freeze([
  rule('MR-BOM-01', 'bom', ['S1-NASA-8739.6B'], ['§4.1.4']),
  rule('MR-DOC-01', 'drawings', ['S1-NASA-8739.6B'], ['§§4.1.2, 4.1.4-4.1.5']),
  rule('MR-INSP-01', 'inspections', ['S1-NASA-8739.6B', 'S2-NASA-8739.12A'], ['§§4.1.2, 6.6', 'Appendix A']),
  rule('MR-MAT-01', 'materials', ['S1-NASA-8739.6B', 'S3-NASA-8739.14'], ['§§4.1.4, 4.3, 6.3, 6.5', '§§4.4-4.6']),
  rule('MR-PE-01', 'personnel_and_equipment', ['S1-NASA-8739.6B', 'S2-NASA-8739.12A'], ['§§5.2, 5.14', 'Appendix A']),
  rule('MR-PROC-01', 'processes', ['S1-NASA-8739.6B'], ['§§4.1.4-4.1.7']),
  rule('MR-TOOL-01', 'tooling', ['S1-NASA-8739.6B', 'S2-NASA-8739.12A'], ['§§4.1.4, 6.4.1-6.4.2', '§§4.1-4.2']),
  rule('MR-WI-01', 'work_instructions', ['S1-NASA-8739.6B'], ['§§4.1.2, 4.1.5, 4.1.7']),
]);

const ruleDigestMaterial = {
  schema_version: MANUFACTURING_READINESS_RULESET_SCHEMA,
  revision: MANUFACTURING_READINESS_RULESET_REVISION,
  source_packet_ref: MANUFACTURING_READINESS_SOURCE_PACKET_REF,
  source_inventory_ref: MANUFACTURING_READINESS_SOURCE_INVENTORY_REF,
  facets: MANUFACTURING_READINESS_FACETS,
  rules: MANUFACTURING_READINESS_RULES,
};

const rulesetDigest = sha256Hex(
  `soulforge.manufacturing_readiness.ruleset.digest.v0\n${canonicalise(ruleDigestMaterial, {
    facets: 'insertion_ordered',
    rules: 'insertion_ordered',
    'rules[].source_refs': 'insertion_ordered',
    'rules[].source_locators': 'insertion_ordered',
    'rules[].required_evidence_states': 'insertion_ordered',
  })}`,
);

export const MANUFACTURING_READINESS_RULESET_REF = Object.freeze({
  entity_id: 'manufacturing-readiness-ruleset-v0',
  revision_id: MANUFACTURING_READINESS_RULESET_REVISION,
  content_id: `sha256:${rulesetDigest}`,
  content_hash_alg: 'sha256',
});

export { MANUFACTURING_READINESS_FACET_IDS, isManufacturingReadinessFacetId };
