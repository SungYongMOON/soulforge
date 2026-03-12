# .agent/memory/self

## 목적

- `self/` 는 이 body 자신의 안정적 기억을 둔다.

## 포함 대상

- durable self facts
- long-lived identity notes

## 제외 대상

- active session 상태
- project facts
- shared memory

## 대표 파일

- [`../README.md`](../README.md): memory 상위 owner 경계

## 참조 관계

- `self/` 는 `identity/` 를 보조하지만 identity 정본을 대체하지 않는다.

## 변경 원칙

- 본체 durable fact 만 유지하고 임시 persona 나 session 메모는 넣지 않는다.
