You are calibrating the Soulforge workflow "post_development_review_gate_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "post_development_review_gate_v0",
  "candidate_label": "gpt-5.5|low|dwarf|auditor",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "low", "species": "dwarf", "class": "auditor" },
  "outputs": {
  "post_development_review_packet": "...",
  "validation_log": "...",
  "boundary_review_note": "...",
  "judge_decision_note": "...",
  "bv_gate_handoff": "...",
  "supervisor_decision": "...",
  "followup_register": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Post-development Review Gate v0
- summary: Route every bounded Soulforge development result through a risk-tiered closing review so deterministic validation, boundary inspection, value judgment, and optional B/V verification are recorded before a change is accepted, revised, blocked, or escalated to the owner.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- builder_report
- changed_file_refs
- validation_command_refs
- output_state
- applicable_owner_contract_refs
- expected output groups:
  - post_development_review_packet
  - validation_log
  - boundary_review_note
  - judge_decision_note
  - bv_gate_handoff
  - supervisor_decision
  - followup_register
- must preserve:
- validation
- boundary
- judge
- supervisor
- knowledge trigger
- workflow notes:
- This is a generic closing gate for Soulforge development work, not a replacement for specialist validators or domain workflows.
- Public workflow canon stores only portable routing rules and packet templates. Applied packets belong in `_workmeta/<project_code>/` or `_workmeta/system/`.
- Level 3 means escalation to a full B/V gate when the claim requires fresh executor and separate verifier evidence; this package can record the handoff but does not make missing B/V evidence true.
- Every bounded close should record `knowledge_trigger_check` as `no_trigger`, `metadata_only_record`, `sourcebound_review_candidate`, or `owner_decision_needed`; this is a candidate signal only, not source truth or canon authority.

Synthetic scenario facts:
- one validation command passed
- one boundary finding is clean
- one level-2 judge decision is needed
- one knowledge trigger result is metadata_only_record

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
