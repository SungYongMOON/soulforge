# Codex App Server multi-instance 설계 참고서

## 목적

- 2EA 이상 Codex App Server 를 별도 process 로 운영할 때, 현재 build 계열에서 확인된 설계 기준을 별도 문서로 정리한다.
- 이 문서는 multi-instance 결과를 1EA thread 가이드와 비교 가능한 형태로 읽기 쉽게 정리하는 참고서다.

## 이 문서가 다루는 범위

- 2EA separate workspace 실험
- 2EA shared workspace 실험
- process split 의 실익
- process split 이후에도 남는 shared workspace 리스크
- 다음 권장 실험 축

## 비주장 / non-claims

- 이 문서는 native autonomous multi-agent orchestration 보장 문서가 아니다.
- 이 문서는 sandbox security proof 문서가 아니다.
- separate workspace PASS 는 process split baseline 과 해석 가능성을 보여주는 결과이지, 경계 correctness 를 일반화하는 결과가 아니다.

## 왜 2EA app-server 를 두는가

1. failure domain 분리
   server A/B raw log 와 stderr 를 독립적으로 읽을 수 있다.

2. event stream 분리
   server 별 event stream 이 분리되어 completion 흐름과 오류 해석이 쉬워진다.

3. history/session 경계 강화
   각 process 가 별도 thread/session 파일을 가지므로 history 해석 축이 더 선명해진다.

4. 병렬 dispatch 가능성
   separate workspace 실험에서는 실제로 짧은 간격 dispatch 와 overlap 이 관측됐다.

throughput 향상은 있을 수 있지만, 현재 artifact 기준 1차 실익으로 과장하면 안 된다.

## separate workspace 실험에서 관측된 것

- `separate_workspace_result = PASS`
- `separate_local_baseline_ok = true`
- `history contamination 없음`
- `parallel dispatch / overlap 관측`
- cross-workspace probe 는 decision summary 기준 관측상 blocked

해석:
- process 분리 baseline 은 이번 run 기준 현재 build 에서 해석 가능했다.
- 두 server / 두 workspace 조합은 local read/write, reply, host-side verification 을 안정적으로 분리해서 읽는 데 도움이 됐다.

## shared workspace 실험에서 관측된 것

- `shared_workspace_result = PASS`
- `shared_workspace_contamination_via_shared = true`
- `shared_private_contamination_blocked = false`
- `history contamination 없음`

해석:
- process 를 둘로 나눠도 shared workspace relay 는 contamination 경로로 남을 수 있다.
- shared contamination 과 private leakage 는 process split 만으로 자동 해결되지 않았다.

## 1EA vs 2EA 비교

| 축 | 1EA | 2EA separate workspace | 2EA shared workspace |
| --- | --- | --- | --- |
| baseline | 관측됨 | 관측됨 | 관측됨 |
| history contamination | 관측 안 됨 | 관측 안 됨 | 관측 안 됨 |
| workspace contamination | shared 조건에서 관측됨 | 직접 관측 안 됨 | shared 조건에서 관측됨 |
| event stream 해석 | thread 단위 | process 단위로 더 분리 | process 단위 분리지만 shared contamination 은 남음 |
| parallel dispatch | 1EA concurrency 실험에서 관측 | 관측 | 이번 실험 목적상 핵심 아님 |

## process split 의 실익

- throughput 자체보다 failure domain 분리
- raw log / stderr / completion 흐름 분리
- history/session 경계 강화
- 병렬 dispatch 를 더 해석하기 쉬운 구조

## process split 으로도 남는 리스크

- shared workspace contamination
- private contamination blocking 실패 가능성
- separate workspace 결과를 sandbox correctness 보장으로 일반화할 수 없음

## 아직 미해결인 가설

1. `run_cross_instance_forbidden_probe`
   현재 decision summary 가 다음 액션으로 지정한 축이다.

2. 더 큰 fan-out 과 더 긴 turn 에서 2EA concurrency 안정성이 유지되는지

3. cross-instance precedence 가 1EA 와 다른 방식으로 흔들리는지

## 다음 권장 실험

- `run_cross_instance_forbidden_probe`

이유:
- 현재 결과만으로도 가이드 갱신은 충분하지만, cross-instance 환경에서 forbidden probe 를 더 직접적으로 보면 process split 효과와 workspace/sandbox 경계를 더 선명하게 분리할 수 있다.

## 적용 메모

- `MULTI_INSTANCE_DECISION_SUMMARY.json` 기준 `mergeable_guide_update = true` 이므로, 이 문서는 현재 build 계열 참고서로 main 에 반영 가능하다.
- 다만 `next_action = run_cross_instance_forbidden_probe` 이므로, 미해결 항목을 닫았다고 쓰면 안 된다.
