# .agent/artifacts

## 목적

- `artifacts/` 는 본체 소유 산출물을 둔다.
- mission site 원본 결과물과 구분되는 body 측 파생 산출물을 관리한다.

## 범위

- body owner 산출물과 그 보관 메타만 다룬다.
- 현장 원본 결과물, shared deliverable hub, top-level export organ 은 범위 밖이다.

## 포함 대상

- 본체가 생성한 공용 산출물
- 본체 산출물 메타와 보관 구조
- body 문서나 continuity 를 보조하는 파생 결과물

## 제외 대상

- 프로젝트별 결과물 원본
- class 문서와 class 지식 팩
- 독립 `export/` 기관

## 미래 확장 방향

- 전달 포맷이 늘어나도 body 핵심 기관으로서 `export/` 를 따로 만들지 않는다.
- mission deliverable 공유가 필요하면 owner 를 `_workspaces/` 또는 `_teams/shared/` 로 둔다.
- artifacts 분류 체계는 후속 계약으로 세분화한다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`_workspaces/README.md`](../../_workspaces/README.md)

## 상태

- Draft
- 산출물 분류 체계는 추후 정의한다.
