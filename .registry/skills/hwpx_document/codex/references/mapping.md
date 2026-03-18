# HWPX Document Mapping

## Soulforge mapping

- Canon skill id: `hwpx_document`
- Canon linkage: `.registry/skills/hwpx_document/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`
- Upstream reference: `https://github.com/Canine89/hwpxskill`

## Bundled resource map

- `scripts/analyze_template.py`: inspect a reference HWPX and extract `header.xml` / `section0.xml`
- `scripts/build_hwpx.py`: assemble a HWPX package from template and XML inputs
- `scripts/validate.py`: validate package structure and XML integrity
- `scripts/page_guard.py`: detect page drift against a reference document
- `scripts/text_extract.py`: extract text or markdown from HWPX
- `scripts/office/unpack.py`: unpack HWPX into an editable directory
- `scripts/office/pack.py`: repack an edited directory into HWPX
- `templates/`: base, gonmun, report, minutes, proposal overlays

## Runtime prerequisites

- `build_hwpx.py` and `validate.py` require Python 3.10+ syntax support and `lxml`.
- template-first smoke for this Soulforge package was confirmed under Python 3.12 with `lxml` installed.

## Default operating modes

1. Reference HWPX exists:
   - analyze
   - reconstruct with bounded content edits
   - build
   - validate
   - page guard
2. No reference HWPX:
   - choose a bundled template
   - draft `section0.xml`
   - build
   - validate

## Output expectations

- State whether the task used reference reconstruction or template-first generation.
- If a reference file exists, state whether validation and page guard both passed.
- If structure cannot be safely preserved, say so before widening scope.

## Boundary note

- Detailed mapping lives here so `codex/SKILL.md` can stay lean.
- Actual model, MCP, tool, and installed skill selection remain runtime binding concerns.
