# Material and Procurement Readiness Source Packet v0

- `packet_id`: `E03-material-procurement-readiness-source-packet-v0`
- `status`: `candidate_source_packet`
- `claim_ceiling`: `source_supported` at most
- `source_adoption`: `false`
- `project_applicability_approval`: `false`
- `ERP_authority_transfer`: `false`
- `implementation_scope`: public-safe vocabulary and deterministic read-only assessment only

## 1. Purpose and non-authorities

This packet supports a compact, ERP-neutral vocabulary for order, delivery, receipt, and
date facts. It does not establish a procurement process, vendor performance measure,
inventory balance, contract applicability, supplier commitment, product acceptance, or
project schedule authority.

The candidate engine consumes a caller-supplied, pinned ERP snapshot reference and typed
facts. ERP remains the transaction and inventory authority. An engine result is a
deterministic assessment of supplied facts, not permission to issue a purchase order,
release material, change a delivery date, contact a supplier, or accept a receipt.

## 2. Official public source inventory

| source_ref | authority and exact title | revision/status basis | access | direct official locator | chosen support and applicability boundary |
| --- | --- | --- | --- | --- | --- |
| `S1-D365-PO-DATES` | Microsoft Learn, *Calculate requested ship dates for purchase orders* | Continuously maintained web documentation; official page states `Last updated on 2026-07-01`; accessed `2026-08-26`; page describes Dynamics 365 Supply Chain Management 10.0.40+ prerequisites. | Official public HTML | <https://learn.microsoft.com/en-us/dynamics365/supply-chain/master-planning/supplier-requested-confirmed-dates> | Supports the distinction among requested/confirmed ship and receipt dates, lead time, transport days, and calendars. It does **not** make Dynamics calculation logic a portable rule or establish any project's calendar, vendor, or ERP semantics. |
| `S2-OASIS-UBL-2.3` | OASIS Open, *Universal Business Language Version 2.3* | OASIS UBL 2.3 release; normative schemas listed at the official release site, dated `15-Jun-2021` in the schema index. | Official public HTML and XSD | <https://docs.oasis-open.org/ubl/UBL-2.3.html>; <https://docs.oasis-open.org/ubl/os-UBL-2.3/xsd/maindoc/> | Supports separate order, order-response, despatch-advice, and receipt-advice concepts. It does **not** require a project to use UBL or validate an ERP export unless an exact binding says so. |
| `S3-ORACLE-PROCUREMENT-24D` | Oracle, *REST API for Oracle Procurement Cloud — Update one line* | Oracle Procurement Cloud REST documentation release path `24d`; accessed `2026-08-26`. | Official public HTML | <https://docs.oracle.com/en/cloud/saas/procurement/24d/fapra/op-draftpurchaseorders-draftpurchaseordersuniqid-child-lines-polineid-patch.html> | Supports the existence of an order identifier and an original promised delivery date as distinct purchase-order facts. It does **not** establish priority, supplier authority, or portability to another ERP. |

### Revision and access policy

1. A project binding must replace the source record only with an exact, reviewed source revision
   or API/schema version that actually governs its ERP facts. `latest`, `current`, and a
   silently changing web page are not permitted as an ERP snapshot or project binding revision.
2. The web sources above are terminology and fact-shape support. They are not runtime inputs;
   the public package stores only short paraphrases and locators, never source bodies.
3. A changed official page, access restriction, or source contradiction creates a new candidate
   source packet. It cannot silently change this package's rules.
4. No paid or controlled standard body was accessed or copied. No project, supplier, customer,
   contract, inventory, PO, receipt, or private ERP payload was accessed.

## 3. Direct source derivation

| candidate vocabulary | direct source support | deterministic package interpretation | explicit limit |
| --- | --- | --- | --- |
| `need_date` | S1 distinguishes requested receipt dates from ship dates. | Caller supplies the date by which the material is needed. | The package never calculates an ERP requested date or calendar adjustment. |
| `lead_time_days` | S1 describes lead time as vendor preparation time and distinguishes transport time. | Integer calendar-day checkpoint used only to expose whether an order is already beyond its supplied lead-time window. | It is not a vendor calendar, ATP/CTP, MRP, or delivery-date calculation. |
| `purchase_order_state` and `open_purchase_quantity` | S2 distinguishes order/order response and receipt concepts; S3 exposes an order identifier. | `open_purchase_quantity` is a binding-supplied **net not-yet-received** quantity for the same material need in the same pinned snapshot. It may be counted only for released, acknowledged, or in-transit supply. | The sources do not prove a project's gross-versus-net ERP query semantics. The package never derives open quantity as ordered minus received or treats an observation as PO creation, approval, or supplier acceptance. |
| `promised_delivery_date` and `confirmed_receipt_date` | S1 distinguishes requested and confirmed receipt dates; S3 documents an original promised delivery field. | The engine selects the highest supplied date signal in a fixed order: confirmed receipt, promised delivery, then planned receipt. | It does not infer a supplier commitment, resolve commercial precedence, or recompute a date. |
| `received_quantity` and `receipt_state` | S2 separately models Receipt Advice. | Receipt progress is reported without adding it to available inventory coverage. | Only the supplied `available_quantity` may represent currently available inventory. |
| shortage and schedule readiness | The sources distinguish relevant facts but do not define Soulforge readiness. | The engine applies a transparent arithmetic and date comparison over typed facts. | Statuses are package-local gap signals, not compliance, acceptance, supplier score, or production readiness. |

## 4. RAG and source boundary

RAG may retrieve a candidate locator or source identifier for a human to inspect. It may not
invent `need_date`, quantity, order state, lead time, delivery date, receipt state, snapshot
revision, applicability, or a readiness verdict. This package contains no RAG call, model call,
network call, filesystem write, ERP write, purchase action, or supplier action.

## 5. Applicability and source gaps

| gap | state | required next action |
| --- | --- | --- |
| Actual ERP field mapping | `UNKNOWN/HOLD` | A project binding owner must map its exact ERP revision and field semantics to the typed-facts contract. |
| Working-day, vendor-calendar, transport-calendar, and MRP logic | `UNKNOWN/HOLD` | Provide an exact ERP-native calculated date and its revision if that behavior must be evaluated. |
| Supplier promise authority and commercial precedence | `UNKNOWN/HOLD` | Bind an authorized order/supplier evidence source and its conflict-resolution policy. |
| Inventory allocation/reservation semantics | `UNKNOWN/HOLD` | Bind the exact ERP snapshot query and availability policy; the package will not reconstruct inventory truth. |
| Open purchase quantity gross/net and material-need matching | `UNKNOWN/HOLD` | A binding owner must prove that `open_purchase_quantity` is the net not-yet-received quantity for the same material need and snapshot. If not proven, supply `null`/unknown; do not infer it from `received_quantity` or a gross ordered amount. |
| Project/contract schedule applicability | `UNKNOWN/HOLD` | A Project Profile and Project Binding must state scope, authority, source revision, and cutoffs. |

## 6. Owner decisions before real use

1. Approve an exact ERP adapter/binding that produces the typed facts from a pinned read-only
   snapshot.
2. Decide which ERP-native date is authoritative when planned, requested, promised, confirmed,
   and receipt-derived dates differ.
3. Decide whether a project may use the calendar-day lead-time checkpoint or must supply an
   ERP-native earliest/expected receipt date.
4. Name the human/organization authority for shortage disposition, PO creation/change,
   supplier communication, expediting, inventory allocation, and schedule acceptance.
5. Approve any future shared Core registration, global topology, release, or live ERP binding.
