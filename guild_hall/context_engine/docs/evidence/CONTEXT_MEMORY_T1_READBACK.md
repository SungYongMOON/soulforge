# Context memory T1: exact source readback

> 보존 기록: 이 문서는 후보 브랜치 `codex/context-memory-build`(로컬 보존 tag `codex/cleanup/20260911/context-manager`, `c6c5870c`) 제작 당시 `ui-workspace/apps/dev-erp/docs/`에 쓴 증거다. 2026-09-12 main 통합에서는 dev-ERP 연결(shim·행보관 `--accepted-context`)을 CTX-S0-G2로 보류했고, 같은 시험은 `guild_hall/context_engine/src/app.mjs` CLI로 실행한다. 본문의 경로·명령은 당시 기준이다.

Scope: synthetic read-only implementation, pending manager fresh review and
integration. No operational source, writer, deployment, final acceptance or
real-data canary was exercised.

## Connected path

`createAcceptedContextReader.query` performs its existing fresh ACL, current
producer revision set, pointer and accepted manifest/receipt checks, calls
`createAcceptedContextQuery`, then optionally reads explicitly bound sources.
Every source binding must exactly match the authorized actor, purpose, grant
revision, project, accepted generation, source revision, span, event, unit,
branch, scope, lane and member valid/known timestamps. Duplicate span bindings
are rejected, including alias collisions. Labels never resolve an identity.
The complete returned UTF-8 body hash must equal the exact source revision
content ID, and the bound paragraph must exist and be nonempty. Paragraphs are
separated by blank lines; this bounded adapter supports paragraph locators only.

`sourceReadback` is absent/off by default. Opt-in configuration has exactly
`enabled`, `max_reads` (1–2) and `bindings` (at most 100 rows). The explicitly
provided `providers.readSourceRevision(binding)` returns `{ binding, body }`.
The adapter must honor the exact binding and limit each body to 131072 UTF-8
bytes before loading; the reader also rejects responses exceeding that limit.
There is no discovery or fallback. ACL/current-state observations occur before
each body read and after all awaited reads. Changes suppress the whole result.

The existing metadata query response remains compatible. Enabled readback adds
`source_readback` and its digest, without copying source text. Query `status: ok`
means metadata retrieval succeeded, **not** that originals were confirmed:
consumers must check each source's `status: VERIFIED`. Missing, mismatched,
ambiguous and over-budget sources remain explicitly unverified; an empty page
does not report complete verification. `complete` is page-local, never corpus
coverage. `query_digest` remains the metadata digest; `source_readback_digest`
binds the metadata digest and readback outcome. Provider exceptions are not
echoed. Source read attempts and actual body loading are reported separately.

## Time and existing contracts

Query requests may supply both canonical `valid_at` and `known_at`, with
`valid_at <= known_at` and `as_of == known_at`. Without the pair, existing
single-cutoff behavior and digest remain unchanged. Filtering, query digest and
pagination bind both cutoffs. This filters **current accepted memberships**;
it does not replay historical accepted state or resurrect superseded decisions.

Shared candidate validators already own correction predecessor uniqueness,
cycles, retained lineage, source/event/unit crosswalks and timestamp ordering.
They were not changed. Missing revision identity is rejected; a literal token
such as `latest` is not independently blacklisted by the existing validator.
An alias resolver or semantic task/decision assembler was not introduced.

## Synthetic evidence

T0 fixture bytes, evaluator-owned oracle boundary and all 24 question rows remain
unchanged. T1 adds `t1-source.json`, SHA-256
`459b7737145dd11afcc3f555a0df311c1d5b2f50774d07aec35444faa9e7fd30`.
It provides full seven-paragraph source `S-EXACT`, revision `s-exact-r2`, locator
`paragraph:7`. T0's original body is a one-paragraph excerpt with a paragraph
label; the first T1 run correctly failed actual paragraph resolution. T1 uses
the separate full-body fixture and derives its accepted synthetic ref from
those exact bytes, without altering the historical T0 baseline or its gold.

Example: authorized Q09 `P-A / T-A1 / actor-a / work` selects `S-EXACT` at
`s-exact-r2`, then returns `source_readback.sources[0] =
{ source_span_ref: 'S-EXACT', locator: 'paragraph:7', status: 'VERIFIED' }`.
Q10 returns `SOURCE_UNAVAILABLE`, `complete: false`, no body loaded. Identity,
scope, lane, time or duplicate bindings cause zero source reads. Wrong bytes,
deleted sources and nonexistent paragraph locations never become VERIFIED.

Validation command:

```text
node --test ui-workspace/apps/dev-erp/test/context_memory_t1.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t0.test.mjs ui-workspace/apps/dev-erp/test/accepted_context_query.test.mjs ui-workspace/apps/dev-erp/test/accepted_context_reader.test.mjs
```

Result: exit 0, 56 PASS / 0 FAIL / 0 SKIP (19 T1 + 37 existing). The first
iteration was 51 PASS / 1 FAIL, because T0's paragraph label had no complete
body; that fixture gap was fixed using the additive T1 source above.
`npm.cmd run ui:done:check`: exit 1, renderer-core `tsx` dependency unavailable.
No dependency installation attempted; manager must run integration gate.
`npm.cmd run validate:canon`: exit 1, local `yaml` dependency unavailable.
`npm.cmd run validate:path-policy`: exit 0, 6 PASS / 1 Windows symlink SKIP,
zero path violations. `git diff --check`: exit 0.

Q01/Q05/Q07/Q09/Q11/Q12 and project/ACL/budget baseline probes remain. T1 adds
Q09 actual paragraph readback, Q10 source failure and separate-time mechanism
probes. Historical Q06 semantics, full answers for all 24 questions, typed
conflict/coverage, assembler, A/B/C/D comparison and live canary remain NOT_RUN.

## T2 and manager handoff

Next disconnected point: trusted bindings still come from a synthetic accepted
snapshot adapter. T2 must connect actual candidate acceptance and replay to the
same exact source bindings, including correction and retained history. T3 must
consume the verification outcomes when assembling answers and coverage gaps.
The byte check proves revision/locator correspondence, not interpretation of
the body or human acceptance of a task/decision.

Manager-owned shared delta: note optional readback and separate-cutoff query
in CHANGELOG and applicable AX status; no shared index was edited in this lane.
Fresh independent final review and integration are manager responsibilities.
A fresh bounded Astra/medium subagent performed read-only existing-validator
evidence inspection; this is not independent review of the implementation.
Requested model/reasoning: gpt-6-astra/medium. Observed model, reasoning, tier,
token usage and cost: UNKNOWN. No fallback or external model calls.
