# Rule layers

The base ruleset is the only common candidate rule layer. Core-normalized Organization and Project
Profiles may set `default_receipt_required`; unsupported operations fail closed. This reporting
default never creates authority or changes a quantity/date fact.

The evaluator projects `ready`, `gap_purchase_order`, `gap_late_order`, `gap_shortage`,
`gap_late_delivery`, `gap_overdue_receipt`, `unknown`, or `not_applicable`. The assessment only
summarizes those row-level states as `ready`, `not_ready`, `unknown`, or `not_applicable`.
