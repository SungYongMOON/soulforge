# Material and Procurement Readiness manual

Status: candidate domain package. It reports source-supported deterministic readiness/gap
signals from a pinned, read-only ERP fact snapshot. It is not a procurement, inventory,
planning, supplier-management, acceptance, or schedule-control system.

## 1. Decision question

> Given the supplied ERP snapshot, does each material need have sufficient available or open
> supply by its supplied need date, and which missing or late facts prevent a readiness signal?

The answer has a ceiling of `source_supported` and applies only to the exact typed snapshot.
It does not make a product, supplier, project, or schedule accepted.

## 2. Input contract

The evaluator accepts one `soulforge.material_procurement_readiness.typed_project_facts.v0`
object with:

- `as_of_date` — the snapshot's calendar date;
- `erp_snapshot_ref` — exact entity, non-floating revision, SHA-256 content identifier, and
  hash algorithm, without a local path or raw payload;
- `fact_authority: erp_owned_read_only_snapshot` — a declaration that ERP is authoritative for
  the supplied transactional/inventory observations; and
- a bounded set of **1 through 256** material-need rows.

Each row preserves the supplied material-need reference, unit, requirement, available quantity,
open purchase quantity, receipt quantity, PO state, need date, lead time, order date, planned /
promised / confirmed receipt dates, and receipt-required flag. `open_purchase_quantity` means the
**net not-yet-received quantity for that same material need in that same pinned snapshot**; it is
not a gross ordered quantity and is never calculated as ordered minus received by this engine.
If a binding owner cannot prove that gross/net and material-need matching semantics, it must supply
`null`/unknown and the engine remains `UNKNOWN` rather than guessing. Quantities are non-negative
safe integers in one row's stated unit. Fractional quantity conversion, allocation, reservation,
lot/serial attribution, currency, and unit conversion are outside v0 and remain `UNKNOWN/HOLD`.

`available_quantity` is the only field used as currently available inventory. `received_quantity`
is shown as receipt progress and is never added to coverage, preventing an engine from inventing
or double-counting inventory truth.

`receipt_required` and a compiled Profile's `default_receipt_required` only control the reported
receipt expectation. They do not gate readiness, create inventory coverage, or change purchase,
supplier, acceptance, or schedule authority.

## 3. Evaluation semantics

1. Required inbound quantity is `max(required_quantity - available_quantity, 0)`.
2. Only `released`, `supplier_acknowledged`, and `in_transit` PO states may contribute their
   supplied net not-yet-received `open_purchase_quantity` to prospective coverage. The evaluator
   never recomputes this field from `received_quantity`.
3. The selected inbound date is, in order: `confirmed_receipt_date`, `promised_delivery_date`,
   then `planned_receipt_date`. The engine does not recalculate any ERP date.
4. When need date and lead time are supplied, `latest_order_date` is a calendar-day checkpoint
   (`need_date - lead_time_days`). It is not an ERP working-calendar, transportation, MRP,
   ATP, CTP, vendor-calendar, or supplier-promise calculation.
5. If a selected inbound date is before `as_of_date`, a receipt that is not fully recorded cannot
   produce `ready` or `on_time`: known partial/absent receipt is `gap_overdue_receipt` with
   `schedule_state: overdue`; unknown receipt remains `unknown` with the same overdue schedule
   signal. A fully received receipt still does not create inventory coverage.
6. Receipt progress is `fully_received`, `partially_received`, `not_received`, or `unknown`.
   It is observational and never grants acceptance or inventory authority.

## 4. Result states

| readiness state | meaning |
| --- | --- |
| `ready` | Available stock or open qualifying supply covers the amount and, where needed, the selected inbound date is on/before the need date. |
| `gap_purchase_order` | Available stock is insufficient and no qualifying open supply is represented, while the lead-time window may still be open or unknown. |
| `gap_late_order` | Available stock is insufficient, no qualifying open supply is represented, and the supplied calendar-day lead-time checkpoint is already passed. |
| `gap_shortage` | Available plus qualifying open supply is less than the required quantity. |
| `gap_late_delivery` | Quantity is covered by qualifying open supply but its selected inbound date is later than the need date. |
| `gap_overdue_receipt` | A selected inbound date is before the snapshot date and the supplied receipt is known to be partial or absent. This does not create inventory or acceptance truth. |
| `unknown` | A needed ERP fact is absent/unknown, including availability, PO state/quantity, need date, or inbound date when inbound supply is required. |
| `not_applicable` | The supplied requirement quantity is zero. |

`assessment.state` is `ready`, `not_ready`, `unknown`, or `not_applicable`; it summarizes rows
without replacing their individual states.

## 5. Core, Profile, Binding, and Typed Facts seam

The compiler/evaluator adapters use the existing Core `compile` and `evaluate` contract. Empty
or Core-normalized profiles are accepted. The sole v0 profile operation is
`{ op: "set_default_receipt_required", value: boolean }`; any other operation, especially an
action-like operation, fails closed. A profile changes only the default reporting expectation for
receipt progress; it cannot create a PO, change quantities/dates, or relax source authority.

Project Binding and facts remain external to this package. A real adapter must preserve exact
source/revision/cutoff provenance and map actual ERP semantics. The engine never fetches an ERP,
RAG corpus, file, or API itself.

## 6. Source and RAG boundary

Read [`../contracts/material_procurement_readiness_source_packet_v0.md`](../contracts/material_procurement_readiness_source_packet_v0.md).
Its Microsoft, OASIS, and Oracle sources support vocabulary only. RAG can surface a locator for
human review but cannot become source authority or generate a fact, binding, date, quantity,
applicability claim, or verdict.

## 7. Outputs, receipts, and effects

The evaluator returns `assessment`, `domain_result`, and `receipt`. The receipt includes stable
input/result digests and **contract counters** whose fixed values are zero: filesystem write,
network, ERP mutation, PO mutation, supplier commitment, and task creation. They are not observed
runtime measurements. The stdout-only runner is a public-synthetic demonstration, not an ERP
client.

## 8. Validation and integration

Run the focused checks supplied with this package:

```text
node --check <each E03 .mjs file>
node --test <each E03 test file>
node tools/material_procurement_readiness_runner.mjs
```

The repository integration lane—not this package—owns root command registration, global
topology/manifest/release regeneration, and any live binding. See
[`../topology/integration_request_v0.md`](../topology/integration_request_v0.md).

## 9. Open decisions before real use

- exact ERP query/snapshot revision and field mapping;
- date precedence, working-day/calendar, lead-time, transport, and shortage semantics;
- reservation/allocation and receipt attribution; and
- authority for PO creation/change, inventory disposition, expediting, supplier contact, and
  schedule acceptance.

Until those are bound and approved, real-project applicability remains `UNKNOWN/HOLD`.
