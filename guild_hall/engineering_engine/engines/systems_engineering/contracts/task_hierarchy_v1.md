# task_hierarchy_v1 (candidate — not canon)

- Status: **candidate**, not accepted canon. This document and its sibling schema
  (`guild_hall/engineering_engine/engines/systems_engineering/schemas/task_hierarchy_v1.schema.json`) describe a proposed
  machine contract for the layer Rune (`engineering_engine`) does not yet name: what sits between
  a Stage's expected artifacts (which Rune already computes) and the individual Step/Action work
  that produces them.
- Owner authority for Task creation is Rune (Drive `Soulforge_맥락·메모리·그래프·온톨로지_구현계획_v0.1`
  §15.1). This contract does not change, override, or feed back into any Rune judgement — see
  "One-way rule" below.
- Owner surface for this contract is the `systems_engineering` package
  (`guild_hall/engineering_engine/engines/systems_engineering/{contracts,schemas,tests}/`), the
  package whose `orderStageWork` is its only projection source today. The legacy flat
  `guild_hall/engineering_engine/contracts/` is pointer-only by rule
  (`tools/validate_no_duplicate_authority.mjs`; the 2026-09-06 review answer recorded in
  `RUNE_TASK_GRAPH_PHASE0_BRIEF_2026-09-06.md` §15 row 3 had named that directory and CI rejected
  it the same day). Hoisting to `core/` is deferred until a second engine projects into this
  contract; that move must also classify the new `core/` subdirectory in
  `core/tests/zero_time_static_effect.test.mjs`.
- This contract is the bounded Phase 0 §16 alignment slice. The mapper, invariant enforcement,
  artifact-class part table, and replayable projection remain separate later slices.

## 1. Scope and compatibility

This is the candidate contract alignment required by
[`2026-09-06_soulforge_to_gpt_07_reply.md` §b.2](../../../../../docs/reviews/exchange/2026-09-06_soulforge_to_gpt_07_reply.md)
and the reviewed Rune Phase 0 brief §16. Those corrections supersede the original
commit-1 claim that one expected work item is automatically one actual Task.

The five compatibility layer names remain **Stage → WorkPackage → Task → Step → Action**.
`Task` now explicitly means an **expectation projection** (`node_role: "expectation"`).
An expectation can justify a future Rune-owned Task, but cannot create or identify that
Task by itself. The schema version and local id spellings remain unchanged because this
is an unaccepted candidate; required `scope` and `procedure_state` distinguish the aligned
shape. Pre-§16 unscoped rows are rejected, not silently migrated. A caller must supply
the actual project/product scope and original evidence before rebuilding them.

This slice adds shape and reference validation only. No mapper, invariant enforcement,
artifact classification, projection writer, real project reader, MCP change, clock,
network call, or state mutation is authorized or implemented by this contract.

## 2. Scoped identity and membership

Every node requires `scope: {project_id, product_id}`. Both values are exact opaque tokens.
The join key is the ordered tuple **(project_id, product_id, id)**. The same local id
may occur in different projects or products; two occurrences in one scope are rejected.
No scope may be inferred from a filename, stage, title, order index, or receipt digest.

| Layer | Local id reconstruction | Required layer data |
| --- | --- | --- |
| Stage | `stage_code` | `stage_code`, `stage_sequence` |
| WorkPackage | `wp:<stage_code>:<work_package_key>` | `stage_code`, `work_package_key`, `title_ko`, `owner_domain_rune` |
| Task expectation | `task:<stage_code>:<artifact_type_id>` | `stage_code`, `artifact_type_id`, source work-item fields (§4), `steps[]`, `node_role`, membership fields below |
| Step | `step:<full task_id>:<workflow_id>:<local step_id>` | `task_id`, `workflow_id`, local `step_id`, `seq`, `title`, `actor_slot`, `next`, `definition_ref`, non-null `blueprint_ref` |
| Action | `action:<full Step id>:<action_kind>` | full parent `step_id`, `action_kind`, `effect_class`, `receipt_required`, `definition_ref`, non-null `blueprint_ref` |

Task ids are local expectation keys, never durable actual-task ids.
`order_index` plus an upstream digest identifies an occurrence in a particular projection;
it is not a permanent business identity. Artifact revisions and execution episodes remain
separate Rune-owned relations, outside this node shape.

Task membership is an explicit typed relation, represented by:

- `work_package_ref: {project_id, product_id, id} | null`;
- `work_package_basis_refs[]`: exact binding pointers and non-null SHA-256 digests;
- `actual_task_ref: null`: an intentional restriction until a Rune-approved actual-task
  relation contract supplies scope, authority, uniqueness, and evidence rules.

A non-null WorkPackage reference requires at least one binding evidence reference, exactly
one existing WorkPackage in the same project/product, and the same stage. Wrong-project,
wrong-product, wrong-stage, missing, and duplicate endpoints fail validation. No default
membership is inferred, even when there is only one WorkPackage. Unknown or ambiguous
membership remains `null` with an empty basis list; multiple WPs may coexist. Explicit,
evidence-backed membership to one of those WPs is allowed.

Step `task_id`, Action `step_id`, and Task `steps[]` resolve only inside the node's exact
scope. A Task must list each child Step once; every listed Step must point back to it.
A Step's local `step_id` differs from an Action's full parent `step_id`.
All ids must equal their reconstruction from fields, not merely match a regular expression.

## 3. Evidence state and procedure availability

All nodes carry `schema_version: "soulforge.engineering_engine.task_hierarchy.v1"`,
`owner_authority: "rune"`, `claim_ceiling: "observed"`, applicability, source dependencies,
preconditions, completion conditions, evidence pointers, and Blueprint availability.

| Field | Meaning |
| --- | --- |
| `state` | Existing work/evidence state: READY, BLOCKED_INPUT, BLOCKED_PRECONDITION, SATISFIED, UNKNOWN |
| `procedure_state` | Procedure availability only: READY or WORKFLOW_GAP |
| `blueprint_ref` | `{workflow_id, version, version_source: "id_suffix"}` or `null` |

A null Blueprint requires `procedure_state: "WORKFLOW_GAP"` and zero Steps.
It never overwrites `state`, `ready`, `observation_state`, or other source evidence.
A resolved Blueprint requires `procedure_state: "READY"`. This READY says only that a
procedure is available; it does not authorize execution, accept a result, or make blocked
source inputs ready. A projected `state: READY` cannot promote source `ready:false`.

Unversioned workflow ids stay unresolved with a null Blueprint. A non-null Blueprint must
use a `_vN` suffix, an exactly matching `version: "vN"`, and `version_source: "id_suffix"`.
Step and Action Blueprints must match their parent's exact workflow/version.
A Step's own `workflow_id` must match its Blueprint. This does not add a registry version
field or verify workflow bytes: exact approved version policy remains the workflow owner's
D48 decision; definition pointers must be resolved and verified by the future source reader.

## 4. Source field preservation

The current `orderStageWork` source is
`rules/stage_rule_compiler.mjs` in this package. Every work-item property is represented
without recomputation; source-token arrays are not hierarchy node references.

| Source | Required Task expectation field |
| --- | --- |
| `stage_code`, `artifact_type_id`, `node_kind`, `is_virtual`, `gate_role`, `gate_role_rank` | Same names |
| `order_index`, `dependents_count`, `engine_requirement_id`, `alias`, `observation_state`, `ready` | Same names; alias retains null |
| `depends_on` | `depends_on` (source artifact tokens, not invented task ids) |
| `same_stage_inputs`, `earlier_stage_inputs`, `forward_stage_inputs`, `out_of_scope_inputs`, `unresolved_inputs` | `dependency_scope.{same_stage,earlier_stage,forward_stage,out_of_scope,unresolved}` |
| `satisfied_inputs`, `blocked_by` | Same names |
| `minimum_presence_rule` | `completion_contract.minimum_presence_rule` |
| `evidence_level`, `evidence_rank`, `evidence_record`, `depends_on_origin` | `provenance.*` with unchanged names |

Ordering and arrays must be copied, not sorted again. Required integer counts/ranks are
nonnegative; numbers must be finite; observation and provenance values use the source enums.
Schema validation never mutates or coerces source values. A later mapper must independently
test all fields against source and prove the upstream digest is unchanged; schema shape
validation alone is not evidence that a mapper preserves values.

Applicability is supplied from the compiled variant/source context, not invented from a
work-item row. `applies_when` preserves its source array or null.

Step `title`, `actor_slot`, and `next.on_success/on_fail` are copied when provided, retaining
absent versus explicit null next targets. These next values are workflow-local source keys,
not hierarchy refs or an execution transition policy. Other workflow next conditions remain
in `definition_ref`; the future source reader must not discard their meaning.
Action `requires[]`, `validates[]`, and `creates[]` are copied when present and omitted when
absent, never filled with guessed empty arrays. Each Step/Action carries an exact
`definition_ref` plus SHA-256 for its complete source definition, including other fields
outside this bounded projection. `effect_class` and `receipt_required` need approved source
mapping; the contract does not infer action authority.

## 5. Validation and public/private boundary

Use both sibling validator APIs:

1. `validateJsonSchemaSubset(node, schema)` for closed shape, required fields, enums and types.
2. `validateTaskHierarchyNodes(nodes, schema)` for the complete scoped node set, including the
   same schema validation, duplicate detection, deterministic id reconstruction, membership,
   parent/child integrity, and Blueprint agreement.

Both return error arrays and leave inputs unchanged. Missing context fails closed;
validation does not resolve files, registry entries, canonical Task bindings, or evidence
acceptance. Passing means structurally consistent candidate data, not approved truth.

Evidence and definition references contain only `ref_kind`, an opaque `ref:` locator,
and SHA-256 (nullable for observation/receipt evidence only). Raw bodies, extra fields,
absolute paths, query-bearing URLs, and traversal references are rejected. Locators use
slash-separated alphanumeric-leading tokens containing only letters, digits,
underscores, dots, or hyphens. Colons after `ref:`, leading/repeated slashes, and backslashes
are forbidden, including Windows paths or URL schemes hidden behind the `ref:` prefix.
Caller-owned resolvers retain payloads and private bindings outside public code. Public tests use only
synthetic project/product ids, tokens and opaque refs; they do not read real project data
or secrets. These syntax checks do not replace classification of source content.

## 6. One-way rule

The projection reads Rune output and preserves its evidence. It cannot feed back into the
compiler, stage rules, MCP surface, actual Task ledger, artifact revision history, or execution
episodes. Preconditions and completion conditions describe approved evidence requirements;
this contract adds no invariant execution or blocking authority. In particular, a missing
procedure never manufactures Steps or changes coverage.

## 7. Follow-ups and claim limit

The mapper and digest-preservation tests follow this contract closure. Invariant enforcement,
artifact-class/part dictionaries, fixed-generation replay, atomic receipt/projection output,
bitemporal corrections, and live readers/writers are later slices. The expanded substitution,
rework/revision/episode, cancellation, reuse, correction and duplicate-execution scenarios in
brief §16 must be tested when those relation/projection surfaces exist. They are not claimed
as implemented by node shape and scoped parent validation.

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
