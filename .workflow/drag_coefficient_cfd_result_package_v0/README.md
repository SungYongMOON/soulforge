# Drag Coefficient CFD Result Package v0

Public-safe workflow for closing a drag-coefficient CFD result task as a
traceable result package instead of a Cd-only answer.

The workflow owns the package shape and closeout checks. Project-specific case
data, raw solver logs, company files, generated figures, ZIP bundles, and local
runtime paths stay in `_workspaces/<project_code>/...` or private metadata
surfaces, not in this public workflow package.
