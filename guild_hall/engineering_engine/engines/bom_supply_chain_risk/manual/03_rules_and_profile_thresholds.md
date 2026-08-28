# Rules and Profile thresholds

The base rules define dimensions, source locators, and non-authority boundaries.
They intentionally do not set a universal lead-time, supplier-count, or
geography-count threshold. Those values are organization/project policy material
and enter only through the existing ordered Core Profile Binding seam.

The compiler accepts one closed operation:

```json
{ "op": "set_threshold", "metric": "max_lead_time_days", "value": 60 }
```

The other permitted metrics are `minimum_supplier_count` and
`minimum_geography_count`. A missing threshold produces `unknown`, not an
invented default. An organization Profile can set a threshold and a later project
Profile can replace it with its own pinned operation provenance; duplicate
operations within one Profile are rejected.

For any derived threshold set, the evaluator accepts only the complete current
Core assembly wrapper. It recomputes the effective/assembly digest, requires an
empty compilation scope, and roots each threshold provenance to the ordered
organization/project trace, `extends_or_base_pin`, Core operation digest, and
operation index. A bare inner ruleset is accepted only for the exact base rules
with no thresholds or provenance.

The effective ruleset also retains each full Profile operation program. This
allows a project threshold to override an organization threshold without losing
the earlier program's digest/count closure: final provenance names the last
operation for that metric, while every original program is verified separately.
An exact zero-operation Profile uses the Core digest for `[]`, an operation
count of zero, and adds no threshold/provenance row.
