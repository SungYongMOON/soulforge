# FMECA linkage and closure gaps

`RM-FMECA-02` checks only whether a bound FMECA record is linked to its scope, configuration
baseline, failure-mode trace, selected criticality method, and update trigger. It does not score
criticality, decide that a mitigation works, or replace a project’s FMECA method.

`RM-CLS-07` joins a failure/anomaly reference to a FMECA update, control action, verification
evidence, and closure-authority reference. A missing link returns a gap. A complete evidence
trace can be `satisfied` only as evidence readiness and explicitly reports that the engine did
not exercise closure authority. Risk acceptance, waiver, repair, release, and product closure
remain Human Owner/project-authority decisions.
