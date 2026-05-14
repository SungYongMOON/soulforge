# Official Source Packet Collect v0

`official_source_packet_collect_v0` is a public-safe source-bootstrap workflow for hardware preparation lanes. It creates a project-local source packet that records official sources, owner-approved local official sources, source gaps, access blockers, owner follow-up, and downstream readiness before materials, layout, simulation, ECAD, or harness workflows make source-backed claims.

The workflow is provenance-first. It does not invent missing sources, treat random mirrors as official, or copy raw project/vendor payloads into public canon.

## Inputs

- A bounded identifier scope such as a page, component set, module, design fragment, or owner-defined source request.
- An approved source policy that defines official-source rules and owner-approved local source handling.
- Optional page module sidecars, capture intake packets, component inventories, existing source packets, owner-approved local source manifests, and downstream source requirements.

## Outputs

- `source_packet_manifest`
- `source_inventory`
- `source_gap_report`
- `owner_followup_needed`
- `download_or_reuse_manifest`
- `downstream_ready_refs`
- `boundary_review_note`

## Source States

- `official_present`: authoritative publisher source is confirmed and enough provenance is recorded to find it again.
- `owner_approved_local`: local/private source is approved by the owner for a stated scope, with executor permission explicit.
- `missing`: a requested source kind was searched but no acceptable source was found.
- `blocked`: a source may exist, but access, terms, login, export, license, format, or owner approval blocks use.
- `not_applicable`: the requested source kind does not apply, with rationale recorded.
- `candidate_official`, `third_party_unapproved`, and `conflicting` are review states and are not executor-approved evidence.

Only `official_present` and explicitly scoped `owner_approved_local` sources may become `approved_for_executor: true`.

## Downstream Contract

Downstream workflows should consume this packet as a boundary contract:

- Materials workflows use `official_present` or `owner_approved_local` datasheet/reference-design refs and preserve unresolved identity gaps.
- Layout workflows use layout/package/app-note refs or record layout source gaps instead of fabricating guidance.
- Simulation workflows use model/demo-circuit refs only when model format, provenance, terms, and compatibility are recorded.
- ECAD workflows use symbol, footprint, and 3D-model refs only when source status and license or owner scope are explicit.
- Harness workflows preserve source gaps, blocked states, and quantitative/model gaps as blockers or review gates.

## Boundary Rules

- Public canon contains only workflow rules, state semantics, and templates.
- Project-local packets, downloads, reused local files, checksums, caches, and manifests belong under `_workmeta/<project_code>/runs/<run_id>/...` or another approved private/project-local binding.
- Do not place datasheet text, model payloads, ECAD archives, raw XML, private project values, `_workspaces` outputs, runtime absolute paths, credentials, cookies, sessions, or private run truth in `.workflow`.
- If login, account-bound download, NDA, export-control, or secret-backed access is needed, record `blocked` and ask the owner to provide or approve a resulting file path.

## Current Maturity

`validation_level: pilot_ready_contract_only`

The package is registered as a first public-safe contract. A controlled project-local pilot is still required before claiming pilot-executed, usable, or production-ready behavior.

Recommended first pilot: a small mixed-state hardware page or component set with one official datasheet/EVAL source present, one missing model or ECAD package, and one ambiguous or blocked source-access case.

