{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_medium",
  "workflow_id": "simulator_policy_packet_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "medium",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "simulator_policy_packet_v0_public_synthetic_blocked_and_authorized_runtime_mix",
  "public_safe": true,
  "packets": {
    "simulator_policy_packet": [
      {
        "id": "sim_policy_001",
        "status": "ready_for_policy_review",
        "basis": "contract_only_synthetic_fixture",
        "target_simulators": [
          "ngspice",
          "ltspice",
          "xyce"
        ],
        "allowed_use": "pre-run policy and readiness gating only",
        "owner_action": "review simulator-specific authorization before any runtime use",
        "downstream_impact": "permits readiness classification only; does not permit execution result claims",
        "not_claimed": [
          "runtime execution",
          "simulation approval",
          "source truth validation",
          "private or raw material inspection"
        ]
      }
    ],
    "runtime_probe_summary": [
      {
        "id": "probe_ngspice_001",
        "simulator": "ngspice",
        "status": "trusted_probe_evidence_available",
        "provenance": "public_fixture_probe_ngspice_version_summary",
        "basis": "42.x synthetic summary; path not included",
        "owner_action": "perform trusted local path probe before syntax smoke if required by owner policy",
        "downstream_impact": "ngspice may proceed only to syntax smoke readiness gate after trusted local probe",
        "not_claimed": [
          "ngspice execution completed",
          "full simulation readiness",
          "numerical result validity"
        ]
      },
      {
        "id": "probe_ltspice_001",
        "simulator": "ltspice",
        "status": "blocked_no_trusted_runtime_evidence",
        "provenance": "public_fixture_probe_ltspice_missing",
        "basis": "synthetic fixture marks trusted=false and result=no_trusted_runtime_evidence",
        "owner_action": "provide trusted runtime probe evidence before authorization",
        "downstream_impact": "ltspice execution and syntax checks remain blocked",
        "not_claimed": [
          "ltspice installed",
          "ltspice path known",
          "ltspice execution authorized"
        ]
      },
      {
        "id": "probe_xyce_001",
        "simulator": "xyce",
        "status": "blocked_not_probed",
        "provenance": "public_fixture_probe_xyce_not_checked",
        "basis": "synthetic fixture marks trusted=false and result=not_probed",
        "owner_action": "perform trusted runtime probe before any authorization decision",
        "downstream_impact": "xyce execution and syntax checks remain blocked",
        "not_claimed": [
          "xyce installed",
          "xyce path known",
          "xyce execution authorized"
        ]
      }
    ],
    "execution_authorization_state": [
      {
        "id": "auth_ngspice_001",
        "simulator": "ngspice",
        "status": "conditionally_authorized_for_syntax_smoke_after_trusted_local_probe",
        "basis": "owner_authorization allows ngspice syntax smoke after trusted local probe",
        "owner_action": "confirm trusted local probe and keep use limited to syntax smoke",
        "downstream_impact": "may enter syntax-smoke-only gate when local evidence exists",
        "not_claimed": [
          "simulation execution authorized",
          "policy approval complete",
          "source truth verified"
        ]
      },
      {
        "id": "auth_ltspice_001",
        "simulator": "ltspice",
        "status": "not_authorized",
        "basis": "owner_authorization blocks ltspice until probe evidence exists",
        "owner_action": "supply trusted ltspice probe evidence",
        "downstream_impact": "ltspice-dependent readiness remains review-required and blocked",
        "not_claimed": [
          "ltspice syntax smoke allowed",
          "ltspice runtime available"
        ]
      },
      {
        "id": "auth_xyce_001",
        "simulator": "xyce",
        "status": "not_authorized",
        "basis": "owner_authorization blocks xyce until probe evidence exists",
        "owner_action": "supply trusted xyce probe evidence",
        "downstream_impact": "xyce-dependent readiness remains review-required and blocked",
        "not_claimed": [
          "xyce syntax smoke allowed",
          "xyce runtime available"
        ]
      }
    ],
    "runtime_blockers": [
      {
        "id": "blocker_ltspice_probe_001",
        "status": "blocking",
        "basis": "no trusted ltspice runtime evidence",
        "owner_action": "provide trusted ltspice runtime probe",
        "downstream_impact": "ltspice policy gate cannot advance",
        "not_claimed": [
          "environment inspected",
          "runtime missing from actual machine"
        ]
      },
      {
        "id": "blocker_xyce_probe_001",
        "status": "blocking",
        "basis": "xyce not probed",
        "owner_action": "perform trusted xyce runtime probe",
        "downstream_impact": "xyce policy gate cannot advance",
        "not_claimed": [
          "environment inspected",
          "runtime missing from actual machine"
        ]
      },
      {
        "id": "blocker_ltspice_source_001",
        "status": "review_required",
        "basis": "source packet summary: U1 candidate official source identified but not locally acquired",
        "owner_action": "acquire and provide approved local official source packet for U1",
        "downstream_impact": "ltspice model readiness cannot be source-validated",
        "not_claimed": [
          "official source acquired",
          "model correctness verified"
        ]
      },
      {
        "id": "blocker_sparam_source_001",
        "status": "owner_input_required",
        "basis": "source packet summary: J1 s_parameter owner file needed",
        "owner_action": "provide owner-approved S-parameter file for J1",
        "downstream_impact": "S-parameter dependent simulation readiness remains blocked",
        "not_claimed": [
          "S-parameter file exists",
          "S-parameter file validated"
        ]
      }
    ],
    "boundary_review_note": [
      {
        "id": "boundary_note_001",
        "status": "public_safe_contract_only",
        "basis": "synthetic fixture only; repository, private, raw, and secret materials not used",
        "owner_action": "review packet before applying to any real project or runtime",
        "downstream_impact": "safe for public calibration comparison as a policy packet only",
        "not_claimed": [
          "repository execution",
          "workflow pass",
          "workflow failure",
          "approval",
          "source truth",
          "runtime truth"
        ]
      }
    ]
  },
  "downstream_handoff": [
    {
      "id": "handoff_policy_review_001",
      "status": "ready_for_owner_review",
      "basis": "required outputs populated from synthetic public fixture",
      "next_action": "owner reviews authorization states and blockers before any real runtime use",
      "downstream_impact": "can inform readiness gating but cannot substitute for trusted local probes or source packets",
      "not_claimed": [
        "execution performed",
        "approval granted",
        "real environment assessed"
      ]
    }
  ],
  "boundary_review_note": {
    "status": "boundary_preserved",
    "summary": "Output is limited to the synthetic public fixture and workflow contract summary. No repository files, commands, private data, raw data, secrets, runtime execution, approval, source truth, or pass/fail result is claimed.",
    "review_required": true
  },
  "completion_state": {
    "status": "quality_ready_packet_complete",
    "required_outputs_present": true,
    "execution_claim": false,
    "approval_claim": false,
    "source_truth_claim": false,
    "pass_fail_claim": false,
    "basis": "contract_only_synthetic_fixture"
  }
}