# Codex work directory

This package defines a read-only, provider-neutral directory for finding the
stable role that owns a request. It does not contain the actual route catalog.
Actual catalog data is supplied with `--catalog`; local runtime bindings are
optional and supplied separately with `--binding`.

The stable catalog is the routing authority. Runtime bindings never confer
authority and are joined only after one stable route resolves. The root has
`navigation_authority: none` and exactly five sibling branches: `common`,
`projects`, `ax_development`, `erp_development`, and `system_development`.
Their fixed labels are `COMMON`, `PROJECTS`, `AX DEVELOPMENT`,
`ERP DEVELOPMENT`, and `SYSTEM DEVELOPMENT`.
Project manager routes are flat sibling leaves under `projects`, never children
of AX, and an unresolved project code remains `null`. Manager relations cannot
cross branches. Cross-branch escalation may target only COMMON reclassification.
The AX projection contains one AX root and five direct AX owners.

Organization trees/cards and current-work boards are different projections.
This package renders only organization projections. A current-work board may be
derived later from the same model, but it is neither implemented here nor a
source of truth. No UI, task board, provider integration, dispatch, write, or
default route is included.

## Organization governance overlay

`schema/organization_governance_overlay.v1.schema.json` defines the public-safe
contract for a provider-neutral organization hierarchy and its role bindings.
The active data is supplied separately from an ignored private metadata-only
source; the current local candidate path is
`_workmeta/system/bindings/organization_governance_overlay.v1.json`.

`organization_governance.mjs` validates exact organization and parent IDs,
company roots, lifecycle, branch membership, role bindings, owner-seeded legacy
mapping declarations, and the absence of raw/thread/session/secret fields. It
projects a read-only Board shape without changing a work-directory route.
`organization-governance-provider.mjs` reads the configured local source on
each request. Missing, invalid, disabled, or candidate-only input fails closed;
there is no route, task-state, thread, archive, or external side effect.

The current IDs are validated-private Owner-seeded mappings, not promoted
public organization canon. `stable_route_id` remains nullable and does not
confer routing authority. Moving the source to a later file, database, or API
requires replacing the provider, not the Board UI or hierarchy contract.

## Contracts

- `schema/route_catalog.v1.schema.json` — public-safe stable roles, scopes,
  lifecycle, prohibitions, escalation links, and capability classes.
- `schema/live_bindings.v1.schema.json` — local-only coordination, preferred
  execution surface, runtime agent, optional session/worktree, fallback,
  validator, bridge state, and readiness bindings.

Local writer minimum input is the catalog `catalog_revision`, one known
`route_id`, three required binding references
(`durable_coordination_binding`, `preferred_execution_surface`,
`runtime_agent`), optional `runtime_session` and `worktree_binding`, explicit
fallback and validator arrays, `bridge_state`, and `execution_ready`.
Each binding reference has a local `binding_id`, a provider-neutral
`capability_class`, and optional local provider, resource, title, host, and
thread identifiers. Each route binding also records `observed_status`, an
explicit `verified_at_kst` timestamp, provider-neutral `source_kind`,
`binding_state`, and nullable prior resource/thread history pointers. Binding
state is `active`, `stale`, `rollover_pending`, `retired`, or `unknown`;
rollover requires at least one prior-history pointer. Secret, token, password,
cookie, and credential fields are forbidden. Non-active bridge or binding
states require `execution_ready: false`. Fallbacks are never promoted
automatically, and validators must be independent.

## Read-only CLI

```text
node guild_hall/codex_work_directory/cli.mjs validate-catalog --catalog <path>
node guild_hall/codex_work_directory/cli.mjs validate-binding --catalog <path> --binding <path>
node guild_hall/codex_work_directory/cli.mjs render --catalog <path> --view all
node guild_hall/codex_work_directory/cli.mjs resolve --catalog <path> --query <text>
```

Resolution normalizes NFKC, case, and whitespace. Precedence is explicit
`route_id` or canon-confirmed `project_code`, exact display name/alias, then an
exact bounded responsibility term. Results are `EXACT`, `AMBIGUOUS`, `STALE`,
`UNKNOWN`, `RETIRED`, or `ROLLOVER_PENDING`. Negative states redact runtime
data. There is no fuzzy winner, default route, send, create, dispatch, or write.

Claim ceiling: `canon_candidate`.
