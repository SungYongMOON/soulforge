# Access Scope Report

- Root: `/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root`
- Thread A: `019cf123-a24c-78c1-9970-9d4e07406f59`
- Thread B: `019cf123-a2d2-7b50-84b0-f5c3228f22e3`
- Pass: `False`
- Blocked: `False`

## Sandbox Policy Summary

- A readableRoots: `['/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root/a_only', '/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root/shared']`
- A writableRoots: `['/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root/a_only', '/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root/shared']`
- B readableRoots: `['/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root/b_only', '/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root/shared']`
- B writableRoots: `['/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root/b_only', '/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root/shared']`

## Raw Final Replies

### A

```json

```

### B

```json

```

## Host Verification

- a_write_probe_exists: `False`
- a_write_probe_content_ok: `False`
- b_write_probe_exists: `False`
- b_write_probe_content_ok: `False`
- forbidden_write_from_a_exists: `False`
- forbidden_write_from_b_exists: `False`

## Result

- a_execution_failed:Timed out waiting for completion of turn 019cf123-a2e8-7de3-8c63-d67e9e9a849c
- b_execution_failed:Timed out waiting for completion of turn 019cf124-8d51-7e23-a672-e5320d4a6792
- a_write_probe_missing
- b_write_probe_missing
- a_can_read_a_failed
- a_text_mismatch
- a_can_read_shared_failed
- a_shared_text_mismatch
- a_can_write_a_failed
- b_can_read_b_failed
- b_text_mismatch
- b_can_read_shared_failed
- b_shared_text_mismatch
- b_can_write_b_failed
