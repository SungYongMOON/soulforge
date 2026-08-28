# Appendix A — E01 Source/RAG/Derivation Strengthening Contract v0

Status: local implementation candidate. The contract remains the authority boundary; the
package-local source/RAG/Profile/Typed Facts/observation/guidance/read-MCP seams now implement
its public-synthetic, zero-write portion. No root package, Core, global topology, release,
Watchtower, or production route changed.
Owner authorization: explicit owner-authorized strengthening leaf, 2026-08-25 KST session.
Inputs allowed: public tracked repo files and official-public web sources only.
Excluded: `.env`, auth, sessions, `_workmeta`, `_workspaces`, `private-state`, LIG/customer/
project material, paid/controlled bodies, raw transcripts, verifier/golden outputs.

## 0. Purpose and claim ceiling

Raise E01 from a 3-source proof to the same source-bound development depth as the SE engine
(`manual/03_how_items_were_derived.md` S0-S5 pipeline), without widening into source adoption,
product quality acceptance, or external execution. The local implementation binds the boundary;
it does not replace the later source-reader/critic/Owner gates.

Claim ceiling: `observed` / `source_supported` at most throughout. Nothing here adopts
sources, approves applicability, promotes canon, or activates any rule.

## 1. Registry facts are routing metadata, not truth

`.registry/knowledge/defense_quality_management_standards/knowledge.yaml` records:
56 official-public declared sources, 56 validated private source-text indexes, 4,957
reported private indexed chunks, 3 HWP body blockers + 1 HWP-like blocker, 17 acquisition
targets. These numbers are routing metadata only:

- They prove that a prepared corpus exists in an owner-held workspace, not that any specific
  source body was read, is current, or supports a claim in this repo's tracked files.
- Chunk counts, index counts, and source counts are never sufficiency, coverage, or
  compliance evidence (the packet §5 already states this; this contract binds it to the
  registry facts explicitly).
- Any use of the corpus by a later leaf requires re-resolution of status/revision at binding
  time per the packet's revision policy; the registry facts do not substitute for it.

## 2. Proof subset: exactly three sources

The original three packet-bound proof-subset sources remain the proof subset — the only sources with exact
metadata revision refs, body revision refs, official URLs, chosen locators, governing owners,
and applicability rows already bound in `quality_readiness_source_packet_v0.md` §1:

| source_ref | document | proof-subset role |
| --- | --- | --- |
| `S1-MIL-STD-1916` | MIL-STD-1916 (+ Notice 2) | prevention-based quality system + effectiveness evidence |
| `S2-FAR-46` | FAR Part 46 (FAC 2026-01) | U.S. Federal contract quality administration |
| `S3-NASA-STD-8739.6B` | NASA-STD-8739.6B | mission-hardware electronics workmanship |

All other knowledge — including anything reachable through the 56-source corpus — is candidate
input until it passes through the same S0-S5 pipeline and gates below. No row of this contract
raises the packet's existing gaps (`G-01`…`G-07`) or closes its Owner decisions (`OD-01`…`OD-06`).

## 3. Source-family inventory policy

The registry's public_source_families list (DAPA/Korean law/go.kr, DTaQ/DQMS/AQAP/GQA,
KDS/DQMS legacy, NATO AQAP metadata/national PDFs, FAR/DFARS/DoD quality & counterfeit,
NASA workmanship/ESD, DLA ASSIST MIL-STD/MIL-HDBK, KOLAS commentary, UK MOD/Bundeswehr
supplier context) is used as an inventory frame, not as content. For every family a later
leaf records, before any rule candidate can cite it:

1. family key and one-line public-safe scope sentence;
2. representative official-public hosts (host class, not deep URLs);
3. access class per member: `official_public`, `official_public_hwp_blocked`,
   `paid_or_controlled`, `internal`, `unknown`;
4. whether any member overlaps the proof subset (overlap must be reconciled, not merged).

The candidate inventory remains in the Leaf B1 contract records cited in Section 11. The local
`source/quality_readiness_source_derivation.mjs` projection now emits all 56 routing records
deterministically, including authority class, access, revision/status state, applicability
ceiling, claim ceiling, and direct-source/HOLD state. It does not add a body-level claim.

## 4. Exact revision/access/status policy

Extends the packet's revision policy unchanged; adds the access dimension:

- Pin exact metadata ref and exact body ref separately at binding time; floating text
  (`latest`, `current`, branch names, ranges) is refused wherever a revision is required.
- Status receipt required at binding time from the official publisher surface. A cached
  status line in a registry, index, or RAG chunk is not a status receipt.
- Access class recorded per source; `paid_or_controlled`, `internal`, and HWP/HWP-like bodies
  stay `HOLD` regardless of how retrievable they appear in private indexes.
- If status and body cannot both be re-resolved, affected rules are `UNKNOWN/HOLD`; cached
  prose is never fallback authority.

## 5. RAG/index reuse plan (no chunk copying)

RAG is retrieval and derivation support only. It is never verdict authority. The private
source-text indexes may be used by a later leaf to:

1. locate which corpus members plausibly contain a needed clause family (navigation);
2. propose candidate locators for human/source-direct verification against the official
   publisher surface;
3. support gap triage across families (what exists vs what is blocked);

and must not be used to:

- copy chunks, sentences, OCR bodies, or answer payloads into any tracked file;
- serve as final full-text authority for paid or controlled standards;
- assert HWP body claims before true HWPX export;
- replace binding-time status/revision re-resolution (Section 4);
- emit, weight, or justify any evaluator verdict state (`satisfied`/`gap_*`/`not_applicable`).

Every locator proposed via RAG must be confirmed by direct reading of the official-public
body before it enters any rule-candidate row. RAG hits enter tracked documents only as
"candidate locator pending confirmation", never as established citations.

## 6. S0-S5 derivation stages for E01

Adopting the SE engine pipeline shape (`manual/03_how_items_were_derived.md` §3.0) with E01
boundaries. Raw bodies and absolute paths stay out of tracked files at every stage; work
files live in owner-approved private surfaces with compact receipts only.

- S0 정본 확보: download official-public bodies → intake receipts (hashes) in the approved
  private worksite; classify access class per Section 4. HWP-like, paid, controlled, and
  internal sources stay HOLD at intake (no parsing beyond metadata).
- S1 사실 추출: one reader per source; extract "which stage requires which activity/artifact/
  acceptance basis" per clause/table/page locator; short paraphrase only, no long quotes.
- S2 합성/대조: map reader output onto E01 rule-candidate shape; reconcile overlap with the
  proof subset; grade claims without promotion (one source = partially_supported ceiling).
- S3 비판 검토: independent critic plan (Section 7).
- S4 스펙 반영: coder writes bounded rule-candidate rows (IDs, locators, modality, artifact
  token or null, authority families, applicability conditions) into the packet-family format;
  no vocabulary issuance, no token minting outside the vocabulary owner.
- S5 검증: drift checks, focused validation, spot-check citations against re-read bodies,
  deterministic counts; results recorded with observed command receipts.

A stage whose inputs include blocked-class sources records those items in the blocked-source
register instead of processing them.

## 7. Independent critic plan

Each derivation batch gets an independent critic pass, mirroring the SE engine's S3:

1. Spot-check sample: at least 10% of new citation rows, minimum 10 rows, re-read against the
   official-public body (not the RAG chunk) — locator, modality, and paraphrase fidelity.
2. Risk list: applicability overreach, modality drift (should→shall promotion), near-synonym
   artifact mapping, conflict collapsing, count-based sufficiency claims.
3. Corrections feed S2/S4 again; unresolvable findings stay open in the derivation record's
   미결 section rather than being silently dropped.
4. Critic independence: fresh context, no shared working memory with the reader/coder passes;
   receives sources + candidate rows only, not intended conclusions.

## 8. Blocked-source register

Carried forward unchanged from the packet and registry, extended with the register shape.
All rows remain HOLD; none may be processed past metadata:

| blocked class | instances | boundary | reopen condition |
| --- | --- | --- | --- |
| HWP body | 3 DTaQ sources | no body-level claim before true HWPX export | owner-approved Hancom/HWP-capable HWPX export route |
| HWP-like | 1 source | same as HWP | same |
| paid/controlled | ISO, SAE, IPC, ANSI/ESD, AS9100-family etc. (17 acquisition targets) | no operative acceptance/defect criteria expansion from references alone | licensed purchase or authorized channel (OD-05 route) |
| AQAP-2105 | G-01-AQAP | no current revision/body/applicability claim | OD-05 authorized channel decision |
| internal/LIG/customer | LIG supplier grade A scorecard, customer/project material | excluded from this repo entirely; no overlay content in tracked files | separate owner-approved plane, never public |

LIG/customer/project overlays are structurally separated from public common quality
knowledge: common knowledge derives only from official-public sources; overlays would live in
a distinct private plane with their own acceptance gates and never merge into the public
rule base. The SE engine's prime_contract/overlay pattern is a structural reference for
separation, not permission to import its content here.

## 9. Rule-candidate acceptance gate

Every new executable rule remains blocked pending both of:

1. exact source locator: clause-level locator confirmed by direct body reading, exact
   metadata+body revision refs, current status receipt, resolved access class;
2. Owner acceptance: sorted exact rule/stage/owner-acceptance binding naming the rule
   explicitly (the existing `accepted_rule_bindings` mechanism). Bulk adoption by source
   count is invalid (packet OD-03).

Additionally each candidate row must carry: source modality preserved per branch, artifact
token or justified null, required typed authority families, applicability components and
their UNKNOWN/HOLD conditions, claim ceiling `source_supported` at most. A candidate missing
any element stays data, never executable.

## 10. Current local implementation and next source-reader handoff

The local package now has the following bounded surfaces:

1. deterministic 56-row source-direct corpus record with the existing proof subset and explicit
   `observed`/`HOLD` treatment for every unconfirmed row;
2. advisory locator retrieval that refuses missing, mixed, stale, forged, malformed, or
   unauthorized packets and cannot drive a verdict or rule;
3. derived Profile evaluation only through a Core-assembled trace and a pinned Typed Facts
   envelope; and
4. public-synthetic observation, guidance, read-MCP, and runner surfaces with zero external
   effects.

The next *source-reader* leaf still needs an owner-approved target list, direct official status
and body re-resolution, independent critic review, and exact Owner rule acceptance. It must use
the `HOLD` rows as stop conditions rather than treating a catalog, RAG locator, or private index
as authority. Shared registration remains a separate owner-gated request at
`../contracts/quality_readiness_integration_request_v0.md`.

## 11. Leaf B1 candidate queue

The 56-row sanitized public-source inventory is now classified by
`contracts/quality_readiness_source_family_matrix_candidate_v1.json`. Its first bounded
source-reading queue is documented in
`contracts/quality_readiness_derivation_batch_qb1_candidate_v1.md`. Both remain candidate
inputs: they adopt no source, accept no rule, close no packet gap, and authorize no
implementation. The LIG sustainability-report row is explicitly excluded from common-engine
truth and remains an overlay/vendor-context concern only.
