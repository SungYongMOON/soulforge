# runtime 모델

## 목적

- `runtime/` 의 책임과 경계를 정의한다.

## 범위

- bootstrap order, context assembly, tool scope, sandbox profile, delivery profile 을 다룬다.

## 포함 대상

- 기관 조립 순서
- declared runtime profile
- tool/sandbox 경계

## 제외 대상

- actual runtime telemetry
- daemon implementation
- workflow implementation

## 미래 확장 방향

- runtime contract 가 커지면 이 문서 아래로 phase 와 assembly rule 을 세분화한다.
