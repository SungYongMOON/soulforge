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
