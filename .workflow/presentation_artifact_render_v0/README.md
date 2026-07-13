# Presentation Artifact Render v0

`presentation_artifact_render_v0` is a tool-neutral registered candidate workflow for rendering one approved `presentation_packet` or `storyline` into an editable PPTX with an exact approved template binding.

It is an artifact renderer, not an authoring workflow. It does not draft a storyline, improve wording, summarize content, translate text, add claims, or alter facts, numbers, units, dates, signs, IDs, quotations, tables, comparisons, negation, or verdicts.

## Required Input

- One approved content input with `kind: presentation_packet | storyline`, a stable ref, revision, SHA-256, approval receipt, and explicit `owner_approved | synthetic_fixture` provenance.
- One approved PPTX template binding with mandatory template family, revision, SHA-256, source ref, and approval receipt.
- The workflow revision plus an immutable Git commit or package ref.
- Project, run, idempotency, output, and receipt bindings that keep actual payloads under `_workspaces` and metadata-only receipts under `_workmeta`.

Freeform prompts, unapproved drafts, raw conversation text, missing template identities, or requests that require content rewriting are not valid render inputs.

## Execution Shape

1. Validate the approved content, exact template identity, approval scope, idempotency replay identity, existing-output state, and storage boundaries.
2. Verify the pinned template family, revision, and computed SHA-256 without changing the source template.
3. Render the approved content into editable PPTX objects using only mappings allowed by the approved template revision.
4. Run the executor self-check for structure, template trace, editability, visible-text fidelity, semantic roles and negation, claim-critical values, and rendered layout.
5. Run a fresh-context independent verification, including semantic-role and native-list-text checks, without exposing the executor's builder source.
6. Write a metadata-only receipt with immutable workflow identity, evidence pointers, hashes, sizes, provenance, validation states, blockers, next action, and retryability.

If content overflows, lacks a template mapping, or cannot remain editable, the workflow returns `review_required`. It must not solve layout pressure by abbreviating, paraphrasing, reordering, flattening, or selecting another template.

## Storage Boundary

| Material | Owner surface |
| --- | --- |
| Approved packet/storyline payload | `_workspaces/<project_code>/...` |
| Approved template and reusable template payload | `_workspaces/SE_TEMPLATE_LIBRARY/...` or project-local `_workspaces/<project_code>/...` |
| Editable PPTX output and rendered review assets | `_workspaces/<project_code>/...` |
| Render receipt and verification metadata | `_workmeta/<project_code>/runs/<run_id>/...` |

The render manifest, verification record, and final receipt are metadata-only under `_workmeta`. Rendered review images and all other actual artifacts remain under `_workspaces`. Metadata records must not copy presentation text, template XML, binary payloads, private source bodies, secrets, or runtime absolute paths.

An idempotency key may be reused only when content, template, and output identities match the prior receipt. An existing output without that exact replay evidence is a blocker; the renderer never overwrites it.

## Tool Boundary

The workflow names capabilities such as editable-PPTX rendering, structure validation, fidelity checking, and visual layout verification. Concrete render engines, libraries, adapters, models, and local executable paths resolve through runtime bindings outside this package.

## Current Maturity

- `output_state: registered`
- `validation_level: structure_reviewed_pilot_pending`
- `pilot_executed: no`
- `default_route_safe: no`
- Registration: registered in `.workflow/index.yaml` as a non-default candidate.

The original `team_default_v0` seed deck was rendered and visually inspected while the workflow package was being prepared. The first fresh replay was rejected because a `do_not_claim` semantic role became visually affirmative and literal bullet characters were injected into list text. A replay against the corrected immutable contract and a separate verifier pass are still required before changing `pilot_executed`.
