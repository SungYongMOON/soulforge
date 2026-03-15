# Codex App Server thread / multi-instance 설계 참고서

## 목적

- Codex App Server 를 thread 기반 lane 이나 multi-instance worker 로 설계할 때, 현재 build 계열에서 재사용 가능한 운영 기준을 정리한다.
- 이 문서는 실험 로그 모음이 아니라, artifact 로 확인된 설계 원칙, 주의점, 검증 순서를 남기는 참고서다.

## 이 문서가 다루는 범위

- long-lived app-server 1개에서 여러 thread 를 운용하는 방식
- app-server 2개 이상을 분리된 process 로 운용하는 방식
- role/style 분리, baseline, contamination, precedence, concurrency, multi-instance 비교 기준
- workflow 가 Codex App Server worker 를 오케스트레이션할 때 가져야 할 책임

## 이 문서가 다루지 않는 범위

- Codex App Server 가 native autonomous multi-agent runtime 임을 증명하는 것
- sandbox 경계의 보안적 완전성을 증명하는 것
- 특정 build 에서 관측된 결과를 모든 build 와 모든 환경으로 일반화하는 것

## 비주장 / non-claims

- 이 문서는 native autonomous multi-agent orchestration 보장 문서가 아니다.
- 이 문서는 sandbox security proof 문서가 아니다.
- baseline 성공, precedence 우세, concurrency 성공, multi-instance PASS 는 각각 해당 실험 질문에 대한 관측 결과일 뿐이다.

## 용어 정리

- **thread**: role, style, history, 평가 단위를 분리하는 기본 단위
- **history contamination**: `thread/read(includeTurns=true)` 기준으로 다른 thread 나 다른 instance 의 흔적이 history 안에 직접 섞이는 현상
- **workspace contamination**: shared file, relay note, 공용 산출물 등을 통해 다른 lane 의 정보가 간접 유입되는 현상
- **baseline**: 허용된 read/write 가 최소한 정상 동작하는 상태. security guarantee 와 같은 뜻이 아니다.
- **forbidden probe**: baseline 성공 후, 금지 경로 read/write 가 실제로 막히는지 확인하는 추가 검증
- **precedence**: 충돌하는 지시 축 사이에서 실제 출력에 더 강하게 남는 계층
- **parallel dispatch**: 여러 turn 을 짧은 간격으로 먼저 시작한 뒤 completion 을 수집하는 방식

## 현재까지 확정적으로 쓰는 설계 원칙

1. 원인분리 단계에서는 비교 축만 바꾸고 나머지는 고정한다.
   model, cwd, sandbox policy, output schema, host-side verification 을 먼저 고정해야 결과를 해석할 수 있다.

2. role 과 style 차이는 `developer instruction` 을 1차 source 로 둔다.
   현재까지의 1EA 실험에서 가장 안정적으로 차이를 만든 축은 `developer instruction` 이었다.

3. persona/style 검증과 파일 접근 검증은 분리한다.
   style 검증 중 파일 접근 문제가 섞이면 persona 결과가 오염된다.

4. 허용 작업 baseline 과 금지 경로 차단 검증은 분리한다.
   먼저 허용 read/write 가 살아나는 최소 조건을 찾고, 그다음 forbidden probe 로 경계를 본다.

5. `thread/read(includeTurns=true)` 와 host-side verification 을 같이 남긴다.
   최종 응답만으로는 history contamination, file write, indirect contamination 을 충분히 판정할 수 없다.

6. `PASS`, `FAIL`, `BLOCKED`, `INCONCLUSIVE` 를 구분한다.
   응답 미완료나 timeout 은 동작 실패가 아니라 수집 실패일 수 있다.

## 1EA thread 실험에서 관측된 것

### role / style

- persona 실험에서는 thread 별 성향 분리가 유지됐다.
- `developer instruction` 이 role/style 분리의 가장 안정적인 source 로 관측됐다.
- persona 실험에서는 strict evaluator false negative 가능성이 실제로 있었다.

### baseline / sandbox

- `includePlatformDefaults=true` 에서 `command/exec` 와 `turn/start` baseline 이 모두 살아난 run 이 있었다.
- `includePlatformDefaults=false` 는 더 나빴다.
  `command/exec` 는 signal kill, `turn/start` 는 timeout 으로 끝났다.
- 이 결과는 허용 작업 baseline 에 대한 관측이지 sandbox correctness 보장은 아니다.

### contamination

- history contamination 은 현재 build 계열에서 관측되지 않았다.
- 반대로 workspace contamination 은 실제로 관측됐다.
  shared relay 와 private leakage 는 history contamination 과 다른 축이었다.

### precedence / concurrency

- 충돌 user prompt 를 줘도 `developer instruction` 이 더 강하게 유지되는 쪽으로 관측됐다.
- 4-turn 동시 시작 실험에서는 completion 안정성, structured reply, host-side write 성공, event interleaving 관측이 있었다.

## multi-instance 실험 결과

### separate workspace 실험 요약

- `two_instance_separate_workspace_eval.json` 기준 `PASS`, `blocked=false`
- decision summary 기준 `separate_local_baseline_ok=true`
- local baseline 성공
  A/B 둘 다 completed, JSON parse 성공, local input text 일치, output file 내용 일치
- history contamination 없음
- parallel dispatch attempted, overlap_window_observed 둘 다 true
- cross-workspace probe 는 decision summary 기준 관측상 blocked

### shared workspace 실험 요약

- `two_instance_shared_workspace_eval.json` 기준 `PASS`, `blocked=false`
- shared contamination 관측
  `workspace_contamination_via_shared=true`
- private contamination blocking 실패
  `private_contamination_blocked=false`
- history contamination 없음

## 1EA vs 2EA 비교

| 항목 | 1EA thread | 2EA separate workspace | 2EA shared workspace |
| --- | --- | --- | --- |
| role/style 분리 | 관측됨 | 이번 실험 목적 아님 | 이번 실험 목적 아님 |
| local baseline | 관측됨 | 관측됨 | 관측됨 |
| history contamination | 관측 안 됨 | 관측 안 됨 | 관측 안 됨 |
| workspace contamination | shared 조건에서 관측됨 | separate 조건에서는 직접 관측 안 됨 | shared 조건에서 관측됨 |
| process 분리 효과 | 해당 없음 | event stream / failure domain 분리로 해석 가능 | process 분리만으로 shared contamination 해결 안 됨 |
| parallel dispatch | 1EA concurrency 에서 관측 | 관측 | 이번 실험 목적상 핵심 아님 |

## 왜 2EA 를 두는가

1. failure domain 분리
   한 server 의 raw log, stderr, completion 흐름을 다른 server 와 분리해서 읽을 수 있다.

2. event stream 분리
   server 별 raw message stream 이 분리되므로 해석 비용이 줄어든다.

3. history/session 경계 강화
   각 process 가 별도 thread/session 파일을 가지므로 1EA multi-thread 와는 다른 경계 해석이 가능해진다.

4. 병렬 dispatch 가능성
   separate workspace 실험에서는 두 turn 을 0.014초 차이로 dispatch 했고 overlap 도 관측됐다.

throughput 향상은 있을 수 있지만, 현재 artifact 기준 1차 이유로 확정할 수 있는 수준은 아니다.

## 현재까지 확인된 2EA 실익

- process split 의 실익은 throughput 하나가 아니라 failure domain, event stream, 해석 가능성에 있었다.
- separate workspace 실험은 process 분리 baseline 과 해석 가능성을 보여줬다.
- shared workspace 실험은 process 분리 후에도 shared contamination 이 남을 수 있음을 보여줬다.
- 이번 run 기준 `parallel_dispatch_observed=true` 였고, separate workspace 에서는 overlap 도 함께 관측됐다.
- 따라서 process 분리와 workspace 공유는 서로 다른 축임이 확인됐다.

## process split 으로도 남는 리스크

- shared workspace 를 그대로 공유하면 contamination 축은 남는다.
- history contamination 없음과 workspace contamination 없음은 같은 뜻이 아니다.
- separate workspace 결과를 sandbox correctness 보장으로 일반화하면 안 된다.

## workflow가 오케스트레이터일 때 넣어야 할 책임

1. lane 배치 책임
   어떤 작업을 어떤 thread 또는 어떤 instance 에 보낼지 workflow 가 결정해야 한다.

2. role source 분리 책임
   역할, 우선순위, 필수 섹션은 `developer instruction` 에 두고, turn 마다 바뀌는 작업 내용은 user prompt 에 둔다.

3. handoff 경로 통제 책임
   shared workspace 로 넘겨도 되는 정보와 그렇지 않은 정보를 workflow 가 분리해야 한다.

4. sandbox 배치 책임
   readableRoots, writableRoots, cwd, networkAccess 를 workflow 가 작업 성격에 맞게 정해야 한다.

5. host-side verification 책임
   structured reply 만 믿지 말고 output file, expected token, expected field 를 host 쪽에서 다시 검증해야 한다.

6. contamination 감시 책임
   history contamination 과 workspace contamination 을 별도 신호로 수집해야 한다.

7. concurrency 제어 책임
   fan-out, parallel dispatch, timeout, starvation 기준은 workflow 가 소유해야 한다.

## 여전히 미해결인 가설

1. cross-instance forbidden probe 는 아직 미해결이다.
   decision summary 는 다음 액션을 `run_cross_instance_forbidden_probe` 로 남겼다.

2. separate workspace 실험의 cross-workspace blocked 결과만으로 cross-instance forbidden semantics 를 일반화할 수는 없다.

3. 더 큰 fan-out 과 더 긴 turn 에서 2EA concurrency 안정성이 유지되는지는 미해결이다.

4. cross-instance 조건에서 precedence 가 1EA 와 다른 방식으로 흔들리는지는 미해결이다.

## 권장 검증 순서

1. 1EA baseline matrix
   `command/exec` vs `turn/start`, `includePlatformDefaults` 비교

2. 1EA role / precedence / contamination / concurrency
   persona, precedence, history contamination, workspace contamination, 1EA concurrency 를 분리해 본다.

3. 2EA separate workspace
   local baseline, history contamination, cross-workspace probe, parallel dispatch 를 확인한다.

4. 2EA shared workspace
   shared contamination 과 private contamination blocking 여부를 본다.

5. cross-instance forbidden probe
   process 분리와 workspace/sandbox 경계를 더 직접적으로 분리해서 본다.

## 결과 판정 기준

- **PASS**: 실험이 던진 질문에 답할 수 있을 만큼 응답, host verification, history 검증이 수집되고 해석이 일치한 상태
- **FAIL**: 실험은 끝까지 수행됐지만 기대한 동작과 해석이 맞지 않은 상태
- **BLOCKED**: startup failure, timeout, `turn/completed` 부재 등으로 질문 자체에 답하지 못한 상태
- **INCONCLUSIVE**: 일부 관측은 있었지만 핵심 질문에 대한 해석 근거가 아직 부족한 상태

## 권장 산출물

- raw JSON-RPC message log
- app-server stderr log
- per-turn final reply 원문
- host-side verification JSON
- 사람이 읽는 요약 보고서
- `thread/read(includeTurns=true)` 결과
- decision summary / decision report

## 적용 메모

- 이 문서는 현재 build 계열에서 확인된 1EA와 2EA 실험 결과를 합쳐 정리한 참고서다.
- 2EA 를 두는 이유는 queue 회피나 병렬성만이 아니라, failure domain 과 event stream 분리를 위한 것이다.
- 새 build 로 올라가면 baseline matrix, workspace contamination, precedence, concurrency, cross-instance forbidden probe 를 다시 확인하는 편이 안전하다.
