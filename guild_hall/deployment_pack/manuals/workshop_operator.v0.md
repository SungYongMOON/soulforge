# Tool Workshop operator — Internal RC candidate

- Artifact ref: `artifact.manual.workshop_operator.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or operator exercise acceptance is recorded.

## Purpose

Operate an isolated XLSX, bounded template PPTX, or fixed HWPX structural job: check the pack, submit to its durable queue, run the fixed writer and independent validator, and preserve the candidate receipt for the separate ArtifactRevision review path. The runtime requires Node 24+. This procedure does not operate a physical CAD, Office, Hancom, or other specialist tool PC.

The HWPX profile is limited to one section, a fixed base header, a 2×2 table and
two short text replacements. It admits no preview parts. Both author and verifier
run as separate bounded Python 3.12 children, and all other ZIP entry payloads
must remain unchanged. Extra/comment metadata, unsafe entries, XML external
references and out-of-profile structures are refused before candidate custody.
Use `SOULFORGE_HWPX_TEST_PYTHON` only to select an existing trusted runtime for the
synthetic native tests. The fixture and its five pinned registry base files must
travel with the installed tests. A passed structural result still needs actual
Hancom render verification; it is not proof of page count, fonts, printing or
human acceptance. That render connection remains development work.

## Prerequisites

- Reuse the existing authorization for internal, reversible development and synthetic canaries. The dispatcher resolves the exact workshop profile/tool-version reference, bounded job scope, and independent reviewer; routine implementation choices do not require another Owner question. External disclosure requires its separate exact review before execution.
- The requested tool capability exactly matches the workshop profile. No general terminal, fallback tool, or inferred capability is permitted.
- A candidate output can be retained as a safe reference; physical bytes, project source, and credentials are outside this manual.

## Allowed and forbidden actions

- Allowed: validate the Tool Workshop and deployment-pack contracts, build/install/smoke an isolated pack candidate, inspect queue/lease/fence/validator readback, and record a candidate custody receipt reference.
- Forbidden: using an unapproved physical tool, running concurrent work in a capacity-one workshop, bypassing a fence token, treating a `done_candidate` result as acceptance, completing a task automatically, changing a host/runtime configuration, or exporting project material.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:tool-workshop
npm.cmd run validate:deployment-pack
node guild_hall/deployment_pack/tools/build_pack.mjs --spec guild_hall/deployment_pack/packs/tool_workshop_pack.spec.json --out APPROVED_STAGING_OUTPUT --install-verify APPROVED_ISOLATED_TARGET --smoke
node guild_hall/deployment_pack/tools/release_rehearsal.mjs --pack tool_workshop_pack
node guild_hall/deployment_pack/tools/release_rehearsal.mjs --pack tool_workshop_pack --workshop-test-config APPROVED_SYNTHETIC_TEST_CONFIG
```

- In the installed payload, create a fresh empty isolated output directory and run
  `node guild_hall/tool_workshop/src/synthetic_xlsx_canary.mjs --output-root ABSOLUTE_EMPTY_DIRECTORY`.
  This built-in fixture needs no project source or credentials. It creates separate
  state, input, attempt and output directories plus the pinned runtime binding and
  candidate receipt. It refuses an already-used target; retain it for inspection.
- `createDurableToolWorkshop` persists the queue in `workshop.sqlite`; the fixed
  `createXlsxWorkshopRunner` requires matching project, resource, tool version,
  dependency hashes and existing disjoint roots. The canary demonstrates this
  wiring with synthetic approval refs; it does not issue real execution authority.
- Optional independent native readback uses
  `python guild_hall/tool_workshop/tests/native_xlsx_canary_readback.py --root SAME_CANARY_DIRECTORY`
  in an existing runtime containing openpyxl. It checks the exact receipt bytes and
  cells, and rejects formulas, external links and hidden sheets.
- The original PPTX profile reuses an approved two-slide text template. The
  optional approved text profile supports 2–20 slides and 1–4 textboxes per slide,
  with exact geometry, font, placeholder and content checks. It requires an
  explicitly installed Python 3.12 runtime and licensed `@oai/artifact-tool`
  2.8.59 renderer, each hash-pinned locally. Those external runtime bytes are
  not redistributed in this source pack. The command is portable Node/Python;
  it does not call a Codex API or start PowerPoint.
- Run the installed payload's
  `node guild_hall/tool_workshop/src/synthetic_pptx_canary.mjs --output-root ABSOLUTE_EMPTY_DIRECTORY --artifact-root APPROVED_RENDERER_DIRECTORY --python-executable APPROVED_PYTHON_EXECUTABLE`.
  It creates the synthetic template, runs author/independent native validation,
  reimports the actual PPTX to PNG, and preserves hashes in the candidate receipt.
  Inspect every PNG and the editable text before treating this exercise as passed.
  Add `--korean-text` in a different fresh directory to exercise the four-slide
  Korean fixture, then run
  `python guild_hall/tool_workshop/tests/native_pptx_canary_readback.py --root SAME_CANARY_DIRECTORY`
  with an existing python-pptx verification runtime for independent native readback.
- To include the actual PPTX path in both source and installed smoke, provide a
  JSON file with exactly `artifactRoot`, `templatePath`, `pythonExecutable`,
  `templateProvenance: "synthetic_fixture"`, and the synthetic `templateApprovalRef`.
  The rehearsal copies and hashes this limited input in its fresh private root.
  Without it, three real PPTX tests are explicitly skipped and the strict rehearsal
  stays HOLD; the packet and XLSX tests still run. The configured suite includes
  the Korean fixture and the 20-slide/80-textbox maximum profile. Text is never
  shrunk, normalized or truncated to pass: invalid Unicode or an exceeded layout
  budget requires corrected approved input/template. Images/charts, arbitrary
  template structures and other specialist adapters remain development work.
  Host font coverage and renderer-internal clipping are not fully proved by the
  pixel guard; inspect every new business template's actual rendered pages.
- `guild_hall/agent_observation/resource_job_shop.mjs` is the adjacent host/resource observation contract; it is not a physical tool controller.
- `guild_hall/vault_revision/` owns the separate review/acceptance route for any ArtifactRevision candidate.

## Expected readback and evidence

- Pack/version/digest and installed-copy smoke readback for the isolated candidate only.
- Exact workshop profile, capability/tool-version reference, job/lease/fence token, queue state, validator outcome, and candidate custody receipt reference.
- A candidate output state only; independent review and acceptance must occur through their separate owner path.

## HOLD / stop

Stop on capacity conflict, missing/expired lease, stale fence token, capability/version mismatch, validator failure, absent project scope, conflicting writer, missing independent reviewer, or any request for unapproved hardware/software side effects. UI idle, a crashed runner, or an unverified process stop does not free a lease.

## Rollback and escalation

Release a lease only through the exact contract path; an expired takeover invalidates the older fence token. Do not delete a candidate output to resolve a conflict. Preserve the job/lease/receipt references and escalate to the Workshop owner, project reviewer, or isolated-pack operator as appropriate.

For a restart, stop the exact child and reuse the same roots and pinned binding.
Use `mode: "open_existing"`; it refuses missing prior state, including a deleted
database and marker. First creation uses `mode: "create_new"`. The backward-compatible
default `open_or_create` cannot distinguish an entirely erased state directory
from a new one and is not a restart-loss detector. Cancellation stays requested
until the child is observed closed. After expiry the next acquisition fences the
old worker; files without a committed receipt are unregistered output. The pack
rehearsal exercises code-generation backup/upgrade/rollback/damaged-copy restore;
it does not back up a running workshop database or approve operational recovery.

## Optional scoped Claude text adapter

The pack includes `guild_hall/tool_workshop/CLAUDE_ACP_SCOPE.md` and its four
production modules. The same modules can be built as the separate versioned
`tool-workshop-claude-acp-v3` source lane using the repository-owned
`tool_workshop_claude_acp_v3_lane.spec.json`; the earlier v1/v2 specs and lanes are
preserved. V3 retains the v2 negotiation of Buzz's newer request to supported ACP1
and acknowledges only the
pinned model. Foreign model/permission settings and extra MCP servers remain
refused. The v3 identifier is a packaging revision, not ACP protocol 3 support.
Version agreement is not full bot or tool-chain acceptance. These optional Claude
repairs are not a prerequisite for the first pilot's existing single-task bot route.
This tracked-only first build omits
`--previous-lane`; it contains no inherited workspace metadata, profile, native
runtime, credentials, instructions or job data. Verify the resulting manifest
before registering its exact installed entrypoint as a Buzz custom harness.

The trusted dispatcher prepares the fixed local binding outside the mutable job
folder and pins the instruction/input/runtime bytes and three workspace tool
names. Use the installed entrypoint's `--preflight` mode before sending work. It
checks native metadata, model and MCP names with no user prompt. The ordinary
entrypoint supports ACP text jobs with manifest-bound reads and create-only text
drafts. It retains official CLI authentication in its normal host location and
does not copy credentials into a new home. Never run the production adapter from
a Git checkout or inherit arbitrary client MCP servers, shell tools or settings.

Before each actual work prompt, including later turns, v3 separately invokes the
pinned CLI's `auth status --json` in that session's fixed cwd and environment.
`--preflight` does not perform this auth observation. Only the typed `loggedIn`
boolean and allowlisted authentication method are interpreted; raw auth fields,
account identifiers and stderr are discarded. The probe is bounded to 16 KiB and
15 seconds, and its positive observation expires within 30 seconds and the binding
expiry. It is never reused for a later prompt. `AUTH_REQUIRED` means the CLI
reported no authentication; `AUTH_STATE_UNAVAILABLE` means that observation could
not be established. Neither outcome authorizes reading credentials, logging in,
changing settings, or inferring provider quota from error prose.

An operational failure sends one fixed notice and a terminal ACP response with
`stopReason: "end_turn"`, `_meta.accepted: false`, and typed
`_meta.failure_meta` (`status: "failed"`, fixed code, `retryable: false`). Only
recognized native result subtypes/error codes classify a failure; unknown values
remain unknown. Actual cancellation returns `cancelled`. Failed-session replay
returns the retained result with no new notice, auth probe or work-process spawn;
another attempt requires a newly created session and the usual binding checks.
`directChildClosed: false` means direct-child closure was not confirmed, and a new
session cannot run while an observed prior child remains live. This is not a
descendant-process termination guarantee or rollback of partial draft files.

Buzz's referenced transport may label that terminal response `ok`/`end_turn` and
ignore the custom failure metadata. Such labels mean transport processing ended,
not work success or acceptance. A failure notice observed in an ACP stream/log
does not prove delivery to actual Bot Chat or propagation to a business status.
Read those outcomes separately; this adapter has no relay publisher. Actual Buzz
child-context authentication, real model work and installed-v3 operation require
their own measurements. The packed scope, Buzz-compatibility and failure suites
use synthetic CLI fixtures and run as both source and installed smoke, including
direct reads of the preserved v1/v2/v3 source-lane specifications.

After actual custom-harness selection, read the bot configuration back and run a
short public/synthetic canary. Registration, metadata preflight, actual inference,
PPTX queue execution, native/render validation and artifact custody are distinct
results. A successful text draft does not prove the latter steps. Follow the
scope document for exact binding fields, current CLI checks and limitations;
do not treat file hashes or this adapter as OS principal isolation. Working files
stay in the approved bot work folder. Only accepted canonical bytes and their
lineage may later enter canonical storage through its existing authority.

## Known issues

- Current evidence covers durable queue replay, real Node XLSX and template PPTX generation, separate validation, PPTX reimport/render, and native file readback. No physical Tool PC, Office round-trip/print or operating-principal isolation is proven.
- `done_candidate` is not artifact acceptance, knowledge promotion, project completion, or release.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release the Tool Workshop Pack.
