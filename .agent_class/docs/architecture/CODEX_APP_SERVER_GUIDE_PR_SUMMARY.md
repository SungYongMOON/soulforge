# Codex App Server 가이드 문서 정리 PR 요약

## 요약

이번 PR은 Codex App Server 자체를 제품 기능으로 확정하려는 변경이 아니라,  
thread 기반 agent-like 설계와 실험 인프라에서 얻은 운영 팁을 문서로 정리하는 변경이다.

핵심은 두 가지다.

1. Codex App Server 관련 실험에서 확인된 운영 팁을 `.agent_class` 문서로 승격
2. 이후 설계/실험에서 바로 참고할 수 있도록 thread, contamination, precedence, concurrency 기준을 정리

이 문서는 PR 설명 초안 성격의 정리이며, 실제 변경 중 특히 문서 반영 의도를 중심으로 작성했다.

## 포함 변경

### 1) developer instruction 운영 팁 정리

- `DEVELOPER_INSTRUCTION_TIPS.md`
- thread 별 `developer instruction` 을 role/style 분리의 1차 source 로 두는 기준 정리
- persona 실험에서 관측된 false negative 주의점과 evaluator 해석 기준 정리
- persona 검증과 파일 접근 검증을 분리해야 한다는 운영 팁 정리

### 2) Codex App Server 설계 참고서 정리

- `CODEX_APP_SERVER_MULTI_AGENT_GUIDE.md`
- thread 기반 agent-like 설계 참고서 정리
- 아래 항목을 현재 build 계열 기준으로 구조화
  - baseline
  - forbidden probe
  - history contamination
  - workspace contamination
  - precedence
  - concurrency
- `non-claims` 섹션을 포함해, 이 문서가 security proof 또는 native multi-agent 보장 문서가 아님을 명시
- workflow 가 Codex App Server worker 를 오케스트레이션할 때 가져야 할 책임도 함께 정리

### 3) architecture README 연결

- `.agent_class/docs/architecture/README.md`
- 가이드 문서와 팁 문서를 architecture 정본 문맥에 연결

## 이번 PR의 성격

이 PR은 **실험을 통해 얻은 참고 기준 정리**가 목적이다.

즉, 아래를 직접 보장하는 PR은 아니다.

- Codex App Server 가 native autonomous multi-agent runtime 이라는 보장
- sandbox 경계의 보안적 완전성 보장
- 특정 build 에서 관측된 결과를 모든 환경으로 일반화하는 것

이번 문서는 현재 build 계열과 현재 harness 기준에서, 다음 설계/실험 때 오판을 줄이기 위한 참고서로 보는 것이 맞다.

## 문서에 반영한 현재 관측

- `developer instruction` 이 role/style 분리의 가장 안정적인 source 로 관측됨
- 현재 build 계열에서는 `developer instruction` 이 충돌 user prompt 보다 더 강하게 남는 precedence 가 관측됨
- `includePlatformDefaults=true` 에서 허용 read/write baseline 이 살아난 run 이 있었음
- baseline 성공과 sandbox 경계 보장은 같은 뜻이 아님
- 실제로 shared-only baseline success 이후 forbidden read 가 관측된 run 도 있었음
- history contamination 이 없어도 workspace contamination 은 발생할 수 있음
- 소규모 동시 turn 에서 completion/interleaving 은 관측됐지만, 더 큰 fan-out 안정성은 별도 검증이 필요함
- persona 실험에서는 evaluator strictness 때문에 false negative 가능성이 실제로 관측됨

## 의도적으로 하지 않은 것

- 실험 harness 자체를 제품 구현으로 승격하지 않음
- log/plan 성격의 로컬 미추적 문서는 이번 PR에 포함하지 않음
- sandbox correctness 를 확정 문장으로 쓰지 않음

## 기대 효과

- 다른 스레드나 다음 build 에서 Codex App Server 실험을 다시 시작할 때 기준점이 생김
- role/style 분리, contamination 구분, precedence, concurrency 를 같은 용어 체계로 다룰 수 있음
- workflow 가 Codex App Server worker 를 붙여 오케스트레이션할 때 어떤 책임을 가져야 하는지 참고 기준이 생김
- 무엇을 먼저 검증하고, 어디서 오판하기 쉬운지를 문서 기준으로 재사용 가능해짐
