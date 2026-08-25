# 01. Purpose and shape

E07 checks whether exact, caller-supplied evidence references support a human review of hazards,
risk characterisation, mitigation, verification, residual-risk review, human authority evidence,
life-cycle status, and closure evidence.

Its sole deep entry point is `assessSafetyHazard({ manifest, binding, domain_input, cutoffs })`.
It returns deterministic evidence states and a zero-effect receipt. It does not inspect a source,
project, log, signature, or person, and it never accepts risk or closes a hazard.
