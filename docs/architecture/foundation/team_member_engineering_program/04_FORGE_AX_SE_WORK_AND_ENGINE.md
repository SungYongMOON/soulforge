# Forge AX/SE Work and Engineering Engine Architecture

> Status: `OWNER_REVIEW_DRAFT` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

## Purpose and authority

Forge turns accepted facts, accepted context, and bounded engineering knowledge into a Work Candidate, TaskIntent, Work Brief, and role proposal. Forge is an engineering judgment and work-generation seam; it does not become a byte vault, an Official Task writer, a final technical acceptance authority, or a project-wide raw-memory collector.

The existing Engineering Engine assembly model remains decisive for its own scope: Core and Domain Engines evaluate bounded evidence; Organization Profile, Project Profile, Project Binding, Typed Facts, and Effective Rule Set stay distinct. Engine output is a finding/risk/gap/role/work candidate until a human or exact approved policy accepts the next action.

## Work-generation state machine

| State | Minimum input | Owner / actor | Output | Never implies |
| --- | --- | --- | --- | --- |
| `accepted_context_ref` | Explicit accepted revision/generation and source scope | Context acceptance authority | Exact context pointer | Live/current project completeness |
| `forge_work_candidate` | Accepted context plus Engine finding/rule provenance | Forge | Candidate, rationale, confidence, stop conditions | Official task or assignment |
| `task_intent` | Candidate plus requested task change and expected prior state | Forge / authorized requester | Immutable intent digest | Applied task mutation |
| `work_brief_candidate` | Intent plus proposed role/capability/input/output | Forge | Draft brief and route proposal | A claim or tool grant |
| `approved_task_intent` | Human/exact policy decision | Approval authority | Approval record references | Successful current task write |
| `official_task` | Approved intent, current Official Task writer | Linear currently | Official task ref/status | Accepted result or Done |
| `assignment` / `claim` | Official task, role, agent/person, expiry | Assignment authority | Assignment epoch and grant | WorkSession or completion |
| `work_brief_issued` | Accepted assignment and exact input manifest | Vault/ERP read service | Immutable work package | Permission to alter canonical assets |

## Work Brief contract

Every team member or agent receives a bounded Work Brief containing:

- `task_ref`, `task_intent_ref`, `assignment_id`, assignment epoch, actor/role/capability policy refs, and expiry;
- explicit problem, requested outcome, allowed-write scope, required evidence, constraints, stop conditions, and escalation path;
- exact accepted input-bundle manifest digest and source/revision refs;
- required review role, completion-proposal condition, and absence/unknown handling;
- optional tool/workshop requirement and capacity/lease request; and
- an idempotency/replay key and no raw prompt, hidden reasoning, credential, or foreign project body.

A Work Brief is not a blank free-form instruction. If any critical task, project, scope, or accepted revision binding is missing, it is not issued and the client displays `HOLD`.

## Forge-to-Linear seam

Forge proposes. Linear remains the current Official Task SoR. The flow is:

```text
accepted context + Engine finding
  -> Forge candidate / TaskIntent / Work Brief proposal
  -> human or exact approved policy
  -> Linear task create/update through its single authorized writer
  -> task reference returns to Forge/Vault/Guild as a typed external ref
```

No MCP call may skip the approval or create a second task history. A task result may cause a future Forge feedback candidate, but it cannot silently open a follow-up or mark the source task done.

## Current reuse and HOLDs

| Existing surface | Reuse decision | What remains excluded |
| --- | --- | --- |
| `guild_hall/engineering_engine/core/` and `engines/**` | REUSE | Source truth, applicability, acceptance, task state, external effect |
| `PROJECT_TASK_ENGINE_LIFECYCLE_V0.md` | REUSE as target contract | It remains `canon_candidate`; no live schema migration claimed |
| Task Execution Core / Candidate Execution Coordinator | REUSE as default-OFF foundation | No production work brief, scheduler, persistent writer, automatic assignment |
| Context/P5 candidate and D36 plans | REUSE/MODIFY | No accepted-context writer until its owner gate closes |
| Work Brief service, intent/assignment bridge, human approval UI | BUILD | Requires D28/D29 plus current task-writer agreement |

## Agent and human role proposal

Forge may propose exactly one primary logical role and zero or more collaborating/review roles, each with justification and a capability requirement. It may not infer a real person, availability, tool license, account, or project grant. Guild resolves an approved proposal to a person or exact Agent Mark/Deployment only after an assignment authority grants it.

## Error and hold behavior

| Condition | Behavior |
| --- | --- |
| Missing accepted context, source revision, or binding | `HOLD_INPUT_UNAVAILABLE`; do not synthesize facts. |
| Contradictory finding/rule/profile | Emit conflict evidence and request review; do not select a winner silently. |
| Task changed after intent digest | `HOLD_STALE_TASK_INTENT`; regenerate through the authorized path. |
| Role unavailable, revoked, or tool capacity missing | Assignment stays pending; do not substitute another agent or PC. |
| Candidate lacks review/acceptance owner | Keep candidate state; no task/status change. |

## First actual vertical after the red stabilization leaf

The first Forge vertical is deliberately small and default-OFF — it is the roadmap leaf-4 vertical, not the later physical field pilot: one accepted context generation, one human-approved TaskIntent, one Linear task, one assignment, one Work Brief, one exact input bundle, one bounded result candidate, and one human decision. It begins only after the prerequisite D27/D28/D29 gates and the current task-writer interface are approved; it does not start by connecting every source or auto-generating work.

## Related plans

- [Asset and revision architecture](03_VAULT_ERP_ASSET_REVISIONS.md)
- [MCP and Team Client](05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md)
- [Guild execution](06_GUILD_AGENT_MARK_AND_RUNTIME.md)
- [Roadmap gates](14_ROADMAP_GATES_AND_DAG.md)
