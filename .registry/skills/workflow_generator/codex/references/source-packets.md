# Source Packets

Use source packets to separate approved non-oracle construction evidence from forbidden oracle material.

## Forbidden In Benchmark Mode

Forbidden reference/oracle material includes:

- reference/oracle artifacts in any format, such as REF XML, accepted Markdown, target PDFs, expected JSON, accepted drawings, or answer images
- accepted outputs
- answer keys
- verifier reports
- repair packets
- previous candidates
- reference-derived strict target data such as exact text, coordinates, object IDs, layout positions, object signatures, embedded asset payloads, or mismatch-derived construction targets

## Approved Non-Oracle References

Approved non-oracle references may be used for construction when recorded with provenance:

- official specifications
- product or technical datasheets
- vendor implementation guides
- drawing standards or style guides
- engineering rules, interface control notes, or user-approved design briefs
- baseline workspace assets
- approved local library metadata
- user-provided source packets

These references may identify domain entities, ports or connection points, relations, topology or structure, labels, notes, layout intent, embedded/source assets, and tool workflow constraints.

## Source Packet Bootstrap

If the user goal includes a source-finding procedure, a missing prebuilt source packet is not enough to block the run. Create an R/source-bootstrap stage that produces source packets before construction.

R may:

- inspect the baseline artifact and task prompt
- extract identifiers, objects, labels, metadata, or tool constraints that are visible in the baseline
- search approved official, public, or local non-oracle sources
- inspect safe tool help, schemas, style guides, library metadata, and owner-approved samples
- write a source discovery packet and executor-approved source packets

R must not inspect reference/oracle artifacts, V reports, accepted outputs, prior candidates, repair packets, or oracle-derived mismatch details.

Only stop for an owner sample when R cannot safely obtain or approve the required non-oracle evidence, a source conflict needs domain judgment, the output format needs a sample representation or tool export, or an asset cannot be embedded or cited safely.

## Minimum Packet Fields

```yaml
packet_id:
approved_for_executor: true
oracle_free: true
approved_by:
approval_scope:
sources:
  - id:
    type: official_specification|product_or_technical_datasheet|vendor_implementation_guide|standard_or_style_guide|baseline_asset|local_library_metadata|user_source_packet|approved_design_brief
    publisher:
    title:
    url_or_path:
    provenance:
artifact_scope:
  input_formats: []
  output_formats: []
  artifact_type:
requirements:
  domain_entities: []
  ports_or_connection_points: []
  relations_or_topology: []
  labels_or_visible_fields: []
  notes: []
  layout_or_presentation_constraints: []
  embedded_or_source_assets: []
  tool_constraints: []
```

Every requirement must cite one or more source ids. If a packet includes oracle-derived material, it is not approved for benchmark executor use and the run must switch to `goal_reconstruction` or stop.

`approved_by` may be the user, a named project owner, or a prior trusted local workflow record. `approval_scope` must say whether the packet is approved for benchmark execution, reconstruction only, verifier-only use, or human-review preparation.
