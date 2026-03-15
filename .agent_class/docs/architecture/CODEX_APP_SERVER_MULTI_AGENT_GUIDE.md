# Codex App Server 멀티에이전트 설계 참고서

## 목적

- Codex App Server 위에서 여러 agent 를 thread 단위로 나눠 설계할 때, 바로 참고할 수 있는 운영 기준을 정리한다.
- 실험 로그를 그대로 나열하지 않고, 실제 관측으로 확인된 설계 원칙과 주의점을 문서 형태로 남긴다.

## 이 문서가 다루는 범위

- long-lived app-server 1개를 기준으로 여러 thread 를 운용하는 방식
- thread 별 role, style, developer instruction 분리
- `command/exec`, `turn/start`, `thread/read` 를 써서 baseline 과 원인분리를 확인하는 방식
- sandbox policy 와 `includePlatformDefaults` 가 허용 read/write 에 주는 영향

## 기본 권장 구조

1. app-server 프로세스는 가능하면 1개만 길게 유지한다.
   여러 실험이나 여러 agent 를 비교할 때 프로세스 수까지 바꾸면 원인분리가 어려워진다.
2. agent 는 thread 단위로 분리한다.
   role, style, history, 평가 단위를 thread 기준으로 두는 편이 가장 해석하기 쉽다.
3. thread 이름을 명시적으로 붙인다.
   raw log, report, `thread/read` 결과를 볼 때 식별 비용이 크게 줄어든다.
4. 비교 실험에서는 model, cwd, sandbox policy 를 먼저 고정한다.
   차이를 만들고 싶은 축만 바꿔야 결과를 해석할 수 있다.
5. 구조화된 응답이 필요하면 `outputSchema` 를 같이 건다.
   agent 응답을 나중에 규칙 기반으로 판정할 때 안정성이 높아진다.

## role 과 성향 분리 원칙

1. thread 별 성향 차이는 `developer instruction` 을 1차 source 로 둔다.
   현재 관측 기준에서는 role/style 차이를 안정적으로 만든 것은 `developer instruction` 이었다.
2. 공통 task prompt 는 thread 간 동일하게 유지한다.
   그래야 응답 차이를 role 차이로 읽을 수 있다.
3. 성향 검증용 prompt 와 파일 접근 검증용 prompt 는 분리한다.
   style 검증 중에 파일 읽기 문제나 shell startup 문제가 섞이면 결과가 오염된다.
4. 멀티턴 일관성을 보려면 최소 3단계로 본다.
   초기 응답, 충돌 prompt, follow-up 을 나눠야 baseline 재현과 저항성을 같이 볼 수 있다.
5. `thread/read(includeTurns=true)` 를 반드시 남긴다.
   cross-contamination, 자기 tag 유지, history 경계 확인은 최종 응답만으로는 부족하다.

## `command/exec` 와 `turn/start` 를 구분해서 써야 하는 이유

1. `command/exec` 는 shell/command 실행 baseline 확인용이다.
   허용 경로 read/write 가 shell 레벨에서 살아 있는지 먼저 보는 데 적합하다.
2. `turn/start` 는 agent/tool loop 전체 확인용이다.
   reasoning, 내부 shell startup, file change, 최종 응답까지 모두 포함한 end-to-end 확인에 가깝다.
3. 둘을 같은 케이스로 취급하면 안 된다.
   `command/exec` 성공이 `turn/start` 성공을 보장하지 않고, 반대도 자동으로 성립하지 않는다.
4. access-scope 문제를 보면 두 레이어를 같은 cwd, 같은 roots 에서 짝으로 비교한다.
   그래야 어느 계층에서 먼저 죽는지 좁힐 수 있다.

## sandbox 설계 시 주의점

1. 허용 작업 baseline 과 금지 경로 차단 검증을 분리한다.
   먼저 허용 read/write 가 살아나는 최소 조건을 찾고, 그 다음 forbidden probe 로 경계를 본다.
2. baseline 성공만으로 sandbox 가 안전하다고 결론 내리면 안 된다.
   허용 작업이 살아난 조합이 forbidden read 도 허용할 수 있다.
3. `includePlatformDefaults` 는 단순 부가 옵션이 아니라 동작 생존 조건일 수 있다.
   현재 관측에서는 `includePlatformDefaults=true` 에서만 허용 read/write baseline 이 안정적으로 살아났다.
4. 엄격 sandbox 에서 실패가 나면 한 bucket 으로 뭉개지 말고 형태를 나눠 기록한다.
   예: `killed by a signal`, `turn timeout`, `turn/completed 없음`, `json parse 실패`
5. writableRoots 는 가능한 한 좁게 둔다.
   turn 내부 agent/tool loop 는 prompt 에 직접 쓰지 않은 추가 명령이나 file change 를 시도할 수 있다.

## 현재 build 계열에서 특히 조심할 점

1. `includePlatformDefaults=false` 는 허용 작업까지 같이 죽일 수 있다.
   현재 관측에서는 shared-only sandbox 에서 `command/exec` 가 signal kill 로 실패했고, `turn/start` 는 timeout 으로 끝났다.
2. `turn/start` 내부에서는 prompt 보다 더 많은 동작이 일어날 수 있다.
   reasoning, unified exec startup, file change, diff 갱신이 연속으로 일어날 수 있으므로 raw log 를 함께 봐야 한다.
3. 파일을 읽으라는 지시가 turn 내부 shell startup 문제를 유발할 수 있다.
   style 검증이나 persona 검증에서는 scenario 본문을 prompt 에 직접 넣는 편이 더 안정적일 수 있다.
4. `FAIL` 과 `BLOCKED` 는 분리해서 기록해야 한다.
   응답 미완료나 timeout 은 role failure 가 아니라 실행 계층 문제일 수 있다.

## 권장 검증 순서

1. host-side preflight
   fixture 파일, cwd, expected path, writable path 를 먼저 확인한다.
2. `command/exec` baseline
   허용 read/write 가 shell 레벨에서 되는지 본다.
3. `turn/start` baseline
   같은 roots 와 cwd 에서 agent/tool loop 가 끝까지 완료되는지 본다.
4. structured reply 검증
   JSON parse, expected fields, host-side write 결과를 함께 확인한다.
5. forbidden probe
   baseline 성공 후에만 금지 경로 read/write 가 막히는지 본다.
6. history 검증
   multi-agent 설계라면 `thread/read(includeTurns=true)` 로 contamination 과 맥락 유지 여부를 확인한다.

## 결과 해석 기준

1. `command/exec` 와 `turn/start` 가 둘 다 성공하면 baseline 은 살아 있는 것이다.
   다만 경계 보장은 forbidden probe 를 따로 봐야 한다.
2. `command/exec` 는 성공하는데 `turn/start` 만 실패하면 turn layer 문제를 먼저 의심한다.
3. `includePlatformDefaults=true` 는 성공하고 `false` 는 더 나쁘면 `includePlatformDefaults` gate 가능성을 우선 본다.
4. `command/exec + includePlatformDefaults=true` 조차 실패하면 더 일반적인 sandbox 또는 harness 문제부터 본다.
5. fixture, cwd, path 자체가 어긋났으면 원인분리보다 harness/path 문제를 먼저 닫는다.

## 권장 산출물

- raw JSON-RPC message log
- app-server stderr log
- per-case final reply 원문
- host-side verification JSON
- 사람이 읽는 요약 보고서
- multi-agent 인 경우 `thread/read(includeTurns=true)` 결과

## 설계 메모

- 이 문서는 Codex App Server 멀티에이전트 설계용 참고서다.
- 실험별 상세 결과는 `DEVELOPER_INSTRUCTION_TIPS.md` 와 lab artifact 를 보고, 실제 설계 시에는 이 문서의 원칙을 먼저 적용한다.
- 새 build 로 올라가면 가장 먼저 baseline matrix 와 forbidden probe 를 다시 확인하는 편이 안전하다.
