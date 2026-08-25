// Public-synthetic typed facts only. No project source, contract body, local path, or secret.
import {
  INTERFACE_CONSISTENCY_DOMAIN_INPUT_SCHEMA,
} from "../rules/interface_consistency_rules.mjs";

const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

const present = (value, unit = undefined) => (unit === undefined
  ? { state: "present", value }
  : { state: "present", value, unit });
const unknown = () => ({ state: "unknown" });
const absent = () => ({ state: "known_absent" });

const APPLICABLE_SCOPE = Object.freeze({
  electrical: { applicability: "applicable", required_attributes: ["voltage_nominal"] },
  signal: { applicability: "applicable", required_attributes: ["signal_direction"] },
  data_protocol: { applicability: "applicable", required_attributes: ["protocol_id"] },
  mechanical: { applicability: "applicable", required_attributes: ["connector_family"] },
  timing: { applicability: "applicable", required_attributes: ["clock_rate_hz"] },
});

const NOT_APPLICABLE_SCOPE = Object.freeze({
  electrical: { applicability: "not_applicable", required_attributes: [] },
  signal: { applicability: "not_applicable", required_attributes: [] },
  data_protocol: { applicability: "not_applicable", required_attributes: [] },
  mechanical: { applicability: "not_applicable", required_attributes: [] },
  timing: { applicability: "not_applicable", required_attributes: [] },
});

function attributes(rows) {
  return { attributes: rows.map(([attribute_id, fact]) => ({ attribute_id, ...fact })) };
}

function end(end_id, role, overrides = {}) {
  return {
    end_id,
    role,
    revision: overrides.revision ?? present("synthetic-r1"),
    agreement: overrides.agreement ?? { state: "agreed", revision: present("synthetic-r1") },
    observations: overrides.observations ?? {
      electrical: attributes([["voltage_nominal", present(28, "V")]]),
      signal: attributes([["signal_direction", present("source_to_sink")]]),
      data_protocol: attributes([["protocol_id", present("synthetic_link_v1")]]),
      mechanical: attributes([["connector_family", present("synthetic_connector_a")]]),
      timing: attributes([["clock_rate_hz", present(1000000, "Hz")]]),
    },
  };
}

function interfaceRecord(interface_id, overrides = {}) {
  return {
    interface_id,
    applicability: overrides.applicability ?? "applicable",
    revision: overrides.revision ?? present("synthetic-r1"),
    category_scope: overrides.category_scope ?? structuredClone(APPLICABLE_SCOPE),
    ends: overrides.ends ?? [end(`${interface_id}_end_a`, "provider"), end(`${interface_id}_end_b`, "consumer")],
  };
}

function makeFixture() {
  const missingStart = end("IF_MISSING_end_a", "provider", {
    observations: {
      electrical: attributes([["voltage_nominal", absent()]]),
      signal: attributes([["signal_direction", present("source_to_sink")]]),
      data_protocol: attributes([["protocol_id", present("synthetic_link_v1")]]),
      mechanical: attributes([["connector_family", present("synthetic_connector_a")]]),
      timing: attributes([["clock_rate_hz", present(1000000, "Hz")]]),
    },
  });
  const missingEnd = end("IF_MISSING_end_b", "consumer", {
    observations: {
      electrical: attributes([["voltage_nominal", absent()]]),
      signal: attributes([["signal_direction", present("source_to_sink")]]),
      data_protocol: attributes([["protocol_id", present("synthetic_link_v1")]]),
      mechanical: attributes([["connector_family", present("synthetic_connector_a")]]),
      timing: attributes([["clock_rate_hz", present(1000000, "Hz")]]),
    },
  });
  const conflictEnd = end("IF_CONFLICT_end_b", "consumer", {
    observations: {
      electrical: attributes([["voltage_nominal", present(24, "V")]]),
      signal: attributes([["signal_direction", present("source_to_sink")]]),
      data_protocol: attributes([["protocol_id", present("synthetic_link_v1")]]),
      mechanical: attributes([["connector_family", present("synthetic_connector_a")]]),
      timing: attributes([["clock_rate_hz", present(1000000, "Hz")]]),
    },
  });

  return {
    schema_version: INTERFACE_CONSISTENCY_DOMAIN_INPUT_SCHEMA,
    register_id: "synthetic_interface_register",
    register_revision: "synthetic-register-r1",
    interfaces: [
      interfaceRecord("IF_SAT"),
      interfaceRecord("IF_MISSING", { ends: [missingStart, missingEnd] }),
      interfaceRecord("IF_UNKNOWN", {
        category_scope: {
          ...structuredClone(APPLICABLE_SCOPE),
          timing: { applicability: "unknown", required_attributes: ["clock_rate_hz"] },
        },
      }),
      interfaceRecord("IF_CONFLICT", { ends: [end("IF_CONFLICT_end_a", "provider"), conflictEnd] }),
      interfaceRecord("IF_NOT_APPLICABLE", {
        applicability: "not_applicable",
        category_scope: structuredClone(NOT_APPLICABLE_SCOPE),
        ends: [end("IF_NOT_APPLICABLE_end_a", "peer"), end("IF_NOT_APPLICABLE_end_b", "peer")],
      }),
    ],
  };
}

export const INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE = freezeDeep({
  fixture_id: "interface-consistency-public-synthetic-v0",
  request: makeFixture(),
  expected: {
    states_by_interface: {
      IF_CONFLICT: "gap_conflict",
      IF_MISSING: "gap_missing",
      IF_NOT_APPLICABLE: "not_applicable",
      IF_SAT: "satisfied",
      IF_UNKNOWN: "gap_unknown",
    },
    counts: {
      satisfied: 1,
      gap_missing: 1,
      gap_unknown: 1,
      gap_conflict: 1,
      not_applicable: 1,
      total: 5,
    },
  },
});

export function buildInterfaceConsistencyPublicSyntheticRequest() {
  return structuredClone(INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.request);
}
