# Owner decision and authority boundary

`build_start_evidence_ready_for_owner_review` is a bounded evidence result: the
supplied facts under one exact Project Binding are complete enough for a human
Owner to review. It is not a direction to begin work. An unbound or
binding-mismatched request is refused. Public-synthetic input uses only its
explicit synthetic binding and cannot be treated as a project-bound result.

An all-ready assessment does not approve a build start, production use, live
project acceptance, standards compliance, or product acceptance. The human
Owner retains those decisions. The engine neither changes a project record nor
starts an external action.
