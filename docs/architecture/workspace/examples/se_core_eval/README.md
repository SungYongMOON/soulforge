# SE Core external shadow evaluation example

## Purpose

This folder defines the public-safe input shapes for comparing the deterministic
Engineering Engine with a manually operated Gemini Notebook / NotebookLM shadow
lane. It does **not** connect NotebookLM to the Engine. Both lanes receive the
same frozen source membership and the same fully synthetic case pack, and a
separate evaluator compares their normalized results.

```text
approved public SE source bytes + fully synthetic case pack
                 |                         |
                 v                         v
      deterministic Engine       standalone source-grounded Notebook
                 |                         |
        7 frozen references       2 modes x 7 cases x 3 runs
                 \_________________________/
                              |
                    manual reviewed sidecars
                              |
                  deterministic comparison only
```

No actual project contract, requirement, artifact, account identifier, answer
body, credential, or runtime path belongs in these tracked examples.

## Files

- `SE_CORE_EVAL_V1.corpus_manifest.template.json` records source eligibility and
  materialization separately. A public URL alone is not upload permission.
- `common_se_projection.synthetic.json` is a payload-free synthetic projection
  used to verify the Engine adapter. It is not a real source crosswalk and does
  not prove that the common-SE corpus has been projected.

The executable comparison contract and its synthetic tests live under
`guild_hall/engineering_engine/`. Raw source files, derived text, Notebook
exports, sealed gold, and real run packets remain in `_workspaces/**` or another
Owner-approved private worksite. `_workmeta/**` may hold only opaque refs,
hashes, membership revisions, status, and review receipts.

## Initial source cohort

The first same-corpus candidate is intentionally narrower than "everything we
can find". Exact bytes and SHA-256 values must be materialized and reviewed
before any row becomes ready.

| Candidate | Official revision | Initial disposition |
|---|---|---|
| [NASA Systems Engineering Handbook](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20170001761.pdf) | NASA/SP-2016-6105 Rev 2, 2017-02-17 | public-use candidate; hash still required |
| [NASA Systems Modeling Handbook](https://standards.nasa.gov/system/files/tmp/2025-03-12-NASA-HDBK-1009A.pdf) | NASA-HDBK-1009A Rev A, 2025-03-12 | public-release candidate; hash still required |
| [DoD Systems Engineering Guidebook](https://www.cto.mil/wp-content/uploads/2023/06/SE-Guidebook-2022.pdf) | December 2021 guide, officially listed 2022-02-11 | Distribution A candidate; hash still required |
| [Engineering of Defense Systems Guidebook](https://www.cto.mil/wp-content/uploads/2024/10/Eng-Def-Sys-Change2-7October2024-v3.pdf) | February 2022, Change 2 October 2024 | optional Distribution A candidate; hash still required |

The existing DAPA test-and-evaluation guidebook remains `HOLD` for this external
comparison even if a local copy exists: public reachability is not enough to
prove external AI reuse permission. ISO standards and guidance remain
metadata/link-only unless a separate permission explicitly covers AI use.

## Execution order

1. Materialize only approved source bytes under the knowledge workspace and
   compute their exact SHA-256 values.
2. Freeze the source membership, seven provider-visible prompts, scoring rubric,
   synthetic case pack, Engine canonical inputs, and evaluator-only gold.
3. Run the deterministic Engine lane and independently verify its seven frozen
   reference results.
4. Confirm Notebook authentication, a dedicated unshared notebook, exact source
   membership, and standalone selected-source-grounded mode. Web, agentic,
   cross-app, and cross-notebook context stay off.
5. Run `notebook_only` and `hybrid_with_soulforge_state_pack` three times per
   case in fresh chats. Hybrid may add exactly one pinned derived-state pack.
6. A person saves/exports each answer, checks citations, and writes only the
   normalized review sidecar consumed by the comparison tool.
7. The deterministic scorer reports exact fractions, safety failures, 3-of-3
   repeatability, and `PASS` or `FAIL`. Readiness `HOLD` is an operating decision
   outside this scorer. It does not make an adoption
   decision or promote a Notebook result into accepted context or a task.

Notebook login, notebook creation, source upload, query execution, and answer
export are deliberately outside the public validator. Until those observations
exist, the external lane is prepared but not executed.
