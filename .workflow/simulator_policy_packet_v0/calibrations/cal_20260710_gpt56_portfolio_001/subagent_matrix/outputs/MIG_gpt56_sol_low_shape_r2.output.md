{
  "candidate_id": "MIG_gpt56_sol_low_shape_r2",
  "workflow_id": "simulator_policy_packet_v0",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "simulator_policy_packet_v0_public_synthetic_blocked_and_authorized_runtime_mix",
  "public_safe": true,
  "packets": {
    "simulator_policy_packet": [
      {
        "id": "policy-ngspice-001",
        "simulator": "ngspice",
        "status": "conditionally_authorized",
        "allowed_use": "pre-run policy and readiness gating only",
        "authorized_activity": "syntax smoke after trusted local probe",
        "basis": [
          "owner authorization permits ngspice syntax smoke after trusted local probe",
          "trusted synthetic runtime probe evidence is available"
        ],
        "provenance": {
          "source_mode": "contract_only_synthetic",
          "probe_ref": "public_fixture_probe_ngspice_version_summary",
          "probe_result": "probe_evidence_available",
          "version": "42.x synthetic summary",
          "path_included": false
        },
        "owner_action": "Confirm that any intended syntax smoke remains within the stated pre-run scope.",
        "next_action": "Prepare a syntax-smoke handoff without claiming that execution occurred.",
        "downstream_impact": "The downstream executor may consider an ngspice syntax smoke within owner-authorized scope.",
        "not_claimed": [
          "No simulator command was executed.",
          "No syntax-smoke result is claimed.",
          "No model correctness, convergence, approval, or source truth is claimed."
        ]
      },
      {
        "id": "policy-ltspice-001",
        "simulator": "ltspice",
        "status": "blocked",
        "allowed_use": "pre-run policy and readiness gating only",
        "authorized_activity": "none until trusted probe evidence exists",
        "basis": [
          "owner authorization withholds ltspice execution until probe evidence exists",
          "no trusted runtime evidence is available",
          "the identified candidate official source for U1 has not been locally acquired"
        ],
        "provenance": {
          "source_mode": "contract_only_synthetic",
          "probe_ref": "public_fixture_probe_ltspice_missing",
          "probe_result": "no_trusted_runtime_evidence",
          "path_included": false,
          "source_summary": {
            "component": "U1",
            "model_family": "ltspice",
            "state": "candidate_official_source_identified_not_locally_acquired"
          }
        },
        "owner_action": "Provide or authorize acquisition of trusted local runtime-probe evidence and the required official U1 source.",
        "next_action": "Keep ltspice execution disabled pending trusted evidence review.",
        "downstream_impact": "No ltspice run or syntax-smoke handoff is authorized.",
        "not_claimed": [
          "The candidate official source was not acquired or verified.",
          "No runtime availability or execution result is claimed.",
          "No approval or source truth is claimed."
        ]
      },
      {
        "id": "policy-xyce-001",
        "simulator": "xyce",
        "status": "blocked",
        "allowed_use": "pre-run policy and readiness gating only",
        "authorized_activity": "none until trusted probe evidence exists",
        "basis": [
          "owner authorization withholds xyce execution until probe evidence exists",
          "the runtime has not been probed"
        ],
        "provenance": {
          "source_mode": "contract_only_synthetic",
          "probe_ref": "public_fixture_probe_xyce_not_checked",
          "probe_result": "not_probed",
          "path_included": false
        },
        "owner_action": "Authorize and obtain a trusted local Xyce runtime probe.",
        "next_action": "Keep Xyce execution disabled until probe evidence is reviewed.",
        "downstream_impact": "No Xyce run or syntax-smoke handoff is authorized.",
        "not_claimed": [
          "Runtime absence is not inferred from the missing probe.",
          "No execution result, approval, or source truth is claimed."
        ]
      },
      {
        "id": "policy-shared-model-input-001",
        "simulator": "shared",
        "status": "blocked_input",
        "allowed_use": "input-readiness assessment only",
        "authorized_activity": "none involving the missing J1 owner file",
        "basis": [
          "the s-parameter source summary states that an owner file is needed"
        ],
        "provenance": {
          "source_mode": "contract_only_synthetic",
          "source_summary": {
            "component": "J1",
            "model_family": "s_parameter",
            "state": "owner_file_needed"
          }
        },
        "owner_action": "Provide the J1 s-parameter file with provenance and permitted-use information.",
        "next_action": "Validate the supplied file before any simulator-specific preparation.",
        "downstream_impact": "Any downstream activity requiring the J1 model remains blocked.",
        "not_claimed": [
          "No J1 model file was received, inspected, or validated.",
          "No model suitability, approval, or source truth is claimed."
        ]
      }
    ],
    "runtime_probe_summary": [
      {
        "id": "probe-summary-ngspice-001",
        "simulator": "ngspice",
        "status": "trusted_evidence_available",
        "provenance": {
          "probe_ref": "public_fixture_probe_ngspice_version_summary",
          "result": "probe_evidence_available",
          "version": "42.x synthetic summary",
          "trusted": true,
          "path_included": false
        },
        "owner_action": "Retain the trusted probe reference with any downstream syntax-smoke request.",
        "next_action": "Use the evidence only for the bounded authorization decision.",
        "downstream_impact": "Supports conditional authorization for an ngspice syntax smoke.",
        "not_claimed": [
          "No executable path is disclosed or validated.",
          "No command execution or smoke-test outcome is claimed."
        ]
      },
      {
        "id": "probe-summary-ltspice-001",
        "simulator": "ltspice",
        "status": "missing_trusted_evidence",
        "provenance": {
          "probe_ref": "public_fixture_probe_ltspice_missing",
          "result": "no_trusted_runtime_evidence",
          "trusted": false,
          "path_included": false
        },
        "owner_action": "Obtain trusted local runtime evidence.",
        "next_action": "Reassess authorization after evidence is supplied.",
        "downstream_impact": "ltspice execution remains blocked.",
        "not_claimed": [
          "The runtime is not claimed to be installed or absent.",
          "No execution or approval is claimed."
        ]
      },
      {
        "id": "probe-summary-xyce-001",
        "simulator": "xyce",
        "status": "not_probed",
        "provenance": {
          "probe_ref": "public_fixture_probe_xyce_not_checked",
          "result": "not_probed",
          "trusted": false,
          "path_included": false
        },
        "owner_action": "Authorize and collect a trusted local runtime probe.",
        "next_action": "Reassess authorization after evidence is supplied.",
        "downstream_impact": "Xyce execution remains blocked.",
        "not_claimed": [
          "Missing evidence is not evidence of runtime absence.",
          "No execution or approval is claimed."
        ]
      }
    ],
    "execution_authorization_state": [
      {
        "id": "auth-state-ngspice-001",
        "simulator": "ngspice",
        "status": "authorized_with_conditions",
        "authorized_scope": "syntax smoke only, after trusted local probe",
        "basis": "Explicit owner authorization plus trusted probe evidence in the synthetic fixture.",
        "owner_action": "Confirm the requested activity is limited to syntax smoke.",
        "next_action": "Hand off to an authorized executor if the owner elects to proceed.",
        "downstream_impact": "Permits consideration of bounded execution but does not record execution.",
        "not_claimed": [
          "No execution occurred.",
          "No successful result or approval is claimed."
        ]
      },
      {
        "id": "auth-state-ltspice-001",
        "simulator": "ltspice",
        "status": "not_authorized",
        "authorized_scope": "none",
        "basis": "Trusted runtime-probe evidence is missing.",
        "owner_action": "Supply trusted probe evidence and resolve the missing U1 official source.",
        "next_action": "Maintain the execution block.",
        "downstream_impact": "Downstream executors must not run ltspice under this packet.",
        "not_claimed": [
          "No judgment is made about future authorization.",
          "No execution, approval, or source truth is claimed."
        ]
      },
      {
        "id": "auth-state-xyce-001",
        "simulator": "xyce",
        "status": "not_authorized",
        "authorized_scope": "none",
        "basis": "No trusted runtime probe has been performed.",
        "owner_action": "Authorize and provide trusted probe evidence.",
        "next_action": "Maintain the execution block.",
        "downstream_impact": "Downstream executors must not run Xyce under this packet.",
        "not_claimed": [
          "No judgment is made about future authorization.",
          "No execution, approval, or source truth is claimed."
        ]
      }
    ],
    "runtime_blockers": [
      {
        "id": "blocker-ltspice-runtime-001",
        "simulator": "ltspice",
        "status": "open",
        "blocker": "No trusted runtime evidence.",
        "basis": "public_fixture_probe_ltspice_missing",
        "owner_action": "Obtain a trusted local runtime probe.",
        "next_action": "Review the evidence before changing authorization.",
        "downstream_impact": "Blocks all ltspice execution.",
        "not_claimed": [
          "Runtime absence is not claimed."
        ]
      },
      {
        "id": "blocker-ltspice-source-001",
        "simulator": "ltspice",
        "status": "open",
        "blocker": "The candidate official U1 source has not been locally acquired.",
        "basis": "Synthetic source summary for component U1.",
        "owner_action": "Provide or authorize acquisition of the official source with provenance.",
        "next_action": "Validate the acquired source before use.",
        "downstream_impact": "Blocks source-backed preparation involving U1.",
        "not_claimed": [
          "The source's identity, contents, and suitability were not verified."
        ]
      },
      {
        "id": "blocker-xyce-runtime-001",
        "simulator": "xyce",
        "status": "open",
        "blocker": "Runtime probe not performed.",
        "basis": "public_fixture_probe_xyce_not_checked",
        "owner_action": "Authorize and obtain a trusted local probe.",
        "next_action": "Review the evidence before changing authorization.",
        "downstream_impact": "Blocks all Xyce execution.",
        "not_claimed": [
          "Runtime absence is not claimed."
        ]
      },
      {
        "id": "blocker-shared-j1-source-001",
        "simulator": "shared",
        "status": "open",
        "blocker": "Owner-provided J1 s-parameter file is missing.",
        "basis": "Synthetic source summary for component J1.",
        "owner_action": "Provide the file with provenance and permitted-use information.",
        "next_action": "Validate format, provenance, and intended simulator compatibility.",
        "downstream_impact": "Blocks downstream preparation requiring the J1 s-parameter model.",
        "not_claimed": [
          "No file was received or validated.",
          "No compatibility or source truth is claimed."
        ]
      }
    ],
    "boundary_review_note": [
      {
        "id": "boundary-review-001",
        "status": "review_required",
        "basis": {
          "public_safe": true,
          "source_mode": "contract_only_synthetic",
          "upstream_treatment": "read_only",
          "path_material_included": false
        },
        "owner_action": "Review authorization boundaries and provide the missing evidence or files before expanding scope.",
        "next_action": "Preserve the execution blocks and route only the conditionally authorized ngspice syntax-smoke request to an authorized executor.",
        "downstream_impact": "Prevents policy-packet completion from being interpreted as simulator execution, approval, or source validation.",
        "not_claimed": [
          "No repository, private, raw, secret, or local-path material was accessed.",
          "No commands or simulations were executed.",
          "No owner approval, source truth, validation result, or workflow pass/fail result is claimed."
        ]
      }
    ]
  },
  "downstream_handoff": {
    "id": "handoff-simulator-policy-001",
    "status": "ready_with_blocks",
    "authorized_lane": {
      "simulator": "ngspice",
      "scope": "syntax smoke only",
      "conditions": [
        "Use the trusted local probe evidence referenced by public_fixture_probe_ngspice_version_summary.",
        "Remain within pre-run policy and readiness gating.",
        "Record actual execution and results separately if an authorized executor proceeds."
      ]
    },
    "blocked_lanes": [
      {
        "simulator": "ltspice",
        "reason": "Missing trusted runtime evidence and locally acquired official U1 source."
      },
      {
        "simulator": "xyce",
        "reason": "Trusted runtime probe not performed."
      },
      {
        "simulator": "shared",
        "reason": "Owner-provided J1 s-parameter file is missing."
      }
    ],
    "owner_actions": [
      "Confirm whether to proceed with the bounded ngspice syntax smoke.",
      "Provide trusted ltspice and Xyce runtime-probe evidence.",
      "Provide or authorize acquisition of the official U1 source.",
      "Provide the J1 s-parameter file with provenance and permitted-use information."
    ],
    "not_claimed": [
      "This handoff does not authorize activities beyond the stated owner authorization.",
      "It does not record execution, approval, source truth, or pass/fail."
    ]
  },
  "boundary_review_note": {
    "id": "top-boundary-review-001",
    "status": "explicit_boundaries_preserved",
    "provenance_summary": "Derived solely from the supplied public-safe workflow summary and synthetic fixture.",
    "read_only_upstream": true,
    "execution_performed": false,
    "approval_claimed": false,
    "source_truth_claimed": false,
    "pass_fail_claimed": false,
    "review_required": true,
    "review_focus": [
      "Confirm the ngspice request remains a syntax smoke.",
      "Do not authorize ltspice or Xyce until trusted probe evidence exists.",
      "Do not treat identified or owner-needed source summaries as acquired or validated models."
    ]
  },
  "completion_state": {
    "status": "quality_ready_packet_complete",
    "required_outputs_present": true,
    "quality_ready": true,
    "execution_complete": false,
    "approval_complete": false,
    "source_truth_established": false,
    "workflow_pass_fail_determined": false,
    "open_blockers": true,
    "summary": "All required policy-packet outputs are populated for review and downstream gating; ngspice is conditionally authorized for syntax smoke, while ltspice, Xyce, and missing source-dependent activities remain blocked."
  }
}
