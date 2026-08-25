# 06 — Evidence trace

Every input contains a typed immutable `project_binding_ref`; identity, certificate, traceability, environmental record, exception, and approval facts are references rather than source bodies. The receipt records a ruleset reference, source-packet reference, canonical input digest, assessment digest, and replay digest.

The input reference can prove only that an upstream producer supplied a pinned fact. E11 does not dereference it, validate the referenced certificate, or elevate it to a metrological claim.

Raw certificate bodies, customer files, and project evidence remain in their owner workspace and are not public package content or `_workmeta` payload.
