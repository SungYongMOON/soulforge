# Purpose and shape

E05 evaluates whether a bounded set of supplied facts under one exact Project
Binding supports a human Owner's review of build-start readiness. Its public seam is
`assessManufacturingReadiness(request)`. The Domain Adapter registers through
the existing Core Interface; it does not introduce another registry, kernel,
or workflow.

The engine is intentionally narrower than production control. It reports
evidence readiness and gaps, never an instruction to begin work.
