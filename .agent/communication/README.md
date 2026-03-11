# .agent/communication

## 목적

- `communication/` 는 본체의 외부 상호작용 규칙을 둔다.
- tone, reply shape, channel semantics 같은 본체 공통 커뮤니케이션 경계를 관리한다.

## 범위

- 상호작용 방식과 채널별 전달 규범만 다룬다.
- 실행 절차는 `protocols/`, universal floor 는 `policy/`, 실제 연결 구현은 tool 계층이 맡는다.

## 포함 대상

- 커뮤니케이션 규칙
- 채널별 상호작용 메타와 공통 정책 참조
- 본체 기본 응답 형식과 전달 규범

## 제외 대상

- 개별 도구 연결 구현
- 프로젝트별 커뮤니케이션 산출물
- team shared 커뮤니케이션 운영 규정

## 미래 확장 방향

- 채널별 세부 규약이 늘어나면 `protocols/` 와 교차 참조를 명시한다.
- 협업용 공유 커뮤니케이션 표준은 `_teams/shared/` 에서 별도 owner 를 가진다.
- 본체 공통 규범은 계속 `.agent` 안에 남긴다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent/policy/README.md`](../policy/README.md)
- [`.agent/protocols/README.md`](../protocols/README.md)

## 상태

- Draft
- 채널별 세부 규약은 추후 정의한다.
