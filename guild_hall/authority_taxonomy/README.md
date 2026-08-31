# OD-11 authority taxonomy contract (default OFF)

Owner: `guild_hall/authority_taxonomy`. Status: `CURRENT = pure contract/admission receipt only`; policy-store writing, ERP/Bastion/4192 integration, runtime dispatch, external action, persistence, and activation are all `OFF`.

This module turns the still-open OD-11 taxonomy question into a narrow, conservative v0 contract. It does not close a real integration gate and it does not make a caller, model, agent, or approval claim authoritative. A successful result is only `ADMISSION_CANDIDATE`: `authority_granted=false`, `effects_performed=0`, and every product mutation flag remains false.

## Independent axes

The four required axes are supplied separately and must all match exactly:

- **Action authority `A0`–`A6`** uses the canonical Voice-First operating-model meanings: `A0` read/Shadow proposal with effect 0; `A1` Project Decision/Evidence Ledger append; `A2` candidate-artifact or approved Official Task create; `A3` bounded Task field or Waiting set/release; `A4` mechanically provable Task auto-Done; `A5` approved Work Unit dispatch; `A6` bounded external action for an approved recipient/template/work type.
- **Risk `R0`–`R4`** is not inferred from the action authority. Exact action plus risk class distinguishes, for example, an `A2` candidate create (`R1`) from an approved Official Task create (`R2`).
- **Evidence `EV1`–`EV3`** is a minimum floor, not a source of authority.
- **Exact scope** always includes one project, task, target, owner, and explicit `canary_ref` (required for `R2`, otherwise `null`). Wildcards, missing fields, cross-project widening, and mismatched bindings refuse.

`JM0`–`JM6`, requested model, observed model, and reasoning effort are intentionally absent from the request/state schemas. They cannot increase authority, risk ceilings, evidence, or effect count.

## Conservative v0 matrix

| Risk | Permitted contract shape | Decision |
| --- | --- | --- |
| `R0` | `A0`, effect count `0`, minimum `EV1` | Contract candidate only after exact current state and replay/rate guard. |
| `R1` | owned Ledger append (`A1`) or candidate-only create (`A2`), minimum `EV2`, effect count `1`, expiry ≤ 4 hours | Contract candidate only. |
| `R2` | bounded internal Official Task create or Task/Waiting update (`A2`/`A3`), exact `canary:` scope ref, minimum `EV3`, effect count `1`, expiry ≤ 4 hours, separate exact human approval | Contract candidate only. |
| `R3` | foreign mutation, auto-Done, or Work Unit/physical dispatch | Structurally non-grantable; authoring and raw input both refuse. |
| `R4` | send/share, money, baseline/final acceptance/release, credential/ACL/authority write, destructive action, cross-project widening, promotion, redelegation | No grantable action descriptor exists. The authoring helper cannot materialize a request and a raw attempt refuses. |

## Required caller evidence

`evaluateAuthorityAdmission(request, context)` requires all of the following:

1. A current, exact `authority_state` with matching subject/action/scope/epoch, `R0`–`R2` ceiling, evidence floor, revocation=false, and a caller-supplied UTC time no more than five minutes after state evaluation.
2. An exact human approval for `R2` only. It must be a `human:` approver, cannot be self-approval, and binds request/action/scope/epoch/`EV3` exactly.
3. A caller-supplied replay/rate guard bound to the request ID, idempotency key, epoch, and scope. Missing freshness, duplicate/replay, rate failure, or a bypass flag all refuse. The pure module cannot consume this guard; a future sole writer must do that atomically.
4. An optional independent STOP record. Active STOP is deny-only: it can deny one exact action/scope or all actions for a subject, but has no allow/restore path and cannot add authority.

The request authoring helper only emits typed requests for `R0`–`R2` catalog actions. It has no persistence, policy, or writer path. `R3` and `R4` return `AUTHORING_REJECTED` with no request object.

The v0 rate default is one effect in one exact expiry window for `R1`/`R2` and zero effects for `R0`. The required guard therefore binds `window_effect_limit` to the request effect count, requires `consumed_effect_count=0`, and uses the same `window_expires_at` as the request. The future sole writer, not this module, must atomically consume the one-effect window.

## Non-goals and integration gates

- No `AuthorityPolicy` sole writer, grant/revoke, epoch change, or durable replay/rate ledger exists here.
- No ERP, Bastion, Watch/4192 Console, task, file, credential, ACL, deployment, or external mutation is imported or called.
- This contract does not prove that a caller's supplied state, approval, replay guard, evidence, or time is true. It merely refuses absent, malformed, stale, revoked, mismatched, or downgraded inputs.
- A future integration needs an Owner-approved sole writer, trusted current-state/readback source, atomic replay/rate consumption, actual enforcement, and its own review gate before any live effect claim.

## Focused validation

```powershell
node --check guild_hall/authority_taxonomy/src/authority_taxonomy.mjs
node --test guild_hall/authority_taxonomy/tests/authority_taxonomy.test.mjs
```
