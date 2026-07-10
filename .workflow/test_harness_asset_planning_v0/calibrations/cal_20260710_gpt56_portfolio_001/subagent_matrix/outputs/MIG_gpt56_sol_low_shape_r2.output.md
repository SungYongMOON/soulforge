{
  "workflow_id": "test_harness_asset_planning_v0",
  "candidate_label": "gpt-5.6-sol|low|human|auditor",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "human",
    "class": "auditor"
  },
  "outputs": {
    "test_harness_manifest": "Planned assets: PHYS-FIX-01 physical fixture for module positioning and connection; SIM-HAR-01 simulation harness for modeled interface stimulation and response capture. Both remain planning entries with readiness unapproved.",
    "test_interface_list": "Planned interfaces: physical module-to-fixture connection for PHYS-FIX-01; simulated stimulus-and-response interface for SIM-HAR-01. Pin, signal, protocol, and tolerance details are not supplied.",
    "simulation_fixture_needs": "SIM-HAR-01 is needed to provide modeled inputs and capture expected outputs for a composed harness candidate. The model definition, stimulus set, expected-response criteria, and simulator compatibility remain unspecified.",
    "instrumentation_resource_list": "Instrumentation must be selected after interface ranges and observability requirements are provided. No specific instrument, software tool, quantity, or availability is established by the synthetic facts.",
    "trr_readiness_checklist": "Confirm fixture design and module compatibility; define simulation model and stimulus set; specify interfaces, ranges, and expected responses; identify required instrumentation; resolve the planning blocker; record the owner decision; verify boundary compliance. TRR approval is not granted.",
    "planning_blockers": "BLOCK-01: interface specifications and acceptance criteria are absent, preventing completion of fixture details, simulation configuration, instrumentation selection, and readiness assessment.",
    "owner_followup_needed": "OWNER-01: provide or authorize the interface specifications and acceptance criteria needed to resolve BLOCK-01 and complete the planning package.",
    "boundary_review_note": "Planning-only output based exclusively on the public-safe synthetic contract. It records asset needs, readiness conditions, a blocker, and owner follow-up without claiming execution, simulation, test results, TRR approval, artifact mutation, or stronger authority."
  },
  "provenance": [
    "Public-safe synthetic workflow contract for test_harness_asset_planning_v0.",
    "Synthetic scenario facts specifying one physical fixture need, one simulation harness need, one planning blocker, and one owner follow-up item."
  ],
  "gaps": [
    "Physical and simulated interface specifications, ranges, protocols, tolerances, and acceptance criteria are missing.",
    "Fixture design details, simulation model inputs, instrumentation requirements, resource availability, and readiness evidence are not provided."
  ],
  "downstream_handoff": [
    "Owner should supply or authorize interface specifications and acceptance criteria before detailed asset planning proceeds.",
    "A downstream readiness review may evaluate the completed planning package, but this output does not execute tests or approve TRR."
  ],
  "boundary_review_note": [
    "No upstream artifact mutation or authority promotion is represented.",
    "All content remains synthetic, portable, public-safe, and limited to planning, readiness, blockers, and boundaries."
  ],
  "no_claims": [
    "No claim is made that any physical fixture, simulation harness, test, or simulation was built, configured, or executed.",
    "No claim is made of tool use, file edits, runtime paths, hidden evidence, measured results, verified readiness, or TRR approval."
  ]
}
