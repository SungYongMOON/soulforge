# developer instruction 구성 팁

## 목적

- thread 별 고정 `developer instruction` 으로 에이전트 성향을 분리할 때, 실제 실험에서 확인된 운영 팁만 남긴다.
- 실험 폴더를 정리하더라도 이후 agent 구성 시 바로 참고할 수 있게 한다.

## 실험 기준

- 단일 long-lived app-server 1개
- `thread/start` 로 4개 thread 생성
- 모든 thread 에 같은 model, 같은 cwd, 같은 sandbox policy 적용
- 차이는 thread 별 `developer instruction` 만 둠
- 공통 scenario 에 대해 Round 1, 충돌 prompt 인 Round 2, follow-up 인 Round 3 수행

## 실제로 확인된 것

1. 성향 분리의 authoritative source 는 `developer instruction` 이었다.
   `personality enum` 은 보조 신호로 보일 수 있었지만, 이번 실험에서 성향 차이를 안정적으로 만든 것은 thread 별 고정 `developer instruction` 이었다.
2. 같은 user prompt 여도 thread 별 고정 구조는 대부분 유지됐다.
   전략가형은 계획과 위험, 실행가형은 `실행:`, 검토자형은 `실패모드:` 와 `검증:`, 탐색가형은 `대안 1/2/3` 과 `추천:` 구조를 반복해서 유지했다.
3. 충돌 user prompt 가 있어도 developer instruction 이 쉽게 무너지지 않았다.
   Round 2 에서 "한 줄 결론만 말하라"는 지시를 줘도 대부분은 자기 헤더와 핵심 섹션 성향을 일부 유지했다.
4. 멀티턴에서도 thread 별 스타일 일관성이 유지됐다.
   Round 3 follow-up 에서도 Round 1 과 같은 구조적 성향이 이어졌다.
5. thread history 기준 cross-contamination 은 없었다.
   성공 run 에서는 각 thread history 안에 자기 tag 만 유지됐고, 다른 agent tag 혼입은 관측되지 않았다.

## 이번 build 에서 보인 주의점

1. persona 분리 검증과 파일 읽기 검증은 분리하는 편이 안전했다.
   이번 build 에서는 `shared/persona_scenario.md` 를 읽으라는 지시가 turn 내부 shell startup 실패로 이어져 실험을 막았다.
2. `FAIL` 과 `BLOCKED` 는 분리해서 기록해야 한다.
   응답 미완료나 `turn/completed` 부재는 성향 실패가 아니라 실행 경로 문제일 수 있다.
3. evaluator 를 너무 빡빡하게 만들면 false negative 가 나온다.
   실제 run 에서는 AGENT-2 Round 2 가 builder 성향을 유지했지만, `실행:` 한 줄만으로는 추가 실행 구조가 부족하다는 규칙 때문에 실패 처리됐다.

## agent 구성 시 바로 쓰는 팁

1. 성향을 분리하고 싶으면 model 이 아니라 `developer instruction` 에서 헤더, 우선순위, 필수 섹션을 고정한다.
2. 실험 변수는 하나만 바꾼다.
   model, cwd, sandbox policy 를 고정하고 `developer instruction` 만 바꿔야 차이를 해석하기 쉽다.
3. 공통 task 는 모든 thread 에 동일하게 준다.
   그래야 응답 차이를 thread 별 고정 instruction 차이로 읽을 수 있다.
4. 저항성 검증용 충돌 prompt 를 별도 round 로 넣는다.
   baseline 만 보면 성향 유지력보다 단순 형식 재현만 확인하게 된다.
5. history 검증을 함께 남긴다.
   per-round 원문뿐 아니라 `thread/read(includeTurns=true)` 결과까지 저장해야 contamination 여부를 확인할 수 있다.
6. persona 실험에서는 외부 파일 읽기 의존을 최소화한다.
   공통 scenario 는 가능하면 prompt 에 직접 주입하고, 파일 I/O 검증은 별도 실험으로 분리한다.

## 적용 메모

- 이 문서는 `dev/experiments/tests/codex-thread-lab-001` 의 multi-persona 검증 결과를 요약한 것이다.
- 수치나 build 특이사항은 바뀔 수 있으므로, 다음 실험에서도 `blocked` 여부와 evaluator 오판 가능성을 먼저 확인한다.
