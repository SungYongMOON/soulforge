# Test, Dogfood, and Acceptance Plan

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Rule

Documentation, a successful build, an installer, a green dashboard, or the builder's self-review is never sufficient evidence of completion. Every capability crosses deterministic tests, independent review, and staged operational proof in proportion to its authority and risk.

## Required test ladder

```text
schema/unit synthetic
  -> module integration/default-off
  -> isolated install/start/stop/smoke
  -> one physical seat
  -> one project, low-risk actual vertical
  -> repeated 3–5 times
  -> development-team pilot
  -> broader rollout
```

External backup adds a real capture → immutable manifest → isolated restore → reconciliation → human restore acceptance gate. A file existing in a backup directory is not evidence of recovery.

## Field-pilot closed loop

The first field pilot must demonstrate this whole sequence for one approved task and project:

1. human-approved Work Brief and current Official Task reference;
2. exact canonical input bundle, downloaded by manifest/digest;
3. local work in a member's chosen authoring workspace;
4. ordered WorkSession checkpoints/blocker or closeout, including offline/replay behavior;
5. result/evidence upload, custody receipt, and scan/quarantine result;
6. ArtifactRevision candidate with parent/head and evidence;
7. fresh independent review and human acceptance;
8. one authorized current Task SoR update after acceptance, not before;
9. 4192 typed projection; and
10. backup capture plus isolated restore proof for the relevant data classes.

Failure at any point preserves the prior official task/revision and produces `HOLD`, rollback, or an explicit recovery ticket. It does not silently skip a receipt.

## Deterministic validation matrix

| Area | Minimum deterministic evidence |
| --- | --- |
| Plan/doc suite | Relative links, no unsafe local paths, filename/path policy, canon structure, cross-document trace completeness, `git diff --check` |
| MCP/data plane | Tool-schema/compatibility, ACL/existence policy, ticket/replay/range/hash/size/media, quarantine/scan, no-base64/raw-transcript negatives |
| Artifact revisions | Parent/head, manifest, revision/acceptance separation, redaction lineage, downloader/uploader conflict tests |
| Forge/Task | Candidate/intent/approval/task writer separation, idempotency/replay, stale/current status/role gate tests |
| Guild/Workshop | Mark/deployment/revoke/project isolation, lease/fence/capacity/timeout/rollback tests |
| Watch/Bastion | Projection no-writer tests, incident/action receipt separation, restore/recovery tests |
| Connectors | Cursor/dedupe/coverage/partial/deletion, capture manifest, source binding, isolated restore/reconciliation |
| Packs/modules | Manifest/schema compatibility, dependency DAG/cycle check, startup preflight, upgrade/rollback/install/smoke, SBOM/checksum evidence |
| Path Registry/resolver | Exact schema/version/root/owner coverage, private binding refs, ambiguity/expiry/scope/unavailable HOLD, no fallback, guarded unregistered-write rejection |
| Folder materializer | Approved empty canary root, dry-run/apply parity, path containment, idempotent replay, existing-payload move 0, empty-created-directory rollback |
| 4192 Storage Map | All registered root/source rows, source-to-panel state mapping, unknown-without-evidence, no raw/secret/writer fields, safe owner pointers |

## Current measured validation facts

| Command | Result in this task | Meaning |
| --- | --- | --- |
| `node --test ui-workspace/apps/dev-erp/test/context_life_tree.test.mjs` | FAIL at planning time (12 pass / 1 fail); PASS 14/14 after the 2026-08-30 RED-01 leaf | The failing signal was fixture time-rot (absolute seed dates left the 30-day window), not a live scope defect: a fixed-clock probe showed scope filtering already precedes the cap. The leaf made the fixture time-invariant and added a deterministic fixed-clock scope-before-cap regression. |
| `node --test guild_hall/watchtower/topology_provider_adapters.test.mjs` | PASS 4/4 at planning time; PASS 5/5 after the 2026-08-30 RED-02 leaf | The topology-oracle issue is closed: producer and Board expectations now derive from the versioned contract pin `federated_topology.v1.contract.json`, and a new producer test rejects tracked-artifact drift against both the fresh emit and the pin. The Board unified-view suite passes at the real 291-node scale. |
| `npm.cmd run validate:path-policy:all` | FAIL: 57 tracked violations at planning time; 58 mid-loop; FAIL: 57 after the 2026-08-30 re-baseline leaf | The 57 are pre-existing debt (RED-05, Owner-held; untouched). The transient 58th was LOOP OUTPUT - a drive-path probe literal the L-RED-03 leaf (4710fa7f) left in renderer-web/test/control-center-write-policy.test.ts, deterministically attributed by the review via the plan-freeze git baseline and fixed in this leaf by probe-string concatenation (the same pattern as 0947f903; the tsx runner re-verifies all 10 invalid-shape decisions unchanged). Every other 2026-08-30 loop file (packs, emitters, win_system_exe, lifecycle/prover tools, manifests) is clean. |
| `npm.cmd --prefix ui-workspace/apps/dev-erp-mcp test` | BLOCKED at planning time; PASS 44/44 on 2026-08-30 re-measure | Local dependencies were missing at planning time; after the recorded lockfile-only installs the package suite runs green. |
| `npm run validate:workflow-runner` | PASS 36/36 after the 2026-08-30 RED-04 leaf | The E2E fixture's `node_modules` copy now dereferences links, so a symlinked host layout can no longer EPERM-abort the suite; the runner's own link-rejection boundaries are unchanged. |

Other source documents may report historical/private validation. This plan does not re-label those as current physical proof.

## Fable5 production traceability record

Every build leaf and every gate must append a redacted trace record containing:

| Field | Requirement |
| --- | --- |
| Identity | builder identity; requested model/effort; observed model/effort or `UNKNOWN`; reviewer identity separate from builder |
| Intent | objective, allowed scope, input/source refs, claim ceiling, stop conditions |
| Change | changed files, module/pack version, commit/release ref, compatibility/migration state |
| Verification | exact command, environment/synthetic fixture note, pass/fail/blocked result, evidence refs |
| Review | fresh independent reviewer, findings, fixes, final `accept/revise/hold/reject` rationale |
| Forward state | unresolved blocker, superseded/rejected decision relation, exact next leaf |

Trace relation is: `plan requirement -> implementation leaf -> test -> independent review -> release evidence`. Completed, rejected, superseded, and rolled-back decisions remain immutable and queryable. Fable5's own self-check is builder evidence only, never the independent-review field.

## Review level

This public architecture draft requires Level 2 (`inspector + judge`) because it defines an adoption/authority plan and records an owner-decision register. Production activation, a new workflow/skill, public canon promotion, a task writer, or recovery controller needs Level 3 fresh builder/verifier evidence in its own implementation slice.

## Stop conditions

- a required owner/policy/credential/physical binding is missing;
- any source/object/ACL/revision is ambiguous;
- a source access would require raw/private/secret data in public evidence;
- a test reports drift or a fresh reviewer finds an authority collapse;
- an implementation would start a connector, client, data plane, package deployment, or external effect without its gate.

## Standing execution delegation and branch-block test rule

Once the plan/review start gate and a leaf's named prerequisite gates pass, the later implementation loop proceeds without a repeated Owner question for already frozen direction. It may continue disjoint safe leaves while another branch is blocked.

| Branch state | Required action |
| --- | --- |
| Safe / gated | Implement, validate, independently review, and record the leaf under the standing conservative defaults. |
| Blocked by excluded authority or unavailable credential/physical state | Emit a compact unblock packet: leaf/branch ID, exact missing authority/state, observed evidence, prohibited workaround, requested Owner action, rollback/impact, and next safe disjoint leaves. |
| Failed validation/review | Keep the leaf `REVISE` or `HOLD`; do not weaken the test, scope, or acceptance criterion. |
| Field-pilot gates passed | Stop expansion and submit the field-pilot acceptance packet; no automatic public release or final acceptance. |

The full program stops only when field-pilot acceptance gates pass or every remaining branch is blocked by excluded external authority/state. Existing OS-protected `secret_ref` may be used only through its approved mechanism; no test, trace, or reviewer reads or exposes plaintext.

## Related plans

- [Roadmap and gates](14_ROADMAP_GATES_AND_DAG.md)
- [Bastion recovery](09_BASTION_SECURITY_RECOVERY.md)
- [Physical package compatibility](15_FOLDER_COMPATIBILITY_MIGRATION.md)
