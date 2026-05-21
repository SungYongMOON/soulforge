# PCB Revision Library Cell Launcher Mapping

## Soulforge Mapping

- Canon skill id: `pcb_revision_library_cell_launcher`
- Installed Codex skill name after sync: `soulforge-pcb-revision-library-cell-launcher`
- Target party id: `pcb_revision_library_cell`
- Target party canon: `.party/pcb_revision_library_cell/`
- Default party workflow: `allegro_pcb_dbdoctor_uprev_batch_v0`
- Source owner for party chain: `.party/pcb_revision_library_cell/party.yaml`
- Source owner for allowed workflow set: `.party/pcb_revision_library_cell/allowed_workflows.yaml`
- Source owner for workflow procedures and optimized execution profiles: `.workflow/<workflow_id>/`
- Source owner for local runtime bindings, project evidence, and private run truth: `_workmeta/<project_code>/`

## Workflow Set

Required workflow ids from the party:

- `allegro_pcb_dbdoctor_uprev_batch_v0`
- `allegro_pcb_dlib_export_organize_v0`

Optional workflow ids:

- `owner_decision_packet_v0`
- `post_development_review_gate_v0`

Resolve these ids against `.workflow/index.yaml`, then read each selected workflow's `workflow.yaml` and `profile_policy.yaml` at execution time.

## Profile Resolve Rule

Use workflow-owned `profile_policy.yaml` files as hints at execution time. Do not treat the launcher as the owner of model, reasoning effort, species, class, unit, tool, connector, local Cadence availability, or runtime binding decisions.

Do not copy current optimizer profile values into the launcher. Re-read the workflow-owned policies before each real run because optimizer decisions may change independently of this skill.

## Execution Behavior

The launcher should:

1. Reconstruct the user's request as a bounded PCB revision/library request.
2. Route full-chain work through `allegro_pcb_dbdoctor_uprev_batch_v0` first, then `allegro_pcb_dlib_export_organize_v0`.
3. Use DB Doctor uprev alone only when library export is explicitly out of scope.
4. Use dlib export alone only when the user provides current target boards and no revision conversion is required.
5. Stop for `owner_decision_packet_v0` when mutation scope, full-archive traversal, non-default extensions, overwrite/delete policy, rerun authority, or stronger engineering claims need owner judgment.
6. Use `post_development_review_gate_v0` before claiming a bounded development, workflow, party, or skill change is accepted.
7. Keep missing Cadence install, license, board scope, runtime path, tool log, or owner approval visible as a blocker.

## Non-Claims

The launcher does not claim:

- The party is newly authorized, renamed, or default-routed.
- A workflow is production-ready unless the workflow package and review evidence already support that label.
- Optimizer outputs are copied into the skill or enforced by the launcher.
- Species, class, model, or reasoning choices are runtime bindings beyond available execution profile and explicit run setup.
- DB Doctor conversion or dlib organization proves electrical correctness, manufacturing readiness, symbol geometry correctness, padstack engineering approval, or release acceptance.
- Project-local payloads, private evidence, raw board files, credentials, Cadence paths, logs, or runtime absolute paths are safe to store in public tracked skill files.

## Output Shape

Report:

- `Target party: pcb_revision_library_cell`
- `Launcher skill: pcb_revision_library_cell_launcher`
- `Request interpretation: ...`
- `Workflow chain checked: allegro_pcb_dbdoctor_uprev_batch_v0 -> allegro_pcb_dlib_export_organize_v0`
- `Profile resolve rule: workflow-owned profile_policy.yaml at execution time`
- `Owner decision needed: ...`
- `Installed mirror: soulforge-pcb-revision-library-cell-launcher` when sync ran
- `Validators: ...`
- `Remaining blockers: ...`

## Validation Checklist

- `SKILL.md` frontmatter has only `name` and `description`.
- `agents/openai.yaml` keeps UI metadata only and the default prompt mentions `$soulforge-pcb-revision-library-cell-launcher`.
- Public tracked files contain no raw PCB payloads, generated scripts, tool logs, secrets, private evidence, host-local absolute paths, or Cadence install paths.
- The launcher keeps party, workflow, profile policy, runtime binding, owner decision, design authority, review approval, and manufacturing/release acceptance boundaries separate.
- `npm.cmd run skills:sync -- pcb_revision_library_cell_launcher` materializes the installed mirror before claiming it can be invoked by Codex.
