# systems_engineering_cell

`systems_engineering_cell` is the reusable party/loadout for Soulforge
systems-engineering assistant requests.

It exists to keep the owner from re-explaining the full SE workflow family every
time a project needs scaffold, stage-gap scan, source intake, readiness digest,
owner decision capture, or review closeout support.

## What It Owns

- The default SE assistant entry workflow.
- The allowed active workflow spine for SE support.
- Chain-level routing hints and member-slot display.
- Public-safe awareness that a registered private lookup candidate may be used
  as a route hint for official-source and reference-example checks.

## What It Does Not Own

- Design authority.
- Source truth.
- Review approval.
- Verification acceptance.
- Public/private promotion.
- Workflow-local optimized model, reasoning, species, class, or unit choices.
- Project-local run truth or raw project payloads.

## Current Boundary

The party is a registered loadout, not unattended automation. It may route a
bounded request into the SE assistant operating loop, but each downstream
workflow keeps its own claim ceiling and evidence requirements.

## Reference Lookup Route Candidate

For SE questions that need source backing or artifact-form clues, the party may
first check party-declared `reference_lookup_route_candidates`.

Current route candidate:

- `se_authority_example_bridge_agentic_lookup_v0`

Its current posture is `pilot_executed_private_candidate`. It can suggest that
the assistant should look for an official source pack and a registered
reference-example lookup before answering. It is not public canon,
production-ready, official artifact authority, or proof that a reference example
project is authoritative.

If official/customer authority, source scope, review scope, or owner approval is
still missing, route the request to `source_gap_followup_packet_v0`,
`source_packet_sufficiency_review_v0`, `page_module_trace_matrix_v0`, or
`owner_decision_packet_v0` instead of inventing the missing truth.

If a request asks whether a source, form, result, review, action item, or
verification state is official, current, approved, closed, or accepted, treat
the reference lookup as a routing hint only. Use source acquisition, sufficiency
review, review/action closure, or accepted-result workflows before making any
stronger claim.

`page_module_trace_matrix_v0` is available as an optional trace-governance route
after the private `requirements_traceability_set` pilot. Use it to preserve
missing evidence rows, review-only field-shape rows, and downstream
review/verification seed rows. Do not use it to claim final requirements truth,
accepted RTM rows, review approval, or verification completion.

The `requirements_traceability_set` and `quality_qgate_forms` routes have private
pilot evidence. The next useful route strengthening is current-source
acquisition and claim-specific evidence review, not promoting examples as
authority.

`se_cross_stage_mapping_governance_v0` is now available as an optional
governance route after private pilot review. Use it to aggregate artifact-family
coverage, claim ceilings, source gaps, owner-decision needs, and downstream
rerun routes across stages. Do not use it as source truth, stage readiness,
review approval, verification acceptance, or official artifact authority.

Future workflow ids such as `se_artifact_authoring_support_v0` remain excluded
until their registration and pilot posture is resolved.
