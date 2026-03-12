# .agent/memory/handoffs

## 목적

- `handoffs/` 는 미래 multi-agent 전달문 예약 구조를 둔다.

## 포함 대상

- durable handoff memory
- forwardable summary

## 제외 대상

- 현재 세션의 active checkpoint
- raw transcript
- team shared board

## 대표 파일

- [`../README.md`](../README.md): memory 상위 owner 경계

## 참조 관계

- `sessions/` 의 현재성 있는 continuity 가 장기 보존 가치가 생기면 이 영역으로 승격된다.

## 변경 원칙

- 현재성 있는 체크포인트를 바로 복제하지 않고 장기 보존이 필요한 handoff 만 남긴다.
