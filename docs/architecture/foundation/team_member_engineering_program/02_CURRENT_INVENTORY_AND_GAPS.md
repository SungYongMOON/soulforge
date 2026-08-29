# Current Implementation, Folder Inventory, and Gaps

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Evidence snapshot

This inventory was read from the public worktree at `4639dcc2ab0cf7551a5bf99d65fbf40c20e83bd6` during this planning task. The checkout was detached and had no index lock or worktree changes at the time of the final inventory check. It is a code/document inventory, not a claim about private runtime health or a physical team-PC rollout.

## Current top-level and product surfaces

```text
Soulforge/
  .registry/ .unit/ .workflow/ .party/ .mission/ _workspaces/
  docs/ guild_hall/ ui-workspace/

guild_hall/
  activity agent_observation ai_usage_meter always_on_launchd assistant_dashboard
  backup_controller battle_log codex_bridge codex_work_directory daily_ledger
  dev_worker doctor dungeon_assignment engineering_engine file_activity gateway
  healer ingress knowledge_access knowledge_canon knowledge_graph local_activity
  mission_close night_watch private_state_sync rag requirement_trace run_history
  schedule_history shared slack_history snapshot state town_crier validate
  voice_capture watchtower workflow_runner workmeta_sync workspace_junction

ui-workspace/apps/
  dev-erp dev-erp-mcp renderer-web skin-lab-storybook sonar-intel
  team-ops-board team-ops-board-mockup

guild_hall/engineering_engine/engines/
  bom_supply_chain_risk calibration_measurement_validity configuration_change_impact
  database_engineering field_failure_corrective_action interface_consistency
  manufacturing_readiness material_procurement_readiness pcb_compliance
  quality_readiness reliability_maintainability safety_hazard systems_engineering
```

The list is a read-verified selection of the product-relevant roots (repository meta directories such as `.github/` are omitted) instead of a remembered module count. It says nothing about installed services, external credentials, or private workspace payload.

## Current components and maturity

| Surface | Current public evidence | Maturity for this program | Required next boundary |
| --- | --- | --- | --- |
| `ui-workspace/apps/dev-erp` | Existing read model, MCP service, current task/UI surfaces, one-shot work-session persistence | Reuse; not the planned full WorkSession or ArtifactRevision service | Preserve compatibility and resolve D27–D29 before new writers |
| `ui-workspace/apps/dev-erp-mcp` | Personal ERP MCP, project-history MCP, company-mail query-only MCP, HPP ingress MCP/mTLS source | Reuse/modify; personal MCP default is feature-gated | Shared MCP facade and explicit capability gates |
| `guild_hall/engineering_engine` | Core plus physical Domain Engine packages and deterministic validators | Reuse as Forge judgment foundation | Accepted-context and real project vertical remain HOLD |
| `guild_hall/file_activity` | Logical file/content/revision/observation metadata lineage | Reuse for lineage only | It is not a byte vault or recovery system |
| `guild_hall/backup_controller` | Feature-gated backup/recovery and Linear LB1 synthetic contracts | Reuse for policy/restore gates | Actual connector capture and human restore acceptance are HOLD |
| `guild_hall/agent_observation` | Registry/observation/usage projection foundations | Reuse as observability support | Not a durable Agent Mark/Deployment authority by itself |
| `guild_hall/watchtower` and Team Ops Board | Read/projection and topology adapters | Reuse/modify as Watch | Remain read-only; oracle scope needs reconciliation |
| `guild_hall/workflow_runner` | Fail-closed workflow state, receipt, artifact, and payload boundaries | Reuse/modify | Windows symlink E2E evidence needs a resolved environment/fixture gate |
| `ui-workspace/apps/renderer-web` | Control-center UI and a token-gated text `PUT` route | Hold as a writer capability | Requires ownership/guard audit before any use with protected surfaces |

## Directly inspected MCP facts

The default personal ERP MCP exposes exactly these eight tools: `erp_whoami`, `erp_get_my_agenda`, `erp_get_task_context`, `erp_list_mail`, `erp_get_mail_detail`, `erp_list_task_artifacts`, `erp_publish_work_session`, and `erp_prepare_artifact_upload`.

`erp_list_pending_reviews` is a ninth, read-only feature-flagged tool. The present upload route is limited and creates a service-owned inbox/pointer; it is not an ArtifactRevision, accepted generation, project promotion, or task completion. The separate project-history MCP requires an explicit project and generation and returns an attested copied-history CSV/XLSX ticket; it is not a canonical input-bundle download service.

The ingress MCP exposes `ingress_whoami`, `ingress_prepare_file_upload`, `ingress_get_upload_status`, `ingress_publish_work_event`, `ingress_publish_run_receipt`, and `ingress_get_submission_status`. Its receipt stops at `pending_server_ack` or `verified_server_ack`; project binding, malware/quarantine classification, parent/head conflict handling, ArtifactRevision, retention/backup policy, and task writer behavior are still absent.

## Reusable but inactive WorkSession foundation

`ui-workspace/apps/dev-erp/src/work_session_lifecycle.mjs` and `work_session_outbox.mjs` contain a richer feature-OFF foundation: assignment epoch/account active-primary cardinality, opaque-thread digest, ordered checkpoints, handoff/supersession, closeout kinds, completion proposal, and fsync-backed replay/compaction controls. `erp_mcp_service` defaults that lifecycle off, and the server does not expose its lifecycle routes. This suite treats it as a `REUSE/MODIFY` foundation, never as current team-client behavior.

## Red stabilization register

| ID | Observed or advisory evidence | Current plan treatment | Required fix proof |
| --- | --- | --- | --- |
| RED-01 | RESOLVED 2026-08-30 with a root-cause correction: a fixed-clock probe showed the store/builder already apply the mailbox scope in SQL before the lane cap (the owned row survives 505 newer foreign rows with zero foreign leak), and the observed failure came from the HTTP fixture's absolute `2026-07-12` seed dates rotting out of the 30-day projection window from about 2026-08-11. | The earlier "scope not applied before cap" reading was a plausible-but-wrong attribution of the same failing signal; production filtering needed no change. | Fixture made time-invariant with every scope/cap/withholding assertion preserved, plus a new deterministic fixed-clock scope-before-cap regression; `node --test ui-workspace/apps/dev-erp/test/context_life_tree.test.mjs` now passes 14/14. |
| RED-02 | RESOLVED 2026-08-30: the Board's `topology-unified-view.test.mjs` still asserted a remembered 74-node/206-edge federation while the tracked artifact had grown to 291/900, so its two artifact-backed tests failed; the producer tests separately remembered 291/900. | One versioned oracle now exists: `guild_hall/watchtower/topology/federated_topology.v1.contract.json` pins summary, per-provider counts, and the artifact SHA-256. Producer and Board tests both derive expectations from that pin, and a new producer test verifies the tracked artifact against both the fresh emit (`--check`) and the pin. | Topology growth is now a deliberate pin update in the same change; silent count/provider/digest drift fails closed on both sides. Producer 5/5 and the full Board suite (692) pass, including collision-free layout at the real 291-node scale. The same sweep exposed a hidden sibling rot: the Board's classic engine lens can only classify the pre-2026-08-25 flat engine vocabulary and correctly fails closed on the migrated 252-module engine; its rendering contract is preserved against the git-history legacy artifact (`4f5674fc`, tracked as `topology-engine-classic-legacy.fixture.json`) and its tests now pin the honest unavailable state for the current artifact. Re-enabling a classic-style lens for the migrated engine is a separate Watch-phase candidate. |
| RED-03 | GUARDED 2026-08-30: the token-gated `PUT` route stays fail-closed without the env token, but its catalog exposed protected-plane text files (`_workmeta/<project>/**`, `_workspaces/<project>/README.md`) as editable, so a configured token could write into private planes. | A pure write policy (`renderer-web/src/controlCenterWritePolicy.ts`) now denies the protected planes (`_workspaces/`, `_workmeta/`, `private-state/`, `guild_hall/state/`) and unsafe path shapes regardless of token, wired into the `PUT` handler; the README now states the real capability instead of denying it. | Negative tests pass (`npm run test:write-policy`: 7 writable / 10 protected / 10 invalid); capability remains default-OFF and is still not an approved Vault/workmeta/operational writer — activation stays a separate authority. |
| RED-04 | Workflow Runner has strict symlink boundaries, while Fable5 reported a Windows symlink E2E inability. | Keep its current test contract; do not equate a skipped/blocked host probe with a passing operational restore lane. | Reproducible Windows fixture or documented environment capability, then E2E evidence. |
| RED-05 | `npm.cmd run validate:path-policy:all` scanned the tracked tree and reported 57 redacted absolute-path-policy violations. | Confirmed tracked-debt HOLD, unrelated to this plan's intended files. | Separate scoped debt-removal task; this suite introduces none. |

## Current external and physical truth ceiling

- mTLS enrollment/gateway code and adversarial tests exist, but actual LAN listener, firewall, CA/certificate, token, physical PC, and real project activation are HOLD.
- Existing master-plan runtime statements marked `HISTORICAL_REPORTED` or `VERIFY_PHYSICAL` remain that way here.
- The public tree cannot establish actual Linear, Slack, Gmail/Hiworks/Outlook, PLAUD, Drive, Buzz, Git, NAS, or team-client connection health.

## Gaps that must remain visible

1. No approved D27 custody/promoter/scan/retention/backup/delete authority.
2. No approved D28 assignment-bound WorkSession/client/outbox/recovery authority.
3. No D29 accepted-generation ACL, exact canonical bundle, or no-fallback query service.
4. No durable Agent Mark/Deployment/Run registry with approved project binding.
5. No physical Team Client Pack rollout, Workshop runtime, or external connector backup acceptance.
6. No task writer migration away from current Linear Official Task SoR.

## Related plans

- [Vault asset architecture](03_VAULT_ERP_ASSET_REVISIONS.md)
- [Watch scope](08_WATCH_4192_OPERATIONS.md)
- [Tests and red stabilization](13_TEST_DOGFOOD_ACCEPTANCE.md)
- [Roadmap and first leaf](14_ROADMAP_GATES_AND_DAG.md)
