# Workspace Board iteration 8 validation receipt

- observed at: 2026-07-31 11:03:45 KST
- branch: `codex/workspace-board-owner-inbox-mvp`
- input candidate: `c12e0a4b8cd5cde593967d645e5e8074382612fb`
- scope: compact-card detail boundary, mixed observed/unobserved provider
  enforcement, responsive/browser regression
- data boundary: synthetic fixture/read-only; no writer, backend, archive, or
  deployment

## Deterministic commands

| Command | Exit | Result |
| --- | ---: | --- |
| `npm.cmd --prefix ui-workspace run team-ops-app:test` | 0 | 27/27 passed, including mixed observed/unobserved regression |
| `npm.cmd --prefix ui-workspace run team-ops-app:build` | 0 | Vite production build passed |
| `ui-workspace\node_modules\.bin\tsc.cmd -p ui-workspace\apps\team-ops-board\tsconfig.json --noEmit` | 0 | no type errors |
| `npm.cmd run validate:path-policy` | 0 | 5 passed, 1 environment skip, 0 violations |
| `npm.cmd run ui:done:check` | 0 | fixtures, lint, docs, all UI builds, theme smoke passed |
| `npm.cmd run validate:knowledge-access` | 0 | 55/55 passed |
| `git diff --check` | 0 | no whitespace errors |

## Browser checks

| Viewport/state | Result |
| --- | --- |
| 1440×1024 blocked selected | card excludes blocker reason; detail retains blocker reason and next decision; 16 visible cards; average 93.58px; overflow 0 |
| 1440×1024 mixed provider | card and detail each render Codex + Antigravity only; count `2`; one multi-agent badge; unobserved Kimi count `0` |
| 1024×768 mixed provider | non-modal detail; Codex + Antigravity only; owner/reviewer/pointer preserved; inert roots `0`; overflow 0 |
| 390×844 first entry | no automatic dialog; no selected card; overflow 0 |
| 390×844 mixed provider modal | `aria-modal=true`; focus inside; effective outside focusables `0`; observed count `2`; unobserved Kimi count `0` |
| 390×844 acknowledge lifecycle | focus remains on connected visible close button inside `이력 상세`; Escape restores connected logical history row; `BODY=false` |
| 390×844 blocked lifecycle | card excludes blocker reason; modal retains blocker/next decision; Tab and Shift+Tab trapped; Escape restores origin card |
| app-origin console | warnings `0`, errors `0` |

## Design evidence

- full same-input comparison:
  `workspace-board-iteration8-final-full-comparison.png`
- focused compact/detail comparison:
  `workspace-board-iteration8-final-compact-focus-comparison.png`
- mixed provider desktop:
  `workspace-board-1440x1024-iteration8-mixed-provider.png`
- mixed provider mobile:
  `workspace-board-390x844-iteration8-mixed-modal.png`

Result: passed implementer self-check. Fresh independent acceptance remains
required; claim ceiling is `validated_private`.
