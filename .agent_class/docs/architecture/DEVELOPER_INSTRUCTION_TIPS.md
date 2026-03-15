# developer instruction 구성 팁

## 목적

- thread 기반 Codex App Server 설계에서 role/style source 를 어떻게 두어야 하는지, artifact 로 확인된 운영 팁만 남긴다.
- 이 문서는 운영 참고 문서이지 보장 문서가 아니다.

## 비주장 / non-claims

- 이 문서는 native autonomous multi-agent orchestration 보장 문서가 아니다.
- 이 문서는 sandbox security proof 문서가 아니다.
- 이 문서는 현재 build 계열과 현재 harness 기준에서 관측된 결과를 정리한 참고 문서다.

## artifact 기준

- 1EA thread 실험:
  - `dev/experiments/tests/codex-thread-lab-001/artifacts/persona_eval.json`
  - `dev/experiments/tests/codex-thread-lab-001/artifacts/PERSONA_EXPERIMENT_REPORT.md`
  - `dev/experiments/tests/codex-thread-lab-001/artifacts/instruction_precedence_eval.json`
  - `dev/experiments/tests/codex-thread-lab-001/artifacts/INSTRUCTION_PRECEDENCE_REPORT.md`
- 2EA multi-instance 실험:
  - `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/MULTI_INSTANCE_DECISION_SUMMARY.json`
  - `dev/experiments/tests/codex-multi-instance-lab-001/artifacts/MULTI_INSTANCE_DECISION_REPORT.md`

## 확정적으로 쓰는 운영 팁

1. role/style 분리의 1차 source 는 `developer instruction` 으로 둔다.
   현재 관측에서는 model 차이보다 thread 별 고정 `developer instruction` 이 성향 차이를 가장 안정적으로 만들었다.

2. process 분리와 role/style 분리는 같은 문제가 아니다.
   2EA 로 process 를 나눠도 role/style source 자체는 여전히 `developer instruction` 중심으로 두는 편이 맞다.

3. 공통 task prompt 는 비교 축이 아닐 때 thread 간 동일하게 유지한다.
   role/style 비교에서는 `developer instruction` 만 바꾸고, task 본문은 동일하게 두는 편이 해석하기 쉽다.

4. persona 검증과 파일 접근 검증은 분리한다.
   1EA persona 실험은 scenario 파일 읽기 지시를 prompt 직접 주입으로 바꿨을 때 더 안정적으로 해석됐다.

5. precedence, contamination, concurrency 는 서로 다른 축으로 분리해서 본다.
   충돌 user prompt 저항성, history contamination, workspace contamination, parallel dispatch 는 한 번에 묶어 읽으면 오판하기 쉽다.

6. `thread/read(includeTurns=true)` 는 항상 같이 남긴다.
   최종 응답만으로는 history contamination 여부를 충분히 판정하기 어렵다.

7. evaluator 는 관측값을 설명하는 도구일 뿐 결과 자체가 아니다.
   persona 실험에서는 strict evaluator false negative 가능성이 실제로 관측됐다.

## 현재 build 계열에서 관측된 것

1. persona 실험에서는 thread 별 성향 분리가 유지됐다.
   `persona_eval.json` 기준으로 AGENT-1, 3, 4 는 전 round 통과했고, AGENT-2 는 Round 2 한 항목만 실패했다.

2. persona 실험의 history contamination 은 관측되지 않았다.
   `cross_contamination_found=false` 였다.

3. persona 실험에는 strict evaluator false negative 가능성이 실제로 있었다.
   AGENT-2 Round 2 는 `missing_builder_structure` 로 실패 처리됐지만, 실제 응답은 `AGENT-2 / BUILDER` 와 `실행:` 구조를 유지했다.

4. precedence 실험에서는 현재 build 기준 `developer instruction` 이 충돌 user prompt 보다 우세했다.
   `instruction_precedence_eval.json` 기준 `root_precedence_hypothesis=developer_instruction_dominant` 였다.

5. 2EA multi-instance 결과는 process 분리가 role/style source 를 대체하지 않음을 뒷받침했다.
   process split 은 failure domain, event stream, history/session 해석을 위한 축이고, role/style source 는 여전히 `developer instruction` 이다.

6. 2EA 결과는 process 분리만으로 contamination 이 자동 해결되지 않음을 보여줬다.
   `shared_workspace_contamination_via_shared=true`, `shared_private_contamination_blocked=false` 였다.

## 아직 미해결인 가설

1. `developer instruction`, system/developer 상위 레이어, collaboration mode, 기타 기본 지시 사이의 전체 precedence 는 아직 미해결이다.

2. build 가 바뀌면 같은 충돌 prompt 에 대한 저항성과 structured reply 안정성이 달라질 수 있다.

3. cross-instance 조건에서 precedence 와 concurrency 가 1EA 와 다르게 흔들리는지는 추가 실험이 더 필요하다.

## agent 구성 시 바로 쓰는 팁

1. role/style 을 분리하고 싶으면 `developer instruction` 에 header, 우선순위, 필수 섹션을 고정한다.

2. process split 이 필요하더라도 role/style source 는 별도로 유지한다.
   2EA 는 failure domain 과 event stream 축이고, role/style 축을 대체하지 않는다.

3. shared workspace 를 relay 로 쓰면 process 를 나눠도 contamination 이 남을 수 있다.
   shared relay 설계는 sandbox 경계와 별도 축으로 취급해야 한다.

4. conflict round 는 명시적으로 만든다.
   baseline 만으로는 user override 저항성을 보기 어렵다.

5. `PASS`, `FAIL`, `BLOCKED`, `INCONCLUSIVE` 를 분리해서 기록한다.
   응답 미완료나 timeout 은 role/style failure 가 아니라 실행 계층 문제일 수 있다.
