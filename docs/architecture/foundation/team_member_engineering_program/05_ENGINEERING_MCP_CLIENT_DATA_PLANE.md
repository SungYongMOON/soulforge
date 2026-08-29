# Engineering MCP, Team Client, and Data Plane

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Purpose

Soulforge Engineering MCP is the provider-neutral control interface shared by Vault/ERP, Forge, Linear adapters, Guild, 4192, Bastion, and a team member's local PC. It carries typed requests, grants, manifests, tickets, statuses, and receipts. It is not a queue, binary store, task writer, approval authority, or agent runtime.

Binary bytes travel only on a separately authenticated HTTPS data plane. No tool argument carries file bytes, base64, a full transcript, screen capture, keystroke data, or operating-system surveillance.

## Compatibility rule

The `dev-erp` and `dev-erp-mcp` paths remain in place. Existing clients continue to see their current names until a versioned compatibility adapter is accepted.

| Current tool | Current boundary | Future shared-MCP compatibility position |
| --- | --- | --- |
| `erp_whoami` | Account-scoped identity/capabilities | Keep; map to `identity.get_effective_actor`. |
| `erp_get_my_agenda` | Personal task/agenda read | Keep; map to `task.list_assigned`. |
| `erp_get_task_context` | Bounded task packet read | Keep; map to `work.get_brief` only after exact assignment semantics exist. |
| `erp_list_mail`, `erp_get_mail_detail` | Bounded source read | Keep as source query, never an implicit context/Task writer. |
| `erp_list_task_artifacts` | Safe descriptors | Keep; map to `artifact.list_visible`; no byte fallback. |
| `erp_publish_work_session` | Current one-shot structured record | Keep as legacy facade; it is not a lifecycle start/checkpoint/closeout authority. |
| `erp_prepare_artifact_upload` | Current bounded service inbox ticket | Keep; map later to `submission.prepare_upload`, not directly to ArtifactRevision. |
| `erp_get_project_history`, `erp_prepare_project_history_download` | Feature-OFF copied, attested history query/download | Keep separate; do not relabel it as a canonical input-bundle endpoint. |
| `ingress_*` tools | Bounded HPP custody/outbox source | Keep as ingress compatibility; promotion remains a separate service. |

## Minimum shared MCP v0 namespaces

The left column is a target namespace, not a registered current tool list. Every mutating request accepts an idempotency key and returns an opaque receipt reference.

| Namespace | Minimum tools/resources | Authority ceiling |
| --- | --- | --- |
| `identity.*` | `get_effective_actor`, `get_device_policy`, `get_capabilities` | Read effective grant only; no credential issuance. |
| `task.*` | `get_official`, `get_assignment`, `list_assigned` | Current Official Task remains Linear; no completion action. |
| `work.*` | `get_brief`, `start_session`, `append_checkpoint`, `declare_blocker`, `closeout`, `propose_completion` | Requires assignment epoch; closeout/proposal is not Done. |
| `bundle.*` | `get_manifest`, `prepare_download`, `get_download_status` | Exact accepted revision/baseline only; no latest/raw fallback. |
| `artifact.*` | `list_visible`, `get_revision_metadata`, `get_candidate_status` | Metadata only; existence/ACL policy is uniform and fail-closed. |
| `submission.*` | `prepare_upload`, `get_upload_status`, `finalize`, `get_custody_receipt` | Custody only; no direct promotion/acceptance. |
| `review.*` | `list_pending`, `get_packet`, `submit_review`, `request_human_acceptance` | Review records; final acceptance stays human. |
| `context.*` | `get_accepted_generation`, `submit_candidate_feedback` | D36 owner only; no implicit project/common fallback. |
| `agent.*` | `get_assignment_binding`, `get_run_status` | Guild query/proposal only; no Agent Mark deployment mutation through generic client tools. |
| `ops.*` | `get_client_release_policy`, `get_health_projection`, `request_approved_action` | A request is not an execution; 4192/Bastion keep their separation. |

## Exact canonical input-bundle download

The data-plane download service is accepted only when every requested object is pinned by one immutable manifest.

1. Client requests a named assignment and manifest revision; no `latest` default exists.
2. Service verifies actor, device, agent (when present), project, task, assignment epoch, action, and expiry.
3. It returns manifest metadata and a one-time, audience-bound HTTPS ticket for each exact object/range.
4. Client transfers bytes with range-resume only for the same manifest/object/digest and verifies full SHA-256 plus size/media type.
5. The client materializes a read-only input bundle and records a bounded local receipt; an arbitrary local authoring workspace is separate.

Required manifest fields are `bundle_id`, `manifest_revision`, `manifest_digest`, `task_ref`, `assignment_id`, `assignment_epoch`, `accepted_context_ref`, ordered entries with `logical_artifact_id`, `artifact_revision_id`, `content_id`, `relative_path`, `size`, `media_type`, source/derivative lineage, ACL audience, issue/expiry, and package/tool constraints.

Rejected conditions include changed accepted head, revoked actor, expired ticket, foreign ACL, duplicate/mismatched range, traversal/symlink path, absent source, unknown media, and a request for raw/latest fallback.

## Result and evidence upload

```text
prepare ticket
  -> authenticated chunk transfer
  -> size/hash/range verification
  -> finalize
  -> custody receipt
  -> quarantine/scan classification
  -> project + assignment binding
  -> parent/head conflict check
  -> ArtifactRevision candidate
  -> independent review
  -> human acceptance
```

`finalize` may produce only a validated custody receipt. A promoter, whose exact policy and physical owner remain D27, binds a clean object to an artifact candidate. It must not be the source collector, task writer, reviewer, or acceptance authority.

The first policy supports content-addressed dedupe only when it cannot leak a foreign artifact's existence, ACL, filename, or metadata. Every server rechecks revocation and assignment scope at finalization, not only ticket preparation.

## Structured WorkSession

| Lifecycle point | Required facts | Receipt/state rule |
| --- | --- | --- |
| `start` / bind | assignment ID/epoch, actor chain, opaque thread reference digest, device, expiry | One active primary per approved cardinality; no task mutation. |
| checkpoint | monotonically ordered sequence, bounded summary/output/evidence refs, idempotency key | Can replay same sequence/digest; conflicting sequence holds. |
| blocker | reason code, dependency/ref, requested resolver | Stays visible; does not create a new task automatically. |
| closeout | bounded outcome, verification, next action, result refs | Closeout is not Official Done or human acceptance. |
| completion proposal | explicitly named task/revision/evidence and requested action | A proposal is reviewed by the authorized task/acceptance path. |
| server acknowledgement | local vs verified server state | Local outbox is retained until verified acknowledgement and retention policy allow compaction. |
| handoff/supersession | previous session/ref, successor session, reason | Preserves history; never overwrites a prior record. |

Offline behavior is a durable local outbox with ordered sequence, checksummed frames, restart/reboot recovery, replay idempotency, and explicit `missing_server_ack` state. On reconnect, the client revalidates device identity, assignment epoch, expiry, and revocation before any replay. Exact encryption, fsync, path, retention, and missing-SLA choices stay under D28; no raw thread ID or transcript is persisted by default.

## Large engineering-data semantics

| Data class | Bundle / validation rule |
| --- | --- |
| HWPX, DOCX, PPTX, XLSX | Treat as compound packages. Preserve member inventory, template/formula/comment/note/embedded-object lineage, native readback, and render/semantic validator results. `.hwp` is normalized before content use. |
| PDF | Pin exact bytes, media/size/hash, page/render/extraction evidence as applicable. |
| CAD, Allegro/EDA, PCB, CAM | Bind native library/tool version, dependency/library manifest, export/DRC/ERC or equivalent validator result, and parent baseline. |
| Sonar/test/measurement data | Bind dataset schema, capture/run identity, time range, calibration/context refs, integrity manifest, and analysis version. |
| Archives | Preserve inventory/declared media and scan before promotion; prevent archive bomb/path traversal and do not mistake an archive wrapper for an accepted revision. |

HTTP transfer may chunk and range-resume these objects; MCP remains metadata only. A bundle cannot silently omit linked native library or tool version evidence needed to reproduce an engineering result.

## Security and error model

The current mTLS work is a reusable synthetic foundation: exact private-address gateway binding, TLS, certificate plus bearer, account/device/agent binding, quotas, revocation, and local-key enrollment. A physical listener, actual certificate/token, firewall, and team PC remain a separate Owner-approved canary.

| Error / hold | Required behavior |
| --- | --- |
| Revoked or expired user/device/agent | Reject request and cascade-revoke unconsumed tickets/grants. |
| Stale assignment or changed head | Reject with a bounded code; require new brief/bundle. |
| Expired ticket / duplicate upload | Reject or idempotently return same receipt only for identical actor/key/digest. |
| Offline replay conflict | Retain outbox, surface conflict, and never discard data as “done.” |
| Wrong project / foreign ACL | Return no existence detail and no data. |
| Malware/unknown scan | Quarantine; no promoter, revision, review, or task consequence. |
| Missing reviewer / unavailable source | `HOLD` with a resolver path, not a fabricated completion. |

## Current implementation reuse

- `dev-erp-mcp/src/tools.mjs`, `src/ingress_tools.mjs`, project-history tools, ticket schemas, and ingress/mTLS tests are retained as compatibility evidence.
- Ingress already separates metadata control from raw chunk transfer but stops at custody acknowledgement.
- The project-history service supports a one-time HTTP range response for a copied generation; it is not enough for resumable canonical material bundles.
- No current tool exposes a full assignment-bound WorkSession lifecycle, accepted revision bundle, quarantine/promoter, or completion writer.

## Related plans

- [Vault / ArtifactRevision](03_VAULT_ERP_ASSET_REVISIONS.md)
- [Team Client Pack](12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [Security and recovery](09_BASTION_SECURITY_RECOVERY.md)
- [Test gates](13_TEST_DOGFOOD_ACCEPTANCE.md)
