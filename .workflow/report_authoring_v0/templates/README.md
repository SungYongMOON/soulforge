# Report-authoring templates

The executable shapes are owned by `../contracts/` and the fixed runner. These
templates are construction aids only; they do not override a JSON Schema or the
manual cross-field validators.

- `report_authoring_request.template.json` mirrors the draft-only `final_polish`
  envelope. `report_authoring_request.full_authoring.template.json` mirrors the
  source-material route.
  Replace every `replace-*` value, zero hash, and placeholder size with a
  server/controller-issued opaque ref and the exact payload metadata before
  calling `prepare`.
- `boundary_review_note.template.md` is a human review note and is not a runner
  input.
- The exact finalize skeleton is emitted by `prepare` so it carries the bundle
  digest and the current runtime contract. Do not keep or hand-edit a second
  static finalize shape here.

Source/draft bodies and completed packet files belong in `_workspaces` or an
owner-approved worksite. Tracked templates never contain a real report body,
private path, credential, or approval token.
