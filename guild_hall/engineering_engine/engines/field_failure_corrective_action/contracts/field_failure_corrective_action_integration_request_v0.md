# FFCA Shared Integration Request v0

- `request_state`: `pending_factory_integration`
- `domain_engine_id`: `field_failure_corrective_action`
- `Core Interface change requested`: **none**
- `shared-write owner`: Engineering Engine factory integration lane
- `claim ceiling`: `source_supported` candidate only

## Requested sequential shared-surface work

1. Import/register the FFCA evaluator adapter in the shared Core conformance suite only after
   reviewing this package's local deterministic evidence.
2. Add a root `validate:field-failure-corrective-action` script that checks the package modules
   and runs these five local test files:
   `field_failure_corrective_action.test.mjs`,
   `field_failure_corrective_action_compiler.test.mjs`,
   `field_failure_corrective_action_hostile.test.mjs`,
   `field_failure_corrective_action_runner.test.mjs`, and
   `field_failure_corrective_action_schema.test.mjs`.
3. Add the descriptor to the whole-engine manifest/topology/release generation input, then use
   the existing emitters to regenerate their generated surfaces. Do not hand-edit generated
   whole-engine files.
4. Run shared Core-domain, no-duplicate-authority, generated-manifest/topology/release, focused
   FFCA, and applicable root validation after sequential integration.

## Package evidence offered to the integration lane

- Descriptor: `engine.yaml`
- Source boundary: `contracts/field_failure_corrective_action_source_packet_v0.md`
- Contract and error model: `contracts/field_failure_corrective_action_contract_v0.md`
- Core adapters: `compiler/` and `evaluator/`
- Public-safe fixture and zero-write runner: `fixtures/` and `tools/`
- Local topology/manifest factory: `topology/`
- Deterministic tests: `tests/`

## Non-requests and hard holds

- No request to modify `core/**`, `.registry/engineering_profiles/schemas/**`, shared source
  adapters, RAG, MCP, writer routes, task creation, or approval surfaces.
- No request to promote a source, profile, quality disposition, technical change, or case
  closure.
- A shared integration reviewer must hold integration if the FFCA package would require a new
  Core semantic, a protected source body, project payload, or any authority beyond its declared
  evidence-readiness scope.
