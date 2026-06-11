Candidate profile:

- candidate_id: E_gpt55_xhigh_dwarf_auditor
- model: gpt-5.5
- reasoning_effort: xhigh
- species: dwarf
- class: auditor

Task:

Produce a public-safe synthetic output for `se_assistant_operating_loop_v0`.
Do not run commands, read files, browse, inspect private data, or claim any
actual workflow execution. Work only from the fixture and workflow excerpt in
this prompt. Return one compact JSON object and no markdown fence.

Required top-level JSON keys:

- `profile_metadata`
- `boundary_classification_note`
- `se_assistant_route_packet`
- `owner_input_and_decision_queue`
- `operating_loop_route_map`
- `owner_review_closeout_note`
- `boundary_review_note`
- `completion_state`

Fixture:

The owner asks the SE assistant to triage a synthetic project start. They want
the safe route, owner questions, and next actions. They have not supplied a
project code, mission id, project-local run ref, approved source refs, accepted
review gate packet, or accepted verification result. They ask whether the work
can be called review-ready. They mention target stage `SYN-SRR`, request an
optional foldertree scaffold, ask about reusable SE template materials, want
source/knowledge intake if safe, want a readiness digest if bounded refs exist,
and want owner closeout. Public-safe package only; no private payloads, secrets,
host absolute paths, `_workspaces` content, or actual payload storage under
`_workmeta`.

Workflow excerpt:

- Owns request boundary classification, route packet shape, scaffold route
  decision, stage scan request bundle, document artifact library route bundle,
  source or knowledge route bundle, owner input and decision queue, readiness
  digest request, closeout review request, and boundary review note shape.
- Does not own source truth, engineering fact invention, design authority,
  library authority, artifact body authoring by default, project file
  relocation, owner decision creation, review gate approval, verification
  acceptance, stage clearance approval, public canon promotion, project-local
  payload storage, or actual payload storage under `_workmeta`.
- Required downstream workflows: `se_stage_artifact_gap_scan_v0`,
  `project_readiness_digest_v0`, `owner_decision_packet_v0`,
  `post_development_review_gate_v0`.
- Optional downstream workflows: `knowledge_wiki_pipeline_v0`,
  `source_gap_followup_packet_v0`, `source_packet_sufficiency_review_v0`,
  `review_gate_evidence_pack_v0`.
- Optional skill route: `se_foldertree_generate`, authority `scaffold_only`.
- Boundary rules: public-safe orchestration only; missing truth routes to gap or
  owner queue; project latest authoring files stay project-local; `_workmeta`
  stores metadata pointers only, no actual payloads; sourcebound work requires a
  source workflow; review claims require a review workflow; verification claims
  require accepted result or verification workflow; no runtime absolute paths or
  private payload copy in reusable package.

Output expectations:

- Keep `claim_ceiling` at `observed`.
- Route scaffold as optional/pending or blocked until owner supplies project
  binding and supported scaffold inputs.
- Route `SYN-SRR` stage work to gap-scan preparation only.
- Route missing source refs to source-gap or owner input, not source truth.
- Hold review-ready or verification-complete wording.
- Include owner questions, blocked routes, next action recommendations, and
  explicit non-claims.
