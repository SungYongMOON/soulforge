# Material Procurement Project Evidence Contract v0

Status: candidate input contract. This contract admits only injected, public-safe metadata and
read-only facts. It owns no ERP query, field mapping, RAG call, file read, network call, or action.

## Input

`adaptMaterialProcurementProjectEvidence({ project_binding, erp_snapshot, cutoffs })` accepts
exact-key plain data only.

- `project_binding` names one project, this domain ID, an exact binding revision hash, source
  manifest/source references, one exact ERP snapshot reference, ERP-owned read-only authority,
  and one source/proof binding per material need.
- `erp_snapshot` repeats the exact project ID and snapshot reference, uses the same read-only
  authority, has one through 256 unique material-need rows, and supplies no source body or path.
- `cutoffs.valid_at` and `cutoffs.known_at` are canonical UTC instants: a real calendar date,
  hour `00` through `23`, minute/second `00` through `59`, `Z` timezone only, and exact three
  millisecond digits (`.SSSZ`). `known_at >= valid_at`, and `valid_at`'s date equals `as_of_date`.

The source manifest reference and ERP snapshot reference must both be members of the binding's
source references. The snapshot project ID must equal the Project Binding project ID. Every material need must have a binding. A row with non-null `open_purchase_quantity` requires a
non-null proof reference that is a member of the binding's source references. The proof asserts
only the same-need/same-snapshot net-open semantics; it does not create a PO, inventory, or
supplier commitment.

## Output

The adapter emits frozen `typed_project_facts.v1` with complete Project Binding lineage, snapshot
reference, facts digest, valid/known cutoffs, and rows. It also emits a payload-free
observation/evidence receipt with the same lineage/digest/cutoffs and all effect counters fixed at
zero.
