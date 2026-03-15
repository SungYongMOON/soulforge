# docs/architecture/foundation

## 목적

- `foundation/` 은 저장소 전체의 기준선이 되는 root-owned 구조 문서를 모은다.
- 구조 목적, 목표 트리, 소유 기준, 세계관처럼 다른 문서가 자주 참조하는 활성 anchor 문서를 여기서 관리한다.

## 포함 대상

- `REPOSITORY_PURPOSE.md`
- `TARGET_TREE.md`
- `DOCUMENT_OWNERSHIP.md`
- `AGENT_WORLD_MODEL.md`

## archive 로 분리한 문서

- [`../archive/foundation/MIGRATION_REFERENCE.md`](../archive/foundation/MIGRATION_REFERENCE.md)
- [`../archive/foundation/agent_body_finalization_report.md`](../archive/foundation/agent_body_finalization_report.md)

## 관련 경로

- [`../README.md`](../README.md)
- [`REPOSITORY_PURPOSE.md`](REPOSITORY_PURPOSE.md)
- [`TARGET_TREE.md`](TARGET_TREE.md)
- [`DOCUMENT_OWNERSHIP.md`](DOCUMENT_OWNERSHIP.md)

## 상태

- Stable
- 저장소 전체 기준선과 장기 참조 문서를 묶는다.
- active semantics 는 `AGENT_WORLD_MODEL.md` 에 통합하고, 보고서/이행 참고는 archive 로 분리한다.
