# 10. Limits and next work

Current source support justifies structural checks at `source_supported` ceiling. It does
not justify public canon promotion, production activation, a claim of compliance, an
engineering acceptance decision, or real-project result interpretation.

Open follow-up candidates require separate authority and source review:

- unit/tolerance/impedance arithmetic;
- floating-point arithmetic or automatic numeric conversion (fractions are fixed decimal strings);
- electrical safety and derating;
- protocol compatibility matrices and version negotiation semantics;
- connector geometry, pin-map, and CAD drawing checks;
- change-board approval and official revision-control evidence; and
- project-specific source adapters and bindings.

This package also deliberately does not invent a role-policy model for endpoints and does
not add runtime effect instrumentation beyond the fixed zero-effect public runner envelope.
Those are residual nonblocking limits, not hidden evaluator behavior.

The immediate technical next step is factory integration after independent review has
accepted the domain bytes.
