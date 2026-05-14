# Candidate Prompt: exp_xml_component_materials quality-priority contract probe

Candidate profiles received only the public-safe fixture, mocked official-source catalog, required output shape, and workflow boundary rules. They did not receive evaluator conclusions or scoring.

Required output shape: `profile`, `intake_context_note`, `component_inventory`, `source_discovery_packet`, `download_manifest`, `downloaded_file_checksum_manifest`, `circuit_design_review_queue`, `boundary_review_note`, `circuit_design_readiness_note`.

Boundary rules: no network, no local files, no actual downloads/browser/commands/file writes; use only fixture evidence; EXP.xml remains authoritative; `downstream_handoff` is context only and may not confirm identity, manufacturer, MPN, connectivity, source authority, download completion, or placed components; page-fragment inputs may produce page-level materials only; owner-approved local official collateral requires official source identity, local reuse status, byte-size or file-magic evidence, SHA256, and explicit `DATA Sheet`/`EVAL` placement before counting as completed.
