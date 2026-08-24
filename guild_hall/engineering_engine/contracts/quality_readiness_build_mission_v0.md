# E01 Quality Readiness — bounded build mission v0

Status: implementation candidate only
Execution owner: Hermes profile `engine_builder`
Observed implementation runtime: `openai-codex/gpt-5.6-terra`; initial build `max`, bounded repairs `high`, fallback `0`
Concurrency: one active run, no delegation, no background fan-out, no MoA
Baseline commit: `e7f465ccbe0243efe5678cdf1a5a7dd05bbcde35`
Accepted source packet: `quality_readiness_source_packet_v0.md`
Accepted packet SHA-256: `22507ce2ba2b5aeac6937d4adfbe2627002cd361990d006847173dac6a02e60c`

## 1. Outcome

Implement one deterministic, read-only E01 module that answers only:

> 단계별 품질 활동·산출물·수락 근거가 충분한가?

The answer is evidence readiness against exact accepted rule, source, module, and project
bindings. It is never product acceptance, compliance, disposition, release, or task authority.

## 2. Reuse and seam

- Reuse `kernel/module_binding.mjs` for manifest and binding validation.
- Reuse `kernel/authority.mjs` for the five applicability components and source authority.
- Reuse `kernel/snapshot.mjs` gap values: `satisfied`, `gap_missing`, `gap_unknown`, and
  `gap_conflict`. A domain-only `not_applicable` result is allowed only after all five
  applicability components resolve and at least one is explicitly false.
- Reuse `kernel/canonical.mjs`, `kernel/fingerprint.mjs`, and existing exact-ref conventions for
  deterministic digests and receipts.
- Do not copy or alter the common kernel, create another registry/ledger/writer/MCP server, mint a
  new shared gap value, or add an LLM path.

## 3. Package shape

Use the current repository categories and the same names for future engine modules:

```text
guild_hall/engineering_engine/
  contracts/quality_readiness_source_packet_v0.md
  contracts/quality_readiness_build_mission_v0.md
  stage_rules/quality_readiness_rules.mjs
  subjects/quality_readiness.mjs
  fixtures/quality_readiness_public_synthetic.mjs
  tests/quality_readiness.test.mjs
  tools/quality_readiness_runner.mjs
  topology/quality_readiness_module_manifest.mjs
  manual/quality_readiness/
    README.md
    01_purpose_and_shape.md
    02_rule_layers.md
    03_source_derivation.md
    04_vocabulary.md
    05_evaluator.md
    06_evidence_trace.md
    07_runs_and_receipts.md
    08_decisions.md
    09_next_work_and_handoff.md
    10_observation_boundary.md
    11_guidance_boundary.md
    12_integration_door.md
```

The twelve manual files are short domain deltas that mirror the common manual. They link to the
common chapters instead of copying shared explanations. This gives every later engine the same
document order without duplicating the chassis.

## 4. Public API and bindings

Export one deep entry point:

```js
assessQualityReadiness({ manifest, binding, domain_input, cutoffs })
  -> { assessment, domain_result, receipt }
```

Required additional binding fields:

- `source_packet_ref`: exact revision and SHA-256 of the accepted packet.
- `accepted_rule_ids`: explicit, sorted, unique row-by-row Owner acceptances. It must never
  default to every candidate. An unaccepted rule remains data and cannot execute.
- exact adapter/ruleset revisions and the current accepted context generation.

Each domain row carries only bounded metadata and exact refs: stable case/rule/stage IDs, all five
applicability components, observation attempt and presence state, evidence refs, any approved
evidence selection/criteria/evaluated result refs, authority refs, and optional two-sided conflict
claims. Source bodies, project payload, raw transcripts, hidden reasoning, secrets, and absolute
private paths are refused.

## 5. Deterministic evaluation order

For each accepted row, in stable rule/case order:

1. Refuse stale, floating, mismatched, unknown, or unaccepted bindings.
2. Resolve all five applicability components.
3. Explicit false after complete resolution -> domain `not_applicable`; any unknown ->
   `gap_unknown`.
4. A valid retained two-sided disagreement -> `gap_conflict`.
5. Missing required authority -> `gap_unknown` with `authority_hold: true`.
6. No observation attempt or inaccessible evidence -> `gap_unknown`.
7. Positively confirmed absence of the exact required evidence -> `gap_missing`.
8. Evidence presence may become `satisfied` only when the rule-specific sufficiency facts are also
   present. For `QR-MIL-02`, approved evidence selection, measurement/evaluation criteria, and an
   evaluated result are all mandatory. Presence alone is not sufficient.

Preserve source modality and `artifact_token: null`. Never map `defect_action_report`, `wps`, or
`training_material` by near-synonym.

## 6. RED-first fixture and tests

Write the public-synthetic fixture and tests first, run them once while the implementation entry
point is absent, and retain the concise failing command/result in the final run report. Then make
the smallest implementation that turns the same tests green.

The locked five cases are the source packet's `SATISFIED`, `MISSING`, `UNKNOWN`, `CONFLICT`, and
`AUTHORITY_HOLD` rows. Tests must also prove:

- input immutability and output deep freeze;
- stable ordering and exact counts under reordered input;
- exact packet/module/rule binding and explicit accepted-rule allowlist;
- source modality retained in each result;
- null preservation and hostile near-synonym rejection;
- floating/stale/mismatched refs fail closed;
- no product acceptance/compliance/disposition fields are emitted;
- receipt has digests/counts/bindings only and every filesystem/network/model/RAG/wiki/ERP/task/
  approval effect counter is zero;
- the runner writes nothing and returns deterministic JSON on stdout.

## 7. Stop conditions

Stop without fallback if the accepted source-packet hash differs, a common-kernel change appears
necessary, a new shared vocabulary/state is required, an official or project source body would
need to be copied, a real project applicability decision is needed, a manifest cannot be made
truthful before commit/test receipts exist, or any external effect is required. A pre-release
manifest factory may require exact values from its caller; it must not publish placeholder values
as a verified release.

## 8. Definition of done for this Hermes run

- Only the listed package files and a narrowly scoped package script/README link if essential.
- Focused RED evidence, focused GREEN tests, syntax checks, and relevant existing kernel tests.
- `git diff --check` clean; no commit, push, profile/config change, provider change, or external
  mutation.
- Final report lists changed files, commands/exits, test counts, remaining Owner gates, and exact
  UNKNOWN/HOLD items. Do not claim production activation or source/canon adoption.

## 9. Revision gate after fresh Sol review

The first GREEN fixture proved the module shape but not the source semantics. A fresh Sol/max
review returned `HOLD`. Revision 1 must close the following items without changing the common
kernel.

### 9.1 Exact execution and source bindings

- Bind exact `engine_ref`, `objective_ref`, `policy_ref`, and `snapshot_ref` in addition to the
  existing common binding fields.
- Bind exactly the three accepted source IDs with separate exact `metadata_revision_ref` and
  `body_revision_ref`. Metadata and body are not interchangeable.
- Replace bare `accepted_rule_ids` with sorted `accepted_rule_bindings`. Each entry carries the
  `rule_id`, exact `stage_ref`, and exact `owner_acceptance_ref`. The evaluator must not invent a
  lifecycle or quality-stage taxonomy.
- Reject `latest`, `current`, `head`, branch names, wildcards, ranges, or equivalent floating text
  wherever a revision is required, including common opaque revision fields.
- Expose these bindings in the payload-free receipt.

### 9.2 Typed authority, applicability, and non-applicability

- Each rule declares its required existing authority families. MIL and NASA candidates require
  `project_contract_baseline`; FAR candidates require both `project_contract_baseline` and
  `applicable_law_and_regulation`.
- Replace untyped `authority_refs` with sorted typed authority bindings. Each binding includes an
  existing authority family plus exact role, delegation, and decision refs. An evidence ref cannot
  satisfy this shape.
- The module manifest's `authority_ceiling` is `project_contract_baseline`, not a claim-ceiling
  value.
- A resolved false applicability component requires an exact `not_applicable_basis_ref`; a bare
  Boolean false cannot emit `not_applicable`.

### 9.3 Executable source prerequisites and evaluated outcome

- Preserve exact source modality in locked rule metadata, but also make the packet's prerequisites
  executable as exact context refs. At minimum cover invocation/scope for MIL, FAR jurisdiction,
  agency procedure/path/exceptions/completed actions/inspection record for `QR-FAR-02`, selected
  branch/class/technical evidence/proposed disposition for `QR-FAR-03`, and NASA flow-down,
  tailoring/scope/baseline/route facts for the NASA rows.
- `QR-MIL-02` may use the exact `manufacturing_process_flow` mapping or an approved source-native
  evidence type with `artifact_token: null`; the non-exhaustive example is not mandatory.
- Evidence presence never equals sufficiency. Every present, non-conflict row that reaches judgment
  requires an exact `evaluation_result_ref` and bounded `evaluation_result_state` of
  `criteria_met`, `criteria_not_met`, or `unknown`. Only `criteria_met` can emit `satisfied`;
  `criteria_not_met` emits `gap_conflict`; absent/unknown evaluation emits `gap_unknown`.
- Confirmed absence needs an exact observation-attempt ref; auxiliary evidence refs may be empty.
- Conflict output retains all sides plus the common kernel's governing authority and resolution
  rationale.

### 9.4 Axis and manifest compatibility boundary

- New E01 assessment/result fields name the axis explicitly: `canon_claim_ceiling` and
  `evidence_claim_ceiling`. Validate values with the existing ceiling helpers and never convert
  between axes.
- The common module manifest still requires the legacy bare `claim_ceiling` field. Keep it only as
  a compatibility field validated as canon `source_supported`, document the debt, and keep actual
  release/promotion `HOLD` until the common manifest ABI owner decides an axis-explicit revision.
  Do not change `kernel/module_binding.mjs` in this leaf.

### 9.5 Adversarial input and independent semantic lock

- Snapshot input through descriptor inspection: reject accessors, hidden properties, custom
  prototypes, sparse/named arrays, symbols, aliases/cycles, and prototype-sensitive keys including
  `__proto__`, `prototype`, and `constructor`. Build copies with null prototypes or explicit data
  properties so distinct accepted inputs cannot collide after normalization.
- Add hostile tests for accessor execution, prototype/digest collision, floating revisions,
  authority/evidence type confusion, missing FAR prerequisites, negative/unknown evaluation,
  non-applicable without basis, and source metadata/body mismatch.
- Add an independent literal expected-rule table in tests. Assert every rule's ID, source, locator,
  exact modality, allowed artifact mapping, required authority families, and context-ref fields;
  importing the implementation's own digest is not an independent semantic lock.
- Fix the three broken common-manual links: domain chapters 10/11/12 point respectively to
  `../10_observation_eye.md`, `../11_guidance_layer.md`, and `../12_mcp_door.md`.

### 9.6 Revision acceptance

Update the source packet's assessment-port/binding/fixture/acceptance prose to match this exact
shape, recompute its SHA-256, and update the single canonical source-packet ref. Then capture a
new RED failure for at least the typed-authority or evaluated-outcome guard, turn it GREEN, run all
focused and relevant kernel tests, run the runner twice, validate every manual link, and run
`git diff --check`. Keep commit, push, common-kernel change, release, and production activation
outside the Hermes repair run.
