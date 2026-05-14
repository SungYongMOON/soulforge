# Simulation Source Collect v0

`simulation_source_collect_v0` is a public-safe, pre-deck workflow for collecting or indexing simulation model sources before any workflow prepares a simulation deck or runs/verifies a simulation.

It records what model evidence exists, what is missing, what is blocked, what is only review-only, and what later deck/run/harness workflows may safely consume. It does not invent models, convert models by assumption, create testbenches, run simulators, or claim waveform/pass-fail evidence.

## Inputs

- A bounded `model_need_scope` for components, pages, interfaces, or owner-defined simulation needs.
- An approved model-source policy that defines official sources, owner-approved local files, tool-library handling, simulator policy, and blocked-access handling.
- Optional source packets, component inventories, page module sidecars, quantitative enrichment packets, layout packets, harness priority packets, owner-approved local model manifests, and tool-library manifests.

## Outputs

- `simulation_source_packet`
- `model_inventory`
- `model_file_manifest`
- `demo_circuit_manifest`
- `simulator_compatibility_matrix`
- `missing_models`
- `access_blockers`
- `owner_followup_needed`
- `downstream_handoff`
- `boundary_review_note`

## Model And Source States

- Executor-approved states: `official_present`, `owner_approved_local`, and `tool_library_official`, only when terms, dependency, and scope evidence allow executor use.
- Review or gap states: `candidate_official`, `third_party_unapproved`, `missing`, `blocked`, `conflicting`, and `not_applicable`.
- Model families are explicit: `pspice`, `ltspice`, `generic_spice`, `ngspice`, `kicad_ngspice`, `simplis`, `spectre`, `verilog_a`, `verilog_ams`, `ibis`, `ibis_ami`, `s_parameter`, `demo_circuit`, `vendor_tool_package`, and `other`.

## Compatibility States

The compatibility matrix separates declared or tested evidence from conservative uncertainty:

- `declared_supported`, `declared_unsupported`, `syntax_check_passed`, and `import_failed`
- `likely_supported_unverified`, `requires_conversion`, `not_tested`, and `not_applicable`
- `blocked_by_license` and `blocked_by_missing_dependency`

Compatibility basis must be named as `vendor_declared`, `tool_library_metadata`, `owner_tested`, `agent_smoke_test`, `file_format_only`, or `unknown`. File extension or part name alone cannot mark a model deck-ready or run-ready.

## Downstream Contract

- `simulation_deck_prepare_v0` may use only executor-approved model files and demo circuits, and must write blocked deck output when required models, terms, dependencies, operating conditions, or simulator policy are missing.
- `simulation_run_verify_v0` may treat compatibility smoke tests as setup evidence only; this workflow does not produce runnable-deck or waveform results.
- `page_quantitative_enrichment_v0` may cite model collateral only when it contains source-supported numeric constraints; it must not extract behavioral quantities from unrun models.
- `xml_harness_composition_v0` and future harness-strengthening workflows may use model availability as readiness context, but this workflow does not promote joins or final circuit validity.
- `source_gap_followup_packet_v0` should consume `missing_models`, `access_blockers`, and `owner_followup_needed` directly.

## Boundary Rules

- Public canon contains only workflow rules, state semantics, and templates.
- Project-local packets, model files, downloaded archives, checksums, tool-library metadata, caches, and manifests belong under `_workmeta/<project_code>/runs/<run_id>/...` or another approved private/project-local binding.
- Do not place vendor model payloads, raw project files, source document text, simulator outputs, `_workspaces` outputs, runtime absolute paths, credentials, cookies, sessions, or private run truth in `.workflow`.
- If login, account-bound download, NDA, export-control, license click-through, or secret-backed access is needed, record `blocked` and ask the owner to provide or approve a resulting file path.

## Current Maturity

`validation_level: pilot_ready_contract_only`

The package is registered as a first public-safe contract. A controlled project-local pilot is still required before claiming pilot-executed, usable, or production-ready behavior.

Best first pilot: a small mixed hardware page or component set with one analog/power part that has official SPICE or LTspice collateral, one digital or connector-facing item needing IBIS or S-parameter evidence, one missing or gated model case, and one vendor demo circuit or evaluation-board simulation example if available.
