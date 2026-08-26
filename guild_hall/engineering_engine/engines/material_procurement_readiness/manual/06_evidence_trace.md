# Evidence trace

Each result row carries `decision_basis`: stable candidate rule IDs, fact-field names actually used,
unknown/missing field names, `needed_next`, package vocabulary support as `package_source_refs`,
and separately bound per-need source/proof references as `project_evidence_refs`. It also carries
the exact source-packet reference and candidate-interpretation marker. It contains no source body, ERP payload beyond the result row,
absolute path, secret, or supplier/customer identity.

The Project Evidence Adapter requires an exact Project Binding, source membership, snapshot match,
one material-need binding per row, and a net-open proof when needed. It emits frozen typed facts
with project/binding/snapshot lineage, facts digest, and matching cutoffs.
