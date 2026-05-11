# Preflight Source Survey

Use this before creating a seed workflow, building a skill, or running a workflow when source sufficiency is unknown.

## Purpose

Determine whether A can safely create or evolve a workflow from approved non-oracle evidence.

## Allowed Inputs

- user goal and constraints
- baseline artifact or safe baseline summary
- approved non-oracle source packets
- official/domain references approved by the user or project
- local library metadata approved for construction
- tool help, schemas, parsers, validators, and import/export constraints
- prior non-oracle logs and strategy ledger entries

## Forbidden Inputs In Benchmark Mode

- reference/oracle artifacts
- accepted outputs
- answer keys
- detailed V mismatch reports
- previous candidates as construction input
- oracle-derived target facts

## Survey Questions

- What artifact type is being produced?
- Is there an existing workflow or is `starting_state: no_existing_workflow`?
- Which source packets are available?
- Which source packets or assets are missing?
- Are tool readiness and roundtrip paths known?
- What seed workflow is safe to draft?
- Which verifier contract is needed?
- Can benchmark integrity be preserved?
- Should the next phase be `create_seed_workflow`, `add_source_packet`, `run_tool_readiness_or_roundtrip`, `goal_reconstruction`, or `blocked`?

## Output

Write a `SOURCE_DISCOVERY_PACKET.yaml` record before creating a seed workflow or skill when evidence is incomplete or the workflow does not yet exist.

If source evidence is insufficient, do not compensate by using oracle data in benchmark mode. Add approved non-oracle sources, switch to reconstruction with evidence reclassification, or stop for human decision.
