# developer instruction 구성 팁

## 목적

- thread 별 고정 `developer instruction` 으로 role/style 을 분리할 때, 실험 artifact 로 확인된 운영 팁만 남긴다.
- 이 문서는 실험 결과를 운영 팁으로 정리한 문서이며, 보장 문서나 proof 문서는 아니다.

## 비주장 / non-claims

- 이 문서는 native autonomous multi-agent orchestration 보장 문서가 아니다.
- 이 문서는 sandbox security proof 문서가 아니다.
- 이 문서는 현재 build 계열과 현재 harness 에서 관측된 결과를 바탕으로 한 참고 문서다.

## artifact 기준

- 기준 실험: `dev/experiments/tests/codex-thread-lab-001`
- 직접 반영한 결과 파일:
  - `artifacts/persona_eval.json`
  - `artifacts/PERSONA_EXPERIMENT_REPORT.md`
  - `artifacts/instruction_precedence_eval.json`
  - `artifacts/INSTRUCTION_PRECEDENCE_REPORT.md`

## 확정적으로 쓰는 운영 팁

1. role/style 분리의 1차 source 는 `developer instruction` 으로 둔다.
   현재 관측에서는 model 차이가 아니라 thread 별 고정 `developer instruction` 이 성향 차이를 가장 안정적으로 만들었다.

2. 공통 task prompt 는 thread 간 동일하게 유지한다.
   그래야 응답 차이를 role/style 차이로 해석하기 쉽다.

3. role/style baseline, 충돌 prompt, follow-up 을 분리한 멀티턴 구조가 유용하다.
   baseline 만 보면 형식 재현만 보게 되고, 충돌 round 와 follow-up round 가 있어야 저항성과 복귀 여부를 같이 볼 수 있다.

4. `thread/read(includeTurns=true)` 를 같이 저장한다.
   최종 응답만으로는 history contamination 여부를 충분히 판정하기 어렵다.

5. persona 검증과 파일 접근 검증은 분리한다.
   persona report 는 재시도에서 scenario 파일 읽기 지시를 제거하고 prompt 본문 직접 주입 방식으로 바꿨다고 기록한다. style 검증 중 파일 접근 문제가 섞이면 원인분리가 어려워진다.

6. evaluator 는 관측값을 설명하는 도구이지, 결과 자체가 아니다.
   구조 규칙이 너무 엄격하면 실제 성향 유지가 있었는데도 false negative 가 날 수 있다.

## 현재 build 계열에서 관측된 것

1. persona 실험에서는 thread 별 성향 분리가 유지됐다.
   `persona_eval.json` 기준으로 AGENT-1, 3, 4 는 전 round 통과했고, AGENT-2 는 Round 2 한 항목만 실패했다.

2. persona 실험의 history contamination 은 관측되지 않았다.
   `persona_eval.json` 의 `cross_contamination_found` 는 `false` 였다.

3. persona 실험에는 strict evaluator false negative 가능성이 실제로 있었다.
   `PERSONA_EXPERIMENT_REPORT.md` 와 `persona_eval.json` 에서 AGENT-2 Round 2 는 `missing_builder_structure` 로 실패했지만, 실제 응답은 `AGENT-2 / BUILDER` 와 `실행:` 구조를 유지하고 있었다.

4. precedence 실험에서는 현재 build 기준 `developer instruction` 이 충돌 user prompt 보다 우세했다.
   `instruction_precedence_eval.json` 기준으로 세 agent 모두 Round 1~3 통과, override string 미노출, `root_precedence_hypothesis=developer_instruction_dominant` 였다.

5. precedence 실험은 `developer instruction` vs 충돌 user prompt 축에서는 우세를 보였지만, 모든 상위/병렬 지시 계층 precedence 를 증명한 것은 아니다.
   이 축은 별도 precedence 실험이 더 필요하다.

## 아직 미해결인 가설

1. `developer instruction`, system/developer 상위 레이어, collaboration mode, 기타 기본 지시 사이의 전체 precedence 는 아직 미해결이다.

2. build 가 바뀌면 같은 충돌 prompt 에 대한 저항성도 달라질 수 있다.

3. evaluator 가 markdown 변형, 섹션 표기 변형, 최소 구조 유지 여부를 얼마나 유연하게 봐야 하는지는 아직 조정 여지가 있다.

## agent 구성 시 바로 쓰는 팁

1. role/style 을 분리하고 싶으면 `developer instruction` 에 header, 우선순위, 필수 섹션을 고정한다.

2. role/style 실험에서는 model, cwd, sandbox policy 를 먼저 고정하고 `developer instruction` 만 바꾼다.

3. conflict round 는 명시적으로 만든다.
   단순 baseline 만으로는 user override 저항성을 보기 어렵다.

4. persona 실험에서는 scenario 를 prompt 에 직접 넣는 편이 더 안정적일 수 있다.
   파일 읽기 지시는 현재 build 계열에서 turn 내부 shell 경로를 건드릴 수 있다.

5. `PASS`, `FAIL`, `BLOCKED` 를 분리해서 기록한다.
   응답 미완료나 timeout 은 role/style failure 가 아니라 실행 계층 문제일 수 있다.

## 적용 메모

- 이 문서는 `codex-thread-lab-001` 의 persona/precedence 실험 결과를 정리한 운영 팁 문서다.
- 같은 구조를 새 build 에 옮길 때는 persona baseline, conflict round, history check 를 다시 돌리는 편이 안전하다.
