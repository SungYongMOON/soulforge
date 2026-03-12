# .agent/memory/decisions

## 목적

- `decisions/` 는 확정된 판단과 합의를 장기 기억으로 남긴다.

## 포함 대상

- durable decision summary
- rationale snapshot

## 제외 대상

- 미확정 논의
- raw transcript
- session-only blocker

## 대표 파일

- [`../README.md`](../README.md): memory 상위 owner 경계

## 참조 관계

- `protocols/decision_contract.yaml` 의 결과는 이 영역으로 승격될 수 있다.

## 변경 원칙

- 합의가 끝난 결정만 올리고 진행 중 판단은 `sessions/` 에 남긴다.
