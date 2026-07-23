# Run history

`guild_hall/run_history` is the feature-OFF H05 candidate adapter for exact,
metadata-only run receipts. It does not discover directories, recurse through
`runs/**`, read logs or payloads, call a live source, persist state, or activate a
collector.

## Exact initial allowlist

The only eligible native occurrence is a `workflow_job` owned by
`report_authoring_v0` and identified by the `job_id` in an exact
`soulforge.workflow_receipt.v1` value. The adapter binds all three of these
public surfaces:

- workflow: `.workflow/report_authoring_v0/workflow.yaml`
- schema: `.workflow/report_authoring_v0/contracts/workflow_receipt.v1.schema.json`
- validator: `guild_hall/workflow_runner/contract.mjs#validateWorkflowReceipt`

Those file locations document the binding; callers pass fixed typed refs and
the receipt value, never a path. The full canonical receipt is hashed. Identical
replay is a no-op, while the same `job_id` with any different full receipt
digest is a hard conflict. The output retains only metadata refs and digests,
not the receipt or report payload.

Unknown workflow/schema values, arbitrary manifests, `runs/**` recursion,
raw/stage logs, transcripts, task-chat or whole-conversation material, secrets,
credentials, absolute/UNC/workspace paths, and hidden boundary sentinels inside
otherwise schema-allowed strings fail closed.

Five-field capture is not an eligible native occurrence. Its current `id` stays
relation-only until an owner-approved full-record digest, same-ID conflict, and
raw/secret boundary contract exists. Daily-ledger/context rows are projections,
not H05 occurrences or coverage events.

## Query-only source inventory

`source_inventory.mjs` accepts one exact authorized run root plus a non-empty
list of exact `workflow_receipt.json` paths through stdin. It never searches or
recurses through `runs/**`, uses a wildcard, reads a raw/stage log or transcript,
or returns a path, filename, receipt ID, or receipt body. Each descriptor must
remain below the authorized root, have no symlink/junction component, pass the
existing `validateWorkflowReceipt` contract, and bind exactly to
`report_authoring_v0.binding.v1`. Type, size, and mtime are checked before and
after each bounded read.

The redacted result contains only receipt count, latest completion time, a
receipt-set digest, and mutation proof. An empty exact-receipt list fails as
`descriptor_missing`; the command does not substitute directory discovery.

```powershell
'{"authorized_run_root":"<exact run root>","receipt_paths":["<exact workflow_receipt.json>"]}' |
  node guild_hall/run_history/source_inventory.mjs
```

This proves at most `source_availability_metadata_only`. It neither accepts H05
nor activates run capture, persistence, classification, semantic labeling,
TaskDriver, or any writer/scheduler.

## Coverage and authority boundary

`createRunHistoryCoverageEvidence` reuses the H00 independent coverage receipt
and its six-state count/null/gap matrix. It requires a caller-supplied
`rule_revision` policy ref and never invents a gap code or applicability rule.
The public fixture and tests are synthetic only. D25/D26 owner ratification,
source existence validation, live coverage, persistence, export, scheduling,
and writer authority remain outside this package.

All exported creation paths require `feature_enabled: false`; every output also
records `feature_enabled: false` and `raw_payload_copied: false`.

## Focused verification

```powershell
node --test guild_hall/run_history/run_history.test.mjs guild_hall/run_history/source_inventory.test.mjs
git diff --check -- guild_hall/run_history
```
