# Codex App Server thread 기반 멀티에이전트 유사 설계 참고서

## 목적

- Codex App Server 위에서 여러 thread 를 agent-like lane 으로 나눠 설계할 때, 바로 참고할 수 있는 운영 기준을 정리한다.
- 이 문서는 실험 로그 원문을 나열하는 문서가 아니라, 실험을 통해 확인된 설계 원칙, 주의점, 검증 순서를 남기는 참고서다.
- 이 문서는 native autonomous multi-agent orchestration 보장 문서가 아니며, sandbox security proof 문서도 아니다.

## 이 문서가 다루는 범위

- long-lived app-server 1개를 기준으로 여러 thread 를 운용하는 방식
- thread 별 role, style, developer instruction 분리
- `command/exec`, `turn/start`, `thread/read` 를 써서 baseline 과 원인분리를 확인하는 방식
- sandbox policy 와 `includePlatformDefaults` 가 허용 read/write baseline 에 주는 영향
- multi-thread 설계에서 contamination 을 어디서 확인해야 하는지에 대한 기준

## 이 문서가 다루지 않는 범위

- Codex App Server 가 native autonomous multi-agent runtime 임을 증명하는 것
- sandbox 경계의 보안적 완전성을 증명하는 것
- 특정 build 에서 관측된 결과를 모든 build 와 모든 환경에 일반화하는 것

## 용어 정리

- **thread**: role, style, history, 평가 단위를 분리하는 기본 단위
- **history contamination**: `thread/read(includeTurns=true)` 기준으로 다른 thread 의 tag, 구조, 지시가 섞이는 현상
- **workspace contamination**: shared file, 공용 산출물, relay note 등을 통해 다른 thread 의 정보가 간접 유입되는 현상
- **baseline**: 허용된 read/write 가 최소한 정상 동작하는 상태. security proof 와 같은 의미는 아니다.
- **forbidden probe**: baseline 성공 후, 금지 경로 read/write 가 실제로 막히는지 확인하는 추가 검증

## 현재까지 확정적으로 쓰는 설계 원칙

1. app-server 프로세스는 실험과 원인분리 단계에서는 가능하면 1개만 길게 유지한다.
   여러 실험이나 여러 agent 를 비교할 때 프로세스 수까지 바꾸면 원인분리가 어려워진다.

2. agent 는 thread 단위로 분리한다.
   role, style, history, 평가 단위를 thread 기준으로 두는 편이 가장 해석하기 쉽다.

3. thread 이름을 명시적으로 붙인다.
   raw log, report, `thread/read` 결과를 볼 때 식별 비용이 크게 줄어든다.

4. 비교 실험에서는 model, cwd, sandbox policy 를 먼저 고정한다.
   차이를 만들고 싶은 축만 바꿔야 결과를 해석할 수 있다.

5. 구조화된 응답이 필요하면 `outputSchema` 를 같이 건다.
   agent 응답을 나중에 규칙 기반으로 판정할 때 parsing 과 비교 안정성이 높아진다.

6. role 과 style 차이는 thread 별 `developer instruction` 을 1차 source 로 둔다.
   공통 task prompt 는 thread 간 동일하게 유지해야 role 차이를 해석하기 쉽다.

7. persona 검증용 prompt 와 파일 접근 검증용 prompt 는 분리한다.
   style 검증 중에 파일 읽기 문제나 shell startup 문제가 섞이면 결과가 오염된다.

8. multi-thread 설계라면 `thread/read(includeTurns=true)` 를 반드시 남긴다.
   최종 응답만으로는 history 경계와 contamination 여부를 충분히 볼 수 없다.

## 현재 build 계열에서 관측된 항목

1. thread 별 성향 차이를 안정적으로 만든 것은 `developer instruction` 이었다.
   현재 관측 기준에서는 model 이 아니라 `developer instruction` 이 role/style 차이의 authoritative source 로 동작했다.

2. 같은 user prompt 여도 thread 별 고정 구조는 대부분 유지됐다.
   전략가형은 계획과 위험, 실행가형은 `실행:`, 검토자형은 `실패모드:` 와 `검증:`, 탐색가형은 `대안 1/2/3` 과 `추천:` 구조를 반복해서 유지했다.

3. 충돌 prompt 가 있어도 `developer instruction` 은 쉽게 무너지지 않았다.
   다만 evaluator 를 너무 빡빡하게 만들면 false negative 가 날 수 있다.

4. 멀티턴에서도 thread 별 스타일 일관성이 유지됐다.
   follow-up turn 에서도 초기 구조적 성향이 이어지는 경향이 관측됐다.

5. `includePlatformDefaults` 는 단순 부가 옵션이 아니라 baseline 생존 조건 후보일 수 있다.
   현재 관측에서는 `includePlatformDefaults=true` 에서만 허용 read/write baseline 이 안정적으로 살아났다.

## 아직 미해결인 가설

1. `includePlatformDefaults=true` 상태에서도 forbidden read/write 가 정확히 차단되는지는 아직 별도 검증이 더 필요하다.

2. `command/exec` 와 `turn/start` 는 같은 cwd, 같은 roots 에서도 서로 다른 방식으로 실패할 수 있다.
   따라서 baseline 성공 여부와 sandbox 경계 보장은 항상 레이어별로 분리해서 봐야 한다.

3. history contamination 이 없어도 workspace contamination 은 발생할 수 있다.
   shared file, relay note, 공용 산출물은 별도의 contamination 경로다.

4. `developer instruction`, `base instructions`, user prompt, `turn/start` override, `personality`, `collaboration mode` 사이의 정확한 우선순위는 아직 별도 precedence 실험이 필요하다.

5. 여러 thread 를 동시에 turn 실행했을 때의 event interleaving, starvation, completion 안정성은 별도 동시성 실험이 필요하다.

## role 과 성향 분리 원칙

1. thread 별 성향 차이는 `developer instruction` 을 1차 source 로 둔다.
   현재 관측 기준에서는 role/style 차이를 안정적으로 만든 것은 `developer instruction` 이었다.

2. 공통 task prompt 는 thread 간 동일하게 유지한다.
   그래야 응답 차이를 role 차이로 읽을 수 있다.

3. 멀티턴 일관성을 보려면 최소 3단계로 본다.
   초기 응답, 충돌 prompt, follow-up 을 나눠야 baseline 재현, 저항성, 일관성을 같이 볼 수 있다.

4. persona 검증에서는 외부 파일 읽기 의존을 최소화한다.
   공통 scenario 는 가능하면 prompt 에 직접 주입하고, 파일 I/O 검증은 별도 실험으로 분리한다.

5. history 검증을 함께 남긴다.
   per-round 원문뿐 아니라 `thread/read(includeTurns=true)` 결과까지 저장해야 contamination 여부를 확인할 수 있다.

## `command/exec` 와 `turn/start` 를 구분해서 써야 하는 이유

1. `command/exec` 는 shell/command 실행 baseline 확인용이다.
   허용 경로 read/write 가 shell 레벨에서 살아 있는지 먼저 보는 데 적합하다.

2. `turn/start` 는 agent/tool loop 전체 확인용이다.
   reasoning, 내부 shell startup, file change, 최종 응답까지 모두 포함한 end-to-end 확인에 가깝다.

3. 둘을 같은 케이스로 취급하면 안 된다.
   `command/exec` 성공이 `turn/start` 성공을 보장하지 않고, 반대도 자동으로 성립하지 않는다.

4. access-scope 문제를 볼 때는 두 레이어를 같은 cwd, 같은 roots 에서 짝으로 비교한다.
   그래야 어느 계층에서 먼저 죽는지 좁힐 수 있다.

## sandbox 설계 시 주의점

1. 허용 작업 baseline 과 금지 경로 차단 검증을 분리한다.
   먼저 허용 read/write 가 살아나는 최소 조건을 찾고, 그 다음 forbidden probe 로 경계를 본다.

2. baseline 성공만으로 sandbox 가 안전하다고 결론 내리면 안 된다.
   허용 작업이 살아난 조합이 forbidden read 도 허용할 수 있다.

3. 엄격 sandbox 에서 실패가 나면 한 bucket 으로 뭉개지 말고 형태를 나눠 기록한다.
   예: `signal kill`, `turn timeout`, `turn/completed 없음`, `json parse 실패`, `structured reply 없음`

4. writableRoots 는 가능한 한 좁게 둔다.
   turn 내부 agent/tool loop 는 prompt 에 직접 쓰지 않은 추가 동작을 시도할 수 있다.

5. history contamination 과 workspace contamination 을 분리해서 본다.
   `thread/read` 가 깨끗해도 shared file 을 통한 정보 유입은 여전히 생길 수 있다.

## 현재 build 계열에서 특히 조심할 점

1. `includePlatformDefaults=false` 는 허용 작업까지 같이 죽일 수 있다.
   현재 관측에서는 shared-only sandbox 에서 `command/exec` 는 signal kill, `turn/start` 는 timeout 형태로 더 나쁘게 끝났다.

2. `turn/start` 내부에서는 prompt 보다 더 많은 동작이 일어날 수 있다.
   reasoning, 내부 command startup, file change, diff 갱신이 이어질 수 있으므로 raw log 를 함께 봐야 한다.

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
   multi-thread 설계라면 `thread/read(includeTurns=true)` 로 contamination 과 맥락 유지 여부를 확인한다.

7. workspace contamination 검증  
   shared file 을 통한 간접 오염이 있는지, private file 과 구분해서 본다.

## 결과 판정 기준

- **PASS**: 실험이 던진 질문에 답할 수 있을 만큼 baseline, 응답, host verification 이 모두 수집되고, 기대한 결과와 해석이 일치한 상태
- **FAIL**: 실험은 끝까지 수행됐지만 기대한 동작이 일치하지 않은 상태
- **BLOCKED**: startup failure, timeout, `turn/completed` 부재, signal kill 등으로 실험 질문 자체에 답하지 못한 상태
- **INCONCLUSIVE**: baseline 은 일부 살아 있지만, 경계 보장 여부처럼 핵심 질문에 대한 해석 근거가 아직 부족한 상태

## 권장 산출물

- raw JSON-RPC message log
- app-server stderr log
- per-case final reply 원문
- host-side verification JSON
- 사람이 읽는 요약 보고서
- multi-thread 인 경우 `thread/read(includeTurns=true)` 결과
- contamination 검증인 경우 shared/private file 상태 기록

## 언제 다시 검증해야 하나

- build 가 바뀌었을 때
- sandbox 관련 구현이 바뀌었을 때
- model/approval/sandbox defaults 가 바뀌었을 때
- `developer instruction` 대신 다른 제어 축을 role source 로 쓰려 할 때
- shared workspace 를 이용한 relay/handoff 구조를 실제 운영에 넣으려 할 때

## 적용 메모

- 이 문서는 Codex App Server 위에서 thread 기반 멀티에이전트 유사 설계를 할 때의 참고서다.
- 상세 실험 결과는 `DEVELOPER_INSTRUCTION_TIPS.md` 와 lab artifact 를 보고, 실제 설계 시에는 이 문서의 검증 순서와 주의점을 먼저 적용한다.
- 새 build 로 올라가면 가장 먼저 baseline matrix, forbidden probe, workspace contamination 을 다시 확인하는 편이 안전하다.
