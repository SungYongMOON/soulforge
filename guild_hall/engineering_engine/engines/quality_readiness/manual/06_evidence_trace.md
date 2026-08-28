# 06. Evidence trace

Common chassis: [../06_requirement_trace.md](../06_requirement_trace.md).

Each E01 result retains stable case/rule IDs, the accepted exact stage and Owner refs, source modality, typed authority bindings, executable prerequisites, explicit applicability components, observation state, evaluated outcome, and bounded conflict sides (including governing authority and rationale) when present. `QR-MIL-02` requires approved evidence selection, measurement/evaluation criteria, and `criteria_met` evaluated outcome in addition to observed presence.

For a derived Profile run, the receipt additionally projects `profile_source_bindings` and a
sanitized per-Profile compilation trace: `profile_kind`, `profile_id`, `domain_engine_id`,
`revision_or_hash`, `extends_or_base_pin`, `source_refs`, `order`, `operation_digest`, and
applied operation count. This is provenance only, not source adoption or project authority.

The Typed Facts envelope retains the complete nine-field Core compilation trace, including the
organization/project summaries and `compilation_scope`; recovery does not synthesize or discard
those fields. A forged summary, scope, or profile trace fails closed before evaluation.
