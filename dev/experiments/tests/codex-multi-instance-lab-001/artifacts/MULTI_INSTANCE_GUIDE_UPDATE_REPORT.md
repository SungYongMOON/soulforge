# Multi-Instance Guide Update Report

## 읽은 artifact 목록

- `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/two_instance_separate_workspace_eval.json`
- `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/TWO_INSTANCE_SEPARATE_WORKSPACE_REPORT.md`
- `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/two_instance_shared_workspace_eval.json`
- `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/TWO_INSTANCE_SHARED_WORKSPACE_REPORT.md`
- `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/MULTI_INSTANCE_DECISION_SUMMARY.json`
- `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/MULTI_INSTANCE_DECISION_REPORT.md`

## 수정/생성한 문서 목록

- `.agent_class/docs/architecture/CODEX_APP_SERVER_MULTI_AGENT_GUIDE.md`
- `.agent_class/docs/architecture/CODEX_APP_SERVER_MULTI_INSTANCE_GUIDE.md`
- `.agent_class/docs/architecture/DEVELOPER_INSTRUCTION_TIPS.md`
- `.agent_class/docs/architecture/README.md`
- `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/MULTI_INSTANCE_GUIDE_UPDATE_REPORT.md`

## 각 문서에 반영한 핵심 결과

- `CODEX_APP_SERVER_MULTI_AGENT_GUIDE.md`
  - 1EA와 2EA를 비교 가능한 구조로 유지했다.
  - separate workspace PASS 를 process 분리 baseline 과 해석 가능성으로 정리했다.
  - shared workspace 결과를 process 분리 후에도 shared contamination 이 남는 관측으로 정리했다.
  - `parallel_dispatch_observed=true`, `history contamination 없음`, `shared contamination 관측`, `private contamination blocking 실패`를 현재 build 기준 관측으로 남겼다.
  - `run_cross_instance_forbidden_probe` 를 후속 실험으로 유지했다.

- `CODEX_APP_SERVER_MULTI_INSTANCE_GUIDE.md`
  - 2EA 전용 참고서로 separate/shared 결과와 1EA vs 2EA 비교를 유지했다.
  - process split 의 실익을 throughput 과 분리해 failure domain, event stream, history/session 경계, 병렬 dispatch 가능성으로 정리했다.
  - separate workspace 결과를 sandbox correctness 보장으로 일반화하지 않는다는 점을 유지했다.

- `DEVELOPER_INSTRUCTION_TIPS.md`
  - process 분리와 role/style 분리는 다른 축이라는 점을 유지했다.
  - role/style source 는 여전히 `developer instruction` 중심 설계로 보는 편이 맞다는 관측을 유지했다.
  - precedence, contamination, concurrency 를 분리 검증해야 한다는 팁을 유지했다.

- `README.md`
  - architecture 문서 목록에서 multi-agent guide, multi-instance guide, developer instruction tips 연결 상태를 유지했다.

## 미해결로 남긴 항목

- separate workspace 실험의 cross-workspace blocked 결과만으로 cross-instance forbidden semantics 를 일반화할 수는 없다.
- process 분리 후에도 shared workspace contamination 이 남는다는 관측은 있었지만, cross-instance forbidden probe 로 경계를 더 직접적으로 다시 봐야 한다.
- 더 큰 fan-out 과 더 긴 turn 에서 2EA concurrency 안정성이 유지되는지는 추가 검증이 필요하다.
- cross-instance 조건에서 precedence 가 1EA 와 다르게 흔들리는지는 아직 미해결이다.

## 다음 권장 실험

- `run_cross_instance_forbidden_probe`

이유:
- decision summary 기준 `next_action=run_cross_instance_forbidden_probe` 였다.
- 현재 결과만으로도 가이드 갱신은 가능하지만, process 분리 효과와 workspace/sandbox 경계를 더 직접적으로 분리하려면 이 실험이 다음 순서로 적합하다.

## git 반영 결과

- 문서 수위는 artifact 로 확인된 범위 안에서만 유지했다.
- 이번 작업은 harness 코드 수정 없이 문서와 보고서 정리만 수행했다.
- git 반영 결과는 커밋, push, main merge 이후 최종 상태로 갱신한다.
