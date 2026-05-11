# Fixture Queue

A fixture queue root is a directory or manifest that contains repeatable examples for workflow evolution.

## Expected Shape

Prefer a queue manifest such as:

```yaml
fixtures:
  - id: fixture_001
    input_root: fixtures/fixture_001/input
    expected_oracle: fixtures/fixture_001/oracle
    source_packets:
      - fixtures/fixture_001/source_packet.yaml
    assets:
      - fixtures/fixture_001/assets
    pass_bar: strict|usable|owner_review
    tags:
      - smoke
```

If no manifest exists, A may infer fixture folders by name, but must record the inferred ordering and stop if the shape is ambiguous.

## Isolation

For each fixture:

- Copy only allowed input files, source packets, and approved assets into the executor workspace.
- Keep oracle/reference outputs out of executor workspaces unless the mode is `goal_reconstruction` and the manifest explicitly allows reconstruction.
- Create a separate verifier workspace for oracle/reference comparison.
- Do not pass previous fixture failures into executors unless the workflow explicitly tests repair behavior.

## Fixture Status

Track:

- `queued`
- `running`
- `passed`
- `failed`
- `blocked`
- `regression_failed`
- `skipped_by_human_decision`

Every status change must include observed evidence and the next action.
