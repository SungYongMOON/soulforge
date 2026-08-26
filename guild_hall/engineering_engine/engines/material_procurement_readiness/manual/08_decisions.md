# Decisions

Required inbound is `max(required_quantity - available_quantity, 0)`. Only released,
supplier-acknowledged, or in-transit net open supply may contribute coverage. The selected inbound
date is confirmed receipt, then promised delivery, then planned receipt; the engine never
recalculates ERP dates.

Lead-time timing is a calendar-day checkpoint only, not MRP, ATP, CTP, transport, or working
calendar logic. An inbound date before `as_of_date` with known partial/absent receipt produces
`gap_overdue_receipt`; unknown receipt remains `unknown`. `receipt_required` and
`default_receipt_required` are reporting-only and never gate readiness.
