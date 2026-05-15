{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_low",
  "workflow_id": "simulator_policy_packet_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "simulator_policy_packet_v0_public_synthetic_blocked_and_authorized_runtime_mix",
  "public_safe": true,
  "packets": {
    "simulator_policy_packet": [
      {
        "id": "sim_policy_ngspice_001",
        "simulator": "ngspice",
        "status": "conditionally_authorized_for_syntax_smoke",
        "basis": "trusted synthetic runtime probe summary available and owner authorization permits ngspice syntax smoke after trusted local probe",
        "allowed_use": "pre-run policy and readiness gating only",
        "owner_action": "confirm intended ngspice syntax smoke scope before any real execution outside this packet",
        "downstream_impact": "ngspice may proceed only as a readiness-gated syntax smoke candidate when local trusted probe evidence is available",
        "not_claimed": "no simulator execution, approval, source truth, or pass/fail result is claimed"
      },
      {
        "id": "sim_policy_ltspice_001",
        "simulator": "ltspice",
        "status": "blocked_pending_probe_evidence",
        "basis": "fixture reports no trusted runtime evidence and authorization withholds ltspice until probe evidence exists",
        "allowed_use": "pre-run policy and readiness gating only",
        "owner_action": "provide trusted local runtime probe evidence before authorization can be reviewed",
        "downstream_impact": "ltspice execution and readiness claims remain blocked",
        "not_claimed": "no ltspice execution, approval, source truth, or pass/fail result is claimed"
      },
      {
        "id": "sim_policy_xyce_001",
        "simulator": "xyce",
        "status": "blocked_pending_probe",
        "basis": "fixture reports xyce not probed and authorization withholds xyce until probe evidence exists",
        "allowed_use": "pre-run policy and readiness gating only",
        "owner_action": "perform or provide trusted local xyce runtime probe evidence",
        "downstream_impact": "xyce execution and readiness claims remain blocked",
        "not_claimed": "no xyce execution, approval, source truth, or pass/fail result is claimed"
      }
    ],
    "runtime_probe_summary": [
      {
        "id": "runtime_probe_ngspice_001",
        "simulator": "ngspice",
        "status": "trusted_probe_evidence_available",
        "provenance": "public_fixture_probe_ngspice_version_summary",
        "version_summary": "42.x synthetic summary",
        "path_included": false,
        "owner_action": "retain probe provenance with downstream readiness packet",
        "downstream_impact": "supports conditional ngspice syntax smoke authorization boundary",
        "not_claimed": "runtime path, actual executable availability, execution result, and pass/fail are not claimed"
      },
      {
        "id": "runtime_probe_ltspice_001",
        "simulator": "ltspice",
        "status": "missing_trusted_runtime_evidence",
        "provenance": "public_fixture_probe_ltspice_missing",
        "path_included": false,
        "owner_action": "supply trusted local probe evidence",
        "downstream_impact": "blocks ltspice authorization",
        "not_claimed": "ltspice installation, executable path, execution result, and pass/fail are not claimed"
      },
      {
        "id": "runtime_probe_xyce_001",
        "simulator": "xyce",
        "status": "not_probed",
        "provenance": "public_fixture_probe_xyce_not_checked",
        "path_included": false,
        "owner_action": "run or provide trusted local probe evidence",
        "downstream_impact": "blocks xyce authorization",
        "not_claimed": "xyce installation, executable path, execution result, and pass/fail are not claimed"
      }
    ],
    "execution_authorization_state": [
      {
        "id": "exec_auth_ngspice_001",
        "simulator": "ngspice",
        "status": "syntax_smoke_allowed_after_trusted_local_probe",
        "basis": "owner_authorization permits ngspice syntax smoke after trusted local probe and fixture includes trusted ngspice probe evidence",
        "owner_action": "limit any future action to syntax smoke readiness scope unless separately authorized",
        "downstream_impact": "eligible for next gated readiness handoff",
        "not_claimed": "authorization is not execution, approval, final validation, or source-truth confirmation"
      },
      {
        "id": "exec_auth_ltspice_001",
        "simulator": "ltspice",
        "status": "not_authorized",
        "basis": "no trusted runtime evidence",
        "owner_action": "provide trusted probe evidence and review authorization again",
        "downstream_impact": "downstream ltspice execution paths remain blocked",
        "not_claimed": "no execution permission or readiness result is claimed"
      },
      {
        "id": "exec_auth_xyce_001",
        "simulator": "xyce",
        "status": "not_authorized",
        "basis": "runtime not probed",
        "owner_action": "provide trusted probe evidence and review authorization again",
        "downstream_impact": "downstream xyce execution paths remain blocked",
        "not_claimed": "no execution permission or readiness result is claimed"
      }
    ],
    "runtime_blockers": [
      {
        "id": "blocker_ltspice_probe_001",
        "status": "open",
        "basis": "ltspice has no trusted runtime evidence",
        "owner_action": "acquire or provide trusted local ltspice probe evidence",
        "downstream_impact": "ltspice authorization and execution-readiness handoff blocked",
        "not_claimed": "no local acquisition or verification was performed"
      },
      {
        "id": "blocker_xyce_probe_001",
        "status": "open",
        "basis": "xyce was not probed",
        "owner_action": "acquire or provide trusted local xyce probe evidence",
        "downstream_impact": "xyce authorization and execution-readiness handoff blocked",
        "not_claimed": "no local acquisition or verification was performed"
      },
      {
        "id": "blocker_ltspice_model_source_001",
        "status": "review_required",
        "basis": "source packet summary states U1 ltspice candidate official source identified but not locally acquired",
        "owner_action": "owner must acquire and provide the official source packet if needed for later readiness work",
        "downstream_impact": "model-backed ltspice readiness cannot claim source completeness",
        "not_claimed": "official source content, correctness, and acquisition are not claimed"
      },
      {
        "id": "blocker_sparameter_owner_file_001",
        "status": "owner_input_required",
        "basis": "source packet summary states J1 s_parameter owner file needed",
        "owner_action": "owner must provide the required s-parameter file",
        "downstream_impact": "s-parameter dependent simulation readiness remains blocked",
        "not_claimed": "file existence, content, provenance, and validity are not claimed"
      }
    ],
    "boundary_review_note": [
      {
        "id": "boundary_review_001",
        "status": "public_safe_contract_only",
        "basis": "packet uses only provided synthetic fixture and workflow contract summary",
        "owner_action": "review blocked states and provide missing probe or source inputs before any broader workflow step",
        "downstream_impact": "handoff may carry policy packet and blockers but must not treat them as execution results",
        "not_claimed": "repository files, private material, raw truth, secrets, command execution, approval, and pass/fail results are not claimed"
      }
    ]
  },
  "downstream_handoff": [
    {
      "id": "handoff_ngspice_001",
      "target": "ngspice_readiness_gate",
      "status": "ready_for_owner_review",
      "basis": "trusted synthetic ngspice probe evidence exists and scope allows syntax smoke after trusted local probe",
      "next_action": "owner reviews whether to proceed with a bounded syntax smoke outside this contract-only packet",
      "downstream_impact": "can inform a later execution-specific packet only after separate authorized action",
      "not_claimed": "this handoff is not an execution record or approval"
    },
    {
      "id": "handoff_blocked_runtimes_001",
      "target": "ltspice_xyce_probe_collection",
      "status": "blocked_pending_owner_input",
      "basis": "ltspice lacks trusted runtime evidence and xyce was not probed",
      "next_action": "owner supplies trusted runtime probe evidence",
      "downstream_impact": "authorization review cannot advance for ltspice or xyce until evidence exists",
      "not_claimed": "no probe was run or validated in this packet"
    },
    {
      "id": "handoff_source_inputs_001",
      "target": "model_source_packet_completion",
      "status": "blocked_pending_owner_input",
      "basis": "U1 ltspice source not locally acquired and J1 s-parameter owner file needed",
      "next_action": "owner provides required official source packet and owner file",
      "downstream_impact": "source-dependent readiness remains incomplete",
      "not_claimed": "source truth and model validity are not claimed"
    }
  ],
  "boundary_review_note": {
    "status": "boundary_preserved",
    "summary": "Generated only the required public-safe policy packets from the synthetic fixture and contract summary.",
    "read_only_upstream_boundaries": [
      "simulator_policy_scope",
      "runtime_probe_refs",
      "source_packet_summaries"
    ],
    "not_claimed": [
      "repository access",
      "command execution",
      "private/raw/secret material use",
      "simulator execution",
      "workflow approval",
      "source-truth validation",
      "pass/fail result"
    ]
  },
  "completion_state": {
    "status": "quality_ready_packet_complete",
    "required_outputs_present": true,
    "execution_claim": false,
    "approval_claim": false,
    "source_truth_claim": false,
    "pass_fail_claim": false,
    "remaining_review_required": [
      "owner review for ngspice bounded syntax smoke scope",
      "trusted ltspice runtime probe evidence",
      "trusted xyce runtime probe evidence",
      "official U1 ltspice source acquisition",
      "owner-provided J1 s-parameter file"
    ]
  }
}