{
  "workflow_id": "test_harness_asset_planning_v0",
  "candidate_label": "gpt-5.5|xhigh|human|auditor",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
    "species": "human",
    "class": "auditor"
  },
  "outputs": {
    "test_harness_manifest": "Planning-only manifest for a composed harness candidate: one physical fixture asset, one simulation harness asset, interface mapping, instrumentation needs, TRR checklist inputs, blocker tracking, and owner follow-up tracking. No test execution, simulation execution, TRR approval, or upstream mutation is included.",
    "test_interface_list": "Interfaces to plan: module-to-physical-fixture mechanical alignment, power input, signal I/O, configuration input, observation output, and module-to-simulation-harness stimulus/response exchange. Interface readiness remains unapproved until reviewed by the owner.",
    "simulation_fixture_needs": "One simulation harness need: a synthetic, parameterized software harness template for replaying planned module input/output cases and collecting planned readiness observations. This is a fixture need only, with no simulation run claimed.",
    "instrumentation_resource_list": "Planned instrumentation resources: power measurement, signal capture, configuration/state logging, fixture identification, and result-observation recording. Calibration status, ownership, and availability remain to be confirmed before TRR.",
    "trr_readiness_checklist": "Checklist items: physical fixture identified, simulation harness need identified, interfaces listed, instrumentation listed, planning blocker recorded, owner follow-up recorded, boundary note attached, and explicit no-execution posture preserved. This checklist supports readiness review preparation only and does not approve TRR.",
    "planning_blockers": "One planning blocker: fixture acceptance criteria are not defined tightly enough to confirm whether the physical fixture and simulation harness cover the intended verification scope.",
    "owner_followup_needed": "One owner follow-up item: owner must confirm acceptance criteria and scope boundaries for the physical fixture and simulation harness before readiness can be assessed.",
    "boundary_review_note": "Public-safe synthetic calibration only. The plan uses the supplied contract and synthetic scenario facts, does not rely on private evidence, does not mutate upstream artifacts, and does not claim execution or approval authority."
  },
  "provenance": [
    "Public-safe synthetic workflow contract supplied for test_harness_asset_planning_v0",
    "Synthetic scenario facts: one physical fixture need, one simulation harness need, one planning blocker, and one owner follow-up item"
  ],
  "gaps": [
    "No concrete module identity, fixture specification, acceptance threshold, or verification reference detail is available in the synthetic contract",
    "No owner-confirmed TRR criteria or instrument calibration status is available"
  ],
  "downstream_handoff": [
    "Route the manifest, interface list, fixture needs, instrumentation list, blocker, and owner follow-up item to the readiness owner for review",
    "Keep downstream use at planning and readiness-preparation level until acceptance criteria and boundaries are owner-confirmed"
  ],
  "boundary_review_note": [
    "Planning-only output; no tests, simulations, file edits, tool use, runtime paths, hidden references, or private/raw evidence are claimed",
    "No upstream artifact mutation, canon promotion, TRR approval, or stronger authority than the supplied synthetic contract is asserted"
  ],
  "no_claims": [
    "No execution, simulation, validation pass, TRR approval, or readiness approval is claimed",
    "No hidden evidence, private source, runtime artifact, file change, or tool-derived result is claimed"
  ]
}
