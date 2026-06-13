# SE Workspace Folder Naming Convention v0

## Purpose

This document defines the public-safe naming convention for human-facing SE project workspace folders.

The goal is simple: a teammate should understand the purpose of a folder before seeing machine provenance such as dates, mail subjects, source IDs, hashes, or import route names.

## Scope

This convention applies when creating, organizing, renaming, or dry-running names for SE project workspace folders, including OneDrive-backed workspaces and `_workspaces/<project_code>/` materialized views.

It does not authorize immediate physical rename of active folders. Physical rename requires owner approval and pointer migration planning.

## Core Rule

Use short Korean semantic folder names for people. Move machine metadata into `_workmeta` metadata, manifests, or path-history records.

Recommended visible names:

```text
원자료
파생자료
분석
보고서
요약
검토
조치
분류대기
```

Recommended topic plus role names:

```text
수조시험_자료
전기특성_자료
군지연_분석
레플리카_비교
팀공유_요약
모바일_보고서
```

Avoid visible names that expose provenance first:

```text
YYYYMMDD_회의명_예시
20260602_customer_project_source_download
raw_email_attachments_source_abc123
analysis_group_delay_20260602
OneDrive Export Final Final v3
```

## Naming Rules

1. Prefer Korean meaning first.
   - The folder name should describe the work role or topic.
   - Use English acronyms only when they are standard SE stage names or unavoidable technical identifiers.

2. Keep names short.
   - Aim for about one mobile OneDrive line.
   - Avoid full mail titles, sender names, source routes, and long English import names.

3. Move dates into metadata.
   - Received date, experiment date, created date, and import date are metadata.
   - Use a visible date only when the owner explicitly chooses date sorting for a package boundary.

4. Move source identity into metadata.
   - Mail message ID, source ID, hash, original filename, original folder name, sender, and import batch ID should not be the visible folder name.

5. Preserve raw and derived boundaries.
   - Use `원자료` for received files.
   - Use `파생자료` for converted or generated files.
   - Use `분석`, `보고서`, or `요약` for outputs by role.

6. Use `분류대기` for uncertainty.
   - If the role is unclear, do not invent a confident name.
   - Put the item in a review/hold state until the owner decides.

7. Treat SE stage roots as high-impact.
   - Stage roots and numbered artifact folders may be referenced by reports, manifests, scripts, and user bookmarks.
   - Any change to those names requires a dry-run rename map and pointer migration plan.

## Standard Role Terms

| Role | Visible folder name |
| --- | --- |
| raw received files | `원자료` |
| converted/generated files | `파생자료` |
| working analysis | `분석` |
| report output | `보고서` |
| team brief | `요약` |
| review queue | `검토` |
| follow-up actions | `조치` |
| temporary or unclear item | `분류대기` or `보류` |

## Reserved Document-Artifact Temp Folders

For document-producing artifacts, SE folder tree generation may create or permit these reserved project-local folders:

```text
_workspaces/<project_code>/<stage>/<artifact>/00_Temp/template_snapshot/
_workspaces/<project_code>/<stage>/<artifact>/00_Temp/workflow_candidate/
```

- `template_snapshot/` contains the frozen project-local baseline copied or materialized from a chosen library file or owner-approved artifact material at task start.
- `workflow_candidate/` contains workflow or rule candidates extracted from the concrete project run. It is not `.workflow` canon.
- Project-local latest authoring files stay in the project folder. Do not move them into the library; copy/materialize a sample output or reusable material only when useful.
- Do not put dates, hashes, source IDs, customer names, or original file names into these reserved folder names. Record them in manifests or metadata.

The reusable actual-file library uses this shape:

```text
_workspaces/SE_TEMPLATE_LIBRARY/
├── common_document_rules/
└── <stage>/<artifact>/00_Temp/
    ├── templates_or_forms/
    ├── workflow/
    ├── authoring_rules/
    ├── sample_outputs/
    └── manifests/
```

- `_workspaces/SE_TEMPLATE_LIBRARY/` is the canonical actual-file library/store for reusable SE artifact materials. It is not a pointer-only reference folder and not a project execution baseline.
- Library files can include owner-approved templates/forms, executable artifact workflows, artifact-specific authoring rules, and sample output files.
- `workflow/` contains only the executable workflow procedure. Folder layout, source path, copy history, hash, catalog/provenance, version, and classification belong in `manifests/` or catalog docs.
- Common document rules stay separate from artifact-specific `authoring_rules/`; keep them under `common_document_rules/` or another owner-approved common-rule surface.
- Rev-specific HWP forms are not automatically official form originals. Owner-approved canonical HWP/HWPX form materials can live under `templates_or_forms/` with manifest metadata.
- `_workspaces/system/` remains the lab and fixture workspace, but on
  participating PCs it follows the workspace path identity policy and should
  resolve to the same shared view. PC-local experiments and cache belong under
  `_workspaces/_local/<node_id>/`.

## Metadata To Record Outside The Folder Name

When a visible folder name hides provenance, record the provenance separately.

Minimum metadata fields for a rename candidate:

| Field | Meaning |
| --- | --- |
| `project_code` | project identifier |
| `current_path` | current workspace path |
| `proposed_path` | dry-run target path |
| `original_folder_name` | exact current folder name |
| `display_name` | proposed or approved human-facing name |
| `folder_role` | raw, derived, analysis, report, brief, review, action, hold |
| `source_date` | received, created, import, or experiment date when known |
| `source_ref` | mail ID, source ID, or package ID when known |
| `hash_or_size_ref` | checksum or size pointer when needed |
| `path_history` | previous/current path records after accepted rename |
| `owner_decision` | approve, revise, hold, reject |

For project snapshot and document-artifact records, also keep these version axes separate when applicable:

| Field | Meaning |
| --- | --- |
| `form_revision` | owner-approved reusable form/material revision or label |
| `template_snapshot_id` | project-local frozen snapshot identifier |
| `template_snapshot_version` | project-local snapshot version when separate from the id |
| `input_bundle_version` | source/input bundle version |
| `artifact_version` | generated or manually edited artifact version |
| `workflow_version` | authoring procedure or rule version |
| `validation_status` | current validation state after latest artifact edit |

Project snapshot manifests should record the source library material or owner-approved artifact material pointer, project snapshot pointer, hash, snapshot time, and status without exposing raw project content.

## Rename Workflow

1. Inspect the current folder tree.
2. Create a dry-run rename map.
3. Check report links, handoff links, manifests, scripts, bookmarks, and OneDrive sync risk.
4. Record metadata and pointer migration requirements.
5. Get owner approval.
6. Rename only after the migration plan is accepted.
7. Record path history after rename.

## Stop Conditions

Do not physically rename folders when:

- owner approval is missing
- pointer migration is unresolved
- OneDrive sync or shared-link impact is unknown
- raw payload would need to move into `_workmeta`
- the public/private boundary is unclear

## Agent Routing

`AGENTS.md` points agents here. Agents should keep `AGENTS.md` short and use this document for the detailed convention.

Future automation should lint folder names and produce dry-run rename maps instead of relying on LLM memory alone.
