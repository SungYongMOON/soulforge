# Canonical source intake checklist

Use this checklist before adding a source handle to an active NotebookLM
bookshelf or NotebookLM packet. The checklist is manual and offline: it records
decision criteria only and does not require live Google Drive or NotebookLM
access.

## Intake result

| Result | Meaning | Next action |
| --- | --- | --- |
| `accepted_for_bookshelf` | The source is approved for metadata-only ledger entry and possible NotebookLM bookshelf or packet use. | Add or update a source handle in the metadata ledger. |
| `hold_candidate` | The source may be useful, but ownership, version, scope, or payload boundary is unresolved. | Keep in candidate state and ask the owner or source steward. |
| `rejected_or_unclear` | The source is not usable for the active NotebookLM bookshelf or cannot be safely classified. | Do not add to active NotebookLM packets. Record only a safe rejection note if needed. |
| `superseded` | A better or newer approved source replaces this one. | Keep the old handle out of active packets unless a review needs the history. |

## Checklist

| Check | Pass condition | Metadata to record | If not pass |
| --- | --- | --- | --- |
| Source identity | The item has a stable public-safe label and a source handle that does not expose a live ID or local path. | `source_handle`, `title_label`, `source_kind` | `hold_candidate` |
| Storage surface | The item is in, or is intended for, the owner-held Drive warehouse surface rather than an active working-file area. | `storage_surface`, `warehouse_state` | `hold_candidate` |
| Owner approval basis | The owner or steward has approved the source for the scoped warehouse and NotebookLM bookshelf use, or the source is explicitly marked candidate. | `approval_status`, `approval_basis_ref`, `approved_by_role` | `hold_candidate` |
| Version state | The source version is known enough to avoid mixing drafts, superseded copies, and uncertain revisions. | `version_label`, `effective_date`, `supersedes_handle` | `hold_candidate` |
| Payload boundary | The ledger entry can be written without source text, private payload, raw mail, secrets, account URLs, or runtime absolute paths. | `metadata_only: true`, `source_payloads_included: false` | `rejected_or_unclear` |
| Source class | The item belongs to an allowed source class for the packet, such as official reference, owner-approved note, public article, standard excerpt packet, or project-approved source packet. | `source_class`, `domain_tags` | `hold_candidate` |
| NotebookLM readiness | The source can be included in a NotebookLM packet without importing candidate, rejected, local-only, or superseded material. | `notebooklm_allowed`, `packet_scope` | `hold_candidate` |
| Claim ceiling | The supported claim is no stronger than the available approval and source evidence. | `claim_ceiling` | Lower the claim or hold. |
| Review route | Unresolved source gaps, contradictions, or owner decisions have a follow-up route. | `review_status`, `next_owner_action` | `hold_candidate` |

## Completion rule

A source is ready for active LLM wiki packet use only when source identity,
storage surface, owner approval basis, version state, payload boundary,
NotebookLM readiness, and claim ceiling are all explicit. Otherwise keep it out
of active packets and record the weakest safe state.
