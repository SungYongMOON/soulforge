# Codex App Server Thread Isolation Report

- Lab: `codex-thread-lab-001`
- Root: `/Users/seabotmoon-air/Workspace/Soulforge/dev/experiments/tests/codex-thread-lab-001/lab_root`
- Pass: `True`
- Thread A: `019cf112-c792-7360-8b6a-9b38f4df4aac` (gpt-5.4)
- Thread B: `019cf112-c976-7a92-96dc-a66118fa30b6` (gpt-5.4)

## Checks

- thread_ids_different: `True`
- same_root_shared: `True`
- a_can_read_root: `True`
- b_can_read_root: `True`
- b_can_see_a_counter_update: `True`
- a_history_isolated: `True`
- b_history_isolated: `True`
- a_token_not_in_b_history: `True`
- b_token_not_in_a_history: `True`

## Notes

- none
