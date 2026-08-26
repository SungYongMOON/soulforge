# guild_hall/engineering_engine

## Package Architecture & Layout

The Engineering Engine is structured into an orchestration Core, decoupled Domain Engines, and public-safe Engineering Profiles:

1. **`core/`**: Shared validation and runtime orchestration core.
   - `interfaces/`: Canonical Domain Engine Adapter (`domain_engine_adapter.mjs`), Project Profile Adapter (`project_profile_adapter.mjs`), Project Binding Adapter (`project_binding_adapter.mjs`), and the Profile operation canonicalisation contract (`profile_operation_canon.mjs`).
   - `rule_assembly/`: Profile resolution, rule assembly coordination, and compilation trace generation (`profile_resolver.mjs`, `rule_assembler.mjs`, `compilation_trace.mjs`).
   - `evaluation_runtime/`: Multi-domain evaluation dispatch, result envelopes, and claim ceilings (`evaluation_coordinator.mjs`, `result_envelope.mjs`, `claim_ceilings.mjs`).
   - `validators/`: 25 canonical data and execution guards (`canonical.mjs`, `fingerprint.mjs`, `identity.mjs`, etc.).
   - `runtime/`: Core engine pass execution logic (`engine_pass.mjs`).

2. **`engines/`**: Domain Engine implementations adhering to the Core Interface.
   - `engines/systems_engineering/`: Systems Engineering (SE) domain package with contracts, fixtures, 12-chapter manual, rules compiler, evaluation subjects, compiler/evaluator adapters, and `engine.yaml`.
   - `engines/quality_readiness/`: Quality Readiness (QR) domain package with contracts, public synthetic fixtures, 14-chapter manual, evaluation suite, compiler/evaluator adapters, tests, and `engine.yaml`.
   - `engines/database_engineering/`: Database Engineering (DBE) domain package with source-pinned relational/SQLite/PostgreSQL contracts, closed Project Binding and receipt schemas, deterministic analyzers, compiler/evaluator adapters, public synthetic fixtures, tests, and a 12-chapter manual.

3. **`.registry/engineering_profiles/`**: Public-safe schema and profile catalog.
   - `schemas/engineering_profile_schema_v0.json`: Schema governing Organization and Project profiles.
   - `organizations/`: Organization tailoring profiles and catalog documentation.

4. **Root Shared Tooling vs. Domain-Owned Implementation**:
   - **Root Shared Tooling (`tools/`)**: Contains whole-engine generator and integration tooling (`emit_manifest.mjs`, `emit_release_manifest.mjs`, `emit_topology.mjs`, `phase_1_integration_check.mjs`, `validate_no_duplicate_authority.mjs`). Domain-specific CLI scripts under `tools/` act as thin forwarding stubs to their respective canonical domain package runners.
   - **Domain-Owned Implementation (`engines/<domain>/`)**: Each domain package (`systems_engineering/`, `quality_readiness/`, `database_engineering/`) owns its domain rules, evidence contracts, evaluators, guidance, test suites, fixtures, and domain-specific tool runners.

5. **Compatibility Re-exports**:
   - `kernel/`, `assembly/`, `stage_rules/`, `subjects/`, `observation/`, `guidance/`, `evaluation/`, `mcp/`, `fixtures/`, and `tests/` maintain backward-compatible re-export and forwarding stubs to preserve existing imports, CLI tools, and deterministic verification harnesses.

## Core Interface pre-admission

The Core admits or snapshots the Domain Adapter, outer effective-rule envelope, Profile binding
containers, compilation scope, and Project Evidence inputs before caller-owned properties are
used. Proxy, revoked Proxy, accessor, symbol, custom/null-prototype, sparse, named-array, and
cyclic shapes fail with a closed Core error and do not reach compilation, digesting,
or a Domain Adapter. This is a domain-neutral seam guard: nested domain rules, Typed Facts
semantics, and verdict logic remain owned and revalidated by each Domain Engine.

Project Evidence cutoff instants use the same configured millisecond precision and real-calendar
validation as the Core canonical serializer; permissive ISO-looking timestamps are not admitted.

## Profile operation canonicalisation and the null contract

`core/interfaces/profile_operation_canon.mjs` is the single Core authority for normalised
Profile operations and their `operation_digest`. Core `validateProfileBinding` and every domain
compiler call `normalizeProfileOperations` and nothing else; a second local copy of the formula
is what previously let two sides agree on a wrong answer.

What the contract holds:

- JSON `null` is a value in Profile operations, not an absence. It survives normalisation in
  arrays and in object properties, so a rule binding `allowed_artifact_tokens: [null]`
  (source-native evidence is accepted) stays distinguishable from `[]` (no artifact is accepted).
  The two produce different `operation_digest` values and different compiled rule material.
- Normalisation is a frozen deep clone. The caller's object is never mutated, and later mutation
  of the caller's object cannot change what was digested.
- Only plain JSON data is accepted. Proxies, accessors, symbol keys, class instances,
  null-prototype objects, prototype-sensitive keys, cycles, and nesting past
  `PROFILE_OPERATION_MAX_DEPTH` fail closed with `PROFILE_OPERATIONS_INVALID`.
- Scalars stay with the PC-11 serialiser in `core/validators/canonical.mjs`: integers, instants,
  NFC keys, and key-collision refusal are not re-decided here. Null-free operations therefore
  keep the exact bytes, and the exact digests, they had before this contract existed.

Claim boundary:

- This contract covers Profile operations only. The effective-rule and observation projections in
  `domain_engine_adapter.mjs` keep the historical `withoutNulls` projection, because accepted SE
  compatibility is pinned to the digests it produces. A domain that needs `null` to reach the
  Core effective-rule digest must carry that distinction in its own derived ruleset ref, as the
  QR compiler does through `allowed_artifact_mappings`.
- Preserving `null` is a canonicalisation guarantee, not a semantic one. Core does not know what
  a `null` token means; the owning domain engine does.

## SE-core source-pack and fixed-case evaluation

The public-safe SE-core evaluation seam has seven distinct layers:

- `subjects/se_core_crosswalk_projection.mjs` accepts only the exact public
  corpus membership, an independently reviewed page-to-rule crosswalk, and its
  review receipt. It emits a candidate common-SE projection and excludes
  evaluator labels, candidate applications, source bodies, Notebook answers,
  and project payloads from runtime material.
- `subjects/se_core_crosswalk_case_run.mjs` transcribes the seven exact pinned
  synthetic prompts into typed observations and runs the existing Engine and
  access/binding guards. It is a fixed-case judgment/reference harness, not a
  general natural-language classifier.
- `subjects/se_core_source_cited_answer_run.mjs` turns those observed typed
  judgments into deterministic, human-readable answers and attaches only the
  independently reviewed public source/page commitments or Engine-boundary
  contract refs. It does not read evaluator gold, call a model, or perform
  open-ended PDF retrieval.
- `evaluation/se_core_eval_ledger.mjs` owns the metadata-only append ledger for
  immutable attempts, direct artifact hashes, review links, and Engine row
  commitments. Raw answers and source bodies remain in the workspace payload
  plane and are never copied into the ledger.
- `evaluation/se_core_eval_qa_continuation.mjs` anchors that closed 70-event
  ledger and records later source-cited answer attempts and reviews in a
  separate metadata-only hash chain. The earlier ledger bytes remain immutable.
- `evaluation/se_core_eval_human_report.mjs` renders the verified question,
  answer, review, and Engine-attempt evidence as Markdown for human inspection.
  It is read-only by default and never treats the report as a new authority.
- `evaluation/se_core_eval_qa_capture.mjs` appends future question, answer, and
  review turns to a separate metadata-only hash chain while raw text remains in
  explicit workspace files. It never rewrites the closed 70-event ledger.
- `evaluation/se_core_eval_notebook_query_capture.mjs` runs exactly one
  NotebookLM command shape — `nlm notebook query <notebook_id> <question>
  --conversation-id <fresh_uuid> --source-ids <csv> --profile <profile> --json
  --timeout <seconds>` — and records the turn through the same capture contract.
  It cannot select login, notebook create/delete, source add/sync/import,
  research start/import, note mutation, chat deletion, or any other verb, and it
  never inspects or manages authentication.
- `evaluation/se_core_eval_qa_human_report.mjs` renders that prospective QA
  capture ledger as one readable Markdown projection with Korean section labels.
  It is a derived view, never an authority: the ledger and the hash-bound raw
  question and answer files stay canonical, and it declares no verdict, score,
  or winner. The projection is total over every ledger state the capture contract
  accepts, so no single recorded turn can make the report unbuildable.
- `evaluation/se_core_eval_qa_report_writer.mjs` is the one place that
  projection is written to disk. The report CLI's explicit create-only and
  guarded refresh modes and both live capture lanes go through it, so an
  automatic refresh can never write a file the explicit CLI would refuse.

The crosswalk, source-cited answer, and ledger CLIs default to stdout/read-only behavior.
An output file is created only through an explicit create-only option. The
Engine runner invokes no learned model, provider, network, ERP writer, or
Notebook surface.

Both providers can now be captured the moment they answer, so no evaluation turn
depends on a later manual transcription step.

## Automatic derived report

Every capture lane keeps one readable Markdown file level with the ledger, so a
captured question or answer never needs a separate manual command to become
visible. The basename is fixed — `SE_CORE_EVAL_QA_INTERACTIONS_KO.md` — and it
lives directly under the explicitly supplied capture root.

The first capture creates it only if that basename is free. A later capture
refreshes it only when three signals still agree: the entry is a plain regular
file, not a symlink, junction, or other reparse point; it carries no second hard
link; and its bytes prove on their own that this renderer produced exactly them.
That last signal is a body commitment written into the file's own head — the
SHA-256 of everything below it — so recognition needs no digest from the caller
and a marker alone is never enough. A hand-edited body under a copied head no
longer matches its own commitment and is refused.

The replacement is staged as a create-only sibling in the same directory. That
create-only open is also the ownership proof: only a staged file the call itself
created is ever unlinked. The recognized bytes are re-read and compared after
staging so a file that drifted underneath is caught, and one rename swaps it in.

What a refusal actually does, and its limits:

- An arbitrary, human-written, or hand-edited file at the report path is never
  overwritten, and its bytes are left byte-identical.
- A report written in an earlier format that carries no body commitment is not
  recognized either. It holds. There is no automatic migration: the repair is a
  human moving or deleting that file, after which the next capture creates the
  report normally.
- A foreign file already occupying the `.refresh-tmp` staging sibling is refused
  and left untouched, not deleted. Until a human removes it, refreshes under that
  root keep holding.
- "No residue" means only that this seam leaves nothing of its own behind: a
  staged file it created is removed on every failure path it can observe. A
  crash between the create-only open and the cleanup can still leave one, and
  the next refresh then holds on it as a foreign file.

Bytes the projection cannot show exactly — invalid UTF-8, a byte-order mark, a
lone carriage return, a control character, a U+FFFD nobody recorded — do not
refuse. The capture contract accepts any non-empty bytes, so refusing them here
would let one recorded turn make the report unbuildable and every automatic lane
under that root exit nonzero forever. They are written in one explicit escaped
notation instead: `\xNN` for a byte that starts no valid scalar, `\u{XXXX}` for
an unshowable scalar, `\\` for a backslash, with line feed and tab left as they
were. Each block states which notation it used in its `원문 표시 방식` row, and
the render report counts them in `escaped_body_count`. Nothing is translated,
cleaned up, or dropped.

The three lanes differ only in when they refresh:

- The NotebookLM lane refreshes once on the branch that is about to query — so a
  pending question is readable before the provider is ever asked — and once
  after the answer turn. That first refresh runs *after* the at-most-once
  preflight, not before it: an orphaned, conflicting, closed, or unresolved
  attempt reports its own outcome, and a report that cannot be built never
  stands between an already-recorded response and the answer turn that resumes
  it. A refusal before the query holds with `query_performed: false` and no
  provider invocation; a refusal after the query or after a resumed answer turn
  holds with the captured counts retained and `report_refresh_pending: true`. A
  retry of that attempt resumes from the stored response, queries nothing, and
  only rebuilds the derived view.
- The Engine source-cited lane refreshes once after a successful fourteen-turn
  batch, and reports `report_basename`, `report_operation`, and
  `report_sha256`. A refused refresh fails that run with the writer's own closed
  issue code rather than claiming a readable report; the append-only ledger keeps
  what it recorded, and a retry reuses the same bytes idempotently and repairs
  the file. The report path is part of the owned-target projection, so an
  `--out` or `--receipt-out` aimed at it is refused preflight, before any claim
  or capture.
- The low-level QA capture CLI refreshes after `record-question`,
  `record-answer`, `record-review`, and `import-existing`. `initialize`,
  `validate`, and `query` are read-only and unchanged. A refused refresh exits
  nonzero and still reports the exact ledger facts the append reached, marked
  `report_refresh_pending: true`, instead of unwinding a recorded turn.

The report remains a reconstructable derived view with no authority. Truth and
evidence stay in the append-only ledger and the hash-bound raw question and
answer files, and the frozen 70-event and 115-event benchmark ledgers and their
reports are neither read nor written by this lane.

The source-cited answer CLI takes three all-or-nothing `--capture-*` flags:
`--capture-root` (an existing absolute private evaluation root),
`--capture-attempt-id`, and `--capture-event-time` (one strict UTC instant used
for every event in the batch). With none of them the CLI behaves exactly as
before, byte for byte. With all three it records the seven exact question texts
and the seven rendered answer texts as fourteen individual turns and prints one
redacted receipt on stderr; a later distinct attempt reuses the byte-identical
questions idempotently and adds only its seven answers. Capture is per turn, not
per batch: a refusal fails the CLI and no receipt is emitted, and a retry with
the same bytes resumes idempotently rather than duplicating.

Output and capture are ordered. Every supplied `--out` and `--receipt-out` is
claimed create-only before the ledger is touched, so a run that names an already
occupied output refuses with zero capture events appended, no capture artifact
written, and no receipt printed. A refused run also reclaims the outputs it had
already claimed, so it leaves no empty or partial file and no existing byte
changed.

Output and capture are also bound by identity. Before either claim, each output
is checked against the exact set of paths that capture attempt owns — the
ledger, the writer lock, the seven raw question files, the seven raw answer
files, and the lanes they create — projected by the capture contract itself
rather than restated. A capture path that does not exist yet would otherwise be
created by the claim, appended to by capture, and overwritten on completion, so
a collision refuses before anything is created and no receipt is printed.
Comparison is by lexical path, by physical path once junctions, symlinks, short
names, and case variants are resolved through the nearest existing ancestor, and
by device and inode where a hard link exposes it; an identity that cannot be
resolved refuses rather than being guessed. Outputs outside that owned set are
unaffected, including ordinary outputs inside the same evaluation root, and a
run without capture flags has no owned set at all.

The NotebookLM wrapper accepts notebook, source, and profile values only at
runtime and hard-codes no identifier, title, account, or path. It requires
exactly four unique UUID source ids for this slice and mints one fresh
conversation UUID per question and attempt, refusing any conversation already
recorded under that root. It spawns without a shell using an exact argv
allowlist and bounds the timeout and the accepted stdout/stderr byte counts.

The current nlm 0.9.10 response is validated as a closed object with exactly
`answer`, `question`, `conversation_id`, `sources_used`, `citations`, and
`references`. `citations` is a mapping from a canonical 1-based citation number
to one source id, and each `references` entry is the exact record `source_id`
and `citation_number` with an optional `cited_text` or an optional `cited_table`
of `num_columns` and rows of exactly that width. Every citation value and every
`reference.source_id` must be one of the exact four requested source ids, every
reference number must exist in the citation mapping, agree with the source
recorded there, and be claimed only once, and every nested field, row, and cell
is bounded plain own data with no extra key. The returned question must match
the submitted one, and every identifier anywhere in the document must be one of
the requested values, so a foreign alias that is not even a UUID is refused too.

The default executor spawns `nlm` directly with no shell, so it works only where
`nlm` is itself a spawnable executable on PATH. Where it is a shell-resolved
wrapper shim, the caller injects an executor instead of the module relaxing to a
shell. Tests always inject a fake executor and make no external call.

Crash safety is explicit. A create-only attempt intent is written before the
external query, so an unfinished attempt found without a recoverable response
artifact returns UNKNOWN and is never queried again under the same attempt id. A
complete response artifact resumes ledger capture without a second query. Both
recorded outcomes are resolved before the execute branch is chosen, so a
response or failure found with no matching intent, and an attempt recorded as
both answered and failed, each hold without asking the provider anything. A
provider failure keeps the recorded question and a safe failure receipt, adds no
fabricated answer, and echoes no provider output. Raw answers, citations,
references, and provider stdout live only in create-only private artifacts under
the supplied evaluation root; CLI stdout and the ledger carry hashes, counts, and
closed issue codes only.

A refusal is still an audit record. Once the question turn is appended, every
later HOLD or UNKNOWN reports whether the external query was actually attempted,
the question hash, and the ledger event count, appended event count, ledger hash,
and head hash the run really reached. A refusal raised before the question turn
reports those facts as unset rather than as zero.

The intent scan that refuses a reused conversation stays inside the evaluation
root. The lane, every interaction directory, and every scanned file are refused
if they are a symlink, junction, or other reparse point, or if they resolve
outside the root, before anything lists or reads them, and directory count, file
count, and each file's byte length are bounded.

Neither provider is truth. Notebook and Engine remain contestants, and capture is
observation: it declares no winner, accepts no answer, writes no Task/ERP record,
uploads nothing, mutates no source, and triggers no automatic review.

The human report is Markdown-only. The prospective QA capture ledger starts
from newly recorded turns. Historical import accepts only a nonempty
single-turn `.md` or `.txt` file for the question and for the answer, and it
refuses a question and answer that resolve to the same physical file. JSON and
other multi-record container files are refused outright rather than silently
split or reinterpreted as one turn. There is no row-pointer contract in this
slice.

The source-cited answer slice is deliberately a fixed seven-question
structured-judgment experiment. It improves evidence presentation and makes a
fairer natural-answer review possible, but it is not a general RAG question
answerer and does not prove provider-effective byte parity with Gemini Notebook.
Independent review scores public-source citation fidelity only for q1 through
q5. The access and project-binding cases q6 and q7 are instead scored against
the pinned Engine boundary contracts. The review ledger stores only hashes,
closed proposition and violation IDs, and aggregate statuses; answer prose and
source snippets remain outside the ledger. Byte-identical repeats are recorded
separately from semantic correctness and independently controlled execution.

The normalized `stale`, `unauthorized`, and `wrong-project` rows preserve their
actual implementation limits: stale is `gap_unknown` plus a revision-evidence
guard; unauthorized and wrong-project are access/binding refusal receipts, not
invented Engine-native gap types. All rows remain
`external_advisory_candidate` until a separate acceptance route says otherwise.

## Evaluation-only Soulforge Engineering Answer Lane

`evaluation/se_core_sourcebound_answer_lane.mjs` is a separate, **evaluation-only
Soulforge Engineering Answer Lane**. It answers an arbitrary natural-language
question over one exact, frozen four-source public systems-engineering corpus.

It is deliberately **not**:

- the deterministic Engine baseline — that is
  `subjects/se_core_source_cited_answer_run.mjs`, a fixed seven-case renderer
  that calls no model. The two lanes are not comparable, and the existing fixed
  seven Engine outputs must not be reused as this lane's results;
- general open question answering — every claim must cite retrieved evidence from
  the four allowlisted sources, and an unmatched question is held, not answered;
- production-ready, a score, a ranking, a winner, a parity claim, source truth,
  an owner approval, a canon promotion, or a disposition.

Every result is `ai_assisted`, non-authoritative, and source-bound. The claim
ceiling is `observed` and the disposition is `external_advisory_candidate`.

### Split of responsibility

The deterministic side owns corpus validation, derived-text parsing, retrieval,
statement cataloguing, citation binding, fixed Korean rendering, the claim
ceiling, and the receipt. The learned model is only a bounded **statement
selector**. It authors no answer prose.

The injected `answerModel` receives the exact question text, a closed output
policy, and statement capsules whose only fields are `statement_id` and
`excerpt`. It may return only:

```json
{
  "schema_version": "soulforge.se_core_sourcebound_statement_selection.v0",
  "result": "answer",
  "propositions": [
    { "statement_id": "S1", "relation": "direct" }
  ]
}
```

`result` is `answer` or `abstain`; `relation` is `direct`, `support`,
`qualification`, or `contrast`. An answer has one to eight unique statement ids
and at least one `direct` relation. An abstention has an empty proposition list.
There is no heading, body, quotation, citation, authority, winner, or free-text
field for the model to fill. The former `{ sections: [...] }` response is rejected,
not adapted.

This is a two-stage contract. The provider JSON Schema closes the fields, enums,
bounds, and answer/abstain alternatives. Its `uniqueItems` compares whole
proposition objects, so the lane separately rejects the same `statement_id` used
twice with different relations. Provider shaping reduces invalid generations;
the lane's own validator remains the final authority for cross-item uniqueness.

#### What the model is shown: `{ statement_id, excerpt }`

Each statement is one complete retrieved chunk already bounded by the lane. The
excerpt is exact normalized source text; the model cannot select, shorten, edit,
or extend it. The lane adds no separate source title, revision, page number,
source id, chunk id, digest, or path field. Source prose may naturally contain
those terms because it is evidence, not an Engine-authored assertion.

The host retains `statement_id -> evidence_id -> source/page/chunk` metadata and
binds a selected statement back to it. It renders a fixed Korean relation label,
a fixed Korean prefix, the exact source excerpt, and exactly one machine-owned
citation. Retrieved-but-unselected statements never become citations. Unknown or
duplicate ids, an answer without `direct`, a nonempty abstention, an extra key,
or any attempted prose field fails closed with `answer: null`.

The lane module performs no filesystem, network, write, or ERP operation, and is
provider-independent: it does not know which runtime serves the model.

The adapter is the one input the lane cannot snapshot, because it must carry
functions. So it must be a plain object whose `composeAnswer`, optional
`proposeQueryExpansion`, `descriptor`, and every descriptor field are **own
enumerable data properties**, each read exactly once through its property
descriptor — which never runs a getter. A stable accessor is refused for the same
reason a shifting one is: the validated value and the used value are two reads of
a caller-controlled function, so an accessor could hand a safe `adapter_id` to
the receipt and a substituted renderer to the call. The seam bound at validation
time is the function that actually runs, and `model.invocation_count`,
`answer_invocation_count`, and `expansion_invocation_count` stay truthful — a
refused adapter costs zero invocations.

### Host-rendered output, and what it does not prove

The model never supplies a rendered block. The host owns every Korean label and
prefix, then appends the exact selected source excerpt. That makes model-authored
approval, canon, project-use, winner, Task, and authority claims structurally
unrepresentable instead of trying to recognize every English or Korean sentence
that might express one.

A candidate free-prose authority parser was intentionally discarded. Repeated
independent public-synthetic review found scope errors even after sentence-level
tests passed: a denied approval condition could negate the wrong action, a gate
about another draft could attach to the current answer, and Korean negative or
exclusive forms could invert a decision. The stop condition was applied, so this
slice must not add another phrase-shaped exception.

The fixed rendering and exact source excerpt are still subjected to canonicalization
and must pass the whole-answer path/secret/URL/HTML scan. `authority_actions` is always empty, and
the boundary note states that a quoted source does not grant approval, project
use, canon status, Task authority, or a winner. The reserved
`authority_claim_pattern` reason remains readable for older receipts but has no
model-prose path in this contract.

#### Which check refused, without what it refused

`OUTPUT_SAFETY_FAILED` names the decision. On its own it did not name the check,
so markup, a URL, a leaked path, a fabricated citation identifier, and an
authority claim were one opaque hold. Every output-safety refusal now also
carries `output_safety_reason`, one token from a closed set:

| token | v2 status and meaning |
| --- | --- |
| `markup_detected` | reserved for historical free-prose receipts; unreachable from statement selection |
| `url_detected` | reserved for historical free-prose receipts; current whole-answer URL refusal uses the rendered-answer scan token |
| `sensitive_pattern_detected` | a forbidden path, private-plane, secret, credential, project-code, or address string reached the structured boundary |
| `citation_identifier_in_prose` | reserved for historical free-prose receipts; the model has no prose field in v2 |
| `authority_claim_pattern` | reserved for historical free-prose receipts; the model has no authority-claim field in v2 |
| `model_payload_field_forbidden` | a forbidden field name in the model response |
| `answer_canonicalisation_failed` | the host-rendered answer could not be canonically serialised |
| `rendered_answer_scan_failed` | the whole-answer path/secret/URL/HTML scan refused the host rendering |
| `unspecified_internal` | exhaustiveness backstop, not a family; no reachable refusal produces it |

The token names a **family of check and nothing else**. It is a fixed literal
chosen by which branch was taken, so it carries no offending text, no location
within a value, no matched pattern, no question, no answer or evidence prose, no
path, no account, and no provider value — the diagnostic is which door closed,
never what was behind it. The backstop exists so an output-safety hold can never
report *no* reason, which is the one answer this field must never give.

For the historical diagnostic-reason change, acceptance behaviour was unchanged:
it only named the check that had already refused. The later statement-selection
contract is an intentional acceptance change and is versioned separately below.

The lane receipt carries an output-safety reason only when that older
result-discriminated field has something to say. The statement-selection change
also adds statement commitments and host-rendering facts, so its schema is
`soulforge.se_core_sourcebound_answer_receipt.v2`. The command receipt remains
v2 because its own closed top-level field set did not change.

The lane policy is `soulforge.se_core_sourcebound_answer_lane.v2`; it salts the
statement request, adapter descriptor, and expansion commitments. The final answer
is `soulforge.se_core_sourcebound_answer.v1`, and the Ollama adapter is
`soulforge.se_core_sourcebound_answer_ollama_adapter.v3`.

**This is not a semantic entailment proof.** The excerpt is byte-bound source text,
but the model still chooses which statements are relevant and how they relate to
the question. A `PASS` proves exact host projection and citation binding, not that
the selection is correct. The receipt therefore records exact-host-evidence
projection, `semantic_entailment_verified: false`, and selection correctness
`unknown`. Independent review is still required.

### Corpus pinning

`corpus` must carry exactly four allowlisted source descriptors, in canonical
`source_id` order, matching a frozen source-set contract member for member at the
same position. Missing, extra, duplicate, or reordered members are refused as
ambiguity rather than resolved. Every PDF commitment, every derived-text byte
hash, and the source-set contract's own canonical commitment are verified; a
one-byte derived-text drift refuses the run. An existing source-text index that
lacks the derived-text hash binding is not trusted as a substitute.

Runtime derived text is Markdown with `## Page N` headings and is parsed
deterministically into page-aware chunks that never cross a page boundary, so a
citation page is exact rather than inferred. A repeated or non-increasing page,
or a page beyond the pinned page count, refuses the run. Raw PDFs are never read
in this module. An oversized word is split between code points, never inside a
surrogate pair, so a chunk boundary can never manufacture a lone surrogate that
would be hashed, cited, and rendered as a replacement character.

#### Validated contract vs pinned benchmark

These are two different claims and the lane keeps them apart, because collapsing
them is how "a run over four descriptors" quietly becomes "the benchmark result".

- `runSeCoreSourceboundAnswerLane` is the **generic validated-contract API**. It
  proves the supplied descriptors are internally consistent, allowlisted for
  evaluation-lane analysis, and byte-pinned. It cannot prove they are the fixed
  benchmark cohort, because the caller supplied both the descriptors *and* the
  contract commitment over them — `seCoreSourceSetContractSha256` covers identity
  and byte hashes only, so a caller can vary approval, permissions, or titles and
  recompute a self-consistent hash. Its receipt says so:
  `source_set.benchmark_pin.fixed_benchmark_identity_asserted` is `false`.
- `runSeCorePinnedBenchmarkAnswerLane(input, context, benchmarkPin)` is the
  **pinned benchmark execution gate**. `benchmarkPin` is independently configured
  by the caller — `{ pin_id, source_set_id, expected_cohort_sha256,
  allowed_source_ids }` — and is compared against the *full* runtime cohort
  material: identity, byte hashes, `approval_status`, the operator
  reuse-rights declaration, and every permission boolean
  (`seCoreSourceCohortSha256`, exported for callers). A changed approval status,
  a changed permission, or a changed source identity refuses the run
  (`BENCHMARK_PIN_INVALID`) even when the caller recomputes every hash it
  controls, because the pin is not derived from the descriptors under test. The
  gate closes before any model call, so a refused pin costs zero invocations.

The pin is a **seam**, not embedded configuration: this module hard-codes no
cohort hash, no source id, no path, and no content, so nothing here can quietly
bless a private corpus. Whichever cohort is pinned is the one the caller
configured, and it is readable back from that run's own receipt.

Both entry points are reachable from the CLI, so choosing between them is an
operator decision made on the command line rather than a decision that requires
writing a JS harness. See *Choosing the route* below.

#### Approval and reuse rights

`approval_status` must be exactly one of `owner_approved_public_source`,
`official_public_source`, or `owner_approved_official_public_source`. The last is
its own accepted value rather than something a caller has to flatten: what the
document *is* and whether the owner cleared it for *this analysis* are two
separate facts that can hold at once.

`reuse_rights_reviewed` is a **runtime/operator declaration**, grounded in
reviewed public-rights metadata for that source. It is never verbatim
source-card data, and no receipt, README line, or comment describes it as such.
The receipt records that basis explicitly as
`source_set.reuse_rights_reviewed_basis`.

#### Raw derived bytes

The order is fixed and each step is recorded:

1. the raw supplied bytes are hashed and compared with the pinned
   `derived_text_sha256` — before any decode, so what gets parsed is provably
   what the source set committed to. Verifying a normalised form instead would
   commit to bytes nobody supplied;
2. the bytes are decoded as UTF-8 with `fatal: true`;
3. exactly two characters are rewritten, **in memory only** and both counted:
   `U+0000` and `U+001F` become SPACE. Real extraction output carries stray NUL
   and UNIT SEPARATOR where a PDF had a cell or record break, and both are
   unambiguously word separators there;
4. LINE FEED and TAB are preserved as the stream's own structure. **Every other
   C0/C1 character refuses the run**, carriage return and form feed included: a
   different control shape is a different extraction shape than this parser was
   written for, and guessing at it is how a page boundary silently moves.

Nothing else is rewritten, and the two boundary cases differ. A CRLF stream
**refuses** (`DERIVED_TEXT_MALFORMED`), because carriage return is one of the
refused C0 characters. A UTF-8 BOM is **not** refused and **not** rewritten
here: `TextDecoder` consumes a leading BOM itself, before this module sees a
character. The extraction step should still emit LF line endings and no BOM,
because the BOM is the one case where the hash invariant below does not hold.

Normalised bytes are never persisted. Each receipt source row carries
`raw_derived_text_sha256`, `normalized_text_sha256`, `replacement_counts`
(`{ u0000, u001f }`), `normalized_bytes_persisted: false`, and the two preamble
booleans — commitments and counts only, never text. With zero replacements **and
no BOM** the two hashes are identical, so the pair says precisely what changed.
A stream that opened with a BOM passes with both replacement counts at zero and
the two hashes still different, by exactly those three bytes. The parser does
compute that case as `bom_stripped_by_decoder`, but it is **not** currently a
receipt field, so from the receipt alone a BOM is not distinguishable from
another cause of divergence.

Because the replacement runs before the preamble is parsed, a control character
*inside* the metadata preamble refuses the stream outright
(`DERIVED_TEXT_MALFORMED`). In page prose the substituted space collapses
harmlessly; in metadata it would break a private path, a secret, or a project
code apart just enough to slip past the leakage scan, so a replaced control there
is treated as evasion rather than formatting.

#### Derived-text metadata preamble

The authorized derived-text artifacts open with a bounded metadata preamble
before their first page heading, so the parser accepts exactly one closed shape
there and nothing else:

```markdown
# <document title>

- source_id: <pinned source_id>
- revision: <pinned revision>
- source_pdf_sha256: <pinned source_pdf_sha256>
- page_count: <pinned page_count>
- extraction: <bounded provenance text>

## Page 1
```

The rules are exact:

- the preamble is **optional per stream**. A stream that starts at its first
  `## Page N` heading keeps its previous behaviour unchanged; a stream that
  opens with an H1 must then satisfy this whole shape. A mixed corpus is fine —
  the check is per source, not per run;
- the five keys above are the **only** accepted keys, each exactly once, in any
  order, because the binding is by key and an emitted order carries no meaning.
  A missing, repeated, or unknown key, a malformed bullet, a second H1, body
  prose before `## Page 1`, or a preamble longer than its bounded line budget
  refuses the run (`DERIVED_TEXT_MALFORMED`). This is a closed shape, not
  arbitrary front matter;
- a bullet value may be written plainly or as one Markdown code span
  (`` `value` ``); both are the same value and the unwrapped value must still
  bind exactly;
- `source_id`, `revision`, `source_pdf_sha256`, and `page_count` must equal the
  pinned source-set contract member **exactly**. A preamble that describes a
  different document, revision, PDF, or page count refuses the run
  (`DERIVED_TEXT_PIN_INVALID`) rather than being ignored;
- `extraction` is provenance text: bounded, safe, non-empty, and deliberately
  **not** part of the source-set commitment. It records how the text was
  produced, not which document it is, so pinning it would refuse a re-extraction
  of identical bytes;
- every preamble value and the H1 are bounded NFC text without control
  characters. A path, secret, account, project identifier, private-plane
  reference, or URL there refuses the run
  (`FORBIDDEN_PARTICIPANT_INPUT`);
- the preamble is metadata about the stream, never content of it. No preamble
  line is chunked, indexed, retrieved, cited, or copied into evidence, into the
  answer, or into the receipt.

**The H1 title rule.** The H1 is required when a preamble is present, but it is
*not* required to equal the pinned `title`. The pinned title is an
operator-curated label in the source-set contract; the H1 is whatever the
extraction step rendered from the document itself, so a subtitle, an edition
suffix, or punctuation can legitimately differ for the same document. Identity is
already pinned four ways above, and the H1 bytes are already committed by
`derived_text_sha256`, so a byte equality here could only refuse a correct run —
it could not catch a substituted document. The divergence is therefore reported,
not equated: each receipt source row carries `preamble_present` and
`preamble_title_matches_pinned_title` (both booleans, never the text; the second
is `false` when no preamble is present).

### Retrieval

Retrieval uses the corpus-wide seam `searchSourceTextCorpus` in
`guild_hall/rag/source_text_index.mjs`: one global lexical/BM25-like space over
all four sources, deterministic under input permutation, with bounded
`max_evidence` and `max_per_source`. The receipt always reports
`searched_source_count: 4` even when only a subset is cited. There is no
embedding, vector index, or web search.

The questions are Korean and the sources are English. The lane may therefore
accept one optional **advisory** query expansion from the same bounded model. It
is separately declared `model_advisory_shadow`, closed-schema,
provenance-bound, and `authoritative: false` / `engine_retrieval: false`. The
canonical retrieval always preserves the original exact question and its lexical
search, and an advisory term carries a fraction of an exact query token's weight.
It is a weaker vote, not a powerless one: bridging Korean to English is the point
of the channel, so a capsule can enter on advisory signal alone. The retrieval
receipt therefore reports `selected_advisory_only_count` — how many selected
capsules the exact question never touched lexically — so the shadow channel's
influence on the grounding is countable rather than assumed away. No question,
expected answer, page hint, rubric minimum, or evaluator concept is encoded
anywhere in this lane.

### Runtime and provenance

`tools/se_core_sourcebound_answer_runner.mjs` is the only place that knows a
provider exists. It reads one explicit source-set contract, one exact question
file, and exactly four explicit derived-text files, and calls **local
`qwen3.5:9b` over loopback Ollama only** — one stateless on-demand request per
call, `keep_alive` 5m, one user message, no tools, no history, no conversation or
session reuse, no external egress. Every generation parameter that decides whether
a reply can arrive at all is pinned in the request rather than inherited from the
daemon: temperature and seed at 0, the reasoning channel off, a 32768-token
context window, a prompt that the daemon must refuse rather than trim, and
`format` bound to the closed fields, enums, bounds, and answer/abstain alternatives,
with each statement slot bound to the statement ids this run actually catalogued.
The lane then adds cross-item statement-id uniqueness and all final checks. Each default
is a failure mode rather than a preference. A thinking-capable model left at its
default spends the window on a channel this lane never reads and returns empty
content with `done: true`; an inherited window silently drops the front of an
oversize prompt and answers from the remainder, which would leave the receipt
committing to evidence the model was never shown.

The 32768-token window retains the conservative bound measured against an older,
strictly larger legal prompt: 24 900-character capsules plus title/revision
metadata and the maximum question measured 31 939 tokens on `qwen3.5:9b`. The
current statement capsule carries only id and excerpt, and its reply contains at
most eight id/relation pairs, so that historical measurement is an upper bound,
not a fresh claim that the current prompt is minimal. The default retrieval of six
statements is far below the ceiling. A provider-side length stop is still refused;
the runner never guesses or completes a truncated selection.
The prompt side is not diagnosed from the reply at all: a trimmed prompt comes
back `200` with a `prompt_eval_count` *below* the window it was trimmed to, so
the request asks the daemon to refuse an oversize prompt instead, and that
refusal arrives as a non-success status. Validating the origin only pins the
first hop,
so a redirect is an error rather than a hop: a 307/308 would otherwise replay the
prompt body at whatever host it names. A non-loopback origin, a different model, or a
crosswalk/rubric/gold/prior-answer/Notebook input path is refused. Prompt text,
source prose, and provider response bodies are never logged or persisted outside
the private answer artifact.

The endpoint is checked against the raw text as well as the parsed URL, because a
URL parser is not a validator here: only a canonical numeric loopback origin
spelled `http://<127.x.y.z or [::1]>:<port>` is accepted. `localhost` is a name
whose meaning is decided by a resolver, and `2130706433`, `0x7f000001`,
`0177.0.0.1`, and `[0:0:0:0:0:0:0:1]` are spellings a parser silently folds into
the loopback address; all are refused. So are a missing or default port —
this service has no default of its own — and any credential, path, query, or
fragment. A reply is answered only when it states both that the generation
finished and that the model itself ended it — `done: true` and
`done_reason: "stop"` — so a non-success status, a reply that leaves either
unstated, one the token budget cut off, a non-string content field, and content
that is not one JSON object are refusals rather than completed answers. Every
field that decides this is read once as own data, and every slot the adapter
takes from the response itself — `ok`, `headers`, `body`, `arrayBuffer`, `text` —
is snapshotted once, so a surface that throws becomes this adapter's own fixed
refusal instead of a provider-authored error carrying provider text out of it.
Each step a streamed body hands back is read the same way: an ordinary plain
object whose own data `done` is a boolean and, when it is `false`, whose own data
`value` is one exact `Uint8Array` taken once and then counted and copied from that
one snapshot. The chunk is required to be exact because `instanceof` is not a
statement about how a value answers: a proxy around a `Uint8Array` and a subclass
both satisfy it and both intercept every slot read that follows. So a proxy, a
subclass, and an own `byteLength` are refused, and the chunk that remains is
measured and copied through the engine's own `%TypedArray%` intrinsics into a
fresh ordinary array rather than through any slot the chunk itself could answer.
An accessor, a custom prototype, an inherited or hidden slot, a `done` that is
merely truthy, a chunk those intrinsics will not measure or copy, and a chunk
whose length moves between the count and the copy are each refused — the stream is
cancelled exactly once and the call takes the same fixed body refusal — rather
than read. A real Fetch body reader hands over exact `Uint8Array` chunks and is
unaffected.
None of them is retried, repaired, or answered by a second call: a refused run
stays one refused run.

That endpoint check is **syntax only**. It proves how the target is spelled, not
what listens there: whatever process is bound to that loopback port receives the
request. The model name is *declared* — `qwen3.5:9b` is matched on the way out
and sent in the request body. If the reply carries a `model` field it must name
that same model or the run holds; if it omits the field the reply is still
accepted, because the request already pinned the model and a silent reply is not
evidence either way. Neither case is provider-side verification: "the selection came
from `qwen3.5:9b`" remains an operator-side fact about the local runtime, not
something this runner verifies or either receipt proves.

stdout carries the canonical answer. stderr carries the payload-free **lane
receipt** first and one **command execution receipt** last. The two are separate
on purpose: the lane receipt is an immutable verification record of an in-memory
evaluation that truthfully reports zero writes, and it is also the bytes
`--receipt-out` persists, so it cannot describe its own persistence. The command
receipt is where persistence is reported — `state` of
`not_requested | complete | rolled_back | partial_unknown`, the exact
`requested`, `claimed`, `completed`, `rolled_back`, and `unknown` counts, and
`persistent_file_writes`: 0 for stdout-only, 1 for `--out`, 2 for `--out` plus
`--receipt-out`. It is also where a provider refusal is named:
`model_refusal_reason` carries one token from a closed set the adapter publishes
— `generation_stopped_on_budget`, `no_message_content`, `non_success_status` and
the rest — chosen from the reply's *shape* and never from its content, so a hold
says which refusal happened without echoing provider text, a path, the question,
or a source. `generation_stopped_on_budget` is reserved for the one stop reason
that means it; an unstated, malformed, or otherwise non-stop reason takes the
neutral `generation_did_not_stop_normally`, and the value itself is never named.
The token is bound to one command invocation, not to the adapter: each run gets
its own scoped adapter and its own refusal cell, and every model call it makes
settles that cell alone. So an adapter a later run reuses never reports the
earlier run's refusal, and two runs holding calls open against one adapter at the
same time never report each other's — in either completion order. It is `null` on
a pass and on every hold that never reached the provider.

It is also where an **output-safety** refusal is named. A HOLD lane receipt is
never emitted to stdout and `--receipt-out` is rolled back on a hold, so this is
the only surface an operator can read `output_safety_reason` from. The value is
the token the lane published on the receipt this call awaited, where it published
one — the same closed family set documented above, taken from this invocation's
own lane result and from no module state, adapter slot, or earlier run, so a
reused adapter and two commands overlapping on one cannot inherit or
cross-attribute a reason. Unlike the lane receipt this one keeps a single closed
top-level field set across every result, so the member is stated as `null` on a
pass, on every hold that is not an output-safety refusal, and on every hold this
command took before the lane ran at all. It is a JSON-safe execution summary, not
canonical-kernel material, so stating the absence costs nothing here.

Each of those two members changed the receipt's closed top-level field set, so
the command receipt schema is now
`soulforge.se_core_sourcebound_answer_command_receipt.v2`: `model_refusal_reason`
is why it left v0 and `output_safety_reason` is why it left v1. A reader keyed to
an earlier field set is meant to reject a later receipt rather than read it as an
earlier one that grew a field. Lane-internal zero writes stay under `lane_internal_writes` so
they can never be read as a statement about files on disk. A run that exits
nonzero after the model ran still emits one command receipt with a truthful model
invocation count.

`--out` and `--receipt-out` are independent create-only files, both staged
**before** the model is invoked, so an occupied output refuses the run at zero
model calls. An output target is refused when its spelling and its meaning on
disk can differ: an alternate data stream (`host.txt:stream`), a reserved device
name with or without an extension (`nul`, `con.json`), a trailing dot or space, a
traversal segment, a UNC or device-namespace root, an empty segment, and two
targets that resolve to one file by normalised path or by file identity.

Both outputs are written and flushed before either handle is closed, and a
committed path is then re-checked against the file this run actually created.
Two files on one filesystem cannot be made to appear atomically, so what cannot
be made atomic is reported rather than glossed: a lost or aliased output ends the
command in `partial_unknown` with exact counts, and one file is never presented
as a completed answer. Nothing is ever removed by path alone — a staged output is
identified by device and inode — so a file that replaced ours between the claim
and the rollback is left untouched and counted `unknown`. No caller sink is
invoked while any output is still rollback-eligible.

Claude Code produced the initial v4 implementation and Codex applied review
corrections. Neither is a runtime dependency, benchmark reviewer, or authority.
The runtime model is the local `qwen3.5:9b` above.

### Choosing the route: generic or pinned

One canonical command serves both, and the flag is the whole difference:

```text
node guild_hall/engineering_engine/tools/se_core_sourcebound_answer_runner.mjs \
  --source-set-contract <contract.json> --source-set-sha256 <sha256> \
  --question <question.txt> --question-sha256 <sha256> --question-bytes <n> \
  --point-in-time <YYYY-MM-DD> \
  --derived-text <source_id>=<path>   (exactly four, one per source) \
  [--benchmark-pin <pin.json>]        (a supplied pin means benchmark mode)
```

- **no `--benchmark-pin`** — the generic validated-contract route. The lane
  receipt reports `fixed_benchmark_identity_asserted: false` and the command
  receipt reports `benchmark.mode: generic`. A generic run is never described as
  the benchmark by either surface.
- **`--benchmark-pin <file>`** — the pinned benchmark route. On an exact match
  the lane receipt reports `benchmark_pin.pinned: true`,
  `cohort_commitment_verified: true`, and
  `fixed_benchmark_identity_asserted: true`; the command receipt reports
  `benchmark.mode: pinned` and mirrors the lane's assertion. It mirrors it: the
  command receipt reads that boolean back out of the lane receipt and never
  asserts it, because this process supplies the pin and is not a witness to its
  own claim.

The pin file is one closed plain JSON document holding exactly the four fields
the deep API accepts, and nothing else — a `schema_version` or any other extra
key is refused rather than ignored:

```json
{
  "pin_id": "<safe identifier>",
  "source_set_id": "<safe identifier>",
  "expected_cohort_sha256": "<64 lowercase hex>",
  "allowed_source_ids": ["<four distinct ids, canonical order>"]
}
```

It is read as a **bounded ordinary file, opened read-only**, at most 4 KiB, under
the same handle-based read every named input gets (see *Resource ceilings*
below), then decoded as UTF-8 with `fatal: true`, parsed strictly, and rebuilt
from validated primitives so no prototype, accessor, or extra field from the file
reaches the lane. Anything that is not one bounded singly named ordinary file,
plus undecodable bytes, a wrong field set, a non-lowercase digest, or anything
but four distinct safe ids, refuses the run with
`..._CLI_BENCHMARK_PIN_FILE_INVALID`. No pin content and no local path is echoed
on any failure path.

**The pin is never computed here.** The runner does not derive, recompute, or
repair `expected_cohort_sha256` from the corpus under test — a commitment
re-derived from the thing it is supposed to bind proves nothing about it. So the
CLI refuses a mismatch instead of healing it, and these all hold before any model
call and before any output byte:

| what changed | refusal |
| --- | --- |
| a drifted `expected_cohort_sha256` | `BENCHMARK_PIN_INVALID` |
| the source-set contract hash pasted in as the cohort hash | `BENCHMARK_PIN_INVALID` |
| an `approval_status` changed to another accepted value | `BENCHMARK_PIN_INVALID` |
| a source member renamed, with every caller-controlled hash recomputed | `BENCHMARK_PIN_INVALID` |
| a permission flipped | `SOURCE_SET_INVALID`, at the earlier gate |

The last row is the honest exception: permissions are fixed exactly by the
source-set gate, which runs *ahead* of the cohort binding, so a flipped
permission never reaches the pin comparison. It still holds with zero model calls
and zero artifacts, which is the property that matters.

Authoring a pin is therefore an **owner setup step, out of band and once**, not a
per-run step: the owner computes the commitment over a cohort they have reviewed,
using `seCoreSourceCohortSha256` (exported by the lane and re-exported here), and
freezes the result. A controller can run the command without a JS import or pin
recomputation. Re-running the already-seen homefield 7×3 after a code change is
only a post-hoc diagnostic regression; any score, winner, parity, or
generalisation claim requires a separately frozen unseen question set.

### Resource ceilings

Every byte this command takes from outside is bounded before it is interpreted.

- **named local inputs.** No whole-file read is used anywhere: a whole-file read
  sizes its allocation from the file, which is the one number this process does
  not control. Each named input is opened read-only, its size is taken from the
  **open handle** and compared against that input kind's ceiling *before* a
  buffer is allocated, the allocation is exactly that size, the read is driven to
  completion at explicit offsets, and one byte is probed past the end so a file
  that grew after the stat is refused rather than silently accepted as the
  shorter document that still parses.

  | input | ceiling | why |
  | --- | --- | --- |
  | source-set contract | 65536 B | one closed four-member document is a few kilobytes; the rest is whitespace headroom |
  | benchmark pin | 4096 B | four identifiers and one digest |
  | question | 8192 B | exactly the lane's own question ceiling |
  | each derived text | 8388608 B | exactly the lane's own derived-text ceiling |

  The last two are not independent numbers. The suite pins each to the lane's
  boundary from both sides — the exact ceiling answers end to end, one byte more
  is refused — so the runner and the lane cannot drift apart silently.

  The handle is the file; the path is only a name for it. Identity is read from
  the descriptor and from the name — *without* following it — both before and
  after the read, and any disagreement refuses. So a directory, a device, a
  symlink, a junction, a **hard link** (a second name is a second writer this
  call never checked), a short read, a replacement mid-read, an empty file, and
  an oversized file are all refused with `..._CLI_INPUT_READ_FAILED`, or
  `..._CLI_BENCHMARK_PIN_FILE_INVALID` for the pin. Every one of them shares one
  fixed message: which check failed, which path was named, and what the file held
  are all withheld, because a caller who can name a path could otherwise read the
  filesystem one refusal at a time. All of it happens before the model adapter
  exists and before any output is staged, so a refused input costs zero model
  calls and creates no file.
- **io surface.** The caller's `io` object is reflected exactly once, through
  `getOwnPropertyDescriptors`, *before* any seam is used. No seam is ever read as
  a property, so a getter never runs, and each seam is bound once from that
  snapshot. A custom prototype, an inherited seam, a non-enumerable seam, an
  accessor, an unknown string key, or any own symbol other than this module's
  test checkpoint refuses the run with `..._CLI_IO_SURFACE_INVALID`. A refused
  surface is not usable as a reporting sink either, so its command receipt goes
  to the process's own stderr rather than through the object that was refused.
- **request timeout.** `--timeout-ms` and the adapter's `timeoutMs` option both
  cap at exactly **180000 ms**, which is also the default. `180000` is accepted;
  `180001`, `9999999`, zero, a negative, a fraction, and a numeric string are
  refused before any request is made.
- **provider response.** `response.json()` is never used: it would read and parse
  a body of unbounded length into this process before a single check could run.
  Instead a declared `Content-Length` over the cap refuses before the body is
  touched; a streamed body is read with a running byte counter, from one own-data
  snapshot of each step, and the reader is **cancelled** exactly once the moment
  the cap is crossed or a step — or the chunk it carries — is not one this adapter
  can read through the engine's own intrinsics; an injected client's
  `arrayBuffer`/`text` fallback has its byte length enforced too. Only then is
  the buffer decoded as UTF-8 with `fatal: true`, and only then parsed.

  | ceiling | value | why |
  | --- | --- | --- |
  | whole HTTP response | 262144 B | bounded provider envelope, with conservative historical margin |
  | `message.content` bytes | 131072 B | conservative cap retained above the much smaller selection object |
  | `message.content` characters | 49152 units | conservative cap retained above the closed selection object |

  The two content ceilings remain live: bytes and characters bound different
  encodings. They intentionally retain the earlier, larger safety margins even
  though the new closed response contains only a result token and up to eight
  statement-id/relation pairs.

  An oversized, malformed, non-object, or undecodable reply is a `HOLD` with
  `answer: null` and fixed message text. No provider byte is echoed into an
  error, a receipt, or a log, and the model invocation count stays truthful: a
  refused reply still happened, and the receipt says so.

  The `text()` fallback carries one stated limit: a client that exposes only text
  has already decoded, so the bound there is taken on the re-encoded bytes and
  cannot prove what crossed the socket. Real `fetch` always exposes a stream, so
  nothing but an injected client reaches that branch.

### Receipt boundary

The receipt is payload-free: exact question, source-set, cohort, derived-text,
retrieval, prompt, model-adapter, and output commitments; the benchmark-pin
posture; selected evidence ids
with page metadata and chunk hashes; a truthful model invocation count;
`filesystem_writes: 0`; `erp_writes: 0`; every canon/owner/P5/P8/Task authority
flag false; and `claim_ceiling: observed` with
`candidate_disposition: external_advisory_candidate`. It never contains question
text, source prose, answer prose, absolute paths, credentials, runtime or session
identifiers, or provider response bodies.

Public code, fixtures, and tests contain only synthetic material. The synthetic
four-source corpus lives in
`fixtures/se_core_sourcebound_synthetic_corpus.mjs`.

### The old homefield set is a regression probe, not a benchmark

Any question set this lane has already been run against — the earlier homefield
set included — is now **seen material**. It may be re-run for one purpose only:
**post-hoc diagnostic regression**, to check that a change moved the failure modes
it was meant to move and broke nothing else. A diagnostic re-run is a statement
about this lane's own behaviour on inputs it has already met.

It is **not** evidence of performance, generalisation, or comparison. A result on
seen material cannot support a score, a ranking, a winner, a pass rate presented
as capability, a NotebookLM comparison, a parity claim, or a production-readiness
claim, because the lane was changed with those failures in view. Any such claim
requires a **fresh, unseen, frozen** question set, pinned before the run and not
consulted while changing the lane, plus its own pinned cohort and its own
receipts. Nothing in this repository asserts that such a set exists or has been
executed.

### Current operational status: public smoke HOLD

The deterministic public contract and synthetic test suite pass, but this v4 is
**not operationally accepted**. One bounded public-synthetic loopback smoke called
`qwen3.5:9b` exactly once with advisory expansion disabled. The adapter completed
one answer invocation, but the lane refused the returned object at `model_output`
with `SE_CORE_SOURCEBOUND_ANSWER_MODEL_OUTPUT_INVALID`. No answer or source
selection was accepted, and no provider response body was printed or persisted.

That smoke was the declared stop gate. It was not retried, repaired, or used to
tune this question set, and the private 7x3 run did not start. A later attempt to
change provider compatibility must use a separately scoped successor and a new
run record; this v4 result remains a fail-closed diagnostic HOLD.

## 목적

- `engineering_engine/` 은 Soulforge 의 cross-project 증거기반 Engineering Engine Core와 전문 Domain Engine 구현을 소유한다. 현재 통합된 Domain Engine은 체계공학·품질 준비도·데이터베이스 공학이며, Interface 등 후속 분야는 같은 Core Interface를 쓰는 독립 package target이다.
- 적용 가능한 source authority 와 수락된 project context 로 `Expected State` 를 만들고, exact revision·authority·time·evidence lineage 가 붙은 `Observed State` 와 비교해 Snapshot·Finding·Missing/Unknown·Context Request 후보를 만든다.
- 이 root child 는 **결정론 kernel 과 계약** 을 소유한다. 프로젝트 원문, 계약서, source PDF, project RAG/Wiki 본문, snapshot payload, secret 은 두지 않는다.

## 왜 `guild_hall` 아래인가

engine 이 소비하는 knowledge-supply provider 가 이미 같은 root 에 있다. provider 코드를 복제하지 않고 adapter 계약으로만 연결한다.

- `guild_hall/rag/`: metadata-only RAG manifest 와 retrieval index
- `guild_hall/knowledge_graph/`: metadata-only graph view
- `guild_hall/knowledge_access/`: knowledge ref read/use ledger
- `guild_hall/knowledge_canon/`: ontology release inventory
- `guild_hall/snapshot/`: read-only sanitized 상태 projection

## 정본 조립 모델

사용자·제품 관점의 정본 용어와 target tree는
[`ENGINE_CORE_DOMAIN_PROFILE_ASSEMBLY_MODEL_V0.md`](../../docs/architecture/guild_hall/ENGINE_CORE_DOMAIN_PROFILE_ASSEMBLY_MODEL_V0.md)가 소유한다.

```text
Domain Engine + Organization Profile + Project Profile
                         ↓ Core Rule Assembly Interface
                           └─ Domain Compiler Adapter
                  Effective Rule Set

Project Sources → Project Adapter/Binding → Typed Project Facts

Effective Rule Set + Typed Project Facts → Evaluator → Assessment/Receipt
```

LIG·한화·`<project_code>`는 엔진이 아니다. `Overlay`는 Organization Profile과 Project
Profile의 내부 구현 operation을 말할 때만 쓴다. Compiler는 계층이 아니라 조립
Adapter이며 Core는 그 작은 Interface와 공통 guard/receipt를 소유한다. Project source를
읽거나 evidence verdict를 만들지 않는다.

현재 `kernel/`, `stage_rules/`, `subjects/`, `contracts/`, `fixtures/`, `tests/`,
`manual/`, `topology/` 평면 layout은 transition 상태다. target은 `core/`와
`engines/<domain_engine_id>/` package 구조이고, relocation은 import·manifest·topology·
zero-write replay를 함께 닫는 별도 migration이다. 이 문서 변경에서 파일을 이동하거나
중복 복사하지 않는다.

Current project-profile loader는 variant·복수 overlay·binding·observation/runtime refs를
한 envelope에 받고 overlay ops를 compiler 입력 하나로 합친다. 파일 분리는 존재하지만
Organization/Project Profile 각각의 identity·base pin·revision·order·source provenance를
끝까지 보존하는 semantic seam은 아직 `HOLD`다. target migration은 legacy envelope
compatibility Adapter와 per-profile compilation trace를 먼저 검증한다.

## 구성

- 아래 목록은 migration 전 current flat layout이다.
- `kernel/`: 결정론 kernel. 학습모델을 호출하지 않고, 공급된 값에 대한 순수 함수만 노출한다
- `stage_rules/`: current SE Domain Compiler Adapter. 폴더트리 variant(L1)와 Organization/Project Profile 내부 overlay(L2)를 세 소비자 표면으로 바꾸는 순수 함수만 둔다
- `observation/`: 관측 후보 공급자. 과제 자료 목록을 산출물 관측 **후보**로 바꾸고, 사람 확인을 거쳐 생성기가 받는 `artifact_observations`로 만드는 순수 함수만 둔다
- `topology/ENGINE_VERSION` + `topology/engine_release.json`: 엔진 버전 라벨(만드는 중에는 `0.0.0`)과 그 판이 묶는 조각들의 지문(규칙 층 스펙 sha·덧씌움·어휘·컴파일러/생성기 판·코드 매니페스트·생성 기준 commit). `generated_from_commit`은 emit 시점의 base HEAD이며, 이 생성 파일을 담는 후속 commit을 self-bind하지 않는다. `git_commit`은 호환 alias다. `tools/emit_release_manifest.mjs --out|--check`, `npm run validate:engine-release`. 실제 번호는 정본 승격 때 시작한다
- `manual/`: 엔진 개발 매뉴얼(책 형태, v0). 규칙 4층·항목 도출 방법·어휘·컴파일러·요구 추적·실행 기록·결정·다음 작업을 다른 작업자(사람·LLM)가 이어받을 수 있게 정리한다. 정본이 아니라 정본들의 지도이며, 관련 변경마다 해당 장을 같이 고친다. 읽는 순서는 `manual/README.md`
- 영수증은 4종을 구분해 쓴다: topology delivery(간선 통과) · MCP idempotency 응답(재시도) · Context Request 영수증 · Context Response 영수증. 서로 대신하지 못하며 소유 모듈이 다르다
- `contracts/`: Phase 1-0 공통 계약과 lane 계약
- `fixtures/`: 합성 fixture
- `tests/`: 동결 oracle 대조 conformance
- `evaluation/`: Engine 결과와 외부 advisory 결과를 정규화해 비교하는 순수 평가기. provider 로그인·질의·업로드는 하지 않는다

## 공통 SE 자료와 Gemini Notebook 수동 비교

`subjects/common_se_corpus_projection.mjs` 는 승인된 공통 체계공학 자료에서 별도로 만든
immutable·content-addressed projection을 기존 Engine의 Expected State 입력으로 바꾸는
읽기 전용 adapter다. source PDF, RAG/Wiki 본문, Notebook 답변을 읽지 않으며 caller가
명시한 binding, exact revision/hash, ACL, authority ceiling과 bounded selector만 받는다.
미관측은 `UNKNOWN`이고 명시적으로 부재가 확인된 경우만 `MISSING`이다.

`evaluation/manual_shadow_comparison.mjs` 는 Engine과 Gemini Notebook / NotebookLM을
직접 연결하지 않는다. 두 lane에 같은 frozen public-SE corpus와 같은 질문을 제공하고,
Notebook-only와 synthetic-state-pack을 하나만 추가한 hybrid 결과를 사람이 검토한
sidecar로 받아 결정론적으로 비교한다. 실제 프로젝트 자료, 계정 정보, raw 답변,
gold/oracle 노출, 자동 Task·승인·baseline 변경은 모두 범위 밖이다.

현재 public-safe 예시와 source eligibility 표는
`docs/architecture/workspace/examples/se_core_eval/`에 있다. source가 공개 URL에 있다는
사실만으로 Engine 투입 또는 외부 AI 업로드를 허용하지 않는다. exact bytes·revision·SHA-256,
재사용 권리, source membership, evaluator-only gold가 별도 동결되기 전에는 실제 비교를
실행하거나 준비 완료로 주장하지 않는다.

범위 검증:

```text
npm run validate:engineering-engine-se-core-eval
```

## 단계 규칙 컴파일러 (`stage_rules/`)

`stage_rules/`는 "어느 단계에 어떤 산출물이 있어야 하는가"의 단일 원천을 읽어 세 소비자
표면으로 바꾸는 순수 함수를 소유한다. 규칙을 새로 만들지 않는다. 설계 정본은
`docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md`다.

- `artifact_vocabulary.mjs`: 산출물 표준어 토큰(`artifact_type_id`), 계열, 표시 이름,
  기본 capability. 과제별 폴더명·발주처 슬롯명은 두지 않는다(D44). 계열에는 문서가 아닌
  두 종류도 있다 — `activity`(정본이 "하라"고 말하는 일)와 `decision`(정본이 "확정하라"고
  말하는 상태). 둘 다 증거는 기록이고 폴더는 만들지 않는다(D46).
- `stage_rule_compiler.mjs`: `compileStageRules(request)`가 compiled variant(L1) +
  profile 구현 overlay(L2) + compilation-scope `project_binding`을 받아 `se_stage_expected_artifact_policy_v0` 인스턴스,
  엔진 `soulforge.ax_se_stage_policy.v0` stage material, Needs 정책 stage·어휘 선언,
  mapping table, 영수증을 결정론적으로 낸다. 이 current `project_binding`은 policy에
  project/document/authority/time scope를 고정하는 compatibility 입력이며 실제 source를
  Typed Project Facts로 바꾸는 target Project Binding 전체를 뜻하지 않는다.
  `mintEnginePolicyRef`는 엔진의 policy_ref digest 규칙을 그대로 재현한다.
- `orderStageWork(compileResult, observations?)`(같은 파일): 컴파일 결과를 게이트별
  **"무엇부터"** 목록으로 바꾸는 순수 함수. 인과(같은 게이트 `depends_on` 위상 정렬)와
  순서(게이트 sequence)를 분리해서 내고, 관측이 0인 빈 과제에서는 입력이 없는 항목이 먼저
  나온다. 고리가 있으면 `SE_STAGE_RULE_DEPENDENCY_CYCLE`로 거부한다.
- `pilot_packet_generator.mjs`: `generatePilotPacketFromStageRules(request)`가 컴파일된
  stage policy와 산출물 단위 관측을 받아 `soulforge.ax_se_project_context_pilot_packet.v0`
  packet, 그 packet에서 파생되는 launch 필드(`launch_material`), 영수증을 낸다. 이미
  검증된 base packet은 stage rule이 소유하지 않는 모든 것(Knowledge View request·authority
  grant, role roster, objective, risks, project binding)의 템플릿이며, 관측은 mapping
  table의 `artifact_type_id` 또는 과제 `alias`로 engine requirement에 다시 키를 맞춘다.

경계:

- fs, clock, random, env, network를 쓰지 않는다. import graph 전체가 `node:crypto` 하나만
  bare로 쓰며 static effect pin 시험이 이를 고정한다. 파일 읽기·쓰기는 호출자 몫이고 CLI는 두지 않는다.
- overlay는 `add`·`alias`·`mark_not_applicable`·`condition`·`add_dependency`만 할 수 있다.
  evidence level을 올리거나 바꾸는 연산은 D45에 따라, 정본 간선을 지우는 연산은 D46에 따라
  거부한다. `add_dependency`는 exact `source_ref`와 `basis`를 요구하고 합집합으로만 더한다.
- 활동·결정 행은 규정이 요구하지 않는 한 `present`가 될 수 없고 `present_or_not_applicable`이
  상한이다. 증거가 문서가 아니라 기록이기 때문이며, 무엇이 그 기록인지는 행의
  `evidence_record`가 지목한다. 폴더는 만들지 않는다(`is_virtual`).
- 어휘가 모르는 입력 토큰은 컴파일을 거부하지 않고 영수증의 `unresolved_dependencies`에
  이름과 함께 남긴다. 간선 하나의 오타가 변형 전체를 막지 않아야 한다.
- 정본 대조 결과가 `unverified`·`unsupported`·`contradicted`이거나 아예 없는 규칙은
  `optional_context`로 낮추며, 낮추기만 하고 올리지 않는다. `partially_supported`는 낮추지
  않는다. 한 정본에서만 확인됐다는 뜻이지 근거가 없다는 뜻이 아니다.
- evidence level `general_se_guidance`는 발주처·국가와 무관한 체계공학 기준선(layer ①,
  spec `generic_se_base`)의 행이다. 규정이 아니라 지침이므로 `present_or_not_applicable`로
  가고, 같은 행의 `se_floor`가 `context`일 때만 `optional_context`로 내려간다
  (`must_have`/`should_have`는 둘 다 engine requirement). `se_floor`와 `maturity`는
  mapping table에 그대로 실려 나가며 그 밖의 판정에는 쓰이지 않는다.
- `optional_context` 행과 고정 내부 폴더는 엔진 requirement로 내보내지 않는다. gap scan
  정책과 mapping table에는 그대로 남는다.
- generator는 engine requirement가 없는 산출물 관측을 이웃 requirement로 추정하지 않는다.
  `receipt.unbound_observations`에 남기고 packet에서는 뺀다. 하나의 requirement에 관측이
  둘이거나, 하나의 이름이 두 requirement를 가리키면 거부한다.
- 재컴파일로 requirement 신원이 바뀌면 common projection binding은 base가 가리키던 exact
  requirement ref가 새 policy에 그대로 있을 때만 유지된다. 없으면 caller가 명시한
  `common_binding_requirement_id`로만 옮기며, 명시가 없으면 거부한다(임의 재배치·삭제 금지).
- generator는 subject를 import하지 않으므로 `assessOwnerFrozenProjectContext` preflight는
  시험과 호출자 쪽에서 돌린다. 영수증의 `preflight`가 이 위임과 모듈 안에서 실제로 재현한
  digest·분할 규칙을 기록한다.
- stage clear, Task 생성, 승인, canon 승격 권한은 없다. 영수증의 effect는 전부 0이다.
  파일 쓰기(packet·launch)는 호출자 몫이다.

범위 검증:

```text
npm run validate:se-stage-rules
```

public-safe 합성 fixture는 `docs/architecture/workspace/examples/se_stage_rules/`에 있다.

## 관측 후보 공급자 (`observation/`)

컴파일러가 "무엇이 있어야 하는가"를 만든다면 `observation/`은 "실제로 무엇이 있는가"의 앞부분을 만든다.
과제 자료 목록(파일 경로·이름·크기·sha256·수정시각)을 읽어 **어떤 파일이 어떤 산출물 종류로 보이는지**를
규칙 기반으로 제안하고, 사람이 확인한 것만 엔진 관측으로 바꾼다. 세 모듈 모두 순수 함수이며
fs·clock·random·env·network를 쓰지 않는다(정적 effect pin 시험). 파일을 읽는 쪽은 CLI 하나뿐이다.

- `artifact_observation_candidates.mjs` — `buildArtifactObservationCandidates(request)`:
  자료 목록 + compiled variant(들) + overlay 별칭 + 산출물 표준어 → `{candidates, unmatched, ambiguous, receipt}`.
  단서는 규칙에서만 온다: 업무폴더 번호 → 스펙 task → `artifact_type_id`(가장 강함), 그리고 파일명·제목 안의
  스펙 용어(`term`)·**표준어 토큰 자체**(`bom`, `hdd` — 토큰 경계로 찾으므로 `bom`이 `bomb`을 찾지 않는다)·
  표준어 `label_ko`/`label_en`·과제 별칭·**과제가 등록한 이름 패턴**(`alias_patterns`, 예 `^F245-` 같은 도면번호 규칙).
  성숙도는 `_D`/`_U`/`_F` 접미사와 `초안|draft|중간수정본|검토본|rev|최종|승인본|배포본|v0.x` 토큰.
  단서가 없으면 `unmatched`, 단서가 둘로 갈리면 `ambiguous`로 두고 **추정하지 않는다**. 모델을 부르지 않는다.
- `observation_confirmation_sheet.mjs` — 후보를 **업무폴더 단위 표 → 파일 단위 표** 순서의 한글 확인표와
  같은 줄의 JSON 시트(`decision: null`)로 만든다. `applyConfirmationSheet`가 파일 결정
  (`confirm`/`reject`/`reassign`)과 폴더 결정(`confirm_folder`/`reject_folder`)을 적용하며, 폴더 결정은
  그 업무폴더 `03_Out` 아래 후보 전부를 한 번에 처리한다(`01_Work`·`02_Input`은 건드리지 않는다).
  우선순위는 파일 결정 > 폴더 결정 > 자동 확정이고, 결정이 없는 줄은 확정도 반려도 아닌 **보류**로 남는다.
- `artifact_observations_from_confirmed.mjs` — 확인된 줄 + sha256 → `pilot_packet_generator`가 그대로 받는
  `artifact_observations[]`. (단계, 산출물 종류) 쌍마다 관측 하나이며, 여러 파일이 한 쌍에 걸리면
  성숙도 → 수정시각 → digest 순으로 이긴 파일을 쓰고 나머지는 영수증의 `superseded`에 남긴다.
- `observation_housekeeping.mjs` — `buildHousekeepingReport(request)`: 같은 걷기 결과에서 **판단이 아닌
  폴더 청소 항목**만 뽑는다(같은 산출물 파일 중복 · 엉뚱한 자료 가능성 · 전송용 압축·분할본 ·
  중간본·검토본 표현 · 한 단계에 업무폴더 중복 · `03_Out` 파일 없음). 관측이 아니고 결손 판정도 아니며
  파일 내용을 열지 않는다. `renderHousekeepingMarkdown`이 한글 표(단계/업무폴더/산출물/종류/내용/파일수)로 낸다.
  Owner 방침: 팀이 제대로 등록하기 시작한 뒤에도 이 점검은 **상시 가드로 남긴다**.
- `presence_state`는 언제나 `present`뿐이다. 걷지 못한 파일은 없는 것이 아니므로 이 층은
  `absence_confirmed`를 만들지 않는다(그 판단은 사람 몫).
- D46 활동(`activity`)·결정(`decision`) 노드는 문서가 아니므로 후보가 되지 않는다. 활동 폴더에 파일이
  있다는 것은 폴더가 비지 않았다는 뜻일 뿐 그 일이 수행됐다는 증거가 아니다.

자동 확정은 세 조건을 **모두** 만족할 때만이다: (1) 파일이 업무폴더의 `03_Out` 아래, (2) 그 업무가
산출물 종류 하나에만 대응, (3) 파일 이름이나 제목이 **그 산출물**을 가리키는 단서를 가짐.
(3)은 실제 과제에서 나왔다 — 회의록 업무폴더의 `03_Out`에 제출용 도면·자재명세서가 들어 있어 폴더만
보면 전부 회의록으로 확정된다. 보류한 건수는 영수증 `auto_confirm_withheld_no_own_cue`에 남는다.
그 밖의 모든 후보는 `needs_owner_confirmation`으로 남는다(설계 D37: 자동 추출은 후보, 확정은 사람).

호출자(파일·시계를 쓰는 유일한 자리):

```text
node guild_hall/engineering_engine/tools/artifact_observation_inventory_runner.mjs \
  --project-root <abs> --out <abs dir> --compiled-variant <abs json> [--overlay <abs json>] \
  [--alias-patterns <abs json>] [--include-globs "<glob>"] [--exclude-globs "<glob>"] \
  [--max-files N] [--known-at <instant>] [--no-auto-confirm]
```

`--out` 아래에만 쓰고, 이미 있는 실행 산출물은 덮어쓰지 않고 거부한다.
`.git`·`node_modules`·`00_Temp`·`__pycache__`·`_trash*`와 심볼릭 링크, 크기 상한을 넘는 파일은 건너뛴다.
산출은 7개: `inventory.json`·`candidates.json`·`confirmation_sheet.md`·`confirmation_sheet.json`·
`artifact_observations_auto.json`·`housekeeping_report.md`·`receipt.json`.

범위 검증:

```text
npm run validate:se-observation
```

`--alias-patterns` 파일은 과제 자료면에 둔다(정규식 source·근거만; public 코드에 넣지 않는다).
사람이 읽는 설명은 매뉴얼 [10장 관측 공급자](manual/10_observation_eye.md)에 있다.

public-safe 합성 fixture는 `docs/architecture/workspace/examples/se_stage_rules/observation_candidates_synthetic_v0.json`이다.

## 안내 층 (`guidance/`)

판단 층은 "있냐 없냐"만 답한다. `guidance/`는 그 답 옆에 **"왜·언제·무엇을·어떻게·누가"**를 붙여
사람이나 서브 에이전트가 움직일 수 있게 만든다(설계 D47 제안, 계획 조각 A3). 판단을 바꾸지 않는 것이
이 층의 존재 이유이므로 수·판정·정책 ref는 전부 **복사**해 오고 다시 계산하지 않는다.
세 모듈 모두 순수 함수이며 fs·clock·random·env·network를 쓰지 않는다(정적 effect pin 시험).

- `guide_cards.mjs` — `buildGuideCards({compile_result, vocabulary, compiled_variant?, source_catalog?, work_order?, template_library?})`:
  (단계, 산출물 종류)마다 카드 하나. 엔진 요구가 된 행 전부와, 요구가 되지 않았어도 활동·결정 행은
  카드를 받는다(그 행들이 "무슨 일을 해야 하는지"를 말하는 행이기 때문). 카드는
  `purpose`(정본이 말한 목적 + 그 위치) · `used_by`(같은/뒤 게이트에서 이것을 입력으로 적은 행) ·
  `gate_role`(핵심·진입·보조) · `why`(목적 → 없으면 막히는 것 → 게이트 역할 → 근거 등급·기대 상태·행 종류) ·
  `when`(단계·기대 성숙도·앞뒤 입력 수) · `what`(스펙의 이름·설명·증거 기록) ·
  `how`(양식과 라이브러리 파일 참조·입력 토큰과 관측 상태(있음/없음/불명)·이 항목을 입력으로 쓰는 항목·
  근거 인용과 계열) · `who`(기본 담당 capability) · `evidence`(근거 등급·정본 대조 결과·SE 바닥) ·
  `citations`(인용 위치)로 이루어진다. 목적 문장은 스펙 행의 `purpose_ko`를 **복사**한 것이고 이 층이 짓지 않는다
  (도출은 매뉴얼 03장 §3.10).
- `instruction_packet.mjs` — `buildInstructionPackets({assessment, work_order, guide_cards, known_at, role_roster?, context_fill?, include_next_ready?, top_n?})`:
  mission 후보마다 지시서 하나(`soulforge.engine_instruction_packet.v0`). 무엇을·왜(엔진 판정 +
  카드) · 입력(과 관측 기준 상태) · 산출 · 어떻게 · 근거 · 담당 · 기한 · `judgment_ref`(policy_ref,
  assessment_handle, requirement_counts 스냅숏) · `guidance_ref`(card_id). `claim_ceiling`은 언제나
  `candidate`다.
- `answer_render.mjs` — `renderNextStepsAnswer({assessment, work_order, instructions, guide_cards, stage_code, locale})`:
  한국어 마크다운 + 같은 내용의 JSON. 순서는 고정 — **1 위치 · 2 부족 · 3 다음 할 일 · 4 그 뒤(막힌 것)**.
  수치를 먼저 놓는 이유는, 할 일부터 읽은 사람은 "엔진이 결손이라 판정한 것"과 "아직 아무도 안 본 것"을
  구분하지 못한 채 움직이기 때문이다.

경계:

- **문장을 짓지 않는다.** 카드·지시서의 한국어 문장은 전부 `GUIDE_CARD_TEMPLATES`의 고정 틀이고, 슬롯 값은
  규칙 행에서 그대로 복사한다. 각 문장은 `{template_id, text_ko, slots}`로 나가며 시험이 template_id로
  재렌더해 바이트가 같은지 확인한다. 모델을 부르지 않는다.
- **행이 말하지 않은 것은 말하지 않는다.** 양식이 없으면 `양식 없음`, 인용이 없으면 `근거 미표기`로
  적는다. 일반 지식으로 채우면 인용된 지시와 구분할 수 없는 지시가 사람 앞에 놓인다.
- **인용은 위치만.** 카드는 `{source_key, locator}`를 싣고 원문을 싣지 않는다. 색인 카탈로그를 주면
  그 카탈로그가 이미 가진 제목만 덧붙고, 없는 출처는 `catalog_known: false`로 정직하게 남는다.
- **지시서는 쓰기가 아니다.** `presence_state`·수정본 ref·완료 표시 같은 필드가 지시서에 들어가려 하면
  빌드를 거부한다(`forbidden_instruction_keys`). 담당은 논리 역할이며, 사람은 호출자가
  `context_fill.owners`로 준 경우에만 들어간다. 기한도 마찬가지다 — 이 층은 시계를 읽지 않으므로
  `known_at`은 호출자 입력이다.
- 엔진이 mission 후보를 요청 수보다 적게 냈을 때만 "안 막혔는데 아직 관측되지 않은" 항목으로 채우며,
  그 항목은 `instruction_kind: next_ready` · `engine_finding: not_yet_observed`로 따로 표시한다.
  판정이 아니라 "아무도 안 봤다"이기 때문이다.

호출자(파일을 쓰는 유일한 자리):

```text
node guild_hall/engineering_engine/tools/engine_next_steps_runner.mjs \
  --compile-dir <abs dir> --assessment <abs json> --stage <code> --out <abs dir> \
  [--compiled-variant <abs json>] [--observations <abs json>] [--source-catalog <abs json>] \
  [--context-fill <abs json>] [--template-library <abs json>] [--template-library-root <abs dir>] \
  [--top N] [--known-at <instant>]
```

`--compile-dir`는 드라이버가 이미 쓴 `mapping_table.json`과 `needs_stage_declarations.json`을 읽는다.
`--out` 아래에만 쓰고 이미 있는 답은 덮어쓰지 않고 거부한다(답은 그 시점 기록이다).
`--compiled-variant`를 주면 스펙 행의 설명·양식·목적·정본 대조 결과가 카드에 실린다.
`--template-library-root`는 양식 라이브러리를 읽기 전용으로 훑어 산출물마다 양식 파일 하나를 찾는다 —
답에는 라이브러리 이름과 **라이브러리 안쪽 상대 경로**만 실리고 private worksite의 절대 위치는 나가지 않는다.

범위 검증:

```text
npm run validate:se-guidance
```

public-safe 합성 fixture는 `docs/architecture/workspace/examples/se_stage_rules/next_steps_synthetic_v0.json`이다.

## MCP 문 (`mcp/`) — 만들어졌고 꺼져 있다 (과제 명부 · 신원 · 잠금 착지 2026-08-19)

Owner 결정(계획 9.1A): **밖에서 엔진을 부르는 정문은 MCP 하나다.** `mcp/`는 그 문이며 dev-ERP가 아니라
엔진 owner 아래에 독립으로 산다. 도구는 **로직을 갖지 않는다** — 프로필이 지정한 파일을 읽고, 이미 있는
순수 함수나 runner를 그대로 부르고, 결과를 마크다운과 JSON 두 벌로 낼 뿐이다. 상세는 매뉴얼
[12장](manual/12_mcp_door.md).

```text
node guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --registry <abs project_registry.json>
node guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --profile  <abs project_profile.json>
  [--repo-root <abs>] [--principal '{"principal_ref":"…","role":"…"}'] [--access-table <abs>]
```

- **스위치 둘.** `SOULFORGE_ENGINE_MCP=on`이 없으면 한 줄 거절 후 exit 3. `SOULFORGE_ENGINE_MCP_WRITE=on`이
  없으면 쓰기 도구는 `tools/list`에서 **숨겨지고** 직접 호출은 `WRITE_TOOLS_DISABLED`로 거절된다(2026-08-19
  변경, 9.1E ⑪ — 목록 응답이 `tools_total`·`tools_hidden`으로 "없음"이 아니라 "지금 안 보임"임을 말한다).
  켜는 것은 Owner 결정이며 이 저장소는 어떤 클라이언트에도 이 서버를 등록하지 않았다.
- **프로토콜.** stdio 위의 줄 단위 JSON-RPC 2.0을 직접 구현했다(`initialize` · `notifications/initialized` ·
  `ping` · `tools/list` · `tools/call`, `protocolVersion` `2025-06-18`). 새 npm 의존성은 없다. 결과는
  `content:[{type:'text'}]` + `structuredContent` + `_meta.engine_version`이다. 인자 오류는 `isError`
  도구 결과이고, `-32000`은 권한·잠금·스위치 같은 프로토콜 층 거절에만 쓴다.
- **과제 명부.** `mcp/project_registry.mjs`가 `soulforge.engine_project_registry.v0`(코드 → 프로필 경로 ·
  상태 `active|paused|closed` · 기본 과제)을 검증한다. 실체는 private
  `_workmeta/system/engine/project_registry.json`, public에는 `<abs>` 자리표시자 합성 예시만 둔다.
  모든 도구가 `project_code`를 선택 인자로 받고, 과제별 컨텍스트는 LRU 8개까지 캐시된다.
  `--profile`은 "명부가 한 줄인 경우"로 남았다.
- **프로필.** `mcp/project_profile.mjs`가 과제당 private JSON 한 장(`soulforge.engine_project_profile.v0`)을
  검증한다. 모든 경로는 절대경로이고 `..`을 담지 않으며 `_workspaces/**` · `_workmeta/**` ·
  `.registry/skills/se_foldertree_generate/codex/assets/**` 세 뿌리 안에만 있을 수 있다.
  `receipts_dir`·`runs_root`는 그 위에 **`_workmeta/<project_code>/` 아래**여야 한다(두 과제의 영수증이
  섞이는 것을 구조로 막는다). 키 집합은 정확히 일치해야 하고 모르는 키는 무시가 아니라 거절이다.
  호출자가 경로를 대는 자리는 확인표 하나뿐이며 그것도 프로필이 지정한 관측 폴더 아래여야 한다.
- **신원과 접근표.** 문은 인증하지 않는다. 위층(비서·게이트웨이)이 댄 `--principal {principal_ref, role}`을
  믿되 영수증에 적고 접근표(`soulforge.engine_access_table.v0`, 명부 옆; 없으면 코드 기본표)대로 거른다.
  신원이 없으면 공개 규칙 등급 ⓐ 읽기 도구만 열리고 나머지는 `SE_MCP_PRINCIPAL_REQUIRED`다. 표에 없는
  역할은 아무 권한도 없고, 등급이 안 붙은 것은 ⓒ로 다룬다(fail-closed). **권한을 바꾸는 도구는 없다.**
- **도구 17종** (읽기 13 · 쓰기 4): `whoami` · `engine_status` · `access_table` · `projects_list` ·
  `rules_layers` · `rules_stage` · `rules_card` · `rules_version` · `observe_scan`\* ·
  `observe_register`\* · `observe_confirm`\* · `observe_status` · `judge_run`\* · `judge_result` ·
  `judge_diff` · `next_steps` · `project_status` (\* = 쓰기).
  `observe_register`는 관측이 아니라 **확인 대기 후보**를 남긴다(자동 확정 3조건은 채팅 발언을 포함하지
  않는다, D37). `next_steps`는 저장된 판정을 인용만 하고 파일을 쓰지 않는다.
- **영수증.** 도구에 닿은 호출마다 `receipts_dir/mcp_tool_calls.jsonl`에 한 줄 — 도구 이름, 과제 코드,
  누가(`principal_ref`·`role`), 허용/거절과 사유, 인자·결과 digest, 소요 시간, engine_version.
  **원문·경로·파일 이름은 들어가지 않는다.** `_workmeta`에 쓰기 전 저장소의 `guard:workmeta-write`와 같은
  정책 함수를 문이 직접 부른다.
- **잠금·캐시·경로 예산.** 쓰기 도구는 과제·도구별 create-only 잠금(`runs_root/locks/<tool>.lock.json`)을
  잡고, 이미 잡혀 있으면 대기가 아니라 `SE_MCP_LANE_BUSY`로 거절한다(계약 `lane_1d` §4.3). 오래된 잠금은
  알려주되 엔진이 지우지 않는다. 쓰기가 성공하면 그 과제의 캐시 세대를 올려 이전 항목을 못 쓰게 만든다
  (확정 뒤 판단이 옛 관측을 쓰던 문제). 모든 평면의 쓰기 대상에 경로 예산(200/60/60)을 적용하고
  `run_id`·`revision_label`은 24자다. 그 밖의 잠금은 그대로다: launch + sha 핀, Owner 동결 grant,
  zero-write, create-only 출력.

```text
npm run validate:se-mcp
```

public-safe 합성 fixture는 `docs/architecture/workspace/examples/se_stage_rules/`의
`project_profile_synthetic_v0.json` · `project_registry_synthetic_v0.json` ·
`access_table_synthetic_v0.json`이며 `fixtures/engine_mcp_synthetic_project.mjs`가 그것들과
`next_steps_synthetic_v0.json`을 임시 폴더에 과제 하나 또는 여러 개 모양으로 깔아 준다. 실제 과제 자료는
시험에 들어가지 않는다. 사람이 클라이언트에 등록하는 절차는 매뉴얼 [12장 §12.A](manual/12_mcp_door.md#12a-등록사용-안내-사람용)와
[`mcp/README.md`](mcp/README.md)에 있다.

## AX·SE 프로젝트 평가 subject (active slice)

`subjects/ax_se_project_assessment.mjs`는 exact source-bound project snapshot,
stage policy, role 목록을 읽어 현재 engineering 상태를 candidate로 투영한다.

- 출력은 현재 canonical stage, missing/unknown/conflict/risk issue, 최대 3개 mission
  candidate, logical role candidate 또는 `HOLD`, done/HOLD 조건이다.
- exact ref/hash drift는 거부한다. 관측되지 않았거나 불충분한 상태만 `UNKNOWN`이며,
  명시적 부재 근거가 있을 때만 missing으로 분류한다.
- model call, network call, filesystem write, ERP write가 없는 deterministic pure
  function이다. TaskIntent 생성, TaskDriver 활성화, 사람 assignment, stage clear,
  canon promotion을 하지 않는다.
- `floor_status`는 `blocked` 또는 `active`만 낸다. 현재 input에는 snapshot freshness와
  terminal provenance가 없으므로 `boss_clear_candidate`도 내지 않으며, `cleared`는 이
  subject의 권한 밖이다.
- 적용 가능한 requirement가 하나도 없는 stage policy는 판단 대상과 Boss Clear 근거가
  없으므로 fail-closed 거부한다. 관측 0건을 `boss_clear_candidate`로 바꾸지 않는다.
- `stage_code`는 lifecycle 안에서 유일해야 하며 두 stage가 한 risk bucket을 공유하도록
  만드는 중복 policy는 거부한다.
- RAG, Knowledge Graph, Wiki는 optional source/context support provider이며 필수
  의존성이 아니다. Engine 판단에는 learned model이 필요하지 않다.
- `AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA`와 `buildAxSeAssessmentInput(request)`는 이미
  sanitize되어 requirement에 묶인 context packet 하나와, 별도로 source-bound된 stage
  policy, logical role 목록, 기대하는 exact project binding만 받아 `assessAxSeProject`가
  읽는 input으로 봉인한다.
- builder는 caller 의미가 없는 unordered row만 canonical 정렬하고 snapshot content SHA를
  직접 계산한다. caller가 주장한 snapshot hash, 다른 project에 묶인 packet, packet과
  policy의 ref 불일치는 거부한다.
- builder는 `_workspaces`/`_workmeta`를 읽거나 sanitize하지 않고, requirement status나
  missing을 추론하지 않으며, 사람을 배정하지 않고, live current 상태를 주장하지 않는다.
- `roles`는 아직 caller-supplied logical routing 선언이며 별도의 source-bound roster가
  아니다. 따라서 role candidate만 지지하고 사람·조직 배정 권한은 전혀 지지하지 않는다.
- `subjects/ax_se_project_role_roster.mjs`는 그 다음 경계를 위한 독립 public-safe
  module이다. exact project binding, source revision refs, capability vocabulary ref,
  `valid_at`/`known_at`, coverage와 logical role routing state를 한 content-addressed
  roster candidate로 봉인한다. `partial`/`unknown` coverage 또는 unknown routing은
  exclusivity 근거가 아니며, 이 v0 module은 아직 assessment v0 입력에 연결되지 않는다.
- role roster candidate도 사람 신원, live availability, 조직 승인, assignment,
  TaskIntent, ERP write 또는 canon promotion을 증명하지 않는다. 실제 pilot은 roster와
  assessment 사이의 별도 v1 binding 및 Owner가 고정한 exact refs 전까지 `HOLD`다.
- `subjects/ax_se_project_role_bound_assessment.mjs`는 그 별도 v1 결합을 구현한다.
  combined packet 밖의 full exact roster ref를 독립 pin으로 검증하고, packet 안에서
  policy와 roster가 선언한 exact capability-vocabulary ref가 같은지도 확인한다.
  capability token은 exact 문자열 일치로만 비교하며 vocabulary 본문 membership을
  검증했다고 주장하지 않는다.
- complete coverage와 known routing에서만 logical role candidate를 낸다. partial/unknown
  coverage 또는 unknown routing에서도 stage/gap/risk 평가는 계속하지만 role routing과
  전체 v1 resolution은 `HOLD`다. 이 logical projection은 사람 신원, 실제 가용성,
  assignment, TaskDriver, ERP, model, network 또는 write authority를 만들지 않는다.
  stage 자체의 미관측은 `resolution.stage_gap_state`에 `UNKNOWN`으로 보존하고, 최종 진행
  가능 여부는 `resolution.overall_state`와 `assessment_state`에서 읽는다. 역할 결정은
  `resolution.role_decisions_scope=emitted_mission_candidates_only`가 가리키는 최대 3개
  mission candidate에만 적용된다.
- v1에는 pure subject, public synthetic fixture와 아래의 별도 zero-write v1 command
  runner가 있다. accepted v0 subject·v0 runner·roster bytes는 그대로 보존한다.
  Owner-pinned actual-project 1회 pilot은 여전히 다음 별도 gate다.
- raw assess input은 그대로 유효하며, builder는 frozen/manual pilot에서 더 안전한 봉인
  입구다.

`tools/ax_se_project_assessment_runner.mjs`는 이 subject의 zero-write pilot 명령 seam이다.

- 인자는 정확히 두 개다: `--packet`(absolute local packet file 하나)과
  `--packet-sha256`(그 파일 raw byte의 SHA-256 pin). packet 2 MiB, packet path 4096자,
  prepared result 4 MiB의 상한을 넘으면 거부한다.
- pin은 UTF-8 decode와 JSON parse 전에 exact raw byte 위에서 검증한다. packet은 bounded
  ordinary singly named file 하나만 읽고, 출력 파일은 만들지 않는다.
- stdout에는 prepared canonical assessment 하나, stderr에는 closed payload-free receipt
  하나만 낸다. receipt의 `submitted`는 callback이 정상 반환했다는 뜻이지 OS delivery
  보장이 아니다. stderr callback 실패 시 반환된 receipt는 제출을 시도한 원본이며,
  `receiptSubmissionState: failed`와 exit 2를 함께 읽어야 하고 자동 재시도하지 않는다.
- command PASS는 domain `HOLD`/`UNKNOWN`/`READY_FOR_OWNER_REVIEW`와 분리된 사실이다.
  receipt의 gate/authority flag는 모두 false이고 `canon_claim_ceiling: observed`이며
  출력은 candidate-only다.
- model, RAG, Wiki, ERP, TaskDriver, network 호출과 file write가 없고, project 자료를
  discover/sanitize/approve하지 않는다.

```text
node guild_hall/engineering_engine/tools/ax_se_project_assessment_runner.mjs \
  --packet <absolute-packet-path> \
  --packet-sha256 <64-hex-lowercase-sha256>
```

`tools/ax_se_project_role_bound_assessment_runner.mjs`는 role-bound v1 subject의 별도
zero-write 명령 seam이다. v0 runner의 accepted bytes는 바꾸지 않는다.

- 인자는 정확히 다섯 flag/value 쌍(argv 10개)이며 그 외 개수, 중복 flag, 미지 flag, 빈 값,
  `--`로 시작하는 값은 모두 거부한다: `--packet`, `--packet-sha256`,
  `--expected-role-roster-entity-id`, `--expected-role-roster-revision-id`,
  `--expected-role-roster-content-sha256`. 두 sha256 값은 64자 lowercase hex여야 하고 두
  roster 식별자는 bounded safe token이어야 한다.
- 기대 roster ref는 packet 밖에서 독립으로 공급한다. runner는 그 세 값을
  `{ entity_id, revision_id, content_id: "sha256:<hex>", content_hash_alg: "sha256" }`로
  조립해 subject에 넘기고, roster binding 검증은 subject가 수행한다. runner는 roster를
  읽거나 승인하지 않는다.
- packet pin은 UTF-8 decode와 JSON parse 전에 exact raw byte 위에서 검증한다. packet은
  bounded ordinary singly named file 하나만 읽으며 packet 2 MiB, packet path 4096자,
  prepared result 4 MiB 상한을 넘으면 거부한다. 출력 파일은 만들지 않는다.
- stdout에는 prepared canonical assessment 하나, stderr에는 closed payload-free receipt
  하나만 낸다. receipt는 local path, raw roster identifier, source text를 담지 않는다.
  대신 packet SHA-256·byte count, full expected roster ref의 domain-separated fingerprint,
  assessment handle, prepared output SHA-256·byte count, mission candidate count를 기록해
  서로 다른 run의 입력·roster·출력이 뒤섞이지 않게 결속한다. blocker는 closed
  `AX_SE_ROLE_BOUND_COMMAND_*` code와 stage로만 보고한다. `submitted`는 callback이 정상
  반환했다는 뜻이지 OS delivery 보장이 아니며, stderr callback 실패 시
  `receiptSubmissionState: failed`와 exit 2를 함께 읽어야 하고 자동 재시도하지 않는다.
- command PASS는 domain 결과와 분리된 사실이다. domain `HOLD`와 `UNKNOWN`도 성공한 평가
  결과이며, receipt의 gate/authority flag(`stage_clear_allowed`, `owner_decision_made`,
  `task_intent_created`, `roster_approved`, `human_identity_bound`,
  `live_availability_claimed`)는 모두 false이고 `canon_claim_ceiling: observed`다.
- effects는 명시적으로 0이다: `erp_writes`, `filesystem_writes`, `model_calls`,
  `network_calls` 모두 0이고 `taskdriver_activated: false`,
  `persistence.persistent_file_writes: 0`이다. model, RAG, Wiki, ERP, TaskDriver, network
  호출과 file write가 없고 project 자료를 discover/sanitize/approve하지 않는다.

```text
node guild_hall/engineering_engine/tools/ax_se_project_role_bound_assessment_runner.mjs \
  --packet <absolute-packet-path> \
  --packet-sha256 <64-hex-lowercase-sha256> \
  --expected-role-roster-entity-id <token> \
  --expected-role-roster-revision-id <token> \
  --expected-role-roster-content-sha256 <64-hex-lowercase-sha256>
```

### M2-2 Owner-frozen Project Context pilot (public-synthetic implementation candidate)

`subjects/ax_se_project_context_pilot.mjs`는 M2-1 Knowledge View와 기존 role-bound
AX·SE subject를 새 판단 엔진으로 복제하지 않고 한 번 결합하는 deep Interface다.

- packet 밖에서 공급된 exact pilot-grant ref를 먼저 검증한다. 그 grant는 exact project,
  M2-1 grant ref, expected role-roster ref, project-source manifest ref와 portable pilot
  material fingerprint를 함께 결속한다. M2-1의 `synthetic_validation_only` 권한을 실제
  read/Engine 권한으로 재해석하지 않는다.
- `project_source_binding_manifest`는 objective, observation artifact/evidence/conflict source,
  risk/evidence, roster source, capability vocabulary와 project로 분류된 policy requirement의
  exact ref 전체를 닫는다. `common_projection_bindings`는 선택된 common revision을 실제
  policy requirement ref에 명시적으로 연결한다. 모든 downstream ref는 project manifest와
  approved common 집합 중 정확히 하나에 속해야 한다.
- source body는 열지 않는다. manifest와 mapping은 Owner-frozen exact-reference attestation이며
  source truth, source-file membership, freshness, terminal provenance 또는 live-current를
  증명하지 않는다. 결과 claim ceiling은 `observed`이고 stage/assignment/Task/ERP/canon 권한은
  모두 false다.
- `tools/ax_se_project_context_pilot_runner.mjs`는 `--launch`와 `--launch-sha256` 두 flag만
  받는다. Owner-frozen launch를 raw-byte pin과 canonical JSON으로 먼저 확인하고 M2-1 root
  admission을 수행한 뒤, 그 project root 아래 relative locator의 packet 한 파일만 stable
  handle로 읽는다. stdout은 canonical candidate result 하나, stderr는 path·raw ID·본문 없는
  receipt 하나이며 자동 retry, output file, model/RAG/Wiki/ERP/TaskDriver call/write가 없다.
- 현재 구현·시험 범위는 public-synthetic다. 실제 과제 launch, actual source body read,
  accepted generation과 live activation은 Owner가 별도로 packet·grant·root provenance를
  고정하기 전까지 `HOLD`다.

```text
node guild_hall/engineering_engine/tools/ax_se_project_context_pilot_runner.mjs \
  --launch <absolute-owner-frozen-launch-path> \
  --launch-sha256 <64-hex-lowercase-sha256>
```

public fixture와 focused validator:

- `docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_assessment_synthetic_v0.json`
- `docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_role_roster_synthetic_v0.json`
- `docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_role_bound_assessment_synthetic_v1.json`
- `guild_hall/engineering_engine/engines/systems_engineering/tests/ax_se_project_assessment.test.mjs`
- `guild_hall/engineering_engine/engines/systems_engineering/tests/ax_se_project_role_roster.test.mjs`
- `guild_hall/engineering_engine/engines/systems_engineering/tests/ax_se_project_role_bound_assessment.test.mjs`
- `guild_hall/engineering_engine/engines/systems_engineering/tests/ax_se_project_assessment_runner.test.mjs`
- `guild_hall/engineering_engine/engines/systems_engineering/tests/ax_se_project_role_bound_assessment_runner.test.mjs`
- `guild_hall/engineering_engine/engines/systems_engineering/tests/ax_se_project_context_pilot.test.mjs`
- `guild_hall/engineering_engine/engines/systems_engineering/tests/ax_se_project_context_pilot_runner.test.mjs`
- `npm run validate:engineering-engine-ax-se-project-context-pilot` — M2-2 pure composition과
  two-flag zero-write command의 syntax·public-synthetic·adversarial 계약을 검증한다.
- `npm run validate:engineering-engine-ax-se-project-assessment` — assessment·role-roster·
  role-bound 및 M2-2 subject, 세 zero-write runner, 위 일곱 test 파일의 syntax check와
  실행, engine manifest verify, committed topology와
  현재 코드의 fresh emit byte equality까지 수행한다.
- root `npm run validate`와 `npm run done:check`도 위 focused validator를 Watchtower보다
  먼저 실행하므로, role-bound v1 runner나 receipt 계약이 루트 완료 경계를 우회할 수 없다.

assessment v0와 그 pilot 명령 seam은 public deterministic candidate 경계에서 독립 Level 3
검토까지 통과했다. role-roster v0, 이를 결합한 role-bound v1 pure subject, 그리고 위
role-bound v1 zero-write runner까지 구현됐고 focused validator에 연결됐다.

M1의 public deterministic role-bound AX·SE v1 subject, zero-write 명령 runner, focused
validator와 fresh Level 3 B/V review는 닫혔다. 이 수락은 public
synthetic/process/adversarial 경계에 한정하며 actual project pilot, live-current,
assignment 또는 project-ready 수락을 뜻하지 않는다.

현재 active slice는 M2 public-synthetic candidate다. Project Context Adapter v0와
Owner-frozen/manual exact packet·roster pin을 결속하는 zero-write pilot command가 구현돼
있지만, 실제 과제 실행은 exact launch/packet/grant/root provenance를 Owner가 별도로
고정할 때까지 `HOLD`다. accepted-context generation/freshness와 terminal provenance는 그
이후의 별도 gate로 남으며, 그 전에는 issue-free stage도 `active`다.

### P5 Project Context generation candidate (public-synthetic foundation)

`kernel/project_context_generation_candidate.mjs`는 P4의 exact knowledge input,
M2-2 observed assessment, 그리고 P5A-0 timeline metadata를 하나의 deterministic
pre-acceptance candidate로 조합한다. 이 Module의 단일 Interface는
`buildProjectContextGenerationCandidate(request, trustedExpectedPin)`이며, P4/M2/timeline producer나
P5 acceptance·generation-advance boundary를 import하지 않는다.

- request의 exact root는 `producer_outputs`와 `owner_context_contract`뿐이며,
  `whole_material_pin`을 중복 보관하지 않는다. `trustedExpectedPin`은 별도로 supplied되는
  `{material_ref, expected_material_sha256, expected_project_binding_ref, valid_at, known_at}`의
  exact closed record다.
- Module은 accepted된 **전체 snapshotted request**(P4 result receipt와 모든 owner lineage
  field 포함)를 domain-separated canonical form으로 hash하여 두 번째 인자의 expected hash와
  비교한다. 이 비교는 supplied pin의 무결성 확인일 뿐, pin의 외부 provenance·인증을
  이 Module이 주장하는 것은 아니다.
- request는 body-free exact refs/digests, externally pinned project crosswalk,
  complete source/common membership, independent `valid_at`·`known_at` cutoffs,
  review states, HPP sole-writer epoch, prior/current generation proposal만 받는다.
  각 asserted record는 canonical instant이며 `known_at`이 `valid_at`보다 앞서면 거부한다.
- opaque timeline project ref는 typed P4/M2 project ref와 crosswalk ref/digest로만
  연결된다. source body, query, explanation, local path, secret은 입력·출력 모두 거부한다.
- output은 deep-frozen `ready_for_registered_human_review` 또는 `HOLD` candidate와
  payload-free receipt다. P5 acceptance, generation advance, HPP writer, legacy CSV
  writer, model/network/ERP/Task effect는 모두 false/0이다.
- M2-2의 source membership/source truth/freshness/terminal provenance false value는
  exact in-membership evidence가 있을 때만 pre-review candidate에서 해소될 수 있으며,
  이것은 source truth나 human approval을 만들지 않는다.

```text
npm run validate:engineering-engine-p5-context-generation-candidate
```

이 focused validator는 Module/test syntax, deterministic replay, bitemporal cutoff,
cross-project·duplicate·CAS·writer·provenance HOLD, unsafe getter/proxy/alias/cycle 거부,
그리고 forbidden acceptance/writer/effect import scan을 검증한다. Engine topology/manifest
derived artifacts는 별도 root integration owner가 갱신한다.

### P5 accepted generation gate and query (public-synthetic foundation)

`kernel/project_context_acceptance_gate.mjs`는 candidate가 export한 exact public-safe
content digest, membership/source-set digests, coverage-gap receipt, registered-human
reviewed membership set, store-bound reviewer/writer anchors, writer epoch와 prior/current
pointer CAS를 재검증한다. in-memory store는 append-only generation·receipt를 보존하고
exact submission replay만 idempotent하게 허용한다. duplicate generation, pointer rollback,
stale epoch, incomplete review/coverage, unresolved supersession과 tampered manifest는 `HOLD`다.

accepted manifest는 HPP writer가 호출됐거나 actual generation이 전진했다고 주장하지 않는다.
`writer_called=false`, `generation_advanced=false`, `writer_calls=0`을 유지하고 별도의
`execution_evidence`에 `writer_witness_verified`, `in_memory_pointer_advanced`,
`synthetic_store_write`만 기록한다. opaque owner-row lineage digest는
`owner_contract_input_digests` 아래에 두고, served memberships와 source revision set은
별도 recomputable exported digest로 검증한다.

dev-ERP의 `accepted_context_query.mjs`는 mandatory exact ACL을 먼저 확인한 뒤 current
accepted pointer·manifest·receipt digest를 매 query 재검증한다. unauthorized, revoked,
foreign, absent, wrong-generation, stale-generation은 동일한 `NOT_AVAILABLE` envelope로
수렴하며 project/common implicit fallback과 existence leak을 금지한다. cursor는 generation,
actor, grant revision, scope, purpose, `as_of`에 pin되고 query는 store·Task·ERP를 쓰지 않는다.

```text
npm run validate:voice-first-accepted-context
```

이 foundation은 실제 human acceptance, private persistence, HPP fenced writer 호출,
ERP/P6 projection 또는 live query activation을 뜻하지 않는다.

## kernel 이 하지 않는 것

`kernel/index.mjs` 의 `NON_CAPABILITIES` 가 코드로 선언한다.

- local 또는 remote 학습모델 호출
- 등록된 사람 대신 context 수락
- `accepted_context_generation` 증가
- ERP task 장부 write
- 식별자 값 생성 (`D-P10-03` 종결 — 직렬 경계가 값을 공급하고 kernel 은 검증·등록만 한다)
- public engine 폴더 선택 (종결됨, 이 문서 위치가 그 결과)
- 실제 project 자료·source 본문·credential 읽기

## 실행 경계

- Phase 1–4 baseline 은 `deterministic_only` 다. Engine runtime 은 학습모델을 호출하지 않고 학습모델 출력을 truth 로 쓰지 않는다.
- embedding·semantic reranker 는 별도 승인 전까지 authoritative path 밖의 `shadow_only` 후보다.
- authoritative path 의 retrieval 은 lexical/BM25 와 결정론 filter 로 한정한다.

## Phase 1 구성

| lane | field group | 구현 | 계약문 |
|---|---|---|---|
| substrate | Phase 1-0 공통 계약 11항목 | `kernel/` 최초 9 모듈 (현재 커널 전체 23) | 동결 bundle |
| 1A | snapshot envelope · state axes · Finding · Context Request · P5–P8 | `snapshot.mjs`, `pipeline.mjs` | `contracts/lane_1a_snapshot_and_pipeline_v0.md` |
| 1B | inventory · custody · eligibility · lineage | `custody.mjs`, `lineage.mjs` | `contracts/lane_1b_custody_and_lineage_v0.md` |
| 1C | typed graph · bounded capsule | `graph.mjs`, `capsule.mjs` | `contracts/lane_1c_graph_and_capsule_v0.md` |
| 1D | MCP 요청·CAS·idempotency | `mcp_contract.mjs` | `contracts/lane_1d_mcp_concurrency_v0.md` |
| 1E | module ABI · binding · release · rollback | `module_binding.mjs` | `contracts/lane_1e_module_and_release_v0.md` |
| 1V | 변이 lock | `tests/lane_1v_mutation_lock.mjs` | `contracts/lane_1v_verification_lock_v0.md` |
| runtime | 하트비트 · 간선별 전달 영수증 | `heartbeat.mjs`, `delivery_receipt.mjs` | `contracts/runtime_observation_v0.md` |
| phase 3 | Context Request/Response 영수증 (합성) | `context_receipt.mjs` | `contracts/phase_3_context_receipts_v0.md` |
| assembly | 조립된 1 pass · subject adapter | `assembly/engine_pass.mjs`, `subjects/` | — |
| output | 소비자용 읽기 계약 | `tools/output_binding.mjs` | `contracts/engine_output_read_contract_v0.md` |

`D-P10-03` 발급 경계는 `kernel/minting.mjs` 가 소유한다.

## 검증

한 번에 전부 (여덟 검사 모두 통과해야 한다):

```
node guild_hall/engineering_engine/tools/phase_1_integration_check.mjs \
  --oracle <phase_1_0 bundle>/phase_1_0_synthetic_oracle.json \
  --bundle <phase_1_0 bundle> \
  --scratch <임시 디렉터리>
```

개별 suite 는 `tests/` 아래에 있다. kernel suite 만 동결 oracle 을 인자로 받는다.

byte manifest 는 추적 소스만 담으며 자기 path base 를 헤더로 선언한다. receipt 는 실행 결과라 매번 바뀌므로 제외한다 — 넣으면 manifest 가 스스로를 무효화한다.

```
node guild_hall/engineering_engine/tools/emit_manifest.mjs --out guild_hall/engineering_engine/topology/engine_manifest.sha256
node guild_hall/engineering_engine/tools/emit_manifest.mjs --verify guild_hall/engineering_engine/topology/engine_manifest.sha256
```

`P` manifest 행은 **Git 이 저장할 byte** 를 hash 한다. checkout 에 우연히 들어간 줄바꿈이 아니다. text 파일은 clean filter 와 같은 규칙(CRLF→LF)으로 정규화하고, 그 결과가 `git hash-object` 의 답과 일치하는지 매 emit 마다 대조한다. 어긋나면 emit 을 **거부한다** — 저장소가 재현하지 못할 manifest 를 내는 것이 실패보다 나쁘다.

`D` `tests/manifest_blob_integrity.mjs` 가 세 가지를 따로 확인한다: 파일이 최신 emit 과 같은가, 정규화가 Git 의 clean filter 와 같은가, 각 행이 **index 에 staged 된 blob byte** 의 sha256 과 같은가. 통합검사에 들어 있으므로 manifest 가 commit 될 내용과 어긋나면 초록불이 나오지 않는다.

`O` 이 시험은 Phase 2 종료 시점의 실제 결함을 재현한다. commit 된 manifest 가 네 파일에서 commit 된 내용과 달랐고, 통합검사가 manifest 를 **아무도 검증하지 않았기 때문에** 그대로 통과했다.

`P` kernel 은 Phase 1-0 동결 synthetic oracle 의 판정을 그대로 재현한다. 그 oracle 은 독립검증을 거쳤으므로 구현과 채점 기준의 저자가 분리된다.

`O` **초록불 자체가 충분하지 않을 수 있다.** 독립 검토가 지적한 다섯 계약 실패는 전부 "검사는 있었는데 약한 형태로 있었다"였고, 다섯 다 통과 상태에서 발견됐다. 지금 고정한 형태는 아래와 같으며 각각 positive control 과 공격 케이스를 함께 가진다.

| 항목 | 약했던 형태 | 지금 요구하는 형태 |
|---|---|---|
| receipt map | key 가 있으면 관측으로 읽음 | 실행이 선언한 **정확한 key 집합**과 일치, 영수증마다 자기 edge·run 이름 확인 |
| capsule 격리 | `graph.nodes` 선택적 | node 집합 **필수**, 모든 traversed·returned ref 가 binding 일치 |
| P8 gate | 모양과 `passed: true` 신뢰 | record 마다 불변 provenance **재계산**, 네 boundary **재실행** |
| Context 응답 | response id·binding·generation 만 대조 | 요청·영수증·source·artifact·hash·principal·시각까지 **내용으로** 결속 |
| O4 두 source | conflict 기록 존재 | 정확한 두 권위 쌍·다른 revision·실제 불일치·양쪽 applicability·baseline governing |

`O` **그 다음 독립검토가 같은 형태의 결함 네 개를 더 재현했다.** 전부 "검사는 있었는데 검사받는 쪽이 답을 적는 자리에 있었다"였고, 네 항목 모두 공격 케이스와 positive control 을 함께 고정했다.

| 항목 | 약했던 형태 | 지금 요구하는 형태 |
|---|---|---|
| capsule node 대조 (B-03) | 선언되지 않은 node 는 exclusion, key 는 `entity@revision` | 선언되지 않은 node 는 **선택 전체 거부**, 완전한 exact-ref tuple(`content_id` 포함)로 대조, 한 logical node 중복 선언 거부 |
| P5·P7·P8 등록 (B-06) | `kind: 'registered_human'` · `registered: true` 를 그대로 신뢰 | content-addressed **등록 증거**로 확인, project·authority family·시각 범위 일치, 호출자의 자기 주장은 거부 |
| P5 orchestration authority (B-07) | `authority_ref` 가 비어 있지 않고 세 기록에서 같기만 하면 통과 | 같은 등록 증거·family·scope 에서 **해소되어야** 통과, candidate 성격·generation 0·두 영수증 linkage 는 그대로 |
| 두 source 인용 (B-08) | `source_revision_ref` bare string 허용, 시간값 미검사 | **정확한 typed revision ref** 와 양쪽 canonical instant(`known_at >= valid_at`) 요구, 두 겹 guard 모두에서 |

`O` 다음 독립검토가 35개 공격을 재생해 33개는 막혔고 **통합 지점에서 세 개가 남았다.** 세 개 모두 "각 guard 는 옳은데 그 사이에 틈이 있었다" 였다.

| 항목 | 약했던 형태 | 지금 요구하는 형태 |
|---|---|---|
| edge endpoint 해소 (B-03 통합) | traversal 이 닿을 때만 대조 → 위조된 `from_ref` 는 조용히 skip, seed edge 하나면 **성공한 빈 capsule** | 공급된 **모든 edge 의 양 endpoint** 를 walk 전에 node 집합에 해소, 불일치·미선언은 projection 거부 |
| disposition 확인자 (B-06/P8) | `confirmed_by_registered_human` · kind · id 세 필드를 그대로 신뢰 | gate 가 준 **같은 registry·binding·시각**으로 확인, 시각은 provenance 가 아니라 record 본문의 `confirmed_at` |
| 파생 topology (blocker 3) | digest 대조뿐이고 그 digest 가 문서의 1/37 만 덮음 | digest 는 문서 전체를, 통합검사는 **byte 동일성**을 확인 |

`P` **`D-P10-08` 은 이것으로 닫히지 않는다.** kernel 은 live registry 를 조회하지 않고 공급된 증거의 자기정합성과 범위만 검증한다. 누가 등록될 수 있는지는 여전히 Owner 결정이며, 닫힌 것은 "그렇다고 적기만 하면 통과하던" 상태다.

`O` **나머지 다섯 lane 의 fixture 는 구현과 같은 저자가 썼다.** 초록불이 substrate 의 초록불과 같은 무게가 아니다. 변이 lock 이 가드가 실제로 작동하는지는 확인하지만, 규칙 자체가 구현과 fixture 에서 똑같이 틀린 경우는 잡지 못한다. 의미론적 독립검증은 **미완 의무**다.

## topology — 코드에서 파생한다

```
node guild_hall/engineering_engine/tools/emit_topology.mjs --out guild_hall/engineering_engine/topology/engine_topology.json
```

module edge 는 `kernel/`, `assembly/`, `subjects/` 아래 `.mjs`의 **실제 `import` 문을 파싱**해서 얻는다. 경계는 lane 1D 의 `OPERATIONS` 표에서, 나머지 어휘는 각자를 소유한 모듈에서 읽는다. 손으로 적는 것은 lane↔field group 대응 하나뿐이다.

`D` 통합검사가 commit 된 `topology/engine_topology.json` 을 새 emit 과 **byte 단위로** 대조하므로, 낡은 topology 는 실패로 드러난다. 그림은 자기가 묘사하는 코드와 어긋날 수 있지만 이건 어긋날 수 없다.

`O` **이전 판은 digest 만 대조했고, 그 digest 는 문서의 1/37 만 덮고 있었다.** `JSON.stringify(topology, Object.keys(topology).sort())` 의 두 번째 인자는 key 정렬이 아니라 **key allowlist** 이며 모든 깊이에 적용된다. 최상위 key 이름과 겹치지 않는 속성은 전부 사라져 module 항목과 edge 항목이 각각 `{}` 로 직렬화됐고, 38811 byte 문서에서 1060 byte 만 해시됐다. module 이름·import edge·export 목록·line_count 이 전부 digest 밖이었다.

`O` 그래서 commit 된 topology 의 `context_receipt.line_count` 가 소스와 어긋난 채 `topology_matches_code` 가 통과했다. 실제로 바뀐 유일한 필드가 digest 밖에 있었기 때문이다. **주장보다 좁은 초록불은 없느니만 못하다** — 읽는 사람이 행동의 근거로 삼는 것은 주장 쪽이다.

`D` 정정 두 겹: emitter 의 digest 는 재귀 key 정렬 직렬화로 문서 전체를 덮고, 통합검사는 digest 가 아니라 **emit 된 bytes 자체**를 commit 된 파일과 대조한다. 두 번째 겹은 첫 번째가 옳다는 것에 의존하지 않는다. `tests/manifest_blob_integrity.mjs` 가 같은 byte 동일성과 digest 의 실제 적용 범위(중첩 `line_count`·module 이름 변경이 digest 를 움직이는지)를 각각 확인한다.

## 실제 실행 관측

```
node guild_hall/engineering_engine/tools/observe_engine_run.mjs --oracle <oracle>
```

검증 표면을 load observation 훅 아래에서 돌려 **표면별 하트비트**와 **간선별 통과 영수증**을 만든다. 선언(소스 파싱)과 관측(실제 통과)을 대조해 `exercised` · `declared_not_exercised` · `observed_not_declared` 로 분류한다.

`D` `observed_not_declared` 가 하나라도 있으면 통합검사가 실패한다 — 정적 파싱이 못 찾은 연결을 실행이 지났다면 "코드와 1:1" 주장이 거짓이다.

`P` 관측 결과는 `guild_hall/state/engineering_engine/runtime/` 에 쓰고 추적하지 않는다. 한 호스트의 한 시점 측정이므로 commit 하면 주장으로 바뀐다.

`O` `module_load_observation` 은 간선이 **통과됐음**을 증명하고 데이터가 처리됐음을 증명하지 않는다. 이름이 그 한계를 말한다. 상세는 `contracts/runtime_observation_v0.md`.

## 출력을 읽는 쪽으로 (Board 등)

소비자는 **경로가 아니라 pointer** 를 하드코딩한다. 엔진을 돌린 쪽이 worktree 였을 수 있으므로 경로를 물면 우연을 무는 것이다.

```
guild_hall/state/engineering_engine/output.pointer.json   ← 소비자가 하드코딩 (저장소 상대)
  → { schema_version, output_root }                       ← host-local 실제 위치
  → <output_root>/engine_outputs.index.json               ← 소비자가 먼저 읽는 index
```

`D` **부재는 값이다.** index 가 `present: false` + 구별되는 `absent_reason` 을 준다. 관측은 host-local 이라 fresh checkout 에 없는 것이 정상이며, 파일 읽기 실패로 나타나지 않는다.

`D` 깨진 pointer 는 추측하지 않고 `root: null` + 사유를 준다. 추측한 디렉터리를 읽으면 다른 실행의 증거를 이 실행의 것으로 띄운다.

`D` artifact 4종이 각각 **무엇을 증명하고 무엇을 증명하지 않는지**를 들고 다닌다. 추적되는 것은 `engine_topology` 하나뿐이고 나머지 셋은 한 호스트의 한 시점 측정이다.

`O` 신선도 윈도와 표시 색은 정하지 않는다. 소비자 판단이다. 상세는 `contracts/engine_output_read_contract_v0.md`.

## local state

engine 의 local runtime state 는 다른 owner 와 같은 규칙을 따라 `guild_hall/state/engineering_engine/` 아래에서만 materialize 하고 Git 으로 추적하지 않는다. 새 state surface 이므로 `guild_hall/backup_controller/README.md` 의 backup/restore 분류와 synthetic restore gate 를 적용한다. `topology/` 는 state 가 아니라 코드에서 재생 가능한 파생 산출물이므로 추적한다.

## Owner 결정 상태

닫힘: `D-P10-01` (snapshot claim_ceiling = evidence 축) · `D-P10-02` (engine 정본 폴더) · `D-P10-03` (**엔진 내부 단일 직렬 발급 경계, 불투명 UUID, 충돌 hard reject**) · `D-P10-04` (authority family key) · `D-P10-05` (evidence ceiling 7값) · `D-P10-07` (**시각 소수 3자리 확정**)

| 미결 ID | 내용 | 막는 것 |
|---|---|---|
| `D-P10-06` | Finding disposition 확인 권한자 등록 절차 | live disposition |
| `D-P10-08` | P5/P8 승인자 등록 절차 | live P5 |

lane 별 미결 항목은 각 lane 계약문과 `kernel/contract_config.mjs` 의 `OPEN_LANE_QUESTIONS` 에 있다. Phase 1 을 막는 것은 없다.

`O` **`P7` 은 TaskDriver 다.** 이전 판이 `UNKNOWN_pending_engine_owner` 로 적은 것은 읽기 오류였고 Owner 미결이 아니었다. `engine_plan_v1_2.md` §1.4, `engine_plan_v1_2_1.md` §6.2, `phase_1_0_work_lanes.yaml` 의 `p7_taskdriver` gate 가 모두 같은 정의를 준다. `pipeline.mjs` 가 `why`·`why-now`·`authority`·`idempotency` 내부 gate 뒤의 TaskDriver 단계로 구현하며, **활성화하지 않는다**(`activation_state: not_activated`, `driver_activated: false`, `erp_delta: 0`). 상세는 `contracts/lane_1a_snapshot_and_pipeline_v0.md` §8.
