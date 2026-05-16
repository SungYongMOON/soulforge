{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_xhigh",
  "workflow_id": "simulator_policy_packet_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "simulator_policy_packet_v0_public_synthetic_blocked_and_authorized_runtime_mix",
  "public_safe": true,
  "packets": {
    "simulator_policy_packet": [
      {
        "id": "sim_policy_001",
        "status": "prepared_from_contract_only_synthetic_fixture",
        "target_simulators": [
          "ngspice",
          "ltspice",
          "xyce"
        ],
        "allowed_use": "pre-run policy and readiness gating only",
        "provenance": "synthetic fixture: simulator_policy_scope",
        "owner_action": "Use this packet only as readiness policy input; do not treat it as execution evidence.",
        "downstream_impact": "Downstream simulator runs must honor per-simulator authorization states and blockers.",
        "not_claimed": [
          "execution_performed",
          "approval_granted",
          "source_truth_verified",
          "runtime_paths_known"
        ]
      }
    ],
    "runtime_probe_summary": [
      {
        "id": "runtime_probe_ngspice_001",
        "simulator": "ngspice",
        "status": "trusted_probe_evidence_available",
        "basis": "public_fixture_probe_ngspice_version_summary; version 42.x synthetic summary; path not included",
        "owner_action": "Owner may use trusted local probe evidence before any ngspice syntax smoke.",
        "downstream_impact": "ngspice is the only simulator with evidence supporting limited readiness progression.",
        "not_claimed": [
          "ngspice_executed_by_candidate",
          "ngspice_path_verified",
          "full_model_compatibility_verified"
        ]
      },
      {
        "id": "runtime_probe_ltspice_001",
        "simulator": "ltspice",
        "status": "blocked_no_trusted_runtime_evidence",
        "basis": "public_fixture_probe_ltspice_missing; untrusted; path not included",
        "owner_action": "Owner must provide trusted local probe evidence before ltspice authorization.",
        "downstream_impact": "ltspice execution remains blocked.",
        "not_claimed": [
          "ltspice_available",
          "ltspice_executed",
          "ltspice_path_verified"
        ]
      },
      {
        "id": "runtime_probe_xyce_001",
        "simulator": "xyce",
        "status": "blocked_not_probed",
        "basis": "public_fixture_probe_xyce_not_checked; untrusted; path not included",
        "owner_action": "Owner must run or provide trusted xyce probe evidence before authorization.",
        "downstream_impact": "xyce execution remains blocked.",
        "not_claimed": [
          "xyce_available",
          "xyce_executed",
          "xyce_path_verified"
        ]
      }
    ],
    "execution_authorization_state": [
      {
        "id": "exec_auth_ngspice_001",
        "simulator": "ngspice",
        "status": "limited_authorization_candidate",
        "authorized_scope": "syntax smoke only after trusted local probe evidence",
        "basis": "fixture states trusted ngspice probe evidence is available",
        "owner_action": "Owner may authorize ngspice syntax smoke in a trusted local environment.",
        "downstream_impact": "Only ngspice can move to limited syntax-smoke readiness; no full simulation authorization is implied.",
        "not_claimed": [
          "syntax_smoke_executed",
          "simulation_success",
          "approval_complete"
        ]
      },
      {
        "id": "exec_auth_ltspice_001",
        "simulator": "ltspice",
        "status": "not_authorized",
        "authorized_scope": "none",
        "basis": "no trusted runtime evidence",
        "owner_action": "Provide trusted probe evidence before any ltspice run decision.",
        "downstream_impact": "ltspice handoff must remain review-required and blocked.",
        "not_claimed": [
          "ltspice_authorized",
          "ltspice_executed"
        ]
      },
      {
        "id": "exec_auth_xyce_001",
        "simulator": "xyce",
        "status": "not_authorized",
        "authorized_scope": "none",
        "basis": "runtime not probed",
        "owner_action": "Provide trusted probe evidence before any xyce run decision.",
        "downstream_impact": "xyce handoff must remain review-required and blocked.",
        "not_claimed": [
          "xyce_authorized",
          "xyce_executed"
        ]
      }
    ],
    "runtime_blockers": [
      {
        "id": "blocker_ltspice_runtime_001",
        "status": "blocking",
        "subject": "ltspice runtime evidence",
        "basis": "fixture runtime_probe_refs reports no_trusted_runtime_evidence",
        "owner_action": "Acquire or provide trusted local ltspice probe evidence.",
        "downstream_impact": "ltspice execution and compatibility checks cannot proceed.",
        "not_claimed": [
          "runtime_available",
          "path_available"
        ]
      },
      {
        "id": "blocker_xyce_runtime_001",
        "status": "blocking",
        "subject": "xyce runtime evidence",
        "basis": "fixture runtime_probe_refs reports not_probed",
        "owner_action": "Run or provide trusted xyce probe evidence.",
        "downstream_impact": "xyce execution and compatibility checks cannot proceed.",
        "not_claimed": [
          "runtime_available",
          "path_available"
        ]
      },
      {
        "id": "blocker_ltspice_source_001",
        "status": "review_required",
        "subject": "U1 ltspice model source",
        "basis": "source_packet_summaries: candidate official source identified but not locally acquired",
        "owner_action": "Owner must acquire and approve the official local source before model use.",
        "downstream_impact": "U1 ltspice model integration remains source-blocked.",
        "not_claimed": [
          "official_source_acquired",
          "model_verified"
        ]
      },
      {
        "id": "blocker_sparameter_source_001",
        "status": "owner_input_required",
        "subject": "J1 s-parameter owner file",
        "basis": "source_packet_summaries: owner_file_needed",
        "owner_action": "Owner must provide the required J1 s-parameter file.",
        "downstream_impact": "J1 s-parameter simulation readiness remains blocked.",
        "not_claimed": [
          "owner_file_received",
          "s_parameter_verified"
        ]
      }
    ],
    "boundary_review_note": [
      {
        "id": "boundary_review_001",
        "status": "public_safe_contract_only",
        "basis": "synthetic public fixture and workflow contract summary only",
        "owner_action": "Review this as a policy packet, not as execution evidence.",
        "downstream_impact": "Downstream consumers must preserve read-only upstream boundaries and request owner evidence for blocked inputs.",
        "not_claimed": [
          "repository_files_read",
          "commands_run",
          "private_material_used",
          "raw_truth_accessed",
          "secret_material_accessed",
          "workflow_approved",
          "pass_fail_result"
        ]
      }
    ]
  },
  "downstream_handoff": [
    {
      "id": "handoff_ngspice_001",
      "target": "ngspice_owner_or_executor",
      "status": "ready_for_owner_review_limited_syntax_smoke",
      "next_action": "Confirm trusted local probe context and decide whether to run syntax smoke.",
      "downstream_impact": "Can proceed only within limited pre-run readiness scope.",
      "not_claimed": [
        "run_completed",
        "approval_granted"
      ]
    },
    {
      "id": "handoff_blocked_simulators_001",
      "target": "ltspice_xyce_owner",
      "status": "blocked_pending_trusted_probe_evidence",
      "next_action": "Provide trusted runtime probe evidence and paths if execution is desired.",
      "downstream_impact": "No ltspice or xyce execution should be scheduled until evidence exists.",
      "not_claimed": [
        "runtime_verified",
        "execution_authorized"
      ]
    },
    {
      "id": "handoff_source_inputs_001",
      "target": "source_owner",
      "status": "blocked_pending_owner_source_inputs",
      "next_action": "Acquire U1 official ltspice source and provide J1 s-parameter owner file.",
      "downstream_impact": "Model readiness cannot be completed without owner-provided source material.",
      "not_claimed": [
        "sources_acquired",
        "sources_verified"
      ]
    }
  ],
  "boundary_review_note": {
    "id": "top_boundary_review_001",
    "status": "boundary_preserved",
    "public_safe": true,
    "basis": "contract_only_synthetic fixture supplied in prompt",
    "notes": [
      "No repository files were read.",
      "No commands were run.",
      "No private, raw, or secret material was used.",
      "This output is a policy/readiness packet only."
    ],
    "not_claimed": [
      "execution",
      "approval",
      "source_truth",
      "pass_fail_result"
    ]
  },
  "completion_state": {
    "id": "completion_state_001",
    "packet_quality_state": "complete_for_required_outputs_in_synthetic_fixture",
    "execution_state": "not_executed",
    "approval_state": "not_approved",
    "source_truth_state": "not_verified",
    "pass_fail_state": "not_claimed",
    "review_required": true,
    "basis": "All fixture.required_outputs are represented in packets with boundary and blocker notes."
  }
}