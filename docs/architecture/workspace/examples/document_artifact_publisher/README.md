# Document artifact publisher public fixture

This directory contains one public-safe synthetic
`team_document_content_packet.v0` fixture for
`document_artifact_publisher_v0` contract validation and cold replay.

The fixture uses only synthetic facts and `fixture://` source pointers. Its
artifact root is a Soulforge-root-relative `_workspaces/...` pointer. It does
not contain a report payload, Office binary, external template or asset, private
source body, secret, runtime absolute path, or PPT/PPTX request.

Validate it with:

```powershell
node .workflow/document_artifact_publisher_v0/tools/validate_document_packet.mjs `
  --packet docs/architecture/workspace/examples/document_artifact_publisher/synthetic_content_packet.public.json `
  --schema .workflow/document_artifact_publisher_v0/contracts/team_document_content_packet.schema.json `
  --tokens .workflow/document_artifact_publisher_v0/contracts/team_document_design_tokens.yaml
```

Passing this fixture proves only the portable contract smoke path. Generated
DOCX, XLSX, HTML, PDFs, and rendered images remain local payloads under
`_workspaces` and are not stored in this tracked example.
