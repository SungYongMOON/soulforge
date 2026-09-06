# task_hierarchy_v1 (candidate — not canon)

- Status: **candidate**, not accepted canon. This document and its sibling schema
  (`guild_hall/engineering_engine/schemas/task_hierarchy_v1.schema.json`) describe a proposed
  machine contract for the layer Rune (`engineering_engine`) does not yet name: what sits between
  a Stage's expected artifacts (which Rune already computes) and the individual Step/Action work
  that produces them.
- Owner authority for Task creation is Rune (Drive `Soulforge_맥락·메모리·그래프·온톨로지_구현계획_v0.1`
  §15.1). This contract does not change, override, or feed back into any Rune judgement — see
  "One-way rule" below.
- Owner surface for this contract is `guild_hall/engineering_engine/contracts/`
  (`docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`), per the 2026-09-06 owner review answer
  recorded in `RUNE_TASK_GRAPH_PHASE0_BRIEF_2026-09-06.md` §15 row 3.
- This contract is Phase 0 commit 1 of 4. `task_invariants_v0` (the five cross-blueprint
  invariants such as "no purchase order before an inventory check"), the field-mapping compiler,
  the artifact-class part table, and the replayable `project_task_graph.v1` projection are
  separate, later commits and are **not** part of this file. See "Follow-ups" below.

## 1. Scope

`task_hierarchy_v1` defines one JSON shape — a **node** — used for any of five layers:
**Stage → WorkPackage → Task → Step → Action**. A `layer` field discriminates which one a given
node is. The schema (`task_hierarchy_v1.schema.json`) validates exactly this shape. This is a pure
data contract: it does not touch Rune's compiler, its MCP surface, or the artifact vocabulary
files. Nothing here mints Task instances from real project data — that mapping is commit 2's
"pure function (no fs/clock/net)" deliverable, tested against this contract but not part of it.

## 2. Layers, id rules, and required fields

| Layer | id rule (deterministic) | Layer-specific required fields | Source |
| --- | --- | --- | --- |
| `Stage` | `<stage_code>` as-is | `stage_code`, `stage_sequence` | Copied from Rune's `needs_stage_declarations` / `orderStageWork` stage grouping |
| `WorkPackage` | `wp:<stage_code>:<work_package_key>` | `stage_code`, `work_package_key`, `title_ko`, `owner_domain_rune` | **The only new layer.** Declared by a Blueprint, or defaults to one `wp:<stage_code>:default` per stage when no Blueprint declares Work Packages |
| `Task` | `task:<stage_code>:<artifact_type_id>` | `stage_code`, `artifact_type_id`, `node_kind`, `gate_role`, `satisfied_inputs`, `blocked_by`, `steps` | **Rune work item = Task, 1:1.** One row of `orderStageWork`'s `stages[].work_items[]` becomes one Task |
| `Step` | `step:<task_id>:<workflow_id>:<step_id>` | `task_id`, `workflow_id`, `step_id`, `seq`, `blueprint_ref` (must be non-null) | Same shape as `.workflow/<workflow_id>/step_graph.yaml`'s `steps[]` entries (`step_id`, `title`, `actor_slot`, `action.{kind,requires,validates,creates}`, `next.{on_success,on_fail}`) |
| `Action` | `action:<step_id>:<action_kind>` | `step_id`, `action_kind`, `effect_class`, `receipt_required` | Same `steps[].action.{kind, requires[], validates[], creates[]}` shape, promoted to its own addressable node |

**Id composition note**: `<task_id>` and `<step_id>` in the Step/Action id rules are the *full*
parent id strings, which already contain colons (a Task id is itself `task:<stage_code>:
<artifact_type_id>`). Expanded, a Step id therefore reads
`step:task:<stage_code>:<artifact_type_id>:<workflow_id>:<step_id>` (6 colon-separated segments),
and an Action id reads
`action:step:task:<stage_code>:<artifact_type_id>:<workflow_id>:<step_id>:<action_kind>`
(8 segments). The schema's `allOf`/`if`/`then` blocks encode the expanded form, not the
shorthand — a reader of the raw regex who expects a 3- or 4-segment id will be surprised
otherwise.

**Design additions beyond the brief's literal field list** (flagged here per the execution
contract's "surface assumptions" rule, not silently decided):

- `layer` is a new discriminator field. The brief's id-rule table distinguishes layers by id
  *shape* (a bare token vs. a `wp:`/`task:`/`step:`/`action:` prefix) rather than naming an
  explicit field, but a schema that dispatches required fields and id patterns per layer needs a
  directly-checkable value, and an explicit enum is clearer for a downstream reader (the Vigil
  world adapter) than re-deriving layer from id shape. Not sourced from Rune.
- `Task.stage_code` is listed here as required even though the brief's own layer table (§3.1)
  only lists `artifact_type_id`, `node_kind`, `gate_role` under Task's "필수" column. It is added
  because the Task id rule in the *same* table already requires `<stage_code>` to construct the
  id, and Rune's `orderStageWork` work items already carry `stage_code` 1:1 (verified at
  `stage_rule_compiler.mjs:1989`) — so this closes an internal inconsistency in the source table
  rather than introducing new scope.
- `Step.task_id`, `Step.workflow_id`, and `Action.step_id` are likewise added because the id rules
  for those layers cannot be reconstructed without them, and the brief's "필수" column for those
  two rows only lists the layer's own local key (`step_id`/`seq`/`blueprint_ref`,
  `action_kind`/`effect_class`/`receipt_required`).
- `Task.steps` (array of Step-id strings, empty by default) is added to carry the "which Step
  nodes did this Task mint" relationship using the same id-token-array idiom the contract already
  uses for `depends_on` (§3.2), rather than embedding full Step objects. This is also the field
  the "steps must be empty when blueprint_ref is null" rule (§4 below) constrains.
- **Known open gap, not resolved here**: a Task's id rule does not encode which WorkPackage it
  belongs to. In the Phase 0 default case (one `wp:<stage_code>:default` per stage) this is not
  ambiguous, but if a Blueprint ever declares more than one named WorkPackage per stage, nothing
  in this contract states how a Task is assigned to one of them. Left open for the owner decision
  already flagged in the brief (§13-3) rather than guessed at here.

## 3. Common fields (all layers)

| Field | Shape | Source |
| --- | --- | --- |
| `schema_version` | const `"soulforge.engineering_engine.task_hierarchy.v1"` | This contract |
| `owner_authority` | const `"rune"` | Drive §15.1 |
| `applicability` | `{business_type, prime_contractor, quality_grade, applies_when[]\|null}` | `business_type`/`prime_contractor`/`quality_grade` copied from the compiled variant (`stage_rule_compiler.mjs` `VARIANT_FIELDS`, validated `assertSafeString` at `:513`–`:516`); `applies_when` copied per-task, nullable (`:945`–`:946`) |
| `depends_on[]` | array of id tokens | Rune work item `depends_on` (`item.declared`, `stage_rule_compiler.mjs:2003`) |
| `dependency_scope` | `{same_stage[], earlier_stage[], forward_stage[], out_of_scope[], unresolved[]}` | Rune's `same_stage_inputs`/`earlier_stage_inputs`/`forward_stage_inputs`/`out_of_scope_inputs`/`unresolved_inputs` (`:2004`–`:2008`), renamed without the `_inputs` suffix per the brief's own §3.2 naming |
| `preconditions[]` | array of `{invariant_id, kind:"precondition", state}` | Populated by `task_invariants_v0` (commit 2). The exact `state` value set for a precondition record is not fixed by this contract — left as a non-empty string pending that commit |
| `completion_contract` | `{invariant_ids[], minimum_presence_rule, required_evidence[]}` | `minimum_presence_rule` copied verbatim from Rune's `PRESENCE_RULE` enum: `present` \| `present_or_not_applicable` \| `optional_context` (`stage_rule_compiler.mjs:105`–`109`) |
| `evidence_refs[]` | array of `{ref_kind, exact_ref, sha256\|null}` | Observation/receipt refs. No raw payloads — pointers only |
| `blueprint_ref` | `{workflow_id, version, version_source:"id_suffix"}` or `null` | `null` ⇒ `state: WORKFLOW_GAP`. `version` is derived from the workflow id's suffix (e.g. `_v0`), **not** a registry field — see "`.workflow` has no `version:` field" below |
| `state` | enum `READY \| BLOCKED_INPUT \| BLOCKED_PRECONDITION \| WORKFLOW_GAP \| SATISFIED \| UNKNOWN` | Computed (see §4 mapping table, `ready`/`blocked_by` row) |
| `claim_ceiling` | const `"observed"` | Same claim ceiling Rune's own receipt carries (`stage_rule_compiler.mjs:2029`) |

Task-only fields carried straight from the Rune work item, not re-derived: `satisfied_inputs[]`,
`blocked_by[]` (kept outside `dependency_scope`, unchanged names, `:2009`–`:2010`), `order_index`,
`dependents_count` (copied, not re-sorted, `:1988`, `:1995`), `engine_requirement_id`, `alias`
(nullable, `stage_rule_compiler.mjs:974`), `observation_state`, and a `provenance` object holding
`evidence_level` (enum `regulation_mandated \| guidebook_recommended \| prime_contract \|
general_se_guidance \| internal_management \| unstated`, `stage_rule_compiler.mjs:116`),
`evidence_rank` (number), `evidence_record[]`, and `depends_on_origin` (enum `canonical \|
generic_layer_projection \| mixed`, `:170`).

## 4. `orderStageWork` → `task_hierarchy_v1` field mapping (verified, no Rune output change)

Verified directly against `guild_hall/engineering_engine/engines/systems_engineering/rules/
stage_rule_compiler.mjs` on this lane's `main` (`d0f95448`): the work-item object literal spans
lines 1987–2013 (`for (const item of emitted)` starts at `:1981`), and the receipt object spans
lines 2025–2049. **Every field name the brief's §3.3 table cites was found present, with the exact
name given, at (or within two lines of) the line numbers the brief cited — no field-name mismatch
against the brief was found.** One naming subtlety worth flagging for whoever writes commit 2's
mapper: `evidence_rank` and `gate_role_rank` each appear **twice** in the compiler's output at two
different levels with two different meanings — once per work item (`gate_role_rank:
GATE_ROLE_RANK[item.node.gate_role] ?? 9`, a single number, `:1994`) and once on the whole receipt
(`gate_role_rank: {...GATE_ROLE_RANK}`, the entire rank table, `:2033`). The mapping below only
uses the per-item numbers; the receipt-level tables are not part of a Task node.

| Rune `orderStageWork` field (`stage_rule_compiler.mjs:1981`–`:2013`) | `task_hierarchy_v1` field |
| --- | --- |
| `stage_code` (work item), `stage_sequence` (stage) | `Stage.stage_code` / `.stage_sequence`; also copied onto `Task.stage_code` (see §2 design note) |
| `artifact_type_id` | `Task.artifact_type_id` + Task id material |
| `node_kind`, `is_virtual`, `gate_role`, `gate_role_rank` | Same-named `Task` fields (`is_virtual` not yet in the schema's property bag — see "Not yet in the schema" below) |
| `depends_on` | `Task.depends_on` |
| `same_stage_inputs` / `earlier_stage_inputs` / `forward_stage_inputs` / `out_of_scope_inputs` / `unresolved_inputs` | `Task.dependency_scope.{same_stage,earlier_stage,forward_stage,out_of_scope,unresolved}` |
| `satisfied_inputs` / `blocked_by` | `Task.satisfied_inputs[]` / `.blocked_by[]`, unchanged, outside `dependency_scope` |
| `ready` | `ready === true` and every applicable precondition invariant `SATISFIED` ⇒ `READY`; `ready === false` ⇒ `BLOCKED_INPUT` |
| `minimum_presence_rule` | `Task.completion_contract.minimum_presence_rule` |
| `evidence_level`, `evidence_rank` (per-item), `evidence_record`, `depends_on_origin` | `Task.provenance.*` |
| `engine_requirement_id`, `alias` | `Task.engine_requirement_id` / `.alias` |
| `observation_state` | `Task.observation_state` |
| `order_index`, `dependents_count` | `Task.order_index` / `.dependents_count` — copied, never re-sorted |
| Receipt `input_digests` / `output_digests` / `counts` / `effects` (`:2034`–`:2048`) | Embedded verbatim into the projection receipt's `upstream_receipt` block (commit 4 concern, not this schema) |

`is_virtual` is present in Rune's output and is real, verified data, but is not yet included as a
named property in `task_hierarchy_v1.schema.json`'s property bag for this commit — adding it is a
one-line schema change commit 2's mapper author should make when they need it, not invented ahead
of a consumer.

## 5. One-way rule

`task_hierarchy_v1` only *reads* Rune's `orderStageWork` output. There is no path from a Task
node, a Step node, or any evidence/receipt field back into Rune's compiler input, its stage rules,
or its MCP surface. Rune's judgement of what is `ready`, `blocked_by`, or what a stage requires is
never recalculated, only copied. This mirrors the brief's own instruction (§3.3, closing bullet)
verbatim.

## 6. `.workflow` has no `version:` field (owner decision, 2026-09-06)

None of the 71 entries in `.workflow/index.yaml` carry a `version:` field — the only version
marker is the id suffix (e.g. `_v0`). Per the 2026-09-06 owner review answer (brief §15 row 4),
this contract does **not** introduce a `version:` field into the `.workflow` registry contract.
Instead, `blueprint_ref.version` is derived from the referenced workflow id's suffix, and
`blueprint_ref.version_source` is fixed to the literal string `"id_suffix"` so a reader always
knows how `version` was obtained (as opposed to, say, a future registry-native version field).
Adding a real `version:` field to the registry is left as a `.workflow`-owner decision (see D48
candidate row, §7 below).

## 7. Follow-ups (not this commit)

- `task_invariants_v0` (`guild_hall/engineering_engine/contracts/task_invariants_v0.json`): the
  five cross-blueprint invariants (`INV-PROC-01` … `INV-BASE-05`) that populate `preconditions[]`
  and give `completion_contract.invariant_ids[]` real content. Commit 2.
- The pure-function field mapper (Rune work item → `task_hierarchy_v1.Task`) and its
  fail-closed test (an invariant may only make `ready:true` more conservative, never promote
  `ready:false` to `READY`). Commit 2.
- The artifact-class → part table and the replayable `project_task_graph.v1` JSONL projection with
  receipt. Commits 3 and 4.
- `Task → WorkPackage` linkage when a Blueprint declares more than one WorkPackage per stage (§2
  open gap above).

## 8. What a D46/D47 non-approval would invalidate

D46 (node kinds `artifact`/`activity`/`decision`, `depends_on`, `depends_on_origin`, gate roles)
and D47 (the instruction/guidance contract this document's `blueprint_ref`/`Step`/`Action` layer
partly draws on) are recorded in `guild_hall/engineering_engine/engines/systems_engineering/
manual/08_decisions.md:15`–`:20` as **code-landed but still owner-approval-pending proposals**
(`docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md` §8 is the canonical status). This
contract is written as a **candidate** precisely because of that: if D46 is not approved, every
`Task` node whose `node_kind` is `"activity"` or `"decision"` (rather than `"artifact"`) loses its
source authority, and this contract's `node_kind` enum and any `depends_on` edge whose
`depends_on_origin` is `generic_layer_projection` or `mixed` would need to be revisited alongside
it. Nodes derived only from `node_kind: "artifact"` rows with `depends_on_origin: "canonical"`
would be unaffected, since those predate D46.

## 9. Vocabulary overlay (out of scope for this contract's data, in scope for its awareness)

Five tokens the six-step example chain in the brief needs (`schematic`, `inventory`,
`purchase_order`, `wiring_diagram`, `backup`) do not exist in the canonical artifact vocabulary
(`generic_se_base` v0.4 has zero hits for any of them). Per the 2026-09-06 owner review answer
(brief §15 row 1), any such tokens are **candidate overlay only**
(`vocabulary_state: "candidate"` in a sibling `vocabulary_overlay_candidates_v0.json`, commit 3's
concern) and are never fed into Rune's compiler input. `task_hierarchy_v1` itself carries no
vocabulary tokens — `artifact_type_id` is an opaque string as far as this schema is concerned.
