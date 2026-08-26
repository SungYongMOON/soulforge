# 06. Evidence trace

The input carries opaque evidence references, exact source-packet/ruleset references, authority
bindings, applicability components, and observation states. It rejects raw source bodies, project
documents, credentials, local absolute paths, and model answers. The receipt hashes the public
assessment result and names only the pinned rule/source packet refs.

`observation.evidence_by_key` is closed against the effective rule's expected evidence keys.
Each supplied key holds a bounded, sorted, non-empty reference array; missing keys are explicit
sufficiency holds rather than silent evidence substitutions.
