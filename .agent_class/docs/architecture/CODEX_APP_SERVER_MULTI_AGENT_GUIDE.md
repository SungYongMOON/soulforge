# Codex App Server thread 기반 멀티-thread agent 설계 참고서

## 목적

- Codex App Server 위에서 여러 thread 를 agent-like lane 으로 나눠 설계할 때, 현재 build 계열에서 재사용 가능한 운영 기준을 정리한다.
- 이 문서는 실험 로그 원문 모음이 아니라, artifact 로 확인된 설계 원칙, 주의점, 검증 순서를 남기는 참고서다.

## 이 문서가 다루는 범위

- long-lived app-server 1개를 기준으로 여러 thread 를 운용하는 방식
- thread 별 role, style, developer instruction 분리
- `command/exec`, `turn/start`, `thread/read` 로 baseline 과 원인분리를 확인하는 방식
- sandbox policy 와 `includePlatformDefaults` 가 허용 read/write baseline 에 주는 영향
- history contamination, workspace contamination, precedence, concurrency 를 어디서 어떻게 확인하는지에 대한 기준

## 이 문서가 다루지 않는 범위

- Codex App Server 가 native autonomous multi-agent runtime 임을 증명하는 것
- sandbox 경계의 보안적 완전성을 증명하는 것
- 특정 build 에서 관측된 결과를 모든 build, 모든 환경으로 일반화하는 것

## 비주장 / non-claims

- 이 문서는 native autonomous multi-agent orchestration 보장 문서가 아니다.
- 이 문서는 sandbox security proof 문서가 아니다.
- 이 문서는 현재 build 계열과 현재 harness 기준의 설계 참고서다.
- baseline 성공, precedence 우세, concurrency 성공은 각각 해당 실험 질문에 대한 관측 결과일 뿐이며, 다른 축까지 자동으로 보장하지 않는다.

## 용어 정리

- **thread**: role, style, history, 평가 단위를 분리하는 기본 단위
- **history contamination**: `thread/read(includeTurns=true)` 기준으로 다른 thread 의 tag, 구조, 지시가 history 안에 직접 섞이는 현상
- **workspace contamination**: shared file, relay note, 공용 산출물 등을 통해 다른 thread 의 정보가 간접 유입되는 현상
- **baseline**: 허용된 read/write 가 최소한 정상 동작하는 상태. security guarantee 와 같은 뜻이 아니다.
- **forbidden probe**: baseline 성공 후, 금지 경로 read/write 가 실제로 막히는지 확인하는 추가 검증
- **precedence**: 충돌하는 지시 축 사이에서 실제 출력에 더 강하게 남는 지시 계층
- **event interleaving**: completion 전 단계에서 여러 turn 의 event 가 서로 섞여 도착하는 현상
- **starvation**: 일부 turn 만 현저히 늦게 끝나거나 timeout 나고, 다른 turn 은 먼저 정상 완료되는 상태

## 현재까지 확정적으로 쓰는 설계 원칙

1. app-server 프로세스는 원인분리 단계에서는 가능하면 1개만 길게 유지한다.
   실험마다 프로세스 수도 같이 바꾸면 원인분리가 어려워진다.

2. agent-like lane 은 thread 단위로 분리한다.
   role, style, history, 평가 단위를 thread 기준으로 두는 편이 가장 해석하기 쉽다.

3. thread 이름을 명시적으로 붙인다.
   raw log, report, `thread/read` 결과를 읽을 때 식별 비용이 크게 줄어든다.

4. 비교 실험에서는 model, cwd, sandbox policy 를 먼저 고정한다.
   차이를 만들고 싶은 축만 바꿔야 결과를 해석할 수 있다.

5. role 과 style 차이는 thread 별 `developer instruction` 을 1차 source 로 둔다.
   현재까지의 실험에서 가장 안정적으로 차이를 만든 축은 `developer instruction` 이었다.

6. 구조화된 응답 비교가 필요하면 `outputSchema` 를 같이 건다.
   structured reply parsing 과 host-side verification 을 더 안정적으로 할 수 있다.

7. persona/style 검증과 파일 접근 검증은 분리한다.
   style 검증 중 파일 접근 문제가 섞이면 persona 결과가 오염된다.

8. multi-thread 설계라면 `thread/read(includeTurns=true)` 를 반드시 남긴다.
   최종 응답만으로는 history contamination 여부를 충분히 볼 수 없다.

9. 허용 작업 baseline 과 금지 경로 차단 검증을 분리한다.
   먼저 허용 read/write 가 살아나는 최소 조건을 찾고, 그다음 forbidden probe 로 경계를 본다.

10. `PASS`, `FAIL`, `BLOCKED`, `INCONCLUSIVE` 를 분리한다.
   응답 미완료나 timeout 은 동작 실패가 아니라 수집 실패일 수 있다.

## workflow가 오케스트레이터일 때 넣어야 할 책임

1. lane 배치 책임
   어떤 작업을 어떤 thread 에 보낼지, 어떤 thread 를 새로 만들지, 어떤 thread 를 재사용할지 workflow 가 결정해야 한다.

2. role source 분리 책임
   안정적으로 유지되어야 하는 역할, 우선순위, 필수 섹션은 `developer instruction` 에 두고, 이번 turn 에만 바뀌는 작업 내용은 user prompt 에 둔다.
   현재 precedence 실험에서는 이 분리가 가장 안정적으로 동작했다.

3. 입력 계약 책임
   worker 에 넘기는 prompt, output schema, 기대 산출물, 기대 파일 경로를 workflow 가 명시해야 한다.
   Codex App Server 는 worker/runtime 이지, 상위 작업 계약을 스스로 설계해 주는 계층은 아니다.

4. handoff 경로 통제 책임
   어떤 정보가 history 로만 가야 하는지, 어떤 정보가 artifact ref 로 가야 하는지, 어떤 정보는 shared workspace 로 보내면 안 되는지 workflow 가 정해야 한다.
   현재 workspace contamination 실험에서는 shared relay 경로가 실제 오염 경로가 될 수 있음을 보였다.

5. sandbox 배치 책임
   thread 또는 turn 별 readableRoots, writableRoots, cwd, networkAccess 를 workflow 가 작업 성격에 맞게 정해야 한다.
   baseline 성공과 경계 보장은 별개였으므로, 허용 작업 성공만 보고 안전하다고 판단하면 안 된다.

6. 상태기계 책임
   `queued / running / completed / failed / blocked / retrying` 같은 상위 상태는 workflow 가 가져가야 한다.
   app-server turn 완료 여부만으로는 handoff, 재시도, 후속 단계 조건을 충분히 표현하지 못한다.

7. timeout / retry 책임
   turn timeout, partial completion, `thread/read` 복구, 재시도 기준은 workflow 가 소유해야 한다.
   현재 실험에서도 response 수집과 evaluator 해석은 상위 harness 가 맡아야 했다.

8. host-side verification 책임
   structured reply 만 믿지 말고, output file, artifact, expected token, expected field 를 host 쪽에서 다시 검증해야 한다.
   현재 baseline, workspace, concurrency 실험은 모두 host-side verification 을 같이 두었을 때 해석이 안정적이었다.

9. contamination 감시 책임
   workflow 는 history contamination 과 workspace contamination 을 별도 신호로 수집해야 한다.
   history 가 깨끗해도 shared workspace 를 통한 간접 오염은 발생할 수 있다.

10. concurrency 제어 책임
   fan-out 개수, 동시 turn 시작 방식, turn id 추적, event interleaving 허용 범위, starvation 기준은 workflow 가 소유해야 한다.
   현재 concurrency 실험은 4-turn 동시 시작까지는 안정적이었지만, 더 큰 병렬성은 아직 workflow 차원에서 제한을 두는 편이 안전하다.

11. 감사 추적 책임
   raw event log, stderr, final reply, `thread/read`, host-side verification 결과를 workflow 가 묶어서 남겨야 한다.
   그래야 `FAIL` 과 `BLOCKED`, evaluator false negative, precedence 오판을 나중에 분리할 수 있다.

## 현재 build 계열에서 관측된 항목

### A. persona 실험

- `persona_eval.json` 기준으로 성향 분리는 대체로 유지됐다.
- 4-agent, 3-round 구성에서 AGENT-1, 3, 4 는 전 round 통과했고, AGENT-2 는 Round 2 한 항목만 실패했다.
- `cross_contamination_found=false` 였다.
- `PERSONA_EXPERIMENT_REPORT.md` 는 AGENT-2 Round 2 실패를 `missing_builder_structure` 로 기록했지만, 실제 응답은 `AGENT-2 / BUILDER` 와 `실행:` 구조를 유지하고 있었다. 즉 strict evaluator false negative 가능성이 실제로 있었다.
- report 는 재시도에서 scenario 파일 읽기 대신 prompt 직접 주입으로 바꿨다고 기록한다. persona 검증과 파일 접근 검증은 분리하는 편이 안전하다는 근거로 볼 수 있다.

### B. exec/turn baseline matrix

- `exec_turn_baseline_matrix.json` 기준으로 `includePlatformDefaults=true` 에서는 `command/exec` 와 `turn/start` 모두 shared-only 허용 read/write baseline 이 성공했다.
- 같은 실험에서 `includePlatformDefaults=false` 는 더 나빴다.
  - `command/exec`: `sandbox error: command was killed by a signal`
  - `turn/start`: timeout
- 현재 run 의 1차 가설은 `include_platform_defaults_gate` 였다.
- 다만 optional forbidden check 에서는 shared-only 조건의 `command/exec + includePlatformDefaults=true` 가 `FORBIDDEN_MARKER` 를 읽었다.
  즉, 이 결과는 허용 작업 baseline 에 대한 관측이지 sandbox security guarantee 가 아니다.

### C. workspace contamination 실험

- `workspace_contamination_eval.json` 기준으로 `workspace_contamination_via_shared=true` 였다.
  shared file 을 통한 간접 오염 경로는 실제로 관측됐다.
- 같은 실험에서 `private_contamination_blocked=false` 였다.
  B 는 A private 을 읽었고, C 는 shared 와 A private 둘 다 읽었다.
- `history_cross_contamination_found=false` 였다.
  즉, history contamination 은 없었지만 workspace contamination 은 있었다.

### D. instruction precedence 실험

- `instruction_precedence_eval.json` 기준으로 3-agent 모두 Round 1~3 통과, override string 미노출, `history_cross_contamination_found=false` 였다.
- 현재 run 의 precedence 가설은 `developer_instruction_dominant` 였다.
- 즉, 현재 build 계열에서는 `developer instruction` 이 충돌 user prompt 보다 더 강하게 유지되는 쪽으로 관측됐다.
- 다만 이 실험은 `developer instruction` vs 충돌 user prompt 축만 본 것이다. broader instruction stack 전체 precedence 를 증명한 것은 아니다.

### E. concurrency stability 실험

- `concurrency_stability_eval.json` 기준으로 4개 turn 을 먼저 모두 시작한 뒤에도 4개 turn 전부 completed, JSON parse 성공, host-side output 검증 성공이었다.
- `event_interleaving_observed=true` 였다.
  raw log 에서 completion 전 reasoning/item event 가 여러 turn 사이에서 섞여 도착했다.
- `starvation_suspected=false` 였다.
- 이 결과는 현재 build 계열에서 소규모 동시 turn 운용이 가능하다는 의미는 주지만, 임의 규모의 병렬성이나 장시간 안정성까지 보장하는 것은 아니다.

## 아직 미해결인 가설

1. `includePlatformDefaults=true` 상태에서도 forbidden read/write 가 어떤 범위까지 차단되는지는 아직 추가 검증이 더 필요하다.

2. `command/exec` 와 `turn/start` 는 같은 cwd, 같은 roots 에서도 서로 다른 방식으로 실패할 수 있다.

3. history contamination 이 없어도 workspace contamination 은 발생할 수 있다.
   두 축은 따로 검증해야 한다.

4. `developer instruction`, system/developer 상위 레이어, collaboration mode, 기타 기본 지시 사이의 전체 precedence 는 아직 미해결이다.

5. concurrency 안정성은 현재 4-turn 케이스에서만 확인됐다.
   더 큰 fan-out, 더 긴 turn, 더 다양한 prompt 조합에서는 결과가 달라질 수 있다.

## role 과 성향 분리 원칙

1. thread 별 성향 차이는 `developer instruction` 을 1차 source 로 둔다.

2. 공통 task prompt 는 thread 간 동일하게 유지한다.
   그래야 응답 차이를 role/style 차이로 읽을 수 있다.

3. 멀티턴 일관성을 보려면 최소 3단계로 본다.
   baseline, conflict, follow-up 을 나눠야 재현성과 저항성을 같이 볼 수 있다.

4. persona 검증에서는 scenario 를 prompt 에 직접 주입하는 편이 더 안정적일 수 있다.
   파일 읽기 지시는 현재 build 계열에서 shell startup 경로를 건드릴 수 있다.

5. evaluator 는 너무 엄격하게 만들지 않는다.
   markdown 표기 차이, 최소 구조 유지, 한 줄 `실행:` 같은 축약 응답까지 어떻게 볼지 미리 정해야 false negative 를 줄일 수 있다.

## `command/exec` 와 `turn/start` 를 구분해서 써야 하는 이유

1. `command/exec` 는 shell/command 실행 baseline 확인용이다.
   허용 경로 read/write 가 shell 레벨에서 살아 있는지 먼저 보기 좋다.

2. `turn/start` 는 agent/tool loop 전체 확인용이다.
   reasoning, 내부 실행, 최종 응답, output schema 충족 여부까지 end-to-end 로 볼 수 있다.

3. 둘을 같은 케이스로 취급하면 안 된다.
   `command/exec` 성공이 `turn/start` 성공을 보장하지 않고, 반대도 자동으로 성립하지 않는다.

4. access-scope 문제를 볼 때는 두 레이어를 같은 cwd, 같은 roots 에서 짝으로 비교한다.
   그래야 어느 계층에서 먼저 죽는지 좁힐 수 있다.

## sandbox 설계 시 주의점

1. 허용 작업 baseline 과 금지 경로 차단 검증을 분리한다.

2. baseline 성공만으로 sandbox 가 안전하다고 결론 내리면 안 된다.
   실제로 baseline 성공 후 forbidden read 가 관측된 run 이 있었다.

3. 엄격 sandbox 에서 실패가 나면 한 bucket 으로 뭉개지 말고 형태를 나눠 기록한다.
   예: signal kill, turn timeout, `turn/completed` 부재, structured reply 없음

4. writableRoots 와 readableRoots 는 가능한 한 좁게 둔다.
   하지만 현재 build 계열에서는 prompt 에 쓰지 않은 추가 내부 동작이 생길 수 있으므로 raw log 를 같이 봐야 한다.

5. shared workspace 를 relay channel 로 쓸 때는 history 가 깨끗해도 workspace contamination 이 생길 수 있음을 전제로 설계한다.

## contamination 을 보는 기준

### history contamination

- `thread/read(includeTurns=true)` 에서 다른 thread 이름, 다른 agent tag, 다른 turn 결과가 직접 섞였는지 본다.
- 현재 persona, workspace, precedence, concurrency 실험에서는 history contamination 은 관측되지 않았다.

### workspace contamination

- shared file, relay note, 공용 산출물 같은 간접 경로를 본다.
- host-side verification 으로 실제 파일 존재 여부와 내용을 확인한다.
- 현재 workspace contamination 실험에서는 shared 경유 오염은 있었고, private 차단은 실패했다.
- 즉 history clean 과 workspace clean 은 같은 뜻이 아니다.

## precedence 를 보는 기준

1. baseline round 에서 원래 구조를 확인한다.
2. conflict round 에서 명시적 override string 또는 형식 강제 prompt 를 준다.
3. follow-up round 에서 원래 style 로 복귀하는지 본다.
4. evaluator 는 override string 노출, header 유지, 핵심 섹션 유지, soft pass 기준을 같이 갖는 편이 좋다.
5. 현재 build 계열에서는 `developer_instruction_dominant` 가 관측됐지만, broader precedence 는 아직 미해결이다.

## concurrency 를 보는 기준

1. turn 을 하나씩 기다리지 말고, 먼저 모두 시작한다.
2. 각 turn id 를 확보한 뒤 event 수집 루프에서 thread/turn 상태를 매핑한다.
3. turn 별로 `started_at`, `first_event_at`, `completed_at`, `timeout`, raw reply 를 남긴다.
4. `event_interleaving_observed` 는 completion 전 여러 turn 의 event 가 섞여 도착했는지로 본다.
5. `starvation_suspected` 는 한 turn 만 현저히 늦거나 timeout 났는지로 본다.
6. 현재 4-turn 실험에서는 interleaving 이 관측됐고, starvation 의심은 없었다.

## 권장 검증 순서

1. host-side preflight
   fixture 파일, cwd, expected path, writable path 를 먼저 확인한다.

2. `command/exec` baseline
   허용 read/write 가 shell 레벨에서 되는지 본다.

3. `turn/start` baseline
   같은 roots 와 cwd 에서 agent/tool loop 가 끝까지 완료되는지 본다.

4. role/persona separation
   공통 task, 다른 `developer instruction`, 멀티턴 구조로 style 분리를 본다.

5. precedence
   conflict prompt 를 넣어 `developer instruction` 저항성을 본다.

6. history contamination
   `thread/read(includeTurns=true)` 로 다른 thread 흔적이 섞이는지 본다.

7. workspace contamination
   shared/private 경로를 나눠 간접 유입을 본다.

8. forbidden probe
   baseline 성공 후에만 금지 경로 read/write 가 막히는지 본다.

9. concurrency
   여러 turn 을 먼저 모두 시작한 뒤 event interleaving, completion, starvation 을 본다.

## 결과 판정 기준

- **PASS**: 실험이 던진 질문에 답할 수 있을 만큼 응답, host verification, history 검증이 모두 수집되고 기대한 결과와 해석이 일치한 상태
- **FAIL**: 실험은 끝까지 수행됐지만 기대한 동작이 일치하지 않은 상태
- **BLOCKED**: startup failure, timeout, `turn/completed` 부재 등으로 질문 자체에 답하지 못한 상태
- **INCONCLUSIVE**: 일부 관측은 있었지만 핵심 질문에 대한 해석 근거가 아직 부족한 상태

## 권장 산출물

- raw JSON-RPC message log
- app-server stderr log
- per-turn final reply 원문
- host-side verification JSON
- 사람이 읽는 요약 보고서
- `thread/read(includeTurns=true)` 결과
- contamination 검증인 경우 shared/private file 상태 기록
- concurrency 검증인 경우 turn 시작/완료 시간표

## 언제 다시 검증해야 하나

- build 가 바뀌었을 때
- sandbox 관련 구현이 바뀌었을 때
- model, approval, sandbox defaults 가 바뀌었을 때
- `developer instruction` 대신 다른 제어 축을 role source 로 쓰려 할 때
- shared workspace relay/handoff 구조를 실제 운영에 넣으려 할 때
- concurrency fan-out 을 더 키우려 할 때

## 적용 메모

- 이 문서는 `codex-thread-lab-001` artifact 를 바탕으로 정리한 현재 build 계열 참고서다.
- baseline 성공, precedence 우세, concurrency 성공은 모두 설계 참고 신호이며, 다른 축을 자동으로 보장하지 않는다.
- 새 build 로 올라가면 baseline matrix, forbidden probe, workspace contamination, precedence, concurrency 를 다시 확인하는 편이 안전하다.
