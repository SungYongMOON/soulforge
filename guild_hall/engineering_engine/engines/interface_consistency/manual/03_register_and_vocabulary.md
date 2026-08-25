# 03. Interface register and vocabulary

The domain input is `soulforge.interface_consistency.domain_input.v0`. It carries a
bounded `register_id`, `register_revision`, and 1-256 interfaces. Each interface has
2-16 unique ends, a declared applicability state, a revision fact, optional category
scope, and per-end observations.

The comparison categories are `electrical`, `signal`, `data_protocol`, `mechanical`,
and `timing`. Recommended attribute identifiers include `voltage_nominal`,
`ground_reference`, `signal_direction`, `logic_family`, `protocol_id`,
`protocol_revision`, `message_format`, `connector_family`, `pin_assignment`,
`interface_plane`, `clock_rate_hz`, `latency_budget`, and `sequence`.

They are vocabulary examples rather than a closed universal checklist. A Project Binding
states which safe-token attributes are required for an interface/category. The evaluator
performs exact comparison through a bounded Core-compatible value domain; it does not
perform unit conversion, tolerance math, semantic version interpretation, or connector/drawing
geometry analysis. Numbers are safe integers only. Fractional engineering quantities are
fixed decimal strings (for example `"3.3"`) plus a unit, not JSON floats.

A fact is one of `present`, `known_absent`, or `unknown`. Only `present` carries a
value (and optional unit). This keeps absent evidence distinct from unavailable evidence.
Revision and agreement-revision facts are the exception: they are unitless closed tokens
and reject a `unit` field in both schema and runtime admission.

The published schema bounds interface rows (256), category attributes (64), string values
(1024 characters), and recursively shaped JSON value containers (64 members per array or
object). Runtime admission additionally enforces a depth limit, plain-data/no-accessor
shape, NFC, safe keys, and local-path/secret sentinel exclusion; those protections are
deliberately runtime-only because ordinary JSON Schema cannot express all of them.
