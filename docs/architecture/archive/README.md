# docs/architecture/archive

## 목적

- `archive/` 는 root-owned architecture 문서 중 현재 활성 정본에서 내려온 배경 문서를 보관한다.
- 이 폴더의 문서는 결정 배경, 이행 참고, 과거 보고 맥락을 남기지만 현재 운영 계약의 우선 정본은 아니다.

## 사용 규칙

- 현재 구조/운영/manual 기준은 먼저 `foundation/`, `workspace/`, `ui/`, `lifecycle/` 에서 찾는다.
- archive 문서는 "왜 이렇게 되었는가"를 확인할 때만 참고한다.
- archive 문서가 활성 문서와 충돌하면 활성 문서를 우선한다.

## 관련 경로

- [`../README.md`](../README.md)
- [`foundation/README.md`](foundation/README.md)

## 상태

- Stable
- 보관 문서는 남기되 활성 기준선과 분리한다.
