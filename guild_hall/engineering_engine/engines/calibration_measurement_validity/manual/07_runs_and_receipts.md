# 07 — Runs and receipts

The public-synthetic runner accepts no arguments and prints one JSON result. Its receipt always declares zero network calls, file reads, file writes, and external mutations.

The focused test executes it twice in a temporary empty directory, asserts byte-stable stdout, and asserts that the caller directory remains empty. The same test checks no caller input mutation, deep-frozen output, deterministic Core execution, hostile input rejection, and all primary outcome states.

This proof is only public-synthetic. It does not report a real calibration/test run or a private zero-write replay.

The Q1 pilot additionally compiles a synthetic source-bound Profile, adapts source-bound Typed Facts, calls the Core seam, derives observation candidates and guidance, and emits one stable public-synthetic JSON record. It remains a no-file-read/no-file-write/no-network proof, not a real project pilot.

The pilot's synthetic-direct source bindings are accepted only with the fixture's exact synthetic project-binding reference and canonical test/known timestamps. Reusing them for a live-like project request is rejected before source-bound evaluation.
