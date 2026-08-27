# Configuration Change Impact Domain Contract v0

## Decision boundary

The engine evaluates one explicitly supplied controlled-change fact bundle. It reports whether
the fixed impact vocabulary and its supplied path-bound evidence support a
`source_supported` candidate assessment. It never approves, implements, releases, mutates, or
closes a project change.

## Input and identity contract

`soulforge.configuration_change_impact.input.v0` accepts ordinary JSON-like request data only.
Its `change` is closed and must name all of the following:

- `change_id`, `change_class`, and `change_request_ref`;
- `pre_change_baseline_ref` and `pre_change_revision_ref`; and
- `target_post_change_revision_ref`, which must differ from the pre-change revision.

The request has sorted seed-item refs, an explicit finite directed graph, and exactly one
canonically ordered row for each fixed impact kind: `requirements`, `bom`, `drawings`,
`software`, `interfaces`, `tests`, `documents`, `baselines`, and `closure_evidence`.

Every affected/pending/verified row uses a path-bound evidence record:

```text
evidence_ref + change_id + change_identity_digest + item_ref + item_path_refs + relationship_path_refs
```

The evaluator compares each record to the computed graph path. It requires the same full
change identity digest (including the pre-change baseline/revision and target revision), affected
item, ordered item path, and ordered relationship path; opaque unrelated refs cannot make a
result review-ready. A closed request additionally needs closure evidence bound to the reachable
`closure_evidence` item path.

JSON Schema closes field sets, fixed impact order, file-reference exclusion, cardinality, and
state/evidence combinations where JSON Schema can express them. Runtime admission additionally
rejects getters, proxies, hidden fields, aliases, lexical-order violations, dangling graph
relations, and path mismatches before evaluating.

## Existing Core Project Binding / Typed Facts seam

The package uses the existing Core seam without changing Core:

```text
createProjectBindingAdapter(domain, project_binding_ref)
  -> adaptEvidence(source_snapshot_refs, cutoffs)
  -> Core Typed Project Facts
  -> Configuration Change Impact adapter evaluate(...)
```

`adaptConfigurationChangeImpactProjectEvidence` is the package entry point for that seam. It
descriptor-snapshots its input before Core sees it, requires one public-safe CCI fact bundle in
the Core observations, then binds and verifies all of these identities:

- exact project-binding schema, domain, project ID, source-manifest ref, and revision pin;
- exact project Profile provenance, source refs, base ruleset pin, empty-operation digest, and
  order, matching the Core Effective Rule Set; and
- exact controlled-change identity, source-snapshot digest, compilation scope, and a
  deterministic package identity digest.

The generic Core facts digest alone does not claim to bind a Profile or change identity; the
package identity digest plus recomputed receipt source-snapshot digest and cross-checks provide
that domain-local binding. The evaluator also verifies the exact Core Effective Rule Set envelope,
assembly digest, rule count, compilation-trace schema/revision/digests/profile traces, and bound
compilation scope. Raw request fallback is not accepted through the adapter evaluator.

## States, paths, and outputs

| state | required meaning | output effect |
| --- | --- | --- |
| `affected_verified` | analysis, every affected item, and matching propagation + verification evidence | resolved propagation |
| `affected_pending` | analysis, affected items, and matching propagation evidence; verification remains absent | `hold` |
| `conflict` | explicit analysis, affected items, and retained path-bound conflicting evidence | `hold` |
| `not_affected` | explicit analysis and no affected-item evidence | resolved non-impact |
| `unknown` | no resolved analysis or evidence | `hold` |

The graph result retains both `item_path_refs` and `relationship_path_refs`. Its
`reachable_tree_edge_count` means the number of edges in the deterministic discovered
reachability tree, not the number of graph edges inspected. Alternate routes choose the stable
shortest path.

The evaluator returns deeply frozen `{ assessment, domain_result, receipt }`. The receipt retains
the safe typed-facts identity and source-snapshot digests, then declares zero file reads/writes,
network/model calls, approval actions, baseline mutations, and task creations. Digests are
deterministic for the same Core-bound typed facts and fixed rule pack.

## Error model

`CONFIGURATION_CHANGE_IMPACT_ERROR_CODES` in the rules module is the public package error
vocabulary. Callers branch on code, not message text.

| codes | meaning |
| --- | --- |
| `CCI_INPUT_REFUSED`, `CCI_CHANGE_IDENTITY_REFUSED` | request, reference, revision identity, or ordinary-data admission is invalid |
| `CCI_IMPACT_COVERAGE_REFUSED`, `CCI_IMPACT_RECORD_REFUSED`, `CCI_APPROVAL_REFUSED`, `CCI_CLOSURE_REFUSED`, `CCI_EVIDENCE_BINDING_REFUSED` | closed impact, decision, closure, or path-evidence rules are violated |
| `CCI_PROPAGATION_GRAPH_REFUSED`, `CCI_PROPAGATION_NODE_REFUSED`, `CCI_PROPAGATION_EDGE_REFUSED`, `CCI_PROPAGATION_SEED_REFUSED`, `CCI_PROPAGATION_REFUSED`, `CCI_PROPAGATION_CONFLICT` | graph or computed reachability is malformed or contradicted |
| `CCI_RULESET_REFUSED` | the Effective Rule Set envelope, assembly digest, compilation trace, Profile trace, or bound scope does not exactly match the package rules |
| `CCI_PROFILE_BINDINGS_INVALID`, `CCI_PROFILE_DOMAIN_MISMATCH`, `CCI_PROFILE_PROVENANCE_INVALID`, `CCI_PROFILE_OPERATION_UNSUPPORTED`, `CCI_EVALUATOR_REQUIRED` | compiler/evaluator Profile admission is invalid, mismatched, unpinned, unsupported, or uses the compiler as an evaluator |
| `CCI_TYPED_FACTS_REFUSED`, `CCI_PROJECT_BINDING_MISMATCH`, `CCI_PROFILE_BINDING_MISMATCH` | Core Typed Facts, project binding, or Profile/change binding does not close across the seam |
| `CCI_MANIFEST_INPUT_REFUSED` | manifest factory input contains a wrapper, hidden field, accessor, proxy, or unsupported shape |

## Boundary

The package reads neither a change request nor an affected item. It does not accept RAG, search,
or model output as evaluator authority. Project-specific payloads, organization/private Profiles,
and runtime artifacts remain outside this public package.
