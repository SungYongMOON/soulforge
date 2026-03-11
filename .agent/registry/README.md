# .agent/registry

## 목적

- `registry/` 는 본체의 등록 정보와 색인 정보를 둔다.
- private operating system 내부 자산을 찾고 연결하기 위한 참조 계층을 분리한다.

## 범위

- body owner 자산의 인덱스와 참조 테이블만 다룬다.
- class module catalog 나 mission binding 원본은 범위 밖이다.

## 포함 대상

- 본체 자산 색인
- 등록 메타와 참조 테이블
- body 내부 기관 간 연결용 registry 정보

## 제외 대상

- class 모듈 설치 목록
- 프로젝트별 바인딩 정보
- shared team registry

## 미래 확장 방향

- registry 스키마가 늘어나도 source of truth 는 body owner 자산에만 둔다.
- class/workspace/shared registry 가 필요하면 각 owner 아래에서 별도 정의한다.
- cross-owner lookup 은 contract 로만 연결하고 저장소는 섞지 않는다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent_class/class.yaml`](../../.agent_class/class.yaml)

## 상태

- Draft
- 등록 모델의 세부 스키마는 추후 정의한다.
