# 04. Evaluation and replay

The compiler emits the fixed base ruleset and preserves only fully pinned empty Core Profile
bindings in its provenance. It rejects non-empty Profile operations, so no profile-specific
obligation is invented. The evaluator accepts only the package's Core-derived Typed Facts envelope;
it verifies the exact Effective Rule Set envelope/trace and receipt source-snapshot digest before
evaluation, and does not fall back to a raw request object.

For the same input and fixed source packet/ruleset, output ordering and input/domain-result/
assessment digests are deterministic. The public-synthetic runner has no file, network, model,
approval, baseline-mutation, or task-creation effect. It emits one JSON result to stdout.

The graph module is a deep domain-local module behind the evaluator seam. Its input is only the
finite graph, sorted seed references, and fixed category vocabulary; it returns transitive
reachability plus stable item/relationship paths and a `reachable_tree_edge_count`. Callers do
not manage traversal state or update anything outside the result.

Run the focused test and runner commands listed in the package README. The tests include a
fully propagated closed case, an unknown hold, missing/duplicate category rejection, unsafe
reference rejection, accessor/proxy refusal, malformed/dangling/duplicate graph rejection,
graph-completeness holds, revision/profile/project/evidence binding rejection, premature-closure
rejection, Core seam conformance, and two-run zero-write replay.
