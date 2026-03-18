# pptx_autofill_conversion

- `pptx_autofill_conversion` is the Soulforge skill package for user-provided PowerPoint templates that must keep layout and structure while changing text content.
- The package keeps canonical behavior in `skill.yaml` and the optional Codex bridge in `codex/`.
- Bundled helper scripts use Python stdlib only and support:
  - unpacking and repacking PPTX packages
  - extracting per-slide text outlines
  - summarizing tables, group shapes, and placeholder text
  - bounded exact-text and trim-normalized exact-text replacement in slide XML
  - structural validation of the resulting PPTX
- The package does not bundle heavy sample PPTX files; local smoke uses user-provided supporting examples as runtime inputs.
