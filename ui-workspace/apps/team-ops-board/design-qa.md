# Workspace Board Owner Action Inbox — Design QA

## Comparison target

- source visual truth:
  `%USERPROFILE%/.codex/generated_images/019fb3de-28df-7f62-932c-b18d7fad9a87/call_8Y9O5SsyGLqvfWQQXOD4h6xG.png`
- compact work-tool grammar reference:
  `%TEMP%/codex-clipboard-213e4c44-7fda-4a80-8087-a9f68a82c991.png`
- final browser-rendered implementation:
  `evidence/workspace-board-1440x1024-primary-final.png`
- final same-input comparison:
  `evidence/design-qa-comparison-iteration-4-modal-lifecycle.png`
- final mobile dialog implementation:
  `evidence/workspace-board-390x844-mobile-ack-history-dialog-iteration-4.png`
- route/state: `/`, dark theme, synthetic normal state, blocked TASK selected
- CSS viewport: 1440 × 1024
- device pixel ratio: 1
- source pixels: 1487 × 1058, normalized to 1440 × 1024 for comparison
- implementation screenshot pixels: 1425 × 1013. The in-app browser capture
  excludes its 15 px scrollbar/frame region while the measured CSS viewport
  remains 1440 × 1024.
- density normalization: source resampled once with aspect-preserving near-1:1
  fit; implementation kept at native DPR 1.

## Browser evidence

- primary desktop:
  `evidence/workspace-board-1440x1024-primary-final.png`
- completed-unread selected:
  `evidence/workspace-board-1440x1024-completed-selected.png`
- acknowledged history recovery:
  `evidence/workspace-board-1440x1024-acknowledged-history.png`
- tablet:
  `evidence/workspace-board-1024x768-tablet-final.png`
- mobile board:
  `evidence/workspace-board-390x844-mobile-final.png`
- mobile blocked detail:
  `evidence/workspace-board-390x844-mobile-blocked-detail.png`
- mobile accessible dialog:
  `evidence/workspace-board-390x844-mobile-dialog-accessibility.png`
- mobile first entry without an automatic dialog:
  `evidence/workspace-board-390x844-mobile-first-entry-iteration-4.png`
- mobile acknowledged history dialog:
  `evidence/workspace-board-390x844-mobile-ack-history-dialog-iteration-4.png`
- mobile acknowledged history focus restore:
  `evidence/workspace-board-390x844-mobile-ack-history-restore-iteration-4.png`

The full-view comparison is sufficient for final typography, layout, token,
copy, and card/detail inspection because the native desktop capture keeps the
dense card text and right detail readable. A separate crop was not needed.
The mobile detail has its own focused screenshot because it changes to a fixed
modal overlay. The final comparison also includes that 390 × 844 state beside
the selected source, Orca reference, and unchanged desktop implementation.

## Findings

No actionable P0/P1/P2 findings remain.

- Fonts and typography: the existing Segoe UI/system stack keeps Korean and
  Latin labels readable at the compact target density. Project meta is smaller
  than the TASK title, and long text wraps without overlap.
- Spacing and layout rhythm: four state columns, 1 px dividers, 4–6 px radii,
  restrained fills, minimal shadow, and the right detail panel follow the
  selected visual grammar. Three visible cards per column plus explicit
  `더보기` prevents scale-driven overflow.
- Colors and visual tokens: graphite surfaces and subtle blue/purple/red/green
  column treatments preserve the source state semantics without heavy fills.
  `completed_unread` is green and blocked/decision text is red.
- Image quality and assets: the target contains no required raster product
  imagery. Standard interface icons use the app's existing Lucide library.
  The Orca orb and host chrome are reference-environment assets and were not
  copied into the product.
- Copy and content: every displayed entity is labeled synthetic or observed/
  UNKNOWN. The copy does not imply live Codex, ERP, worktree, or provider truth.
- Icons: one consistent outline icon family is used for navigation, status,
  task, provider, history, and decision surfaces.
- States and interactions: active/history, search, project/responsibility/
  status filters, per-column more, detail selection, completed acknowledgement,
  pointer-preserving history recovery, empty, error, missing-data, UNKNOWN, and
  multi-agent states were exercised.
- Accessibility: semantic headings/regions/buttons/labels, `aria-pressed`
  selection state, skip link, visible 2 px focus ring, reduced-motion handling,
  no horizontal overflow at tested breakpoints, and 44 px minimum visible
  mobile control height passed. At 760 px and below, detail has dialog/modal
  semantics, a heading-derived accessible name, initial close-button focus,
  Tab/Shift+Tab trapping, Escape/close dismissal, background inertness, and
  trigger-card focus restoration. Larger viewports retain the non-modal detail.
  A detached trigger is rejected; restoration then prefers the same logical
  task if rendered, followed by the current view control, search, scope heading,
  and main content. `BODY` is not treated as a successful restoration target.

## Comparison history

### Iteration 1 — blocked

Evidence: `evidence/design-qa-comparison-iteration-1.png`

- [P1] Card information was materially denser and smaller than the source,
  weakening scan hierarchy.
  Fix: reduced the initial per-column limit from four to three, increased TASK
  title/provider/owner/timestamp sizing, and retained overflow behind `더보기`.
- [P2] The selected blocked detail headed itself `막힘` instead of the source's
  decision-oriented `Owner 판단 필요`.
  Fix: added state-aware detail titles and the source-aligned evidence, impact,
  and request-message sections.
- [P2] Mobile visible controls included 29–34 px targets.
  Fix: raised mobile menu, search, selects, view controls, reset, and more
  buttons to a 44 px minimum.

### Iteration 2 — blocked

Evidence: `evidence/design-qa-comparison-iteration-2.png`

- The earlier density and detail-hierarchy findings were corrected.
- [P2] The comparison capture retained a 12 px restored scroll offset, clipping
  the topbar edge, and the final mobile audit still found 34 px `더보기`
  controls.
  Fix: navigated to a fresh local route state for scroll position 0 and raised
  the remaining input/more targets to 44 px.

### Final comparison — passed

Evidence: `evidence/design-qa-comparison-final.png`

- Source 2, Orca grammar reference, and the browser-rendered MVP are present in
  one comparison input.
- Four-column composition, task hierarchy, muted state surfaces, decision
  detail, and compact work-tool grammar are aligned.
- Intentional deviations are product-contract driven: the MVP uses
  project/responsibility/TASK/pointer/provider fields instead of the source's
  evidence progress bars, and it exposes scale controls required by the
  acceptance contract.
- No actionable P0/P1/P2 difference remains.

### Iteration 3 — fresh independent P2 blocked, then passed

Pre-fix evidence: fresh independent review reproduced the 390 × 844 fixed
overlay with focus retained on the obscured blocked card. Of 27 focusable
elements, only one was inside the detail while 26 background elements remained
reachable. The overlay had no dialog/modal semantics or focus management.

Fix:

- centralized the mobile detail boundary at 760 px for the viewport decision
  and kept the CSS query aligned with that value
- added `role="dialog"`, `aria-modal="true"`, and heading-based accessible name
- moved focus to the close button on open
- added deterministic Tab/Shift+Tab boundary cycling and Escape dismissal
- applied `inert` and `aria-hidden` to the background while the modal is open
- restored focus to the exact originating TASK card after Escape or close
- preserved the 1024 × 768 tablet and desktop detail as non-modal

Post-fix evidence:

- implementation:
  `evidence/workspace-board-390x844-mobile-dialog-accessibility.png`
- source/Orca/desktop/mobile comparison:
  `evidence/design-qa-comparison-iteration-3-mobile-dialog.png`
- CSS viewport and screenshot pixels: 390 × 844 at DPR 1
- open state: active element was the dialog close button; the dialog accessible
  name was `Owner 판단 필요`
- focus surface: 28 visible focusable elements in the document, one effective
  focusable inside the dialog, zero effective focusables outside it, five inert
  background roots
- actual Tab, Tab, Shift+Tab cycle remained on the only dialog focus target
- actual Escape and close-button paths both removed the dialog and restored
  focus to `오로라, 오로라 공급 일정 확정, 막힘`
- 1024 × 768 check: no dialog role, no `aria-modal`, no inert root, static
  non-modal detail

The accessibility correction does not introduce a visible P0/P1/P2 drift.
The final same-input comparison keeps the selected compact visual grammar,
desktop composition, and mobile detail hierarchy intact.

### Iteration 4 — fresh lifecycle P2 blocked, then passed

Pre-fix evidence: fresh independent re-review found two lifecycle gaps despite
the generic blocked-card path passing. The 390 × 844 first entry opened the
default selected detail without an originating trigger, so Escape/close left
focus on `BODY`. After `완료·미확인` → `읽고 확인`, the originating card was
removed from the active DOM; closing the retained history detail attempted to
focus the detached reference and also landed on `BODY`.

Fix:

- disabled default detail selection only at the shared 760 px mobile boundary;
  1024 × 768 and desktop keep their default non-modal detail
- added pure, deterministic focus-candidate and priority-selection helpers
- reject missing, detached (`isConnected=false`), disabled, hidden, or inert
  restore candidates
- restore in priority order to the connected origin, the same rendered logical
  TASK, the current active/history view control, search, scope heading, or main
- preserve the acknowledged item as an `이력 상세` modal; when the 60-row
  history cap means its row is not rendered, restore to the connected
  `이력·제외` view control rather than `BODY`

Post-fix evidence:

- same-input source/Orca/actual comparison:
  `evidence/design-qa-comparison-iteration-4-modal-lifecycle.png`
- first entry:
  `evidence/workspace-board-390x844-mobile-first-entry-iteration-4.png`
- acknowledged history dialog:
  `evidence/workspace-board-390x844-mobile-ack-history-dialog-iteration-4.png`
- acknowledged history close restore:
  `evidence/workspace-board-390x844-mobile-ack-history-restore-iteration-4.png`
- first entry measured 390 × 844, zero dialogs, zero selected cards, and a
  visible board
- acknowledged transition retained the named `이력 상세` dialog and original
  pointer event; both Escape and close-button paths restored to the connected
  `이력·제외` button (`BUTTON`, not `BODY`)
- blocked open moved focus to `상세 닫기`; Tab and Shift+Tab stayed trapped,
  effective outside focusables remained zero with five inert background roots,
  and Escape restored the exact `fixture-aurora-supply` card
- 1024 × 768 remained static and non-modal: no dialog role, no `aria-modal`,
  and zero inert roots
- browser console errors: 0; warnings: 0

The iteration 4 comparison shows no visual P0/P1/P2 regression in the compact
graphite grammar, mobile information hierarchy, or acknowledged history state.

## Primary interactions and console

- selected blocked TASK and confirmed blocker reason/next decision persistence
- selected completed-unread TASK, activated `읽고 확인`, confirmed active
  removal and `owner_acknowledged` history event with original pointer
- searched the acknowledged title and recovered exactly one history item
- selected empty, error, and normal fixture modes
- confirmed missing-data, UNKNOWN, and multi-agent fixtures
- tested 1024 × 768 two-column tablet and 390 × 844 one-column mobile layouts
- confirmed mobile detail fixed overlay, no horizontal overflow, and 44 px
  minimum visible control height
- inspected DOM tab order, accessible names and pressed states; exercised the
  skip-link/menu focus ring
- exercised the 390 × 844 dialog open → Tab/Shift+Tab cycle → Escape/close →
  originating TASK-card focus restoration path
- confirmed 390 × 844 first entry does not auto-open a dialog and confirmed
  acknowledged-card detachment restores Escape/close focus to the connected
  history view control rather than `BODY`
- confirmed mobile dialog effective focusables: inside 1, outside 0; tablet
  non-modal detail: role absent, inert roots 0
- browser console errors: 0
- browser console warnings: 0

## Follow-up polish

- [P3] The selected visual uses larger evidence/readiness progress bars. They
  remain intentionally omitted because the approved MVP's minimum data contract
  does not define those values and UNKNOWN values must not be inferred.

## Implementation checklist

- [x] Four exact active columns and default exclusions
- [x] Project-first/TASK-title card hierarchy
- [x] Observed-only provider badges and UNKNOWN semantics
- [x] Blocker reason and next decision persistence
- [x] Completed acknowledgement and pointer-preserving history
- [x] Scale cap, more, search, and filters
- [x] Empty/error/missing/UNKNOWN/multi-agent states
- [x] Desktop/tablet/mobile and keyboard/accessibility checks
- [x] Mobile modal semantics, focus trap, Escape/close, inert background, and
  connected logical-target/fallback focus restoration
- [x] Final same-input Product Design comparison

final result: passed
