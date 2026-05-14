# Candidate Prompt: exp_xml_component_materials repeat intake handoff Top-K

Candidate profiles receive only the public-safe fixture, mocked official-source catalog, required output shape, and workflow boundary rules. They do not receive the golden output or frozen quality criteria.

Required output shape: `profile`, `intake_context_note`, `component_inventory`, `source_discovery_packet`, `download_manifest`, `downloaded_file_checksum_manifest`, `circuit_design_review_queue`, `boundary_review_note`, `circuit_design_readiness_note`.

Boundary rules: no network, no local files, no actual downloads/browser/commands/file writes; use only fixture evidence; EXP.xml remains authoritative; `downstream_handoff` is context only and may not confirm identity, manufacturer, MPN, connectivity, or placed components.
