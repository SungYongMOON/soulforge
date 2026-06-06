# Daily Work Ledger Automation v0

## Purpose

This contract binds the first implementation support for the daily work ledger
lane. It keeps collection, validation, and report rendering separate:

- Collectors write metadata-only ledgers.
- Validators check ledger files and refs before downstream use.
- Worklog renderers read only already-written ledgers.

The renderer is not a fallback collector. Missing or incomplete ledgers become
explicit gaps.

## Implemented Command Surface

`guild_hall/daily_ledger/` provides:

- `validate`: reads explicit daily ledger files or refs and reports metadata
  boundary errors.
- `render`: reads explicit daily ledger files or refs and writes a Markdown
  draft ordered by project, `P00-000_INBOX`, then Soulforge sub-ledgers.

The npm validation entry is:

```bash
npm run validate:daily-ledger
```

The command accepts external temp fixture files through `--ledger-file` for
dry-run validation. Repo-relative `--ledger-ref` inputs must stay under:

- `_workmeta/<project_code>/daily_ledger/**`
- `_workmeta/P00-000_INBOX/daily_ledger/**`
- `_workmeta/system/daily_ledger/<subledger_id>/**`

## Validation Boundary

The validator rejects:

- raw payload fields such as body/html/raw/payload/attachment content fields;
- raw payload extension refs such as `.msg`, `.eml`, Office/PDF/HWP, archives,
  waveform files, or mailbox payload formats;
- Windows absolute paths, POSIX runtime paths, and UNC paths;
- secret-like text, secret-like filenames, auth/session/cookie/token refs;
- invalid or unclassified project codes;
- unknown Soulforge sub-ledgers, instead of defaulting them to `system`;
- renderer input refs outside daily ledger roots.

The renderer does not accept mail, git, system-log, raw-source, or attachment
refs as command flags. Ledger `source_refs` are printed as metadata pointers
only and are not opened.

## Render Order

The draft order follows `DAILY_WORK_LEDGER_TAXONOMY_V0.md`:

1. confirmed company project ledgers by project code;
2. `P00-000_INBOX`;
3. Soulforge sub-ledgers in taxonomy order;
4. explicit missing, incomplete, review-needed, or ledger-reported gaps.

## Non-Goals

- No live `_workmeta` daily ledger directory scan.
- No `_workmeta` writes by the implementation validator or renderer.
- No raw mail, attachment, Office/PDF/HWP, waveform, `_workspaces`, git log, or
  system log payload reads.
- No project-code assignment truth or owner acceptance claim.
