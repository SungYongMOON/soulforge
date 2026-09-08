# Tool Workshop — durable queue and bounded document candidates

Owner: `guild_hall/tool_workshop`. `CURRENT = isolated synthetic XLSX/PPTX candidates + fixed HWPX structural candidates + durable replay`. Default OFF. Native desktop applications, physical Tool PCs, licenses, operational lanes and final acceptance are not exercised by this module. Hancom rendering, general HWPX templates, CAD and PCB execution remain subsequent work in the same program goal.

## Fixed HWPX structural candidate

`hwpx_workshop_runner.mjs` reuses the durable queue, current lease/fence and bounded
child process. The profile is `workshop.hwpx`, resource `resource.hwpx_python`,
tool `tool.template_hwpx:v1` and validator `validator.hwpx_structural_readback:v1`.
Its pinned template family has one section, an exact base header, a 2×2 table,
two editable text nodes and no preview parts. Title/body admit only bounded NFC
Hangul syllables and printable ASCII. This profile does not accept arbitrary HWPX.

Separate Python child invocations author and validate actual HWPX bytes before
candidate registration. Every other ZIP entry payload stays unchanged. Unsafe
entry names, links, duplicate entries, excess expansion, XML declarations that
permit external entities, archive comments and per-entry extra/comment metadata
are rejected. The validator checks the fixed structure and exact text changes.
Input/candidate bodies stay outside the metadata journal; restart reads the same
candidate receipt. Rejection produces no candidate custody, including after reopen.

Node 24 and a trusted local Python 3.12 binding are required. Native tests run
only when `SOULFORGE_HWPX_TEST_PYTHON` explicitly selects that runtime; absence is
reported as a skip. The executable and actual Python runtime files are pinned,
and the child uses `-I -S -B`. The test fixture reads the five declared registry
base files; packaging must carry those exact source files and the fixture helper.
Structural verification and independent XML readback do not establish Hancom
rendering, page count, font coverage, printing, human acceptance or production use.

The original pure core remains the single queue/lease/retry state machine. The local durable adapter adds SQLite transaction boundaries and replays sanitized commands into that core. The first real tool path reuses `ui-workspace/apps/dev-erp/tools/project_history_copy_xlsx.mjs` unchanged: an approved structured metadata packet becomes an actual one-sheet OOXML XLSX candidate.

## Contract

- Capacity is one per exact resource. Duplicate resource registration is rejected. Priority 1–3 then submission order selects eligible work. A project-bound worker selects only its own project without consuming another project's retries. Release is explicit; UI idle is not release.
- A committed SQLite journal survives process restart. `BEGIN IMMEDIATE` serializes concurrent writers and includes replay, fence check and state update. Live acquisition timestamps are sampled after obtaining the database lock; lock wait does not consume a new lease. Abrupt exit rolls back an incomplete transaction. A sequence/hash chain detects broken journal bytes; it is integrity checking, not authentication against a malicious local database administrator.
- Fences increase monotonically across replay. An expired lease rejects candidate completion even before takeover. Takeover terminally fails the old attempt; a late runner cannot register a candidate. Input failure, process failure, timeout and validator failure consume bounded retries. Invalid commands leave no job record.
- Queued cancellation is terminal. Running cancellation becomes `cancel_requested` and retains its lease until the runner observes its exact child closed. The trusted executor acknowledges that observation; a user-facing cancel request alone cannot release capacity. Expiry remains the crash recovery path.
- Work briefs and approval are trusted caller inputs, supplied as references. The adapter does not create or authenticate business approval. Packet bytes live only in the isolated input/attempt roots. The journal stores refs, hashes, tool/version identity, state and candidate metadata; it never stores packet cells, stdout, stderr, command text or environment values.
- `pinXlsxRunnerBinding()` is a trusted bootstrap operation. Save the returned binding in protected local configuration and reuse it. Admission checks exact executable path, Node version, executable SHA-256, the fixed source root and dependency hashes. Drift fails closed; a job cannot choose executable, arguments, source path, environment, shell or validator. Do not auto-repin on drift.
- Every attempt snapshots the admitted source dependency closure and input bytes. The bounded renderer and a separate validator process use that snapshot. Environment is reduced to isolated temporary/home paths and the Windows system directory when needed. Neither child launches Office, loads arbitrary plugins, invokes a shell, calls a model nor uses the network. This is a trusted-code boundary, not an OS sandbox against malicious administrator edits.
- Input is at most 1 MiB, output at most 8 MiB, process output at most 4 KiB, and the total lease is at most 300 seconds. Direct standalone files and disjoint input/work/output/state/code roots are required; symlink/junction and hardlink aliases fail closed.
- Native readback verifies the actual ZIP/OOXML entries, CRCs, typed cells, ordered row digest and exact input parity. Formula, macro, hidden-sheet and external-link carriers are rejected. A separate validator runs before the parent rechecks the held output bytes and publishes under the same transaction/fence.
- The custody receipt records actual SHA-256, byte size, format, binding digest and validator ref. Claim remains `workshop_output_candidate_only`. No acceptance, promotion or OfficialDone API exists. A crash after immutable candidate bytes are written but before journal commit can leave orphan bytes; without a committed receipt they are not registered candidates. No automatic deletion or downgrade is performed.

## API and runtime

- `createDurableToolWorkshop({stateRoot,mode})`: register, submit, acquire, cancel, inspect and replay. Use `create_new` only for deliberate bootstrap and `open_existing` for restart; strict restart refuses a missing DB even if its marker is also missing. The legacy `open_or_create` default remains for API compatibility and cannot distinguish a truly new root from a root whose DB and marker were both deleted. Caller creates the direct local state directory. Node **24+** is required; Node 24.15.0 was exercised. The standalone pure core remains compatible with Node 20.
- `createXlsxWorkshopRunner({queue,binding,projectRef,inputRoot,workRoot,outputRoot}).runNext()`: run at most one queued XLSX job and return its candidate/failure/cancellation state, or `null` when no eligible lease exists. The trusted configuration binds these roots to one project. A different job project is not leased or read. All four directories must already exist and be mutually disjoint from the code root.
- XLSX profile: `workshop.xlsx`, `resource.xlsx_node`, `tool.project_history_xlsx:v1`. Other resources need their own exact profile and lease; this profile does not confer a general Office/EDA capability.
- Input location: `<inputRoot>/<input_bundle_manifest_digest>.json`. Packet SHA-256 and `project_id === project_ref` must match; `approval_ref` is required for a bound workshop. Output location: `<outputRoot>/<actual_sha256>.xlsx`. Actual root paths and binding values stay local.
- Internal `commitVerifiedCandidate` and cancellation observation are trusted executor seams, not request-envelope handlers. Only the fixed runner calls candidate registration after real validation. Request adapters must not expose those seams or interpret caller-provided success as validation.

## Verification and synthetic canary

```powershell
node --test guild_hall/tool_workshop/tests/*.test.mjs
node guild_hall/tool_workshop/src/synthetic_xlsx_canary.mjs --help
node guild_hall/tool_workshop/src/synthetic_xlsx_canary.mjs --output-root <absolute-existing-empty-directory>
python guild_hall/tool_workshop/tests/native_xlsx_canary_readback.py --root <same-canary-directory>
```

The optional Python readback requires `openpyxl` in an existing or bundled runtime; it is a verification dependency, not a production runner dependency. The canary creates isolated child directories, a local pinned runner binding and one synthetic workbook plus a candidate receipt. It does not target an existing project, operational path, `_workmeta`, private credentials or application data. Reusing the same canary directory fails; preserve it for inspection and choose a fresh directory for another run.

Tests cover real XLSX generation/readback and restart, duplicate/shape/version/hash/root rejection, four-process queue contention, expiry, real child cancellation, retry exhaustion, corrupted journal, and crash rollback followed by zombie fencing. Native third-party readback was additionally exercised with bundled `openpyxl 3.1.5`: 3 rows including header × 18 columns, no formulas/external links/hidden sheets, 6,693 bytes, SHA-256 `864add1036956ccde4ba8622c20570871c09a434bd15c9557e9572ae92421fd1`. This is native file evidence; Excel desktop round-trip, printing and physical tool isolation are not claimed.

An intermittent child-process failure was observed in the earlier four-process test under combined load. Its exact cause remains unconfirmed. Child-exit diagnostics and the transient-sidecar check were improved, and subsequent scoped/independent repeated tests passed; those passes do not prove the original failure's cause.

## State, recovery and packaging

### PPTX bounded template path

`createPptxWorkshopRunner({queue,binding,projectRef,inputRoot,workRoot,outputRoot})` uses the same queue, candidate transaction and bounded process driver as XLSX. Its exact resource is `resource.pptx_node_python`, workshop `workshop.pptx`, version `tool.template_pptx:v1`. Different tools retain separate exclusive leases.

The existing `.workflow/presentation_artifact_render_v0` owns the approved-content/template/fidelity contract. The adapter reuses `.registry/skills/pptx_autofill_conversion/codex/scripts/replace_text_runs.py::replace_exact_text()` after its own bounded ZIP admission, without invoking that script's unrestricted `extractall()` or overwriting entrypoint. The original `workshop.two_slide_text`, `template:v1` profile remains compatible: exactly two slides, each with one editable title and body textbox, printable ASCII text, title at most 24 characters and body at most 35 characters. Unsupported content fails before authoring instead of being shortened.

Trusted bootstrap may additionally supply `textProfile` to `pinPptxRunnerBinding()`. This extends the same tool version and candidate-only authority, not the workflow or business-approval contract. Its family is `workshop.approved_text`, revision is an explicit ref, and `slides` is an ordered list of 2–20 entries. Each entry has `textboxes`, an ordered list of 1–4 exact `{placeholder,geometry,font_family,font_size}` mappings. `placeholder` is a globally unique `{{UPPER_CASE_ID}}`; `geometry` is `[left,top,width,height]` in pixels on the fixed 1280×720 canvas; `font_family` is `Malgun Gothic`; integer `font_size` is 24–64 pixels. Boxes must stay inside the approved safe region, have sufficient line height and remain separated. The native gate checks these declarations against the actual pinned template's editable text runs, geometry, font and no-autofit setting. A mismatched template is rejected before replacement. Jobs cannot supply or change the mapping. New templates require a deliberate protected binding and the existing explicit template approval/provenance; no auto-repin occurs.

For this profile the existing packet envelope remains unchanged; each slide is `{texts:[...]}` matching the approved textbox order exactly. Korean syllables, printable ASCII, a bounded set of composed Latin letters, business punctuation and units are supported. Text must already be NFC. Decomposed Hangul, remaining combining marks, bidi/format controls, private-use/surrogate/unassigned characters, tabs, carriage returns, Unicode line/paragraph separators and untested scripts/emoji are rejected. LF line breaks are preserved inside editable runs. Each box is limited to 800 characters and eight explicit nonempty lines, and a conservative width/line-height budget usually imposes a tighter bound. The adapter never uses wrapping, shrinking, normalization, truncation or summarization as content/layout repair. Oversize input consumes the existing bounded input-failure retry path and produces no custody receipt; the caller must return to the approved-content/template owner for correction. The flexible packet is at most 128 KiB. The 20-slide ceiling fits the existing 200-entry ZIP cap for the exercised text template, 8 MiB native output cap and 300-second total lease; templates with more package overhead can still be rejected.

`pinPptxRunnerBinding({artifactRoot,pythonExecutable,templatePath,templateApprovalRef,templateProvenance})` is trusted bootstrap only. Packet source/ref/revision/approval and both content/template `synthetic_fixture | owner_approved` provenance are explicit caller inputs, not inferred from filenames. The observed backend is bundled Artifact Tool 2.8.59 and Python 3.12.14. Binding covers Node/Python executables, Python version and the probed stdlib/bytecode/native DLL file set, the complete installed Artifact Tool package tree, exact source closure and template hash. Pinned Python files are checked before the isolated version/import probe runs. Source and Artifact Tool bytes are snapshotted per attempt; Python runs `-I -S -B` from its pinned installed runtime. This excludes user site/PYTHONPATH and bytecode writes. OS libraries and fonts remain host dependencies; no OS sandbox or PowerPoint desktop compatibility is claimed.

The native validator checks actual ZIP relationships/CRCs and presentation order, rejects traversal/macros/external relationships/binary or script carriers, and verifies the exact approved editable textbox count, text parity and unchanged XML geometry/styles plus all non-slide template parts. The flexible profile excludes unmapped inherited/notes text, images, charts, embedded fonts, HTML and other specialist content. A separate Node process imports the resulting PPTX and renders every actual slide to PNG. A separate Python pass checks native bytes again and verifies PNG CRCs, dimensions, bounded decompression, nonblank textbox regions and ink inside the approved layout; the flexible profile additionally rejects ink outside or touching each box boundary. The synthetic Korean four-slide canary also has independent `python-pptx`/XML readback and visual inspection of every full-size slide. These are render/native QA observations, not human acceptance of a business artifact.

Font availability, glyph selection and OS font bytes remain host dependencies, as in the original profile. The encoded template font is checked and the exercised Korean glyphs were visually readable; the pixel guard does not recognize every missing-glyph/tofu shape or text clipped internally by a renderer. Conservative fit admission and actual-image review reduce this risk but do not prove arbitrary Korean/Unicode font coverage. There are no font downloads, desktop Office launches or font/runtime redistribution. New business templates still require their own visual QA; this adapter is not general chart/image/CAD/HWPX support.

PPTX custody includes template hash, an ordered 2–20-render content-addressed JSON manifest and candidate byte hash/size. Identical PNG bytes may share one content-addressed file while retaining every slide's manifest entry. The actual PPTX, PNGs and manifest are immutable content-addressed files in the isolated output root; no raw slide text enters the state journal.

```powershell
node guild_hall/tool_workshop/src/synthetic_pptx_canary.mjs --output-root <empty-isolated-directory> --artifact-root <bundled-artifact-tool-directory> --python-executable <bundled-python>
node guild_hall/tool_workshop/src/synthetic_pptx_canary.mjs --output-root <different-empty-isolated-directory> --artifact-root <bundled-artifact-tool-directory> --python-executable <bundled-python> --korean-text
python -I -S -B guild_hall/tool_workshop/tests/pptx_native_negative_test.py
python guild_hall/tool_workshop/tests/native_pptx_canary_readback.py --root <same-korean-canary-directory>
```

The native integration tests require `SOULFORGE_PPTX_TEST_CONFIG` pointing to a local JSON object with `artifactRoot`, `pythonExecutable`, `templatePath`, `templateApprovalRef`, `templateProvenance` from the trusted synthetic template setup. Run `node --test guild_hall/tool_workshop/tests/*.test.mjs` with that configuration to exercise actual authoring/rendering, restart, drift, cancellation and failure, including a four-slide Korean canary and the 20-slide/80-textbox bound. Without it, three optional runtime tests report skipped, and the remaining tests do not establish PPTX execution capability. Actual runtime paths are never committed. Rebuild a fresh canary directory after code or binding changes; preserve prior evidence. `native_pptx_canary_readback.py` additionally requires an existing or bundled `python-pptx` verification runtime, never a production runner dependency.

The pack for this capability must also include the fixed PPTX child sources and existing replacement function, and resolve the declared bundled runtime separately. The ordinary source pack does not itself contain or activate a physical Office installation.

`workshop.sqlite` is the metadata journal in the explicit local state root. `workshop.initialized` is a metadata-only presence marker: an already-open instance or retained marker prevents silently resetting a missing main DB. The marker alone cannot detect deletion of both files; restart callers must use `open_existing`. Existing databases gain the marker after successful replay, which is compatibility initialization rather than evidence of detecting earlier deletion. Only SQLite's transient `-wal`, `-shm`, and `-journal` sidecars may disappear during concurrent transactions; missing main state, input, template or approval-bound packet files are not exempted. Include the marker with a quiesced state copy. Input packets, attempts and candidate bytes stay in their separate roots. On restart reuse the same roots and pinned binding. Never infer a lease release from a missing process. After expiry, the next acquire performs fenced takeover. Preserve failed attempts for inspection; do not treat an orphan file as accepted output.

This first synthetic adapter creates no new operational state root or backup authority. Operational adoption must use the existing Path Registry, deployment and Backup/Recovery owner contracts. A quiesced copy of this synthetic state can be replayed; operational disaster recovery and live database-copy guarantees are unclaimed. The pack must include the fixed source dependency closure above and the existing writer/envelope sources before advertising this execution capability.

## Scoped bot harness

The optional [scoped Claude ACP adapter](CLAUDE_ACP_SCOPE.md) uses Buzz's existing
custom harness registration and a pinned, job-bound workspace MCP. It disables
ambient tool discovery and exposes only bounded working-text operations. Its
synthetic process tests do not establish actual Buzz registration, Claude model
execution, complete PPT tool capability or physical host isolation. The runtime
contract lists the required integration measurements and remaining queue/tool work.

## Related owners

- `docs/architecture/foundation/team_member_engineering_program/11_TOOL_WORKSHOPS_AND_JOB_SHOP.md`
- `guild_hall/agent_observation/resource_job_shop.mjs`: host/resource registry; this module owns only the workshop lease seam.
- `guild_hall/vault_revision/`: downstream revision/review/acceptance, separate from local candidate custody.
