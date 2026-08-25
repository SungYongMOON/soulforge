# 07 — Runner, replay, and tests

The runner constructs its fixture in memory and writes a single JSON result to stdout. It reads
no input files and has counters of zero for filesystem, network, model, ERP, task, approval, and
other external effects.

Tests cover all five evidence states, forbidden authority fields, Core compilation/evaluation,
identity-only Profiles, floating source revisions, unlinked affected items, accessor payloads,
related-change uncertainty, result immutability, deterministic replay, the runner, topology, and
the local manifest factory.

Run the focused test command from the package README. A deterministic pass only validates this
public-synthetic package; it does not validate project data or grant operational authority.
