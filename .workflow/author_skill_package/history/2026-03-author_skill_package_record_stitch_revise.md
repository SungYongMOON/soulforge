# author_skill_package record_stitch revise case

## Scenario

- Target package: `record_stitch`
- Revise goal: make the canon usage hint explicit for package/handoff drafting after bounded review, while cleaning a codex bridge boundary drift in `openai.yaml`

## Why This Is A Good Revise Case

- The package already sits in active canon, so the change validates revise flow rather than greenfield authoring.
- The revision touches both sides that `author_skill_package` should be able to handle:
  - canon hint refinement in `skill.yaml`
  - codex bridge boundary cleanup in `codex/agents/openai.yaml`
- The change stays bounded to the package and does not require workflow, party, or runtime binding edits.

## Curated Change Summary

- Added a narrow `use_when` hint for package draft / install handoff drafting after review has already bounded the request.
- Added a matching execution note that keeps `record_stitch` in intermediate-draft territory.
- Removed `policy.allow_implicit_invocation` from `codex/agents/openai.yaml` so the bridge stays UI-only under current boundary rules.

## Public-Safe Outcome

- The revise case tightened canon wording and bridge ownership without changing runtime bindings.
- This sample shows that `author_skill_package` can handle a realistic existing-package revision, not only new package drafts.
